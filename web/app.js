// ============================================================
// GhostShrinkr — all processing is local. No network at runtime.
// ============================================================

const MAX_FILES = 50;
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const DOWNLOAD_DELAY_MS = 150;
const PDF_SKIP_SIZE = 100 * 1024;
const PDF_VECTOR_TEXT_THRESHOLD = 50;

// Runtime-populated app version. Stays "NA" in the web version (nothing
// sets it). In the Tauri build, startup code below asks the Rust binary
// for its Cargo.toml version and updates this variable. Single source of
// truth is the git tag → Cargo.toml → binary chain; no CI sync needed
// for this file.
let APP_VERSION = "NA";

// PDF.js worker
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
}

// Factory defaults — the baseline used for a fresh session and when
// the user hits "Reset to defaults" in the settings popover.
const FACTORY_DEFAULTS = Object.freeze({
  suffix: "_comp",
  suffixEnabled: true,
  jpg: Object.freeze({ resize: 67, quality: 72 }),
  pdf: Object.freeze({ dpi: 130, quality: 78 }),
});

// ----- state -----
// state.defaults are the globals used as templates for new files.
// Per-card settings can override them via the ⚙ panel. When the user
// changes a global, it cascades to pending files that haven't been
// individually customized (entry.customized === false).
const state = {
  files: [],
  isProcessing: false,
  canceled: false,
  activeRenderTask: null,
  suffix: FACTORY_DEFAULTS.suffix,
  suffixEnabled: FACTORY_DEFAULTS.suffixEnabled,
  defaults: {
    jpg: { ...FACTORY_DEFAULTS.jpg },
    pdf: { ...FACTORY_DEFAULTS.pdf },
  },
};

// ----- helpers -----
const genId = () => Math.random().toString(36).slice(2, 10);

function fmtBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / 1024 / 1024).toFixed(2) + " MB";
}

function fmtPct(delta) {
  const p = Math.round(delta * 100);
  return (p >= 0 ? "−" : "+") + Math.abs(p) + "%";
}

