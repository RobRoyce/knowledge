# Storage Service Design (Milestone 1)

## Purpose

Move projects, sources, and imported files out of renderer `localStorage`
into a standalone service. The service runs with Node.js and does not need
Electron. The Angular UI stays. This is the first backend extraction step.

## Current storage (evidence)

Inspected from a backup of a real development profile (`e2e/.output`).

| Item | Current behavior |
| --- | --- |
| Project record | `localStorage[<projectId>]`. Fields: `id`, `name`, `parentId`, `subprojects`, `description`, `topics`, `calendar`, `events`, `authors`, `type`, `icon`, `expanded`, dates, `sources` (always empty), `knowledgeSource`. |
| Project list | `localStorage['kc-projects']`: array of project IDs. |
| Sources | Full copies inside `project.knowledgeSource`. The UI reads only these. |
| Separate source records | `localStorage['ks-<id>']`. Written only by `DataService.sources.update`. Exist for some sources only. Can differ from the embedded copy (`meta`, `icon`). |
| Association | `source.associatedProject.value` plus membership in `project.knowledgeSource`. |
| Annotations | `source.topics` (strings) and `source.meta` (`{key, value}`). `source.notes` exists but no UI writes it. |
| File sources | `accessLink` and `reference.source.file.path` hold the absolute original path. No copy exists. |
| Derived fields | `source.icon` (Angular `SafeUrl` with an expired `blob:` URL), `source.thumbnail` (PNG data URL, about 57 KB), `localStorage['icon-<id>']`. |
| Text cache | Electron chat server writes `<profile>/data/storage/sources/<id>.json`. |
| Other renderer keys | `chat-<id>`, `ingest-queue`, `current-project`, `theme`, `ks-table-rows`, card and graph preferences, topics. |

All project and source writes go through `StorageService` (`saveProject`,
`updateProject`, `deleteProject`, `deleteKnowledgeSource`) and
`DataService.sources` (`ks-*` keys).

## Service boundary

- Package `src/kc_storage`. Node.js 24 or later. TypeScript run directly by
  Node (type stripping). No runtime dependencies. SQLite from `node:sqlite`.
- Contracts in `src/kc_contracts/`. `storage.ts` has types and header names.
  `mapping.ts` converts between UI objects and records. Neither file has
  imports.
- The service owns the database and the managed files. No other process
  opens them.
- Commands: `serve`, `migrate`, `backup`, `restore`.

## Ownership after this milestone

| Data | Owner |
| --- | --- |
| Projects, sources, topics, metadata, notes field | Storage service |
| Imported files | Storage service (managed assets) |
| Chat history, inbox, current project, UI preferences, favicon cache | Renderer `localStorage` |
| Settings | Electron (`knowledge.settings.json`) |
| Extracted-text cache, API key | Electron chat server (`<profile>/data/storage`, `<profile>/data`) |

The app does not read or write the old project keys (`kc-projects`,
`<projectId>`, `ks-*`). It does not delete them.

## Database (schema version 1)

| Table | Columns |
| --- | --- |
| `schema_migrations` | `version`, `applied_at` |
| `projects` | `id` PK, `parent_id`, `name`, `data` (JSON), `created_at`, `updated_at` |
| `sources` | `id` PK, `project_id` FK → `projects` (cascade delete), `title`, `ingest_type`, `asset_id` FK → `assets`, `position`, `data` (JSON), `created_at`, `updated_at` |
| `assets` | `id` PK, `sha256`, `size`, `media_type`, `filename`, `original_path`, `created_at` |
| `import_runs` | `id` PK, `input_sha256`, `started_at`, `finished_at`, `status`, `report` (JSON) |

`data` keeps every field that has no column, so no field is lost. The
service stores `data` as it receives it. Clients and the migration remove
the derived source fields `icon` and `thumbnail` before they write. The UI
derives them again.

## API (version 1)

Base: `http://127.0.0.1:<port>`. All `/v1` routes need
`Authorization: Bearer <token>`.

| Method and path | Result |
| --- | --- |
| `GET /health` | Status, service version, schema version. No token. |
| `GET /v1/projects` | All projects |
| `PUT /v1/projects/:id` | Create or replace a project |
| `DELETE /v1/projects/:id` | Delete a project and its sources |
| `GET /v1/sources[?projectId=]` | Sources, in project order |
| `PUT /v1/sources/:id` | Create or replace a source. The project and asset must exist. |
| `DELETE /v1/sources/:id` | Delete a source |
| `POST /v1/assets` | Upload file bytes. Headers give filename and original path. |
| `GET /v1/assets/:id` | Asset metadata |
| `GET /v1/assets/:id/content` | File bytes |
| `GET /v1/backup` | Portable backup (tar) |

