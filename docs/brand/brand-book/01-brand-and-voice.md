# Brand & voice

## Name and tagline

The name is **Open Clicker**, two words, both capitalised, never hyphenated, never "OpenClicker" in prose (the code namespace `OpenClicker` is the one exception). The tagline is **An open source TV remote.** — plain, with a full stop. It is the only line that follows the wordmark, set in `body` or `small`, never in the wordmark's size. A second line for packaging and photography: **Mechanical keys. Open source.**

## The idea in one sentence

Open Clicker makes tinkering feel at home on the coffee table: a remote with the keys of a good keyboard, the parts anyone can buy, a shape anyone can change, and the warmth of an early-'80s kitchen.

## Voice

Plainspoken, friendly, lightly cheeky — the confidence of a household gadget that has one useful job and does it well. Write like a good build guide that is glad you came round.

- Lead with the part. "A Kailh BOX White under every key" beats "premium tactile feedback".
- Name real things: switch models, millimetres, pin numbers, licence names. Never round a measurement for effect.
- Say what the user does, in the second person. "Pull the cap, swap the switch, keep the remote."
- One cheeky line per page is plenty, and it is always at the product's expense, never the reader's: "It has one job. It clicks."
- Sentence case everywhere except keycap legends, `caption` labels and the back badge, which are uppercase.
- No exclamation marks. No emoji. No "premium", "seamless", "effortless", "revolutionary".
- Open source is a fact and an invitation, not a boast: "MIT licensed. Fork it, print it, change the keys."
- Tell people the limits as plainly as the features: "IR needs line of sight." "Choc pitch is not MX pitch; pick one before you lay out keys."

Copy that sounds right:

> Every key is a real mechanical switch. Pull the cap, swap the switch, keep the remote.

> Ships three ways. Kit: you solder. Half-built: we solder, you print. Fully assembled: you click.

> Draw the layout. We route the board. You argue about where the mute key goes.

> It lives beside your chair. It should look like it belongs there.

## Naming things

- Fulfilment levels are **Kit**, **Half-built**, **Fully assembled**, in that order wherever they appear together.
- Protocols are **Bluetooth** and **Infrared** in prose, **BT** and **IR** on badges and legends. A remote that does both is **BT + IR**.
- Templates are **Slab**, **Tile** and **Deck**. A user's own design is a **layout**; the generated board is **the PCB**; the printed parts are **the shell** (body), **the plate**, **the lid**.
- Keys are named by what they do, not where they are: "the power key", "the OK key", never "button 7". The arrows and OK together are **the cluster**.
- Key sizes use keyboard units: **1u**, **1.5u**, **2u**.

## The mark

The mark is an **O and C monogram**: an oxblood O and a burnt-orange C, two thick rings of the same weight, interlocked — the C passes over the O at the top crossing and under it at the bottom — the way a vintage appliance badge or a hi-fi faceplate would do it. Three files in `assets/Logos`: `oc-monogram.svg` (two-colour, for ivory and butter grounds), `oc-monogram-oxblood.svg` (single-ink, for one-colour print and embossing), `oc-monogram-ivory.svg` (single-ink, for oxblood and orange grounds — the box, the Late show theme).

Minimum size 24px tall; clear space half its height on every side. Never recolour the two-colour mark, never set it on orange, never add a wordmark inside it.

The wordmark is live type: the name in `display` (Fraunces 900, optical size 144, leading 1.0) in `ink`, or `on-butter` on the shell, or `ivory` on an oxblood ground. Two lines, "Open" over "Clicker", left-aligned, when there is height for it; one line otherwise. Lockup: the mark at the wordmark's x-height, `space-3` to its left, bottoms aligned. On hardware the wordmark sits on the chin of the face in oxblood (`wordmark-h` 9 mm), and the mark goes on the back badge.

## Pattern

The two rings make the brand's one pattern: thick oxblood and orange arcs — ring segments of the monogram's weight — sweeping across ivory, crossing once, never more than three arcs in view. Use it on packaging, the cover and empty states. It is not a background for text.

## Imagery

Photograph remotes where they live — a sofa arm, a side table beside a mug, a coffee table in lamplight — in warm, low, even light that shows the sculpted caps. Shoot from above or a low three-quarter angle so the cap sides read. Upholstery, wood and ceramics in the frame; never a white sweep, never a gradient. Renders from the tool are acceptable imagery and should look like the tool: `viewport` ground, grid visible.
