import React, { useState, useEffect } from 'react';
import { Download, X, Share, PlusSquare, Check } from 'lucide-react';
import { CompanyLogo } from './CompanyLogo.tsx';
import { useBrand } from '../../context/BrandContext.tsx';

export const InstallPwaPrompt: React.FC = () => {
  const { shortName, appTitle } = useBrand();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    // Check if already installed / standalone mode
    const isStandaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(isStandaloneMode);

    if (isStandaloneMode) {
      return;
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Check if user dismissed prompt recently (last 3 days)
    const dismissedAt = localStorage.getItem('portal_pwa_install_dismissed');
    if (dismissedAt) {
      const daysSince = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60 * 24);
      if (daysSince < 3) {
        return;
      }
    }

    // Native Chrome / Android beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // If on iOS and not standalone, show the prompt after a slight delay
    if (isIosDevice && !isStandaloneMode) {
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 1500);
      return () => clearTimeout(timer);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSGuide(true);
      return;
    }

    if (!deferredPrompt) {
      // Fallback instruction for other browsers
      setShowIOSGuide(true);
      return;
    }

    deferredPrompt.prompt();
    const choiceResult = await deferredPrompt.userChoice;
    if (choiceResult.outcome === 'accepted') {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setShowIOSGuide(false);
    localStorage.setItem('portal_pwa_install_dismissed', Date.now().toString());
  };

  if (isStandalone || !showPrompt) {
    return null;
  }

  return (
    <>
      {/* Non-intrusive Install Banner at top of dashboard */}
      <aside
        id="pwa-install-banner"
        aria-label="Install app banner"
        className="mb-4 p-3.5 sm:p-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl shadow-lg border border-slate-700/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-300"
      >
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-xl bg-slate-800 border border-slate-700 shrink-0">
            <CompanyLogo size={28} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white tracking-tight">
                Add {shortName} to your Phone
              </span>
              <span className="text-[10px] font-bold text-[var(--color-brand-accent)] bg-[var(--color-brand-accent)]/15 px-1.5 py-0.2 rounded border border-[var(--color-brand-accent)]/30">
                Web App
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5">
              Install directly from your browser for 1-tap home screen access.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-xs"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>

          <button
            id="pwa-install-action-btn"
            type="button"
            onClick={handleInstallClick}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[var(--color-brand)] to-[var(--color-brand-secondary)] hover:from-[var(--color-brand-hover)] hover:to-[var(--color-brand-secondary-hover)] text-white text-xs font-bold transition-all shadow-md shadow-[var(--color-brand)]/25 flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Install App</span>
          </button>
        </div>
      </aside>

      {/* iOS / Safari Step-by-step Guide Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-4">
          <div className="bg-white text-slate-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-100 rounded-2xl border border-slate-200">
                  <CompanyLogo size={32} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Install {appTitle}</h3>
                  <p className="text-xs text-slate-500">How to add to your Home Screen</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-5 space-y-3.5 text-xs text-slate-600">
              <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="w-6 h-6 rounded-full bg-[var(--color-brand)] text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  1
                </div>
                <p className="leading-relaxed">
                  Tap the <strong className="text-slate-900 font-semibold inline-flex items-center gap-1">Share button <Share className="w-3.5 h-3.5 text-[var(--color-brand)]" /></strong> in your browser's bottom navigation toolbar.
                </p>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="w-6 h-6 rounded-full bg-[var(--color-brand)] text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  2
                </div>
                <p className="leading-relaxed">
                  Scroll down and tap <strong className="text-slate-900 font-semibold inline-flex items-center gap-1">Add to Home Screen <PlusSquare className="w-3.5 h-3.5 text-[var(--color-brand)]" /></strong>.
                </p>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="w-6 h-6 rounded-full bg-[var(--color-brand-accent)] text-slate-900 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  3
                </div>
                <p className="leading-relaxed">
                  Tap <strong className="text-slate-900 font-semibold">Add</strong> in top right. The {shortName} icon will now appear on your home screen!
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="mt-5 w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
