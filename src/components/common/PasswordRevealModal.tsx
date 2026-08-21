import React, { useState } from 'react';
import { Copy, Check, ShieldAlert, KeyRound } from 'lucide-react';

interface PasswordRevealModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffName: string;
  staffPhone: string;
  generatedPassword: string;
  isReset?: boolean;
}

export const PasswordRevealModal: React.FC<PasswordRevealModalProps> = ({
  isOpen,
  onClose,
  staffName,
  staffPhone,
  generatedPassword,
  isReset = false,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <div id="password-reveal-modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div id="password-reveal-modal-card" className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {isReset ? 'Replacement Password Generated' : 'Staff Account Created'}
              </h2>
              <p className="text-sm text-slate-500">For {staffName} ({staffPhone})</p>
            </div>
          </div>

          <div className="my-5 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              One-Time Temporary Password
            </div>
            <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
              <span className="font-mono text-xl font-bold tracking-widest text-slate-900 select-all">
                {generatedPassword}
              </span>
              <button
                id="copy-generated-password-btn"
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-amber-900 text-xs leading-relaxed mb-6">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold block mb-0.5">Important Security Notice:</strong>
              This password will never be displayed again. Please copy and securely give this temporary password to <strong>{staffName}</strong> directly (e.g. in person or WhatsApp).
            </div>
          </div>

          <button
            id="password-reveal-done-btn"
            type="button"
            onClick={onClose}
            className="w-full py-3 px-4 rounded-xl bg-slate-900 text-white font-medium text-sm hover:bg-slate-800 transition-colors shadow-sm"
          >
            I have saved / shared the password
          </button>
        </div>
      </div>
    </div>
  );
};
