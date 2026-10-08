# AGENTS.md

Guidance for coding agents in this repository. `DEVELOPMENT.md` is the full
developer guide; this file holds what an agent needs first.

## Commands

Node.js 24.21 (`.node-version`) and the Yarn 3 release in `.yarn/` (any global
`yarn` starts it). Electron 44 downloads its binary on first use
(`node -e 'require("electron")'`).

| Task | Command |
| --- | --- |
| Install | `yarn install --immutable` |
| Build everything (development) | `yarn build-dev` |
| Build only the UI / only Electron | `yarn build-angular-dev` / `yarn build-electron-dev` |
| Start the desktop app | `yarn start` (profile `.dev-profiles/dev`) |
| Start the browser client | `yarn build-angular-dev && yarn browser` |
| Unit tests (renderer backup, profiles) | `yarn test` |
| Storage service tests | `yarn test-storage` |
| Storage service type check | `yarn workspace kc_storage typecheck` |
| Desktop end-to-end tests | `yarn build-dev && yarn e2e` |
| Browser end-to-end tests (Chrome) | `yarn build-angular-dev && yarn e2e-browser` |
| Packaged app test | `yarn package-local && yarn e2e-packaged` |
| Format changed files | `yarn prettier --write <files>` |

Run one test file with `node --test e2e/inbox.e2e.mjs` (or
`src/kc_storage/test/inbox.test.ts`). Select one test with
`--test-name-pattern="<part of the name>"`. End-to-end tests must run one
at a time (`--test-concurrency=1`).

The end-to-end tests drive the built output. Build again after a source
change, or the tests run old code.

## Architecture

Three Yarn workspaces and two shared folders:

| Part | Owns |
| --- | --- |
| `src/kc_storage` | The storage service: projects, sources, the inbox, managed files, preferences, validation, SQLite persistence (`node:sqlite`), backup and restore, browser sessions, and serving the built UI. Plain Node.js 24 with type stripping; no build step. |
| `src/kc_angular` | The UI (Angular 14, PrimeNG 14). Runs in Electron and in a normal browser. |
| `src/kc_electron` | The desktop shell: windows, file access by path, watched folders, embedded browser (`WebContentsView`), thumbnails, Save as PDF, and the local chat server (`src/local`). Starts and stops the storage service. |
| `src/kc_contracts` | Storage API types and record mapping. Imports nothing from the apps. |
| `src/kc_shared` | Shared models and default settings. No Angular or Electron imports. |

Key paths through the code:

- **One library API for both clients.** The UI writes every change through
  `StorageService` (`kc_angular/.../services/ipc-services/storage.service.ts`)
  to the storage service. Writes are idempotent PUT or DELETE by client
  ID, run in order, and wait in the queue while the connection is not
  active. Uploads go to `POST /v1/assets`, and sources refer to the
  returned asset ID.
- **The inbox is sources with `projectId: null`.** A transfer to a project
  is one PUT that sets the project ID. Library backups (format version 2)
  include the inbox.
- **Platform capability interfaces** in `kc_angular/src/app/platform/`
  (`Platform`, `SettingsStore`, `WindowControls`, `NativeFiles`,
  `ManagedFiles`, `WebsitePdf`) and `BackendService` have a desktop and a
  browser implementation each. `app.module.ts` selects them once with
  `isDesktop()` (the Electron preload bridge exists). New desktop-only
  behavior goes behind one of these interfaces or `Platform.has()`, with a
  clear unavailable state in the browser. `ElectronIpcService` is the
  remaining direct desktop adapter.
- **Desktop authorization:** the storage service gets a random bearer token
  per app instance; Electron gives it to the renderer through IPC.
- **Browser authorization:** `yarn browser` prints a one-time launch link.
  The page exchanges the code for an `HttpOnly` session cookie, and writes
  need a CSRF header and the service's own Origin. `BackendService` tracks
  the connection state; the session dialog blocks the app while the
  session is not active.
- **Per-instance servers:** each app instance starts its own chat server
  and storage service on ephemeral loopback ports.

## Rules

- Never use or change the user's normal application data. Use
  `KC_PROFILE_DIR=<scratch dir>` for desktop runs and a scratch
  `--data-dir` for the storage service and `yarn browser`. Tests create
  their own folders under `e2e/.output/`.
- Automated tests must not take over the user's screen or focus. Desktop
  tests run the Electron window invisible and inactive
  (`KC_HIDDEN_WINDOW=1`, set by `e2e/lib.mjs`; `KC_E2E_SHOW=1` shows it).
  Chrome tests run headless.
- Render or capture the UI only where a permanent test needs it. Remove
  temporary checks that an agent adds for its own observation (screenshots
  to look at, probe scripts, debug logging) before the work is finished.
- Do not commit `KNOWLEDGE_REIMAGINED_PLAN.md` or
  `Resources/tiktoken_bg.wasm`; they are the user's untracked files.
- Do not push, publish, merge, or sign releases unless asked.
- Reports and documentation use ASD-STE100 Simplified Technical English.
- Open follow-up work is in `docs/follow-ups.md`; milestone records are in
  `docs/`.
