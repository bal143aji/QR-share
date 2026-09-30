import { FrameBuilder, type ShardSource } from './frameBuilder';
import { PAD, regionCount } from './geometry';
import { frameToRgba } from './opticalEncoder';
import { qrMatrix } from '../qr/qrEncoder';
import type { TransferHeader } from '../../types/transfer';
import type { Layout } from '../file/layout';
import { buildTestFrame, type CalStepMsg } from './calibration';
import { geometryFor } from './frameBuilder';

export interface SenderStats {
  framesShown: number; cycle: number; firstPassProgress: number; running: boolean; paused: boolean; frameMs: number;
  ceilingRate: number; bufferLow: boolean; mode: 'handshake' | 'data';
}
const HANDSHAKE_HOLD_MS = 6000;

/** Drives the sender canvas. Frames only change on requestAnimationFrame boundaries (tearing protection). */
export class SenderEngine {
  private fb: FrameBuilder;
  private queue: { cells: Uint8Array; seq: number; cycle: number }[] = [];
  private running = false; private paused = false;
  private lastSwap = 0; private holdLeft = 0; private mode: 'handshake' | 'data' = 'handshake';
  private modeSince = 0; private lastHandshake = 0;
  private shown = 0; private cycle = 0; private frameMs: number;
  private off = document.createElement('canvas');
  private totalShards: number;
  private starved = false;
  constructor(private h: TransferHeader, layout: Layout, source: ShardSource, private canvas: HTMLCanvasElement,
    private handshakeText: string, private onStats: (s: SenderStats) => void, private sizePx: () => number) {
    this.fb = new FrameBuilder(h, layout, source);
    this.frameMs = h.frameMs;
    this.totalShards = layout.segments.reduce((a, s) => a + s.n, 0);
  }
  start() { this.running = true; this.paused = false; this.pump(); requestAnimationFrame(this.tick); }
  stop() { this.running = false; }
  pause() { this.paused = true; this.report(); }
  resume() { this.paused = false; this.lastSwap = 0; this.report(); }
  setFrameMs(ms: number) { this.frameMs = Math.max(33, ms); this.report(); }
  showHandshake(holdMs = 8000) {
    this.mode = 'handshake';
    this.modeSince = performance.now() + (holdMs - HANDSHAKE_HOLD_MS);
    this.lastHandshake = performance.now();
    this.drawHandshake();
    this.report();
  }
  startData() {
    this.mode = 'data';
    this.lastSwap = 0;
    this.report();
  }
  get geom() { return this.fb.geom; }

  private async pump() {
    while (this.running) {
      if (this.queue.length >= 4) { await new Promise((r) => setTimeout(r, 8)); continue; }
      try { const f = await this.fb.next(); this.queue.push(f); } catch (e) { console.error('frame build failed'); await new Promise((r) => setTimeout(r, 200)); }
    }
  }
  private tick = (t: number) => {
    if (!this.running) return;
    if (!this.paused) this.step(t);
    requestAnimationFrame(this.tick);
  };
  private step(t: number) {
    if (this.mode === 'handshake') {
      if (this.modeSince === 0) { this.modeSince = t; this.lastHandshake = t; this.drawHandshake(); }
      if (t - this.modeSince >= HANDSHAKE_HOLD_MS) { this.mode = 'data'; this.lastSwap = 0; this.report(); }
      return;
    }
    if (t - this.lastSwap < this.frameMs - 6) return;
    const every = this.h.handshakeEverySec * 1000;
    if (every > 0 && t - this.lastHandshake >= every) { this.mode = 'handshake'; this.modeSince = 0; return; }
    if (this.holdLeft > 0) { this.holdLeft--; this.lastSwap = t; return; }
    const f = this.queue.shift();
    this.starved = !f;
    if (!f) return;
    this.draw(f.cells);
    this.holdLeft = Math.max(0, this.h.repeat - 1);
    this.lastSwap = t; this.shown++; this.cycle = f.cycle;
    if (this.shown % 5 === 0) this.report();
  }
  report() {
    const per = regionCount(this.fb.geom);
    this.onStats({
      framesShown: this.shown, cycle: this.cycle, firstPassProgress: Math.min(1, (this.shown * per) / this.totalShards),
      running: this.running, paused: this.paused, frameMs: this.frameMs, ceilingRate: 0, bufferLow: this.starved,
      mode: this.mode,
    });
  }
  private scaleCanvas(cellsW: number, cellsH: number) {
    const dpr = window.devicePixelRatio || 1, avail = Math.max(64, Math.floor(this.sizePx() * dpr));
    const cell = Math.max(1, Math.floor(avail / Math.max(cellsW, cellsH)));
    this.canvas.width = cell * cellsW; this.canvas.height = cell * cellsH;
    this.canvas.style.width = `${(cell * cellsW) / dpr}px`; this.canvas.style.height = `${(cell * cellsH) / dpr}px`;
    return this.canvas.getContext('2d')!;
  }
  private draw(cells: Uint8Array) {
    const { W, H } = this.fb.geom;
    const rgba = frameToRgba(cells, W, H, PAD);
    this.off.width = rgba.w; this.off.height = rgba.h;
    this.off.getContext('2d')!.putImageData(new ImageData(rgba.data as Uint8ClampedArray<ArrayBuffer>, rgba.w, rgba.h), 0, 0);
    const ctx = this.scaleCanvas(rgba.w, rgba.h);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.off, 0, 0, this.canvas.width, this.canvas.height);
  }
  private drawHandshake() { drawQrText(this.canvas, this.handshakeText, this.sizePx()); }
}

