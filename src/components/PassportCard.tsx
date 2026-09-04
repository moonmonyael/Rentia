import React, { useState } from 'react';
import { 
  ShieldCheck, 
  QrCode, 
  Share2, 
  Lock
} from 'lucide-react';
import { TenantProfile } from '../types';
import { Language, TRANSLATIONS } from '../i18n/translations';

interface PassportCardProps {
  tenant: TenantProfile;
  language: Language;
  onOpenShareModal: () => void;
  onOpenSimulatorModal?: () => void;
}

export const PassportCard: React.FC<PassportCardProps> = ({
  tenant,
  language,
  onOpenShareModal,
}) => {
  const t = TRANSLATIONS[language];
  const [showQrFullscreen, setShowQrFullscreen] = useState(false);

  const passportNumber = tenant.passportNumber || (tenant.id ? `RNTA-ES-${tenant.id.substring(0, 4).toUpperCase()}` : '—');
  const qrVerificationUrl = tenant.passportNumber || tenant.id
    ? `https://rentiapassport.org/verify/${passportNumber}`
    : 'https://rentiapassport.org';

  const initialLetter = (tenant.fullName || tenant.firstName || t.guestUser).charAt(0).toUpperCase();

  return (
    <div className="bg-white rounded-3xl p-6 border border-stone-200/80 shadow-sm space-y-6">
      
      {/* Passport Header with Rentia Indigo Identity */}
      <div className="flex items-start justify-between pb-4 border-b border-stone-100">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#1E1B4B] text-white flex items-center justify-center font-black text-base shadow-xs">
            {initialLetter}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-base font-bold text-[#1E1B4B]">
                {tenant.fullName || t.guestUser}
              </h2>
              {tenant.id && <ShieldCheck className="w-4 h-4 text-[#D97706]" />}
            </div>
            <p className="text-xs text-stone-500 font-mono">
              {tenant.passportNumber || tenant.id ? `N° ${passportNumber}` : t.noActiveSessionDesc}
            </p>
          </div>
        </div>

        <button
          onClick={onOpenShareModal}
          className="p-2 rounded-xl bg-stone-50 hover:bg-stone-100 text-[#1E1B4B] transition-colors"
          title={t.shareBtn}
        >
          <Share2 className="w-4 h-4" />
        </button>
      </div>

      {/* Main Score & Metrics Panel */}
      <div className="grid grid-cols-3 gap-3">
        {/* Metric 1: Trust Score */}
        <div className="bg-[#FAF9F6] rounded-2xl p-3.5 text-center border border-stone-200/60">
          <p className="text-2xl font-black text-[#1E1B4B] leading-none">
            {tenant.stats?.trustScore ?? tenant.trustScore ?? 0}
            <span className="text-xs text-stone-400 font-normal">/100</span>
          </p>
          <p className="text-[11px] font-semibold text-stone-600 mt-1 truncate">{t.scoreLabel}</p>
        </div>

        {/* Metric 2: On-time Payments */}
        <div className="bg-[#FAF9F6] rounded-2xl p-3.5 text-center border border-stone-200/60">
          <p className="text-2xl font-black text-[#1E1B4B] leading-none">
            {tenant.stats?.onTimePaymentRate ?? tenant.onTimePaymentRate ?? 0}%
          </p>
          <p className="text-[11px] font-semibold text-stone-600 mt-1 truncate">{t.onTimePayments}</p>
        </div>

        {/* Metric 3: Verified Leases */}
        <div className="bg-[#FAF9F6] rounded-2xl p-3.5 text-center border border-stone-200/60">
          <p className="text-2xl font-black text-[#1E1B4B] leading-none">
            {tenant.stats?.verifiedLandlordsCount ?? tenant.verifiedLeasesCount ?? 0}
          </p>
          <p className="text-[11px] font-semibold text-stone-600 mt-1 truncate">{t.verifiedLandlords}</p>
        </div>
      </div>

      {/* DEDICATED QR CODE SPACE */}
      <div className="bg-[#FAF9F6] rounded-2xl p-4 border border-stone-200/80 flex items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <QrCode className="w-4 h-4 text-[#1E1B4B]" />
            <h3 className="text-xs font-bold text-[#1E1B4B]">{t.qrVerifiedTitle}</h3>
          </div>
          <p className="text-[11px] text-stone-500 max-w-xs leading-relaxed">
            {t.qrVerifiedDesc}
          </p>
        </div>

        <div 
          onClick={() => setShowQrFullscreen(true)}
          className="bg-white p-2 rounded-xl border border-stone-200 shadow-xs cursor-pointer hover:scale-105 transition-transform shrink-0"
        >
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrVerificationUrl)}`}
            alt="QR Code Passport"
            className="w-16 h-16"
          />
        </div>
      </div>

      {/* Fullscreen QR Modal */}
      {showQrFullscreen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-xs w-full text-center shadow-2xl border border-stone-200 space-y-4">
            <h3 className="text-sm font-bold text-[#1E1B4B]">{t.qrVerifiedTitle}</h3>
            <div className="bg-[#FAF9F6] p-4 rounded-2xl border border-stone-200 inline-block">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrVerificationUrl)}`}
                alt="QR Code Enlarge"
                className="w-48 h-48 mx-auto"
              />
            </div>
            <p className="text-[11px] text-stone-500 font-mono">{qrVerificationUrl}</p>
            <button
              onClick={() => setShowQrFullscreen(false)}
              className="w-full py-2.5 bg-[#1E1B4B] text-white rounded-xl text-xs font-bold"
            >
              {t.closeBtn}
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