function kindOf(file) {
  const n = file.name.toLowerCase();
  if (n.endsWith(".jpg") || n.endsWith(".jpeg") || file.type === "image/jpeg") return "jpg";
  if (n.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  return null;
}

function withSuffix(filename, suffix) {
  if (!suffix) return filename;
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return filename + suffix;
  return filename.slice(0, dot) + suffix + filename.slice(dot);
}

function toast(msg, kind) {
  const el = document.createElement("div");
  el.className = "toast" + (kind === "error" ? " error" : "");
  el.textContent = msg;
  document.getElementById("toasts").appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .3s";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// ----- file intake -----
// Snapshot the FileList synchronously (FileLists can go stale after
// the drop event ends), then append entries one by one with a yield
// between each so the UI paints a new card on every tick instead of
// freezing until the whole batch is processed.
async function addFiles(fileList) {
  const incoming = Array.from(fileList);
  for (const f of incoming) {
    const kind = kindOf(f);
    if (!kind) {
      toast(`${f.name}: unsupported`, "error");
      continue;
    }
    if (!f.size || f.size === 0) {
      toast(`${f.name}: file appears empty — if picking from a cloud drive (Google Drive, iCloud, Dropbox), try downloading it locally first`, "error");
      continue;
    }
    if (f.size > MAX_FILE_BYTES) {
      toast(`${f.name}: too big (max 100 MB)`, "error");
      continue;
    }
    if (state.files.length >= MAX_FILES) {
      toast(`Max ${MAX_FILES} files — extra ignored`, "error");
      break;
    }
    const entry = {
      id: genId(),
      file: f,
      kind,
      status: "pending",
      origSize: f.size,
      compSize: 0,
      compBlob: null,
      downloaded: false,
      err: "",
      pageN: 0,
      pageTotal: 0,
      noGain: false,
      expanded: false,
      customized: false,
      menuOpen: false,
      settings: { ...state.defaults[kind] },
    };
    state.files.push(entry);
    render();
    // Yield a frame so the just-appended card paints before we touch
    // the next file. On a fast machine this is imperceptible; on a
    // slow drop it turns the stall into a progressive reveal.
    await new Promise((r) => requestAnimationFrame(() => r()));
  }
}

function removeFile(id) {
  const i = state.files.findIndex((f) => f.id === id);
  if (i >= 0) {
    state.files.splice(i, 1);
    render();
  }
}

function clearAll() {
  state.files = [];
  render();
}

function resetToPending(entry) {
  entry.status = "pending";
  entry.compBlob = null;
  entry.compSize = 0;
  entry.downloaded = false;
  entry.noGain = false;
  entry.err = "";
  entry.pageN = 0;
  entry.pageTotal = 0;
}

async function previewOne(entry) {
  if (state.isProcessing) return;

  // Keep at most one checked (but not yet downloaded) blob in memory.
  // Any other file sitting in "done-not-downloaded" state gets rewound
  // to pending so its compBlob can be garbage-collected.
  for (const f of state.files) {
    if (f === entry) continue;
    if (f.status === "done" && !f.downloaded && f.compBlob) {
      resetToPending(f);
    }
  }

  state.isProcessing = true;
  state.canceled = false;
  render();
  await compressOne(entry);
  state.isProcessing = false;
  state.canceled = false;
  render();
}

function openCompressed(entry) {
  if (!entry.compBlob) return;
  const url = URL.createObjectURL(entry.compBlob);
  window.open(url, "_blank");
  // Object URL stays valid for the life of the new tab; no explicit revoke.
}

// ----- share (Web Share API) -----
// Hand off a compressed file to the OS share sheet (iOS Share, macOS Share,
// Android Share, etc.) so the user can send it straight to WhatsApp, Mail,
// Messages, AirDrop, and so on — no Downloads-folder round-trip required.
// Feature-detected: the Share button only appears in browsers that actually
// support file sharing (Chrome, Edge, Safari 15+; Firefox has no Web Share).
const HAS_SHARE_API =
  typeof navigator !== "undefined" && typeof navigator.canShare === "function";

function effectiveName(entry) {
  return withSuffix(entry.file.name, state.suffixEnabled ? state.suffix : "");
}

function buildShareFile(entry) {
  if (!entry.compBlob) return null;
  const type =
    entry.compBlob.type ||
    entry.file.type ||
    (entry.kind === "jpg" ? "image/jpeg" : "application/pdf");
  return new File([entry.compBlob], effectiveName(entry), { type });
}

function canShareEntry(entry) {
  if (!HAS_SHARE_API) return false;
  // Feature-detect against the original File — same MIME type as the
  // compressed output, so if the browser can share the input it can share
  // the result. Lets us show the Share button on pending cards too.
  try {
    return navigator.canShare({ files: [entry.file] });
  } catch (_) {
    return false;
  }
}

async function shareOne(entry) {
  // If the file hasn't been compressed yet, compress now. Reuses
  // previewOne's single-blob-in-memory rule so sharing B clears A's cache.
  if (entry.status === "pending") {
    await previewOne(entry);
    if (entry.status !== "done" || !entry.compBlob) return; // canceled or errored
  }
  const f = buildShareFile(entry);
  if (!f) return;
  try {
    await navigator.share({ files: [f], title: f.name });
  } catch (e) {
    // AbortError fires when the user cancels the share sheet — not an error.
    if (e && e.name !== "AbortError") {
      toast("Share failed", "error");
    }
  }
}

// ----- compression: JPG -----
async function compressJpg(file, settings) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = settings.resize / 100;
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close && bitmap.close();
  const blob = await new Promise((res, rej) => {
    canvas.toBlob(
      (b) => (b ? res(b) : rej(new Error("Encode failed"))),
      "image/jpeg",
      settings.quality / 100
    );
  });
  return blob;
}

class CanceledError extends Error {
  constructor() { super("canceled"); this.name = "CanceledError"; }
}
function throwIfCanceled() {
  if (state.canceled) throw new CanceledError();
}

// ----- compression: PDF -----
async function compressPdf(entry) {
  const file = entry.file;
  const s = entry.settings;
  if (file.size < PDF_SKIP_SIZE) {
    entry.noGain = true;
    return file;
  }
  const buf = await file.arrayBuffer();
  throwIfCanceled();
  const data = new Uint8Array(buf);
  const doc = await window.pdfjsLib.getDocument({ data }).promise;
  throwIfCanceled();

  // Vector detection on page 1
  try {
    const page1 = await doc.getPage(1);
    const text = await page1.getTextContent();
    const chars = text.items.reduce((a, it) => a + (it.str ? it.str.length : 0), 0);
    if (chars > PDF_VECTOR_TEXT_THRESHOLD) {
      entry.noGain = true;
      try { doc.destroy(); } catch (_) {}
      return file;
    }
  } catch (_) {
    // If we can't inspect, fall through to rasterization.
  }
  throwIfCanceled();

  const total = doc.numPages;
  entry.pageTotal = total;
  entry.pageN = 0;

  const { jsPDF } = window.jspdf;
  let pdf = null;
  const renderScale = s.dpi / 72;
  const jpegQuality = s.quality / 100;

  try {
    for (let i = 1; i <= total; i++) {
      throwIfCanceled();
      const page = await doc.getPage(i);
      const vpPt = page.getViewport({ scale: 1 });
      const widthPt = vpPt.width;
      const heightPt = vpPt.height;
      const vpRender = page.getViewport({ scale: renderScale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(vpRender.width));
      canvas.height = Math.max(1, Math.floor(vpRender.height));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Store the active render task so the Cancel button can abort
      // it mid-render instead of waiting for the page to finish.
      const task = page.render({ canvasContext: ctx, viewport: vpRender, background: "white" });
      state.activeRenderTask = task;
      try {
        await task.promise;
      } catch (e) {
        if (state.canceled || (e && e.name === "RenderingCancelledException")) {
          throw new CanceledError();
        }
        throw e;
      } finally {
        state.activeRenderTask = null;
      }

      const jpegDataUrl = canvas.toDataURL("image/jpeg", jpegQuality);
      const orientation = widthPt > heightPt ? "landscape" : "portrait";

      if (i === 1) {
        pdf = new jsPDF({
          unit: "pt",
          format: [widthPt, heightPt],
          orientation,
          compress: true,
        });
      } else {
        pdf.addPage([widthPt, heightPt], orientation);
      }
      pdf.addImage(jpegDataUrl, "JPEG", 0, 0, widthPt, heightPt, undefined, "FAST");

      entry.pageN = i;
      render();
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    try { doc.destroy(); } catch (_) {}
  }

  const out = pdf.output("blob");
  if (out.size >= file.size) {
    entry.noGain = true;
    return file;
  }
  return out;
}

// ----- compression orchestration -----
async function compressOne(entry) {
  entry.status = "processing";
  entry.err = "";
  entry.noGain = false;
  render();
  try {
    let blob;
    if (entry.kind === "jpg") {
      blob = await compressJpg(entry.file, entry.settings);
      throwIfCanceled();
      if (blob.size >= entry.file.size) {
        entry.noGain = true;
        blob = entry.file;
      }
    } else {
      blob = await compressPdf(entry);
    }
    throwIfCanceled();
    entry.compBlob = blob;
    entry.compSize = blob.size;
    entry.status = "done";
  } catch (e) {
    if (state.canceled || (e && e.name === "CanceledError")) {
      entry.status = "pending";
      entry.compBlob = null;
      entry.compSize = 0;
      entry.pageN = 0;
      entry.pageTotal = 0;
    } else {
      entry.status = "error";
      entry.err = (e && e.message) || String(e);
    }
  }
  render();
}

async function shrinkAll() {
  if (state.isProcessing) return;

  const hasPending = state.files.some((f) => f.status === "pending");
  const hasUndownloaded = state.files.some(
    (f) => f.status === "done" && f.compBlob && !f.downloaded
  );
  if (!hasPending && !hasUndownloaded) return;

  state.isProcessing = true;
  state.canceled = false;
  render();

  // Compress every pending file first.
  for (const entry of state.files) {
    if (state.canceled) break;
    if (entry.status === "pending") await compressOne(entry);
  }

  // Then download every file that has a compressed blob and hasn't
  // been handed off to the browser yet. Once downloaded, drop the
  // blob reference — the file lives on disk now, we don't need to
  // hold a copy in JS memory.
  for (const entry of state.files) {
    if (state.canceled) break;
    if (entry.status !== "done" || !entry.compBlob) continue;
    if (entry.downloaded) continue;
    downloadBlob(entry.compBlob, effectiveName(entry));
    entry.downloaded = true;
    entry.compBlob = null;
    render();
    await new Promise((r) => setTimeout(r, DOWNLOAD_DELAY_MS));
  }

  state.isProcessing = false;
  state.canceled = false;
  render();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ----- rendering -----
const listEl = document.getElementById("file-list");
const barEl = document.getElementById("action-bar");
const statsEl = document.getElementById("stats");
const shrinkBtn = document.getElementById("shrink-btn");
const clearBtn = document.getElementById("clear-btn");
const cancelBtn = document.getElementById("cancel-btn");
const suffixInput = document.getElementById("suffix-input");

function render() {
  // List
  listEl.innerHTML = "";
  for (const e of state.files) {
    listEl.appendChild(renderCard(e));
  }

  // Action bar
  if (state.files.length === 0) {
    barEl.classList.add("hidden");
    return;
  }
  barEl.classList.remove("hidden");

  const pendingCount = state.files.filter((f) => f.status === "pending").length;
  const done = state.files.filter((f) => f.status === "done");
  const totalOrig = done.reduce((a, f) => a + f.origSize, 0);
  const totalComp = done.reduce((a, f) => a + f.compSize, 0);

  if (done.length === 0) {
    statsEl.textContent = `${state.files.length} file${state.files.length > 1 ? "s" : ""} ready`;
  } else if (totalOrig > 0) {
    const saved = 1 - totalComp / totalOrig;
    statsEl.innerHTML =
      `<span class="saved">${fmtPct(saved)} saved</span> · ` +
      `${fmtBytes(totalOrig)} → ${fmtBytes(totalComp)}`;
  }

  clearBtn.disabled = state.isProcessing;
  cancelBtn.classList.toggle("hidden", !state.isProcessing);
  cancelBtn.disabled = state.canceled;
  cancelBtn.textContent = state.canceled ? "Cancelling…" : "Cancel";
  suffixInput.disabled = state.isProcessing || !state.suffixEnabled;

  const undownloadedCount = done.filter((f) => !f.downloaded).length;
  const toDeliver = pendingCount + undownloadedCount;

  if (toDeliver > 0) {
    shrinkBtn.textContent = `Shrink ${toDeliver} file${toDeliver > 1 ? "s" : ""} ↓`;
    shrinkBtn.disabled = state.isProcessing;
  } else {
    shrinkBtn.textContent = "Shrink ↓";
    shrinkBtn.disabled = true;
  }
}

function renderCard(e) {
  const card = document.createElement("div");
  card.className = "card " + e.status;

  const row = document.createElement("div");
  row.className = "card-row";

  // Info
  const info = document.createElement("div");
  info.className = "info";

  const nameRow = document.createElement("div");
  nameRow.className = "name-row";

  const dot = document.createElement("span");
  dot.className = "status-dot";
  nameRow.appendChild(dot);

  const tag = document.createElement("span");
  tag.className = "type-tag type-" + e.kind;
  tag.textContent = e.kind.toUpperCase();
  nameRow.appendChild(tag);

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = e.file.name;
  nameRow.appendChild(name);

  info.appendChild(nameRow);

  const meta = document.createElement("div");
  meta.className = "meta";
  if (e.status === "pending") {
    meta.textContent = fmtBytes(e.origSize);
  } else if (e.status === "processing") {
    meta.textContent = e.pageTotal > 0 ? `Page ${e.pageN} / ${e.pageTotal}…` : "Processing…";
  } else if (e.status === "done") {
    if (e.noGain) {
      meta.textContent = `${fmtBytes(e.origSize)} · kept original (no gain)`;
    } else {
      const saved = 1 - e.compSize / e.origSize;
      meta.textContent = `${fmtBytes(e.origSize)} → ${fmtBytes(e.compSize)}`;
      const savedSpan = document.createElement("span");
      savedSpan.className = "saved";
      savedSpan.textContent = " " + fmtPct(saved);
      meta.appendChild(savedSpan);
    }
    if (!e.downloaded) {
      const pending = document.createElement("span");
      pending.className = "pending-download";
      pending.textContent = " · ready";
      meta.appendChild(pending);
    }
  } else if (e.status === "error") {
    meta.textContent = e.err || "Error";
  }
  info.appendChild(meta);

  if (e.status === "processing") {
    const progress = document.createElement("div");
    progress.className = "progress";
    const bar = document.createElement("div");
    if (e.pageTotal > 0) {
      bar.style.width = Math.round((e.pageN / e.pageTotal) * 100) + "%";
    } else {
      bar.style.width = "35%";
    }
    progress.appendChild(bar);
    info.appendChild(progress);
  }

  row.appendChild(info);

  // Actions — desktop renders the row inline, mobile collapses it into
  // a burger menu via CSS. Same markup for both breakpoints.
  const actions = document.createElement("div");
  actions.className = "actions" + (e.menuOpen ? " open" : "");

  const burger = document.createElement("button");
  burger.type = "button";
  burger.className = "burger";
  burger.textContent = "⋯";
  burger.setAttribute("aria-label", "More actions");
  burger.setAttribute("aria-expanded", e.menuOpen ? "true" : "false");
  burger.disabled = state.isProcessing && e.status !== "processing";
  burger.onclick = (ev) => {
    ev.stopPropagation();
    for (const f of state.files) if (f !== e) f.menuOpen = false;
    e.menuOpen = !e.menuOpen;
    render();
  };
  actions.appendChild(burger);

  const menu = document.createElement("div");
  menu.className = "actions-menu";

  const canEdit = e.status !== "processing";

  if (canEdit) {
    const gear = document.createElement("button");
    gear.type = "button";
    gear.className = "gear" + (e.expanded ? " active" : "");
    gear.title = "Settings";
    gear.textContent = "⚙";
    gear.disabled = state.isProcessing;
    gear.onclick = () => {
      e.menuOpen = false;
      e.expanded = !e.expanded;
      render();
    };
    menu.appendChild(gear);
  }

  if (e.status === "pending") {
    const check = document.createElement("button");
    check.type = "button";
    check.className = "icon";
    check.textContent = "Check";
    check.title = "Compress with current settings — see the size and inspect the result before downloading";
    check.disabled = state.isProcessing;
    check.onclick = () => {
      e.menuOpen = false;
      previewOne(e);
    };
    menu.appendChild(check);

    if (canShareEntry(e)) {
      const share = document.createElement("button");
      share.type = "button";
      share.className = "icon";
      share.textContent = "Share";
      share.title = "Compress and send to another app (WhatsApp, Mail, Messages…)";
      share.disabled = state.isProcessing;
      share.onclick = () => {
        e.menuOpen = false;
        shareOne(e);
      };
      menu.appendChild(share);
    }
  }

  if (e.status === "done" && e.compBlob) {
    const view = document.createElement("button");
    view.type = "button";
    view.className = "icon";
    view.textContent = "View";
    view.title = "Open compressed file in a new tab";
    view.onclick = () => {
      e.menuOpen = false;
      openCompressed(e);
      render();
    };
    menu.appendChild(view);

    if (canShareEntry(e)) {
      const share = document.createElement("button");
      share.type = "button";
      share.className = "icon";
      share.textContent = "Share";
      share.title = "Send this file to another app (WhatsApp, Mail, Messages…)";
      share.onclick = () => {
        e.menuOpen = false;
        shareOne(e);
      };
      menu.appendChild(share);
    }
  }

  if (e.status === "error") {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "icon";
    retry.textContent = "Retry";
    retry.disabled = state.isProcessing;
    retry.onclick = () => {
      e.menuOpen = false;
      resetToPending(e);
      render();
    };
    menu.appendChild(retry);
  }

  if (canEdit) {
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "icon danger";
    rm.textContent = "Remove";
    rm.disabled = state.isProcessing;
    rm.onclick = () => {
      e.menuOpen = false;
      removeFile(e.id);
    };
    menu.appendChild(rm);
  }

  actions.appendChild(menu);
  row.appendChild(actions);
  card.appendChild(row);

  // Settings panel
  if (e.expanded && canEdit) {
    card.appendChild(renderSettings(e));
  }

  return card;
}

function renderSettings(e) {
  const panel = document.createElement("div");
  panel.className = "card-settings";

  if (e.kind === "jpg") {
    panel.appendChild(slider(e, "resize", "Resize", 25, 100, 1, (v) => v + " %"));
    panel.appendChild(slider(e, "quality", "Quality", 30, 95, 1, (v) => v + " %"));
  } else {
    panel.appendChild(slider(e, "dpi", "DPI", 72, 220, 1, (v) => v + " dpi"));
    panel.appendChild(slider(e, "quality", "Quality", 30, 95, 1, (v) => v + " %"));
  }

  const resetRow = document.createElement("div");
  resetRow.className = "card-settings-reset";
  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "icon";
  resetBtn.textContent = "Reset to defaults";
  resetBtn.disabled = state.isProcessing;
  resetBtn.onclick = () => {
    e.settings = { ...state.defaults[e.kind] };
    e.customized = false;
    if (e.status === "done") resetToPending(e);
    render();
  };
  resetRow.appendChild(resetBtn);
  panel.appendChild(resetRow);

  return panel;
}

function slider(entry, key, label, min, max, step, fmt) {
  const frag = document.createDocumentFragment();

  const lab = document.createElement("label");
  lab.textContent = label;

  const input = document.createElement("input");
  input.type = "range";
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = entry.settings[key];
  input.disabled = state.isProcessing;

  const val = document.createElement("span");
  val.className = "val";
  val.textContent = fmt(entry.settings[key]);

  // Live label update while dragging — no full render.
  input.addEventListener("input", () => {
    entry.settings[key] = Number(input.value);
    entry.customized = true;
    val.textContent = fmt(entry.settings[key]);
  });

  // On release, if the file was already done, reset to pending so the
  // user can re-shrink with the new values.
  input.addEventListener("change", () => {
    if (entry.status === "done") {
      resetToPending(entry);
      render();
    }
  });

  frag.appendChild(lab);
  frag.appendChild(input);
  frag.appendChild(val);
  return frag;
}

// ----- event wiring -----
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});
fileInput.addEventListener("change", (e) => {
  if (!e.target.files || !e.target.files.length) return;
  const snapshot = Array.from(e.target.files);
  e.target.value = "";
  dropzone.classList.add("loading");
  requestAnimationFrame(() => {
    addFiles(snapshot).finally(() => dropzone.classList.remove("loading"));
  });
});
["dragenter", "dragover"].forEach((ev) => {
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add("dragging");
  });
});
["dragleave", "drop"].forEach((ev) => {
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (ev === "dragleave" && e.target !== dropzone) return;
    dropzone.classList.remove("dragging");
  });
});
dropzone.addEventListener("drop", (e) => {
  if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
  // Snapshot immediately — FileList can be invalidated after this tick.
  const snapshot = Array.from(e.dataTransfer.files);
  dropzone.classList.add("loading");
  // Paint the loading state before touching the files.
  requestAnimationFrame(() => {
    addFiles(snapshot).finally(() => dropzone.classList.remove("loading"));
  });
});
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

