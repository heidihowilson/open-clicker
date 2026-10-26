# Templates

Three starting layouts ship with the tool. They share every rule in Hardware — same pitch, same margins and chin, same fillets, same cap colours, one orange key — and differ only in the rectangle of cells and what the cells do. Each is a complete, buildable remote; each is also the first thing a user edits. The reference renderings are the `RemoteSlab`, `RemoteTile` and `RemoteDeck` showcase cards.

All three are drawn on `pitch-mx`; the tool can retarget any of them to Choc pitch before keys are moved. In every table, **bold** keys are oxblood (the cluster), *power* is orange, the rest are ivory.

## Tile — the one in the photographs

Three columns, six rows, 12 keys with six empty cells. Palm-sized, the one that lives on the sofa arm. The cluster floats in the butter with its corners empty, which is what makes it read as Open Clicker from across the room. Power alone at the top right; the three commands under the cluster; volume in the bottom corners.

| | | |
| --- | --- | --- |
| · | · | *power* |
| · | **▲** | · |
| **◀** | **OK** | **▶** |
| · | **▼** | · |
| back | home | menu |
| VOL− | · | VOL+ |

Key field 57.15 × 114.3 mm; shell 69.15 × 140.3 mm. Default configuration **Bluetooth only** — no IR window, an unbroken top edge — on a Li-Po, ESP32-C3. The Tile is the fully-assembled entry product and the default template.

## Slab — the everyday remote

Three columns, seven rows, 21 keys, no empty cells. Portrait, one-handed, thumb on OK. The template people expect from a TV remote, for households that want a key for everything.

| | | |
| --- | --- | --- |
| *power* | IN | mute |
| BACK | **▲** | HOME |
| **◀** | **OK** | **▶** |
| MENU | **▼** | GUIDE |
| VOL+ | play / pause | CH+ |
| VOL− | stop | CH− |
| rewind | INFO | fast-forward |

Key field 57.15 × 133.35 mm; shell 69.15 × 159.35 mm. Default configuration **BT + IR**, Li-Po, ESP32-C3. The cluster occupies rows 2–4 with BACK, HOME, MENU and GUIDE in its corners.

## Deck — the two-handed remote

Six columns, three rows, 17 keys including one 2u key. Landscape, held like a controller or left on the coffee table. Commands on the left, the cluster on the right, a 2u play/pause bar in the middle of the bottom row — the one place the system uses a wide key, and the Deck's signature.

| | | | | | |
| --- | --- | --- | --- | --- | --- |
| *power* | IN | mute | BACK | **▲** | HOME |
| VOL+ | CH+ | MENU | **◀** | **OK** | **▶** |
| VOL− | CH− | play / pause (2u, spans two columns) | | **▼** | GUIDE |

Key field 114.3 × 57.15 mm; shell 126.3 × 83.15 mm. Default configuration **BT + IR**, Li-Po, ESP32-S3 (room for a USB host port on the bottom edge, for future wired use).

## Rules the templates demonstrate

- The power key is the only orange key, and it sits in a top corner: a hand finds the corner without looking.
- The cluster — four arrows and OK — is always oxblood, always a cross, and OK is always its centre. Its corners may be empty (Tile) or hold commands (Slab, Deck); they are never oxblood.
- Glyph legends for actions a symbol already owns (power, mute, arrows, transport, back, home, menu); text legends for everything else, four characters at most.
- Volume and channel are paired columns or paired corners, plus above or right of minus.
- Empty cells are allowed anywhere, corners included: the M2 bosses live in the shell margin and the chin, outside the key field.
- Every template has the chin and the wordmark; the back badge is on every lid.
