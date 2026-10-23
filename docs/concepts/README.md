# Concept renders

These are AI-generated mood images of hypothetical Open Remote enclosures. They are **not designs**: there are no dimensions behind them, key counts and legends drift, and the electronics shown are invented. Use them to talk about direction, not to model parts.

| File | Seed | Idea |
| --- | --- | --- |
| `palm-pebble.jpg` | 302 | Rounded pebble that fills the palm, textured PETG |
| `clear-bench.jpg` | 403 | Bench prototype: clear shell showing the controller board |
| `exploded.jpg` | 504 | Layer stack: keycaps, switches, plate, key board, controller, shell |
| `walnut-retro.jpg` | 405 | Walnut frame with orange and cream caps |
| `kid-chunky.jpg` | 406 | Oversized rounded shell with primary-colour caps |

Every key is meant to be a low-profile mechanical keycap (Choc-style), in a 3-column grid: Back/Up/Home, Left/OK/Right, A/Down/B, then Play/Pause. Only `palm-pebble.jpg` gets exactly that; the others add extra keys. The prompt describes the keys as keyboard parts, because remote-control wording produced rubber buttons and rocker d-pads.

Rendered on 2026-10-22 with Qwen-Image-Edit-2511 (Q4_K_S GGUF) and the Lightning 8-step LoRA, as text-to-image with no reference image, 1024 × 1024. `render_concepts.py` queues three seeds per concept on a ComfyUI server and writes `<concept>-<seed>.png` here; picks are made by eye. `concept-render.api.json` is the graph, ready to open in ComfyUI. The classic bar concept stays in the script but no seed produced a usable image: it always became a full keyboard.
