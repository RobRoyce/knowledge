# Local Development

This guide tells you how to build and start Knowledge on your computer.
You do not need AWS, an Apple developer account, or an AI API key.

## Toolchain

| Tool | Version | Notes |
| --- | --- | --- |
| macOS | 26.6 (arm64) | Verified. Linux and Windows are not verified. |
| Node.js | 24.21.0 | Verified. Development builds, tests, and the unpackaged app use it. |
| Yarn | 3.2.4 | The repository contains this version (`.yarnrc.yml` `yarnPath`). Any global `yarn` starts it. |
| Electron | 44.6.0 | Supported until 2027-03-02. The binary downloads on first use (see Setup). |

No native compiler is necessary. The install does not build `canvas`.

The storage service (`src/kc_storage`) needs Node.js 24 or later. It uses
the built-in `node:sqlite` module.

| Run | Node.js for the storage service |
| --- | --- |
| Unpackaged (`yarn start`) | `node` from `PATH`, or `KC_NODE=/path/to/node` |
| Packaged app | Bundled Node.js 24.21.0 in `Contents/Resources/node/bin/node`. `PATH` and `KC_NODE` are not used. |

Compatibility note: Angular 14 officially supports Node.js 14.15+ and 16.10+ only.
Node.js 24 builds and runs this branch, but it is outside the official range.
Upgrade Angular in a separate step (see [docs/follow-ups.md](docs/follow-ups.md)).

## Setup

```sh
yarn install --immutable
yarn build-dev
yarn start
```

`yarn start-dev` does the build and the start in one command.

Since Electron 42, `yarn install` does not download the Electron binary.
The first `yarn start` (or the first end-to-end test) downloads it and
checks it against `node_modules/electron/checksums.json`. To download it
before you go offline: `node -e 'require("electron")'`.

## Architecture

| Part | Location | Runs in | Owns |
| --- | --- | --- | --- |
| Frontend | `src/kc_angular` | Electron renderer or a browser | Navigation, presentation, editing, temporary UI state, API calls |
| Backend (storage service) | `src/kc_storage` | Separate Node.js process | Projects, sources, the inbox, managed files, browser preferences, validation, persistence, backup and restore, browser sessions, browser UI files |
| Desktop | `src/kc_electron` | Electron main process | Windows, native file access by path, watched folders, thumbnails and file icons, embedded browser, Save as PDF, drag-out, backend start and stop. Also the chat server (for now). |
| Contracts | `src/kc_contracts`, `src/kc_shared` | Shared | Data types, record mapping, default settings. No Angular or Electron imports. |

The frontend reaches platform functions only through small capability
interfaces in `src/kc_angular/src/app/platform/`:

| Interface | Desktop | Browser |
| --- | --- | --- |
| `Platform` | All features | Library features; desktop-only actions are hidden or disabled with a reason |
| `BackendService` | IPC addresses, bearer tokens | Same origin, session cookie, CSRF header, session state |
| `SettingsStore` | Electron settings file | Storage service (`/v1/preferences/browser-settings`) |
| `WindowControls` | Minimize, maximize, zoom | Not available |
| `NativeFiles` | Original file path, copy by path, open in default app | Not available |
| `ManagedFiles` | `blob:` view, default app | Same-origin URL with filename, new tab |
| `WebsitePdf` | Save a website as PDF | Not available |

Both clients import files the same way: the user selects a `File`, the
frontend uploads its bytes (`POST /v1/assets`), and the source stores the
asset ID. IDs come from `crypto.randomUUID()`.

Both clients write through one ordered queue in `StorageService`. Each
write is an idempotent PUT or DELETE by ID. A write that the service
refuses because of the session (401, 403), or that does not reach it, stays
in the queue with all later writes until the connection is active again.
The page warns before it closes while writes are queued.

The inbox is sources with no project (`projectId: null`). A transfer to a
project is one PUT that sets the project ID, so it cannot copy or lose the
source. The inbox list removes an entry only after that write is saved.

Remaining direct desktop calls: `ElectronIpcService` (embedded browser,
thumbnails, file icons, local paths, show in folder, watched folders),
`DragAndDropService` (drag-out), the display and import settings pages, and
the chat server. Each one is unreachable in the browser or behind a
`Platform` check.

Designs: [docs/storage-service.md](docs/storage-service.md),
[docs/desktop-storage-completion.md](docs/desktop-storage-completion.md),
[docs/browser-library.md](docs/browser-library.md).

### Data ownership