shrinkBtn.addEventListener("click", shrinkAll);
clearBtn.addEventListener("click", clearAll);

cancelBtn.addEventListener("click", () => {
  if (!state.isProcessing || state.canceled) return;
  state.canceled = true;
  // If a PDF page is rendering right now, abort it so the active
  // compressOne() resolves immediately instead of finishing the page.
  if (state.activeRenderTask) {
    try { state.activeRenderTask.cancel(); } catch (_) {}
  }
  render();
});

// ----- settings popover (global defaults) -----
const settingsToggle = document.getElementById("settings-toggle");
const settingsPopover = document.getElementById("settings-popover");

const GLOBAL_FIELDS = [
  { id: "g-jpg-resize",   kind: "jpg", key: "resize",  fmt: (v) => v + " %" },
  { id: "g-jpg-quality",  kind: "jpg", key: "quality", fmt: (v) => v + " %" },
  { id: "g-pdf-dpi",      kind: "pdf", key: "dpi",     fmt: (v) => v + " dpi" },
  { id: "g-pdf-quality",  kind: "pdf", key: "quality", fmt: (v) => v + " %" },
];

function cascadeDefaultsToPending(kind, key) {
  // Propagate global change to pending, non-customized files of the same kind.
  for (const f of state.files) {
    if (f.kind !== kind) continue;
    if (f.status !== "pending") continue;
    if (f.customized) continue;
    f.settings[key] = state.defaults[kind][key];
  }
}

