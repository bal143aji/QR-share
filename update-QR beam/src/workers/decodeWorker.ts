import { decodeHeaderRaw, resolveEncryptedMeta, transferTag } from '../services/protocol/header';
import { computeLayout } from '../services/file/layout';
import { ReceiverSession } from '../services/file/receiverSession';
import { IdbStore } from '../services/storage/chunkStore';
import { FramePipeline, type FrameReport } from '../services/optical/receiverPipeline';
import { rgbaToGray } from '../services/optical/vision';
import { decodeQrGray } from '../services/qr/qrDecoder';
import { deriveKey } from '../services/crypto/keyDerivation';
import { MovingRate } from '../services/performance/throughput';
import { QualityTracker } from '../services/performance/adaptiveController';
import { parsePacket } from '../services/protocol/packet';
import { PacketType, type Packet } from '../types/packet';
import { testPayload, decodeCalStep, type CalStepMsg } from '../services/optical/calibration';
import { chunkSizeFor } from '../services/optical/frameBuilder';
import type { ReceiverStats } from '../types/performance';

const ctx = self as unknown as { postMessage(m: unknown): void; onmessage: ((e: MessageEvent) => void) | null };
const post = (m: unknown) => ctx.postMessage(m);

type Mode = 'scan' | 'receive' | 'cal';
let mode: Mode = 'scan';
let session: ReceiverSession | null = null;
let pipe: FramePipeline | null = null;
const store = new IdbStore();
const rate = new MovingRate(8000), quality = new QualityTracker();
let startedAt = 0, lastStats = 0, lastUseful = 0, finishing = false, errCount = 0;
let calStep: CalStepMsg | null = null, calPipe: FramePipeline | null = null, calValid = new Set<string>();

function stats(): ReceiverStats {
  const c = pipe!.c, s = session!;
  const remaining = Math.max(0, s.layout.totalChunks - s.useful) * s.layout.chunkSize;
  return {
    framesProcessed: c.framesProcessed, framesDetected: c.framesDetected, framesDuplicate: c.framesDuplicate, framesSeen: c.framesSeen,
    seqSpan: c.seqMax >= 0 ? c.seqMax - c.seqMin + 1 : 0, regionsAttempted: c.regionsAttempted, regionsValid: c.regionsValid,
    regionsBad: c.regionsBad, regionsTorn: c.regionsTorn, shardsNew: s.newShards, shardsDuplicate: s.dupShards,
    shardsRecovered: s.recovered, segmentsDone: s.doneCount, segmentsTotal: s.total, progress: s.progress(),
    bytesUseful: Math.min(s.h.fileSize, s.useful * s.layout.chunkSize), rate: rate.rate(), etaSec: rate.eta(remaining),
    errorRate: c.regionsBad + c.regionsTorn > 0 ? (c.regionsBad + c.regionsTorn) / (c.regionsBad + c.regionsTorn + c.regionsValid) : 0,
    elapsedSec: startedAt ? (performance.now() - startedAt) / 1000 : 0,
  };
}

async function finish() {
  if (finishing || !session) return; finishing = true;
  post({ t: 'state', state: 'VERIFYING' });
  const s = stats();
  post({ t: 'state', state: 'HASH_CHECK' });
  const res = await session.finalize();
  post({ t: 'done', ok: res.ok, hashHex: res.hashHex, reason: res.reason, blob: res.blob, stats: s, size: session.h.fileSize });
}

async function onFrame(rgba: ArrayBuffer, w: number, h: number) {
  const gray = rgbaToGray(new Uint8ClampedArray(rgba), w, h);
  if (mode === 'scan' || mode === 'cal') {
    const q = decodeQrGray(gray, w, h);
    if (q) post({ t: 'qr', text: q.text });
  }
  let rep: FrameReport | null = null;
  if (mode === 'receive' && pipe && session && !finishing) {
    const before = session.useful;
    rep = await pipe.process(gray, w, h);
    if (session.useful !== before) { rate.add((session.useful - before) * session.layout.chunkSize); if (!startedAt) startedAt = performance.now(); }
    if (session.isComplete()) { await finish(); return; }
  } else if (mode === 'cal' && calPipe) {
    rep = await calPipe.process(gray, w, h);
  }
  if (rep) quality.push(rep);
  const now = performance.now();
  if (now - lastStats > 400) {
    lastStats = now;
    if (mode === 'receive' && pipe && session) post({ t: 'stats', stats: stats(), quality: quality.report() });
    else post({ t: 'quality', quality: quality.report(), frames: calPipe?.c.framesSeen ?? 0 });
  }
}

