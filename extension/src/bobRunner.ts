/**
 * bobRunner.ts
 *
 * Responsabilidades de este módulo:
 *   1. Construir el prompt estructurado que se enviará a Bob Shell.
 *   2. Ejecutar `bob run "<prompt>"` usando Node.js child_process.
 *   3. Capturar stdout (que NO es JSON puro: incluye cabeceras de sesión,
 *      pasos de razonamiento, etc.).
 *   4. Extraer el primer objeto JSON válido que cumpla el contrato OnboardingData.
 *   5. Validar el resultado superficialmente (campos obligatorios presentes).
 *   6. Guardar el JSON en bob_sessions/onboarding.json.
 *   7. Devolver el OnboardingData al caller o lanzar un error descriptivo.
 */

import spawn from 'cross-spawn';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { OnboardingData } from './types';

// ─── Constantes ───────────────────────────────────────────────────────────────

/**
 * En Windows, `execFile` necesita el nombre exacto del ejecutable incluyendo la
 * extensión.  `bob` (sin extensión) no es un binario nativo: es un script CMD
 * generado por npm, por lo que el Extension Host lo resuelve como `bob.cmd`.
 * En macOS/Linux, `bob` es directamente el ejecutable y no necesita extensión.
 */
const BOB_CMD = process.platform === 'win32' ? 'bob.cmd' : 'bob';


/**
 * Ruta donde se guardará el JSON generado por Bob.
 * La extensión se compila a out/, por lo que subimos dos niveles
 * para llegar a bob-onboarding/ y luego a bob_sessions/.
 *
 * Estructura en disco:
 *   bob-onboarding/
 *     extension/
 *       out/          ← __dirname cuando se ejecuta la extensión compilada
 *     bob_sessions/
 *       onboarding.json
 */
const SESSIONS_DIR = path.resolve(__dirname, '..', '..', 'bob_sessions');
const OUTPUT_FILE  = path.join(SESSIONS_DIR, 'onboarding.json');

/**
 * Tiempo máximo que esperamos a que Bob Shell termine.
 * El análisis de un repositorio puede tardar varios minutos.
 */
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos

// ─── Prompt ───────────────────────────────────────────────────────────────────

/**
 * Prompt enviado a Bob Shell.
 *
 * IMPORTANTE: El prompt exige explícitamente:
 *   - Solo JSON, sin texto extra, sin markdown, sin fences ```
 *   - El esquema exacto definido en types.ts
 *   - Límite de 20 módulos para mantener el análisis manejable
 *
 * Si el prompt es ambiguo, Bob puede añadir texto antes o después del JSON,
 * por eso la extracción en extractJson() es robusta y no depende de que
 * el stdout sea JSON puro.
 */
const ANALYSIS_PROMPT = `Analyze this software repository and return ONLY a valid JSON object.

STRICT RULES:
- Return ONLY the JSON object. No markdown, no code fences, no explanations before or after.
- Do not wrap the JSON in backticks or any other characters.
- The JSON must be parseable directly by JSON.parse().

Required JSON schema (follow it exactly):
{
  "projectName": "string - name of the project",
  "summary": "string - 3-5 sentences for a new developer joining the team",
  "technologies": ["string - only technologies actually detected in the repo"],
  "modules": [
    {
      "name": "string - short readable name, used as ID in relationships",
      "path": "string - relative path to the module",
      "description": "string - one sentence for a new developer",
      "type": "frontend | backend | database | infrastructure | other"
    }
  ],
  "relationships": [
    {
      "from": "module name matching a name in modules array",
      "to": "module name matching a name in modules array",
      "description": "string - why this dependency exists"
    }
  ]
}

CONSTRAINTS:
- Maximum 20 modules. Include only architecturally important high-level modules.
- Do not create a module for every single file.
- Only include relationships that are architecturally relevant.
- Technologies must be actually present in package.json, Dockerfile, or source files.
- Module names in relationships must exactly match names in the modules array.`;