| Data | Owner | Location in a profile |
| --- | --- | --- |
| Projects, sources, inbox, topics, metadata | Storage service | `data/library/library.sqlite` |
| Copies of imported files | Storage service | `data/library/assets/` |
| Browser client settings | Storage service | `data/library/library.sqlite` (not in backups) |
| Chat history, current project, UI preferences, favicon cache | Renderer | `userData` (local storage) |
| Settings | Electron | `settings/knowledge.settings.json` |
| Extracted-text cache, API key file | Electron chat server | `data/storage/sources/`, `data/openai.encrypted` |

The app does not read or write the old local-storage project keys
(`kc-projects`, `<projectId>`, `ks-<id>`). Use the migration to import them.
An inbox that an earlier version kept in local storage (`ingest-queue`)
moves to the storage service at the next start, once. Entries that the
service already has stay unchanged.

## Instances and local servers

Each instance starts two local servers: the chat server (Electron) and the
storage service (Node.js). Each listens on a random port on `127.0.0.1`
and requires its own random bearer token. The renderer receives the
addresses and tokens through IPC (`A2E:Backend:Info`).

### Access boundary

- Verified: a request without the correct token or browser session gets `401`. The window of
  one instance does not know the address or token of another instance, so
  it cannot use the other instance's servers by mistake.
- Verified: the servers do not accept connections from other computers.
- Not protected: other programs that run as the same macOS user. Such a
  program can read the token (for example, from the storage service's
  environment, `KC_STORAGE_TOKEN`), or read the profile files directly.
  The real boundary is the operating-system user account.
- Verified (browser client): another local site in the same browser cannot
  read the API or write to it, and its requests leave no records or files.
- The browser extension server (port 9000, off by default) has no token.

Only one instance can use a profile at a time. A second start with the same
profile prints a message and exits. Different profiles can run at the same time.

If the storage service does not start, the app shows an error and quits.
The storage service stops when the app quits or crashes.

## Data profiles

A development run never uses your normal Knowledge data.

| Start condition | Data location |
| --- | --- |
| Unpackaged, `KC_PROFILE_DIR` not set | `<repo>/.dev-profiles/dev` |
| `KC_PROFILE_DIR=<path>` | `<path>` |
| `KC_PROFILE_DIR=system` | Normal per-user locations (see below) |
| Packaged build, `KC_PROFILE_DIR` not set | Normal per-user locations |

A profile contains these directories:

| Directory | Contents |
| --- | --- |
| `userData` | Chromium storage: local storage, cache, cookies |
| `data` | `library/` (storage service), text cache, API key file, temporary files |
| `settings` | `knowledge.settings.json` |
| `downloads` | Default save location. The autoscan folder is `downloads/Knowledge`. |

To start with an empty profile:

```sh
KC_PROFILE_DIR=/tmp/kc-empty yarn start
```

To delete the default development profile, delete `.dev-profiles/`.
Git ignores this directory.

Caution: `KC_PROFILE_DIR=system` uses your real data. Autoscan can move files
out of the autoscan folder. Make a backup first.

### Normal per-user locations (macOS)

| Data | Location |
| --- | --- |
| Chromium storage | `~/Library/Application Support/knowledge-canvas` |
| Settings | `~/Library/Preferences/Knowledge/knowledge.settings.json` |
| Library, text cache, API key | `~/.Knowledge` |
| Autoscan folder | `~/Downloads/Knowledge` |

Do not confuse `~/Library/Application Support/Knowledge`. macOS owns that
directory (`knowledgeC.db`). Knowledge does not use it.

## Browser client (no Electron)

```sh
yarn build-angular-dev
yarn browser
```

`yarn browser` starts the storage service with the built UI and prints a
one-time launch link, for example
`http://127.0.0.1:45120/#launch=...`. Open it in Chrome. Press Enter in the
terminal for a new link. Press Ctrl+C to stop.

Options: `--data-dir <dir>` (default `.dev-profiles/browser/library`),
`--web-root <dir>` (default `src/kc_angular/dist/main`), `--port <n>`,
`--session-idle-minutes <n>`, `--open` (macOS: open the default browser).

The port comes from the library path (41000-48999), so one library always
opens at the same address. The browser keeps UI preferences per address.
If the port is in use, the launcher stops and asks for `--port`.

What works in the browser: projects, file upload (PDF, text, and other
files), the Document view for PDF, text, and images, topics and metadata,
search, opening managed files in a new tab, preview of PDF, text, and
images, the inbox, library export and restore, settings, logout.

Desktop only (hidden or disabled in the browser, with a reason): saving
websites and the example websites, Save as PDF, chat, the built-in browser
(website Preview opens a new tab instead), watched folders and extension
settings, window controls, opening files in other apps, showing files in
Finder, file thumbnails, file and website icons, dragging files out.

