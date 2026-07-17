# PCC Application Theme Reference

This document defines the visual language used across all PCC (Precision Computers & Consulting) internal tools. Any new UI should match this theme exactly.

---

## Color Palette

All colors are defined as CSS custom properties on `:root`. Always reference variables — never hardcode hex values.

```css
:root {
  --bg:        #0a0c12;   /* Page / window background — near-black navy */
  --surface:   #10141f;   /* Primary surface (toolbars, nav bars, panels) */
  --card:      #161b2a;   /* Raised card / table row hover */
  --border:    #232840;   /* All borders and dividers */
  --accent:    #3d6fff;   /* Primary interactive color — buttons, active tabs, links */
  --accent2:   #00d4aa;   /* Success / confirmation / "done" states */
  --danger:    #ff4d6d;   /* Errors, destructive actions, overdue flags */
  --warn:      #ffb347;   /* Warnings, outstanding balances, attention items */
  --text:      #e2e8f0;   /* Primary text */
  --muted:     #8b95a7;   /* Secondary / placeholder text, inactive labels (WCAG AA on all surfaces) */
  --mono:      'IBM Plex Mono', 'Courier New', monospace;
  --sans:      'IBM Plex Sans', system-ui, sans-serif;
}
```

### Semantic color usage

| Token | Use it for |
|---|---|
| `--accent` | Buttons, active tab indicators, checkboxes, focus rings, badges on active tabs |
| `--accent2` | Success toasts, "done" badges, connected status dots, ✓ mark-done actions |
| `--danger` | Error toasts, destructive buttons, overdue badges, disconnect/delete actions |
| `--warn` | Outstanding balances, financial figures that need attention |
| `--muted` | Placeholder text, inactive nav items, metadata, timestamps, secondary labels |
| `--border` | Every border: `0.5px` hairline (1px for primary container edges), `var(--border)` |
| `--card` | Table row hover background, raised card surfaces |
| `--surface` | Toolbars, nav bar, panel backgrounds that sit above `--bg` |

---

## Typography

Load from Google Fonts:

```html
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap" rel="stylesheet"/>
```

### Rules

- **Body / UI text** — IBM Plex Sans, 13–14px, weight 400
- **Headings / labels** — IBM Plex Sans, weight 500 or 600
- **Code, IDs, numbers, timestamps, badges, keyboard shortcuts** — IBM Plex Mono
- **ALL CAPS labels** (table headers, section labels) — IBM Plex Mono, 10–11px, `letter-spacing: 0.08–0.1em`
- Never use Arial, Inter, Roboto, or system-ui as a primary font

### App identity / logo pattern

```html
<div style="font-family: var(--mono); font-size: 11px; font-weight: 600;
            color: var(--accent); letter-spacing: 0.08em;">
  PCC<span style="color: var(--muted); font-weight: 400;"> // </span>APP NAME
</div>
```

---

## Spacing & Layout

- **Page background**: `var(--bg)` — never white, never pure black
- **Window chrome**: dark titlebar (`#07090f`) with 1px `var(--border)` bottom edge
- **Content areas**: sit on `var(--surface)` or `var(--bg)`
- **Border radius**: `4–6px` for buttons/inputs, `8px` for cards, `10px` for pills/badges, `12px` for modals/containers
- **Borders**: `0.5px solid var(--border)` hairlines are the app-wide convention (crisp on HiDPI, floors to 1px on standard displays); `1px` for primary container edges. Heavier or colored only for semantic emphasis (`--accent`/`--danger`/etc.).
- **Spacing scale**: use the `--space-1..12` tokens (4px base — 4/8/12/16/20/24/32/48) instead of ad-hoc px.
- **Elevation**: `--shadow-sm/md/lg` for the rare raised surface (toasts, floating bars, modals); borders still do most of the separation.
- **Type scale**: `--text-xs..3xl` (11→28px) plus `h1/h2/h3` element defaults. **Focus**: a `2px solid var(--accent)` ring via `:focus-visible` (keyboard nav only) on all interactive elements including form fields.

---

## Navigation Tabs

```css
/* Tab container */
display: flex; align-items: center;
background: var(--surface);
border-bottom: 1px solid var(--border);
padding: 0 16px;

/* Individual tab */
.nav-tab {
  padding: 10px 16px;
  font-size: 12px; font-weight: 500;
  letter-spacing: 0.05em; text-transform: uppercase;
  color: var(--muted);
  border: none; background: none; cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;                  /* overlaps container border */
  transition: color 0.15s, border-color 0.15s;
}
.nav-tab:hover  { color: var(--text); }
.nav-tab.active { color: var(--accent); border-bottom-color: var(--accent); }

/* Count badge on tab */
.badge {
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--accent); color: #fff;
  font-size: 10px; font-weight: 600;
  min-width: 18px; height: 18px; border-radius: 9px;
  padding: 0 5px; margin-left: 6px;
  font-family: var(--mono);
}
/* Inactive tab badge */
.nav-tab:not(.active) .badge { background: var(--muted); }
```

---

## Buttons

