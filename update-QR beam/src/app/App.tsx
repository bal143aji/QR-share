import { useState } from 'react';
import { HashRouter, NavLink, Route, Routes, Link } from 'react-router-dom';
import { routes } from './routes';
import {
  IconBeam,
  IconSend,
  IconReceive,
  IconOptimize,
  IconBenchmark,
  IconDemo,
  IconShieldCheck,
  IconLock
} from '../components/Icons';

const navIcons: Record<string, React.ReactNode> = {
  '/send': <IconSend className="w-4 h-4" />,
  '/receive': <IconReceive className="w-4 h-4" />,
  '/optimize': <IconOptimize className="w-4 h-4" />,
  '/benchmark': <IconBenchmark className="w-4 h-4" />,
  '/demo': <IconDemo className="w-4 h-4" />,
};

export default function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <HashRouter>
      <div className="min-h-screen flex flex-col justify-between selection:bg-blue-500/20 selection:text-blue-700 bg-slate-50 text-slate-900">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg focus:shadow-xl font-bold"
        >
          Skip to content
        </a>

        {/* Global Floating Header */}
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/90 border-b border-slate-200/90 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
            
            {/* Logo */}
            <Link
              to="/"
              className="flex items-center gap-3 no-underline group"
              aria-label="QRBeam home"
              onClick={() => setMobileMenuOpen(false)}
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-700 via-blue-600 to-sky-500 p-[1px] shadow-md shadow-blue-500/25 group-hover:shadow-blue-500/40 transition-all duration-300">
                <div className="w-full h-full bg-blue-600 rounded-[11px] flex items-center justify-center text-white transition-colors">
                  <IconBeam className="w-5 h-5 transition-transform group-hover:scale-110" />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-extrabold tracking-tight text-slate-900 flex items-center gap-1.5">
                  QRBeam
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    Air-Gap
                  </span>
                </span>
                <span className="text-[11px] text-slate-500 font-medium -mt-1 hidden sm:block">
                  Optical & Multi-Transport Transfer
                </span>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav aria-label="Main" className="hidden md:flex items-center gap-1 bg-slate-100/90 p-1.5 rounded-xl border border-slate-200">
              {routes
                .filter((r) => r.nav)
                .map((r) => (
                  <NavLink
                    key={r.path}
                    to={r.path}
                    className={({ isActive }) =>
                      `flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 no-underline ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                          : 'text-slate-600 hover:text-blue-600 hover:bg-white'
                      }`
                    }
                  >
                    {navIcons[r.path]}
                    {r.label}
                  </NavLink>
                ))}
            </nav>

            {/* Status Pill & Mobile Menu Button */}
            <div className="flex items-center gap-3">
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                100% Offline Link
              </div>

              {/* Mobile Burger Toggle */}
              <button
                type="button"
                className="md:hidden p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                onClick={() => setMobileMenuOpen((o) => !o)}
                aria-label="Toggle menu"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {mobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>

          {/* Mobile Drawer */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-slate-200 bg-white/95 backdrop-blur-2xl px-4 py-3 space-y-1 shadow-lg">
              {routes
                .filter((r) => r.nav)
                .map((r) => (
                  <NavLink
                    key={r.path}
                    to={r.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all no-underline ${
                        isActive
                          ? 'bg-blue-600 text-white font-bold'
                          : 'text-slate-700 hover:text-blue-600 hover:bg-slate-100'
                      }`
                    }
                  >
                    {navIcons[r.path]}
                    {r.label}
                  </NavLink>
                ))}
            </div>
          )}
        </header>

        {/* Main Content Area */}
        <main id="main" className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 pt-6 pb-20">
          <Routes>
            {routes.map((r) => (
              <Route key={r.path} path={r.path} element={r.el} />
            ))}
          </Routes>
        </main>

        {/* Global Footer */}
        <footer className="border-t border-slate-200 bg-white/90 backdrop-blur-md mt-auto">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
              <div className="flex items-center gap-3 flex-wrap justify-center md:justify-start">
                <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
                  <IconShieldCheck className="w-4 h-4 text-emerald-600" />
                  SHA-256 Verified
                </div>
                <span>•</span>
                <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
                  <IconLock className="w-4 h-4 text-blue-600" />
                  Optional AES-256-GCM
                </div>
                <span>•</span>
                <span className="text-slate-600 font-medium">Zero Cloud Storage</span>
              </div>
              <p className="text-center md:text-right m-0 text-slate-500">
                Direct camera-to-screen optical beam. No Wi-Fi, Bluetooth, or cellular data required.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </HashRouter>
  );
}