// ─── Funciones públicas ───────────────────────────────────────────────────────

/**
 * Punto de entrada principal.
 *
 * Ejecuta Bob Shell, extrae el JSON del stdout, lo valida, lo guarda en disco
 * y lo devuelve. Lanza un Error con mensaje descriptivo si algo falla.
 *
 * @param workspacePath  Directorio del workspace (donde se lanza `bob run`).
 *                       Bob Shell solo puede leer/escribir dentro de este directorio.
 */
export async function runBobAnalysis(workspacePath: string): Promise<OnboardingData> {
  // 1. Ejecutar Bob Shell y capturar stdout
  const stdout = await executeBobShell(workspacePath);

  // 2. Extraer el JSON del stdout.
  //    stdout NO es JSON puro: Bob Shell incluye cabeceras de sesión, pasos de
  //    razonamiento ("User", "Tool", "Assistant", "Task Summary") y posiblemente
  //    texto antes y después del JSON. Por eso buscamos el primer objeto JSON
  //    válido que contenga los campos obligatorios de OnboardingData.
  const data = extractOnboardingJson(stdout);

  // 3. Validar que el objeto tiene los campos mínimos requeridos
  validateOnboardingData(data);

  // 4. Guardar en disco para que el comando "Abrir panel" pueda reutilizarlo
  saveToFile(data);

  return data;
}

/**
 * Lee onboarding.json del disco si existe y es válido.
 * Devuelve null si el archivo no existe, no es JSON o no pasa la validación.
 *
 * Usado por el comando "Abrir panel" para cargar el último análisis guardado
 * en lugar de volver a ejecutar Bob Shell.
 */
export function loadSavedAnalysis(): OnboardingData | null {
  try {
    if (!fs.existsSync(OUTPUT_FILE)) {
      return null;
    }

    const raw = fs.readFileSync(OUTPUT_FILE, 'utf-8');
    const data = JSON.parse(raw) as unknown;
    validateOnboardingData(data);
    return data as OnboardingData;
  } catch {
    // Si el archivo existe pero está corrupto, lo ignoramos silenciosamente
    // y el caller usará sampleData como fallback.
    return null;
  }
}

// ─── Funciones privadas ───────────────────────────────────────────────────────

/**
 * Ejecuta Bob Shell como proceso hijo y devuelve el stdout completo.
 *
 * Estrategia para el prompt:
 *   El prompt multilínea (ANALYSIS_PROMPT) se pasa a Bob Shell a través de
 *   stdin (pipe), que es el método recomendado por la documentación de Bob Shell
 *   para prompts de múltiples líneas:
 *     cat prompt.txt | bob
 *   Esto evita los problemas de parseo de argumentos en Windows y garantiza
 *   que Bob recibe el prompt completo, incluidas las instrucciones estrictas
 *   y el esquema JSON.
 *
 *   Además se usa --hide-intermediary-output para que stdout contenga solo la
 *   respuesta final del asistente, sin cabeceras de sesión ni pasos intermedios,
 *   lo que hace la extracción del JSON mucho más fiable.
 *
 * Por qué capturamos stderr pero no lo usamos como error:
 *   Bob Shell escribe información de progreso en stderr. No es un error de
 *   ejecución; el error real es un código de salida ≠ 0 o stdout vacío.
 */
