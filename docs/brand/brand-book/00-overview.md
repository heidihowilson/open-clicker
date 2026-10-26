Open Clicker brings the warmth of an early-'80s kitchen to a customizable, open-source TV remote: butter-yellow appliances, burnt-orange upholstery, burgundy lettering, and a familiar object that earns its place beside your favourite chair. An ESP32, mechanical keyboard switches, a 3D-printed shell and a PCB generated from the layout you draw. This system covers three surfaces with one language — the brand, the web-based 3D design tool, and the remote itself — and three pillars decide every choice in it:

1. **Modularity.** Off-the-shelf parts on a fixed grid. The mechanical switch is the unit of everything: the 19.05 mm key pitch (`pitch-mx`) is the hardware grid, `space-u` is the same unit on screen, and the keycap is the brand's one shape.
2. **Flexibility.** Kit, half-built, or fully assembled; Bluetooth, infrared, or both. The system never privileges one path: every option is a `Segmented` choice, every protocol a `Badge`, and the IR window is the only external cue a configuration leaves on the shell.
3. **Customization.** Choose your keys, arrange your controls, and the tool routes a PCB for it. It shows real millimetres, real part names and real limits, and tells you plainly when a design will not print or will not route.

## Four colours, each with a job

- **Butter** (`butter`, `tray`) is the appliance: the remote body, and the only thing on screen that is ever yellow. Lettering on it is always `on-butter` (oxblood).
- **Oxblood** (`oxblood`, `ink`, `cap-oxblood`) is the lettering and the navigation cluster — arrows and OK — and the primary button. It is the voice of the brand: every sentence, the wordmark, the mark's O.
- **Burnt orange** (`orange`, `cap-orange`) is the one playful colour: the power key, the mark's C, and the selection outline. One orange key per remote, one orange fill per screen. Never small text — use `accent-text`.
- **Ivory** (`ivory`, `ground`, `cap-ivory`) gives the rich colours room to breathe: the page, the panels, and every keycap that is not navigation or power.

`ink` is oxblood by day and ivory in the Late show theme; the four brand tokens never move. Text pairs in both themes hold at least 4.5:1 on the grounds their notes name; the one exception, the ivory power glyph on orange (3.7:1), is a 24px glyph and is noted as such.

## The keycap is the brand

Everything that can be pressed is a keycap: a cap on `radius-key` corners with a hard 2px side under it (`shadow-cap-ivory`, `shadow-cap-oxblood`, `shadow-cap-orange`); on press the side collapses and the cap drops 2px. Caps come in the three brand colours and the colour says what the key does: ivory for commands, oxblood for navigation, orange for power. Buttons in the tool, keys in the layout editor and the keys on the cover all follow this. Nothing floats on a soft shadow except menus (`shadow-float`).

## Using the tokens

- Pages sit on `ground`, panels and cards on `ground-raised`, sunken UI (inputs, segmented tracks, the tool-rail tray) on `well`. Anything that draws the remote draws its body in `tray` — butter in both themes, because the product does not change colour at night.
- Body text is `ink`; secondary text and spec labels are `ink-muted`. Both read on `ground`, `ground-raised`, `well` and `accent-soft`. Text on butter is `on-butter`, text on an oxblood cap `on-cap-oxblood`, on an ivory cap `on-cap-ivory`.
- Hairlines that only separate are `line`. Borders that must be seen are `line-strong` (3:1 or better on the grounds). On butter, borders are `oxblood`.
- Status always carries a word or glyph. `ok` means paired, printable, routed; `alert` means a fault or a destructive button. Tinted grounds are `ok-soft` and `alert-soft`; never put `ok` text on `alert-soft` or the reverse.
- Keyboard focus is `focus-ring`: a 2px gap in `ground`, then 2px of `focus`. It applies to every Key, Button, Segmented option and Field.
- Spacing is a 4px scale. `space-u` (76px) is one key unit at the editor's 4 px/mm; a keycap is `space-u` − `space-1`; `space-6` is the shell margin and `space-20` the chin, both at 4 px/mm.
- Radii follow the hardware at 4 px/mm: `radius-key` (8px) is the 2 mm `cap-fillet`; `radius-shell` (32px) is the 8 mm `shell-fillet`. Everything is chunky and rounded; `radius-full` is reserved for the OK dot and the monogram rings.
- The `hardware` family is the physical rulebook in millimetres. The enclosure generator reads it; the printability checks compare against it.

## Type

Two hosted faces and the system mono. **Fraunces** (`serif`, SOFT axis at 100, WONK on) is the lettering: `display` at 900 for the wordmark and heroes, `title`, `heading`, `body`, `body-strong`, `small` — one chunky, rounded serif that is also a warm text face. **Fredoka** (`sans`) is the appliance label: `legend` and `legend-lg` on keycaps (uppercase, four characters at most on 1u), `caption` for labels and badges, `spec` for measurements. `code` is the system monospace for things typed into a terminal. Never set a legend in Fraunces or a sentence in Fredoka.

## Themes

**Ivory** is the brand and the default. **Late show** is for the tool in a dark living room: the grounds go to a deep oxblood-black and `ink` goes to ivory, while butter, oxblood, orange and the remote itself stay exactly as they are.

## Components

`components/bundle.js` assigns `window.OpenClicker` and expects React 18 on the page. `Key` is the hero (1u, 1.5u, 2u; `ivory`, `oxblood` or `orange`; text or glyph legend). `Button`, `Badge`, `Segmented` and `Field` are the tool's controls, all drawn as keycaps or wells. Each has a README with when to use it and what the consumer provides. The three remote templates — **Slab**, **Tile** and **Deck** — and the **Tool shell** are showcase pages: reference renderings of the language, not exports.

## Assets

The mark in `assets/Logos` is the O and C monogram — an oxblood O interlocked with a burnt-orange C, the way a vintage appliance badge would do it — in two-colour, oxblood-only and ivory-only versions. The wordmark is live type: the name set in `display`. `assets/Legends` is the glyph set every keycap legend is drawn from, in oxblood for ivory caps and ivory for oxblood and orange caps; it is the icon set of the tool as well.

The sections that follow cover voice and naming (Brand & voice), the enclosure rules (Hardware), the three remotes (Templates) and the 3D design tool (Design tool).