```css
.btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 16px; border-radius: 5px;
  font-size: 12px; font-weight: 500;
  font-family: var(--sans);
  cursor: pointer; border: 1px solid transparent;
  transition: all 0.15s; white-space: nowrap;
}
.btn:disabled { opacity: 0.38; cursor: not-allowed; }

/* Variants */
.btn-primary   { background: var(--text); color: var(--bg); border-color: var(--text); }  /* inverted fill = the single primary identity (15:1). Blue --accent is for links/tabs/focus, not the primary button. */
.btn-primary:hover:not(:disabled) { opacity: 0.88; }

.btn-secondary { background: var(--card); color: var(--text); border-color: var(--border); }
.btn-secondary:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }

.btn-success   { background: rgba(0,212,170,0.12); color: var(--accent2); border-color: rgba(0,212,170,0.4); }
.btn-success:hover:not(:disabled) { background: var(--accent2); color: #000; }

.btn-danger    { background: transparent; color: var(--danger); border-color: var(--danger); }
.btn-danger:hover:not(:disabled) { background: var(--danger); color: #fff; }

.btn-ghost     { background: transparent; color: var(--muted); border-color: transparent; }
.btn-ghost:hover:not(:disabled) { color: var(--text); border-color: var(--border); }

/* The "nuclear" grouped action button */
.btn-nuke      { background: linear-gradient(135deg, #3d6fff 0%, #00d4aa 100%);
                 color: #fff; border: none; font-weight: 600; }
.btn-nuke:hover:not(:disabled) { opacity: 0.88; }

/* Small variant */
.btn-sm { padding: 4px 10px; font-size: 11px; border-radius: 4px; }
```

---

## Toolbar

```css
.toolbar {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.toolbar-divider {
  width: 1px; height: 20px;
  background: var(--border);
  margin: 0 4px; flex-shrink: 0;
}
.toolbar-info {
  font-family: var(--mono); font-size: 11px;
  color: var(--muted); margin-left: auto;
}
.filter-input {
  flex: 1; max-width: 280px;
  padding: 7px 12px;
  background: var(--card); border: 1px solid var(--border);
  border-radius: 5px; color: var(--text); font-size: 12px;
  outline: none; transition: border-color 0.15s;
  font-family: var(--sans);
}
.filter-input:focus { border-color: var(--accent); }
.filter-input::placeholder { color: var(--muted); }
```

---

## Data Tables

```css
.data-table { width: 100%; border-collapse: collapse; }

/* Sticky header */
.data-table thead th {
  padding: 9px 14px;
  text-align: left;
  font-family: var(--mono);
  font-size: 10px; font-weight: 600;
  letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--muted);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  position: sticky; top: 0; z-index: 1;
}

/* Body rows */
.data-table tbody tr {
  border-bottom: 1px solid var(--border);
  transition: background 0.1s;
}
.data-table tbody tr:hover   { background: var(--card); }
.data-table tbody tr.selected { background: rgba(61,111,255,0.08); }

.data-table td {
  padding: 11px 14px;
  font-size: 13px;
  vertical-align: middle;
}

/* Mono cell (IDs, numbers, dates) */
.data-table td.mono {
  font-family: var(--mono); font-size: 12px;
}

/* Financial figure (outstanding balance) */
.data-table td.balance {
  font-family: var(--mono); font-size: 12px;
  font-weight: 600; color: var(--warn);
}
```

---

## Status Badges

```css
/* Overdue / error */
.badge-danger {
  display: inline-flex; align-items: center;
  background: rgba(255,77,109,0.15); color: var(--danger);
  font-size: 10px; font-weight: 600;
  padding: 2px 7px; border-radius: 3px;
  margin-left: 6px; font-family: var(--mono);
}

/* Success / paid / connected */
.badge-success {
  background: rgba(0,212,170,0.12); color: var(--accent2);
  font-size: 10px; font-weight: 600;
  padding: 2px 7px; border-radius: 3px;
  font-family: var(--mono);
}

/* Source badges */
.badge-syncro {
  background: rgba(61,111,255,0.15); color: #7a9eff;
  font-size: 10px; font-weight: 600;
  padding: 2px 7px; border-radius: 3px;
  font-family: var(--mono);
}
.badge-qbo {
  background: rgba(0,212,170,0.12); color: #00d4aa;
  font-size: 10px; font-weight: 600;
  padding: 2px 7px; border-radius: 3px;
  font-family: var(--mono);
}
```

---

## Empty / Loading States

```html
<div class="state-box">
  <div class="state-icon">📄</div>
  <div class="state-title">Nothing here yet</div>
  <div class="state-body">Explanatory line of text</div>
</div>
```

```css
.state-box {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  flex: 1; gap: 12px;
  color: var(--muted); font-size: 13px; padding: 48px;
}
.state-icon  { font-size: 36px; opacity: 0.35; }
.state-title { font-weight: 500; color: var(--text); font-size: 15px; }

/* Spinner */
.spinner {
  width: 28px; height: 28px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
```

---

## Toast Notifications

Toasts appear bottom-right, stack vertically, auto-dismiss after ~3.5s.

