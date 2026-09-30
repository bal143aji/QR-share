import { FINDER, MARGIN, STRIP_BITS, type FrameGeometry, regionOrigin } from './geometry';
import { stripCell } from './opticalEncoder';

export function rgbaToGray(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Uint8Array {
  const g = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
  return g;
}

/* ---------- finder detection ---------- */
export interface Candidate { x: number; y: number; m: number; n: number }

class Binarizer {
  private I: Uint32Array; private hw: number;
  constructor(private g: Uint8Array, private w: number, private h: number) {
    this.hw = Math.max(6, Math.round(w / 40));
    const W1 = w + 1; this.I = new Uint32Array(W1 * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) { row += g[y * w + x]; this.I[(y + 1) * W1 + x + 1] = this.I[y * W1 + x + 1] + row; }
    }
  }
  black(x: number, y: number): boolean {
    const { w, h, hw, I } = this, W1 = w + 1;
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const x0 = Math.max(0, x - hw), x1 = Math.min(w, x + hw + 1), y0 = Math.max(0, y - hw), y1 = Math.min(h, y + hw + 1);
    const sum = I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0];
    return this.g[y * w + x] < (sum / ((x1 - x0) * (y1 - y0))) * 0.78;
  }
}

function ratioOk(r: number[]): number {
  const total = r[0] + r[1] + r[2] + r[3] + r[4];
  if (total < 7) return 0;
  const m = total / 7, t = m * 0.65;
  if (Math.abs(r[0] - m) < t && Math.abs(r[1] - m) < t && Math.abs(r[2] - 3 * m) < 3 * t &&
      Math.abs(r[3] - m) < t && Math.abs(r[4] - m) < t) return m;
  return 0;
}
function crossCheck(get: (t: number) => boolean, t0: number, tMax: number): { c: number; m: number } | null {
  if (!get(t0)) return null;
  let a = 0, t = t0;
  while (t >= 0 && get(t)) { a++; t--; }
  let w1 = 0; while (t >= 0 && !get(t)) { w1++; t--; }
  let b1 = 0; while (t >= 0 && get(t)) { b1++; t--; }
  if (!w1 || !b1) return null;
  let u = t0 + 1, b = 0;
  while (u < tMax && get(u)) { b++; u++; }
  let w2 = 0; while (u < tMax && !get(u)) { w2++; u++; }
  let b2 = 0; while (u < tMax && get(u)) { b2++; u++; }
  if (!w2 || !b2) return null;
  const m = ratioOk([b1, w1, a + b, w2, b2]);
  return m ? { c: (t0 - a + 1 + t0 + b + 1) / 2, m } : null;
}

export function detectFinders(gray: Uint8Array, w: number, h: number): Candidate[] {
  const B = new Binarizer(gray, w, h);
  const cands: Candidate[] = [];
  const runs = [0, 0, 0, 0, 0];
  for (let y = 0; y < h; y += 2) {
    let cur = B.black(0, y), len = 0, nRuns = 0;
    for (let x = 0; x <= w; x++) {
      const b = x < w ? B.black(x, y) : !cur;
      if (b === cur) { len++; continue; }
      runs[0] = runs[1]; runs[1] = runs[2]; runs[2] = runs[3]; runs[3] = runs[4]; runs[4] = len; nRuns++;
      if (cur && nRuns >= 5) {
        const m = ratioOk(runs);
        if (m) {
          const cx = x - runs[4] - runs[3] - runs[2] / 2;
          const v = crossCheck((t) => B.black(Math.floor(cx), t), y, h);
          if (v && Math.abs(v.m - m) < 0.5 * m) {
            const hh = crossCheck((t) => B.black(t, Math.floor(v.c)), Math.floor(cx), w);
            if (hh) {
              const cm = (v.m + hh.m) / 2, cxx = hh.c, cyy = v.c;
              const ex = cands.find((c) => Math.hypot(c.x - cxx, c.y - cyy) < Math.max(3, c.m * 2));
              if (ex) { ex.x = (ex.x * ex.n + cxx) / (ex.n + 1); ex.y = (ex.y * ex.n + cyy) / (ex.n + 1); ex.m = (ex.m * ex.n + cm) / (ex.n + 1); ex.n++; }
              else cands.push({ x: cxx, y: cyy, m: cm, n: 1 });
            }
          }
        }
      }
      cur = b; len = 1;
    }
  }
  return cands.filter((c) => c.n >= 2).sort((a, b) => b.n - a.n);
}

export interface Quad { points: [number, number][]; m: number; score: number }