### Browser session

- The launch code is 256 random bits, single use, and expires after 5
  minutes. Only a bearer-token client (the launcher) can create one.
- The page exchanges it for an `HttpOnly`, `SameSite=Strict` cookie,
  `kc_session_<port>`, and a CSRF token that stays in page memory.
- Writes need the CSRF token and the service's own `Origin`. Requests that
  a browser marks as cross-site or same-site (another local port) are
  refused.
- A session ends after 30 minutes without requests, after 12 hours, on
  `DELETE /v1/session`, or when the service stops. Each session response
  carries `X-Knowledge-Session-TTL`, so the page knows when it ends.
- When the session ends or is refused, a dialog blocks the app. Unsaved
  changes stay in the tab. Press Enter in the launcher terminal, paste the
  new link, and select Continue (or open the link in another tab and select
  Check again). The queued changes are then saved once, in order.
- Log out (title bar) saves queued changes first, or asks before it
  discards them. It ends the session, removes library caches from the
  page, and reloads the page without library data.
- The bearer token is never printed or sent to the browser. The launch
  code appears once in the terminal and in the first URL fragment.
- This is a local, single-user setup. It is not a hosted deployment.

## Storage service without Electron

```sh
export KC_STORAGE_TOKEN=$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')
yarn storage serve --data-dir /tmp/kc-library
```

The service prints one line with its address, for example
`{"event":"ready","url":"http://127.0.0.1:53124",...}`. Then:

```sh
curl -s http://127.0.0.1:53124/health
curl -s -H "Authorization: Bearer $KC_STORAGE_TOKEN" http://127.0.0.1:53124/v1/projects
```

Stop it with Ctrl+C. Other commands:

```sh
yarn storage migrate --data-dir <dir> --from <knowledge-backup.json> [--dry-run]
yarn storage backup  --data-dir <dir> --out <file.tar>
yarn storage restore --data-dir <empty dir> --from <file.tar>
```

Stop the app (or the service) before you use `migrate`, `backup`, or
`restore` on its data directory. The commands refuse a directory that is in use.

## Migration from local storage

Use a copy of development data. Do not migrate your normal profile.

1. Get a renderer backup file (`knowledge-backup` version 1). Make it with
   Settings > Backup > Chat and Preferences Backup > Export, or use one
   made by the recovery baseline (commit `278a02a`). The file must contain
   the old project keys.
2. Stop the app.
3. Check the plan without writing:

   ```sh
   yarn storage migrate --data-dir <profile>/data/library --from <copy.json> --dry-run
   ```

4. Run the migration:

   ```sh
   yarn storage migrate --data-dir <profile>/data/library --from <copy.json>
   ```

5. Read `<profile>/data/library/migrations/<run>/report.json`. It lists
   imported, updated, unchanged, skipped, and failed items, missing files,
   `ks-<id>` records that differ from the project copy, and the local-storage
   keys that stay in the renderer.

The migration:

- Keeps project and source IDs, and all fields (unknown fields stay in `data`).
- Copies each file source's original file into managed storage. A missing
  file is reported. The source is imported without a managed copy.
- Can run again. Unchanged records are skipped. Files are not copied twice.
  A source keeps its managed copy if the original file is gone later.
- Does not change the input file or the renderer data.
- Writes all records in one transaction. If it fails, nothing is written and
  copied files are removed.

### Rollback

Each run saves a database copy at `migrations/<run>/pre-migration.sqlite`.

1. Stop the app.
2. Delete `library.sqlite`, `library.sqlite-wal`, and `library.sqlite-shm`
   in the data directory.
3. Copy `migrations/<run>/pre-migration.sqlite` to `library.sqlite`.
4. Start the app. The service removes copied files that no record uses.

To go back to the recovery baseline instead, check out `recovery/local-dev`.
The renderer still has the old keys, because the migration and the new app
do not change them. Changes made after the migration are not in them.

## Backup and restore

Settings > Backup has two separate backups. Neither is a complete
application backup.

| Backup | Contains | Does not contain | Restore |
| --- | --- | --- | --- |
| Library (`knowledge-library-<date>.tar`, format version 2) | Projects, sources, inbox entries, topics, metadata, copies of imported files (SHA-256 for each) | Chat history, UI preferences, settings, API keys, extracted-text cache | Settings > Backup > Restore Library, or `yarn storage restore`. Version 1 backups (no inbox) also restore. |
| Chat and preferences (`knowledge-backup-<date>.json`) | Renderer local storage: chat history, UI preferences | Projects, sources, inbox, files, settings | Settings > Backup > Restore |

### Restore a library in the app

