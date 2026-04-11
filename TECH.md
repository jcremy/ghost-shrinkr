# GhostShrinkr — Technical Design

Implementation companion to [PRD.md](./PRD.md). Covers architecture, compression pipelines, memory model, cancellation, and deployment. The PRD answers *what and why*; this document answers *how*.

---

## 1. Stack

Three static files in `src/`:

- **`index.html`** — markup only. Pulls in CSS via `<link>` and JS via three `<script defer>` tags (PDF.js, jsPDF, app.js in that order).
- **`style.css`** — all styling. Color tokens, layout, buttons, animations. No framework, no preprocessor.
- **`app.js`** — all behaviour. State model, compression pipelines, rendering, event wiring. Plain DOM, no framework.

CDN dependencies (all from `cdnjs.cloudflare.com`):

- **PDF.js 3.11.174** — PDF parsing, page rendering, and text content inspection.
- **pdf.worker.min.js 3.11.174** — Web Worker spawned by PDF.js, loaded via `GlobalWorkerOptions.workerSrc`.
- **jsPDF 2.5.1** — reassembling rasterized pages into a new PDF.

**Why `<script defer>`:** defer guarantees scripts run in source order *after* HTML parsing. This makes app.js's top-level `document.getElementById(...)` calls safe without wrapping in `DOMContentLoaded`, and ensures `window.pdfjsLib` and `window.jspdf` exist before app.js references them.

**Why no build step:** The project is small enough that the cost of a bundler (config, lockfile, CI caching, source maps, version churn) outweighs its benefits. Opening `src/index.html` from `file://` runs the app identically to the Pages deployment.

**Why CDN instead of vendoring:** consistency (all three binaries come from the same place), no version-drift risk between the main PDF.js script and its worker, and the browser caches cdnjs assets across unrelated sites that use them. The trade-off is "the app won't work fully offline on first visit." If full offline is ever required, download the three files into `src/vendor/` and update the URLs.

CDN fetches happen once at page load. After that, zero network traffic leaves the browser.

---

## 2. State model

Everything lives in a single module-level `state` object:

```js
const state = {
  files: [],            // array of FileEntry (see below)
  isProcessing: false,  // true while a compress/download loop is running
  canceled: false,      // set by the Cancel button
  activeRenderTask: null, // PDF.js RenderTask handle for mid-render cancel
  suffix: "_comp",
  suffixEnabled: true,
  defaults: {
    jpg: { resize: 67, quality: 72 },   // % / %
    pdf: { dpi: 130, quality: 78 },     // dpi / %
  },
};
```

Each `FileEntry` carries:

```js
{
  id,                // random short id
  file,              // the original File handle
  kind,              // "jpg" | "pdf"
  status,            // "pending" | "processing" | "done" | "error"
  origSize,
  compSize,
  compBlob,          // the compressed output, or null after download
  downloaded,        // true once handed off to the browser
  err,               // error message if status === "error"
  pageN, pageTotal,  // PDF progress
  noGain,            // true if we kept the original because compression wouldn't help
  expanded,          // is the per-card ⚙ panel open?
  customized,        // has the user touched this card's sliders?
  settings,          // { resize, quality } or { dpi, quality }
}
```

### Rendering

A single `render()` function rebuilds the file list from `state.files` on every meaningful state change. Naive but cheap — worst case is 50 cards, which the DOM handles without any keyed reconciliation. There are no virtual scroll tricks.

The settings popover and action bar are updated imperatively by directly setting values/disabled states on pre-existing DOM elements, not re-built. This matters for the global sliders: if we rebuilt them from scratch on render, the user's slider drag would be interrupted mid-motion.

### Factory defaults

A frozen object `FACTORY_DEFAULTS` seeds `state.defaults` and `state.suffix(Enabled)` on init. The "Reset to defaults" buttons in the global popover and per-card panels read from it (popover) or from `state.defaults` (per-card — "reset to current globals", not to factory).

---

## 3. Compression pipelines

### 3.1 JPG

Steps (`compressJpg`):

1. `createImageBitmap(file, { imageOrientation: "from-image" })` — reads the file bytes, decodes, and **applies EXIF orientation natively**. This replaces manual EXIF parsing and Just Works for phone photos shot sideways.
2. Compute target dimensions: `round(origWidth * resize / 100)` × `round(origHeight * resize / 100)`, floored at 1 px.
3. Draw the bitmap onto a `<canvas>` at the target size.
4. `canvas.toBlob(_, "image/jpeg", quality / 100)`.
5. **No-gain fallback**: if the resulting blob is ≥ the original's size, discard it and return the original `File` instead. The card still flips to `done` but with a "kept original (no gain)" meta and `noGain = true`.