for (const field of GLOBAL_FIELDS) {
  const input = document.getElementById(field.id);
  const valEl = document.getElementById(field.id + "-val");
  input.value = state.defaults[field.kind][field.key];
  valEl.textContent = field.fmt(Number(input.value));

  input.addEventListener("input", () => {
    const v = Number(input.value);
    state.defaults[field.kind][field.key] = v;
    valEl.textContent = field.fmt(v);
    cascadeDefaultsToPending(field.kind, field.key);
    // Re-render any expanded cards so their inline sliders reflect the new value.
    const touched = state.files.some(
      (f) => f.kind === field.kind && f.status === "pending" && !f.customized && f.expanded
    );
    if (touched) render();
  });
}

suffixInput.addEventListener("input", () => {
  state.suffix = suffixInput.value;
});

const suffixEnabled = document.getElementById("suffix-enabled");
function applySuffixEnabled() {
  state.suffixEnabled = suffixEnabled.checked;
  suffixInput.disabled = !suffixEnabled.checked;
}
suffixEnabled.addEventListener("change", applySuffixEnabled);
applySuffixEnabled();

function setSettingsOpen(open) {
  settingsPopover.classList.toggle("hidden", !open);
  settingsToggle.setAttribute("aria-expanded", open ? "true" : "false");
}

