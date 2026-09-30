const enc = new TextEncoder();
const dec = new TextDecoder();

export class ByteWriter {
  private buf: Uint8Array;
  private pos = 0;
  constructor(cap = 256) { this.buf = new Uint8Array(cap); }
  private ensure(n: number) {
    if (this.pos + n > this.buf.length) {
      const nb = new Uint8Array(Math.max(this.buf.length * 2, this.pos + n));
      nb.set(this.buf); this.buf = nb;
    }
  }
  u8(v: number) { this.ensure(1); this.buf[this.pos++] = v & 0xff; return this; }
  u16(v: number) { return this.u8(v >>> 8).u8(v); }
  u32(v: number) { return this.u16(v >>> 16).u16(v & 0xffff); }
  u64(v: number) { return this.u32(Math.floor(v / 4294967296)).u32(v >>> 0); }
  bytes(b: Uint8Array) { this.ensure(b.length); this.buf.set(b, this.pos); this.pos += b.length; return this; }
  str8(s: string, max = 200) {
    let b = enc.encode(s);
    if (b.length > max) b = b.subarray(0, max);
    return this.u8(b.length).bytes(b);
  }
  get length() { return this.pos; }
  finish() { return this.buf.slice(0, this.pos); }
}

export class ByteReader {
  constructor(public readonly buf: Uint8Array, public pos = 0) {}
  get remaining() { return this.buf.length - this.pos; }
  private need(n: number) { if (this.pos + n > this.buf.length) throw new RangeError('buffer underrun'); }
  u8() { this.need(1); return this.buf[this.pos++]; }
  u16() { const a = this.u8(); return (a << 8) | this.u8(); }
  u32() { const a = this.u16(); return ((a << 16) | this.u16()) >>> 0; }
  u64() { const hi = this.u32(); return hi * 4294967296 + this.u32(); }
  bytes(n: number) { this.need(n); const b = this.buf.subarray(this.pos, this.pos + n); this.pos += n; return b; }
  str8() { return dec.decode(this.bytes(this.u8())); }
}

export function concat(parts: Uint8Array[]): Uint8Array {
  let n = 0; for (const p of parts) n += p.length;
  const out = new Uint8Array(n); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
export const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
export function fromHex(s: string) {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
}
export function toB64Url(b: Uint8Array) {
  let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function fromB64Url(t: string) {
  const s = atob(t.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
export function bytesEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
export const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