No tunable thresholds — quality and resize come from the entry's per-file settings, which were copied from `state.defaults.jpg` at drop time (or tweaked since).

### 3.2 PDF

Steps (`compressPdf`):

1. **Size skip**: if `file.size < 100 KB`, return the original as-is. Small PDFs almost never benefit from rasterization and often get larger.
2. Read the entire file into an `ArrayBuffer`, then feed it to `pdfjsLib.getDocument({ data })`.
3. **Vector skip**: call `getPage(1).getTextContent()` and count characters. If > 50, the PDF is considered vector-native (Word/Excel/invoicing output) and rasterizing it will probably make it *bigger*, not smaller. Return the original and mark the card `noGain` with a "(vector — kept as-is)" meta.
4. For each page `i = 1..total`:
   1. `page.getViewport({ scale: 1 })` → gives page size in PDF points.
   2. `page.getViewport({ scale: dpi / 72 })` → gives the render viewport (scale factor is how PDF.js expresses DPI; 72 DPI == scale 1 == 1 canvas pixel per PDF point).
   3. Create an offscreen canvas of the render viewport's size, fill white (so transparent PDFs don't go black), call `page.render(...)`, **store the `RenderTask` in `state.activeRenderTask`** for cancellation.
   4. `canvas.toDataURL("image/jpeg", quality / 100)`.
   5. Add the page to a new jsPDF document at the original page size (so the output PDF has the same dimensions as the source; the rasterized JPEG is scaled into that space).
   6. Update `entry.pageN` and call `render()` so the card's progress bar advances.
   7. `await new Promise(r => setTimeout(r, 0))` — yield a tick to let the UI paint.
5. `pdf.output("blob")` → final compressed PDF.
6. **No-gain fallback**: if the result is ≥ the original, discard it and return the original. Common for PDFs that were already aggressively optimized.

### 3.3 Known limitations

- **Rasterization destroys vector text.** The vector skip (3.2, step 3) partially mitigates this but only checks page 1. A PDF with a scanned page 1 and vector pages 2+ will rasterize everything.
- **No OCR, no metadata preservation, no form fields, no bookmarks, no hyperlinks.** The output PDF is a stack of images and nothing more.
- **JPEG encoding is not interruptible mid-operation.** `canvas.toBlob` is atomic; a cancel during a single JPG encode has to wait for it to finish (tens of ms even for large images). PDFs are cancellable between pages and mid-page-render.

---

## 4. Memory model

### 4.1 Original files are lazy

The `File` objects we receive from the drop event are **handles to disk files**, not buffers. Accessing `.name`, `.size`, `.type` is free. JS only pulls bytes into the heap when we explicitly call `.arrayBuffer()`, `createImageBitmap()`, or similar.

So the 50-file cap does not correspond to 50 × 100 MB of RAM — at rest, the originals cost essentially nothing. Bytes are loaded only for the file currently being compressed, then released immediately after.

### 4.2 Compressed blobs

The only meaningful JS memory cost is `entry.compBlob` for files that have been Checked or Shrunk. Two rules keep this minimal:

1. **At most one "checked" blob at a time.** `previewOne()` iterates `state.files` and resets any file in `done && !downloaded` state back to `pending` before compressing the new one. Checking file B silently discards file A's cached blob.
2. **Blobs are freed immediately after download.** In `shrinkAll()`'s download loop, `entry.compBlob = null` right after the `downloadBlob()` call. The file is on disk now; the blob serves no further purpose.

The `View` button is conditionally rendered on `entry.compBlob !== null`, so once a file is downloaded (and its blob nulled), View disappears.

### 4.3 Object URLs

`downloadBlob()` and `openCompressed()` both call `URL.createObjectURL()`. For downloads, the URL is revoked on the next tick. For `View`, the URL must remain valid for the new tab's lifetime, so we don't revoke it — this is a tiny per-click leak (URL handle, not the underlying bytes) that is negligible in practice.

### 4.4 No thumbnails

An earlier version generated JPG thumbnails via `URL.createObjectURL` and PDF thumbnails by fully loading each PDF and rendering page 1. The PDF path was the expensive one — it forced a full file read at drop time, concurrently for every PDF in the batch. We dropped thumbnails entirely and replaced them with colored type-pill labels (`JPG`/`PDF`). Drop time is now instant and memory-flat regardless of file size.

