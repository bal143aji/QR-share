/**
 * Relay Recovery Service
 *
 * Persists partial QR relay transfers across sessions so users can import
 * missing frames later without starting over.
 */

import { openDb, req, txDone } from '../storage/indexedDb';
import type { Packet } from '../../types/packet';

export interface SavedRelayTransfer {
  transferId: string;
  fileName: string;
  fileSize: number;
  totalFrames: number;
  expectedHash: string;
  savedAt: number;
}

const RELAY_META_PREFIX = 'relay_meta:';
const RELAY_FRAME_PREFIX = 'relay_frame:';

export async function saveRelayProgress(
  transferId: string,
  metadata: {
    fileName: string;
    fileSize: number;
    totalFrames: number;
    expectedHash: string;
  },
  frames: Packet[]
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(['transfers', 'segments'], 'readwrite');
  const transfersStore = tx.objectStore('transfers');
  const segmentsStore = tx.objectStore('segments');

  // Save metadata
  const metaRecord: SavedRelayTransfer = {
    transferId,
    fileName: metadata.fileName,
    fileSize: metadata.fileSize,
    totalFrames: metadata.totalFrames,
    expectedHash: metadata.expectedHash,
    savedAt: Date.now(),
  };

  transfersStore.put({
    id: RELAY_META_PREFIX + transferId,
    ...metaRecord,
  });

  // Save individual frames
  for (const pkt of frames) {
    const key = `${RELAY_FRAME_PREFIX}${transferId}:${pkt.frameSeq}`;
    segmentsStore.put(pkt, key);
  }

  await txDone(tx);
}

export async function loadRelayProgress(transferId: string): Promise<{
  metadata: SavedRelayTransfer | null;
  frames: Packet[];
}> {
  const db = await openDb();
  const tx = db.transaction(['transfers', 'segments'], 'readonly');
  const transfersStore = tx.objectStore('transfers');
  const segmentsStore = tx.objectStore('segments');

  const metaRaw = await req(transfersStore.get(RELAY_META_PREFIX + transferId));
  if (!metaRaw) {
    return { metadata: null, frames: [] };
  }

  const metadata: SavedRelayTransfer = {
    transferId: metaRaw.transferId,
    fileName: metaRaw.fileName,
    fileSize: metaRaw.fileSize,
    totalFrames: metaRaw.totalFrames,
    expectedHash: metaRaw.expectedHash,
    savedAt: metaRaw.savedAt,
  };

  // Load all frames for this transferId
  const frames: Packet[] = [];
  const startKey = `${RELAY_FRAME_PREFIX}${transferId}:`;
  const endKey = `${RELAY_FRAME_PREFIX}${transferId}:\uffff`;
  const range = IDBKeyRange.bound(startKey, endKey);

  const cursorReq = segmentsStore.openCursor(range);
  await new Promise<void>((resolve, reject) => {
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        frames.push(cursor.value as Packet);
        cursor.continue();
      } else {
        resolve();
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });

  return { metadata, frames };
}

export async function clearRelayProgress(transferId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(['transfers', 'segments'], 'readwrite');
  const transfersStore = tx.objectStore('transfers');
  const segmentsStore = tx.objectStore('segments');

  transfersStore.delete(RELAY_META_PREFIX + transferId);

  const startKey = `${RELAY_FRAME_PREFIX}${transferId}:`;
  const endKey = `${RELAY_FRAME_PREFIX}${transferId}:\uffff`;
  const range = IDBKeyRange.bound(startKey, endKey);

  const cursorReq = segmentsStore.openKeyCursor(range);
  await new Promise<void>((resolve, reject) => {
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        segmentsStore.delete(cursor.key);
        cursor.continue();
      } else {
        resolve();
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });

  await txDone(tx);
}
