/**
 * Transport layer type definitions for QRBeam multi-transport architecture.
 * These types are ADDITIVE — they do not replace existing transfer types.
 */

export type TransferMode =
  | 'wifi'
  | 'bluetooth'
  | 'optical'
  | 'qr-relay'
  | 'automatic';

export interface TransportCapabilities {
  wifi: boolean;
  bluetooth: boolean;
  optical: boolean;
  qrRelay: boolean;
}

export type TransportStatus =
  | 'available'
  | 'unavailable'
  | 'connecting'
  | 'connected'
  | 'transferring'
  | 'completed'
  | 'error';

/** Abstract transport interface — all transports implement this. */
export interface TransferTransport {
  initialize(): Promise<void>;
  send(packet: Uint8Array): Promise<void>;
  receive(): Promise<Uint8Array>;
  close(): Promise<void>;
  getCapabilities(): TransportCapabilities;
}

/** Wi-Fi transfer status info */
export interface WifiTransferInfo {
  localIp?: string;
  peerIp?: string;
  connected: boolean;
  port?: number;
}

/** Bluetooth transfer status info */
export interface BluetoothTransferInfo {
  deviceName?: string;
  connected: boolean;
  supported: boolean;
  reason?: string; // why unsupported if unsupported
}

/** QR Relay packet stats */
export interface QrRelayStats {
  totalFrames: number;
  selectedImages: number;
  decodedSuccessfully: number;
  invalid: number;
  duplicates: number;
  missing: number;
  progress: number; // 0..1
}

/** QR Image Relay frame record */
export interface QrRelayFrame {
  frameSequence: number;
  chunkIndex: number;
  blockIndex: number;
  payload: Uint8Array;
  checksum: number;
}

/** QR Relay manifest (stored with package) */
export interface QrRelayManifest {
  magic: 'QRBEAM_RELAY';
  protocolVersion: number;
  transferId: string; // hex
  fileName: string;
  fileSize: number;
  mimeType: string;
  totalFrames: number;
  fileHash: string; // sha-256 hex
  encrypted: boolean;
  createdAt: number; // unix ms
  headerB64: string; // base64url-encoded header bytes for receiver
}

/** Transport dashboard display info (common to all modes) */
export interface TransportDashboard {
  transport: TransferMode;
  transportLabel: string;
  file?: string;
  progress: number;
  transferred: number;
  total: number;
  speed?: number;
  etaSec?: number;
  packets?: number;
  validPackets?: number;
  duplicates?: number;
  recovered?: number;
  errorRate?: number;
  integrityVerified?: boolean;
  status: TransportStatus;
}
