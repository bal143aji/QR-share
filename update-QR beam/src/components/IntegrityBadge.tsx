import { IconShieldCheck, IconAlertTriangle, IconActivity } from './Icons';

export default function IntegrityBadge({ status }: { status: 'pending' | 'verified' | 'failed' }) {
  if (status === 'verified') {
    return (
      <span
        role="status"
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-50 border border-emerald-300 text-emerald-800 shadow-2xs"
      >
        <IconShieldCheck className="w-4 h-4 text-emerald-600" />
        SHA-256 Verified
      </span>
    );
  }

  if (status === 'failed') {
    return (
      <span
        role="status"
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-50 border border-rose-300 text-rose-800 shadow-2xs"
      >
        <IconAlertTriangle className="w-4 h-4 text-rose-600" />
        SHA-256 Mismatch
      </span>
    );
  }

  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-100 border border-slate-200 text-slate-700"
    >
      <IconActivity className="w-4 h-4 text-slate-500 animate-spin" />
      Integrity Pending
    </span>
  );
}