/** Draw a text QR (handshake / calibration announcement) with integer-pixel modules. */
export function drawQrText(canvas: HTMLCanvasElement, text: string, sizePx: number) {
  const m = qrMatrix(text, 'M'), quiet = 4, n = m.size + 2 * quiet, dpr = window.devicePixelRatio || 1;
  const cell = Math.max(2, Math.floor((sizePx * dpr) / n));
  canvas.width = canvas.height = cell * n;
  canvas.style.width = canvas.style.height = `${(cell * n) / dpr}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) if (m.get(x, y)) ctx.fillRect((x + quiet) * cell, (y + quiet) * cell, cell, cell);
}

/** Calibration sender: shows announcement QR then N test frames for each step, then an END QR. */
export class CalibrationRunner {
  private cancelled = false;
  constructor(private canvas: HTMLCanvasElement, private sizePx: () => number, private onStep: (i: number, total: number, phase: string) => void) {}
  cancel() { this.cancelled = true; }
  async run(steps: (CalStepMsg)[], endText: string, encode: (m: CalStepMsg) => string) {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const off = document.createElement('canvas');
    for (let i = 0; i < steps.length && !this.cancelled; i++) {
      const s = steps[i];
      this.onStep(i, steps.length, 'announce');
      drawQrText(this.canvas, encode(s), this.sizePx());
      await sleep(2200);
      this.onStep(i, steps.length, 'test');
      
      const g = geometryFor(s);
      for (let f = 0; f < s.nFrames && !this.cancelled; f++) {
        const cells = buildTestFrame(s, s.nonce, f);
        const rgba = frameToRgba(cells, g.W, g.H, PAD);
        off.width = rgba.w; off.height = rgba.h;
        off.getContext('2d')!.putImageData(new ImageData(rgba.data as Uint8ClampedArray<ArrayBuffer>, rgba.w, rgba.h), 0, 0);
        const dpr = window.devicePixelRatio || 1, cell = Math.max(1, Math.floor((this.sizePx() * dpr) / Math.max(rgba.w, rgba.h)));
        this.canvas.width = cell * rgba.w; this.canvas.height = cell * rgba.h;
        this.canvas.style.width = `${(cell * rgba.w) / dpr}px`; this.canvas.style.height = `${(cell * rgba.h) / dpr}px`;
        const ctx = this.canvas.getContext('2d')!; ctx.imageSmoothingEnabled = false;
        ctx.drawImage(off, 0, 0, this.canvas.width, this.canvas.height);
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        await sleep(Math.max(0, s.frameMs - 16));
      }
    }
    if (!this.cancelled) { this.onStep(steps.length, steps.length, 'end'); drawQrText(this.canvas, endText, this.sizePx()); await sleep(2500); }
  }
}
