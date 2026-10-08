# Browser Library Workflow (Milestone 3)

## Purpose

Run one complete library workflow of the existing Angular interface in a
normal browser, without Electron. Keep the desktop app working.

Workflow: create a project, upload files, show sources, annotate, search,
restart, open managed files, export and restore the library.

Not in this milestone: website extraction in the browser, chat in the
browser, hosted deployment, accounts.

## Startup dependencies found

The Angular app could not start in a browser. These dependencies run at
startup, before any user action:

| Dependency | Where | Problem in a browser |
| --- | --- | --- |
| Settings from Electron (`A2E:Settings:*`) | `SettingsService`, used by most services | `window.api` is undefined. No settings, no theme, no search options. |
| Field initializers `window.api.send` | `SettingsService`, `AutoscanService`, `ExtensionService`, `ElectronIpcService`, display settings | Throw when the service is created. |
| UUIDs from Electron (`A2E:Uuid:Generate`) | `UuidService` (projects, sources) | No IDs. |
| Server addresses and tokens (`A2E:Backend:Info`) | `BackendService` | No API address. |
| App version (`A2E:Version:Get`) | `StartupService` | Throws. |
| Window controls | `AppComponent` | Throws on click. |
| `kc_shared` imports an Angular model | `kc_shared/models/project.model.ts` | Shared code depends on the frontend. |

Workflow dependencies:

| Step | Desktop dependency |
| --- | --- |
| Select and import a file | `File.path`; copy by path through Electron (`A2E:Storage:ImportFile`) |
| File icon and thumbnail | `A2E:FileSystem:FileIcon`, `A2E:FileSystem:FileThumbnail` |
| Show a managed file | Fetch with bearer token, then `blob:` URL (filename lost) |
| Open a managed file | `A2E:Storage:OpenAsset` (default app) |
| Save a website | Renderer fetches other sites (needs Electron) |
| Chat | Electron chat server |

## Responsibilities

| Part | Owns |
| --- | --- |
| Frontend (`kc_angular`) | Navigation, presentation, user input and editing, temporary UI state, calls to the application API. Uses only the capability interfaces below. |
| Backend (`kc_storage`) | Projects, sources, managed files, validation, persistence, backup and restore, browser sessions, serving the browser UI files. Same API for all clients. |
| Electron (`kc_electron`) | Windows and menus, native file selection and file access by path, watched folders (autoscan), desktop capture, native shortcuts and drag-out, embedded browsing, thumbnails and file icons, local backend start and stop. |
| Contracts (`kc_contracts`, `kc_shared`) | Data types, record mapping, default settings. No Angular or Electron imports. |
| Chat and extraction | Stay in the Electron chat server for now. See "Next extraction steps". |

## Capability interfaces (frontend)

Small interfaces. Each has a desktop and a browser implementation. The
platform is chosen once at startup: desktop if the preload bridge exists.

| Interface | Purpose | Desktop | Browser |
| --- | --- | --- | --- |
| `Platform` | Which optional features exist | All features | Library features only |
| `BackendConnection` | Address and request authorization for the library API (and chat) | IPC info, bearer token | Same origin, session cookie, CSRF header |
| `SettingsStore` | Load, save, and default settings | Electron settings file (IPC) | `localStorage`, shared defaults |
| `WindowControls` | Minimize, maximize, zoom | IPC | Not available (controls hidden) |
| `NativeFiles` | Original path of a selected file, copy a file by path, open in default app, show in folder | IPC | Not available |
| `ManagedFiles` | URL to show or open a managed file | `blob:` URL from an authorized fetch | Direct same-origin URL with the filename |

Other changes:

- IDs: `crypto.randomUUID()` on both platforms. No IPC.
- File import on both platforms: the user selects a `File`. The frontend
  uploads its bytes with `POST /v1/assets` and stores the returned asset
  ID in the source. The desktop also sends the original path as metadata.
  Path-based copy stays in Electron for watched folders only.
- `ElectronIpcService` stays the desktop adapter for embedded browsing and
  other desktop features. In a browser it is inert and not called.
