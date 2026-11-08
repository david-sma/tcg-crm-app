import React, { useState } from 'react';
import { Bell, Send, X } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { apiFetch } from '../../lib/api.ts';
import { isIOSDevice, isSupportedPhone, isDismissed, dismiss } from '../../lib/pwa.ts';

const ENABLE_BANNER_DISMISS_KEY = 'portal_push_prompt_dismissed';
const TEST_BANNER_DISMISS_KEY = 'portal_push_test_dismissed';

export const PushNotificationPrompt: React.FC = () => {
  const { pushStatus, enablePush } = useNotifications();
  const { user } = useAuth();
  const isManager = user?.role === 'manager';

  const [enabling, setEnabling] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ sent: number; failed: number } | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [enableBannerDismissed, setEnableBannerDismissed] = useState(() => isDismissed(ENABLE_BANNER_DISMISS_KEY));
  const [testBannerDismissed, setTestBannerDismissed] = useState(() => isDismissed(TEST_BANNER_DISMISS_KEY));

  const handleEnable = async () => {
    setEnabling(true);
    try {
      await enablePush();
    } finally {
      setEnabling(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestError(null);
    setTestResult(null);
    try {
      const res = await apiFetch<{ sent: number; failed: number }>('/api/notifications/test', {
        method: 'POST',
      });
      setTestResult(res);
    } catch {
      setTestError('Failed to send test notification.');
    } finally {
      setTesting(false);
    }
  };

  const handleDismissEnableBanner = () => {
    dismiss(ENABLE_BANNER_DISMISS_KEY);
    setEnableBannerDismissed(true);
  };

  const handleDismissTestBanner = () => {
    dismiss(TEST_BANNER_DISMISS_KEY);
    setTestBannerDismissed(true);
  };

  // On desktop, install is InstallPwaPrompt's job — the push prompt stays out of the way.
  const showEnablePrompt =
    !enableBannerDismissed &&
    ((pushStatus === 'off' || pushStatus === 'denied') ||
      (pushStatus === 'needs-install' && isSupportedPhone()));
  const showTestPrompt = !testBannerDismissed && isManager && (pushStatus === 'off' || pushStatus === 'on');

  if (pushStatus === null || pushStatus === 'unsupported' || (!showEnablePrompt && !showTestPrompt)) {
    return null;
  }

  const testSummary = (() => {
    if (testError) return testError;
    if (!testResult) return null;
    const devices = testResult.sent + testResult.failed;
    if (devices === 0) return '0 devices — nothing subscribed on this account yet.';
    return `Sent to ${testResult.sent} device${testResult.sent === 1 ? '' : 's'}${
      testResult.failed > 0 ? `, ${testResult.failed} failed` : ''
    }.`;
  })();

  return (
    <div className="mb-4 space-y-2">
      {/* Enable / status prompt (all roles, rendered once in the app layout) */}
      {showEnablePrompt && (
        <aside
          id="push-notification-banner"
          aria-label="Push notification prompt"
          className="p-3.5 sm:p-4 bg-blue-50 border border-blue-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-blue-900"
        >
          <div className="flex items-start sm:items-center gap-2.5">
            <Bell className="w-5 h-5 text-blue-600 shrink-0" />
            {pushStatus === 'needs-install' && (
              <div>
                <strong className="font-semibold block">Get alerts on your phone</strong>
                {isIOSDevice()
                  ? 'Add this app to your Home Screen (Share \u2192 Add to Home Screen) to get alerts when rosters are published.'
                  : 'Install the app from Chrome (Menu \u2192 Install app) to get alerts when rosters are published.'}
              </div>
            )}
            {pushStatus === 'denied' && (
              <div>
                <strong className="font-semibold block">Notifications are blocked</strong>
                Re-allow notifications for this app in your phone settings (Android: Chrome \u2192 Site
                settings \u2192 Notifications; iPhone: Settings \u2192 Notifications), then reopen the app.
              </div>
            )}
            {pushStatus === 'off' && (
              <div>
                <strong className="font-semibold block">Enable push notifications</strong>
                Get an instant pop-up when your roster is published or revised.
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              id="push-notification-banner-dismiss"
              type="button"
              onClick={handleDismissEnableBanner}
              className="p-1.5 rounded-lg text-blue-400 hover:text-blue-700 hover:bg-blue-100 transition-colors"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>

            {pushStatus === 'off' && (
              <button
                id="enable-web-notifications-btn"
                type="button"
                onClick={handleEnable}
                disabled={enabling}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shrink-0 transition-colors shadow-xs disabled:opacity-60 cursor-pointer"
              >
                {enabling ? 'Enabling…' : 'Enable'}
              </button>
            )}
          </div>
        </aside>
      )}

      {/* Manager-only: send a test push to the caller's own devices */}
      {showTestPrompt && (
        <aside
          id="push-test-banner"
          aria-label="Test push notification"
          className="p-3.5 sm:p-4 bg-white border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-700"
        >
          <div className="flex items-start sm:items-center gap-2.5">
            <Send className="w-4 h-4 text-slate-500 shrink-0" />
            <div>
              <strong className="font-semibold block">Send test notification</strong>
              {testSummary || 'Push a test alert to the devices signed in to your account.'}
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              id="push-test-banner-dismiss"
              type="button"
              onClick={handleDismissTestBanner}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              id="send-test-notification-btn"
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl shrink-0 transition-colors shadow-xs disabled:opacity-60 cursor-pointer"
            >
              {testing ? 'Sending…' : 'Send test'}
            </button>
          </div>
        </aside>
      )}
    </div>
  );
};