/** Choose the 4 candidates that best form the expected frame quadrilateral (TL,TR,BL,BR). */
export function pickQuad(cands: Candidate[], g: FrameGeometry): Quad | null {
  const cs = cands.slice(0, 9);
  if (cs.length < 4) return null;
  const spanX = g.W - FINDER, spanY = g.H - FINDER, expAspect = spanX / spanY;
  let best: Quad | null = null;
  for (let a = 0; a < cs.length; a++) for (let b = a + 1; b < cs.length; b++)
    for (let c = b + 1; c < cs.length; c++) for (let d = c + 1; d < cs.length; d++) {
      const q = [cs[a], cs[b], cs[c], cs[d]].sort((p, r) => p.y - r.y);
      const top = [q[0], q[1]].sort((p, r) => p.x - r.x), bot = [q[2], q[3]].sort((p, r) => p.x - r.x);
      const [TL, TR, BL, BR] = [top[0], top[1], bot[0], bot[1]];
      const dist = (p: Candidate, r: Candidate) => Math.hypot(p.x - r.x, p.y - r.y);
      const t = dist(TL, TR), bt = dist(BL, BR), l = dist(TL, BL), r = dist(TR, BR);
      const mAvg = (TL.m + TR.m + BL.m + BR.m) / 4;
      const mSpread = (Math.max(TL.m, TR.m, BL.m, BR.m) - Math.min(TL.m, TR.m, BL.m, BR.m)) / mAvg;
      const aspect = ((t + bt) / 2) / ((l + r) / 2);
      const s2 = Math.abs(Math.log(aspect / expAspect));
      const s3 = Math.abs((((t + bt) / 2) / spanX) / mAvg - 1);
      const par = Math.abs(t - bt) / ((t + bt) / 2) + Math.abs(l - r) / ((l + r) / 2);
      const score = mSpread + 2 * s2 + 2 * s3 + 0.5 * par;
      if (!best || score < best.score) best = { points: [[TL.x, TL.y], [TR.x, TR.y], [BL.x, BL.y], [BR.x, BR.y]], m: mAvg, score };
    }
  return best && best.score < 0.7 ? best : null;
}

/* ---------- homography ---------- */
export function homography(src: number[][], dst: number[][]): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c]; if (Math.abs(d) < 1e-12) throw new Error('degenerate');
    for (let k = c; k < 9; k++) A[c][k] /= d;
    for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c]; if (f) for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k]; }
  }
  return [A[0][8], A[1][8], A[2][8], A[3][8], A[4][8], A[5][8], A[6][8], A[7][8], 1];
}

/* ---------- sampling ---------- */
export class FrameSampler {
  constructor(private gray: Uint8Array, private w: number, private h: number, private H: number[], private g: FrameGeometry) {}
  private bil(u: number, v: number): number {
    const { gray, w, h } = this;
    const x = u - 0.5, y = v - 0.5;
    let x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0;
    const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
    x0 = Math.min(w - 1, x0); y0 = Math.min(h - 1, y0);
    const a = gray[y0 * w + x0], b = gray[y0 * w + x1], c = gray[y1 * w + x0], d = gray[y1 * w + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  /** luminance at canonical cell coordinates (5-tap average around the cell centre) */
  cell(X: number, Y: number): number {
    const H = this.H; let s = 0;
    for (let t = 0; t < 5; t++) {
      const px = X + (t === 1 ? 0.2 : t === 2 ? -0.2 : 0), py = Y + (t === 3 ? 0.2 : t === 4 ? -0.2 : 0);
      const wd = H[6] * px + H[7] * py + 1;
      s += this.bil((H[0] * px + H[1] * py + H[2]) / wd, (H[3] * px + H[4] * py + H[5]) / wd);
    }
    return s / 5;
  }
  region(idx: number): Float32Array {
    const R = this.g.R, [ox, oy] = regionOrigin(this.g, idx), out = new Float32Array(R * R);
    for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) out[y * R + x] = this.cell(ox + x + 0.5, oy + y + 0.5);
    return out;
  }
  strip(): Float32Array {
    const out = new Float32Array(STRIP_BITS);
    for (let i = 0; i < STRIP_BITS; i++) { const [x, y] = stripCell(this.g, i); out[i] = this.cell(x + 0.5, y + 0.5); }
    return out;
  }
  /** mean luminance of white margin vs finder ring: contrast/focus proxy */
  contrast(): number {
    const white = this.cell(MARGIN - 0.5, 3.5), black = this.cell(0.5, 3.5);
    return white - black;
  }
}
