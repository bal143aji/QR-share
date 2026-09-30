/**
 * Systematic Reed-Solomon erasure code over GF(256) using a Cauchy matrix.
 * Any k of the (k+p) shards reconstruct the k data shards (MDS). Requires k+p <= 255.
 */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
const inv = (a: number) => EXP[255 - LOG[a]];
const tables: (Uint8Array | undefined)[] = new Array(256);
function mulTable(c: number): Uint8Array {
  let t = tables[c];
  if (!t) { t = new Uint8Array(256); for (let x = 0; x < 256; x++) t[x] = mul(c, x); tables[c] = t; }
  return t;
}
const cauchy = (i: number, j: number, k: number) => inv((k + i) ^ j);

export function rsEncode(data: Uint8Array[], p: number): Uint8Array[] {
  const k = data.length;
  if (k + p > 255) throw new Error('k+p must be <= 255');
  const L = data[0].length;
  const out: Uint8Array[] = [];
  for (let i = 0; i < p; i++) {
    const o = new Uint8Array(L);
    for (let j = 0; j < k; j++) {
      const t = mulTable(cauchy(i, j, k)); const d = data[j];
      for (let b = 0; b < L; b++) o[b] ^= t[d[b]];
    }
    out.push(o);
  }
  return out;
}

/** shards has length k+p, missing entries are null/undefined. Returns k data shards or null if not enough. */
export function rsDecode(shards: (Uint8Array | null | undefined)[], k: number, p: number): Uint8Array[] | null {
  const missing: number[] = [];
  for (let j = 0; j < k; j++) if (!shards[j]) missing.push(j);
  if (missing.length === 0) return shards.slice(0, k) as Uint8Array[];
  const parityAvail: number[] = [];
  for (let i = 0; i < p; i++) if (shards[k + i]) parityAvail.push(i);
  const e = missing.length;
  if (parityAvail.length < e) return null;
  const rows = parityAvail.slice(0, e);
  const L = (shards[k + rows[0]] as Uint8Array).length;
  const rhs = rows.map((i) => {
    const v = (shards[k + i] as Uint8Array).slice();
    for (let j = 0; j < k; j++) {
      const d = shards[j]; if (!d) continue;
      const t = mulTable(cauchy(i, j, k));
      for (let b = 0; b < L; b++) v[b] ^= t[d[b]];
    }
    return v;
  });
  const A = rows.map((i) => missing.map((j) => cauchy(i, j, k)));
  for (let c = 0; c < e; c++) {
    let piv = c;
    while (piv < e && A[piv][c] === 0) piv++;
    if (piv === e) return null;
    if (piv !== c) { [A[piv], A[c]] = [A[c], A[piv]]; [rhs[piv], rhs[c]] = [rhs[c], rhs[piv]]; }
    const iv = inv(A[c][c]);
    for (let x = 0; x < e; x++) A[c][x] = mul(A[c][x], iv);
    const ti = mulTable(iv);
    for (let b = 0; b < L; b++) rhs[c][b] = ti[rhs[c][b]];
    for (let r = 0; r < e; r++) {
      if (r === c) continue;
      const f = A[r][c]; if (!f) continue;
      for (let x = 0; x < e; x++) A[r][x] ^= mul(f, A[c][x]);
      const tf = mulTable(f);
      for (let b = 0; b < L; b++) rhs[r][b] ^= tf[rhs[c][b]];
    }
  }
  const out: Uint8Array[] = [];
  let mi = 0;
  for (let j = 0; j < k; j++) out.push(shards[j] ? (shards[j] as Uint8Array) : rhs[mi++]);
  return out;
}
