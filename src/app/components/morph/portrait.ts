import { Persona } from '../../content';

/**
 * Turns one photo into four "characters", rendered once on a canvas:
 *   jan       – the photo itself
 *   architect – a blueprint: edge-detected lines on a drafting grid
 *   embedded  – an LED matrix, like the face of a word clock
 *   designer  – a pop-art halftone print
 */

const OUT = 520; // output size in px (square)
const N = 260; // analysis resolution

type Lum = (u: number, v: number) => number;

export async function renderPortraits(src: string): Promise<Record<Persona, string>> {
  const img = await load(src);
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - s) / 2;
  const sy = Math.min(img.naturalHeight - s, img.naturalHeight * 0.03);
  const crop = (size: number) => {
    const [c, g] = canvas(size);
    g.drawImage(img, sx, sy, s, s, 0, 0, size, size);
    return c;
  };

  const lum = luminance(crop(N));
  const at: Lum = (u, v) => lum[clampI(v * N, N) * N + clampI(u * N, N)];
  const url = (c: HTMLCanvasElement) => c.toDataURL('image/jpeg', 0.9);

  return {
    jan: url(crop(OUT)),
    architect: url(blueprint(lum)),
    embedded: url(leds(at)),
    designer: url(halftone(at)),
  };
}

function blueprint(lum: Float32Array) {
  const [c, g] = canvas(OUT);
  g.fillStyle = '#1e40af';
  g.fillRect(0, 0, OUT, OUT);
  grid(g, 13, 'rgba(255,255,255,.06)');
  grid(g, 65, 'rgba(255,255,255,.16)');

  // Sobel on a softened copy → bright lines where the photo has edges.
  const soft = blur(lum);
  const mag = new Float32Array(N * N);
  for (let y = 1; y < N - 1; y++) {
    for (let x = 1; x < N - 1; x++) {
      const p = (dx: number, dy: number) => soft[(y + dy) * N + x + dx];
      const gx = p(1, -1) + 2 * p(1, 0) + p(1, 1) - p(-1, -1) - 2 * p(-1, 0) - p(-1, 1);
      const gy = p(-1, 1) + 2 * p(0, 1) + p(1, 1) - p(-1, -1) - 2 * p(0, -1) - p(1, -1);
      mag[y * N + x] = Math.hypot(gx, gy);
    }
  }
  const top = percentile(mag, 0.97) || 1;
  const [lines, lg] = canvas(N);
  const data = lg.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const edge = clamp((mag[i] / top - 0.2) * 1.3);
    const shade = clamp((0.35 - soft[i]) * 0.9); // faint fill in the darkest areas
    data.data.set([219, 234, 254, Math.max(edge, shade) * 255], i * 4);
  }
  lg.putImageData(data, 0, 0);
  g.imageSmoothingQuality = 'high';
  g.drawImage(lines, 0, 0, OUT, OUT);

  // Drafting annotations.
  g.strokeStyle = g.fillStyle = 'rgba(219,234,254,.85)';
  g.lineWidth = 1.5;
  g.font = '600 11px ui-monospace, Menlo, monospace';
  dimension(g, 24, 40, 24, OUT - 90);
  dimension(g, 60, OUT - 24, OUT - 210, OUT - 24);
  g.strokeRect(OUT - 190, OUT - 70, 170, 50);
  g.fillText('JAN / ARCHITECT', OUT - 180, OUT - 50);
  g.fillText('REV.03   SCALE 1:1', OUT - 180, OUT - 32);
  return c;
}