settingsToggle.addEventListener("click", (ev) => {
  ev.stopPropagation();
  const isOpen = settingsToggle.getAttribute("aria-expanded") === "true";
  setSettingsOpen(!isOpen);
});

// Click outside to close
document.addEventListener("click", (ev) => {
  if (settingsToggle.getAttribute("aria-expanded") !== "true") return;
  if (settingsPopover.contains(ev.target)) return;
  if (settingsToggle.contains(ev.target)) return;
  setSettingsOpen(false);
});

// Close any open per-card burger menu on any document click. Burger
// button itself calls stopPropagation, so opening a menu survives; any
// other click closes every open menu in one pass.
document.addEventListener("click", () => {
  let changed = false;
  for (const f of state.files) {
    if (f.menuOpen) { f.menuOpen = false; changed = true; }
  }
  if (changed) render();
});

// Escape to close
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && settingsToggle.getAttribute("aria-expanded") === "true") {
    setSettingsOpen(false);
    settingsToggle.focus();
  }
});

// Close button
document.getElementById("settings-close").addEventListener("click", (ev) => {
  ev.stopPropagation();
  setSettingsOpen(false);
  settingsToggle.focus();
});

// Reset to factory defaults
document.getElementById("reset-defaults").addEventListener("click", () => {
  state.suffix = FACTORY_DEFAULTS.suffix;
  state.suffixEnabled = FACTORY_DEFAULTS.suffixEnabled;
  state.defaults.jpg = { ...FACTORY_DEFAULTS.jpg };
  state.defaults.pdf = { ...FACTORY_DEFAULTS.pdf };

  suffixInput.value = state.suffix;
  suffixEnabled.checked = state.suffixEnabled;
  applySuffixEnabled();
  for (const field of GLOBAL_FIELDS) {
    const input = document.getElementById(field.id);
    const valEl = document.getElementById(field.id + "-val");
    const v = state.defaults[field.kind][field.key];
    input.value = v;
    valEl.textContent = field.fmt(v);
    cascadeDefaultsToPending(field.kind, field.key);
  }
  render();
});

