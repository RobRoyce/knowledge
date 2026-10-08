# Follow-up Work

Work found during the recovery and storage milestones. Not started.

## Storage service

| Item | Reason |
| --- | --- |
| Package the service with a Node.js 24 runtime | Packaged builds cannot start the service now. |
| Restore a library from the UI | Restore needs the command line now. |
| Orphan asset cleanup policy | Deleting a source keeps its managed file. Only unreferenced files after a rollback or crash are removed. |
| Move the extracted-text cache into the service | The chat server keeps it in `data/storage/sources/`, outside the library. |
| Thumbnails in the service | Electron makes thumbnails from a local copy of the managed file. |
| Move favicon cache, inbox, and chat history out of local storage | They stay in the renderer for this milestone. |
| Remove `kc_shared` dependency on Angular models | `kc_shared/models/project.model.ts` imports an Angular model. Electron needs the `@shared` alias because of it. |

## Desktop app

| Item | Reason |
| --- | --- |
| Upgrade Electron (26 is end-of-life) | Replace `File.path` with `webUtils.getPathForFile` (removed in Electron 32). |
| Upgrade Angular 14 and TypeScript 4.8 | Node.js 24 is outside Angular 14's supported range. |
| Bind the browser extension server to loopback with a token | It listens on port 9000 on all interfaces when enabled. |
| Replace the fixed API key passphrase | The key file is obfuscated, not encrypted. |
| Root `postinstall` key is outside `scripts` | It never runs. Remove it or move it. |
| Fresh-profile route error (`inbox/undefined`) | Cosmetic error in the log on first start. |
| PDF viewer title shows the blob ID | Managed PDFs open from a `blob:` URL. |

## Features (separate tasks)

- Full-text search over extracted text.
- Notes editor for the existing `notes` field.
- Verification of AI chat with a real API key.
- Signed and notarized release builds.
