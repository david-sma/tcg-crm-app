import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { Phone, Lock, LogIn, AlertCircle, MapPin } from 'lucide-react';
import { CompanyLogo } from '../common/CompanyLogo.tsx';
import { useBrand } from '../../context/BrandContext.tsx';

export const LoginForm: React.FC = () => {
  const { login } = useAuth();
  const { companyName, tagline, city, address, phone: phoneConfig } = useBrand();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim() || !password.trim()) {
      setError('Please enter both your phone number and password.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      await login(phone.trim(), password.trim());
    } catch (err: any) {
      setError(err?.message || 'Invalid credentials. Please check phone number or password and retry.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-sky-50/30 to-slate-100 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center">
          <div className="p-3 bg-white rounded-3xl shadow-lg shadow-[var(--color-brand)]/10 border border-slate-200/80 flex items-center justify-center">
            <CompanyLogo size={68} />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-center gap-2">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            {companyName}
          </h2>
        </div>
        <p className="mt-1 text-xs text-slate-600 font-medium">
          {tagline} • {city} Staff Portal
        </p>
      </div>

      <div className="mt-7 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 sm:px-10 rounded-3xl border border-slate-200/90 shadow-xl shadow-slate-200/60 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="phone-input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Phone Number
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="phone-input"
                  type="text"
                  required
                  placeholder={`e.g. ${phoneConfig.example}`}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[var(--color-brand)] transition-all"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">{phoneConfig.help}</p>
            </div>

            <div>
              <label htmlFor="password-input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="password-input"
                  type="password"
                  required
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[var(--color-brand)] transition-all"
                />
              </div>
            </div>

            <button
              id="login-submit-btn"
              type="submit"
              disabled={submitting}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[var(--color-brand)] to-[var(--color-brand-secondary)] hover:from-[var(--color-brand-hover)] hover:to-[var(--color-brand-secondary-hover)] text-white font-bold text-sm transition-all shadow-md shadow-[var(--color-brand)]/25 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>{submitting ? 'Signing In...' : 'Sign In to Portal'}</span>
            </button>
          </form>

          {address && (
            <div className="pt-4 border-t border-slate-100 text-center text-[11px] text-slate-400 flex items-center justify-center gap-1">
              <MapPin className="w-3 h-3 text-[var(--color-brand-accent)]" />
              <span>{address}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
