import * as vscode from 'vscode';
import type { OnboardingData, Module, ModuleType } from './types';

// ─── Colores por tipo de módulo ───────────────────────────────────────────────
// Cada tipo de módulo recibe un color de fondo y uno de borde para
// diferenciarlos visualmente en el mapa de arquitectura.
const TYPE_COLORS: Record<ModuleType, { bg: string; border: string; text: string }> = {
  frontend:       { bg: '#dbeafe', border: '#3b82f6', text: '#1e3a5f' },
  backend:        { bg: '#dcfce7', border: '#22c55e', text: '#14532d' },
  database:       { bg: '#fef9c3', border: '#eab308', text: '#713f12' },
  infrastructure: { bg: '#f3e8ff', border: '#a855f7', text: '#3b0764' },
  other:          { bg: '#f1f5f9', border: '#94a3b8', text: '#1e293b' },
};

const TYPE_LABELS: Record<ModuleType, string> = {
  frontend:       'Frontend',
  backend:        'Backend',
  database:       'Base de datos',
  infrastructure: 'Infraestructura',
  other:          'Otro',
};

/**
 * Genera el bloque HTML de la leyenda de colores.
 */
function buildLegend(): string {
  return Object.entries(TYPE_COLORS)
    .map(([type, colors]) => `
      <span class="legend-item">
        <span class="legend-dot" style="background:${colors.border}"></span>
        ${TYPE_LABELS[type as ModuleType]}
      </span>`)
    .join('');
}

/**
 * Convierte la lista de módulos en tarjetas HTML agrupadas por tipo.
 * Cada tarjeta muestra nombre, path y descripción del módulo.
 */
function buildModuleCards(modules: Module[]): string {
  // Agrupamos por tipo para mostrarlos en secciones separadas
  const groups: Partial<Record<ModuleType, Module[]>> = {};
  for (const mod of modules) {
    if (!groups[mod.type]) {
      groups[mod.type] = [];
    }
    groups[mod.type]!.push(mod);
  }

  const order: ModuleType[] = ['backend', 'frontend', 'database', 'infrastructure', 'other'];

  return order
    .filter(type => groups[type] && groups[type]!.length > 0)
    .map(type => {
      const colors = TYPE_COLORS[type];
      const cards = groups[type]!
        .map(mod => `
          <div class="module-card" style="border-left:4px solid ${colors.border};background:${colors.bg}">
            <div class="module-name" style="color:${colors.text}">${escapeHtml(mod.name)}</div>
            <div class="module-path">${escapeHtml(mod.path)}</div>
            <div class="module-desc">${escapeHtml(mod.description)}</div>
          </div>`)
        .join('');

      return `
        <div class="group">
          <h3 class="group-title" style="color:${colors.border}">${TYPE_LABELS[type]}</h3>
          <div class="cards-grid">${cards}</div>
        </div>`;
    })
    .join('');
}

/**
 * Construye una representación visual de las relaciones como lista HTML.
 * Cada relación muestra: módulo origen → módulo destino y descripción.
 * Se usa CSS puro en lugar de canvas/SVG para mantenerlo simple.
 */
function buildRelationships(data: OnboardingData): string {
  // Creamos un mapa de nombre → tipo para poder colorear los chips
  const moduleTypeMap = new Map<string, ModuleType>(
    data.modules.map(m => [m.name, m.type])
  );

  return data.relationships
    .map(rel => {
      const fromType = moduleTypeMap.get(rel.from) ?? 'other';
      const toType   = moduleTypeMap.get(rel.to)   ?? 'other';
      const fromColor = TYPE_COLORS[fromType].border;
      const toColor   = TYPE_COLORS[toType].border;

      return `
        <div class="rel-row">
          <span class="rel-chip" style="border-color:${fromColor};color:${fromColor}">${escapeHtml(rel.from)}</span>
          <span class="rel-arrow">→</span>
          <span class="rel-chip" style="border-color:${toColor};color:${toColor}">${escapeHtml(rel.to)}</span>
          <span class="rel-desc">${escapeHtml(rel.description)}</span>
        </div>`;
    })
    .join('');
}