---

## 5. Cancellation

A shared `state.canceled` flag, set by the Cancel button, is checked at every natural yield point:

- Start of each iteration in `shrinkAll()`'s compress loop
- Start of each iteration in `shrinkAll()`'s download loop
- Start of each page in `compressPdf()`
- After each `await` in `compressPdf()` (arrayBuffer, getDocument, text inspection) via `throwIfCanceled()`
- After `compressJpg()` returns

A `CanceledError` class is thrown at these points. `compressOne()` catches it (or `state.canceled === true` regardless of what was thrown) and rewinds the entry to `pending` rather than flipping it to `error`.

For **mid-render PDF cancellation**, we store the in-flight `RenderTask` on `state.activeRenderTask` when starting a page render. The Cancel handler calls `state.activeRenderTask.cancel()` if one is present, which makes PDF.js reject the render promise with a `RenderingCancelledException`. We catch that and convert it to `CanceledError`.

After cancellation unwinds:

- Files already downloaded stay downloaded (the download cannot be undone)
- The currently-processing file is back to `pending`
- All remaining `pending` files are untouched
- `state.canceled` and `state.isProcessing` are reset

---

## 6. Theme persistence

The only exception to the "no persistence" rule. On load:

1. Try to read `localStorage["ghostshrinkr.theme"]`. If it's `"dark"` or `"light"`, use it.
2. Otherwise, use `matchMedia("(prefers-color-scheme: dark)").matches` → `"dark" | "light"`.

On toggle click, we write the new value to `localStorage`. A `matchMedia` change listener updates the theme live **only when no explicit preference exists in localStorage**, so users who haven't toggled continue to track their OS setting.

All `localStorage` calls are wrapped in `try/catch` so the toggle still works in private/ephemeral browser modes where storage is disabled.

---

## 7. Behavioral edge cases

A handful of small implementation decisions that are easy to get wrong and hard to reverse-engineer from a feature list.

### 7.1 Slider events: `input` vs `change`

Per-card and global sliders bind **two** events, not one:

- **`input`** — fires continuously while dragging. Updates `entry.settings[key]` and the live value label in place. For per-card sliders, also flips `entry.customized = true`.
- **`change`** — fires only on release (`mouseup`/touch end). For per-card sliders, this is where we call `resetToPending(entry)` **if** the card was already `done`.

The split matters: if we reset-to-pending on `input`, `render()` would rebuild the card while the user is still dragging, the slider DOM element would be replaced mid-drag, and the interaction would die. By deferring the expensive state transition to `change`, the drag feels smooth and the rewind only happens once, on release.

Global sliders only wire `input`. No rewind needed — they just cascade to pending files.

### 7.2 `customized` flag lifecycle

Tracks "has the user manually touched this card's settings?"

- Initial value on file add: `false`.
- Set to `true` by any per-card slider's `input` event (step 7.1).
- Set back to `false` by the per-card **Reset to defaults** button.
- Read by `cascadeDefaultsToPending()` — a global change only updates entries whose `customized === false`.

This is the whole mechanism behind "my per-file tweak won't get overwritten by a later global change." Without it, global changes would quietly clobber user customizations.

### 7.3 `downloaded` flag lifecycle

Tracks "has this file's compressed blob been handed off to the browser for download?"