// ----- theme toggle -----
// The only thing we persist in localStorage. Everything else stays
// session-only per the PRD. If no explicit pref exists, follow the
// OS setting (and keep following it via the matchMedia listener).
const THEME_KEY = "ghostshrinkr.theme";
const themeToggle = document.getElementById("theme-toggle");
const darkMql = window.matchMedia("(prefers-color-scheme: dark)");
const root = document.documentElement;

function applyTheme(theme) {
  root.setAttribute("data-theme", theme);
  themeToggle.textContent = theme === "dark" ? "☀" : "☾";
  themeToggle.setAttribute(
    "aria-label",
    theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
  );
}

let stored = null;
try { stored = localStorage.getItem(THEME_KEY); } catch (_) {}
applyTheme(stored === "dark" || stored === "light"
  ? stored
  : (darkMql.matches ? "dark" : "light"));

themeToggle.addEventListener("click", () => {
  const cur = root.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : "dark";
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch (_) {}
});

// If the user hasn't explicitly chosen, follow system changes live.
darkMql.addEventListener("change", (ev) => {
  let pref = null;
  try { pref = localStorage.getItem(THEME_KEY); } catch (_) {}
  if (pref !== "dark" && pref !== "light") {
    applyTheme(ev.matches ? "dark" : "light");
  }
});