function executeBobShell(cwd: string): Promise<string> {
  // Resolve the API key: VS Code setting → BOB_API_KEY env → BOBSHELL_API_KEY env.
  const settingKey: string =
    vscode.workspace.getConfiguration('bobOnboarding').get<string>('apiKey', '').trim();
  const apiKey =
    settingKey ||
    process.env['BOB_API_KEY'] ||
    process.env['BOBSHELL_API_KEY'] ||
    '';

  if (!apiKey) {
    return Promise.reject(new Error(
      'Bob API key not found.\n' +
      'Provide it via one of:\n' +
      '  1. VS Code setting "bobOnboarding.apiKey"\n' +
      '  2. Environment variable BOB_API_KEY\n' +
      '  3. Environment variable BOBSHELL_API_KEY'
    ));
  }

  // Build the child-process environment: inherit everything from the parent
  // and explicitly set both key names so Bob CLI is satisfied regardless of
  // which name it looks for.
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    BOB_API_KEY: apiKey,
    BOBSHELL_API_KEY: apiKey,
  };

  return new Promise((resolve, reject) => {
    console.log(`[BobOnboarding] Ejecutando en cwd: ${cwd}`);
    // Pass the prompt via stdin (recommended pattern for multi-line prompts).
    // --hide-intermediary-output ensures stdout contains only the final
    // assistant response, without session headers or tool-call logs.
    const child = spawn(
      BOB_CMD,
      ['--hide-intermediary-output'],
      { cwd, env: childEnv, stdio: ['pipe', 'pipe', 'pipe'] }
    );

    // Write the full prompt to stdin and close it so Bob knows input is done.
    child.stdin?.write(ANALYSIS_PROMPT, 'utf-8');
    child.stdin?.end();

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Bob Shell superó el tiempo máximo de espera (5 minutos).'));
    }, TIMEOUT_MS);

    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(
        `No se pudo iniciar Bob Shell: ${err.message}\n\n` +
        `Verifica que:\n` +
        `  1. Bob Shell está instalado y disponible en PATH ('bob --version').\n` +
        `  2. La variable BOBSHELL_API_KEY está configurada en tu entorno.`
      ));
    });

    child.on('close', (code) => {
      clearTimeout(timer);

      if (code !== 0) {
        const detail = stderr.trim() || `El proceso terminó con código ${code} sin mensaje de error.`;
        reject(new Error(
          `Bob Shell falló (código ${code}).\n` +
          `Detalle: ${detail}\n\n` +
          `Verifica que:\n` +
          `  1. Bob Shell está instalado y disponible en PATH ('bob --version').\n` +
          `  2. La variable BOBSHELL_API_KEY está configurada en tu entorno.\n` +
          `  3. Tienes conexión a internet.`
        ));
        return;
      }

      if (!stdout || stdout.trim() === '') {
        reject(new Error(
          'Bob Shell no devolvió ningún output.\n' +
          'Intenta ejecutar manualmente: bob -p "Hello" para verificar que funciona.'
        ));
        return;
      }

      resolve(stdout);
    });
  });
}

/**
 * Extrae el primer objeto JSON del stdout de Bob Shell que contenga
 * los campos obligatorios de OnboardingData.
 *
 * Por qué no hacemos JSON.parse(stdout) directamente:
 *   El stdout de `bob run` incluye texto que NO es JSON, por ejemplo:
 *
 *     User
 *     [prompt aquí]
 *     Tool
 *     [pasos de herramientas]
 *     Assistant
 *     { "projectName": ... }   ← esto es lo que queremos
 *     Task Summary
 *     ...
 *
 *   Los encabezados ("User", "Tool", "Assistant", "Task Summary") pueden cambiar
 *   entre versiones de Bob Shell, así que NO los buscamos por nombre.
 *   En su lugar, buscamos el primer '{' que abra un objeto JSON válido y completo.
 *
 * Algoritmo:
 *   1. Encontrar todas las posiciones donde hay un '{' en el stdout.
 *   2. Para cada posición, encontrar la llave de cierre exacta (respetando
 *      anidamiento y comillas) con findMatchingBrace().
 *   3. Parsear solo esa porción exacta del texto.
 *   4. Devolver el primer resultado que pase la validación de OnboardingData.
 *
 * Esto corrige el bug original donde se parseaba desde '{' hasta el FINAL del
 * string, lo que falla si Bob añade texto (resumen de sesión, estadísticas, etc.)
 * después del cierre del objeto JSON.
 */
