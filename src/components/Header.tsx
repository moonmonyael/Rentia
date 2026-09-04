import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Sparkles, 
  QrCode, 
  FileText, 
  User, 
  LogIn, 
  LogOut,
  ChevronDown,
  Globe,
  MessageSquare,
  KeyRound
} from 'lucide-react';
import { ViewMode } from '../types';
import { Language, TRANSLATIONS } from '../i18n/translations';

interface HeaderProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  onOpenAddModal: () => void;
  onOpenShareModal?: () => void;
  onOpenAuthModal: () => void;
  currentUser: { id?: string; email: string; name?: string } | null;
  onLogout: () => void;
  pendingCount?: number;
  onOpenScanContract?: () => void;
  tenantName?: string;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onViewChange,
  language,
  onLanguageChange,
  onOpenAddModal,
  onOpenShareModal,
  onOpenAuthModal,
  currentUser,
  onLogout,
}) => {
  const t = TRANSLATIONS[language];
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  // Exactement les 3 langues autorisées
  const availableLanguages: { code: Language; label: string; flag: string }[] = [
    { code: 'es', label: 'Español', flag: '🇪🇸' },
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'fr', label: 'Français', flag: '🇫🇷' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#FAF9F6]/90 backdrop-blur-md border-b border-stone-200/80">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        
        {/* LOGO & BRAND */}
        <div 
          onClick={() => onViewChange('matching_discovery')}
          className="flex items-center gap-2 cursor-pointer select-none"
          id="logo-brand"
        >
          <div className="w-8 h-8 rounded-xl bg-[#1E1B4B] text-white flex items-center justify-center shadow-xs">
            <ShieldCheck className="w-5 h-5 text-[#D97706]" />
          </div>
          <div>
            <span className="text-base font-black tracking-tight text-[#1E1B4B] block leading-none">
              RENTIA
            </span>
            <span className="text-[9px] font-semibold text-stone-400 tracking-wider uppercase">
              Passport
            </span>
          </div>
        </div>

        {/* CENTER CLEAN NAV (Spaces) */}
        <nav className="flex items-center gap-1 bg-white p-1 rounded-2xl border border-stone-200/80 shadow-xs">
          {/* Space 1: Swipe Discovery */}
          <button
            onClick={() => onViewChange('matching_discovery')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              currentView === 'matching_discovery'
                ? 'bg-[#1E1B4B] text-white shadow-xs'
                : 'text-stone-600 hover:text-[#1E1B4B] hover:bg-stone-50'
            }`}
            id="nav-tab-matching"
          >
            <Sparkles className={`w-3.5 h-3.5 ${currentView === 'matching_discovery' ? 'text-[#D97706]' : 'text-stone-400'}`} />
            <span>{t.navExplore}</span>
          </button>

          {/* Space 2: Post-Match Messages */}
          <button
            onClick={() => onViewChange('matches_chat')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              currentView === 'matches_chat'
                ? 'bg-[#1E1B4B] text-white shadow-xs'
                : 'text-stone-600 hover:text-[#1E1B4B] hover:bg-stone-50'
            }`}
            id="nav-tab-messages"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{t.navMessages}</span>
          </button>

          {/* Space 3: Dedicated Passport & QR */}
          <button
            onClick={() => onViewChange('tenant_passport')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              currentView === 'tenant_passport'
                ? 'bg-[#1E1B4B] text-white shadow-xs'
                : 'text-stone-600 hover:text-[#1E1B4B] hover:bg-stone-50'
            }`}
            id="nav-tab-passport"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>{t.navPassport}</span>
          </button>

          {/* Space 4: Official Certificate */}
          <button
            onClick={() => onViewChange('certificate_export')}
            className={`hidden sm:flex px-3 py-1.5 rounded-xl text-xs font-bold transition-all items-center gap-1.5 ${
              currentView === 'certificate_export'
                ? 'bg-[#1E1B4B] text-white shadow-xs'
                : 'text-stone-600 hover:text-[#1E1B4B] hover:bg-stone-50'
            }`}
            id="nav-tab-certificate"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{t.navCertificate}</span>
          </button>
        </nav>

        {/* RIGHT ACCOUNT & LANGUAGE CONTROLS */}
        <div className="flex items-center gap-2">
          {/* Strict 3-Language Switcher */}
          <div className="relative">
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="px-2 py-1.5 text-stone-700 hover:text-[#1E1B4B] rounded-xl hover:bg-white transition-colors border border-stone-200/60 bg-white/70 text-xs font-bold flex items-center gap-1.5 shadow-2xs"
              title="Changer de langue / Change language"
              id="btn-language-dropdown"
            >
              <Globe className="w-3.5 h-3.5 text-stone-500" />
              <span>{language.toUpperCase()}</span>
              <ChevronDown className="w-3 h-3 text-stone-400" />
            </button>

            {showLangMenu && (
              <div className="absolute right-0 mt-1.5 w-32 bg-white rounded-2xl shadow-xl border border-stone-200 py-1.5 z-50 animate-scale-up">
                {availableLanguages.map((item) => (
                  <button
                    key={item.code}
                    onClick={() => {
                      onLanguageChange(item.code);
                      setShowLangMenu(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs font-semibold hover:bg-stone-50 flex items-center justify-between transition-colors ${
                      language === item.code ? 'text-[#1E1B4B] font-bold bg-[#FAF9F6]' : 'text-stone-600'
                    }`}
                  >
                    <span>{item.label}</span>
                    <span className="text-sm">{item.flag}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Account Profile / Auth */}
          {currentUser ? (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white border border-stone-200/80 text-xs font-bold text-[#1E1B4B] hover:bg-stone-50 transition-colors shadow-2xs"
                id="btn-account-menu"
              >
                <div className="w-5 h-5 rounded-full bg-[#1E1B4B] text-white flex items-center justify-center text-[10px] font-bold">
                  {(currentUser.name || currentUser.email).charAt(0).toUpperCase()}
                </div>
                <span className="hidden md:inline max-w-[120px] truncate text-xs font-bold">
                  {currentUser.name || currentUser.email.split('@')[0]}
                </span>
                <ChevronDown className="w-3 h-3 text-stone-400" />
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-2xl shadow-xl border border-stone-200 py-1.5 z-50 animate-scale-up">
                  <div className="px-3 py-2 border-b border-stone-100">
                    <p className="text-[10px] text-stone-400 uppercase font-bold tracking-wider">{t.activeAccount}</p>
                    {currentUser.name && (
                      <p className="text-xs font-bold text-[#1E1B4B] truncate">{currentUser.name}</p>
                    )}
                    <p className="text-[11px] text-stone-500 truncate">{currentUser.email}</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      onLogout();
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-stone-600 hover:text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{t.logout}</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onViewChange('landlord_verify_flow')}
                className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-stone-200 bg-white text-stone-700 hover:text-[#1E1B4B] hover:bg-stone-50 text-xs font-bold transition-colors shadow-2xs"
                id="btn-nav-landlord-verify"
                title={t.verifyLandlordBtn}
              >
                <KeyRound className="w-3.5 h-3.5 text-[#0FA3A3]" />
                <span>{t.verifyLandlordBtn}</span>
              </button>

              <button
                onClick={onOpenAuthModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1E1B4B] text-white text-xs font-bold hover:bg-[#28235C] transition-colors shadow-xs"
                id="btn-open-auth"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{t.login}</span>
              </button>
            </div>
          )}
        </div>

      </div>
    </header>
  );
};
