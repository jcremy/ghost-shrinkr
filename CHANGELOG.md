# Changelog

All notable changes to GhostShrinkr. The format loosely follows [Keep a Changelog](https://keepachangelog.com/).

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
