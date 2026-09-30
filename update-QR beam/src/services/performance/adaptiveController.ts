import type { QualityReport } from '../../types/performance';
import type { FrameReport } from '../optical/receiverPipeline';

/** Rolling receiver-side quality estimate used for on-screen camera guidance. */
export class QualityTracker {
  private det: number[] = [];
  private last: FrameReport | null = null;
  push(r: FrameReport) {
    this.det.push(r.detected ? 1 : 0); if (this.det.length > 30) this.det.shift();
    if (r.detected) this.last = r;
    this.meanLum = r.meanLum;
  }
  meanLum = 0;
  report(): QualityReport {
    const detection = this.det.length ? this.det.reduce((a, b) => a + b, 0) / this.det.length : 0;
    const l = this.last;
    const lighting = this.det.length === 0 ? 'unknown' : this.meanLum < 45 ? 'dark' : this.meanLum > 225 ? 'bright' : 'good';
    let distance: QualityReport['distance'] = 'unknown', focus: QualityReport['focus'] = 'unknown';
    if (l?.pxPerCell !== undefined) {
      distance = l.pxPerCell < 3.6 || (l.edgeMargin ?? 99) < 4 ? (l.edgeMargin ?? 99) < 4 ? 'farther' : 'closer' : 'good';
      if (l.pxPerCell < 3.6 && (l.edgeMargin ?? 99) >= 4) distance = 'closer';
      focus = (l.contrast ?? 255) < 70 ? 'poor' : 'good';
    }
    return { lighting, distance, focus, detection };
  }
}

/** Live guidance derived from measured error rate (one-way link: advice is for the human operator). */
export function guidance(q: QualityReport, errorRate: number, attempted: number): string {
  if (q.detection < 0.2) return 'Keep the whole sender screen visible and steady.';
  if (q.lighting === 'dark') return 'Too dark — raise sender brightness / room light.';
  if (q.lighting === 'bright') return 'Too bright — avoid reflections on the sender screen.';
  if (q.distance === 'closer') return 'Move closer.';
  if (q.distance === 'farther') return 'Move slightly farther away.';
  if (q.focus === 'poor') return 'Focus looks soft — hold still and let the camera refocus.';
  if (attempted > 30 && errorRate > 0.25) return 'Too many frame errors. Reduce transmission speed on the sender.';
  return 'Signal is good.';
}
