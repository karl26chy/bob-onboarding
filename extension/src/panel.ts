import * as vscode from 'vscode';
import type { OnboardingData, Module, ModuleType } from './types';

// ─── Type shape for module colours (kept for Mermaid node classes) ────────────
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Escapes HTML special characters to prevent injection in the webview. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Escapes a string for safe use as a Mermaid node label or edge label.
 * Wraps in double-quotes and escapes internal double-quotes.
 */
function escapeMermaid(str: string): string {
  return '"' + str.replace(/"/g, '#quot;') + '"';
}

// ─── Mermaid diagram builder ──────────────────────────────────────────────────

/**
 * Converts OnboardingData.modules + relationships into a Mermaid flowchart
 * definition string (graph TD).  Module IDs are derived from their array index
 * to stay safe with special characters in names.
 *
 * Mermaid node classes are declared at the bottom of the graph and referenced
 * by type, so the diagram is colour-coded to match the module-card legend.
 */
function buildMermaidGraph(data: OnboardingData): string {
  // Build a name → safe ID map so relationships can look up node IDs
  const nameToId = new Map<string, string>();
  data.modules.forEach((mod, i) => {
    nameToId.set(mod.name, `M${i}`);
  });

  const lines: string[] = ['graph TD'];

  // Node declarations: M0["Auth Service"]:::backend
  for (const mod of data.modules) {
    const id    = nameToId.get(mod.name)!;
    const label = escapeMermaid(mod.name);
    lines.push(`  ${id}[${label}]:::${mod.type}`);
  }

  // Edge declarations
  for (const rel of data.relationships) {
    const fromId = nameToId.get(rel.from);
    const toId   = nameToId.get(rel.to);
    if (!fromId || !toId) {
      continue; // silently skip dangling references
    }
    const edgeLabel = escapeMermaid(rel.description);
    lines.push(`  ${fromId} -->|${edgeLabel}| ${toId}`);
  }

  // Class definitions (one per ModuleType)
  lines.push('');
  const typeColors = TYPE_COLORS as Record<string, { bg: string; border: string; text: string }>;
  for (const [type, colors] of Object.entries(typeColors)) {
    lines.push(
      `  classDef ${type} fill:${colors.bg},stroke:${colors.border},color:${colors.text}`
    );
  }

  return lines.join('\n');
}

// ─── Legend HTML ──────────────────────────────────────────────────────────────

function buildLegend(): string {
  return Object.entries(TYPE_COLORS)
    .map(([type, colors]) => `
      <span class="legend-item">
        <span class="legend-dot" style="background:${colors.border}"></span>
        ${TYPE_LABELS[type as ModuleType]}
      </span>`)
    .join('');
}

// ─── Technology badges ────────────────────────────────────────────────────────

function buildTechBadges(technologies: string[]): string {
  return technologies
    .map(t => `<span class="badge">${escapeHtml(t)}</span>`)
    .join('');
}

// ─── Module cards (static HTML, rendered server-side) ────────────────────────

/**
 * Builds module card HTML grouped by type.
 * Cards are rendered on the extension-host side and injected into the page
 * during the success render, avoiding the need to serialise the full Module[]
 * array into the webview message.
 */
function buildModuleCards(modules: Module[]): string {
  const groups: Partial<Record<ModuleType, Module[]>> = {};
  for (const mod of modules) {
    if (!groups[mod.type]) { groups[mod.type] = []; }
    groups[mod.type]!.push(mod);
  }

  const order: ModuleType[] = ['backend', 'frontend', 'database', 'infrastructure', 'other'];

  return order
    .filter(type => (groups[type]?.length ?? 0) > 0)
    .map(type => {
      const colors = TYPE_COLORS[type];
      const cards = groups[type]!
        .map(mod => `
          <div class="module-card" style="border-left:4px solid ${colors.border};background:${colors.bg}">
            <div class="module-header">
              <span class="module-name" style="color:${colors.text}">${escapeHtml(mod.name)}</span>
              <code class="module-path">${escapeHtml(mod.path)}</code>
            </div>
            <p class="module-description" style="color:${colors.text}">${escapeHtml(mod.description)}</p>
          </div>`)
        .join('');

      return `
        <div class="module-group">
          <h3 class="group-title" style="color:${colors.border}">${TYPE_LABELS[type]}</h3>
          <div class="modules-grid">${cards}</div>
        </div>`;
    })
    .join('');
}

// ─── Relationships list ───────────────────────────────────────────────────────

function buildRelationships(data: OnboardingData): string {
  const moduleTypeMap = new Map<string, ModuleType>(
    data.modules.map(m => [m.name, m.type])
  );

  return data.relationships
    .map(rel => {
      const fromType  = moduleTypeMap.get(rel.from) ?? 'other';
      const toType    = moduleTypeMap.get(rel.to)   ?? 'other';
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

// ─── HTML shell (loading state) ───────────────────────────────────────────────

/**
 * Returns the static HTML shell used when the panel is first opened.
 * The extension host posts a { type: 'success', … } message once data is ready,
 * or { type: 'error', … } if something went wrong.
 *
 * CSP notes:
 *   - script-src: https://cdn.jsdelivr.net is needed for Mermaid; 'unsafe-inline'
 *     is required for the inline <script> block.
 *   - style-src 'unsafe-inline': inline <style> block.
 */
function buildLoadingHtml(): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             script-src https://cdn.jsdelivr.net 'unsafe-inline';
             style-src 'unsafe-inline';
             img-src data:;" />
  <title>Bob Onboarding</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family, -apple-system, "Segoe UI", sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      line-height: 1.6;
    }

    /* ── Layout ─────────────────────────────────── */
    .page-header { padding: 16px 16px 0; }

    h1 {
      font-size: 1.3em;
      font-weight: 600;
      color: var(--vscode-foreground);
      margin-bottom: 2px;
    }

    .tagline {
      color: var(--vscode-descriptionForeground);
      font-size: 0.82em;
      margin-bottom: 20px;
    }

    h2 {
      font-size: 1em;
      font-weight: 600;
      color: var(--vscode-foreground);
      margin-bottom: 10px;
      padding-bottom: 5px;
      border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-widget-border));
    }

    .section { margin-bottom: 24px; }

    /* ── State views ────────────────────────────── */
    .state-view { display: none; }
    .state-view.active { display: block; }

    /* ══ LOADING ════════════════════════════════════ */
    #view-loading {
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 50vh;
      gap: 16px;
      padding: 24px;
    }
    #view-loading.active { display: flex; }

    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--vscode-panel-border, var(--vscode-widget-border));
      border-top-color: var(--vscode-textLink-foreground, #3b82d4);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .loading-message {
      color: var(--vscode-descriptionForeground);
      font-size: 0.9em;
      text-align: center;
    }

    /* ══ ERROR ══════════════════════════════════════ */
    #view-error { padding: 16px; }

    .error-card {
      border: 1px solid var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground));
      border-radius: 5px;
      padding: 14px 16px;
      background-color: var(--vscode-inputValidation-errorBackground, transparent);
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .error-title {
      font-weight: 600;
      color: var(--vscode-errorForeground);
      font-size: 0.95em;
    }

    .error-message {
      color: var(--vscode-errorForeground);
      font-size: 0.88em;
      opacity: 0.9;
      word-break: break-word;
      white-space: pre-wrap;
    }

    .btn-retry {
      align-self: flex-start;
      padding: 5px 14px;
      font-size: 0.85em;
      font-family: inherit;
      cursor: pointer;
      border-radius: 3px;
      border: 1px solid var(--vscode-button-border, transparent);
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-retry:hover { background-color: var(--vscode-button-hoverBackground); }

    /* ══ SUCCESS ════════════════════════════════════ */
    #view-success { padding: 0 16px 32px; }

    /* ── Bob badge ───────────────────────────────── */
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
      margin-bottom: 8px;
    }

    /* ── Summary ─────────────────────────────────── */
    .summary-box {
      background-color: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--vscode-textLink-foreground, #3b82d4);
      padding: 10px 14px;
      border-radius: 4px;
      color: var(--vscode-foreground);
      font-size: 0.9em;
    }

    /* ── Technology badges ───────────────────────── */
    .badges { display: flex; flex-wrap: wrap; gap: 6px; }
    .badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 12px;
      background: var(--vscode-badge-background, #2d2d2d);
      color: var(--vscode-badge-foreground, #d4d4d4);
      border: 1px solid var(--vscode-widget-border, #555);
    }

    /* ── Legend ──────────────────────────────────── */
    .legend { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 14px; }
    .legend-item { display: flex; align-items: center; gap: 5px; font-size: 11.5px; }
    .legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

    /* ── Mermaid diagram ─────────────────────────── */
    .diagram-wrapper {
      background-color: var(--vscode-editorWidget-background, var(--vscode-editor-background));
      border: 1px solid var(--vscode-panel-border, var(--vscode-widget-border));
      border-radius: 5px;
      padding: 12px;
      overflow-x: auto;
      text-align: center;
    }

    .diagram-wrapper svg { max-width: 100%; height: auto; }

    #diagram-error {
      display: none;
      color: var(--vscode-errorForeground);
      font-size: 0.82em;
      margin-top: 6px;
    }

    /* ── Module cards ────────────────────────────── */
    .module-group { margin-bottom: 20px; }
    .group-title  { font-size: 12px; font-weight: 600; margin-bottom: 8px; }

    .modules-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
    }

    @media (min-width: 520px) {
      .page-header  { padding: 24px 32px 0; }
      #view-error   { padding: 32px; }
      #view-success { padding: 0 32px 32px; }
      .modules-grid { grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
    }

    .module-card {
      border-radius: 6px;
      padding: 10px 12px;
      font-size: 12px;
      transition: filter 0.15s;
    }
    .module-card:hover { filter: brightness(0.96); }

    .module-header {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 6px;
      flex-wrap: wrap;
    }

    .module-name {
      font-weight: 700;
      font-size: 0.95em;
    }

    .module-path {
      font-family: var(--vscode-editor-font-family, "Consolas", "Courier New", monospace);
      font-size: 0.75em;
      color: var(--vscode-descriptionForeground);
      background-color: var(--vscode-textCodeBlock-background);
      padding: 1px 5px;
      border-radius: 3px;
      word-break: break-all;
    }

    .module-description {
      font-size: 0.88em;
      line-height: 1.5;
    }

    /* ── Relationships ───────────────────────────── */
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

    /* ── Footer ──────────────────────────────────── */
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

  <div class="page-header">
    <h1>Bob Onboarding</h1>
    <p class="tagline">Repository architecture overview — generated by IBM Bob</p>
  </div>

  <!-- ── LOADING ────────────────────────────────── -->
  <div id="view-loading" class="state-view active">
    <div class="spinner"></div>
    <p class="loading-message">Analyzing repository with Bob Shell…</p>
  </div>

  <!-- ── ERROR ──────────────────────────────────── -->
  <div id="view-error" class="state-view">
    <div class="error-card">
      <span class="error-title">Analysis failed</span>
      <p class="error-message" id="error-text"></p>
      <button class="btn-retry" id="btn-retry">Retry</button>
    </div>
  </div>

  <!-- ── SUCCESS ────────────────────────────────── -->
  <div id="view-success" class="state-view">
    <div class="bob-badge">IBM Bob · Onboarding</div>
    <h1 id="project-name" style="margin-bottom:4px;"></h1>

    <section class="section">
      <h2>Project Summary</h2>
      <div class="summary-box" id="summary-text"></div>
    </section>

    <section class="section" id="section-techs">
      <h2>Technologies Detected</h2>
      <div class="badges" id="tech-badges"></div>
    </section>

    <section class="section">
      <h2>Architecture Diagram</h2>
      <div id="legend-container" class="legend"></div>
      <div class="diagram-wrapper">
        <div class="mermaid" id="mermaid-source"></div>
      </div>
      <p id="diagram-error">⚠ Could not render diagram. Check the Mermaid syntax.</p>
    </section>

    <section class="section">
      <h2 id="modules-heading">Modules</h2>
      <div id="modules-container"></div>
    </section>

    <section class="section" id="section-rels">
      <h2>Module Relationships</h2>
      <div class="rel-list" id="rel-list"></div>
    </section>

    <div class="footer">Generated by Bob Onboarding · IBM Bob</div>
  </div>

  <script>
  (function () {
    'use strict';

    const vscode = acquireVsCodeApi();

    // ── View switching ─────────────────────────────
    function showView(id) {
      ['view-loading', 'view-error', 'view-success'].forEach(function (v) {
        document.getElementById(v).classList.toggle('active', v === id);
      });
    }

    // ── Retry button ───────────────────────────────
    document.getElementById('btn-retry').addEventListener('click', function () {
      vscode.postMessage({ type: 'retry' });
    });

    // ── Mermaid: load from CDN asynchronously and non-blocking ────────────────
    // Loading is deferred so a CDN failure does not block the message handler or
    // prevent the content from rendering. renderDiagram() guards against Mermaid
    // not being available and shows the diagram-error fallback instead.
    var mermaidReady = false;
    (function loadMermaid() {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
      s.async = true;
      s.onload = function () {
        var isDark = document.body.classList.contains('vscode-dark') ||
                     document.body.classList.contains('vscode-high-contrast');
        mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'default', securityLevel: 'loose' });
        mermaidReady = true;
        // If renderDiagram was called before Mermaid loaded, a pending syntax is stored.
        if (window._pendingMermaid) { renderDiagram(window._pendingMermaid); }
      };
      document.head.appendChild(s);
    })();

    async function renderDiagram(syntax) {
      if (!mermaidReady) {
        // Store for retry once Mermaid loads
        window._pendingMermaid = syntax;
        return;
      }
      window._pendingMermaid = null;
      var el = document.getElementById('mermaid-source');
      el.removeAttribute('data-processed');
      el.textContent = syntax;
      try {
        await mermaid.run({ nodes: [el] });
        document.getElementById('diagram-error').style.display = 'none';
      } catch (_) {
        document.getElementById('diagram-error').style.display = 'block';
      }
    }

    // ── Message handler ───────────────────────────
    window.addEventListener('message', function (event) {
      var msg = event.data;

      if (msg.type === 'loading') {
        showView('view-loading');
        return;
      }

      if (msg.type === 'error') {
        document.getElementById('error-text').textContent = msg.message;
        showView('view-error');
        return;
      }

      if (msg.type === 'success') {
        var d = msg.data;

        // Project name + summary
        document.getElementById('project-name').textContent = d.projectName;
        document.getElementById('summary-text').textContent = d.summary;

        // Technology badges (already-escaped HTML from extension host)
        document.getElementById('tech-badges').innerHTML = d.techBadgesHtml;

        // Legend
        document.getElementById('legend-container').innerHTML = d.legendHtml;

        // Module cards (pre-built HTML from extension host)
        document.getElementById('modules-heading').textContent =
          'Modules (' + d.moduleCount + ')';
        document.getElementById('modules-container').innerHTML = d.moduleCardsHtml;

        // Relationships
        document.getElementById('rel-list').innerHTML = d.relationshipsHtml;
        document.getElementById('section-rels').style.display =
          d.relationshipsHtml ? '' : 'none';

        showView('view-success');

        // Render Mermaid diagram after the success view is visible
        renderDiagram(d.mermaidGraph);
      }
    });

  })();
  </script>

