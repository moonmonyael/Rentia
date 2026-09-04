import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { PassportCard } from './components/PassportCard';
import { TrustStats } from './components/TrustStats';
import { RentalHistoryList } from './components/RentalHistoryList';
import { LandlordFastVerification } from './components/LandlordFastVerification';
import { PublicLandlordInspection } from './components/PublicLandlordInspection';
import { OfficialCertificatePrint } from './components/OfficialCertificatePrint';
import { SwipeDiscovery } from './components/SwipeDiscovery';
import { MatchesListView } from './components/MatchesListView';
import { AddLeaseModal } from './components/AddLeaseModal';
import { SharePassportModal } from './components/SharePassportModal';
import { AuthModal } from './components/AuthModal';
import { PaymentHistoryModal } from './components/PaymentHistoryModal';
import { PrivacyPolicyModal } from './components/PrivacyPolicyModal';
import { INITIAL_TENANT, INITIAL_LEASES } from './data/mockData';
import { RentalLease, TenantProfile, ViewMode } from './types';
import { Language, TRANSLATIONS } from './i18n/translations';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { api, setAuthToken } from './api/client';
import { supabase } from './lib/supabase';

export default function App() {
  const [language, setLanguage] = useState<Language>('es'); // Default is Spanish as requested
  const [tenant, setTenant] = useState<TenantProfile>(INITIAL_TENANT);
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; name?: string } | null>(null);
  const [leases, setLeases] = useState<RentalLease[]>(INITIAL_LEASES);

  const [currentView, setCurrentView] = useState<ViewMode>('tenant_passport');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isPaymentsModalOpen, setIsPaymentsModalOpen] = useState(false);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const t = TRANSLATIONS[language];

  // Update HTML dir (RTL/LTR) and lang whenever language changes
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = t.isRtl ? 'rtl' : 'ltr';
      document.documentElement.lang = language;
    }
  }, [language, t.isRtl]);

  // Deep Link URL detection on app mount (?code=VAL784, ?inspect=1, ?view=cert)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const codeParam = params.get('code') || params.get('validate');
      const inspectParam = params.get('inspect') || params.get('public');
      const viewParam = params.get('view');

      if (codeParam || viewParam === 'verify') {
        setCurrentView('landlord_verify_flow');
      } else if (inspectParam === '1' || viewParam === 'landlord' || viewParam === 'public') {
        setCurrentView('landlord_public_view');
      } else if (viewParam === 'cert' || viewParam === 'certificate') {
        setCurrentView('certificate_export');
      }
    }
  }, []);

  // Fetch tenant and leases from live backend API
  const refreshBackendData = useCallback(async () => {
    try {
      // 1. Check current logged-in user profile from Supabase session
      let meRes;
      try {
        meRes = await api.tenant.getMe();
      } catch {
        // No active session: set unauthenticated state honestly
        setCurrentUser(null);
        setTenant(INITIAL_TENANT);
      }

      if (meRes?.tenant) {
        const tData = meRes.tenant;
        setCurrentUser({
          id: tData.id,
          email: tData.email || '',
          name: tData.name || '',
        });
        setTenant(prev => ({
          ...prev,
          id: tData.id,
          passportId: tData.id ? `RNTA-${tData.id.substring(0, 4).toUpperCase()}` : '',
          passportNumber: tData.id ? `RNTA-ES-${tData.id.substring(0, 4).toUpperCase()}` : '',
          fullName: tData.name || '',
          email: tData.email || '',
          phone: tData.phone || '',
          trustScore: tData.trustScore ?? 0,
          stats: {
            ...prev.stats,
            ...(tData.stats || {}),
          },
        }));
      }

      // 2. Fetch leases from Supabase
      const leasesRes = await api.leases.getLeases();
      if (leasesRes?.leases && Array.isArray(leasesRes.leases)) {
        const formattedLeases: RentalLease[] = leasesRes.leases.map((l: any) => {
          const v = l.verification;
          const countryName = l.country || (l.address?.includes('(FR)') ? 'France' : l.address?.includes('(UK)') ? 'United Kingdom' : 'España');
          const isUK = countryName.toLowerCase().includes('united kingdom') || countryName.toLowerCase().includes('uk');
          const isFR = countryName.toLowerCase().includes('france');

          return {
            id: l.id,
            code: l.code,
            address: l.address || '',
            city: l.city || (l.address && l.address.includes(',') ? l.address.split(',')[1].trim() : ''),
            postalCode: l.postalCode || l.postal_code || '',
            country: countryName || '',
            countryCode: isFR ? 'FR' : isUK ? 'UK' : 'ES',
            flag: isFR ? '🇫🇷' : isUK ? '🇬🇧' : '🇪🇸',
            propertyType: l.propertyType || l.property_type || 'Apartment',
            isFurnished: true,
            monthlyRent: Number(l.rent) || 0,
            deposit: Number(l.deposit) || 0,
            currency: l.currency || (isUK ? '£' : '€'),
            startDate: l.startDate || l.start_date || '',
            endDate: l.endDate || l.end_date || '',
            isCurrent: (l.endDate || l.end_date) === 'Actual' || (l.endDate || l.end_date) === 'En cours',
            monthsCount: 12,
            status: l.status,
            verificationToken: l.code,
            landlordName: l.ownerNameGuess || l.owner_name_guess || '',
            landlordEmail: l.ownerContact || l.owner_contact || '',
            certificateHash: v?.cryptoHash || (l.status === 'verified' ? `0x${l.id.substring(0, 8).toUpperCase()}` : undefined),
            landlordRating: v ? {
              onTimePayment: v.rentPaidOk === 'yes',
              paymentScore: v.rentPaidOk === 'yes' ? 100 : v.rentPaidOk === 'sometimes' ? 80 : 50,
              propertyCareScore: v.propertyMaintained === 'yes' ? 5 : 3,
              neighbourhoodRelationsScore: 5,
              depositReturnedFull: v.propertyMaintained === 'yes',
              wouldRentAgain: v.wouldRecommend === 'yes',
              comment: v.comment || '',
              verifiedAt: v.confirmedAt ? new Date(v.confirmedAt).toLocaleDateString(language === 'es' ? 'es-ES' : language === 'ar' ? 'ar-AE' : 'en-US') : '',
              landlordName: l.ownerNameGuess || l.owner_name_guess || '',
              landlordType: 'particulier',
              verificationMethod: 'digital_signature',
            } : undefined,
          };
        });
        setLeases(formattedLeases);
      }
    } catch (err) {
      console.warn('Backend sync error:', err);
    }
  }, [language]);

  useEffect(() => {
    refreshBackendData();
  }, [refreshBackendData]);

  const pendingLeases = leases.filter(l => l.status === 'pending');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const handleAuthSuccess = (tenantData: any) => {
    if (tenantData) {
      if (tenantData.token) {
        setAuthToken(tenantData.token);
      }
      setCurrentUser({
        id: tenantData.id,
        email: tenantData.email,
        name: tenantData.name,
      });
      setTenant(prev => ({
        ...prev,
        id: tenantData.id,
        fullName: tenantData.name || prev.fullName,
      }));
    }
    showToast(`${t.login}: ${tenantData?.name || tenantData?.email || ''}`);
    refreshBackendData();
  };

  const handleLogout = async () => {
    try {
      await api.auth.logout();
    } catch {}
    setAuthToken(null);
    await supabase.auth.signOut().catch(() => {});
    setCurrentUser(null);
    showToast(t.logout);
  };

  const handleAddLease = (newLease: RentalLease) => {
    setLeases(prev => [newLease, ...prev]);
    showToast(t.leaseAddedToast.replace('{code}', newLease.code || 'VAL784'));
    refreshBackendData();
  };

  const handleDeleteLease = async (leaseId: string) => {
    try {
      await api.leases.deleteLease(leaseId);
      setLeases(prev => prev.filter(l => l.id !== leaseId));
      showToast(t.leaseDeletedToast);
    } catch (err: any) {
      showToast(err.message || 'Error');
    }
  };

  const handleVerifyLease = (leaseId: string, ratingData: any) => {
    setLeases(prev => prev.map(l => {
      if (l.id === leaseId || l.code === leaseId) {
        return {
          ...l,
          status: 'verified',
          certificateHash: `0x${Math.random().toString(16).substring(2, 10).toUpperCase()}`,
          landlordRating: ratingData,
        };
      }
      return l;
    }));

    showToast(t.certifiedSuccess);
    refreshBackendData();
  };

  return (
    <div className={`min-h-screen bg-[#F7FBFA] text-[#1C3B3A] flex flex-col font-sans selection:bg-[#0FA3A3] selection:text-white ${t.isRtl ? 'font-arabic' : ''}`}>
      
      {/* Toast alert */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-[#1C3B3A] text-white px-4 py-2.5 rounded-xl shadow-lg border border-[#2EC4A6] flex items-center gap-2 text-xs font-semibold animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-[#2EC4A6]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Clean Navigation Header with Auth Modal button */}
      <Header
        currentView={currentView}
        onViewChange={setCurrentView}
        pendingCount={pendingLeases.length}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        onOpenShareModal={() => setIsShareModalOpen(true)}
        onOpenScanContract={() => setIsAddModalOpen(true)}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        currentUser={currentUser}
        onLogout={handleLogout}
        tenantName={tenant.fullName}
        language={language}
        onLanguageChange={setLanguage}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-xl w-full mx-auto px-4 py-5 space-y-4">
        
        {/* VIEW 1: TENANT PASSPORT */}
        {currentView === 'tenant_passport' && (
          <div className="space-y-4">
            
            {/* Passport Card (Identity + 3 Key Metrics + Main Actions) */}
            <PassportCard
              tenant={tenant}
              onOpenShareModal={() => setIsShareModalOpen(true)}
              language={language}
            />

            {/* Trust Stats (3 clear cards) */}
            <TrustStats 
              tenant={tenant} 
              language={language} 
            />

            {/* Verified Tenancy List with Backend Leases, 6-char codes, WhatsApp/Email invites */}
            <RentalHistoryList
              leases={leases}
              onOpenAddModal={() => setIsAddModalOpen(true)}
              onOpenScanContract={() => setIsAddModalOpen(true)}
              onDeleteLease={handleDeleteLease}
              tenantName={tenant.fullName}
              language={language}
            />

          </div>
        )}

        {/* VIEW 2: FAST LANDLORD VERIFICATION (30-sec 4-tap flow via 6-char code) */}
        {currentView === 'landlord_verify_flow' && (
          <LandlordFastVerification
            lease={null}
            currentUser={currentUser}
            onVerifyComplete={handleVerifyLease}
            onBackToPassport={() => setCurrentView('tenant_passport')}
            onLogout={handleLogout}
            language={language}
          />
        )}

        {/* VIEW 3: PROSPECTIVE LANDLORD INSPECTION */}
        {currentView === 'landlord_public_view' && (
          <PublicLandlordInspection
            tenant={tenant}
            leases={leases}
            onBackToPassport={() => setCurrentView('tenant_passport')}
            onOpenCertificate={() => setCurrentView('certificate_export')}
            language={language}
          />
        )}

        {/* VIEW 4: OFFICIAL CERTIFICATE PDF PRINT VIEW */}
        {currentView === 'certificate_export' && (
          <OfficialCertificatePrint
            tenant={tenant}
            leases={leases}
            onBackToPassport={() => setCurrentView('tenant_passport')}
            language={language}
          />
        )}

        {/* VIEW 5: MATCHING & SWIPE DISCOVERY */}
        {currentView === 'matching_discovery' && (
          <SwipeDiscovery
            tenant={tenant}
            language={language}
            onOpenPassportTab={() => setCurrentView('tenant_passport')}
            onNavigateToChat={() => setCurrentView('matches_chat')}
            currentUserEmail={currentUser?.email || ''}
          />
        )}

        {/* VIEW 6: POST-MATCH MESSAGING */}
        {currentView === 'matches_chat' && (
          <MatchesListView
            currentUserId={tenant.id || currentUser?.id || ''}
            isLandlord={false}
            tenantProfile={tenant}
            language={language}
            onExploreClick={() => setCurrentView('matching_discovery')}
          />
        )}

      </main>

      {/* Minimal Footer with GDPR & Privacy Center access */}
      <footer className="no-print border-t border-gray-100 text-center py-4 px-4 text-xs text-[#5C7B79]">
        <div className="flex flex-wrap items-center justify-center gap-3 mb-1">
          <span className="font-semibold text-[#1C3B3A]">Rentia</span>
          <span>•</span>
          <button
            type="button"
            onClick={() => setIsPrivacyModalOpen(true)}
            className="text-[#0FA3A3] font-bold hover:underline inline-flex items-center gap-1"
            id="footer-privacy-link"
          >
            <ShieldCheck className="w-3 h-3" />
            <span>{t.privacyCenterBtn}</span>
          </button>
          {!currentUser && (
            <>
              <span>•</span>
              <button
                type="button"
                onClick={() => setCurrentView('landlord_verify_flow')}
                className="text-stone-600 hover:text-[#1C3B3A] font-semibold hover:underline inline-flex items-center gap-1"
                id="footer-landlord-verify-link"
              >
                <span>{t.verifyLandlordBtn}</span>
              </button>
            </>
          )}
        </div>
        <p className="text-[11px] text-gray-400">{t.tagline} • 100% {t.verifiedBadge} • RGPD Compliant (UE 2016/679)</p>
      </footer>

      {/* Modals */}
      <AddLeaseModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddLease={handleAddLease}
        language={language}
      />

      <SharePassportModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        tenant={tenant}
        onOpenCertificate={() => {
          setIsShareModalOpen(false);
          setCurrentView('certificate_export');
        }}
        onOpenLandlordView={() => {
          setIsShareModalOpen(false);
          setCurrentView('landlord_public_view');
        }}
        language={language}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
        currentTenant={currentUser ? { name: currentUser.name || tenant.fullName, email: currentUser.email } : null}
        onLogout={handleLogout}
        onOpenPrivacyPolicy={() => {
          setIsAuthModalOpen(false);
          setIsPrivacyModalOpen(true);
        }}
        language={language}
      />

      <PaymentHistoryModal
        isOpen={isPaymentsModalOpen}
        onClose={() => setIsPaymentsModalOpen(false)}
        leases={leases}
        language={language}
      />

      <PrivacyPolicyModal
        isOpen={isPrivacyModalOpen}
        onClose={() => setIsPrivacyModalOpen(false)}
        language={language}
        currentTenant={tenant}
        onAccountDeleted={() => {
          handleLogout();
          setToastMessage(t.accountDeletedToast);
          setTimeout(() => setToastMessage(null), 4000);
        }}
      />

    </div>
  );
}
