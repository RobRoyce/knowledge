# Local Development

This guide tells you how to build and start Knowledge on your computer.
You do not need AWS, an Apple developer account, or an AI API key.

## Toolchain

| Tool | Version | Notes |
| --- | --- | --- |
| macOS | 26.6 (arm64) | Verified. Linux and Windows are not verified. |
| Node.js | 24.21.0 | Verified. See the compatibility note below. |
| Yarn | 3.2.4 | The repository contains this version (`.yarnrc.yml` `yarnPath`). Any global `yarn` starts it. |
| Electron | 26.3.0 | Installed by Yarn. |

No native compiler is necessary. The install does not build `canvas`.

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

## Instances and local servers

Each instance starts its own chat server on a random loopback port. Each
server requires a random token. The renderer receives the address and the
token through IPC (`A2E:Backend:Info`). One instance cannot use the server of
another instance.

Only one instance can use a profile at a time. A second start with the same
profile prints a message and exits. Different profiles can run at the same time.

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
| `userData` | Chromium storage: local storage (projects, sources, chat history), cache, cookies |
| `data` | Source text cache (`storage/sources`), OpenAI key file, temporary files |
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
| Source text cache, API key | `~/.Knowledge` |
| Autoscan folder | `~/Downloads/Knowledge` |

Do not confuse `~/Library/Application Support/Knowledge`. macOS owns that
directory (`knowledgeC.db`). Knowledge does not use it.

## Tests

Unit tests (Node.js 22.18 or later):

```sh
yarn test
```

These check backup and restore, and profile path isolation.

End-to-end tests (macOS):

```sh
yarn build-dev
yarn e2e
```

The end-to-end tests start the real app with new, empty profiles in
`e2e/.output/<run>/`. They never use your normal profile. They do these checks:

- `e2e/workflow.e2e.mjs`: create a project, save a link (local fixture site),
  import a PDF and a text file, annotate, search, restart, export a backup,
  and restore it into a second profile.
- `e2e/isolation.e2e.mjs`: two profiles at the same time get different server
  addresses and tokens. Each instance rejects the other instance's requests.
  A second start of the same profile exits.

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
  no notes editor.
- Search uses titles, topics, descriptions, and source type. It does not
  search file content.
- A backup does not include imported files.
- File sources keep the absolute path of the original file. After a restore,
  file sources work only if the original files are still at those paths.
- Signed and notarized releases are not verified.
- AI chat with a real API key is not verified.
- Only macOS is verified.

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

## Backup and restore

Use Settings > Backup.

A backup contains all renderer local storage:

- Projects and their sources
- Source topics and metadata annotations
- Chat history
- The inbox
- Theme and table preferences

A backup does not contain:

- Settings (`knowledge.settings.json`)
- Imported files. File sources keep the absolute path of the original file.
- The source text cache. The app extracts the text again when necessary.
- The API key

Restore merges the project list and replaces items that have the same ID.
The app reloads after a restore. Restore accepts only files that Settings >
Backup made (`format: knowledge-backup`, version 1).

## Packaging

```sh
CSC_IDENTITY_AUTO_DISCOVERY=false yarn run pack
```

Use `yarn run pack`. The command `yarn pack` is a Yarn built-in. It makes an
npm archive and does not start electron-builder.

The result is an unsigned app in `dist/mac-arm64`. Notarization starts only
when `APPLEID`, `APPLEPWD`, and `TEAMID` are set. Signing needs a valid
Developer ID certificate.

Do not use `yarn publish`. Its target S3 bucket does not exist.
