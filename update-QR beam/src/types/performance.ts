export interface ReceiverStats {
  framesProcessed: number;
  framesDetected: number;
  framesDuplicate: number;
  framesSeen: number; // distinct frame sequence numbers observed
  seqSpan: number; // max seq - min seq + 1 (frames the sender displayed while we watched)
  regionsAttempted: number;
  regionsValid: number;
  regionsBad: number;
  regionsTorn: number;
  shardsNew: number;
  shardsDuplicate: number;
  shardsRecovered: number;
  segmentsDone: number;
  segmentsTotal: number;
  progress: number; // 0..1 data-equivalent
  bytesUseful: number;
  rate: number; // bytes/s moving average
  etaSec: number;
  errorRate: number;
  elapsedSec: number;
}
export interface CalStepResult {
  step: number; label: string; frameMs: number; nFrames: number;
  regionsExpected: number; regionsValid: number; framesSeen: number;
  reliability: number; throughput: number; payloadPerFrame: number;
}
export interface QualityReport {
  lighting: 'good' | 'dark' | 'bright' | 'unknown';
  distance: 'good' | 'closer' | 'farther' | 'unknown';
  focus: 'good' | 'poor' | 'unknown';
  detection: number; // 0..1 recent
}
