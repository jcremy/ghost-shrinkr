# GhostShrinkr — Product Requirements Document

**Type:** Single-page web application (static HTML + JS, no backend)
**Audience:** Internal use — IT consultant compressing receipts and invoices for accounting
**Core constraint:** All processing happens client-side. No file data leaves the browser.

---

## 1. Overview

GhostShrinkr is a browser-based tool for batch-compressing JPG images and PDF files before sending them to an accountant. The user drops files, optionally inspects the result before committing, then downloads the compressed copies individually into the browser's default Downloads folder. No account, no server, no zip archive to unpack.

**Design principles:**

- **Privacy first.** Files never leave the browser tab — hence "ghost". Close the tab and nothing remains.
- **Zero friction for the default case.** Drop → Shrink → done. Any power-user feature (per-file settings, preview, cancel) is available but tucked away so first-time users never trip over it.
- **Honest semantics.** If the tool decides it can't beat the original (e.g. a vector PDF), it keeps the original rather than silently degrading it.

---

## 2. Supported file types

- **Images:** `.jpg`, `.jpeg` (case-insensitive)
- **Documents:** `.pdf` (case-insensitive)

Other file types are rejected with a toast: `"{filename}: unsupported"`. They are not added to the list.

---

## 3. Page layout

Single scrollable column, max-width 720 px, centered. Sections top to bottom:

1. **Header** — app name, tagline, settings gear (⚙), theme toggle
2. **Drop zone** — always visible
3. **File list** — appears when at least one file is loaded
4. **Bottom action bar** — appears when at least one file is loaded

---

## 4. Drop zone

- Full-width bordered area accepting drag-and-drop or click-to-browse
- Accepts multiple files in one operation
- Visual feedback on drag-over
- Shows an immediate "Reading files…" overlay on drop so the user gets feedback even if the browser is slow to surface the file metadata
- New files are appended to the existing list (never replace it)
- Files appear progressively (one card per frame) rather than all at once, so the UI stays responsive on large drops

---

## 5. File list

Each file is a card. Cards appear in the order files were added.

### 5.1 Card anatomy

```
[●] [JPG] filename.jpg                   [⚙] [Check] [Remove]
      1.2 MB → 0.4 MB  −67%
```

- **Status dot (●)** — small colored circle indicating state (grey=pending, amber pulsing=processing, green=done, red=error)
- **Type pill** — small colored label: **JPG** in blue, **PDF** in amber orange. Provides a visual anchor when scanning a mixed list.
- **Filename** — truncated with ellipsis if too long
- **Meta line** — size info (see card states)
- **Progress bar** — thin bar visible only during PDF processing, updated per page

### 5.2 Card states

- **`pending`** — original size shown · actions: ⚙, Check, Remove
- **`processing`** — `Page N / M…` or `Processing…` · progress bar visible · no actions (cancel via the action bar)
- **`done`** — `original → compressed −X%` + blue `· ready` hint if not yet downloaded · actions: ⚙, View (if blob still in memory), Remove
- **`error`** — error message shown · actions: Retry, Remove

### 5.3 Per-card settings (⚙)

Clicking the gear on a card expands an inline panel beneath the card row:

- **JPG** — `Resize` (25–100 %) and `Quality` (30–95 %)
- **PDF** — `DPI` (72–220) and `Quality` (30–95 %)
- **Reset to defaults** link — copies the current global values back into this card, clearing its "customized" flag

Tweaking any slider on a card that's already `done` automatically rewinds the card to `pending` so the user can re-Check or Shrink with the new values. Dragging is not interrupted — the rewind happens on slider release, not on every input event.

### 5.4 Per-card actions

- **Check** (pending only) — runs the real compression pipeline with the card's current settings, but **does not download**. The card flips to `done` with a blue `· ready` hint. Lets the user see the resulting size and inspect quality before committing. Only one "checked" blob is kept in memory at a time — checking a second card clears the first one.
- **View** (done, blob still in memory) — opens the compressed blob in a new browser tab using the native image/PDF viewer. The user can inspect artifacts, zoom, scroll pages, etc.
- **Remove** — drops the file from the list

---

## 6. Settings popover (global ⚙)

A gear button in the top-right of the header opens a small popover anchored below it. The popover contains:

- **Filename** group — `Suffix` text field with an enabled/disabled checkbox. When enabled (default), the suffix is appended to downloaded filenames before the extension: `receipt.jpg` → `receipt_comp.jpg`. When disabled, files download with their original name and the text input is visibly greyed out.
- **JPG** group — `Resize` and `Quality` sliders
- **PDF** group — `DPI` and `Quality` sliders
- **Reset to defaults** link — restores factory values (suffix `_comp`, enabled; JPG 67/72; PDF 130/78)

The popover closes via the ✕ button, Escape key, clicking outside, or clicking the gear again.

### 6.1 Cascade to pending files

Changes in the global popover propagate to files that are:

- in `pending` status, AND
- have not been individually customized via their per-card ⚙

Files in `done`, `processing`, or `error`, and files flagged as "customized", are left alone — they keep whatever settings they already had. The per-card "Reset to defaults" link clears the customized flag and re-syncs that card with globals.

---

## 7. Bottom action bar

Visible when files are present. Contains:

- **Stats** (left):
  - Before compression: `N file(s) ready`
  - After compression: `−X% saved · Y MB → Z MB`
- **Cancel** — visible only while a Check or Shrink is in progress (see §9)
- **Clear all** — removes all files
- **Shrink** (primary):
  - Label: `Shrink N files ↓` where N = (pending files) + (checked-but-not-yet-downloaded files)
  - Disabled when nothing is actionable (everything already downloaded, or list is empty)
  - On click: compresses all remaining pending files, then triggers an individual download for every file that has a compressed blob and hasn't been handed off to the browser yet

