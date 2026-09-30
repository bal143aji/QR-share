export const MARGIN = 8;   // cells reserved around the payload area (finder markers + sync strip)
export const FINDER = 7;
export const PAD = 4;      // extra white cells drawn around the frame on the sender display
export const STRIP_BITS = 64;

export interface FrameGeometry {
  gx: number; gy: number; R: number; W: number; H: number;
  /** canonical finder centres TL, TR, BL, BR in cell coordinates */
  finders: [number, number][];
}
export function makeGeometry(gx: number, gy: number, R: number): FrameGeometry {
  const W = gx * R + 2 * MARGIN, H = gy * R + 2 * MARGIN, c = FINDER / 2;
  return { gx, gy, R, W, H, finders: [[c, c], [W - c, c], [c, H - c], [W - c, H - c]] };
}
/** Fixed region positions: 0=top-left, 1=top-right, ... row-major. */
export const regionOrigin = (g: FrameGeometry, idx: number): [number, number] =>
  [MARGIN + (idx % g.gx) * g.R, MARGIN + Math.floor(idx / g.gx) * g.R];
export const regionCount = (g: FrameGeometry) => g.gx * g.gy;
