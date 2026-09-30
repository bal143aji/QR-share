/** Moving-average throughput over a sliding time window (default 8 s). */
export class MovingRate {
  private s: { t: number; b: number }[] = [];
  constructor(private windowMs = 8000) {}
  add(bytes: number, t = performance.now()) {
    const last = this.s[this.s.length - 1];
    this.s.push({ t, b: (last?.b ?? 0) + bytes });
    while (this.s.length > 2 && t - this.s[0].t > this.windowMs) this.s.shift();
  }
  rate(now = performance.now()): number {
    if (this.s.length < 2) return 0;
    const a = this.s[0], z = this.s[this.s.length - 1];
    const dt = Math.max(now, z.t) - a.t;
    return dt > 500 ? (z.b - a.b) / (dt / 1000) : 0;
  }
  eta(remainingBytes: number, now = performance.now()): number {
    const r = this.rate(now);
    return r > 0 ? remainingBytes / r : Infinity;
  }
}