</body>
</html>`;
}

// ─── Message payload sent to the webview ─────────────────────────────────────

interface SuccessPayload {
  type: 'success';
  data: {
    projectName: string;
    summary: string;
    techBadgesHtml: string;
    legendHtml: string;
    moduleCardsHtml: string;
    moduleCount: number;
    relationshipsHtml: string;
    mermaidGraph: string;
  };
}

interface LoadingPayload { type: 'loading'; }
interface ErrorPayload   { type: 'error'; message: string; }
interface RetryPayload   { type: 'retry'; }

type PanelMessage = SuccessPayload | LoadingPayload | ErrorPayload | RetryPayload;

// ─── Public HTML builder (kept for backward compatibility) ───────────────────

/**
 * Builds the complete webview HTML for the given OnboardingData.
 *
 * This function is called by `BobOnboardingPanel.update()` each time new data
 * arrives.  It returns the full static HTML shell pre-populated with success
 * state so the panel is ready immediately without requiring a JS message round-trip.
 *
 * The function is also exported so external callers (e.g. tests) can use it.
 */
export function buildWebviewHtml(data: OnboardingData): string {
  // We reuse the loading shell and then inject a synthetic success message
  // via an inline script at the bottom of the body.  This keeps a single
  // rendering path and avoids duplicating the template.
  const payload: SuccessPayload['data'] = {
    projectName:       data.projectName,
    summary:           data.summary,
    techBadgesHtml:    buildTechBadges(data.technologies),
    legendHtml:        buildLegend(),
    moduleCardsHtml:   buildModuleCards(data.modules),
    moduleCount:       data.modules.length,
    relationshipsHtml: buildRelationships(data),
    mermaidGraph:      buildMermaidGraph(data),
  };

  // Inject the data as a self-dispatched message.
  // We cannot rely on the 'load' event because in a WebviewView (sidebar) VS Code
  // sets webview.html after the document is already parsed, so the 'load' event
  // may have already fired by the time the listener is registered — the payload
  // would never be dispatched and the spinner would never clear.
  // Instead we dispatch immediately with setTimeout(0) to yield one tick so the
  // message handler script above has a chance to run first.
  const injectScript = `
  <script>
  (function () {
    var payload = ${JSON.stringify({ type: 'success', data: payload })};
    setTimeout(function () {
      window.dispatchEvent(new MessageEvent('message', { data: payload }));
    }, 0);
  })();
  <\/script>`;

  // Insert the inject script just before </body>
  const shell = buildLoadingHtml();
  return shell.replace('</body>', injectScript + '\n</body>');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Creates (or reveals if already open) the Bob Onboarding panel.
 * If the panel is already visible, it is simply brought to the front —
 * the existing data is preserved.
 */
export function createOrShowPanel(
  context: vscode.ExtensionContext,
  data: OnboardingData
): void {
  if (BobOnboardingPanel.current) {
    BobOnboardingPanel.current.reveal();
    return;
  }
  BobOnboardingPanel.create(context, data);
}

/**
 * Creates the panel if it does not yet exist, or replaces its HTML with
 * freshly-generated data if it does.  Used by the "Generate" command.
 */
export function createOrUpdatePanel(
  context: vscode.ExtensionContext,
  data: OnboardingData
): void {
  if (BobOnboardingPanel.current) {
    BobOnboardingPanel.current.update(data);
    BobOnboardingPanel.current.reveal();
  } else {
    BobOnboardingPanel.create(context, data);
  }
}

// ─── Sidebar WebviewView provider ────────────────────────────────────────────

/**
 * Implements the VS Code WebviewViewProvider interface so the extension can
 * render its UI inside the Activity Bar sidebar view declared in package.json
 * under `contributes.views.bobOnboarding`.
 *
 * The provider holds the latest OnboardingData in memory.  When VS Code first
 * resolves the view (user clicks the Activity Bar icon) it renders whatever
 * data is available.  Calling `update()` later re-renders the view with fresh
 * data from a Bob analysis.
 */
export class BobOnboardingSidebarProvider implements vscode.WebviewViewProvider {
  static readonly viewId = 'bobOnboarding.sidebar';

  private _view?: vscode.WebviewView;
  private _data: OnboardingData;

  constructor(private readonly _context: vscode.ExtensionContext, initialData: OnboardingData) {
    this._data = initialData;
  }

  /**
   * Called by VS Code the first time the sidebar view becomes visible.
   * Sets up the webview with scripts enabled and renders the current data.
   */
  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = buildWebviewHtml(this._data);

    // Handle "retry" messages from the webview (re-render with same data).
    webviewView.webview.onDidReceiveMessage(
      (msg: PanelMessage) => {
        if (msg.type === 'retry') {
          webviewView.webview.html = buildWebviewHtml(this._data);
        }
      },
      null,
      this._context.subscriptions
    );
  }

  /**
   * Replaces the displayed data and re-renders the webview.
   * Called by the "Generate" command after a successful Bob analysis.
   */
  update(data: OnboardingData): void {
    this._data = data;
    if (this._view) {
      this._view.webview.html = buildWebviewHtml(data);
      this._view.show(true); // bring sidebar into focus
    }
  }
}

// ─── Panel class ─────────────────────────────────────────────────────────────

/**
 * Owns the lifecycle of the VS Code WebviewPanel.
 * Only one instance can exist at a time (enforced via the static `current` ref).
 */
class BobOnboardingPanel {
  static current: BobOnboardingPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  static create(context: vscode.ExtensionContext, data: OnboardingData): void {
    const panel = vscode.window.createWebviewPanel(
      'bobOnboarding',
      'Bob Onboarding',
      vscode.ViewColumn.One,
      {
        enableScripts: true,           // Required for Mermaid.js + message passing
        retainContextWhenHidden: true, // Keep the rendered diagram when tab is hidden
      }
    );

    BobOnboardingPanel.current = new BobOnboardingPanel(panel, data, context);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    data: OnboardingData,
    _context: vscode.ExtensionContext
  ) {
    this.panel = panel;
    this.panel.webview.html = buildWebviewHtml(data);

    // Listen for "retry" messages from the webview.
    // A retry re-renders the panel with the same data (the Generate command
    // is responsible for fetching fresh data; the panel itself only retries
    // the render).
    this.panel.webview.onDidReceiveMessage(
      (msg: PanelMessage) => {
        if (msg.type === 'retry') {
          // Re-post the current HTML (data unchanged); the webview will
          // re-trigger its load event and re-render the Mermaid diagram.
          this.panel.webview.html = this.panel.webview.html;
        }
      },
      null,
      this.disposables
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  reveal(): void {
    this.panel.reveal(vscode.ViewColumn.One);
  }

  /** Replaces the panel HTML with data from a fresh Bob analysis. */
  update(data: OnboardingData): void {
    this.panel.webview.html = buildWebviewHtml(data);
  }

  private dispose(): void {
    BobOnboardingPanel.current = undefined;
    this.panel.dispose();
    for (const d of this.disposables) { d.dispose(); }
    this.disposables.length = 0;
  }
}
