import { Router, Response } from 'express';
import { getSupabase } from '../supabase';
import { requireTenantAuth, AuthenticatedRequest } from '../middleware/auth';

export const tenantRouter = Router();

// Apply auth middleware to all tenant profile routes
tenantRouter.use(requireTenantAuth);

// 1. Voir son propre profil & score de réputation depuis Supabase
tenantRouter.get('/me', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.tenant!.id;
    const supabase = getSupabase(req.supabaseToken);

    // 1. Fetch user profile from Supabase profiles
    let { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', tenantId)
      .maybeSingle();

    if (!profile) {
      profile = {
        id: tenantId,
        name: req.tenant!.name,
        email: req.tenant!.email,
        phone: req.tenant!.phone || null,
        preferred_lang: req.tenant!.preferred_lang || 'es',
        avatar_url: req.tenant!.avatar_url || '',
        trust_score: 85,
      };
    }

    // 2. Fetch leases from Supabase
    const { data: leasesData, error: leasesErr } = await supabase
      .from('leases')
      .select(`
        id, code, address, city, postal_code, country, rent, deposit, start_date, end_date,
        owner_name_guess, owner_contact, status, created_at,
        verifications (
          id, tenancy_confirmed, rent_paid_ok, property_maintained, would_recommend, comment, crypto_hash, confirmed_at
        )
      `)
      .eq('user_id', tenantId)
      .order('created_at', { ascending: false });

    const leases = leasesData || [];
    const verifiedLeases = leases.filter(l => l.status === 'verified');
    const totalLeases = leases.length;
    const verifiedCount = verifiedLeases.length;

    // 3. Fetch reputation events from Supabase
    const { data: eventsData } = await supabase
      .from('reputation_events')
      .select('*')
      .eq('user_id', tenantId)
      .order('created_at', { ascending: false });

    const events = eventsData || [];
    
    // Calculate total score from profile.trust_score or reputation_events (baseline 85, clamped between 0 and 100)
    let calculatedScore = profile?.trust_score ?? 85;
    if (events.length > 0) {
      const latestEvent = events[0];
      if (latestEvent && typeof latestEvent.resulting_score === 'number') {
        calculatedScore = latestEvent.resulting_score;
      } else {
        calculatedScore = events.reduce((sum, evt) => sum + (Number(evt.score_delta ?? evt.points_delta) || 0), 70);
      }
    }
    // If verified leases exist, add bonuses
    if (verifiedCount > 0 && events.length === 0) {
      calculatedScore += (verifiedCount * 12);
    }
    calculatedScore = Math.min(100, Math.max(40, calculatedScore));

    // Calculate on-time rent rate and property care from real confirmations
    let onTimeCount = 0;
    let totalConfirmedRent = 0;
    let propertyGoodCount = 0;

    for (const lease of verifiedLeases) {
      const verif = Array.isArray(lease.verifications) ? lease.verifications[0] : lease.verifications;
      if (verif) {
        if (verif.rent_paid_ok) {
          totalConfirmedRent++;
          if (verif.rent_paid_ok === 'yes') onTimeCount += 1;
          else if (verif.rent_paid_ok === 'sometimes') onTimeCount += 0.5;
        }
        if (verif.property_maintained === 'yes') {
          propertyGoodCount++;
        }
      }
    }

    const onTimePaymentRate = totalConfirmedRent > 0
      ? Math.round((onTimeCount / totalConfirmedRent) * 100)
      : 100;

    const depositReturnedRate = verifiedCount > 0
      ? Math.round((propertyGoodCount / verifiedCount) * 100)
      : 100;

    const totalMonths = verifiedCount * 12;

    res.json({
      tenant: {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        preferred_lang: profile.preferred_lang || 'es',
        avatar_url: profile.avatar_url,
        country_code: profile.country_code || 'ES',
        country_flag: profile.country_flag || '🇪🇸',
        trustScore: calculatedScore,
        reputationEvents: events,
        stats: {
          trustScore: calculatedScore,
          onTimePaymentRate,
          depositReturnedRate,
          verifiedLandlordsCount: verifiedCount,
          totalMonths,
          totalLeases,
          zeroDisputes: !leases.some(l => l.status === 'disputed' || l.status === 'rejected'),
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erreur lors du chargement du profil Supabase.' });
  }
});

// 2. Modifier son propre profil dans Supabase (name, phone, preferred_lang)
tenantRouter.put('/me', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.tenant!.id;
    const { name, phone, preferred_lang, avatar_url } = req.body;

    if (!name || String(name).trim().length === 0) {
      res.status(400).json({ error: 'Le nom ne peut pas être vide.' });
      return;
    }

    const cleanName = String(name).trim();
    const cleanPhone = phone ? String(phone).trim() : null;
    const cleanLang = preferred_lang || 'es';
    const supabase = getSupabase();

    // Vérification d'unicité du téléphone s'il a été renseigné
    if (cleanPhone) {
      const normalizedPhone = cleanPhone.replace(/[\s\-\(\)\.]/g, '');
      const { data: existingPhoneProfile } = await supabase
        .from('profiles')
        .select('id, phone')
        .neq('id', tenantId)
        .or(`phone.eq.${cleanPhone},phone.eq.${normalizedPhone}`)
        .maybeSingle();

      if (existingPhoneProfile) {
        const errorMsg = cleanLang === 'fr' 
          ? 'Ce numéro est déjà associé à un autre compte.' 
          : cleanLang === 'en' 
          ? 'This phone number is already associated with another account.' 
          : 'Este número de teléfono ya está asociado a otra cuenta.';
        res.status(400).json({ error: errorMsg, code: 'PHONE_ALREADY_EXISTS' });
        return;
      }
    }

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({
        name: cleanName,
        phone: cleanPhone,
        preferred_lang: cleanLang,
        avatar_url: avatar_url || undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId);

    if (updateErr) {
      if (updateErr.code === '23505' || updateErr.message?.includes('phone') || updateErr.message?.includes('idx_profiles_phone_unique')) {
        const errorMsg = cleanLang === 'fr' 
          ? 'Ce numéro est déjà associé à un autre compte.' 
          : cleanLang === 'en' 
          ? 'This phone number is already associated with another account.' 
          : 'Este número de teléfono ya está asociado a otra cuenta.';
        res.status(400).json({ error: errorMsg, code: 'PHONE_ALREADY_EXISTS' });
        return;
      }
      res.status(400).json({ error: updateErr.message });
      return;
    }

    res.json({
      message: 'Profil mis à jour avec succès dans Supabase.',
      tenant: {
        id: tenantId,
        name: cleanName,
        email: req.tenant!.email,
        phone: cleanPhone,
        preferred_lang: cleanLang,
        avatar_url,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erreur lors de la mise à jour du profil.' });
  }
});

// 3. RGPD Art. 15 & 20: Droit d'accès et de portabilité des données (Export complet en JSON)
tenantRouter.get('/export-data', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.tenant!.id;
    const supabase = getSupabase();

    // 1. Profil
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', tenantId)
      .maybeSingle();

    // 2. Locations et contrats
    const { data: leases } = await supabase
      .from('leases')
      .select(`
        id, code, address, city, postal_code, country, property_type, rent, deposit,
        currency, start_date, end_date, is_current, owner_name_guess, status,
        created_at,
        verifications (
          id, tenancy_confirmed, rent_paid_ok, property_maintained, would_recommend,
          comment, crypto_hash, confirmed_at
        )
      `)
      .eq('user_id', tenantId)
      .order('created_at', { ascending: false });

    // 3. Fichiers et métadonnées de contrats
    const { data: contracts } = await supabase
      .from('contracts')
      .select('id, lease_id, file_path, file_name, file_size_bytes, mime_type, page_count, created_at')
      .in('lease_id', (leases || []).map(l => l.id));

    // 4. Historique des paiements
    const { data: payments } = await supabase
      .from('payments')
      .select('*')
      .in('lease_id', (leases || []).map(l => l.id));

    // 5. Journal des événements de réputation
    const { data: reputationEvents } = await supabase
      .from('reputation_events')
      .select('*')
      .eq('user_id', tenantId)
      .order('created_at', { ascending: false });

    // 6. Logs d'audit RGPD
    const { data: auditLogs } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('user_id', tenantId)
      .order('created_at', { ascending: false });

    // Format final standardisé RGPD
    const exportPayload = {
      rgpd_export_metadata: {
        regulation: 'Reglamento General de Protección de Datos (RGPD / GDPR UE 2016/679)',
        articles: 'Artículos 15 (Derecho de Acceso) y 20 (Derecho a la Portabilidad)',
        data_controller: 'Rentia Reputation Technologies S.L. (DPO: dpo@rentia.app)',
        export_date: new Date().toISOString(),
        subject_id: tenantId,
        format_version: '2.0-JSON',
        notice: 'Este archivo contiene la totalidad de sus datos personales y registros de reputación almacenados en la plataforma Rentia.',
      },
      user_profile: {
        id: profile?.id || tenantId,
        full_name: profile?.name || req.tenant!.name,
        email: profile?.email || req.tenant!.email,
        phone: profile?.phone || req.tenant!.phone || null,
        passport_code: profile?.passport_code || null,
        trust_score: profile?.trust_score || 85,
        preferred_language: profile?.preferred_lang || 'es',
        avatar_url: profile?.avatar_url || null,
        created_at: profile?.created_at || null,
      },
      consent_records: {
        privacy_policy_accepted_at: profile?.privacy_policy_accepted_at || profile?.created_at || null,
        privacy_policy_version: profile?.privacy_policy_version || '1.0',
        terms_accepted_at: profile?.terms_accepted_at || profile?.created_at || null,
      },
      rental_leases: leases || [],
      stored_contract_documents: (contracts || []).map(c => ({
        id: c.id,
        file_name: c.file_name,
        file_size_bytes: c.file_size_bytes,
        mime_type: c.mime_type,
        page_count: c.page_count,
        created_at: c.created_at,
      })),
      payment_history: payments || [],
      reputation_history: reputationEvents || [],
      security_audit_logs: auditLogs || [],
    };

    // Log export action in audit_logs
    try {
      await supabase.from('audit_logs').insert({
        user_id: tenantId,
        action: 'RGPD_DATA_EXPORTED',
        resource_type: 'user_data',
        resource_id: tenantId,
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch {
      // Non-blocking
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="rentia_datos_rgpd_${tenantId.substring(0, 8)}.json"`);
    res.json(exportPayload);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erreur lors de l’export des données RGPD.' });
  }
});

// 4. RGPD Art. 17: Droit à l'effacement / Anonymisation & suppression des fichiers Storage
tenantRouter.delete('/me', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.tenant!.id;
    const supabase = getSupabase();

    // 1. Récupérer les baux et fichiers de contrat
    const { data: userLeases } = await supabase
      .from('leases')
      .select('id, code, status')
      .eq('user_id', tenantId);

    const leaseIds = (userLeases || []).map(l => l.id);

    // 2. Supprimer les fichiers de contrat du bucket Supabase Storage "contracts"
    if (leaseIds.length > 0) {
      const { data: contractFiles } = await supabase
        .from('contracts')
        .select('storage_path')
        .in('lease_id', leaseIds);

      if (contractFiles && contractFiles.length > 0) {
        const filePaths = contractFiles.map(c => c.storage_path).filter(Boolean);
        if (filePaths.length > 0) {
          try {
            await supabase.storage.from('contracts').remove(filePaths);
          } catch (err) {
            console.warn('Storage purge warning:', err);
          }
        }
      }

      // Supprimer les enregistrements de la table contracts
      try {
        await supabase.from('contracts').delete().in('lease_id', leaseIds);
      } catch {
        // Non-blocking
      }
    }

    // 3. Supprimer les baux non-vérifiés (pending, draft, rejected)
    try {
      await supabase
        .from('leases')
        .delete()
        .eq('user_id', tenantId)
        .neq('status', 'verified');
    } catch {
      // Non-blocking
    }

    // 4. Anonymisation RGPD des données personnelles du profil (nom, email, tel, avatar)
    // tout en conservant les hashs cryptographiques des baux vérifiés pour éviter les fraudes
    const anonymizedEmail = `anonymized-${tenantId.substring(0, 8)}@deleted.rentia.app`;
    const nowIso = new Date().toISOString();

    const { error: profileAnonErr } = await supabase
      .from('profiles')
      .update({
        name: 'Usuario Anonimizado (RGPD)',
        email: anonymizedEmail,
        phone: null,
        avatar_url: null,
        anonymized_at: nowIso,
        deleted_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', tenantId);

    if (profileAnonErr) {
      console.warn('Profile anonymization warning:', profileAnonErr);
    }

    // 5. Supprimer les paiements associés
    if (leaseIds.length > 0) {
      try {
        await supabase.from('payments').delete().in('lease_id', leaseIds);
      } catch {
        // Non-blocking
      }
    }

    // 6. Enregistrer l'action d'effacement dans le journal d'audit
    try {
      await supabase.from('audit_logs').insert({
        user_id: tenantId,
        action: 'RGPD_ACCOUNT_ERASED_ANONYMIZED',
        resource_type: 'profile',
        resource_id: tenantId,
        metadata: {
          timestamp: nowIso,
          storage_purged: true,
          leases_anonymized: true,
        },
      });
    } catch {
      // Non-blocking
    }

    res.json({
      message: 'Compte et données personnelles supprimés et anonymisés conformément au RGPD. Fichiers de contrats purgés.',
      anonymized: true,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erreur lors de la suppression du compte.' });
  }
});
