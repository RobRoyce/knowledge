# Follow-up Work

Work found during the recovery, storage, desktop, browser, and Electron
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
| Keep Electron supported | Electron 44 support ends 2027-03-02. Move to the next supported major before then. |
| `punycode` deprecation warning | Comes from a bundled third-party package in the main process (probably the OpenAI SDK's older HTTP stack). |
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

## Recommendations for the next milestones

### 1. Upgrade Angular, TypeScript, and UI libraries

| Item | Now | Target | Notes |
| --- | --- | --- | --- |
| Angular (core, CLI, CDK, youtube-player) | 14.2 | 22.x (supported: 20, 21, 22) | Use `ng update` one major at a time (14 → 15 → … → 22). Run the builds and all end-to-end tests after each step. |
| TypeScript | 4.8 | 6.0 for Angular 22 (5.9 for 21) | The storage service already uses TypeScript 5.9 separately. |
| Node.js | 24.21 | 24.21 | Angular 22 supports `^24.15.0`. No change. |
| RxJS | 7.5 / 7.8 | 7.x | Compatible with all targets. |
| PrimeNG, PrimeFlex, PrimeIcons | 14 | Version that matches the Angular major | PrimeNG 17 and later change theming (styled mode and `@primeng/themes`). The theme files in `src/styles/themes` will need replacement. Highest effort. |
| FullCalendar Angular | 5 | 6 | API and CSS import changes. |
| chart.js, marked, cytoscape | 3, 4, 3 | Current | Independent of Angular. Upgrade after Angular. |
| `@angular-eslint`, `@typescript-eslint` | 14, 5 | Matching versions | Lint only. |

Affected areas: every component template that uses PrimeNG, the theme
service, the build configuration (`angular.json` moves to the application
builder), and `tsconfig.json`. The capability interfaces in `platform/` and
the browser and desktop tests protect the library workflow during the work.

### 2. Remove additional dependencies

- `axios` in the chat server: Node.js 24 has `fetch`.
- `openai` 4.25: update or replace; it is the likely source of the
  `punycode` warning.
- `electron-notarize`: replace with `@electron/notarize` when signing is in
  scope.
- Root `@angular/cli` and `@angular-devkit/architect`: remove during the
  Angular upgrade (the Angular workspace has its own).
- `chokidar`, `cors`, `express`, `express-rate-limit`, `rxjs` in
  `kc_electron`: reduce when chat moves to the backend.

### 3. Move chat and extraction into the backend

- Move `kc_electron/src/local` (chat routes, controllers, tokenizer, OpenAI
  calls, `SourceParser`, `SourceLoader`) into `kc_storage` behind the same
  token and session checks.
- Keep the API key in the library data directory, not in the profile
  `data/` folder. Do not include it in backups.
- Move website fetching and metadata extraction to the backend. Then the
  browser client can save websites. Apply an allow-list and size and time
  limits to outgoing requests (server-side request forgery risk).
- Move the extracted-text cache from `data/storage/sources/` into the
  library. This is also the base for full-text search later.
- Affected: `ChatService`, `ExtractorService`, `KsFactoryService` (website
  path), `BackendService` (chat endpoint), the Electron chat server, and the
  `tiktoken` resource.

### 4. Move durable user data out of renderer storage

| Data | Now | Target |
| --- | --- | --- |
| Chat history (`chat-<id>`) | Renderer local storage | Library (with chat) |
| Inbox (`ingest-queue`) | Renderer local storage | Library: inbox sources without a project |
| Topics list, favicon cache | Renderer local storage | Library, or derive again |
| Settings | Electron file (desktop), local storage (browser) | Library settings for user data; platform settings stay local |
| UI preferences (table, theme) | Renderer local storage | Can stay local |

After this, one library backup can hold all user data.

### 5. Separate local deployment from future hosted deployment

- Keep two modes with separate entry points. Local: loopback, bearer
  token, launch-link sessions, one OS user (current). Hosted: accounts,
  TLS, `Secure` cookies, server-side authorization per library, rate
  limits, and audit logs.
- Do not reuse the local launch-link session as hosted authentication.
- Make the storage layer support more than one library per service before
  hosting.
- Managed files need an object-storage option for hosting. The `AssetStore`
  interface is the place to add it.
- Website fetching in a hosted service needs strict outgoing-request
  controls.

