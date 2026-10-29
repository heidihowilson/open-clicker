# Open Clicker router

Turns a design file into a routed board and the files a board fab needs. The designer's
**Route and get Gerbers** button calls it.

1. The designer posts the design file to `POST /jobs`. The router validates it with the same
   schema and checks as the designer, and refuses a design with errors.
2. `src/lib/kicad.ts` writes the schematic and a board spec: which footprint goes where, on which
   side, and which net each pad is on. Footprints come only from published libraries
   ([footprints/README.md](footprints/README.md)).
3. `board.py` has KiCad 9 build the board from that spec, flipping parts to the back itself, and
   adds the rule areas: no copper under or beside the BMD-340's antenna.
4. `route.py`: KiCad exports Specctra DSN, [Freerouting](https://github.com/freerouting/freerouting)
   routes it, KiCad imports the routes and removes any dead-end stubs, then `kicad-cli` runs the
   design-rule check with schematic parity and plots the Gerbers and drill files.
5. `verify.py` reads the Gerbers back with [gerbonara](https://gitlab.com/gerbolyze/gerbonara), a
   separate parser, and checks the outline and every hole against the board. It also renders the
   previews.
6. Any error, schematic mismatch or read-back difference fails the job: a board that fails a
   check is never handed out. Silkscreen notes are reported but do not block.
7. `GET /jobs/:id/result` returns a zip: the routed KiCad project (with the two vendored
   footprints), the Gerber zip for the fab, top and bottom previews, `CHECKS.txt` and `ORDER.txt`.

`router/test.sh` builds the image and runs every layout through all of this (`selftest.ts`); run it
after any change to the generator, the footprints or the image.

`POST /notify` takes `{ email, tier, design }` from the onboarding's **Notify me** and appends one JSON line to `/data/notify.jsonl` (a Docker volume on grove). One request per address every 10 seconds.

One job routes at a time; six may wait. Identical designs share one job. Results live for an
hour, in memory only.

Run it locally with KiCad 9 and Freerouting installed:

```sh
PYTHON=/usr/bin/python3 FREEROUTING=/path/to/freerouting/bin/freerouting bun router/server.ts
```

Deployed on Coolify (grove) from `router/Dockerfile`, built from the repository root.
