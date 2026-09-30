export function formatBytes(n: number): string {
  if (!isFinite(n)) return '–';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v >= 100 || i === 0 ? v.toFixed(0) : v.toFixed(2)} ${u[i]}`;
}
export const formatRate = (bps: number) => `${formatBytes(bps)}/s`;
export function formatDuration(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '–';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = (x: number) => String(x).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}
export const formatPct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
export const fmtBytes = formatBytes;
export const fmtSec = formatDuration;
