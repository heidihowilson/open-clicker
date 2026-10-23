# Concept renders

These are AI-generated mood images of hypothetical Open Remote enclosures. They are **not designs**: there are no dimensions behind them, key counts and legends drift, and the electronics shown are invented. Use them to talk about direction, not to model parts.

| File | Idea |
| --- | --- |
| `classic-bar.jpg` | Conventional slim bar remote in printed charcoal plastic |
| `palm-pebble.jpg` | Rounded pebble that fills the palm, textured PETG |
| `clear-bench.jpg` | Bench prototype: clear shell showing the controller board and hand wiring |
| `exploded.jpg` | Layer stack: keycaps, switches, plate, key board, controller, shell |
| `walnut-retro.jpg` | Walnut top panel with orange and cream caps |
| `kid-chunky.jpg` | Oversized rounded shell with primary-colour caps |

Rendered on 2026-10-22 with Qwen-Image-Edit-2511 (Q4_K_S GGUF) and the Lightning 8-step LoRA, as text-to-image with no reference image, 1024 × 1024. `render_concepts.py` queues the graph on a ComfyUI server once per concept and writes PNGs here; `concept-render.api.json` is the same graph, ready to open in ComfyUI. `clear-bench.jpg` comes from an earlier pass (seed 103) before the ten-key clause was added, because that pass kept the clear shell.
