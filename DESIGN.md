# GhostShrinkr — Visual Design Spec

Exact values for anyone rebuilding the UI. "Apple-inspired" is too fuzzy to reproduce; this document is the source of truth for colors, typography, spacing, elevation, and motion.

---

## 1. Color tokens

All colors are declared as CSS custom properties on `:root[data-theme="light"]` and `:root[data-theme="dark"]`. Default (no attribute) matches light.

### 1.1 Light theme

```css
--bg:             #fbfbfd;
--surface:        #ffffff;
--surface-2:      #f5f5f7;
--surface-hover:  #ececf0;
--fg:             #1d1d1f;
--fg-soft:        #424245;
--muted:          #86868b;
--border:         rgba(0, 0, 0, 0.08);
--border-strong:  rgba(0, 0, 0, 0.14);
--accent:         #0071e3;    /* Apple system blue (web) */
--accent-hover:   #0077ed;
--accent-fg:      #ffffff;
--warn:           #ff9f0a;
--danger:         #ff3b30;
--ok:             #34c759;
--type-jpg:       #0071e3;    /* JPG type pill: same as accent */
--type-pdf:       #c4610a;    /* PDF type pill: warm amber */
```

### 1.2 Dark theme

```css
--bg:             #000000;    /* true black, not near-black */
--surface:        #1c1c1e;
--surface-2:      #2c2c2e;
--surface-hover:  #3a3a3c;
--fg:             #f5f5f7;
--fg-soft:        #d1d1d6;
--muted:          #98989d;
--border:         rgba(255, 255, 255, 0.10);
--border-strong:  rgba(255, 255, 255, 0.18);
--accent:         #0a84ff;    /* Apple system blue (dark) */
--accent-hover:   #409cff;
--accent-fg:      #ffffff;
--warn:           #ff9f0a;
--danger:         #ff453a;
--ok:             #30d158;
--type-jpg:       #64b5ff;    /* lighter for dark-mode contrast */
--type-pdf:       #ffb340;    /* lighter for dark-mode contrast */
```

### 1.3 Shadow tokens

```css
/* light */
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-md: 0 4px 14px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04);
--shadow-lg: 0 20px 60px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.04);

/* dark */
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
--shadow-md: 0 4px 14px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.4);
--shadow-lg: 0 20px 60px rgba(0, 0, 0, 0.6), 0 2px 6px rgba(0, 0, 0, 0.4);
```

### 1.4 Color-mix usage

Where the UI needs a subtly tinted surface (e.g. hover states on danger buttons, type-pill backgrounds), use `color-mix` against a base surface rather than hardcoding a new token:

```css
button.danger:hover { background: color-mix(in srgb, var(--danger) 10%, var(--surface-2)); }
.type-tag.type-pdf  { background: color-mix(in srgb, var(--type-pdf) 16%, transparent); color: var(--type-pdf); }
#dropzone.dragging  { background: color-mix(in srgb, var(--accent) 6%, var(--surface)); }
```

This makes tints adapt automatically to both themes.

---

## 2. Typography

### 2.1 Font stack

```css
font-family:
  -apple-system, BlinkMacSystemFont,
  "SF Pro Text", "SF Pro Display",
  "Helvetica Neue", Helvetica, Arial,
  system-ui, sans-serif;
```

SF first (macOS/iOS), then graceful fallbacks. No webfont loading.

### 2.2 Base body

```css
font-size: 15px;
line-height: 1.47;
-webkit-font-smoothing: antialiased;
-moz-osx-font-smoothing: grayscale;
text-rendering: optimizeLegibility;
```

### 2.3 Type scale

