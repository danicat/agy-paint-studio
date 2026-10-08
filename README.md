# Paint Studio (`agy-paint-studio`)

> Interactive multi-layer drawing, Photoshop PSD editing, and Gemini AI image refinement studio for **Google Antigravity**, featuring dual view modes (`?mode=preview` inline card & `?mode=full` full studio), native session artifacts integration, and AI artistic refinement powered by `gemini-3.1-flash-lite-image` on Vertex AI.

---

## Highlights

- **Dual View Modes**:
  - **Inline Preview Card (`?mode=preview`)**: Compact generative UI card embedded directly in the Antigravity chat stream via `<agent-embed>` for quick sketching and live canvas preview.
  - **Full Studio (`?mode=full`)**: Dedicated multi-panel workspace with full toolbars, layer stack management, and history controls.
- **Photoshop (`.psd`) Compatibility**: Open and export multi-layer PSD files with full layer hierarchy, opacity, and blend modes using `ag-psd` and `sharp`.
- **Always-On Sidecar**: Supervised by Antigravity on port `7788`, configured via `sidecars/studio/sidecar.json`.
- **Complete Creative Tool Suite**:
  - **Pencil & Brush**: Fine pixel pencil and smooth variable-radius brush with opacity control.
  - **Eraser**: Pixel clearing using `destination-out`.
  - **Paint Bucket**: 4-way BFS flood fill with color tolerance.
  - **Marquee Selection**: Rectangular selection, cut, copy, paste, move, and clear pixels.
  - **Vector Shapes**: Lines, rectangles, and ellipses (stroked or filled) with live overlay preview.
  - **Text Tool**: Render text directly onto active layers.
  - **Eyedropper**: Sample composite colors directly from the canvas.
- **Full Layer Management**:
  - Add, duplicate, delete, and reorder layers.
  - Toggle visibility, adjust opacity (0–100%), and set blend modes (*Normal, Multiply, Screen, Overlay, Darken, Lighten, Color Dodge, Hard Light*, etc.).
  - Merge down and flatten image.
- **Session Artifacts Integration**: Browse, preview, open, and export drawings directly to and from the active Antigravity session brain directory (`<appDataDir>/brain/<session_id>/`).
- **Instant "Send to Chat"**: Saves the artwork as a session artifact and invokes the `agentapi` CLI to post the image into the active conversation.
- **AI Refinement (`gemini-3.1-flash-lite-image`)**:
  - **Beautify**: Cleans up, polishes, and renders sketches into high-fidelity digital illustrations.
  - **Watercolour**: Generates an expressive, organic watercolour interpretation.
  - Authenticates via Google Cloud Vertex AI Application Default Credentials (ADC).
  - Inserts generated artwork non-destructively as a new layer.

---

## Directory Structure

```text
agy-paint-studio/
├── plugin.json                        # Antigravity plugin manifest
├── package.json                       # Dependencies and build scripts
├── tsconfig.json                      # Strict TypeScript configuration
├── vite.config.ts                     # Vite bundling configuration
├── index.html                         # Studio shell HTML
├── sidecars/
│   └── studio/
│       ├── sidecar.json               # Always-on sidecar specification (PORT 7788)
│       └── run.mjs                    # Sidecar startup entrypoint
├── scripts/
│   └── bundle-studio-artifact.mjs     # Self-contained HTML artifact bundler
├── server/
│   ├── index.mjs                      # Node.js HTTP server & REST API endpoints
│   └── services/
│       └── gemini.mjs                 # Vertex AI Gemini image refinement service
├── skills/
│   └── paint-studio/
│       ├── SKILL.md                   # /paint-studio skill instructions
│       └── template.html              # Inline generative UI artifact template
├── assets/
│   ├── logo.svg                       # Vector plugin icon
│   └── studio-icon.svg                # Studio header icon
├── tests/                             # Unit and integration test suites
└── src/                               # Frontend TypeScript application
    ├── main.ts                        # App entrypoint and view mode routing
    ├── style.css                      # Styling and theme tokens
    ├── engine/                        # Canvas engine, layers, history, and tools
    ├── ui/                            # Header, toolbar, layer panel, and modals
    └── utils/                         # PSD serialization and runtime API helpers
```

---

## Installation

### 1. Install as an Antigravity Plugin

Clone or symlink this repository into your Antigravity plugins directory:

```bash
ln -s /path/to/agy-paint-studio ~/.gemini/config/plugins/agy-paint-studio
```

Install dependencies and build the studio bundle:

```bash
cd /path/to/agy-paint-studio
npm install
npm run build
```

### 2. Sidecar Configuration

The sidecar server runs on `127.0.0.1:7788` by default, configured via `sidecars/studio/sidecar.json`:

```json
{
  "command": "node",
  "args": ["run.mjs"],
  "restart_policy": "always",
  "display_name": "Paint Studio",
  "description": "Interactive multi-layer drawing, PSD editing, and Gemini AI image refinement studio sidecar for Antigravity.",
  "env": {
    "PORT": "7788",
    "MODEL": "gemini-3.1-flash-lite-image"
  }
}
```

### 3. Vertex AI Setup (Application Default Credentials)

To enable **Beautify** and **Watercolour** AI image refinement using `gemini-3.1-flash-lite-image`:

1. Authenticate with Google Cloud Application Default Credentials (ADC):
   ```bash
   gcloud auth application-default login
   ```
2. Set your Google Cloud Project ID in your environment:
   ```bash
   export GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
   export GOOGLE_CLOUD_LOCATION="global"
   ```

---

## Usage

### In Antigravity Chat (`/paint-studio`)

Invoke `/paint-studio` in the chat or ask the agent to draw, sketch, paint, or edit an image:

> *"Open `/paint-studio` so I can sketch a diagram"*
> *"Edit the PSD file in my session artifacts"*

The agent runs the `paint-studio` skill, fetches the session template from `http://127.0.0.1:7788/api/template?session_id=<SESSION_ID>`, and embeds `<agent-embed>` in the conversation. From the inline preview card (`?mode=preview`), you can sketch immediately or open the full studio (`?mode=full`).

### Standalone Development

Start the sidecar server directly on port `7788`:

```bash
npm start
```

- **Inline Preview Mode**: `http://127.0.0.1:7788/?session_id=<session-id>&mode=preview`
- **Full Studio Mode**: `http://127.0.0.1:7788/?session_id=<session-id>&mode=full`

Run the Vite development server:

```bash
npm run dev
```

Run typechecking and unit tests:

```bash
npm run typecheck
npm test
```

---

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.

---

## Disclaimer

This is not an officially supported Google product.
