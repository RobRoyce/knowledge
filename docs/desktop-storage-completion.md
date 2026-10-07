# Desktop Storage Completion (Milestone 2)

## Purpose

Make the desktop app self-contained for local use:

- The unsigned package starts the storage service without an installed
  Node.js.
- A user can restore a library backup through Settings > Backup.

Not in this milestone: signing, notarization, publishing, cloud hosting,
browser client.

## Findings from the current code

| Area | Current behavior | Problem |
| --- | --- | --- |
| Runtime | Electron runs `node` from `PATH` or `KC_NODE`. | A packaged app on a machine without Node.js cannot start the service. |
| Service files | Read from `<appPath>/src/kc_storage`. | The package has no `src/kc_storage`. Files inside `app.asar` cannot be read by a separate Node.js process. |
| Restore | `restore` command only. It writes records and moves files in one step. It checks only `.tar` entry names it needs and ignores other entries. | No UI. Unknown entry types are not rejected. Validation and activation are not separate. |
| Locks | One process per data directory (`storage.lock`). | The running service owns the library, so the UI cannot use the command line restore. |

## Packaging the service

- `scripts/prepare-node-runtime.mjs` downloads the official Node.js
  archive for one platform from `nodejs.org/dist`. The version and the
  archive SHA-256 are pinned in the script. The script also checks the hash
  against the upstream `SHASUMS256.txt`. It extracts `bin/node` and
  `LICENSE` to `vendor/node/<platform>-<arch>/`. Git ignores `vendor/`.
- Pinned runtime: Node.js 24.21.0 (LTS), `darwin-arm64`.
- electron-builder copies these into the app, outside `app.asar`:

  | Package path | Source |
  | --- | --- |
  | `Contents/Resources/node/bin/node` | `vendor/node/darwin-<arch>/bin/node` |
  | `Contents/Resources/node/LICENSE` | Node.js license notices |
  | `Contents/Resources/kc_storage/` | `src/kc_storage/src/*.ts`, `package.json` |
  | `Contents/Resources/kc_contracts/` | `src/kc_contracts/*.ts`, `package.json` |

- Runtime selection in Electron main:

  | Run | Node.js | Service entry | Working directory |
  | --- | --- | --- | --- |
  | Packaged | `process.resourcesPath/node/bin/node` (only) | `process.resourcesPath/kc_storage/src/main.ts` | `process.resourcesPath` |
  | Unpackaged | `KC_NODE` or `node` from `PATH` | `<repo>/src/kc_storage/src/main.ts` | repository |

- A packaged run gives the service only `KC_STORAGE_TOKEN`. It does not pass
  `PATH` or other variables.
- The service stays independent of Electron. `yarn storage ...` still works.

## Restore through the interface

The storage service does all validation and activation. The renderer
uploads the selected file. A future browser client can use the same API.

| Step | Request | Service action |
| --- | --- | --- |
| Check | `GET /v1/library` | Return record counts and `empty`. The UI disables restore and explains why if the library is not empty. |
| Upload and validate | `POST /v1/restores` (body: the `.tar`) | Refuse at once if the library is not empty. Stream the file to `restore/<id>/archive.tar` (size limit). Validate the archive, manifest, records, relationships, and every asset hash. Copy assets to `restore/<id>/files/`. Return a preview. |
| Preview | — | UI shows counts, project names, backup date, warnings, and what the backup does not contain. |
| Confirm | `POST /v1/restores/<id>/activate` | Activate (below). Return counts. |
| Cancel | `DELETE /v1/restores/<id>` | Remove the staging directory. |

After activation the UI shows the result and reloads.

## No concurrent writes

Activation is one synchronous function in the service's single thread:
check that the library is empty, start a transaction, insert records, move
staged files into place, commit. No other request runs during it.
Validation runs before activation, and other writes can happen then. So
activation checks again that the library is empty, inside the transaction.
The restore never merges into or replaces user records.

## Failure and interruption

| Failure | Result |
| --- | --- |
| Invalid archive, version, record, relationship, or hash | Error before activation. Staging directory removed. Library unchanged. |
| Error during activation | Transaction rolled back. Moved files removed. Staging removed. |
| Process stops during activation, before commit | SQLite discards the transaction. On the next start, the service removes asset files without records, and all `restore/` staging directories. Library is empty again. |
| Process stops after commit | Restore is complete. Files were moved before the commit. |
| Process stops before activation | Staging is removed at the next start. |

## Archive safety

- Allowed entries: `manifest.json` and `assets/<uuid v4>` only.
  Regular files only. No prefix field, no duplicates.
- Every manifest asset must have an entry with the same size. Every asset
  entry must be in the manifest.
- The service never uses an entry name as a path. Files are written by
  asset ID.
- Limits: archive 8 GiB, manifest 64 MiB, 1,000,000 entries, each asset at
  most the upload limit (2 GiB).

The command line `restore` uses the same validation and activation code.

## Tests

- Service tests (no Electron): restore through HTTP and the command line,
  non-empty refusal, unsupported version, missing and damaged assets,
  unsafe entries (path traversal, symbolic link, unknown entry), failure
  during activation, process stop during activation and restart.
- Packaged app (`yarn e2e-packaged`): scratch profiles, working directory
  outside the repository, `PATH=/usr/bin:/bin:/usr/sbin:/sbin`, no
  credentials. The full workflow with UI restore, the service command line
  checked for the bundled runtime, two instances, process cleanup.

## Verified (2026-10-06, macOS 26.6 arm64)

| Command | Result |
| --- | --- |
| `yarn install --immutable` | Pass |
| `yarn build-dev` | Pass |
| `yarn test` | 8 of 8 pass |
| `yarn test-storage` | 22 of 22 pass |
| `yarn workspace kc_storage typecheck` | Pass |
| `yarn e2e` | 2 of 2 pass (UI restore in the development app) |
| `yarn package-local` | Pass. Unsigned `dist/mac-arm64/Knowledge.app`, about 440 MB. |
| `yarn e2e-packaged` | 1 of 1 pass |

The packaged test ran the app from a copy in `$TMPDIR`, with
`PATH=/usr/bin:/bin:/usr/sbin:/sbin` (`which node` fails), and the working
directory outside the repository. The service command line was:

```
<copy>/Knowledge.app/Contents/Resources/node/bin/node
  <copy>/Knowledge.app/Contents/Resources/kc_storage/src/main.ts serve
  --data-dir <profile>/data/library --port 0 --allow-origin null --exit-on-stdin-close
```

The service working directory was `Contents/Resources`. No service process
remained after the app closed.

Also verified by hand: the storage service accepts connections on
`127.0.0.1` only. A connection to the computer's network address is refused.

Not verified: signed or notarized builds, macOS x64, Linux, Windows.