function leds(at: Lum) {
  const [c, g] = canvas(OUT);
  g.fillStyle = '#0c0a09';
  g.fillRect(0, 0, OUT, OUT);
  const cols = 44;
  const cell = OUT / cols;
  for (let row = 0; row < cols; row++) {
    for (let col = 0; col < cols; col++) {
      const u = (col + 0.5) / cols;
      const v = (row + 0.5) / cols;
      const level = Math.round(Math.pow(at(u, v) * spotlight(u, v), 1.3) * 5) / 5;
      g.fillStyle = `rgba(251,191,36,${0.07 + 0.93 * level})`;
      g.beginPath();
      g.arc((col + 0.5) * cell, (row + 0.5) * cell, cell * 0.36, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Glow: a blurred copy added on top (plain copy where canvas filters are unsupported).
  const [glow, gg] = canvas(OUT);
  gg.drawImage(c, 0, 0);
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = 0.5;
  g.filter = 'blur(5px)';
  g.drawImage(glow, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.filter = 'none';
  g.fillStyle = 'rgba(251,191,36,.7)';
  g.font = '600 11px ui-monospace, Menlo, monospace';
  g.fillText('44×44 LED  ·  60 HZ', 16, OUT - 16);
  return c;
}

function halftone(at: Lum) {
  const [c, g] = canvas(OUT);
  g.fillStyle = '#fde047';
  g.fillRect(0, 0, OUT, OUT);
  const ink = (d: number) => clamp((d - 0.12) / 0.88);
  dots(g, at, 15, 9, '#ec4899', (d) => 0.62 * Math.sqrt(ink(d)));
  dots(g, at, 45, 9, '#0c0a09', (d) => (d < 0.5 ? 0 : 0.6 * Math.sqrt((d - 0.5) / 0.5)));
  g.lineWidth = 10;
  g.strokeStyle = '#0c0a09';
  g.strokeRect(5, 5, OUT - 10, OUT - 10);
  return c;
}

/** Halftone screen at `deg`; dot radius = cell * radius(darkness). */
function dots(g: CanvasRenderingContext2D, at: Lum, deg: number, cell: number, color: string, radius: (d: number) => number) {
  const a = (deg * Math.PI) / 180;
  const [cos, sin] = [Math.cos(a), Math.sin(a)];
  const reach = Math.ceil((OUT * Math.SQRT2) / cell / 2) + 1;
  const mid = OUT / 2;
  g.fillStyle = color;
  for (let i = -reach; i <= reach; i++) {
    for (let j = -reach; j <= reach; j++) {
      const x = mid + (i * cos - j * sin) * cell;
      const y = mid + (i * sin + j * cos) * cell;
      if (x < -cell || y < -cell || x > OUT + cell || y > OUT + cell) continue;
      const r = cell * radius(1 - at(x / OUT, y / OUT));
      if (r < 0.4) continue;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

function load(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('2d canvas unavailable');
  return [c, g];
}

/** Luminance 0..1, contrast-stretched between the 2nd and 98th percentile. */
function luminance(c: HTMLCanvasElement) {
  const px = c.getContext('2d')!.getImageData(0, 0, N, N).data;
  const out = new Float32Array(N * N);
  for (let i = 0; i < out.length; i++) {
    out[i] = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;
  }
  const lo = percentile(out, 0.02);
  const hi = percentile(out, 0.98);
  for (let i = 0; i < out.length; i++) out[i] = clamp((out[i] - lo) / (hi - lo || 1));
  return out;
}

function blur(src: Float32Array) {
  const out = new Float32Array(src.length);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
          sum += src[yy * N + xx];
          n++;
        }
      }
      out[y * N + x] = sum / n;
    }
  }
  return out;
}

function grid(g: CanvasRenderingContext2D, step: number, color: string) {
  g.strokeStyle = color;
  g.lineWidth = 1;
  g.beginPath();
  for (let p = step; p < OUT; p += step) {
    g.moveTo(p + 0.5, 0);
    g.lineTo(p + 0.5, OUT);
    g.moveTo(0, p + 0.5);
    g.lineTo(OUT, p + 0.5);
  }
  g.stroke();
}

/** A drafting dimension line with end ticks. */
function dimension(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  const vertical = x1 === x2;
  const t = 6;
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  for (const [x, y] of [[x1, y1], [x2, y2]]) {
    vertical ? (g.moveTo(x - t, y), g.lineTo(x + t, y)) : (g.moveTo(x, y - t), g.lineTo(x, y + t));
  }
  g.stroke();
}

/** Dims the edges so the face carries the LED image. */
const spotlight = (u: number, v: number) =>
  clamp(1.5 - ((u - 0.5) / 0.45) ** 2 - ((v - 0.45) / 0.55) ** 2);

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const clampI = (v: number, n: number) => Math.max(0, Math.min(n - 1, Math.floor(v)));

function percentile(values: Float32Array, p: number) {
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.floor(p * (sorted.length - 1))];
}
