import React, { useState } from 'react';
import { X, Lock, Mail, User, Phone, LogIn, UserPlus, Sparkles, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { Language, TRANSLATIONS } from '../i18n/translations';
import { api, setAuthToken } from '../api/client';
import { supabase } from '../lib/supabase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (tenantData: any) => void;
  currentTenant?: { name: string; email: string } | null;
  onLogout?: () => void;
  onOpenPrivacyPolicy?: () => void;
  language: Language;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthSuccess,
  currentTenant,
  onLogout,
  onOpenPrivacyPolicy,
  language,
}) => {
  const t = TRANSLATIONS[language];
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (mode === 'register' && !privacyAccepted) {
      setError(t.mustAcceptPrivacyError);
      return;
    }

    setIsLoading(true);

    try {
      if (mode === 'login') {
        // Direct Supabase Login
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });

        if (authError) {
          throw new Error(authError.message);
        }

        const token = authData.session?.access_token || '';
        setAuthToken(token);

        // Fetch fresh tenant data from backend connected to Supabase
        const res = await api.tenant.getMe();
        onAuthSuccess(res.tenant);
        onClose();
      } else {
        // Supabase Registration with explicit GDPR consent
        const res = await api.auth.register({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          phone: phone.trim() || undefined,
          preferred_lang: language,
          privacy_policy_accepted: privacyAccepted,
        });

        if (res.token) {
          setAuthToken(res.token);
          // Set supabase session if returned
          await supabase.auth.setSession({
            access_token: res.token,
            refresh_token: res.token,
          }).catch(() => {});
        }

        onAuthSuccess(res.tenant);
        onClose();
      }
    } catch (err: any) {
      if (err.message?.includes('PHONE_ALREADY_EXISTS') || err.message?.includes('déjà associé') || err.message?.includes('already associated') || err.message?.includes('ya está asociado') || err.message?.includes('unique') || err.message?.includes('idx_profiles_phone_unique')) {
        setError(t.phoneAlreadyExistsError || 'Ce numéro est déjà associé à un autre compte.');
      } else {
        setError(err.message || (language === 'es' ? 'Error al autenticar en Supabase.' : 'Authentication error with Supabase.'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl border border-[#0FA3A3]/20 relative">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
          id="btn-close-auth-modal"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="text-center mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#E6F7F6] text-[#0FA3A3] flex items-center justify-center mx-auto mb-2">
            <Lock className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-[#1C3B3A]">
            {mode === 'login' ? t.login : t.register}
          </h2>
          <p className="text-xs text-[#5C7B79]">
            {mode === 'login' ? t.authLoginSubtitle : t.authRegisterSubtitle}
          </p>
        </div>

        {/* Tab switcher */}
        <div className="grid grid-cols-2 p-1 bg-[#F7FBFA] rounded-xl mb-4 border border-gray-100 text-xs font-bold">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(null); setSuccessMessage(null); }}
            className={`py-1.5 rounded-lg transition-all ${
              mode === 'login' 
                ? 'bg-white text-[#0FA3A3] shadow-xs' 
                : 'text-[#5C7B79] hover:text-[#1C3B3A]'
            }`}
            id="tab-auth-login"
          >
            {t.login}
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError(null); setSuccessMessage(null); }}
            className={`py-1.5 rounded-lg transition-all ${
              mode === 'register' 
                ? 'bg-white text-[#0FA3A3] shadow-xs' 
                : 'text-[#5C7B79] hover:text-[#1C3B3A]'
            }`}
            id="tab-auth-register"
          >
            {t.register}
          </button>
        </div>

        {/* Error notice */}
        {error && (
          <div className="mb-3 p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Success notice */}
        {successMessage && (
          <div className="mb-3 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          
          {mode === 'register' && (
            <div>
              <label className="block font-bold text-[#1C3B3A] mb-1">{t.fullNameLabel}</label>
              <div className="relative">
                <User className="w-3.5 h-3.5 absolute left-3 top-3 text-gray-400" />
                <input
                  type="text"
                  required
                  placeholder={t.fullNamePlaceholder}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-xl border border-gray-200 bg-[#F7FBFA] text-[#1C3B3A] focus:outline-none focus:ring-1 focus:ring-[#0FA3A3]"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block font-bold text-[#1C3B3A] mb-1">{t.emailLabel}</label>
            <div className="relative">
              <Mail className="w-3.5 h-3.5 absolute left-3 top-3 text-gray-400" />
              <input
                type="email"
                required
                placeholder={t.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-xl border border-gray-200 bg-[#F7FBFA] text-[#1C3B3A] focus:outline-none focus:ring-1 focus:ring-[#0FA3A3]"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-[#1C3B3A] mb-1">{t.passwordLabel}</label>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 absolute left-3 top-3 text-gray-400" />
              <input
                type="password"
                required
                minLength={6}
                placeholder={t.passwordPlaceholder}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-xl border border-gray-200 bg-[#F7FBFA] text-[#1C3B3A] focus:outline-none focus:ring-1 focus:ring-[#0FA3A3]"
              />
            </div>
          </div>

          {mode === 'register' && (
            <>
              <div>
                <label className="block font-bold text-[#1C3B3A] mb-1">{t.phoneLabel}</label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 absolute left-3 top-3 text-gray-400" />
                  <input
                    type="tel"
                    placeholder={t.phonePlaceholder}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 rounded-xl border border-gray-200 bg-[#F7FBFA] text-[#1C3B3A] focus:outline-none focus:ring-1 focus:ring-[#0FA3A3]"
                  />
                </div>
              </div>

              {/* RGPD Art. 7: Mandatory Consent Checkbox (never pre-checked) */}
              <div className="p-2.5 rounded-xl bg-[#F7FBFA] border border-[#0FA3A3]/20">
                <label className="flex items-start gap-2 cursor-pointer select-none text-[11px] text-[#1C3B3A]">
                  <input
                    type="checkbox"
                    required
                    checked={privacyAccepted}
                    onChange={(e) => setPrivacyAccepted(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 text-[#0FA3A3] focus:ring-[#0FA3A3] w-4 h-4 cursor-pointer shrink-0"
                    id="checkbox-privacy-consent"
                  />
                  <span className="leading-tight text-[#5C7B79]">
                    {t.privacyConsentLabel}{' '}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        if (onOpenPrivacyPolicy) onOpenPrivacyPolicy();
                      }}
                      className="text-[#0FA3A3] font-bold underline hover:text-[#0D8C8C]"
                    >
                      {t.viewPrivacyPolicyLink}
                    </button>
                    .
                  </span>
                </label>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 rounded-xl bg-[#0FA3A3] hover:bg-[#0D8C8C] text-white font-bold text-xs shadow-xs flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] disabled:opacity-60 mt-2"
            id="btn-submit-auth"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : mode === 'login' ? (
              <>
                <LogIn className="w-3.5 h-3.5" />
                <span>{t.login}</span>
              </>
            ) : (
              <>
                <UserPlus className="w-3.5 h-3.5" />
                <span>{t.register}</span>
              </>
            )}
          </button>
        </form>

        {/* Privacy Center & Account Management */}
        <div className="mt-4 pt-3 border-t border-gray-100 flex flex-col gap-2">
          {onOpenPrivacyPolicy && (
            <button
              type="button"
              onClick={() => {
                onOpenPrivacyPolicy();
              }}
              className="w-full py-1.5 text-center text-xs text-[#0FA3A3] font-semibold hover:underline flex items-center justify-center gap-1"
              id="btn-modal-privacy-center"
            >
              <span>🛡️ {t.privacyCenterBtn}</span>
            </button>
          )}

          {onLogout && currentTenant && (
            <button
              type="button"
              onClick={() => {
                onLogout();
                onClose();
              }}
              className="w-full py-1.5 text-center text-xs text-red-600 font-semibold hover:underline"
              id="btn-modal-logout"
            >
              {t.logout}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
