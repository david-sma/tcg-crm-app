import React, { useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { PASSWORD_MAX_AGE_DAYS } from '../../config/passwordPolicy.ts';

// 30-day password expiry reminder for ALL roles. Passwords can only be reset
// by a manager (no self-service change, no email/SMS), so the user is told to
// ask. Dismissal is in-memory only: the banner returns on the next app load
// until the password is actually reset.
export function PasswordDueBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !user?.password_due) return null;

  return (
    <div id="password-due-banner" className="bg-amber-50 border-b border-amber-200" role="status">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-amber-600 shrink-0" />
        <p className="text-xs sm:text-sm text-amber-900 flex-1">
          Your password is over {PASSWORD_MAX_AGE_DAYS} days old. Ask your manager to reset it.
        </p>
        <button
          id="password-due-banner-dismiss"
          type="button"
          onClick={() => setDismissed(true)}
          className="p-1 rounded-lg text-amber-700 hover:bg-amber-100 transition-colors"
          aria-label="Dismiss password reminder"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