// ----- service worker (PWA install support) -----
// Required for Chrome's install prompt. The worker itself does nothing —
// see sw.js for details. Silently ignored if unsupported (e.g. file://).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

// ----- update notification (Tauri / macOS app only) -----
// Check GitHub's releases API on launch, compare the latest tag to the
// bundled version, show a non-intrusive banner if a newer release is
// available. Silently skipped in the web version (updates arrive on
// reload automatically). Dismissed version is remembered so the banner
// doesn't nag for the same version twice.
const IS_TAURI = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
const UPDATE_DISMISS_KEY = "ghostshrinkr.dismissedUpdate";
const RELEASES_LATEST_URL =
  "https://github.com/jcremy/ghost-shrinkr/releases/latest";
const RELEASES_API_URL =
  "https://api.github.com/repos/jcremy/ghost-shrinkr/releases/latest";

async function fetchTauriAppVersion() {
  if (!IS_TAURI) return null;
  try {
    if (window.__TAURI__?.app?.getVersion) {
      return await window.__TAURI__.app.getVersion();
    }
    if (window.__TAURI_INTERNALS__?.invoke) {
      return await window.__TAURI_INTERNALS__.invoke("plugin:app|version");
    }
  } catch (_) {}
  return null;
}

function parseSemver(v) {
  const match = String(v || "").replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function semverGreater(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return false;
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return true;
    if (pa[i] < pb[i]) return false;
  }
  return false;
}