- Desktop-only actions are hidden or disabled in the browser, with an
  explanation: save website, chat, embedded browser, import and watched
  folder settings, window controls, open in default app, show in folder,
  drag-out, file thumbnails.

## Browser session

The service serves the built Angular files and the API from one origin,
`http://127.0.0.1:<port>`. The frontend uses its own origin as the API
address. So the page always talks to the service instance that served it.

| Question | Answer |
| --- | --- |
| How does the user open a session? | `yarn browser` starts the service with a random bearer token that it never prints. It asks the service for a launch code and prints `http://127.0.0.1:<port>/#launch=<code>`. The page reads the code from the URL fragment (not sent to servers, not in server logs), removes it from the address bar, and exchanges it with `POST /v1/session`. |
| What is the launch code? | 256 random bits. Single use. Expires 5 minutes after creation. Only a bearer-token client can create one (`POST /v1/session/launch`). |
| How are requests authenticated? | Cookie `kc_session` (256 random bits, `HttpOnly`, `SameSite=Strict`, `Path=/`). The service keeps sessions in memory. Desktop clients keep using the bearer token. |
| How are state-changing requests protected? | For cookie sessions, `POST`, `PUT`, and `DELETE` need all of: header `X-Knowledge-CSRF` equal to the session's CSRF token, and `Origin` equal to the service origin. Any cookie request with `Sec-Fetch-Site: cross-site` is refused. `SameSite=Strict` stops the browser from sending the cookie from other sites. The CSRF token lives only in page memory. After a reload, `GET /v1/session` returns it. |
| How does a session end? | 30 minutes without requests, 12 hours after creation, `DELETE /v1/session`, or a service restart (sessions are in memory). |
| What stays outside URLs, storage, and logs? | The bearer token. The session ID is only in an `HttpOnly` cookie. The launch code is in the terminal output and in the first URL only; it is single use and short-lived. |
| Other checks | `Host` must be `127.0.0.1:<port>` or `localhost:<port>` (DNS rebinding). The service listens on `127.0.0.1` only. CORS allows only the desktop origin `null`. CORS and loopback are not authentication. |

Trust boundary: the operating-system user. Programs that run as the same
user can read process environments, the profile files, and the terminal
output. This design does not protect against them, and it is not a design
for a hosted service.

## Managed file display

- The service serves `GET /v1/assets/<id>/content/<filename>`. The last part
  sets the name that the browser PDF viewer and downloads show.
- Inline only for PDF, plain text, and raster images. Text is served as
  `text/plain`. All other types are downloads (`Content-Disposition:
  attachment`). Every response has `X-Content-Type-Options: nosniff` and a
  sandbox `Content-Security-Policy`, except PDF. So imported files cannot
  run scripts with the application's origin.
- The browser shows PDFs with its own viewer.

## Tests

- Service: sessions (launch code single use and expiry, cookie flags, CSRF
  header, Origin, cross-site fetch metadata, idle and absolute expiry,
  logout), bearer clients unchanged, UI file serving, content headers.
- Browser (Chrome through `playwright-core`, no Electron): the workflow
  above, restart and reopen, unauthorized requests.
- Existing service, desktop, and packaged tests.

## Next extraction steps (not in this milestone)

- Chat: move the chat routes and OpenAI calls from the Electron chat server
  into the backend. Keep the API key in the backend data directory.
- Extraction: move website fetching and PDF text extraction into the
  backend, so the browser can save websites.

## Verified (2026-10-07, macOS 26.6 arm64, Google Chrome 154)

| Command | Result |
| --- | --- |
| `yarn build-dev` | Pass |
| `yarn test` | 8 of 8 pass |
| `yarn test-storage` | 28 of 28 pass (6 new session and UI-serving tests) |
| `yarn workspace kc_storage typecheck` | Pass |
| `yarn e2e` | 2 of 2 pass (desktop) |
| `yarn e2e-browser` | 1 of 1 pass (Chrome, no Electron) |
| `yarn package-local`, `yarn e2e-packaged` | Pass |

Not verified: Safari, Firefox, and Chrome on other systems.
