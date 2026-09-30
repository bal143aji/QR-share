import { mulberry32 } from '../../utils/binary';
import { homography } from '../optical/vision';

export interface ChannelOptions {
  scale: number; margin: number; rotationDeg: number; perspective: number;
  blur: number; noise: number; gain: number; offset: number; seed: number;
}
export const defaultChannel: ChannelOptions = { scale: 5, margin: 50, rotationDeg: 2, perspective: 0.04, blur: 1, noise: 4, gain: 0.85, offset: 20, seed: 1 };

/** Software model of screen -> camera: perspective + rotation, optical blur, gain/offset, sensor noise. */
export function simulateCamera(cells: Uint8Array, W: number, H: number, o: ChannelOptions) {
  const pad = 4, w = Math.round(W * o.scale + 2 * o.margin), h = Math.round(H * o.scale + 2 * o.margin);
  const cx = w / 2, cy = h / 2, hw = (W * o.scale) / 2, hh = (H * o.scale) / 2;
  const th = (o.rotationDeg * Math.PI) / 180, cs = Math.cos(th), sn = Math.sin(th);
  const corner = (sx: number, sy: number): [number, number] => {
    const k = 1 + o.perspective * sy * 1 - o.perspective * 0.5 * sx * 0;
    const x = sx * hw * k, y = sy * hh * (1 + o.perspective * 0.3 * sx);
    return [cx + x * cs - y * sn, cy + x * sn + y * cs];
  };
  const dst = [corner(-1, -1), corner(1, -1), corner(-1, 1), corner(1, 1)];
  const src = [[0, 0], [W, 0], [0, H], [W, H]];
  const Hi = homography(dst, src); // image -> cell coordinates
  const img = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x + 0.5, py = y + 0.5, wd = Hi[6] * px + Hi[7] * py + 1;
    const u = (Hi[0] * px + Hi[1] * py + Hi[2]) / wd, v = (Hi[3] * px + Hi[4] * py + Hi[5]) / wd;
    let val = 10;
    if (u >= -pad && v >= -pad && u < W + pad && v < H + pad) {
      const iu = Math.floor(u), iv = Math.floor(v);
      val = iu >= 0 && iv >= 0 && iu < W && iv < H ? cells[iv * W + iu] : 255;
    }
    img[y * w + x] = val;
  }
  let cur = img;
  for (let pass = 0; pass < o.blur; pass++) { // repeated 3x3 box blur
    const nx = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        s += cur[yy * w + xx]; c++;
      }
      nx[y * w + x] = s / c;
    }
    cur = nx;
  }
  const rnd = mulberry32(o.seed), out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) {
    const g = Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
    out[i] = Math.max(0, Math.min(255, Math.round(cur[i] * o.gain + o.offset + g * o.noise)));
  }
  return { gray: out, w, h };
}
