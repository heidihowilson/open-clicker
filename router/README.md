# Open Clicker router

Turns a design file into a routed board and the files a board fab needs. The designer's
**Route and get Gerbers** button calls it.

1. The designer posts the design file to `POST /jobs`. The router validates it with the same
   schema and checks as the designer, and refuses a design with errors.
2. `src/lib/kicad.ts` writes the KiCad project; KiCad exports it as Specctra DSN.
3. [Freerouting](https://github.com/freerouting/freerouting) routes it (up to 20 passes, 3 minute limit; the optional optimizer is off, which keeps every
   template under about 30 seconds on grove).
4. `ses_import.py` adds the routes to the board (KiCad 7 imports sessions only in its GUI),
   KiCad runs DRC, then plots Gerbers and drill files.
5. `GET /jobs/:id/result` returns a zip: the routed KiCad project, a Gerber zip ready for
   JLCPCB, and `ORDER.txt`.

One job routes at a time; six may wait. Identical designs share one job. Results live for an
hour, in memory only.

Run it locally with KiCad 7 and Freerouting installed:

```sh
PYTHON=/usr/bin/python3 FREEROUTING=/path/to/freerouting/bin/freerouting bun router/server.ts
```

Deployed on Coolify (grove) from `router/Dockerfile`, built from the repository root.
