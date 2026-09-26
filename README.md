# Bob Onboarding

A VS Code extension that uses **IBM Bob Shell** to automatically analyze the
repository currently open in the editor and generate a visual architecture
panel — giving new developers an instant, structured overview of any codebase.

> **Not coupled to any specific project.** The extension works with any
> repository you open in VS Code. The workspace is detected dynamically at
> runtime; no paths are hardcoded.

---

## Table of Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Installation](#installation)
- [Running the extension](#running-the-extension)
- [Available commands](#available-commands)
- [Bob configuration](#bob-configuration)
- [Data format](#data-format)
- [Development](#development)
- [Project structure](#project-structure)
- [Screenshots](#screenshots)

---

## What it does

Bob Onboarding registers two commands in VS Code:

1. **Generate analysis with Bob** — runs IBM Bob Shell against the workspace
   currently open in VS Code, extracts a structured JSON from the output, saves
   it to `bob_sessions/onboarding.json`, and renders a visual panel.

2. **Open architecture panel** — opens the panel immediately using the last
   saved analysis (or a built-in generic fallback if no analysis exists yet).

The resulting panel shows:

- Project name and a plain-language summary aimed at a new developer.
- Detected technologies as visual badges.
- Architecture map with modules grouped and colour-coded by type
  (Frontend, Backend, Database, Infrastructure).
- Relationships between modules with a description of each dependency.

---

## Architecture

```
VS Code workspace (any repository)
          │
          ▼
Bob Onboarding Extension (extension/src/)
          │
          ▼
  detect workspace root
  (vscode.workspace.workspaceFolders[0])
          │
          ▼
    IBM Bob Shell
    bob run -p "@.bob-onboarding-prompt.txt"
    (cwd = workspace root)
          │
          ▼
       stdout
          │
          ▼
  extractOnboardingJson()
  (robust extraction — stdout is not pure JSON;
   Bob includes session headers and reasoning steps)
          │
          ▼
  bob_sessions/onboarding.json
          │
          ▼
  Visual architecture panel (WebviewPanel, HTML/CSS only)
```

**The workspace is dynamic.** Every time the "Generate analysis" command runs,
the extension reads `vscode.workspace.workspaceFolders[0].uri.fsPath` to
determine where to launch Bob Shell. There is no hardcoded project path
anywhere in the source code.

The extension was validated against two different repositories during
development, including `academic-platform`, but it is not tied to any of them.

---

## Requirements

| Requirement | Notes |
|---|---|
| **VS Code** | ≥ 1.85.0 (declared in `package.json`) |
| **Node.js** | ≥ 20 (declared in `devDependencies` — `@types/node ^20`) |
| **npm** | Bundled with Node.js |
| **IBM Bob Shell** | Must be installed and available in `PATH` |
| **Bob API key** | The environment variable `BOBSHELL_API_KEY` must be set |
| **Internet access** | Required when Bob Shell calls the IBM API |

### Bob executable name

| Platform | Executable used |
|---|---|
| Windows | `bob.cmd` |
| macOS / Linux | `bob` |

The extension detects the platform automatically at runtime
([`bobRunner.ts`](extension/src/bobRunner.ts#L28)):

```typescript
const BOB_CMD = process.platform === 'win32' ? 'bob.cmd' : 'bob';
```

### Verify Bob is working

```bash
bob --version
bob run "Hello"
```

If the second command returns output, Bob Shell is configured correctly.

---

## Installation

```bash
# 1. Clone the repository
git clone <REPOSITORY_URL>
cd bob-onboarding

# 2. Move into the extension folder and install dependencies
cd extension
npm install

# 3. Compile TypeScript
npm run compile
```

Replace `<REPOSITORY_URL>` with the actual remote URL once the repository is
published.

---

## Running the extension

> **Important:** There are two separate VS Code windows involved.
>
> - **Development window** — the window where you open `bob-onboarding/extension/`.
>   This is where you edit code and press F5.
> - **Extension Development Host** — a second VS Code window that VS Code opens
>   automatically when you press F5. This window runs the extension. This is
>   where you open the repository you want to analyze and run the commands.

### Step-by-step

1. Open the **extension folder** in VS Code (not the repository root):

   ```bash
   code bob-onboarding/extension
   ```

2. Install dependencies if you have not done so:

   ```bash
   npm install
   ```

3. Compile the TypeScript source:

   ```bash
   npm run compile
   ```

4. Open the **Run and Debug** panel (`Ctrl+Shift+D`).

5. Select the configuration **"Run Bob Onboarding Extension"** from the
   dropdown at the top.

6. Press **F5**.

   VS Code compiles the extension and opens a new **Extension Development
   Host** window with the extension loaded.

7. In the **Extension Development Host** window, open the repository you want
   to analyze (`File → Open Folder`).

8. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run:

   ```
   Bob Onboarding: Generar análisis con Bob
   ```

   Bob Shell will analyze the open repository. This may take several minutes.
   A progress notification appears while it runs.

9. Once finished, the architecture panel opens automatically.

### Reload after a code change

After editing source files in the development window, press
**`Ctrl+Shift+F5`** to recompile and restart the Extension Development Host.

---

## Available commands

Both commands are accessible from the Command Palette (`Ctrl+Shift+P`).

| Command | What it does |
|---|---|
| `Bob Onboarding: Abrir panel de arquitectura` | Opens the panel immediately using the last saved `onboarding.json`, or the built-in generic fallback if no analysis exists. Does **not** call Bob Shell — instant. |
| `Bob Onboarding: Generar análisis con Bob` | Runs IBM Bob Shell against the currently open workspace, extracts `OnboardingData` from stdout, saves `bob_sessions/onboarding.json`, and opens/updates the panel with real data. Requires Bob Shell installed and `BOBSHELL_API_KEY` set. |

---

## Bob configuration

Bob Shell is launched using the workspace root as the working directory
(`cwd`). This means Bob can read all files in the repository being analyzed.

No personal paths, no hardcoded project names. The extension works on any
machine where IBM Bob Shell is installed.

The prompt is written to a temporary file (`.bob-onboarding-prompt.txt`) in
the workspace root before calling Bob, and deleted immediately after. This
avoids argument-parsing issues with multi-line prompts on Windows.

**Required environment variable:**

```bash
# Set before launching VS Code (or in your shell profile)
export BOBSHELL_API_KEY=<your-key>     # macOS/Linux
$env:BOBSHELL_API_KEY="<your-key>"    # Windows PowerShell
```

---

## Data format

The extension produces and consumes an `OnboardingData` object
(defined in [`extension/src/types.ts`](extension/src/types.ts)):

```typescript
interface OnboardingData {
  projectName:   string;        // Name of the repository/project
  summary:       string;        // 3-5 sentence description for a new developer
  technologies:  string[];      // Technologies detected in the repo
  modules:       Module[];      // Architecturally relevant modules (max 20)
  relationships: Relationship[]; // Dependencies between modules
}

interface Module {
  name:        string;     // Short readable name — used as ID in relationships
  path:        string;     // Relative path within the repository
  description: string;     // One-sentence description for a new developer
  type:        ModuleType; // 'frontend' | 'backend' | 'database' | 'infrastructure' | 'other'
}

interface Relationship {
  from:        string; // Module name (must match a name in modules[])
  to:          string; // Module name (must match a name in modules[])
  description: string; // Why this dependency exists
}
```

The `sampleData` in [`extension/src/sampleData.ts`](extension/src/sampleData.ts)
serves as a **generic fallback** shown when no `onboarding.json` exists. It
does not represent any specific real project.

---

## Development

```bash
cd extension

# Install dependencies (first time or after package.json changes)
npm install

# Compile once
npm run compile

# Compile in watch mode (recompiles on every file save)
npm run watch
```

To debug, press **F5** from the `extension/` folder opened in VS Code. The
`launch.json` configuration runs `npm: compile` as a pre-launch task and opens
an Extension Development Host.

Source files are in `extension/src/`:

| File | Responsibility |
|---|---|
| [`extension.ts`](extension/src/extension.ts) | Entry point. Registers both commands and the extension lifecycle. |
| [`bobRunner.ts`](extension/src/bobRunner.ts) | Spawns Bob Shell, extracts JSON from stdout, validates, saves to disk. |
| [`panel.ts`](extension/src/panel.ts) | Manages the WebviewPanel lifecycle and builds the HTML/CSS panel. |
| [`types.ts`](extension/src/types.ts) | TypeScript interfaces: `OnboardingData`, `Module`, `Relationship`. |
| [`sampleData.ts`](extension/src/sampleData.ts) | Generic fallback data shown when no real analysis exists. |

---

## Project structure

```
bob-onboarding/
├── extension/
│   ├── .vscode/
│   │   ├── launch.json        ← F5 debug configuration (extensionHost)
│   │   └── tasks.json         ← Pre-launch compile task
│   ├── src/
│   │   ├── extension.ts       ← Entry point; registers commands
│   │   ├── bobRunner.ts       ← Bob Shell execution and JSON extraction
│   │   ├── panel.ts           ← WebviewPanel and HTML/CSS generation
│   │   ├── types.ts           ← OnboardingData contract
│   │   └── sampleData.ts      ← Generic fallback data
│   ├── package.json           ← Extension manifest and dependencies
│   └── tsconfig.json          ← TypeScript compiler configuration
├── docs/
│   └── images/                ← Screenshots and visual documentation
├── bob_sessions/
│   └── .gitkeep               ← Keeps the folder in the repo (generated files are gitignored)
├── .gitignore
└── README.md
```

> `extension/node_modules/` and `extension/out/` are excluded from the
> repository (see `.gitignore`). Run `npm install` and `npm run compile` to
> regenerate them.

---

## Screenshots

### Architecture panel in the Extension Development Host

The panel running inside the Extension Development Host window after analyzing
a repository. Modules are colour-coded by type and grouped by category.

![Architecture panel](docs/images/Screenshot%202026-09-25%20232155.png)

### Bob analysis running

Bob Shell executing inside VS Code — the terminal shows `npm run compile`
completing and Bob starting the analysis. The right panel shows IBM Bob
streaming the result.

![Bob analysis running](docs/images/Screenshot%202026-09-25%20230025.png)

### Architecture flow generated by Bob

Bob presenting the full application flow diagram as part of its analysis output.

![Architecture flow](docs/images/Screenshot%202026-09-25%20230912.png)
