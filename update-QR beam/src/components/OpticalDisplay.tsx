import { forwardRef } from 'react';

/** Canvas showing the optical frame. Framed with clean high-contrast container. */
const OpticalDisplay = forwardRef<HTMLCanvasElement, { label?: string }>(({ label }, ref) => (
  <div className="p-3 bg-white rounded-2xl shadow-2xl inline-flex items-center justify-center border-4 border-slate-800">
    <canvas
      ref={ref}
      className="optical-canvas block"
      role="img"
      aria-label={label ?? 'Optical data frame being transmitted'}
    />
  </div>
));

export default OpticalDisplay;
