import * as THREE from "three";
import type { Fn } from "./labels";
import { MARKS } from "./marks";

/* Legends drawn on a canvas: simple icons for the keys everyone knows by shape, short words
 * for the rest. Geist like the page; ink contrasts with the cap. */
const WORDS: Partial<Record<Fn, string>> = {
  ok: "OK", back: "BACK", home: "HOME", menu: "MENU", input: "INPUT", info: "INFO", guide: "GUIDE",
  volume_up: "VOL+", volume_down: "VOL−", mute: "MUTE", channel_up: "CH+", channel_down: "CH−", app: "APP",
  digit_0: "0", digit_1: "1", digit_2: "2", digit_3: "3", digit_4: "4", digit_5: "5", digit_6: "6", digit_7: "7", digit_8: "8", digit_9: "9",
};

function icon(g: CanvasRenderingContext2D, fn: Fn): boolean {
  const tri = (pts: [number, number][]) => { g.beginPath(); g.moveTo(...pts[0]!); for (const p of pts.slice(1)) g.lineTo(...p); g.closePath(); g.fill(); };
  switch (fn) {
    case "up": tri([[128, 92], [158, 146], [98, 146]]); return true;
    case "down": tri([[128, 164], [158, 110], [98, 110]]); return true;
    case "left": tri([[92, 128], [146, 98], [146, 158]]); return true;
    case "right": tri([[164, 128], [110, 98], [110, 158]]); return true;
    case "play_pause": tri([[92, 98], [130, 128], [92, 158]]); g.fillRect(142, 98, 10, 60); g.fillRect(160, 98, 10, 60); return true;
    case "rewind": tri([[128, 98], [128, 158], [88, 128]]); tri([[168, 98], [168, 158], [128, 128]]); return true;
    case "fast_forward": tri([[88, 98], [88, 158], [128, 128]]); tri([[128, 98], [128, 158], [168, 128]]); return true;
    case "stop": g.fillRect(102, 102, 52, 52); return true;
    case "custom": {
      /* A four-point sparkle: the person named this key in their own words. */
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 - Math.PI / 2, r = i % 2 ? 11 : 40;
        g.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r);
      }
      g.closePath(); g.fill();
      return true;
    }
    case "power":
      g.lineWidth = 11; g.lineCap = "round";
      g.beginPath(); g.arc(128, 134, 30, -Math.PI / 2 + 0.75, -Math.PI / 2 - 0.75 + Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(128, 92); g.lineTo(128, 130); g.stroke();
      return true;
  }
  return false;
}

/* Our own plain wordmarks, for brands without a published single-colour mark. */
const WORDMARKS: Partial<Record<Fn, string>> = { disney_plus: "Disney+", prime_video: "prime", hulu: "hulu", peacock: "peacock", max: "max", xbox: "XBOX" };

/* Every app legend, mark or wordmark, is drawn large, trimmed to its ink and scaled to the
 * same visual weight (equal bounding area, capped in width and height), so a wide wordmark
 * and a square badge read as one set. */
function app(g: CanvasRenderingContext2D, fn: Fn, ink: string): boolean {
  const mark = (MARKS as Partial<Record<Fn, string>>)[fn], word = WORDMARKS[fn];
  if (!mark && !word) return false;
  const c = document.createElement("canvas"); c.width = 768; c.height = 384;
  const t = c.getContext("2d", { willReadFrequently: true })!;
  t.fillStyle = ink;
  if (mark) { t.translate(288, 0); t.scale(16, 16); t.fill(new Path2D(mark)); }
  else { t.font = `700 150px Geist, -apple-system, "Helvetica Neue", Arial, sans-serif`; t.textAlign = "center"; t.textBaseline = "middle"; t.fillText(word!, 384, 192); }
  const px = t.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    if (px[(y * c.width + x) * 4 + 3]! > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return false;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const s = Math.min(76 / Math.sqrt(w * h), 150 / w, 88 / h);
  g.drawImage(c, x0, y0, w, h, 128 - (w * s) / 2, 128 - (h * s) / 2, w * s, h * s);
  return true;
}

const cache = new Map<string, THREE.CanvasTexture>();
/** `locked` adds a small dot under the legend: the person chose this label and it stays. */
export function legendTexture(fn: Fn, ink: string, locked = false): THREE.CanvasTexture {
  const id = `${fn}|${ink}|${locked}`;
  let t = cache.get(id);
  if (t) return t;
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = g.strokeStyle = ink;
  if (!icon(g, fn) && !app(g, fn, ink)) {
    const word = WORDS[fn] ?? "";
    g.font = `600 ${word.length <= 1 ? 92 : word.length <= 3 ? 62 : 46}px Geist, -apple-system, "Helvetica Neue", Arial, sans-serif`;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(word, 128, 132);
  }
  if (locked) { g.beginPath(); g.arc(128, 214, 8, 0, Math.PI * 2); g.fill(); }
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  cache.set(id, t);
  return t;
}
