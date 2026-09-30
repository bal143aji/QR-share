import type { Packet } from '../../types/packet';
import { parsePacket } from '../protocol/packet';
import { makeGeometry, regionCount, type FrameGeometry } from './geometry';
import { decodeRegionLum, readStrip } from './opticalEncoder';
import { detectFinders, pickQuad, homography, FrameSampler } from './vision';
import { decodeQrRegion } from '../qr/qrDecoder';
import type { TransferMode } from '../../types/transfer';

export interface PipelineConfig { mode: TransferMode; gx: number; gy: number; R: number; bpc: number; tag: number }
export type PacketHandler = (p: Packet) => Promise<'new' | 'duplicate' | 'invalid'>;

export interface FrameReport {
  detected: boolean; stripOk: boolean; seq?: number; foreign?: boolean; dupFrame?: boolean;
  attempted: number; valid: number; bad: number; torn: number;
  pxPerCell?: number; edgeMargin?: number; meanLum: number; contrast?: number;
}
export interface PipelineCounters {
  framesProcessed: number; framesDetected: number; framesDuplicate: number; framesSeen: number;
  regionsAttempted: number; regionsValid: number; regionsBad: number; regionsTorn: number;
  seqMin: number; seqMax: number;
}

export class FramePipeline {
  readonly geom: FrameGeometry;
  readonly c: PipelineCounters = {
    framesProcessed: 0, framesDetected: 0, framesDuplicate: 0, framesSeen: 0,
    regionsAttempted: 0, regionsValid: 0, regionsBad: 0, regionsTorn: 0, seqMin: Infinity, seqMax: -1,
  };
  private masks = new Map<number, number>();
  constructor(private cfg: PipelineConfig, private onPacket: PacketHandler) {
    this.geom = makeGeometry(cfg.gx, cfg.gy, cfg.R);
  }
  async process(gray: Uint8Array, w: number, h: number): Promise<FrameReport> {
    const c = this.c, g = this.geom, n = regionCount(g);
    c.framesProcessed++;
    let meanLum = 0; for (let i = 0; i < gray.length; i += 61) meanLum += gray[i];
    meanLum /= Math.ceil(gray.length / 61);
    const rep: FrameReport = { detected: false, stripOk: false, attempted: 0, valid: 0, bad: 0, torn: 0, meanLum };
    const quad = pickQuad(detectFinders(gray, w, h), g);
    if (!quad) return rep;
    let Hm: number[];
    try { Hm = homography(g.finders, quad.points); } catch { return rep; }
    rep.detected = true; c.framesDetected++;
    rep.pxPerCell = quad.m;
    rep.edgeMargin = Math.min(...quad.points.map(([x, y]) => Math.min(x, y, w - x, h - y)));
    const S = new FrameSampler(gray, w, h, Hm, g);
    rep.contrast = S.contrast();
    const strip = readStrip(g, S.strip());
    rep.stripOk = !!strip;
    let mask = 0;
    if (strip) {
      if (strip.tid16 !== (this.cfg.tag & 0xffff)) { rep.foreign = true; return rep; }
      rep.seq = strip.seq;
      mask = this.masks.get(strip.seq) ?? -1;
      if (mask === -1) {
        mask = 0; c.framesSeen++;
        c.seqMin = Math.min(c.seqMin, strip.seq); c.seqMax = Math.max(c.seqMax, strip.seq);
        if (this.masks.size > 64) this.masks.delete(this.masks.keys().next().value as number);
      }
      if (mask === (1 << n) - 1) { rep.dupFrame = true; c.framesDuplicate++; return rep; }
    }
    for (let r = 0; r < n; r++) {
      if (mask & (1 << r)) continue;
      rep.attempted++; c.regionsAttempted++;
      const lum = S.region(r);
      const bytes = this.cfg.mode === 'qr' ? decodeQrRegion(lum, g.R) : decodeRegionLum(lum, g.R, this.cfg.bpc, r);
      const pr = bytes ? parsePacket(bytes) : null;
      if (!pr || !pr.ok || pr.packet.regionIdx !== r || pr.packet.transferTag !== this.cfg.tag) { rep.bad++; c.regionsBad++; continue; }
      if (strip && pr.packet.frameSeq !== strip.seq) { rep.torn++; c.regionsTorn++; continue; } // half old / half new frame
      const seq = pr.packet.frameSeq;
      if (!strip) { // no strip: still track frame numbers from the packet itself
        if (!this.masks.has(seq)) { c.framesSeen++; c.seqMin = Math.min(c.seqMin, seq); c.seqMax = Math.max(c.seqMax, seq); }
      }
      await this.onPacket(pr.packet);
      rep.valid++; c.regionsValid++; mask |= 1 << r;
      this.masks.set(seq, mask);
    }
    if (strip) this.masks.set(strip.seq, mask);
    return rep;
  }
}
