# Electron Upgrade (Milestone 4)

## Selected version

Electron **44.6.0** (Chromium 152, Node.js 24.18 inside Electron).

| Major | Stable since | End of support | Decision |
| --- | --- | --- | --- |
| 44 | 2026-08-25 | 2027-03-02 | Selected: newest stable, longest support |
| 43 | 2026-06-30 | 2027-01-05 | Shorter support |
| 42 | 2026-05-05 | 2026-10-20 | Support ends in two weeks |
| 45 | Planned 2026-10-20 | — | Not stable yet |

Sources: [Electron release schedule](https://releases.electronjs.org/schedule),
[Electron breaking changes](https://www.electronjs.org/docs/latest/breaking-changes).

## Breaking changes that affect this app (26 → 44)

| Version | Change | Action |
| --- | --- | --- |
| 32 | `File.path` removed | The preload script exposes `api.pathForFile(file)` with `webUtils.getPathForFile`. `NativeFiles.pathOf` uses it. |
| 30 | `BrowserView` deprecated | The embedded browser uses `WebContentsView`, `contentView.addChildView`, and `webContents.close()`. A window resize listener replaces `setAutoResize`. |
| 32 | `webContents.canGoBack()` and related methods deprecated | Use `webContents.navigationHistory`. |
| 21 | `printToPDF` options changed | Removed the old `marginType` option (default margins). |
| 42 | No binary download at install | The binary downloads on first use. Tests resolve it with `require("electron")`. |
| 41 | PDFs render in the same WebContents (OOPIF) | Verified: PDF view in the desktop app. |
| 20 | Renderer sandbox on by default | Already on. The preload script uses only `electron` modules. |
| 44 | `clipboard` removed from renderers | Not used in the renderer. |
| 44 | macOS 13 or later | The app requires macOS 13+. |

Not affected: `crashed` events (not used), `new-window` (not used),
`ipcRenderer.sendTo` (not used), protocol registration (not used).

## Other changes

- A latent bug became visible on Node.js 24: PDF text extraction passed the
  whole pooled `Buffer.buffer` to pdf.js. It now copies the file bytes.
- electron-builder no longer rebuilds native modules (`npmRebuild: false`).
  No runtime native module needs it: `fsevents` uses Node-API, and
  `canvas` is not built or used.
- Removed the root `postinstall` key. It was outside `scripts`, so it never
  ran, and its rebuild step is no longer needed.
- The bundled Node.js 24.21.0 for the storage service stays. The service
  must run without Electron.

## Removed dependencies

Each one had no source, script, or configuration reference, or its only
use was removed. Clean install, builds, and all tests pass without them.

| Package | Reason |
| --- | --- |
| `@adobe/css-tools`, `ejs`, `follow-redirects`, `got`, `minimist`, `multer`, `node-fetch`, `node-forge`, `plist`, `postcss`, `terser`, `url` | No direct use. Packages that other packages need stay as transitive dependencies. `url` was shadowed by the Node.js built-in. |
| `@types/ejs`, `@types/follow-redirects`, `@types/minimist`, `@types/multer`, `@types/node-forge`, `@types/plist`, `@types/prettier`, `@types/eslint` | Types for packages that the code does not use. |
| `loader-utils`, `worker-loader` | Not used by any build. |
| `node-loader` and its webpack rule | Only loaded the old bundled `canvas` binary. |

Kept: `@angular/cli` and `@angular-devkit/architect` at the root (part of
the Angular upgrade), `electron-notarize` (used by `Resources/notarize.js`;
replace with `@electron/notarize` when signing is in scope),
`standard-version` (used by `yarn release`).

## Verified (2026-10-07, macOS 26.6 arm64)

| Command | Result |
| --- | --- |
| `yarn install --immutable` (clean copy) | Pass |
| `node -e 'require("electron")'` (clean copy) | Pass: v44.6.0 binary downloaded and checked |
| `yarn build-dev` | Pass |
| `yarn test` | 8 of 8 pass |
| `yarn test-storage` | 28 of 28 pass |
| `yarn workspace kc_storage typecheck` | Pass |
| `yarn e2e` | 3 of 3 pass: embedded browser (new), instance isolation, library workflow |
| `yarn e2e-browser` | 1 of 1 pass |
| `yarn package-local` | Pass: Electron 44.6.0, no native rebuild, unsigned |
| `yarn e2e-packaged` | 1 of 1 pass: copy outside the repository, scratch profiles, `PATH` without Node.js, bundled runtime |

Known warning: the main process prints a Node.js `punycode` deprecation
warning. It comes from a bundled third-party package, not from app code.