```css
#toast-container {
  position: fixed; bottom: 24px; right: 24px;
  z-index: 200; display: flex; flex-direction: column; gap: 8px;
}
.toast {
  padding: 11px 16px; border-radius: 6px;
  font-size: 13px; font-weight: 500;
  min-width: 240px; max-width: 380px;
  animation: slideIn 0.2s ease;
}
.toast.success { background: rgba(0,212,170,0.15);  border: 1px solid rgba(0,212,170,0.4);  color: var(--accent2); }
.toast.error   { background: rgba(255,77,109,0.15);  border: 1px solid rgba(255,77,109,0.4);  color: var(--danger);  }
.toast.info    { background: rgba(61,111,255,0.15);  border: 1px solid rgba(61,111,255,0.4);  color: var(--accent);  }
@keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: none; } }
```

```javascript
function toast(msg, type = 'info', duration = 3500) {
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), duration);
}
```

---

## Floating Action Bar

Used when rows are selected — slides up from bottom, springs in with overshoot.

```css
#float-bar {
  position: fixed; bottom: 28px; left: 50%;
  transform: translateX(-50%) translateY(120px);
  z-index: 150; pointer-events: none;
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
              opacity 0.2s;
  opacity: 0;
}
#float-bar.visible {
  transform: translateX(-50%) translateY(0);
  pointer-events: all; opacity: 1;
}
#float-bar-inner {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 14px;
  background: #1a1f33;
  border: 1px solid #3a4060;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6);
  white-space: nowrap;
}
```

---

## Settings / Form Fields

```css
.field { margin-bottom: 14px; }
.field label {
  display: block; font-size: 11px; font-weight: 500;
  color: var(--muted); margin-bottom: 5px; letter-spacing: 0.04em;
  text-transform: uppercase;
}
.field input,
.field select,
.field textarea {
  width: 100%; padding: 8px 12px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 5px; color: var(--text); font-size: 13px;
  outline: none; transition: border-color 0.15s;
  font-family: var(--sans);
}
.field input:focus,
.field select:focus,
.field textarea:focus { border-color: var(--accent); }

/* Section card */
.settings-section {
  background: var(--card); border: 1px solid var(--border);
  border-radius: 8px; padding: 24px; margin-bottom: 20px;
}
.settings-section h2 {
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--accent); font-family: var(--mono);
  margin-bottom: 16px; padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
}
```

---

## Status Bar (window bottom)

```html
<div id="statusbar">
  <div class="status-item">
    <div class="status-dot connected"></div>
    <span>Syncro connected</span>
  </div>
  <div class="status-item">
    <div class="status-dot error"></div>
    <span>Service offline</span>
  </div>
  <span class="status-right">Last refreshed 2:47 PM</span>
</div>
```

```css
#statusbar {
  display: flex; align-items: center; gap: 16px;
  padding: 7px 16px;
  background: #07090f;
  border-top: 1px solid var(--border);
  font-family: var(--mono); font-size: 10px; color: var(--muted);
  flex-shrink: 0;
}
.status-item { display: flex; align-items: center; gap: 5px; }
.status-dot  { width: 6px; height: 6px; border-radius: 50%; }
.status-dot.connected { background: var(--accent2); }
.status-dot.error     { background: var(--danger); }
.status-dot.warning   { background: var(--warn); }
.status-right { margin-left: auto; }
```

---

## Progress Bar

```css
.progress-bar {
  width: 100%; height: 4px;
  background: var(--border); border-radius: 2px; overflow: hidden;
}
.progress-fill {
  height: 100%; width: 0%;
  background: linear-gradient(90deg, var(--accent), var(--accent2));
  border-radius: 2px;
  transition: width 0.3s ease;
}
```

---

## Scrollbars

```css
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: var(--surface); }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--muted); }
```

---

## Key Design Rules

1. **Dark only** — there is no light mode. Background is always `var(--bg)`.
2. **Monospace for data, sans-serif for prose** — IDs, numbers, timestamps, and ALL CAPS labels use IBM Plex Mono. Everything else uses IBM Plex Sans.
3. **Borders are always `1px solid var(--border)`** — never thicker, never a different color unless carrying semantic meaning (e.g. a focused input using `var(--accent)`).
4. **Buttons never have uppercase labels** unless they are short codes or abbreviations — use sentence case.
5. **Accent color (`--accent`) is royal blue `#3d6fff`** — used for primary actions, active states, and focus. Do not substitute with another blue.
6. **Success/done color (`--accent2`) is teal `#00d4aa`** — used exclusively for completion/positive states. Do not use it for primary actions.
7. **Financial figures use `--warn` (amber)** — outstanding balances, amounts owed. Paid/zero balances can revert to `--muted`.
8. **Overdue / error states use `--danger` (red `#ff4d6d`)** — badges, text, and button variants.
9. **Opacity for disabled states** — `opacity: 0.38` on `:disabled`, never a separate disabled color.
10. **Transitions are short** — `0.15s` for color/border changes, `0.25s` for motion (with spring easing for slide-in elements).