function startCalStep(m: CalStepMsg) {
  const len = chunkSizeFor(m);
  calStep = m; calValid = new Set();
  const handler = async (p: Packet) => {
    if (p.type !== PacketType.TEST || p.payload.length !== len) return 'invalid' as const;
    const exp = testPayload(m.nonce, p.frameSeq, p.regionIdx, len);
    for (let i = 0; i < len; i++) if (exp[i] !== p.payload[i]) return 'invalid' as const;
    calValid.add(`${p.frameSeq}:${p.regionIdx}`);
    return 'new' as const;
  };
  calPipe = new FramePipeline({ mode: m.mode, gx: m.gx, gy: m.gy, R: m.mode === 'qr' ? 21 + 4 * m.qrVersion : m.R, bpc: m.bpc, tag: m.nonce }, handler);
}
function endCalStep() {
  if (!calStep || !calPipe) return;
  const m = calStep, expected = m.nFrames * m.gx * m.gy, valid = calValid.size;
  const perFrame = chunkSizeFor(m) * m.gx * m.gy, secs = (m.nFrames * m.frameMs) / 1000;
  post({ t: 'cal-result', result: {
    step: m.step, label: `${m.mode === 'qr' ? 'QR' : 'Optical'} ${m.gx}×${m.gy}${m.bpc === 2 ? ' gray4' : ''}`, frameMs: m.frameMs, nFrames: m.nFrames,
    regionsExpected: expected, regionsValid: valid, framesSeen: calPipe.c.framesSeen, reliability: Math.min(1, valid / expected),
    throughput: (valid * chunkSizeFor(m)) / secs, payloadPerFrame: perFrame } });
  calStep = null; calPipe = null;
}

ctx.onmessage = async (e: MessageEvent) => {
  const m = e.data;
  try {
    if (m.t === 'mode') { if (m.mode !== 'cal') { endCalStep(); } mode = m.mode; }
    else if (m.t === 'configure') {
      const raw = decodeHeaderRaw(m.headerBytes);
      let h = raw.header, cx;
      if (h.encrypted) {
        const key = await deriveKey(m.password ?? '', h.kdfSalt, h.kdfIterations);
        try { h = await resolveEncryptedMeta(raw, key); } catch { post({ t: 'error', code: 'password', message: 'Wrong password.' }); return; }
        cx = { key, ivPrefix: h.ivPrefix };
      }
      const layout = computeLayout(h.fileSize, h.chunkSize, h.segK, h.segP, h.encrypted);
      session = new ReceiverSession(h, layout, store, cx);
      await session.init(m.headerBytes);
      pipe = new FramePipeline({ mode: h.mode, gx: h.gx, gy: h.gy, R: h.regionCells, bpc: h.bpc, tag: transferTag(h.transferId) }, (p) => session!.accept(p));
      mode = 'receive'; finishing = false; startedAt = 0;
      post({ t: 'configured', resumed: session.progress(), stats: stats(), name: h.fileName, mime: h.mimeType });
    }
    else if (m.t === 'cal-step') { endCalStep(); mode = 'cal'; startCalStep(m.msg); }
    else if (m.t === 'cal-end') endCalStep();
    else if (m.t === 'frame') await onFrame(m.rgba, m.w, m.h);
    else if (m.t === 'cleanup') { if (session) await store.clear(session.id); session = null; pipe = null; }
    else if (m.t === 'cancel') { if (session) await store.clear(session.id); session = null; pipe = null; mode = 'scan'; }
  } catch (err) {
    errCount++; post({ t: 'error', code: 'internal', message: String(err) });
  }
  if (m.t === 'frame') post({ t: 'idle' });
};
void parsePacket; void decodeCalStep; void errCount;
