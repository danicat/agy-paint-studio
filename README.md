# Paint Studio (`agy-paint-studio`)

Paint Studio is a multi-layer drawing, `.psd` editing, and Gemini image refinement UI extension for [Google Antigravity](https://antigravity.google) that runs in the side pane, inline in chat, and as a native viewer for `.psd` and raster image files.

![Paint Studio running in the Antigravity side pane](assets/screenshot-preview.png)

## Quickstart

### 1. Install the UI extension plugin

Clone or link the repository into your Antigravity plugins directory (`~/.gemini/config/plugins/` on macOS and Linux, or `%USERPROFILE%\.gemini\config\plugins\` on Windows) and build the frontend bundle:

```bash
git clone https://github.com/danicat/agy-paint-studio.git ~/.gemini/config/plugins/agy-paint-studio
cd ~/.gemini/config/plugins/agy-paint-studio
npm install
npm run build
```

If you already cloned the repository elsewhere, symlink it instead:

```bash
ln -s /path/to/agy-paint-studio ~/.gemini/config/plugins/agy-paint-studio
```

### 2. Enable the plugin in Antigravity

1. Restart Antigravity if this is a newly created plugin directory.
2. Open **Customizations** in the left sidebar and select the **Installed** tab.
3. Find **Paint Studio** (`agy-paint-studio`) and enable it. Antigravity starts and supervises the `studio` sidecar process automatically.

### 3. Open Paint Studio

Use any of the three entrypoints inside a conversation:

- **Side pane**: Click the **⋮** (three-dot) menu in the top-right corner of any conversation and select **Extensions → Paint Studio**.
- **File viewer**: Click any `.psd`, `.png`, `.jpg`, `.jpeg`, or `.webp` file in chat or the file explorer to open it directly in Paint Studio.
- **Slash command**: Type `/paint-studio` in chat to render both an inline `<agent-embed>` canvas and a clickable `[Paint Studio](sidecar://agy-paint-studio/studio/)` side-pane pill.

Draw on the canvas and click **Send** to save the composite PNG and layered `.psd` to the active conversation and post the image into chat.

### 4. Configure Gemini image refinement (optional)

AI refinement uses Vertex AI with Google Cloud Application Default Credentials (ADC):

```bash
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
export GOOGLE_CLOUD_LOCATION="global"
```

---

## Usage and workflows

### Four ways to use Paint Studio

A single background `SidecarApp` server powers four views:

| View | Entrypoint | Best for |
| :--- | :--- | :--- |
| **Side-pane UI extension** | **⋮ → Extensions → Paint Studio** or `[Paint Studio](sidecar://agy-paint-studio/studio/)` | Persistent workspace next to your conversation. Expands to full mode automatically when widened (`>= 760px`) or maximized. |
| **Custom `.psd` & image viewer** | Click any `.psd`, `.png`, `.jpg`, `.jpeg`, or `.webp` file (`file_extensions` in `sidecar.json`) | Inspecting and editing multi-layer `.psd` files or annotating screenshots in place. |
| **Inline chat canvas** | `/paint-studio` (`<agent-embed>`) | Quick 480px sketches and visual prompts directly inside the chat stream. |
| **Full browser workspace** | Click **Full Mode** in the studio header (`?mode=full`) | Multi-layer `.psd` editing in a dedicated browser window with full menu bar and layer controls. |

![Paint Studio in full workspace mode](assets/screenshot-full.png)

### File, artifact, and chat actions

| Action | Shortcut | Behaviour |
| :--- | :--- | :--- |
| **Send** | — | Saves the flattened `PNG` and layered `.psd` into `<appDataDir>/brain/<conversation-id>/` and calls `window.sidecar.agent.sendMessage()`. |
| **Save Project** | `⌘S` | Saves a multi-layer `.psd` file to `Downloads`, `Desktop`, `Workspace`, `Session`, or a custom path. |
| **Export Image** | `⇧⌘E` | Exports a flattened `PNG`, `JPEG`, or `WebP` file to disk or triggers a browser download. |
| **Open Local File** | `⌘O` | Imports a local `.psd`, `PNG`, `JPEG`, or `WebP` file from disk as a canvas or new layer. |
| **Open Session Artifact** | — | Browses images and `.psd` files from the active Antigravity session to open or insert as a layer. |

### AI refinement presets

The bottom refinement bar sends the current composite canvas to `gemini-3.1-flash-lite-image` and inserts the generated output as a new non-destructive layer above your sketch:

| Preset | Behaviour |
| :--- | :--- |
| **Beautify** | Interprets rough sketches and stick figures into a polished, high-resolution illustration. |
| **Notes** | Reads handwritten or typed redlines, arrows, and callout annotations, applies the requested edits, and removes the markup. |
| **Watercolor** | Transforms the sketch into a wet-on-wet watercolour painting on cold-press textured paper. |
| **Concept Art** | Renders cinematic digital concept art with dramatic lighting and atmospheric depth. |
| **Vector** | Produces flat vector artwork with crisp geometric edges and solid colour fills. |
| **Pixel Art** | Converts the drawing into 16-bit sprite pixel art with a constrained palette. |
| **3D Clay** | Renders a studio-lit 3D clay miniature with soft subsurface scattering. |
| **Anime** | Produces cel-shaded anime illustration with expressive linework. |

Type custom instructions in the prompt field and press `Enter` or click **Refine** to combine any preset with a specific prompt.

### Keyboard shortcuts

| Key | Tool / Action |
| :--- | :--- |
| `V` | Select, move, cut, copy, or paste |
| `B` | Smooth brush |
| `P` | Pixel pencil |
| `E` | Eraser |
| `U` / `O` | Rectangle / Ellipse |
| `L` / `A` | Line / Arrow |
| `T` | Text |
| `G` | Paint bucket (scanline flood fill) |
| `I` | Eyedropper |
| `H` / `Space` | Pan canvas (scroll to zoom) |
| `X` | Swap foreground and background colours |
| `[` / `]` | Decrease / increase tool size |
| `⌘Z` / `⇧⌘Z` | Undo / Redo |
| `⌘0` / `⌘9` | Zoom 100% / Fit canvas to viewport |
| `⌫` | Clear active selection or layer |

---

## Development and testing

Build the frontend bundle, run TypeScript typechecking, and run the integration test suite:

```bash
npm run build
npm run typecheck
npm test
```

### Debugging the sidecar

Antigravity writes sidecar `stdout` and `stderr` to:

```text
~/.gemini/antigravity/sidecar_data/agy-paint-studio/studio/logs/sidecar.log
```

- **Frontend changes** (`src/`): Run `npm run build`, then close and reopen the Paint Studio panel. The backend re-reads `dist/index.html`, `dist/app.js`, and `dist/styles.css` from disk on each request with `Cache-Control: no-store`.
- **Backend changes** (`server/` or `sidecars/studio/`): Toggle **Paint Studio** off and back on in **Customizations → Installed** (or touch `sidecars/studio/sidecar.json`) to restart the sidecar process.

---

## Architecture and internals

```text
agy-paint-studio/
├── plugin.json                        # Plugin identity, display name, version, and logo
├── assets/
│   └── logo.svg                       # Square SVG icon shown in Customizations and .psd file tabs
├── sidecars/
│   └── studio/
│       ├── sidecar.json               # Sidecar process config, AUX_PANE entrypoint, and file_extensions
│       ├── package.json               # Marks the sidecar directory as an ES module
│       └── run.mjs                    # Sidecar entrypoint
├── skills/
│   └── paint-studio/
│       └── SKILL.md                   # /paint-studio runbook for inline + side-pane launch
├── server/
│   ├── index.mjs                      # SidecarApp routes, session/filesystem I/O, and /api/template
│   └── services/
│       └── gemini.mjs                 # Vertex AI image refinement service
├── src/                               # TypeScript canvas engine, PSD parser, and UI components
└── tests/                             # Node test runner suites (flood fill, PSD, Gemini, HTTP endpoints)
```

### Sidecar API routes

| Route | Method | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `/`, `/app.js`, `/styles.css` | `GET` | Open | Serves the classic IIFE frontend bundle to the `plugin://` iframe. |
| `/preload.js` | `GET` | Open | Injected by `SidecarApp`; exposes `window.sidecar` and syncs host theme tokens. |
| `/api/health` | `GET` | Open | Returns `{ status: "ok", port }` for health checks. |
| `/api/template` | `GET` | Open | Generates a self-contained HTML artifact for `<agent-embed>` inline chat mode. |
| `/api/fs/open` | `GET` | Open | Streams `.psd` or image files from allowed user/workspace roots when opened via `?file=`. |
| `/api/fs/info` | `GET` | Open | Resolves default save directories (`Downloads`, `Desktop`, `Workspace`, `Session`). |
| `/api/fs/save` | `POST` | `X-Sidecar-Token` | Saves `.psd`, `PNG`, `JPEG`, or `WebP` files to allowed local directories. |
| `/api/artifact` | `GET` / `POST` | `X-Sidecar-Token` (`POST`) | Reads or writes session artifacts inside `<appDataDir>/brain/<session-id>/`. |
| `/api/ai/refine` | `POST` | `X-Sidecar-Token` | Refines the composite canvas with `gemini-3.1-flash-lite-image`. |

---

## License and compliance

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.

This is not an officially supported Google product.