1. Start Knowledge with a new, empty profile. For example:
   `KC_PROFILE_DIR=/path/to/new-profile yarn start`.
2. Open Settings > Backup.
3. Select Restore Library and choose the `.tar` file.
4. Read the preview: date, counts, project names, warnings, and the data
   that is not in the backup.
5. Select Restore. Knowledge shows the result and reloads.

The restored library does not need the original files.

Restore works only into an empty library. An empty library can have a
database file. If the library has projects, sources, or files, the app
shows the counts and refuses. It never replaces, merges, or deletes data.

The storage service does all checks before anything changes:

- Format `knowledge-library-backup`, supported version (1).
- Archive entries: only `manifest.json` and `assets/<asset ID>`, regular
  files only. Other names, links, and entry types are refused.
- Records, duplicate IDs, project and file references, sizes, and the
  SHA-256 of every file.
- Limits: archive 8 GiB, manifest 64 MiB, 1,000,000 entries, 2 GiB for
  each file.

Then it activates the restore in one step. If the step fails, or if the
process stops during it, the library stays empty. Unused staging files are
removed at the next start. A library restore does not change chat history
or preferences.

### Restore from the command line

```sh
yarn storage restore --data-dir <new profile>/data/library --from knowledge-library-<date>.tar
```

Stop the app first. The command uses the same checks as the app.

## Tests

| Command | Checks | Needs |
| --- | --- | --- |
| `yarn test` | Renderer backup, profile path isolation | Node.js 22.18+ |
| `yarn test-storage` | Storage service without Electron: persistence, files, validation and access limits, migration (repeat, missing files, failure, rollback), backup, restore (API and command line, non-empty refusal, unsupported version, missing and damaged files, unsafe archive entries, failure and process stop during activation) | Node.js 24+ |
| `yarn workspace kc_storage typecheck` | Storage service types (TypeScript 5) | |
| `yarn e2e` | Desktop UI with real profiles (below) | macOS, `yarn build-dev` first |
| `yarn e2e-packaged` | The unsigned package (below) | macOS arm64, `yarn package-local` first |
| `yarn e2e-browser` | The browser client in Google Chrome, no Electron (below) | Google Chrome, `yarn build-angular-dev` first |

The end-to-end tests start the real app with new, empty profiles in
`e2e/.output/<run>/`. They never use your normal profile. The desktop
window stays invisible and never takes focus (`KC_HIDDEN_WINDOW=1`, set by
`e2e/lib.mjs`). To watch a run: `KC_E2E_SHOW=1 yarn e2e`. Chrome runs
headless.

Run one file with `node --test <file>`; select one test with
`--test-name-pattern="<part of the name>"`.

- `e2e/workflow.e2e.mjs`: create a project, save a link (local fixture site),
  import a PDF and a text file, annotate, search, restart, delete the
  original files, read the same records and files, show the PDF, make a
  thumbnail and extract text from the managed copy, export the library,
  restore it into a second profile through Settings > Backup, and show the
  PDF there.
- `e2e/embedded-browser.e2e.mjs`: opens a website source in the desktop
  Browser tab (`WebContentsView`), follows a link to a second page, goes
  Back and Forward with the app's buttons, checks that the view stays inside
  the window after a resize, and checks that closing removes it.
- `e2e/inbox.e2e.mjs`: an inbox in renderer local storage (earlier
  versions) moves to the storage service once, with its file copied, and
  inbox entries survive restarts without duplicates.
- `e2e/isolation.e2e.mjs`: two profiles at the same time get different chat
  and storage addresses and tokens. Each server rejects the other
  instance's requests. A second start of the same profile exits.

- `e2e/packaged/packaged.e2e.mjs`: copies `dist/mac-arm64/Knowledge.app`
  to a temporary directory and runs it with scratch profiles, a working
  directory outside the repository, only `HOME`, `TMPDIR`, and
  `PATH=/usr/bin:/bin:/usr/sbin:/sbin` (no Node.js, no credentials). It
  checks that the service command line uses the bundled runtime, then runs
  the full workflow: create, link, import, annotate, restart, export,
  delete the originals, restore through the UI into a second profile,
  restart, and open the files. It also checks an unsupported backup
  version, the refusal for a non-empty library, unchanged chat history,
  two instances at the same time, and that no service process remains.
  Output stays in `$TMPDIR/kc-packaged-*`. The test removes the app copy.

- `e2e/browser/library.e2e.mjs`: starts `yarn browser` with scratch
  libraries and opens the launch link in headless Google Chrome. It
  creates a project, uploads a PDF and a text file, shows both, annotates,
  searches, restarts the service and the browser, checks that the records
  remain, opens the managed files in new tabs, exports the library, and
  restores it through the UI into a second library. It also checks
  requests without a session, reads and writes from another local site,
  and that the launcher does not print the bearer token. A file stays in
  the inbox through export and restore. Console errors and page errors
  are checked at each stage.