function extractOnboardingJson(stdout: string): OnboardingData {
  // Normaliza el stdout:
  //   1. Elimina espacios de relleno al final de cada línea (el output de Bob Shell
  //      usa padding de terminal que introduce \n dentro de los string values del JSON,
  //      haciendo que JSON.parse() falle aunque el JSON esté completo).
  //   2. Elimina posibles bloques de código markdown.
  const cleaned = stdout
    .split('\n').map(line => line.trimEnd()).join('\n')
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```\s*/g, '');

  let searchFrom = 0;
  while (searchFrom < cleaned.length) {
    const start = cleaned.indexOf('{', searchFrom);
    if (start === -1) {
      break;
    }

    const end = findMatchingBrace(cleaned, start);
    if (end === -1) {
      // No hay llave de cierre correspondiente a partir de aquí; probamos el siguiente '{'
      searchFrom = start + 1;
      continue;
    }

    const candidate = cleaned.slice(start, end + 1);
    // Elimina los saltos de línea con su padding asociado que el wrapping de
    // terminal de Bob Shell inserta dentro de los valores de string del JSON.
    // Solo se eliminan \n y los espacios que los siguen; los espacios dentro
    // de los valores de texto se conservan porque no van precedidos por \n.
    const normalizedCandidate = candidate.replace(/\r?\n\s*/g, '');
    try {
      const parsed = JSON.parse(normalizedCandidate) as unknown;
      if (looksLikeOnboardingData(parsed)) {
        return parsed as OnboardingData;
      }
    } catch {
      // Este fragmento no es JSON válido; probamos desde el siguiente '{'
    }

    searchFrom = start + 1;
  }

  throw new Error(
    'No se encontró un objeto JSON válido con el esquema OnboardingData en la respuesta de Bob.\n' +
    'Respuesta recibida (primeros 500 caracteres):\n' +
    stdout.slice(0, 500)
  );
}

/**
 * Encuentra el índice de la llave de cierre '}' que corresponde exactamente
 * al '{' de apertura en openIndex, contando profundidad de anidamiento y
 * respetando comillas (para no contar llaves dentro de strings del JSON).
 * Devuelve -1 si no encuentra una llave de cierre correspondiente.
 */
function findMatchingBrace(str: string, openIndex: number): number {
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = openIndex; i < str.length; i++) {
    const ch = str[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (ch === '\\') {
      escapeNext = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

/**
 * Comprobación rápida para saber si un valor podría ser un OnboardingData.
 * Solo verifica que los campos obligatorios existen y tienen el tipo correcto;
 * no valida el contenido de arrays ni los tipos anidados (eso lo hace validateOnboardingData).
 */
function looksLikeOnboardingData(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj['projectName']   === 'string' &&
    typeof obj['summary']       === 'string' &&
    Array.isArray(obj['technologies']) &&
    Array.isArray(obj['modules']) &&
    Array.isArray(obj['relationships'])
  );
}

/**
 * Validación más detallada del OnboardingData.
 * Lanza un Error con mensaje descriptivo si el objeto no es válido.
 *
 * No validamos cada campo de cada módulo y relación para mantener el código
 * simple. Nos limitamos a verificar que los arrays no estén vacíos y que
 * los campos de texto principales estén presentes.
 */
function validateOnboardingData(data: unknown): asserts data is OnboardingData {
  if (!looksLikeOnboardingData(data)) {
    throw new Error(
      'El JSON generado por Bob no tiene el esquema esperado.\n' +
      'Campos requeridos: projectName (string), summary (string), ' +
      'technologies (array), modules (array), relationships (array).'
    );
  }

  const obj = data as OnboardingData;

  if (obj.modules.length === 0) {
    throw new Error('El análisis generado no contiene módulos.');
  }

  if (obj.technologies.length === 0) {
    throw new Error('El análisis generado no contiene tecnologías.');
  }
}

/**
 * Guarda el OnboardingData en bob_sessions/onboarding.json.
 * Crea el directorio si no existe.
 */
function saveToFile(data: OnboardingData): void {
  // Nos aseguramos de que bob_sessions/ existe antes de escribir
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2), 'utf-8');
}