| Element              | Size      | Weight | Letter-spacing |
| -------------------- | --------- | ------ | -------------- |
| `header h1`          | `2.1rem`  | 600    | `-0.022em`     |
| `header p` (tagline) | `1rem`    | 400    | `-0.01em`      |
| Drop zone primary    | `1.05rem` | 600    | `-0.01em`      |
| Drop zone sub        | `0.9rem`  | 400    | —              |
| Drop zone small      | `0.75rem` | 400    | —              |
| Filename             | `0.95rem` | 500    | `-0.005em`     |
| Card meta line       | `0.8rem`  | 400    | `-0.003em`     |
| Primary button       | `0.875rem`| 600    | `-0.005em`     |
| Secondary button     | `0.875rem`| 500    | `-0.005em`     |
| Group title in popover | `0.72rem` | 600 | `0.06em` uppercase |
| Type pill (JPG/PDF)  | `0.62rem` | 700    | `0.05em` uppercase |
| Toast                | `0.85rem` | 400    | —              |

### 2.4 Number rendering

All size displays (meta line, stats, slider value labels) use `font-variant-numeric: tabular-nums` so digits don't jitter as values change.

---

## 3. Spacing

No formal grid — values were picked case by case. Common increments are `.25rem`, `.35rem`, `.5rem`, `.75rem`, `1rem`, `1.25rem`.

| Region                         | Padding / margin                 |
| ------------------------------ | -------------------------------- |
| `main`                         | `3rem 1.25rem 5rem`              |
| Header bottom margin           | `2.5rem`                         |
| Drop zone                      | `3rem 1.5rem`                    |
| Card                           | `.9rem 1rem`                     |
| Card inner row gap             | `1rem`                           |
| Action bar                     | `1rem 1.1rem`                    |
| Settings popover               | `1rem 1.1rem 1.1rem`             |
| Setup row grid columns         | `6.5rem 1fr 3.2rem` (label / slider / value) |
| Between file cards (gap)       | `.5rem`                          |
| Between action-bar children    | `.85rem`                         |

Max content width: **`720px`** (`main` max-width).

Responsive breakpoint: **`520px`** — below this, card padding tightens to `.6rem .65rem`, header margin drops to `1.75rem`, popover width becomes `min(360px, calc(100vw - 2rem))`.

---

## 4. Border radii

| Element                              | Radius   |
| ------------------------------------ | -------- |
| Card, action bar, popover, toast     | `14px`   |
| Drop zone                            | `18px`   |
| Setup row text input                 | `8px`    |
| Toast                                | `12px`   |
| Progress bar (pill)                  | `999px`  |
| Primary / secondary button (pill)    | `980px`  |
| Gear button / theme toggle (circle)  | `50%`    |
| Type pill                            | `5px`    |
| Status dot                           | `50%`    |

The `980px` pill value is intentional — any number ≥ half the element's longest dimension gives a true pill shape, and `980px` is the value Apple uses in their own design tokens.

---

## 5. Elevation

Three tiers:

1. **Resting surfaces** — `box-shadow: var(--shadow-sm)`. Used on cards, action bar, setup popover trigger.
2. **Hover** — `box-shadow: var(--shadow-md)`. Used on drop-zone hover and card hover.
3. **Floating / overlaid** — `box-shadow: var(--shadow-lg)`. Used on toasts, the settings popover, and the drop zone during active drag.

There is no "pressed" shadow state. Pressed state is conveyed via `transform: scale(0.97)` on active buttons instead.

---

## 6. Motion

All transitions are short (120–250 ms) and use ease-out or a plain cubic curve. No bouncy / elastic easing.

| Animation                    | Duration | Property                                              |
| ---------------------------- | -------- | ----------------------------------------------------- |
| Button hover                 | 150 ms   | `background, color`                                   |
| Button press                 | 120 ms   | `transform: scale(0.97)`                              |
| Drop zone hover              | 200 ms   | `border-color, background, box-shadow`                |
| Card hover                   | 200 ms   | `box-shadow`                                          |
| Popover enter                | 180 ms   | fade + `translateY(-4px → 0)`                         |
| Toast enter                  | 250 ms   | fade + `translateX(12px → 0)`                         |
| Drop-zone "loading" overlay  | 150 ms   | fade-in                                               |
| Theme transition             | 250 ms   | `background-color, color` on `html, body`             |
| Status dot (processing)      | 1.4 s    | opacity pulse, `infinite`                             |
| Setup chevron rotate         | 250 ms   | (legacy — now unused since popover replaced the panel) |