- `e2e/browser/inbox.e2e.mjs`: inbox entries and a changed setting survive
  a restart on a different port; a transfer that the service refuses
  (broken session) stays in the inbox and is saved once after a new
  session; a repeated transfer adds nothing; Save as PDF is disabled with a
  reason.
- `e2e/browser/session.e2e.mjs`: a session that ends from inactivity blocks
  changes and keeps an unsaved edit, which completes once after a new
  session; logout saves a slow queued write first, then the page has no
  access, no library text, no session cookie, and no library caches.

Test files are in `e2e/fixtures/`. To delete old test output, delete
`e2e/.output/`.

To explore the UI by hand, use the interactive driver:

```sh
node e2e/drive.mjs /tmp/kc-explore 7777
curl -s -X POST http://127.0.0.1:7777 -d '{"op":"launch"}'
curl -s -X POST http://127.0.0.1:7777 -d '{"op":"shot","name":"home"}'
curl -s -X POST http://127.0.0.1:7777 -d '{"op":"close"}'
```

## Current limits

- Annotations are topics and metadata entries (tag and value). The app has
  no notes editor. The `notes` field is kept but not shown.
- Search uses titles, topics, descriptions, and source type. It does not
  search file content.
- Library restore works only into an empty library.
- Chat history, UI preferences, and settings are separate from the library
  and its backup.
- Browser UI preferences other than settings (theme, table layout) belong
  to the browser address. They survive restarts only on the same port.
- Resizing the desktop window reopens the built-in browser at the source
  URL. Its Back and Forward history is lost.
- A file source that had no original file at migration has no managed copy.
  It still depends on its original path.
- Packaging is verified only for macOS arm64 (unsigned). A pinned runtime
  hash exists for macOS x64, but that build is not tested. Linux and
  Windows packages have no runtime configuration.
- Signed and notarized releases are not verified. Signing must also sign
  the bundled Node.js binary.
- AI chat with a real API key is not verified.
- Angular 14 is outside its supported versions.

Follow-up work is in [docs/follow-ups.md](docs/follow-ups.md).

## Optional services

| Service | Default | How to enable |
| --- | --- | --- |
| AI chat (OpenAI) | Off | Open the Chat tab of a source. Enter a key in the dialog. |
| Update check | Off | Packaged build only. Set `KC_ENABLE_UPDATES=1`. The update feed (S3) does not exist now. |
| Browser extension server | Off | Settings > Import. Uses port 9000. |
| Autoscan | Off | Settings > Import. |

Without an API key, all source management works. Chat, summaries, and
AI topics do not work. The app shows an API key dialog.

The key file (`openai.encrypted`) uses a fixed passphrase. Treat it as
plain text.

## Packaging

```sh
yarn package-local
```

This command does these steps:

1. `yarn build`: production builds of Angular and Electron.
2. `yarn prepare-runtime`: downloads the official Node.js 24.21.0 archive
   for this computer (`darwin-arm64`) from `nodejs.org`, checks the pinned
   SHA-256 and the upstream `SHASUMS256.txt`, and extracts `bin/node` and
   `LICENSE` to `vendor/node/darwin-arm64/`. It needs the network only the
   first time. Git ignores `vendor/`.
3. electron-builder without signing (`CSC_IDENTITY_AUTO_DISCOVERY=false`).

The result is an unsigned app in `dist/mac-arm64/Knowledge.app` (about
440 MB). It contains, outside `app.asar`:

| Path in `Contents/Resources` | Contents |
| --- | --- |
| `node/bin/node`, `node/LICENSE` | Node.js runtime and its license notices |
| `kc_storage/` | Storage service source |
| `kc_contracts/` | API contracts |

The packaged app uses the normal per-user data locations unless
`KC_PROFILE_DIR` is set. For tests, always set `KC_PROFILE_DIR`.

To change the runtime version, edit `VERSION` and `PINNED_SHA256` in
`scripts/prepare-node-runtime.mjs`. Take the hashes from
`https://nodejs.org/dist/v<version>/SHASUMS256.txt`.

Use `yarn package-local` or `yarn run pack`. The command `yarn pack` is a
Yarn built-in that makes an npm archive.

Notarization starts only when `APPLEID`, `APPLEPWD`, and `TEAMID` are set.
Signing needs a valid Developer ID certificate. Neither is verified.

Do not use `yarn publish`. Its target S3 bucket does not exist.
