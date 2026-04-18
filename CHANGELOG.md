# Changelog

All notable changes to GhostShrinkr. The format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [v1.4.4] — 2026-04-18

### Added

- Small app logo in the in-app header, next to the title — gives the window a visual identity instead of just a plain text headline.

### Changed

- Release assets trimmed from 5 user-facing files down to 3: `GhostShrinkr.dmg` (the download), `GhostShrinkr_universal.app.tar.gz` (auto-updater payload), and `latest.json` (auto-updater manifest). The versioned `.dmg` (a duplicate of `GhostShrinkr.dmg`) and the standalone `.tar.gz.sig` (signature is already embedded in `latest.json` — the plugin doesn't fetch it separately) are no longer published. The Source-code archives still appear because GitHub auto-generates them on every tag and there's no way to suppress that.

## [v1.4.3] — 2026-04-18

### Fixed

- **Update check no longer trusts the plugin's `available` flag.** The flag has been observed to return `false` even when the manifest version is strictly greater than the bundled version, blocking upgrades silently. The check now compares versions in JS (semver) directly: if the plugin returned any metadata with a higher version than what's bundled, the banner shows, regardless of what the flag says. The plugin's response is also logged with full detail (manifest version, plugin's view of current version, raw flag) so any future divergence is debuggable from **Show Log…**.

## [v1.4.2] — 2026-04-18

### Added

- **In-app log viewer.** New macOS menu item **GhostShrinkr → Show Log…** (⌘⌥L) opens a modal showing the last 200 timestamped log entries — captured automatically from `console.log/info/warn/error` plus explicit instrumentation around the auto-updater pipeline (check started, plugin response, version comparison, download progress, install/restart, errors). Lets users without DevTools see exactly what the app is doing — particularly useful when an auto-update silently misbehaves. Buttons to **Copy** the full log to clipboard or **Clear** the buffer; **Esc** dismisses.

## [v1.4.1] — 2026-04-18

### Fixed

- **Auto-updater now works.** v1.4.0 shipped with a `latest.json` manifest keyed only under `darwin-universal`, which `tauri-plugin-updater` 2.10.x doesn't look up — it queries `darwin-aarch64` (Apple Silicon) and `darwin-x86_64` (Intel) directly with no fallback — so **Check for Updates…** threw `TargetNotFound` and showed a generic failure toast. v1.4.1 emits both per-arch keys pointing at the same universal `.tar.gz`. The v1.4.0 `latest.json` on the Releases page was also patched retroactively, so existing v1.4.0 installs start detecting updates immediately.

### Changed

- Update check failures now surface the underlying error in the toast (e.g. *"Update check failed: network error"*) instead of a generic "Try again later". Easier to diagnose the next silent regression.
- `devtools` feature enabled on the `tauri` crate so right-click → **Inspect Element** works in release builds — useful for debugging when DevTools is the only way to see what failed.
- Each release now also publishes `GhostShrinkr.dmg` (a stable-name copy of the versioned `.dmg`) so the README's **Download for Mac** button can point at a direct one-click URL that doesn't change across versions.

## [v1.4.0] — 2026-04-18

### Added

- **Auto-update**. The macOS app now downloads and installs new versions in place. On launch (and every 24 h while the window stays open) it checks for an update; if found, a banner offers **Install and relaunch** or **Remind me later**. No more browser detour, no more `.dmg` drag, no more "old app is open" conflict — one click, ~10 seconds, the new version is running. Updates are signed and verified against a key baked into the app, so a compromised release page can't push a backdoored update.
- **Check for Updates…** menu item in the macOS app menu (next to *About GhostShrinkr*), so the user can trigger a check on demand. Shows a "you're on the latest version" toast if nothing is pending.

### Changed

- The update banner replaces the previous *Download & quit* button (which opened the browser and exited) with **Install and relaunch** (in-place upgrade) and **Remind me later** (dismiss for the session, re-shown next launch or next 24 h tick).

## [v1.3.0] — 2026-04-18

### Changed

- macOS app is now **Developer ID signed and notarized by Apple**. First launch opens the app immediately — no Gatekeeper dialog, no `xattr -cr`, no Privacy & Security detour. Just download, drag to Applications, double-click.

### Added

- macOS app re-checks for updates every 24 hours while the window stays open, so users who keep the app running across days don't have to relaunch to discover new versions.

## [v1.2.2] — 2026-04-15

### Fixed

- macOS app: drag-and-drop of files into the drop zone now works. Previously Tauri's native window was intercepting the file drop before the webview's HTML5 drop handler could fire, so dropped files silently vanished. The window is now configured with `dragDropEnabled: false`, letting the webview receive drops directly. Click-to-browse already worked and still does.

## [v1.2.1] — 2026-04-14

### Fixed

- macOS update flow: clicking **Download** in the update banner now quits the app after opening the download page in the browser. Previously the old `.app` stayed running, so macOS refused to overwrite it in Applications when the user dragged the new version across. The button label now also reads **Download & quit** to make the behaviour explicit.

## [v1.2.0] — 2026-04-14

### Added

- macOS build is now a **universal binary** that runs on both Intel Macs and Apple Silicon. Previously the `.dmg` was Apple Silicon only (`aarch64`), silently failing on Intel machines. Bundle size roughly doubles (~6.5 MB vs ~3.5 MB) in exchange for universal compatibility.

## [v1.1.0] — 2026-04-14

### Added

- macOS app now checks for updates on launch and shows a non-intrusive banner at the top of the window when a newer version is available. Clicking Download opens the latest release in the default browser. Dismissed versions are remembered so the same release never nags twice. Silent on offline / API failure.

### Fixed

- macOS `.dmg` no longer triggers the misleading "damaged" Gatekeeper message on first launch. The `.app` is now ad-hoc signed during bundling, so users get the standard "unidentified developer" prompt instead (right-click → Open once, then launches normally).

### Changed

- CI workflow now publishes a proper GitHub Release on tag push (previously only uploaded a login-gated CI artifact). The `.dmg` is downloadable publicly from the Releases page.
- App version is now driven by the git tag — no more manual `tauri.conf.json` / `Cargo.toml` edits per release.

## [v1.0.0] — 2026-04-11

Initial public release.

### Added

- Browser tool at `ghostshrinkr.issify.com` for batch-shrinking JPG and PDF files locally. No upload, no account, no tracking.
- JPG compression via canvas resize (67% default) + JPEG quality encoding (72% default). EXIF orientation is respected.
- PDF compression via PDF.js rasterization (130 DPI default) + jsPDF reassembly. Vector-native PDFs are detected and skipped.
- Per-file and global settings (gear icon), filename suffix with on/off checkbox, Check action for pre-download quality inspection, View action to open compressed blobs in a new tab, Share action (Web Share API), Cancel support during batch operations.
- Dark/light theme toggle with system preference detection.
- Responsive burger menu for per-card actions below 520 px.
- Installable as a PWA on Chrome, Edge, and Safari 17+.
- MIT licensed, hosted on GitHub, deployable via GitHub Pages + Actions.
- Native macOS `.app` / `.dmg` via Tauri v2, built in CI on tag push.
