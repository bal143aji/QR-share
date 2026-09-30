import { formatDuration, formatRate } from '../utils/format';
import { IconZap, IconActivity } from './Icons';

export default function SpeedMeter({ rate, etaSec }: { rate: number; etaSec: number }) {
  const isTransmitting = rate > 0;

  return (
    <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
      <div className="flex flex-col">
        <div className="label flex items-center gap-1.5 text-xs text-slate-600">
          <IconZap className="w-3.5 h-3.5 text-amber-500" />
          Measured Speed
        </div>
        <div className="stat-n text-xl text-blue-700 font-bold">
          {isTransmitting ? formatRate(rate) : '–'}
        </div>
      </div>

      <div className="flex flex-col">
        <div className="label flex items-center gap-1.5 text-xs text-slate-600">
          <IconActivity className="w-3.5 h-3.5 text-blue-600" />
          Estimated Remaining
        </div>
        <div className="stat-n text-xl text-slate-900 font-bold">
          {isFinite(etaSec) && isTransmitting ? formatDuration(etaSec) : '–'}
        </div>
      </div>
    </div>
  );
}
