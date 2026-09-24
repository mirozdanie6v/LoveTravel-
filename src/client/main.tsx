import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { PremiumApp } from './PremiumApp';
import { UnifiedAdminTourPage } from './UnifiedAdminTourPage';
import { LocaleProvider, useI18n } from './i18n';
import './styles/premium.css';
import './styles/commerce-v6.css';
import './styles/v6.css';
import './styles/production-polish.css';
import './styles/admin-unified-tour.css';

declare global {
  interface Window { Telegram?: { WebApp?: { ready?:()=>void; expand?:()=>void; BackButton?:any; MainButton?:any } } }
}

const isProduction = window.location.hostname === 'max-tour.viiversion.com';

if (isProduction) {
  document.documentElement.classList.add('is-max-tour-production');
}

try {
  window.Telegram?.WebApp?.ready?.();
  window.Telegram?.WebApp?.expand?.();
} catch {}

function DemoRouterRoot() {
  const location = useLocation();
  const isUnifiedTourEditor = /^\/admin\/tours\/[^/]+\/?$/.test(location.pathname);
  return isUnifiedTourEditor ? <UnifiedAdminTourPage /> : <PremiumApp />;
}

function LocalizedRouterRoot() {
  const { locale } = useI18n();
  return <DemoRouterRoot key={locale} />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LocaleProvider enabled={isProduction}>
      <BrowserRouter><LocalizedRouterRoot /></BrowserRouter>
    </LocaleProvider>
  </React.StrictMode>
);