Progress bars animate their width with a 200 ms linear transition.

---

## 7. Specific UI element specs

### 7.1 Drop zone

```
border: 1px solid var(--border)
border-radius: 18px
padding: 3rem 1.5rem
background: var(--surface)
box-shadow: var(--shadow-sm)

On drag: border-color var(--accent), background color-mix accent 6%, box-shadow --shadow-lg, transform translateY(-1px)
On load ("Reading files…"): pseudo-element ::after with backdrop-filter blur(4px), pointer-events: none
```

### 7.2 File card

```
[status-dot 7px] [type-pill] [filename]          [⚙ 34px] [Check btn] [Remove btn]
                [meta line]
                [progress bar 3px, only while processing]

Card padding: .9rem 1rem
Card row gap: 1rem
Border-left accent on processing / error: color-mix(in srgb, var(--warn or --danger) 45%, var(--border))
```

The **type pill**:

```css
font-size: .62rem;
font-weight: 700;
letter-spacing: 0.05em;
text-transform: uppercase;
padding: 2px 6px;
border-radius: 5px;
/* JPG */ background: color-mix(in srgb, var(--type-jpg) 14%, transparent); color: var(--type-jpg);
/* PDF */ background: color-mix(in srgb, var(--type-pdf) 16%, transparent); color: var(--type-pdf);
```

The **status dot**:

```css
width: 7px; height: 7px; border-radius: 50%;
pending:    background var(--muted), opacity .45
processing: background var(--warn), opacity 1, animation: pulse 1.4s infinite
done:       background var(--ok), opacity 1
error:      background var(--danger), opacity 1
```

### 7.3 Buttons

Three variants on a shared base:

```css
button {
  font: inherit; font-size: .875rem; font-weight: 500;
  letter-spacing: -0.005em;
  background: var(--surface-2);
  color: var(--fg);
  border: 1px solid transparent;
  border-radius: 980px;          /* pill */
  padding: .5rem 1rem;
  transition: background .15s, color .15s, transform .12s, box-shadow .15s;
}
button:hover:not(:disabled) { background: var(--surface-hover); }
button:active:not(:disabled) { transform: scale(0.97); }
button:disabled { opacity: .35; cursor: not-allowed; }
```

Variants:

- `.primary` — `background var(--accent); color var(--accent-fg); font-weight 600; padding .55rem 1.25rem; box-shadow 0 1px 2px color-mix(in srgb, var(--accent) 40%, transparent)`. On hover: `background var(--accent-hover); box-shadow 0 4px 12px color-mix(accent 35%)`.
- `.icon` — tightened padding: `.45rem .75rem`.
- `.gear` — circular, 34×34 px, `border-radius: 50%`, no padding. Active state: `background color-mix(in srgb, var(--accent) 14%, var(--surface-2)); color: var(--accent)`.
- `.danger:hover` — `color var(--danger); background color-mix(in srgb, var(--danger) 10%, var(--surface-2))`.
- `.theme-toggle` — circular, 38×38 px, with `box-shadow var(--shadow-sm)` and `border 1px solid var(--border)`. Active press: `transform scale(0.94)`.
- `.burger` — circular, 34×34 px, font-size 1.1rem, `⋯` glyph. `display: none` on desktop; `display: inline-flex` below the 520 px breakpoint. Opens a per-card action menu when tapped.

### 7.X Responsive burger menu

Below 520 px, each card's action row collapses into a burger popover:

```
.actions  (position: relative, wrapping element)
├── .burger        (visible on mobile only)
└── .actions-menu  (inline row on desktop; absolutely-positioned popover on mobile)
```

Desktop CSS (default):
- `.burger { display: none; }`
- `.actions-menu { display: flex; gap: .4rem; }`