Errors use `{ "error": { "code", "message" } }` and a matching HTTP status.

## Local access

- Listens on `127.0.0.1` only. Port `0` by default (ephemeral).
- Token from the `KC_STORAGE_TOKEN` environment variable. Required.
- The `Host` header must be `127.0.0.1:<port>` or `localhost:<port>`.
- CORS allows only the configured origin (`null` for the desktop renderer).
  CORS and loopback are not authentication. The token is.
- No route takes a filesystem path. Asset IDs must match a strict pattern.
- One process per data directory (lock file).

## Managed files

- Upload streams to `assets/tmp/`, computes SHA-256, then renames to
  `assets/<first two characters>/<assetId>`.
- The original filename, original path, size, media type, and hash are
  stored as metadata. The original file is not changed.
- `source.asset_id` is the file identity. `accessLink` keeps the original
  path as information only.
- The desktop app uploads through Electron main (`A2E:Storage:ImportFile`),
  because the renderer cannot read local paths. A web client would upload
  the same way with a `File`.

## Desktop connection

Electron main starts `node src/kc_storage/src/main.ts serve` with
`--data-dir <profile>/data/library`, port `0`, and a new token. The service prints
one JSON line with its URL. The renderer receives the URL and token through
`A2E:Backend:Info`. If the service does not start, the app shows an error
and quits. The service stops when its standard input closes.

## Migration

`node src/kc_storage/src/main.ts migrate --data-dir <dir> --from <backup.json>`

- Input: a Settings > Backup file (`knowledge-backup` version 1). Use a copy
  of development data only.
- Validate the whole input before any write.
- Projects: every key with a project record. Sources: the embedded copies.
  A `ks-*` record without an embedded copy is imported if its project
  exists. Differences between `ks-*` and embedded copies are reported.
- File sources: copy the file at the original path into managed storage.
  Report missing files. The source is still imported, without an asset.
- Keep existing IDs. Repeated runs update or skip. No duplicates.
- Before writing, snapshot the database (`VACUUM INTO`). Write all records
  in one transaction. Remove copied files if the transaction fails.
- Write the report and a copy of the input to `migrations/<run>/`.
  The report lists imported, updated, unchanged, skipped, missing, and
  failed items, and the renderer keys that stay in `localStorage`.

Rollback: stop the app, then restore `migrations/<run>/pre-migration.sqlite`
or delete the data directory. The renderer data is not changed by migration.

## Backup and restore

- `GET /v1/backup` or `backup --data-dir <dir> --out <file.tar>`.
- Tar file: `manifest.json` (format `knowledge-library-backup`, version 1,
  projects, sources, assets with SHA-256) and `assets/<id>`.
- `restore --data-dir <empty dir> --from <file.tar>` checks every hash.
- Not included: chat history, UI preferences, settings, API key, text cache.

## UI workflow

Create project, save link, import PDF and text file, show sources, add topic
and metadata, search, restart, read the same records and file. The
Document tab, thumbnails, and "open file" use the asset.

## Acceptance tests

- Service (`yarn workspace kc_storage test`, no Electron): persistence across
  restart, asset upload and retrieval, validation and access limits,
  repeated migration, missing files, interrupted migration, backup and
  restore into a new directory with the original files deleted.
- UI (`yarn e2e`): the workflow above, restart, file shown after the
  original file is deleted.

## Verified (2026-10-06, macOS 26.6, Node.js 24.21.0)

- `yarn test-storage`: 16 tests, service started as a separate Node.js process.
- `yarn e2e`: the UI workflow above, restart, deleted originals, thumbnail
  and text extraction from the managed copy, library export, restore into a
  second profile, and instance isolation.
- Migration of a copy of a development profile backup: 1 project, 3 sources,
  2 files copied, 3 differing `ks-` records reported, 7 renderer keys left.
  A second run: all unchanged, files reused.

## Not in this milestone

Full-text search, notes editor, thumbnail service, orphan asset cleanup
policy, packaged-app Node runtime, web client, authentication accounts.
