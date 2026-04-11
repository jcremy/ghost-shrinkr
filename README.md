# GhostShrinkr

> Drop files, shrink them, download. Runs entirely in your browser.

GhostShrinkr is a zero-backend tool for batch-shrinking JPG and PDF files — built for the specific ritual of packaging receipts and invoices for an accountant. One click, many compressed files in your Downloads folder. No server. No account. No tracking.

**Live app:** https://jcremy.github.io/ghost-shrinkr/

---

## Why

Existing "compress PDF online" tools all want your files on their servers. GhostShrinkr doesn't. Everything — parsing, rasterizing, re-encoding — happens inside your browser tab. Close the tab and nothing remains. Hence the "ghost".

## How to use it

1. Open the app.
2. Drag JPGs and PDFs onto the drop zone (or click to browse).
3. Hit **Shrink**.
4. Compressed files land in your Downloads folder.

That's the default flow. If you want more control:

- **Check** a single file before committing — runs the real compression but skips the download, so you can see the resulting size and click **View** to open the output in a new tab and inspect quality.
- **Gear icon (⚙)** in the top-right of the header — global defaults for JPG resize/quality, PDF DPI/quality, and filename suffix (with an on/off checkbox).
- **Gear icon on each card** — override settings for that single file. Changes cascade from globals to pending files unless you've individually customized them.
- **Cancel** — stops Check or Shrink mid-flight, rewinds whatever was in progress back to the pending state.
- **Theme toggle** — light/dark mode, remembers your choice.

## How it shrinks

**JPG** — resized (default 67 % of original dimensions — this is where most of the savings come from) then re-encoded at JPEG quality (default 72 %). EXIF orientation is respected so phone photos don't come out sideways.

**PDF** — rasterized at 130 DPI by default, each page re-encoded as a JPEG at quality 78 %, then reassembled into a new PDF via jsPDF. Small PDFs (< 100 KB) are skipped. Vector PDFs (Word/Excel/invoicing-app exports) are detected via a text-layer check and also skipped — rasterizing a text PDF almost always makes it bigger, not smaller.

In both cases, if the compressed output ends up larger than the original, the original is kept. The app never degrades a file's size silently.

## What it won't do

- No PNG, no TIFF, no Office docs, no zip archives.
- No OCR, no page removal, no rotation, no cropping.
- No server. No account. No tracking. No analytics.
- Does not persist files or settings across reloads (theme preference is the single exception).

## Limits

- Max **100 MB** per file
- Max **50 files** per session

These exist to keep the browser tab from OOM'ing on a stray bulk drop.

## Browser support

Latest Chrome, Firefox, and Safari. First time you batch-download, your browser will ask once whether to allow multiple downloads — click **Allow**, and the rest of the batch flows through automatically.

## Tech

- Three static files in `src/`: `index.html`, `style.css`, `app.js`. No build step. No `npm install`. No framework.
- [PDF.js](https://mozilla.github.io/pdf.js/) 3.11.174 for PDF parsing and rendering
- [jsPDF](https://github.com/parallax/jsPDF) 2.5.1 for rebuilding PDFs
- Both (plus the PDF.js worker) loaded from [cdnjs](https://cdnjs.cloudflare.com) at page load — no other network traffic at runtime

## Documentation

- **[PRD.md](./PRD.md)** — product requirements: what the app does, UI layout, features, rejected alternatives, non-functional requirements
- **[DESIGN.md](./DESIGN.md)** — visual spec: color tokens, typography, spacing, radii, elevation, motion, per-element specs
- **[TECH.md](./TECH.md)** — technical design: state model, compression pipelines, memory model, cancellation, behavioral edge cases, deployment

## Running locally

Just double-click `src/index.html` — the `file://` protocol works (all libraries are loaded over HTTPS from cdnjs, no CORS issue).

Or if you prefer a local server:

```bash
cd src
python3 -m http.server 8080
# open http://localhost:8080/
```

## Deployment

Pushing to `main` automatically publishes `src/` to GitHub Pages via `.github/workflows/deploy.yml`. One-time repo setup: **Settings → Pages → Source: GitHub Actions**.

## License

MIT. Do what you want.
