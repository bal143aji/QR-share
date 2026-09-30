import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { makeGeometry } from '../services/optical/geometry';
import { composeFrame, encodeRegionGray, frameToRgba, regionCapacityBytes } from '../services/optical/opticalEncoder';
import { PAD } from '../services/optical/geometry';
import { mulberry32 } from '../utils/binary';
import {
  IconSend,
  IconReceive,
  IconShieldCheck,
  IconLock,
  IconZap,
  IconSparkles,
  IconChevronRight,
  IconCpu,
  IconActivity,
  IconOptimize
} from '../components/Icons';

/** A real (random-payload) optical frame, drawn with the same encoder the sender uses. */
function HeroFrame() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const g = makeGeometry(2, 2, 40);
    const rnd = mulberry32(2026);
    const n = regionCapacityBytes(40, 1);
    const regs = [0, 1, 2, 3].map((r) =>
      encodeRegionGray(Uint8Array.from({ length: n }, () => (rnd() * 256) | 0), 40, 1, r)
    );
    const f = frameToRgba(composeFrame(g, regs, 0xbea1, 1), g.W, g.H, PAD);
    const c = ref.current!;
    const s = 4;
    c.width = f.w * s;
    c.height = f.h * s;
    const off = document.createElement('canvas');
    off.width = f.w;
    off.height = f.h;
    off.getContext('2d')!.putImageData(new ImageData(f.data as Uint8ClampedArray<ArrayBuffer>, f.w, f.h), 0, 0);
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, c.width, c.height);
  }, []);

  return (
    <div className="relative group">
      {/* Ambient background glow */}
      <div className="absolute -inset-1.5 bg-gradient-to-r from-blue-300 via-sky-200 to-indigo-300 rounded-3xl blur-xl opacity-60 group-hover:opacity-80 transition duration-500" />
      
      <div className="relative p-5 rounded-2xl bg-white border border-slate-200 shadow-xl flex flex-col items-center">
        <div className="w-full flex items-center justify-between text-xs text-slate-500 mb-3 px-1">
          <span className="flex items-center gap-1.5 font-mono text-blue-600 font-bold">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            2×2 OPTICAL MATRIX
          </span>
          <span className="font-mono text-slate-500 font-medium">40×40 Cells/Region</span>
        </div>

        <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl shadow-inner">
          <canvas
            ref={ref}
            className="optical-canvas block"
            style={{ width: 'min(100%, 280px)', height: 'auto' }}
            role="img"
            aria-label="Example optical frame: four corner markers around a 2 by 2 grid of data regions"
          />
        </div>

        <div className="w-full mt-4 grid grid-cols-2 gap-2 text-center text-xs">
          <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Encoding</div>
            <div className="text-slate-800 font-mono font-bold mt-0.5">Reed-Solomon FEC</div>
          </div>
          <div className="p-2 rounded-lg bg-emerald-50/60 border border-emerald-200">
            <div className="text-emerald-700 text-[10px] uppercase font-bold tracking-wider">Integrity</div>
            <div className="text-emerald-700 font-mono font-bold mt-0.5">SHA-256 Digest</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="space-y-12 pt-2">
      
      {/* Hero Section */}
      <section className="grid gap-8 lg:grid-cols-[1.15fr_auto] items-center">
        <div className="space-y-6">
          
          {/* Tagline Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-xs font-bold text-blue-700 shadow-xs">
            <IconSparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>Multi-Transport Offline File Transfer Platform</span>
          </div>

          {/* Main Headline */}
          <div className="space-y-3">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1] text-slate-900">
              High-Speed <br className="hidden sm:inline" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-700 via-blue-600 to-sky-600">
                File Transfer.
              </span>
            </h1>
            <p className="text-sm sm:text-base text-slate-600 max-w-xl leading-relaxed font-normal">
              QRBeam is a multi-transport file transfer system that supports high-speed Wi-Fi and Bluetooth transfer, live wireless-free optical screen-to-camera transfer, and QR Image Relay for store-and-forward sharing through messaging or other applications. All transfer modes use a common binary-safe protocol with chunk verification, recovery, and SHA-256 integrity validation to reconstruct the original file without re-encoding or quality loss.
            </p>
          </div>

          {/* Primary Action Buttons */}
          <div className="grid sm:grid-cols-2 gap-4 max-w-lg">
            <Link
              to="/send"
              className="btn btn-primary btn-lg flex items-center justify-between group shadow-md shadow-blue-500/20"
            >
              <span className="flex items-center gap-2.5 font-bold">
                <IconSend className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
                SEND FILE
              </span>
              <IconChevronRight className="w-5 h-5 text-blue-200 transition-transform group-hover:translate-x-1" />
            </Link>

            <Link
              to="/receive"
              className="btn btn-lg bg-white border border-slate-300 hover:border-blue-500 hover:text-blue-700 hover:bg-blue-50/40 text-slate-800 flex items-center justify-between group shadow-xs"
            >
              <span className="flex items-center gap-2.5 font-bold">
                <IconReceive className="w-5 h-5 text-blue-600 transition-transform group-hover:translate-y-0.5" />
                RECEIVE FILE
              </span>
              <IconChevronRight className="w-5 h-5 text-slate-400 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          {/* Quick Security Pill Badges */}
          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            <span className="badge badge-indigo">
              <IconShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              Files Stay on Your Devices
            </span>
            <span className="badge badge-cyan">
              <IconLock className="w-3.5 h-3.5 text-sky-600" />
              AES-256-GCM Ready
            </span>
            <span className="badge badge-emerald">
              <IconZap className="w-3.5 h-3.5 text-emerald-600" />
              SHA-256 Byte Verification
            </span>
          </div>
        </div>

        {/* Live Hero Canvas Frame */}
        <div className="flex justify-center lg:justify-end">
          <HeroFrame />
        </div>
      </section>

      {/* Transfer Methods Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <span>Transfer Methods</span>
          </h2>
          <span className="text-xs text-slate-500">Available across all devices</span>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          <Link
            to="/send?mode=wifi"
            className="p-4 rounded-xl border border-amber-200 bg-white hover:border-amber-400 hover:shadow-md transition-all flex flex-col justify-between group no-underline"
          >
            <div>
              <div className="text-amber-700 font-bold text-sm flex items-center gap-1.5 mb-1.5">
                <span>⚡ Wi-Fi Fast</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed m-0">
                Fast local device-to-device transfer. No Internet or backend storage required.
              </p>
            </div>
            <div className="text-[11px] font-mono text-amber-600 font-semibold pt-3 group-hover:text-amber-700">
              High Throughput →
            </div>
          </Link>

          <Link
            to="/send?mode=bluetooth"
            className="p-4 rounded-xl border border-blue-200 bg-white hover:border-blue-400 hover:shadow-md transition-all flex flex-col justify-between group no-underline"
          >
            <div>
              <div className="text-blue-700 font-bold text-sm flex items-center gap-1.5 mb-1.5">
                <span>🟦 Bluetooth</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed m-0">
                Direct peripheral transfer where genuinely supported by browser platform.
              </p>
            </div>
            <div className="text-[11px] font-mono text-blue-600 font-semibold pt-3 group-hover:text-blue-700">
              Native Link →
            </div>
          </Link>

          <Link
            to="/send?mode=optical"
            className="p-4 rounded-xl border border-rose-200 bg-white hover:border-rose-400 hover:shadow-md transition-all flex flex-col justify-between group no-underline"
          >
            <div>
              <div className="text-rose-700 font-bold text-sm flex items-center gap-1.5 mb-1.5">
                <span>🔴 Live Optical</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed m-0">
                Screen to Camera. No Wi-Fi, No Bluetooth, zero RF packets. Pure air-gap.
              </p>
            </div>
            <div className="text-[11px] font-mono text-rose-600 font-semibold pt-3 group-hover:text-rose-700">
              Zero Radios →
            </div>
          </Link>

          <Link
            to="/relay"
            className="p-4 rounded-xl border border-purple-200 bg-white hover:border-purple-400 hover:shadow-md transition-all flex flex-col justify-between group no-underline"
          >
            <div>
              <div className="text-purple-700 font-bold text-sm flex items-center gap-1.5 mb-1.5">
                <span>🖼 QR Image Relay</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed m-0">
                Download QR sequence or ZIP package and share anywhere via apps or USB.
              </p>
            </div>
            <div className="text-[11px] font-mono text-purple-600 font-semibold pt-3 group-hover:text-purple-700">
              Store & Forward →
            </div>
          </Link>

          <Link
            to="/send?mode=automatic"
            className="p-4 rounded-xl border border-sky-200 bg-white hover:border-sky-400 hover:shadow-md transition-all flex flex-col justify-between group no-underline"
          >
            <div>
              <div className="text-sky-700 font-bold text-sm flex items-center gap-1.5 mb-1.5">
                <span>⚙ Automatic</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed m-0">
                Intelligently detects and chooses the fastest available method automatically.
              </p>
            </div>
            <div className="text-[11px] font-mono text-sky-600 font-semibold pt-3 group-hover:text-sky-700">
              Auto Select →
            </div>
          </Link>
        </div>
      </section>

      {/* Feature Pillars Grid */}
      <section className="grid sm:grid-cols-3 gap-4">
        <div className="panel panel-highlight p-6 space-y-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-600">
            <IconShieldCheck className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Air-Gapped & Offline</h2>
          <p className="text-sm text-slate-600 leading-relaxed m-0">
            Eliminates all radio transmission vectors (RF, Wi-Fi, BLE). Perfect for secure environments and cross-device transfers without internet.
          </p>
        </div>

        <div className="panel panel-highlight p-6 space-y-3">
          <div className="w-10 h-10 rounded-xl bg-sky-100 border border-sky-200 flex items-center justify-center text-sky-600">
            <IconCpu className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Fountain FEC Resilience</h2>
          <p className="text-sm text-slate-600 leading-relaxed m-0">
            Automatic packet recovery handles dropped camera frames, reflections, motion blur, and out-of-order frames gracefully.
          </p>
        </div>

        <div className="panel panel-highlight p-6 space-y-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <IconActivity className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">SHA-256 Cryptographic Lock</h2>
          <p className="text-sm text-slate-600 leading-relaxed m-0">
            Every file is strictly verified byte-for-byte upon reassembly. Corrupted or altered transfers are safely discarded.
          </p>
        </div>
      </section>

      {/* Realistic Expectations & Optimization Banner */}
      <section className="panel note p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 bg-amber-50/80 border border-amber-200">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-amber-800 font-bold text-base">
            <IconOptimize className="w-5 h-5 text-amber-700" />
            Performance & Expectations
          </div>
          <p className="text-sm text-slate-700 max-w-2xl leading-relaxed m-0">
            Camera-to-screen optical links operate at real-world speeds between tens to hundreds of KB/s depending on display refresh rate and camera resolution. Run <strong>Optimize</strong> to benchmark and dial in the highest reliable speed for your specific device pair.
          </p>
        </div>
        <Link to="/optimize" className="btn btn-sm shrink-0 bg-amber-100 border border-amber-300 text-amber-900 hover:bg-amber-200 font-bold">
          Run Optimizer
        </Link>
      </section>

      {/* How It Works 3-Step Section */}
      <section className="panel p-8 space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-slate-900">How Optical Transfer Works</h2>
          <p className="text-sm text-slate-500">Three clean steps to air-gapped data transfer</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 relative">
          <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="text-xs font-mono font-bold text-blue-700 bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-md inline-block">
              01 · SELECT & HASH
            </div>
            <h3 className="text-base font-bold text-slate-900">Chunking & Cryptography</h3>
            <p className="text-xs text-slate-600 leading-relaxed m-0">
              Your file is sliced into segments, parity shards are calculated with Reed-Solomon coding, and the SHA-256 digest is prepared.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="text-xs font-mono font-bold text-indigo-700 bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-md inline-block">
              02 · OPTICAL BEAM
            </div>
            <h3 className="text-base font-bold text-slate-900">Multi-Region Display</h3>
            <p className="text-xs text-slate-600 leading-relaxed m-0">
              The sender displays rapid 2D high-density optical matrices surrounded by corner tracking markers.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="text-xs font-mono font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-md inline-block">
              03 · DECODE & VERIFY
            </div>
            <h3 className="text-base font-bold text-slate-900">Asynchronous Reassembly</h3>
            <p className="text-xs text-slate-600 leading-relaxed m-0">
              The receiver's camera captures frames, reconstructs missing data via FEC, verifies the SHA-256 checksum, and provides the file.
            </p>
          </div>
        </div>
      </section>

    </div>
  );
}
