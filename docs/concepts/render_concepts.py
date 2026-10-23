"""Queue the concept-render graph on a ComfyUI server once per concept and fetch the images.

The graph is Qwen-Image-Edit-2511 used as plain text-to-image (no reference image), with the
Lightning LoRA, so it runs at cfg 1.0 and 8 steps. It is written to concept-render.api.json
so it can be opened and re-run in ComfyUI directly. Orchestration only: no image processing here.

Usage: python3 render_concepts.py [http://comfy-host:8188]
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = sys.argv[1] if len(sys.argv) > 1 else "http://192.168.0.210:8188"

STYLE = ("Studio product photograph, soft daylight, shallow depth of field, realistic materials, "
         "sharp focus on the keys. A handheld TV remote built like a small mechanical keyboard macropad.")
# Remote-control words pull the model toward rubber buttons and rocker d-pads, so the keys are
# described as keyboard parts, with the layout as a grid, and the whole clause goes last.
KEYS = ("Its ten keys sit in a regular grid of three columns: Back, Up, Home on the top row; Left, OK, "
        "Right on the second row; A, Down, B on the third row; and a single Play/Pause key centred "
        "on the fourth row. Every key is an identical separate square low-profile mechanical keyboard "
        "keycap, exactly like the keys of a Kailh Choc low-profile keyboard: a thin flat square cap "
        "about 18 mm wide, standing a few millimetres above a flat switch plate on its own visible "
        "low-profile switch, with even gaps between keys and a small printed legend on each cap.")

# Each concept renders once per base seed (offset by its index); pick the best by eye.
SEEDS = (301, 401, 501)

CONCEPTS = {
    "classic-bar": "A slim conventional bar-shaped remote in matte charcoal 3D-printed plastic with "
                   "visible fine print layer lines, cream keycaps, lying on a light oak coffee table "
                   "next to a TV in the background.",
    "palm-pebble": "A rounded pebble-shaped remote that fills the palm, in sage-green textured PETG, "
                   "off-white keycaps, held in a relaxed adult hand, living room out of focus behind.",
    "clear-bench": "A bench prototype remote with a clear transparent printed shell showing a small "
                   "blue ESP32 development board, hand-soldered wires and the switch pins inside, "
                   "translucent keycaps, on a workbench with a soldering iron out of focus.",
    "exploded": "A single exploded-view diagram of one remote, seen at a three-quarter angle on a "
                "white background, with its layers floating in one vertical stack: keycaps at the top, "
                "low-profile switches below them, a printed switch plate, a thin green key circuit "
                "board, a small blue controller board, and the grey printed shell at the bottom.",
    "walnut-retro": "A chunky retro remote with a walnut wood top panel and a black printed base, "
                    "orange and cream keycaps, mid-century living room with a vintage TV behind.",
    "kid-chunky": "A sturdy oversized kid-friendly remote with soft rounded edges in bright "
                  "yellow printed plastic, keycaps in primary colours, on a colourful play rug.",
}


def graph(prompt, seed, prefix):
    return {
        "1": {"class_type": "UnetLoaderGGUF", "inputs": {"unet_name": "qwen-image-edit-2511-Q4_K_S.gguf"}},
        "2": {"class_type": "LoraLoaderModelOnly", "inputs": {
            "model": ["1", 0], "strength_model": 1.0,
            "lora_name": "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors"}},
        "3": {"class_type": "CLIPLoader", "inputs": {
            "clip_name": "qwen_2.5_vl_7b_fp8_scaled.safetensors", "type": "qwen_image", "device": "default"}},
        "4": {"class_type": "VAELoader", "inputs": {"vae_name": "qwen_image_vae.safetensors"}},
        "5": {"class_type": "TextEncodeQwenImageEditPlus", "inputs": {"clip": ["3", 0], "vae": ["4", 0], "prompt": prompt}},
        "6": {"class_type": "TextEncodeQwenImageEditPlus", "inputs": {"clip": ["3", 0], "vae": ["4", 0], "prompt": ""}},
        "7": {"class_type": "EmptySD3LatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
        "8": {"class_type": "KSampler", "inputs": {
            "model": ["2", 0], "positive": ["5", 0], "negative": ["6", 0], "latent_image": ["7", 0],
            "seed": seed, "steps": 8, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["4", 0]}},
        "10": {"class_type": "SaveImage", "inputs": {"images": ["9", 0], "filename_prefix": prefix}},
    }


def call(path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(SERVER + path, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def main():
    first = next(iter(CONCEPTS))
    (HERE / "concept-render.api.json").write_text(
        json.dumps(graph(f"{STYLE} {CONCEPTS[first]} {KEYS}", 301, f"open-remote/{first}"), indent=2) + "\n")
    queued = {}
    for i, (name, scene) in enumerate(CONCEPTS.items()):
        for seed in SEEDS:
            key = f"{name}-{seed + i}"
            reply = json.loads(call("/prompt", {"prompt": graph(f"{STYLE} {scene} {KEYS}", seed + i, f"open-remote/{name}")}))
            queued[key] = reply["prompt_id"]
            print("queued", key, reply["prompt_id"], flush=True)
    for name, pid in queued.items():
        while True:
            history = json.loads(call(f"/history/{pid}")).get(pid)
            if history and history.get("status", {}).get("completed"):
                break
            if history and history.get("status", {}).get("status_str") == "error":
                sys.exit(f"{name} failed: {history['status']}")
            time.sleep(5)
        image = history["outputs"]["10"]["images"][0]
        query = urllib.parse.urlencode({k: image[k] for k in ("filename", "subfolder", "type")})
        (HERE / f"{name}.png").write_bytes(call(f"/view?{query}"))
        print("saved", name, flush=True)


if __name__ == "__main__":
    main()