Mobile CSS (`max-width: 520px`):
- `.burger { display: inline-flex; }`
- `.actions-menu { display: none; position: absolute; top: calc(100% + .35rem); right: 0; flex-direction: column; background var(--surface); border-radius 12px; box-shadow var(--shadow-lg); min-width 160px; padding .4rem; z-index 50; }`
- `.actions.open .actions-menu { display: flex; }`
- Inside the menu, buttons become full-width left-aligned rows with 8px radius.

Popover animation: reuses `@keyframes popover-in` (fade + translateY -4 → 0, 150 ms ease-out).

JS behaviour:
- Burger button `.onclick` calls `ev.stopPropagation()` so the document-level close handler doesn't immediately close it on the same click.
- Every action inside the menu sets `entry.menuOpen = false` before running its handler.
- A document-level `click` listener closes every open menu in a single pass.
- Only one burger menu can be open at a time — opening one closes any other.

### 7.4 Settings popover

```
Position: absolute, top: calc(100% + .5rem), right: 0 (relative to .settings-wrap)
Width: min(360px, calc(100vw - 2rem))
Background: var(--surface); border: 1px solid var(--border); border-radius: 14px
Shadow: var(--shadow-lg)
Padding: 1rem 1.1rem 1.1rem
Animation: popover-in 180ms ease-out (fade + translateY -4px → 0)
```

Close button: 26×26 px absolutely positioned top-right (.55rem / .55rem inset), transparent background, × glyph.

Footer "Reset to defaults": right-aligned, top-border separator, transparent background, muted text color, hovers to `var(--fg) / var(--surface-2)`.

### 7.5 Toast

```
Fixed bottom-right: 1.25rem / 1.25rem from edges
Max-width 340px
Background var(--surface), border var(--border), border-radius 12px
box-shadow var(--shadow-lg)
Leading colored dot (::before pseudo-element, 6px, warn or danger)
Animation: slidein .25s ease-out (translateX 12px → 0 + fade)
Auto-dismiss after 3s, then fade out .3s before DOM removal
```

### 7.6 Action bar

```
padding: 1rem 1.1rem
gap: .85rem
Children (left to right): stats, Cancel (hidden unless processing), Clear all, Shrink (primary)
Stats: flex 1 1 auto, color var(--muted), font-size .88rem
```

### 7.7 Icons (unicode, not SVG)

Keep the app dependency-free. Unicode only:

- Gear: **`⚙`** (U+2699)
- Sun: **`☀`** (U+2600) — dark mode (click to go light)
- Moon: **`☾`** (U+263E) — light mode (click to go dark)
- Chevron: **`▾`** (legacy, unused now)
- Close: **`×`** (U+00D7) — used in popover close button
- Shrink label suffix arrow: **`↓`**
- Reset arrow: **`↻`** (U+21BB) — used only as a fallback, primary use removed

---

## 8. Dark-mode adaptation notes

- Dark mode uses `#000` true black for `--bg` (not a dark grey). Cards and surfaces sit above as `#1c1c1e` / `#2c2c2e`, mirroring Apple's iOS/macOS dark palette.
- Type pills get brighter hues in dark mode (`--type-jpg #64b5ff`, `--type-pdf #ffb340`) so the tint-on-transparent backgrounds remain readable against the darker card.
- Shadows get deeper (`0.4 → 0.6` alpha) because soft shadows on dark backgrounds need more contrast to register.
- No separate dark-mode stroke weights — the same border widths are used, only the `--border` alpha changes from `rgba(0,0,0,.08)` to `rgba(255,255,255,.10)`.

---

## 9. Accessibility

- All interactive elements have `aria-label` or visible text.
- Drop zone is `role="button"`, `tabindex="0"`, responds to Enter/Space (triggers file picker).
- Settings popover: `role="dialog"`, closes on Escape, clicking outside, or the × button. Focus returns to the gear trigger on close.
- Focus ring: relies on the browser default — we don't override `outline`. Accent-colored borders appear on focused text inputs.
- Color contrast: all foreground/background pairs in both themes clear WCAG AA for normal text. Status dots are supplementary, not sole carriers of meaning (the meta line also says "Processing…", "error message", etc.).
