# Local Development

This guide tells you how to build and start Knowledge on your computer.
You do not need AWS, an Apple developer account, or an AI API key.

## Toolchain

| Tool | Version | Notes |
| --- | --- | --- |
| macOS | 26.6 (arm64) | Verified. Linux and Windows are not verified. |
| Node.js | 24.21.0 | Verified. The app starts the storage service with this Node.js. |
| Yarn | 3.2.4 | The repository contains this version (`.yarnrc.yml` `yarnPath`). Any global `yarn` starts it. |
| Electron | 26.3.0 | Installed by Yarn. |

No native compiler is necessary. The install does not build `canvas`.

The storage service (`src/kc_storage`) needs Node.js 24 or later. It uses
the built-in `node:sqlite` module. The desktop app starts it with `node`
from `PATH`. To use a different binary, set `KC_NODE=/path/to/node`.

Compatibility note: Angular 14 officially supports Node.js 14.15+ and 16.10+ only.
Node.js 24 builds and runs this branch, but it is outside the official range.
Electron 26 is end-of-life. Upgrade these in a separate step.

## Setup

```sh
yarn install --immutable
yarn build-dev
yarn start
```

`yarn start-dev` does the build and the start in one command.

## Architecture

| Part | Location | Runs in |
| --- | --- | --- |
| UI | `src/kc_angular` | Electron renderer |
| Desktop functions, chat server | `src/kc_electron` | Electron main process |
| Storage service | `src/kc_storage` | Separate Node.js process |
| API contracts | `src/kc_contracts` | Shared. No application imports. |

The design of the storage service is in
[docs/storage-service.md](docs/storage-service.md).

### Data ownership

| Data | Owner | Location in a profile |
| --- | --- | --- |
| Projects, sources, topics, metadata | Storage service | `data/library/library.sqlite` |
| Copies of imported files | Storage service | `data/library/assets/` |
| Chat history, inbox, current project, UI preferences, favicon cache | Renderer | `userData` (local storage) |
| Settings | Electron | `settings/knowledge.settings.json` |
| Extracted-text cache, API key file | Electron chat server | `data/storage/sources/`, `data/openai.encrypted` |

The app does not read or write the old local-storage project keys
(`kc-projects`, `<projectId>`, `ks-<id>`). Use the migration to import them.

## Instances and local servers

Each instance starts two local servers: the chat server (Electron) and the
storage service (Node.js). Each listens on a random loopback port and
requires its own random token. The renderer receives the addresses and
tokens through IPC (`A2E:Backend:Info`). One instance cannot use the
servers of another instance.

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

Settings > Backup has two backups. Neither is a complete application backup.

| Backup | Contents | Restore |
| --- | --- | --- |
| Library (`knowledge-library-<date>.tar`) | Projects, sources, topics, metadata, managed files with SHA-256 hashes | `yarn storage restore` into an empty data directory |
| Chat and preferences (`knowledge-backup-<date>.json`) | Renderer local storage: chat history, inbox, UI preferences | Settings > Backup > Restore |

Not in either backup: settings, the API key, the extracted-text cache.
File sources without a managed copy (missing at migration) still depend on
the original path.

To restore a library into a new profile:

```sh
yarn storage restore --data-dir <new profile>/data/library --from knowledge-library-<date>.tar
KC_PROFILE_DIR=<new profile> yarn start
```

Restore checks every file hash and refuses a directory that already has a
library. The restored library does not need the original files.

## Tests

| Command | Checks | Needs |
| --- | --- | --- |
| `yarn test` | Renderer backup, profile path isolation | Node.js 22.18+ |
| `yarn test-storage` | Storage service without Electron: persistence, files, validation and access limits, migration (repeat, missing files, failure, rollback), backup and restore | Node.js 24+ |
| `yarn workspace kc_storage typecheck` | Storage service types (TypeScript 5) | |
| `yarn e2e` | Desktop UI with real profiles (below) | macOS, `yarn build-dev` first |

The end-to-end tests start the real app with new, empty profiles in
`e2e/.output/<run>/`. They never use your normal profile.

- `e2e/workflow.e2e.mjs`: create a project, save a link (local fixture site),
  import a PDF and a text file, annotate, search, restart, delete the
  original files, read the same records and files, show the PDF, make a
  thumbnail and extract text from the managed copy, export the library,
  restore it into a second profile, and show the PDF there.
- `e2e/isolation.e2e.mjs`: two profiles at the same time get different chat
  and storage addresses and tokens. Each server rejects the other
  instance's requests. A second start of the same profile exits.

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
- The library backup includes managed files. Restore needs the storage
  service command line. The UI cannot restore a library.
- A file source that had no original file at migration has no managed copy.
  It still depends on its original path.
- Packaged builds cannot start the storage service. The package does not
  contain `src/kc_storage` or a Node.js 24 runtime. Not tested on this
  branch. A packaged app is expected to show the start error and quit.
- Signed and notarized releases are not verified.
- AI chat with a real API key is not verified.
- Only macOS is verified.

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
CSC_IDENTITY_AUTO_DISCOVERY=false yarn run pack
```

Use `yarn run pack`. The command `yarn pack` is a Yarn built-in. It makes an
npm archive and does not start electron-builder.

The result is an unsigned app in `dist/mac-arm64`. Notarization starts only
when `APPLEID`, `APPLEPWD`, and `TEAMID` are set. Signing needs a valid
Developer ID certificate. See the packaging limit above.

Do not use `yarn publish`. Its target S3 bucket does not exist.
