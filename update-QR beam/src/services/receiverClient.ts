import type { QualityReport, ReceiverStats, CalStepResult } from '../types/performance';
import type { CalStepMsg } from './optical/calibration';

export interface DoneMsg { ok: boolean; hashHex: string; reason?: string; blob?: Blob; stats: ReceiverStats; size: number }
export interface ReceiverEvents {
  onQr?(text: string): void; onStats?(s: ReceiverStats, q: QualityReport): void; onQuality?(q: QualityReport, frames: number): void;
  onConfigured?(resumed: number, s: ReceiverStats, name: string, mime: string): void; onState?(state: string): void; onDone?(d: DoneMsg): void;
  onError?(code: string, message: string): void; onCalResult?(r: CalStepResult): void;
}
/** Main-thread handle for the decode worker. Frames are dropped while the worker is busy (adaptive camera sampling). */
export class ReceiverClient {
  private w = new Worker(new URL('../workers/decodeWorker.ts', import.meta.url), { type: 'module' });
  busy = false;
  constructor(private ev: ReceiverEvents) {
    this.w.onmessage = (e) => {
      const m = e.data;
      switch (m.t) {
        case 'idle': this.busy = false; break;
        case 'qr': ev.onQr?.(m.text); break;
        case 'stats': ev.onStats?.(m.stats, m.quality); break;
        case 'quality': ev.onQuality?.(m.quality, m.frames); break;
        case 'configured': ev.onConfigured?.(m.resumed, m.stats, m.name, m.mime); break;
        case 'state': ev.onState?.(m.state); break;
        case 'done': ev.onDone?.(m); break;
        case 'cal-result': ev.onCalResult?.(m.result); break;
        case 'error': this.busy = false; ev.onError?.(m.code, m.message); break;
      }
    };
    this.w.onerror = (e) => ev.onError?.('worker', e.message);
  }
  setMode(mode: 'scan' | 'receive' | 'cal') { this.w.postMessage({ t: 'mode', mode }); }
  configure(headerBytes: Uint8Array, password?: string) { this.w.postMessage({ t: 'configure', headerBytes, password }); }
  calStep(msg: CalStepMsg) { this.w.postMessage({ t: 'cal-step', msg }); }
  calEnd() { this.w.postMessage({ t: 'cal-end' }); }
  sendFrame(img: ImageData): boolean {
    if (this.busy) return false;
    this.busy = true;
    this.w.postMessage({ t: 'frame', rgba: img.data.buffer, w: img.width, h: img.height }, [img.data.buffer]);
    return true;
  }
  cleanup() { this.w.postMessage({ t: 'cleanup' }); }
  cancel() { this.w.postMessage({ t: 'cancel' }); }
  dispose() { this.w.terminate(); }
}
