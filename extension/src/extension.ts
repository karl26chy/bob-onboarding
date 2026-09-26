/**
 * Punto de entrada de la extensión VS Code.
 *
 * VS Code llama a `activate` cuando la extensión se activa por primera vez
 * (según el evento declarado en package.json → activationEvents).
 * VS Code llama a `deactivate` justo antes de desinstalar o recargar.
 *
 * Comandos registrados:
 *   - bobOnboarding.open     → Abre el panel usando onboarding.json si existe,
 *                              o sampleData como fallback.
 *   - bobOnboarding.generate → Ejecuta Bob Shell, genera onboarding.json y
 *                              abre/actualiza el panel con los datos reales.
 */

import * as vscode from 'vscode';
import { createOrShowPanel, createOrUpdatePanel } from './panel';
import { sampleData } from './sampleData';
import { runBobAnalysis, loadSavedAnalysis } from './bobRunner';

/**
 * Se ejecuta cuando VS Code activa la extensión.
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log('[BobOnboarding] Extensión activada.');

  // ── Comando 1: Abrir panel ──────────────────────────────────────────────────
  //
  // Intenta cargar el análisis guardado en bob_sessions/onboarding.json.
  // Si el archivo existe y es válido, lo usa. Si no, utiliza sampleData
  // como fallback para que la extensión siempre muestre algo útil.
  //
  // Este comando NO ejecuta Bob Shell; es instantáneo.
  const openCommand = vscode.commands.registerCommand(
    'bobOnboarding.open',
    () => {
      // Intentamos cargar el último análisis guardado
      const saved = loadSavedAnalysis();

      if (saved) {
        // Hay un análisis real guardado: lo mostramos
        console.log('[BobOnboarding] Usando análisis guardado en bob_sessions/onboarding.json');
        createOrShowPanel(context, saved);
      } else {
        // No hay análisis guardado: usamos sampleData como fallback
        // Esto garantiza que la extensión funcione incluso sin Bob Shell.
        console.log('[BobOnboarding] No hay onboarding.json — usando sampleData como fallback');
        createOrShowPanel(context, sampleData);
      }
    }
  );

  // ── Comando 2: Generar análisis con Bob ────────────────────────────────────
  //
  // Ejecuta Bob Shell con un prompt estructurado, extrae el JSON del stdout,
  // lo guarda en bob_sessions/onboarding.json y actualiza el panel.
  //
  // Requisitos para que funcione:
  //   1. `bob` debe estar instalado y en PATH.
  //   2. La variable de entorno BOBSHELL_API_KEY debe estar configurada.
  //   3. Debe haber conexión a internet.
  //
  // Si algo falla, la extensión muestra un mensaje de error amigable y
  // mantiene el panel con los datos anteriores (o sampleData).
  const generateCommand = vscode.commands.registerCommand(
    'bobOnboarding.generate',
    async () => {
      // Necesitamos saber la raíz del workspace para lanzar `bob run` desde ahí.
      // Bob Shell solo puede leer archivos dentro del directorio donde se lanza.
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage(
          'Bob Onboarding: No hay ninguna carpeta de workspace abierta. ' +
          'Abre la carpeta del repositorio en VS Code primero.'
        );
        return;
      }

      // Usamos la primera carpeta del workspace (la raíz del repositorio)
      const workspacePath = workspaceFolders[0].uri.fsPath;

      // Mostramos un mensaje de progreso mientras Bob analiza el repositorio.
      // withProgress mantiene al usuario informado durante la espera (puede tardar minutos).
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Bob Onboarding',
          cancellable: false,
        },
        async (progress) => {
          progress.report({ message: 'Ejecutando Bob Shell... esto puede tardar unos minutos.' });

          try {
            // Ejecutar Bob Shell y obtener el OnboardingData
            // (toda la lógica de extracción y validación del JSON está en bobRunner.ts)
            const data = await runBobAnalysis(workspacePath);

            progress.report({ message: 'Análisis completado. Actualizando panel...' });

            // Actualizar o crear el panel con los datos reales
            createOrUpdatePanel(context, data);

            vscode.window.showInformationMessage(
              `Bob Onboarding: Análisis de "${data.projectName}" completado. ` +
              `${data.modules.length} módulos detectados.`
            );

          } catch (err: unknown) {
            // Si Bob falla por cualquier razón, mostramos el error y
            // mantenemos la extensión funcional con los datos anteriores.
            const message = err instanceof Error ? err.message : String(err);

            console.error('[BobOnboarding] Error al ejecutar Bob Shell:', message);

            // Mensaje de error amigable con botón para ver detalles
            vscode.window.showErrorMessage(
              'Bob Onboarding: No se pudo generar el análisis con Bob Shell. ' +
              'La extensión continuará mostrando los datos anteriores.',
              'Ver detalles'
            ).then(selection => {
              if (selection === 'Ver detalles') {
                // Mostramos el error completo en un nuevo documento de texto
                vscode.workspace.openTextDocument({
                  content: `Error al ejecutar Bob Shell\n${'─'.repeat(40)}\n\n${message}`,
                  language: 'plaintext',
                }).then(doc => vscode.window.showTextDocument(doc));
              }
            });
          }
        }
      );
    }
  );

  // Registramos ambos disposables para que VS Code los limpie automáticamente
  context.subscriptions.push(openCommand, generateCommand);
}

/**
 * Se ejecuta cuando VS Code desactiva la extensión.
 * No necesitamos limpieza manual: todo está registrado en context.subscriptions.
 */
export function deactivate(): void {
  console.log('[BobOnboarding] Extensión desactivada.');
}