async function openExternal(url) {
  // Prefer Tauri's opener plugin (opens in the OS default browser).
  // Fallback to window.open which routes through Tauri's default handler.
  try {
    if (window.__TAURI_INTERNALS__?.invoke) {
      await window.__TAURI_INTERNALS__.invoke("plugin:opener|open_url", { url });
      return;
    }
  } catch (_) {}
  window.open(url, "_blank");
}

function showUpdateBanner(latestVersion) {
  const banner = document.getElementById("update-banner");
  const text = banner.querySelector(".update-text");
  const openBtn = document.getElementById("update-open");
  const dismissBtn = document.getElementById("update-dismiss");

  text.textContent = `Version ${latestVersion} is available.`;
  banner.classList.remove("hidden");

  openBtn.addEventListener("click", () => openExternal(RELEASES_LATEST_URL));
  dismissBtn.addEventListener("click", () => {
    try { localStorage.setItem(UPDATE_DISMISS_KEY, latestVersion); } catch (_) {}
    banner.classList.add("hidden");
  });
}

async function checkForUpdates() {
  if (!IS_TAURI) return;

  const version = await fetchTauriAppVersion();
  if (version) APP_VERSION = version;
  if (!parseSemver(APP_VERSION)) return; // skip for dev / NA builds

  let latest = null;
  try {
    const res = await fetch(RELEASES_API_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return;
    const data = await res.json();
    latest = (data.tag_name || "").replace(/^v/, "");
  } catch (_) {
    return; // offline, rate-limited, API down — stay quiet
  }
  if (!latest || !semverGreater(latest, APP_VERSION)) return;

  let dismissed = null;
  try { dismissed = localStorage.getItem(UPDATE_DISMISS_KEY); } catch (_) {}
  if (dismissed === latest) return;

  showUpdateBanner(latest);
}

// Defer the check a couple of seconds so it never competes with the
// first compression a user might start immediately.
window.addEventListener("load", () => setTimeout(checkForUpdates, 2000));

render();