/**
 * Escapa caracteres HTML especiales para evitar inyección en el webview.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Ensambla el HTML completo del webview.
 * Toda la maquetación es inline (CSS en <style>) para cumplir con la
 * política de Content Security Policy de los webviews de VS Code.
 */
export function buildWebviewHtml(data: OnboardingData): string {
  const techBadges = data.technologies
    .map(t => `<span class="badge">${escapeHtml(t)}</span>`)
    .join('');

  return /* html */ `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <!--
    Content-Security-Policy requerida por VS Code:
    - default-src 'none'   → nada externo por defecto
    - style-src 'unsafe-inline' → permitimos los estilos inline del <style>
    - No cargamos scripts: toda la UI es HTML/CSS puro
  -->
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bob Onboarding</title>
  <style>
    /* ── Reset y base ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
      font-size: 13px;
      line-height: 1.6;
      /* Usamos las variables de color del tema activo de VS Code */
      background: var(--vscode-editor-background, #1e1e1e);
      color: var(--vscode-editor-foreground, #d4d4d4);
      padding: 16px;
    }

    /* ── Encabezado ── */
    .header { margin-bottom: 20px; }
    .project-name {
      font-size: 20px;
      font-weight: 700;
      color: var(--vscode-textLink-foreground, #4fc3f7);
      margin-bottom: 6px;
    }
    .bob-badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: #1565c0;
      color: #fff;
      border-radius: 4px;
      padding: 2px 7px;
      margin-bottom: 10px;
    }
    .summary {
      font-size: 12.5px;
      color: var(--vscode-descriptionForeground, #9e9e9e);
      max-width: 680px;
    }

    /* ── Secciones ── */
    .section { margin-bottom: 28px; }
    .section-title {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--vscode-textPreformat-foreground, #ce9178);
      border-bottom: 1px solid var(--vscode-widget-border, #444);
      padding-bottom: 5px;
      margin-bottom: 12px;
    }

    /* ── Tecnologías ── */
    .badges { display: flex; flex-wrap: wrap; gap: 6px; }
    .badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 12px;
      background: var(--vscode-badge-background, #2d2d2d);
      color: var(--vscode-badge-foreground, #d4d4d4);
      border: 1px solid var(--vscode-widget-border, #555);
    }

    /* ── Leyenda ── */
    .legend { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 14px; }
    .legend-item { display: flex; align-items: center; gap: 5px; font-size: 11.5px; }
    .legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

    /* ── Grupos de módulos ── */
    .group { margin-bottom: 16px; }
    .group-title { font-size: 12px; font-weight: 600; margin-bottom: 8px; }
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 8px;
    }
    .module-card {
      border-radius: 6px;
      padding: 10px 12px;
      font-size: 12px;
    }
    .module-name { font-weight: 700; font-size: 12.5px; margin-bottom: 2px; }
    .module-path {
      font-family: "Consolas", "Courier New", monospace;
      font-size: 10.5px;
      opacity: 0.75;
      margin-bottom: 4px;
    }
    .module-desc { font-size: 11.5px; line-height: 1.5; color: #333; }

    /* ── Relaciones ── */
    .rel-list { display: flex; flex-direction: column; gap: 7px; }
    .rel-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      font-size: 11.5px;
      padding: 6px 10px;
      border-radius: 6px;
      background: var(--vscode-list-hoverBackground, #2a2d2e);
    }
    .rel-chip {
      font-weight: 600;
      font-size: 11px;
      padding: 1px 7px;
      border-radius: 10px;
      border: 1px solid;
      white-space: nowrap;
    }
    .rel-arrow { font-weight: 700; opacity: 0.6; }
    .rel-desc {
      flex: 1;
      min-width: 140px;
      font-size: 11px;
      opacity: 0.75;
    }

    /* ── Footer ── */
    .footer {
      margin-top: 32px;
      padding-top: 12px;
      border-top: 1px solid var(--vscode-widget-border, #444);
      font-size: 11px;
      opacity: 0.45;
      text-align: center;
    }
  </style>
</head>
<body>

  <!-- ── Encabezado ── -->
  <div class="header">
    <div class="bob-badge">IBM Bob · Onboarding</div>
    <div class="project-name">${escapeHtml(data.projectName)}</div>
    <p class="summary">${escapeHtml(data.summary)}</p>
  </div>

  <!-- ── Tecnologías ── -->
  <div class="section">
    <div class="section-title">Tecnologías detectadas</div>
    <div class="badges">${techBadges}</div>
  </div>

  <!-- ── Mapa de arquitectura (módulos) ── -->
  <div class="section">
    <div class="section-title">Mapa de arquitectura</div>
    <div class="legend">${buildLegend()}</div>
    ${buildModuleCards(data.modules)}
  </div>

  <!-- ── Relaciones entre módulos ── -->
  <div class="section">
    <div class="section-title">Relaciones entre módulos</div>
    <div class="rel-list">${buildRelationships(data)}</div>
  </div>

  <div class="footer">Generado por Bob Onboarding · IBM Bob</div>

</body>
</html>`;
}

