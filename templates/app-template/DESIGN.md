# DESIGN.md — the visual system every generated app MUST follow

Monochrome, documentation-first minimalism (in the spirit of ollama.com's
public site). The page is a calm white sheet; black is the only brand color;
whitespace does the layout. Follow this and every community app looks like it
came from the same studio.

All tokens below are pre-wired in `app/globals.css` as Tailwind theme tokens —
use the utility classes, do not invent new colors or radii.

## Palette (complete — do not add colors)

| Utility | Value | Use |
|---|---|---|
| `bg-canvas` | `#ffffff` | The page and almost every surface |
| `bg-surface-soft` | `#fafafa` | Input pills, code chips, subtle row alternation |
| `bg-surface-dark` | `#171717` | ONE inverted "look here" surface per page, max |
| `text-ink` | `#000000` | Headings, primary labels, button text on white |
| `text-charcoal` | `#525252` | List items, secondary labels |
| `text-body` | `#737373` | Default paragraph/description text |
| `text-mute` | `#a3a3a3` | Captions, timestamps, placeholders |
| `border-hairline` | `#e5e5e5` | 1px card borders and dividers — the only "elevation" |
| `border-hairline-strong` | `#d4d4d4` | Rare stronger divider |
| `text-on-dark` / `text-on-dark-mute` | white / 70% white | Text on `bg-surface-dark` |

Semantic states stay monochrome: success = ink text with a `✓`, emptiness =
mute text, errors = ink text with a thin `border-ink` left border. Never
introduce red/green/blue fills. (The only sanctioned color dots are the
terminal traffic lights if you render a terminal mockup — rare in apps.)

## Typography

- Font stacks are preset on `body` (system sans) — never import webfonts.
- Data, numbers, IDs, and code render in `font-mono` (ui-monospace).
- Hierarchy compresses tightly: page title ~30–36px/500, section 24px/600,
  card title 20px/500, body 16px/400, meta 12–14px. No letter-spacing games,
  no italics, no thin weights.

## Shape rules (two shapes only)

- **Every interactive element is a pill**: `rounded-full` on buttons, inputs,
  selects, tags, filter chips. Height 36–40px, horizontal padding 16–20px.
- **Cards are 12px**: `rounded-card border border-hairline bg-canvas` with
  24–32px padding. Nothing else — no medium-radius buttons, no pill cards.
- **No shadows, no gradients, ever.** Depth = 1px hairline border, or the one
  inverted dark surface.

## Buttons

- Primary: `bg-ink text-white rounded-full h-9 px-5 text-sm font-medium`
  (active: `bg-ink-deep`). This is the ONLY primary button style.
- Secondary: `bg-canvas text-ink border border-hairline-strong rounded-full`.
- Disabled: `bg-surface-soft text-mute`.

## Inputs

- `bg-canvas border border-hairline rounded-full h-10 px-4 text-base`
  (or `bg-surface-soft` borderless for search-style fields). Labels are
  `text-sm font-medium text-ink`; helper text `text-sm text-body`.

## Layout

- Single reading column, `max-w-2xl mx-auto px-6` (~720px). Wide tables may
  stretch to `max-w-4xl`.
- Vertical rhythm: 48–64px between major sections (`space-y-12`/`py-16`),
  16–24px inside sections. Whitespace IS the design — no colored bands,
  no decorative dividers.
- Tables/lists: hairline row dividers (`divide-y divide-hairline`), 12–16px
  row padding, header row in `text-xs uppercase tracking-normal text-mute`.

## Do / Don't

- DO keep one clear primary action per view, as a black pill.
- DO use `bg-surface-dark` at most once per page for the single most
  important stat, status, or call-to-action strip.
- DO write empty states as one `text-body` sentence — no illustrations.
- DON'T add emoji noise to the UI chrome (emoji in user content is fine).
- DON'T use colored badges, colored charts, or colored status dots — encode
  status with text, weight, and the ✓ mark.
- DON'T import fonts, icon packs, or add dependencies for visuals.
