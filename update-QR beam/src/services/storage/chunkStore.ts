import { openDb, req, txDone, prefixRange } from './indexedDb';
import type { TransferStore } from './transferStore';

/** IndexedDB-backed store. Segments are saved as Blobs so the final file can be assembled without loading it all into RAM. */
export class IdbStore implements TransferStore {
  private db?: IDBDatabase;
  private async d() { return (this.db ??= await openDb()); }
  async saveMeta(id: string, headerBytes: Uint8Array) {
    const db = await this.d(), tx = db.transaction('transfers', 'readwrite');
    tx.objectStore('transfers').put({ id, headerBytes, updatedAt: Date.now() });
    await txDone(tx);
  }
  async loadState(id: string) {
    const db = await this.d(), tx = db.transaction(['segments', 'shards'], 'readonly');
    const sk = await req(tx.objectStore('segments').getAllKeys(prefixRange(id + ':')));
    const hk = await req(tx.objectStore('shards').getAllKeys(prefixRange(id + ':')));
    const segOf = (k: IDBValidKey) => +String(k).split(':')[1];
    return { doneSegments: sk.map(segOf), shardSegments: [...new Set(hk.map(segOf))] };
  }
  async putShards(id: string, items: { seg: number; shard: number; data: Uint8Array }[]) {
    const db = await this.d(), tx = db.transaction('shards', 'readwrite'), s = tx.objectStore('shards');
    for (const i of items) s.put(i.data, `${id}:${i.seg}:${i.shard}`);
    await txDone(tx);
  }
  async getShards(id: string, seg: number) {
    const db = await this.d(), pre = `${id}:${seg}:`, s = db.transaction('shards').objectStore('shards');
    const [keys, vals] = await Promise.all([req(s.getAllKeys(prefixRange(pre))), req(s.getAll(prefixRange(pre)))]);
    const m = new Map<number, Uint8Array>();
    keys.forEach((k, i) => m.set(+String(k).slice(pre.length), vals[i]));
    return m;
  }
  async deleteShards(id: string, seg: number) {
    const db = await this.d(), tx = db.transaction('shards', 'readwrite');
    tx.objectStore('shards').delete(prefixRange(`${id}:${seg}:`));
    await txDone(tx);
  }
  async putSegment(id: string, seg: number, plain: Uint8Array) {
    const db = await this.d(), tx = db.transaction('segments', 'readwrite');
    tx.objectStore('segments').put(new Blob([plain as BlobPart]), `${id}:${seg}`);
    await txDone(tx);
  }
  async getSegmentBlob(id: string, seg: number) {
    const db = await this.d();
    return req(db.transaction('segments').objectStore('segments').get(`${id}:${seg}`)) as Promise<Blob>;
  }
  /** Explicit cleanup after download or cancel. */
  async clear(id: string) {
    const db = await this.d(), tx = db.transaction(['transfers', 'shards', 'segments'], 'readwrite');
    tx.objectStore('transfers').delete(id);
    tx.objectStore('shards').delete(prefixRange(id + ':'));
    tx.objectStore('segments').delete(prefixRange(id + ':'));
    await txDone(tx);
  }
}
export async function listTransfers(): Promise<{ id: string; headerBytes: Uint8Array }[]> {
  const db = await openDb();
  return req(db.transaction('transfers').objectStore('transfers').getAll());
}
