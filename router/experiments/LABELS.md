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
