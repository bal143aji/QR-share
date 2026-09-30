import type { ReactElement } from 'react';
import HomePage from '../pages/HomePage';
import SendPage from '../pages/SendPage';
import ReceivePage from '../pages/ReceivePage';
import CalibrationPage from '../pages/CalibrationPage';
import BenchmarkPage from '../pages/BenchmarkPage';
import DemoPage from '../pages/DemoPage';
import QRRelayPage from '../pages/QRRelayPage';

export const routes: { path: string; label: string; el: ReactElement; nav: boolean }[] = [
  { path: '/', label: 'Home', el: <HomePage />, nav: false },
  { path: '/send', label: 'Send', el: <SendPage />, nav: true },
  { path: '/receive', label: 'Receive', el: <ReceivePage />, nav: true },
  { path: '/relay', label: 'QR Relay', el: <QRRelayPage />, nav: true },
  { path: '/optimize', label: 'Optimize', el: <CalibrationPage />, nav: true },
  { path: '/benchmark', label: 'Benchmark', el: <BenchmarkPage />, nav: true },
  { path: '/demo', label: 'Demo', el: <DemoPage />, nav: true },
];

