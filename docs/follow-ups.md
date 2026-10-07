# Follow-up Work

Work found during the recovery, storage, and desktop completion
milestones. Not started.

## Storage service

| Item | Reason |
| --- | --- |
| Orphan asset cleanup policy | Deleting a source keeps its managed file. Files are uploaded when selected, so a file removed from the inbox also leaves a managed file. Only files without records after a rollback, crash, or failed restore are removed. |
| Restore into a library that has records (merge or replace) | Restore refuses a non-empty library now. |
| Move the extracted-text cache into the service | The chat server keeps it in `data/storage/sources/`, outside the library. |
| Thumbnails in the service | Electron makes thumbnails from a local copy of the managed file. |
| Move favicon cache, inbox, and chat history out of local storage | They stay in the renderer for this milestone. |
| Stronger local access control | The token stops requests without it. Programs that run as the same OS user can read it. |

## Packaging and release

| Item | Reason |
| --- | --- |
| Signing and notarization | Not verified. Signing must include the bundled `node` binary. V8 may need the `allow-jit` entitlement under the hardened runtime. |
| macOS x64 package | A pinned runtime hash exists. The build is not tested. |
| Linux and Windows packages | No runtime configuration. Not tested. |
| Smaller package | The bundled Node.js adds about 120 MB. |
| Stop electron-builder rebuilding `canvas` | The app does not use `canvas`. The rebuild works now but is not needed. |

## Desktop app

| Item | Reason |
| --- | --- |
| Upgrade Electron (26 is end-of-life) | Replace `File.path` with `webUtils.getPathForFile` (removed in Electron 32). |
| Upgrade Angular 14 and TypeScript 4.8 | Node.js 24 is outside Angular 14's supported range. |
| Bind the browser extension server to loopback with a token | It listens on port 9000 on all interfaces when enabled. |
| Replace the fixed API key passphrase | The key file is obfuscated, not encrypted. |
| Root `postinstall` key is outside `scripts` | It never runs. Remove it or move it. |
| Fresh-profile route error (`inbox/undefined`) | Cosmetic error in the log on first start. |
| Desktop PDF viewer title shows the blob ID | The desktop shows managed PDFs from a `blob:` URL. The browser client shows the filename. |
| Select a project after a library restore | After restore, no project is selected. The user selects one in the tree. |

## Browser client

| Item | Reason |
| --- | --- |
| Save websites in the browser | Needs website fetching and extraction in the backend. |
| Chat in the browser | Needs the chat server in the backend. |
| Browser settings and inbox | Kept in browser local storage, separate from the desktop. |
| Other browsers | Only Google Chrome is tested. |

## Features (separate tasks)

- Full-text search over extracted text.
- Notes editor for the existing `notes` field.
- Verification of AI chat with a real API key.
