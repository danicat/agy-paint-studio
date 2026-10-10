# Paint Studio (`agy-paint-studio`)

Paint Studio is a drawing and image editing plugin for Google Antigravity. Use it to sketch diagrams, annotate screenshots, edit multi-layer Photoshop (`.psd`) files, and refine drawings with Gemini directly from your chat session.

![Inline preview window in Antigravity chat](assets/screenshot-preview.png)

## Quickstart

### 1. Install the plugin

Link the repository into your Antigravity plugins directory and build the bundle:

```bash
ln -s /path/to/agy-paint-studio ~/.gemini/config/plugins/agy-paint-studio
cd /path/to/agy-paint-studio
npm install
npm run build
```

### 2. Enable AI refinement (optional)

AI refinement uses Google Cloud Application Default Credentials (ADC):

```bash
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
export GOOGLE_CLOUD_LOCATION="global"
```

### 3. Open the canvas in chat

Type `/paint-studio` in an Antigravity conversation, or ask the agent to open the canvas:

```text
/paint-studio
```

Draw on the inline canvas and click **Send** to post the image back into the chat.

---

## Preview mode and full mode

Paint Studio runs in two views backed by a local server on port `7777`:

- **Preview mode** (`?mode=preview`): A compact canvas embedded directly in the chat message stream for quick sketches, annotations, and AI edits.
- **Full mode** (`?mode=full`): A full browser workspace with menu bars and a layer panel for managing multiple layers, blend modes, and opacity. Click **Full Mode** in the preview header to open it in your browser.

![Full mode workspace in browser](assets/screenshot-full.png)

---

## Workflows and shortcuts

### Saving, exporting, and sending

| Action | Description |
| :--- | :--- |
| **Send** | Saves the current canvas as a PNG in the session folder and posts it to the active chat. |
| **Save (`⌘S`)** | Saves a layered `.psd` file to your local filesystem (`Downloads`, `Desktop`, `Workspace`, `Session`, or custom path). |
| **Export (`⇧⌘E`)** | Exports a flattened `PNG`, `JPEG`, or `WebP` image to your local filesystem. |
| **Open File (`⌘O`)** | Opens a local image (`PNG`, `JPEG`, `WebP`) or layered `.psd` file from disk. |
| **Open Artifact** | Browses images and `.psd` files from the active Antigravity session to open as a canvas or insert as a new layer. |

### AI refinement

The bottom bar refines your drawing and adds the result as a new layer:

- **Presets**: Click **Auto**, **Sketch**, **UI**, **Diagram**, **Icon**, or **Realistic** to restyle the current canvas.
- **Custom prompt**: Type instructions in the prompt box and press `Enter` or click **Refine**.

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
| `G` | Paint bucket fill |
| `I` | Eyedropper |
| `H` / `Space` | Pan canvas (scroll to zoom) |
| `X` | Swap foreground and background colors |
| `[` / `]` | Decrease / increase tool size |
| `⌘Z` / `⇧⌘Z` | Undo / Redo |
| `⌫` | Clear active selection or layer |

---

## Development

Start the local server on `http://127.0.0.1:7777`:

```bash
npm start
```

Run the Vite development server, typechecker, and test suite:

```bash
npm run dev
npm run typecheck
npm test
```

### Project layout

```text
agy-paint-studio/
├── plugin.json                        # Plugin manifest
├── sidecars/studio/                   # Sidecar configuration (port 7777)
├── skills/paint-studio/               # /paint-studio skill and HTML template
├── server/                            # Local HTTP server and Gemini service
├── src/                               # Canvas engine and UI components
├── assets/                            # Icons and documentation screenshots
└── tests/                             # Unit and server integration tests
```

---

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.