/**
 * Crea (o revela si ya existe) el panel WebView de Bob Onboarding.
 *
 * @param context  ExtensionContext de VS Code (necesario para el ciclo de vida del panel).
 * @param data     Datos de onboarding a mostrar.
 */
export function createOrShowPanel(
  context: vscode.ExtensionContext,
  data: OnboardingData
): void {
  // Si ya existe un panel abierto, lo mostramos en lugar de crear otro
  if (BobOnboardingPanel.current) {
    BobOnboardingPanel.current.reveal();
    return;
  }

  BobOnboardingPanel.create(context, data);
}

/**
 * Actualiza el contenido del panel si ya está abierto, o lo crea si no existe.
 *
 * Necesario para el comando "Generar análisis con Bob": tras obtener datos
 * frescos de Bob Shell, queremos reflejarlos en el panel sin que el usuario
 * tenga que cerrarlo y volver a abrirlo.
 *
 * @param context  ExtensionContext de VS Code.
 * @param data     Datos nuevos a mostrar en el panel.
 */
export function createOrUpdatePanel(
  context: vscode.ExtensionContext,
  data: OnboardingData
): void {
  if (BobOnboardingPanel.current) {
    // El panel ya existe: actualizamos su HTML con los datos nuevos
    // y lo traemos al frente.
    BobOnboardingPanel.current.update(data);
    BobOnboardingPanel.current.reveal();
  } else {
    // No hay panel abierto: creamos uno nuevo.
    BobOnboardingPanel.create(context, data);
  }
}

/**
 * Clase que encapsula el ciclo de vida del WebviewPanel.
 * VS Code requiere que controlemos cuándo el panel se cierra para
 * liberar recursos y evitar memory leaks.
 */
class BobOnboardingPanel {
  /** Referencia estática al panel activo (solo puede haber uno). */
  static current: BobOnboardingPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  static create(context: vscode.ExtensionContext, data: OnboardingData): void {
    const panel = vscode.window.createWebviewPanel(
      'bobOnboarding',          // ID interno del tipo de panel
      'Bob Onboarding',         // Título visible en la pestaña
      vscode.ViewColumn.One,    // Columna del editor donde aparece
      {
        enableScripts: false,   // No necesitamos JS en el webview (todo es HTML/CSS)
        retainContextWhenHidden: true, // Mantiene el estado al ocultar la pestaña
      }
    );

    BobOnboardingPanel.current = new BobOnboardingPanel(panel, data);
  }

  private constructor(panel: vscode.WebviewPanel, data: OnboardingData) {
    this.panel = panel;
    this.panel.webview.html = buildWebviewHtml(data);

    // Limpiamos cuando el usuario cierra el panel
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  reveal(): void {
    this.panel.reveal(vscode.ViewColumn.One);
  }

  /**
   * Reemplaza el HTML del panel con datos nuevos.
   * Se llama desde createOrUpdatePanel cuando el análisis de Bob termina.
   */
  update(data: OnboardingData): void {
    this.panel.webview.html = buildWebviewHtml(data);
  }

  private dispose(): void {
    BobOnboardingPanel.current = undefined;
    this.panel.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
  }
}