---

## 8. Download behavior

- Each compressed file downloads as a separate browser download
- Filenames are `{original_name}{suffix}.{ext}` if the suffix checkbox is enabled, otherwise `{original_name}.{ext}`
- A ~150 ms delay between consecutive downloads prevents the browser from collapsing them into a single event
- Modern browsers prompt once per session when a site tries to download multiple files — the user clicks "Allow" once and subsequent downloads in the batch flow through automatically. This is browser behavior, not configurable.
- After download, the compressed blob is released from JS memory (the file is on disk now). The card remains visible showing the size delta, but the **View** button disappears.

---

## 9. Cancellation

During a Check or Shrink, a **Cancel** button appears in the action bar. Clicking it:

- Sets a cancellation flag checked at every natural breakpoint (between PDF pages, between files, after async steps in the pipeline)
- Aborts any in-flight PDF page render immediately via PDF.js's `RenderTask.cancel()`
- Rewinds the currently-processing file to `pending` (not `error`) — no red card, no partial blob
- Stops the batch after the current file unwinds; remaining pending files stay pending
- Leaves any files already downloaded in their `downloaded` state (cancellation does not undo work that's already on disk)

The button flips to "Cancelling…" until the current operation unwinds, then disappears.

---

## 10. Theme

A circular button in the top-right of the header toggles between light and dark modes. Light mode is Apple-inspired (off-white background, near-black text, system blue accent). Dark mode mirrors Apple's dark system palette.

**Initial state:**

- If the user has explicitly toggled the theme in a previous session, that choice is restored from `localStorage`
- Otherwise, follows the OS `prefers-color-scheme` setting, and tracks OS changes live (via `matchMedia` listener) as long as no explicit preference has been set

The theme is the **only** piece of state persisted across sessions. Everything else (files, settings, suffix, customized flags) resets on reload.

---

## 11. Limits & safety

- Per-file size cap: **100 MB** — larger files are rejected with a toast
- Total file count cap: **50 files** per session — drops beyond the cap are rejected
- These caps exist to prevent the browser tab from OOM'ing on accidental bulk drops

---

## 12. Rejected alternatives

Design choices that were considered, tried, or built and then removed. Documented so a future rebuild doesn't reintroduce them by accident.

- **Thumbnails on cards.** Originally each card rendered a thumb: JPG via `URL.createObjectURL(file)` and PDF via PDF.js page-1 rendering. The PDF path was expensive — it forced a full file read at drop time, concurrently for every PDF in the batch, producing a visible stall on bulk drops. Replaced with a colored "JPG"/"PDF" type pill (see §5.1). Drop time is now instant and memory-flat regardless of file size. **Do not reintroduce.**
- **"Re-shrink all" button.** When every file was done + downloaded, the primary button used to flip to `Re-shrink N files ↻` and reset everything back to pending on click. It felt redundant: if the user wants to re-run with different settings, tweaking any slider on a card already auto-resets that card to pending (§5.3), which re-enables the normal Shrink button. If they want to re-run with the *same* settings, they don't really. Removed in favor of a simple disabled state when nothing is actionable.
- **Keep all checked blobs in memory.** Initially Check stored every checked file's compressed blob so the user could compare multiple inspections side-by-side. In practice the user checks one, looks, decides, and moves on — so we now keep at most one checked blob at a time (§5.4). Saves substantial memory for bulk workflows.
- **Persist settings / suffix / files across reloads.** Tempting for convenience, rejected for consistency with the "ghost" privacy model. Close the tab, nothing remains. Theme preference is the **single** exception because it's one bit about UI appearance, not user content. If persistence is ever added, it should be opt-in with a visible indicator, not silent.
- **Batch download as a ZIP.** Simpler UX (one download) but the user has to unzip everything. For accountant workflows where files need to be individually attached to emails or uploaded to portals, loose files in the Downloads folder are faster than unzipping first.
- **Auto-compress on drop.** Would save a click for the trivial case but removes the ability to inspect/tweak before committing, and makes Cancel meaningless (the batch starts before the user can react). Kept the explicit Shrink button.
- **A per-card Download button.** Would let the user deliver a single file without running the whole batch. Rejected as clutter — the global Shrink button already handles single files correctly (N = 1 in the label). Per-card actions are kept minimal: ⚙, Check / View, Remove.
- **Preview as a cheap estimate** (rather than real compression). There's no shortcut to estimate JPEG or rasterized PDF size without actually encoding — any "fast estimate" would be a guess. Check does the real work and stores the result, which is both honest and useful (the same blob is then used by Shrink, so Check + Shrink has no extra compression cost).
- **Sliders locked to common presets** (Low / Medium / High). More discoverable for novices, but the target user is an IT consultant who wants to dial in exact DPI / quality. Free-form sliders with live value labels were simpler and more useful.

---

## 13. Non-functional requirements

- No server, no runtime network requests. Only static asset load + CDN library load at page load.
- CDN source: `cdnjs.cloudflare.com` only (PDF.js, jsPDF)
- Works in latest Chrome, Firefox, and Safari
- Responsive down to ~480 px width
- No build step — single self-contained `src/index.html`
- No cookies, no analytics, no tracking
- No persistence except theme preference (see §10)
- Accessibility: drop zone has keyboard fallback via the hidden file input, popover supports Escape/keyboard focus trap, all buttons have descriptive `aria-label` or `title` attributes
