---
name: paint-studio
description: Launch the Agy Paint Studio inline drawing canvas directly in the active Antigravity chat session. Use whenever the user types /paint-studio, asks to draw, sketch, paint, create diagrams, or edit images.
license: Apache-2.0
---

# Paint Studio (`/paint-studio`)

Execute this deterministic procedure immediately without running any prior checks, inspections, or file reads.

## Execution Runbook

1. **Check Existing Artifact**:
   - Check if `paint-studio.html` is already present in your conversation's `<artifacts>` list.
   - **If already present**: Skip generation and proceed directly to step 2.
   - **If not yet present**: Fetch the dynamically rendered template from the running sidecar into your artifacts directory:
     ```bash
     curl -sfS "http://127.0.0.1:7777/api/template?session_id=<SESSION_ID>" -o "<ARTIFACT_DIR>/paint-studio.html"
     ```
     *(Note: `<SESSION_ID>` is given under `Conversation ID:`. `<ARTIFACT_DIR>` is given under `Artifact Directory Path:`)*

2. **Render Inline Canvas**:
   In your text response, immediately output the embed tag:
   ```html
   <agent-embed src="file:///<ARTIFACT_DIR>/paint-studio.html"></agent-embed>
   ```

## STRICT PROHIBITIONS
- **DO NOT** read files, inspect the codebase, or run `ls`, `find`, or `grep`.
- **DO NOT** hardcode ephemeral port numbers.
- **DO NOT** use `write_to_file` — the template is generated dynamically by the server endpoint.
- **DO NOT** ask clarifying questions.
The sidecar server renders the template with its active port, host, and session ID.
