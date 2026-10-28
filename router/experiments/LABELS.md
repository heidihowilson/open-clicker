# Key labels with Jev: first prototype (2026-10-28)

`labels-proto.ts` asks Jev (TypeSafe System One, `jev-latest`) to label the blank keys of the
three onboarding templates. Run: `TYPESAFE_API_KEY=… bun router/experiments/labels-proto.ts`.

Spatial facts are computed in code (row, column, colour, connected group, shape, place in group);
Jev only judges what a key with those facts is for, choosing from 32 functions. Code then makes
functions unique (greedy by probability).

## Results

- **Fast:** one request labels a whole remote in ~180 ms; two requests ~290 ms.
- **The navigation cross is solved:** up/down/left/right/OK at 0.97–1.00, every template, both
  versions. Red key → power at 0.5–0.9.
- **Everything else is weak:** number grids, transport rows and volume pairs come back as scattered
  digits at 0.1–0.3. Asking first "what is this group for?" (one yes/no per purpose) did not help:
  Jev answered no to every purpose for blank groups, which is a literal and fair reading.

Blank keys in a grid are ambiguous to a person too. Jev is strong when the facts point one way.

## Next design

Code recognises standard shapes and proposes a few complete labelings per group (3×3/3×4 block →
number pad; vertical pair → volume or channel rocker; row of 3 → transport or home/back/menu;
cross → navigation). Jev picks among those candidates (select, don't generate), with the rest of
the remote as context. Code keeps the rules (one power, unique digits).

## Second version, shipped (2026-10-28)

`designer/src/onboarding/labels.ts`, served by the router at `POST /labels`, drawn on the caps by the
editor. Code decides what it can (red = power; a key with four neighbours and open corners = the
cross); every other row gets a few complete label sets, and 3-wide runs of 3–4 full rows get a
"number pad or separate rows" Choice. One Jev request, ~110–150 ms. Code then gives each function to
one key only. Results (`labels-v2.ts`):

- Streamer: Input · Power / cross / Vol− Mute Vol+ / ⏪ ⏯ ⏩ / Ch− Ch+.
- Boomer: Vol− Vol+ Power / number pad 1–9, Guide 0 Info (0.90) / Mute + cross.
- Brick: Vol− Vol+ Power / number pad (0.78) / ⏪ ⏯ ⏩.

A yes/no ("is this a number pad?") came back 0.2–0.3; the same question as a two-way Choice gave
0.77–0.90. Jev reads comparisons better than lone yes/no questions for this. Note that Noul answers
come back in the field `noul`, not `probability`.