- Initial value on file add: `false`.
- Set to `true` inside the download loop in `shrinkAll()`, after `downloadBlob()` returns. Immediately followed by `entry.compBlob = null` (the bytes are on disk, we don't need them in JS).
- Cleared by `resetToPending(entry)` alongside `compBlob = null`.

Used in two places:

1. **Shrink button label** — counts `pending + (done && !downloaded)` files. If everything is downloaded, button disables.
2. **View button** — rendered only if `e.status === "done" && e.compBlob !== null`. Downloaded files lose the View button because the blob is gone.

The check-then-clear order matters. If we nulled `compBlob` before setting `downloaded = true`, a crash/re-render mid-flight would leave the file in a confusing state where it's "done" but has neither a blob nor a downloaded flag.

### 7.4 Progressive file intake

`addFiles()` is `async` and calls `await new Promise(r => requestAnimationFrame(() => r()))` between each file. Why:

- **The UX complaint:** dropping 5+ big files used to feel stuck — the whole batch would process before any card appeared. Browser drop handling + our synchronous loop combined into a visible stall.
- **The fix:** append one entry, call `render()`, yield a frame, repeat. On a fast drop this is imperceptible (<16 ms × N). On a slow drop the cards appear one-by-one, turning the stall into a progressive reveal that feels responsive.
- **Why `requestAnimationFrame` and not `setTimeout(0)`:** rAF aligns with the browser's paint tick, so the newly-appended card actually gets painted before the next iteration runs. `setTimeout(0)` sometimes fires before the paint.

In tandem, the drop handler synchronously copies `e.dataTransfer.files` into a regular array (FileLists can go stale after the drop event returns) and adds a `.loading` class to the drop zone immediately, before calling `addFiles`. This paints an overlay during the first frame so the user sees something happen even before the first card lands.

### 7.5 The 150 ms download delay

Between consecutive `downloadBlob()` calls in `shrinkAll()`, we wait 150 ms. Reason: modern browsers collapse rapid-fire programmatic downloads into a single "download multiple files" event. Without the delay, a 5-file batch might trigger one download dialog instead of five.

150 ms was picked empirically — tight enough that a 50-file batch still feels snappy, loose enough that Chrome/Safari/Firefox all treat the downloads as distinct. Reducing this to 0 breaks batching in Chrome. Increasing it to 500 ms is noticeably sluggish.

### 7.6 Single-blob cache on Check

`previewOne(entry)` iterates `state.files` and rewinds any *other* file in `done && !downloaded` state back to `pending` before compressing the new one. Effect: at most one "checked" blob in memory at a time.

Rationale: Check is for quality inspection, not batch pre-processing. The user clicks Check, looks at the result, decides, and moves on. They almost never want to keep three checked blobs simultaneously. By rewinding old checks, we trade a small re-compression cost (if the user hits Shrink later and those files are now pending) for predictable, minimal memory use.

### 7.7 Vector-PDF detection is page-1-only

`compressPdf()` inspects `doc.getPage(1).getTextContent()` and checks if character count > 50. This is the only vector-detection heuristic. Consequences:

- A PDF where page 1 is a scanned receipt but pages 2–N are vector invoices will get rasterized, likely bloating the vector pages.
- A PDF where page 1 is a title page with 40 characters of vector text and the rest is scanned might be incorrectly skipped.

Both are rare in an accountant's workflow and the no-gain fallback catches the bloat case. Per-page inspection would double the parse cost for no meaningful win in this use case.

### 7.8 Resetting: factory vs. current globals

Two separate "Reset to defaults" actions, and they mean different things:

- **Popover reset** — restores `state.defaults` and `state.suffix` from the frozen `FACTORY_DEFAULTS` constant. Snaps the global sliders to 67/72/130/78 and the suffix to `"_comp"`. Cascades to pending non-customized files.
- **Per-card reset** — copies from *current* `state.defaults` into `entry.settings` and clears `entry.customized`. If the user has changed globals, per-card reset adopts those, not factory.

The per-card button's label ("Reset to defaults") is a bit ambiguous — "defaults" here means "the current globals", not "the factory values". Documented in PRD §5.3. If both labels caused confusion in practice, renaming the per-card one to "Match globals" would be clearer.

---

## 8. Deployment

Pushing to `main` publishes `src/` to GitHub Pages via `.github/workflows/deploy.yml`. The workflow uses the standard `actions/configure-pages` + `actions/upload-pages-artifact` + `actions/deploy-pages` combo, uploading only the contents of `src/` (not the whole repo). One-time repo setup: **Settings → Pages → Source: GitHub Actions**.

The deployed site is a single HTML file plus whatever cdnjs libraries it fetches. No server runtime, no environment variables, no secrets.

**Live URL:** `https://jcremy.github.io/ghost-shrinkr/`

---

## 9. File layout

```
ghost-shrinkr/
├── src/
│   ├── index.html          # markup
│   ├── style.css           # styling
│   └── app.js              # behaviour
├── .github/
│   └── workflows/
│       └── deploy.yml      # Pages deploy on push to main
├── .gitignore
├── CLAUDE.md               # project-level rules for Claude (commit style, etc.)
├── LICENSE                 # MIT
├── README.md               # user-facing intro + live link
├── PRD.md                  # product spec (what/why)
├── DESIGN.md               # visual spec (colors, typography, spacing)
└── TECH.md                 # this file (how)
```

Running locally: open `src/index.html` directly in the browser. The `file://` protocol works because `style.css` and `app.js` are loaded as relative paths (no CORS issue) and all CDN libraries are served over HTTPS.
