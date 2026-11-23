# MU Dorm admin — design notes

Every value below is a CSS variable in `css/base.css`; components use the variable, never the raw value.

## Colour

Navy for structure, teal as the single accent. Dark mode re-steps the same roles (it follows the
device setting unless the viewer picks Light or Dark).

| Role | Light | Dark |
|---|---|---|
| `--bg` page | `#f2f5f9` | `#0a1526` |
| `--surface` cards | `#ffffff` | `#13233b` |
| `--text` / `--text-muted` | `#13213a` / `#55627a` | `#e8eef8` / `#a3b3cb` |
| `--primary` buttons | navy `#16355f` | teal `#14b8a6` (dark ink) |
| `--accent` | teal `#0d9488` | teal `#14b8a6` |
| `--sidebar-bg` | navy `#0b1d36` | `#071122` |
| status success / warning / danger / info | `#15803d` / `#9a5600` / `#c0262d` / `#1d5fd1` | lighter steps on tinted backgrounds |

Status is never shown by colour alone: every badge carries its label.

**Charts.** Occupancy bars use one colour (`--chart-bar`). The complaints ring uses the status colours
`--chart-pending / -progress / -resolved`, checked for colour-blind separation and 3:1 contrast on the
card surface in both themes, with a legend and 2px gaps as the second cue. Each chart has a "View as
table" version.

## Type

- Latin: **Plus Jakarta Sans** (body) and **Sora** (headings).
- Arabic: **Tajawal** (body) and **Cairo** (headings). In Arabic the Arabic faces come first and sizes
  step up slightly; in English, Arabic names still render in Tajawal through the font fallback.
- Western digits (0–9) in both languages (`NUMBERING` in `i18n.js`).

## Space, shape, motion

4px spacing scale (`--space-1` … `--space-12`); radii 6 / 8 / 10 / 14 / 20 px; two shadows.
Motion is short (0.18–0.24 s) and switched off under `prefers-reduced-motion`.

## Layout

Fixed sidebar (268px) and sticky top bar. Below 1024px the sidebar becomes a drawer from the
inline-start edge (right in Arabic). Tables turn into labelled cards below 720px. No horizontal page
scroll at 400px.

## Right-to-left

Logical properties only (`inline-start`, `padding-inline`, `text-align: start`). Directional icons
(chevrons, arrows, sign-out) mirror with `.icon--dir`. Codes, e-mails and phone numbers are isolated
left-to-right. The bar chart reverses its order and moves its axis to the right in Arabic.
