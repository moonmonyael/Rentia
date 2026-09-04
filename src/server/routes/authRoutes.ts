import { Router, Request, Response } from 'express';
import { getSupabase } from '../supabase';
import { loginRateLimiter } from '../middleware/rateLimit';

export const authRouter = Router();

// 1. Inscription locataire via Supabase Auth (Register avec consentement RGPD explicite)
authRouter.post('/register', loginRateLimiter, async (req: Request, res: Response) => {
  try {
    const { name, email, password, phone, preferred_lang, privacy_policy_accepted } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ error: 'Le nom, l’adresse email et le mot de passe sont obligatoires.' });
      return;
    }

    // RGPD Art. 7: Consentement obligatoire, univoque et vérifiable
    if (privacy_policy_accepted !== true && privacy_policy_accepted !== 'true') {
      res.status(400).json({
        error: 'RGPD: Debe aceptar explícitamente la Política de Privacidad y el tratamiento de datos para crear una cuenta.',
      });
      return;
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanName = String(name).trim();
    const cleanPhone = phone ? String(phone).trim() : null;
    const lang = preferred_lang || 'es';
    const consentTimestamp = new Date().toISOString();

    if (password.length < 6) {
      res.status(400).json({ error: 'Le mot de passe doit comporter au moins 6 caractères.' });
      return;
    }

    const supabase = getSupabase();

    // Vérification stricte d'unicité du numéro de téléphone
    if (cleanPhone) {
      const normalizedPhone = cleanPhone.replace(/[\s\-\(\)\.]/g, '');
      const { data: existingPhoneProfile } = await supabase
        .from('profiles')
        .select('id, phone')
        .or(`phone.eq.${cleanPhone},phone.eq.${normalizedPhone}`)
        .maybeSingle();

      if (existingPhoneProfile) {
        const errorMsg = lang === 'fr' 
          ? 'Ce numéro est déjà associé à un autre compte.' 
          : lang === 'en' 
          ? 'This phone number is already associated with another account.' 
          : 'Este número de teléfono ya está asociado a otra cuenta.';
        res.status(400).json({ error: errorMsg, code: 'PHONE_ALREADY_EXISTS' });
        return;
      }
    }

    // Call Supabase Auth signUp
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          name: cleanName,
          phone: cleanPhone,
          preferred_lang: lang,
          privacy_policy_accepted_at: consentTimestamp,
          privacy_policy_version: '1.0',
        },
      },
    });

    if (authError) {
      res.status(400).json({ error: authError.message || 'Erreur lors de la création du compte Supabase.' });
      return;
    }

    const user = authData.user;
    if (!user) {
      res.status(400).json({ error: 'Compte non généré.' });
      return;
    }

    const userId = user.id;
    const sessionToken = authData.session?.access_token || '';

    // Create or update profile in public.profiles table with consent timestamps
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: userId,
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      preferred_lang: lang,
      country_code: 'ES',
      country_flag: '🇪🇸',
      avatar_url: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80`,
      privacy_policy_accepted_at: consentTimestamp,
      privacy_policy_version: '1.0',
      terms_accepted_at: consentTimestamp,
      updated_at: consentTimestamp,
    });

    if (profileError) {
      if (profileError.code === '23505' || profileError.message?.includes('phone') || profileError.message?.includes('idx_profiles_phone_unique')) {
        const errorMsg = lang === 'fr' 
          ? 'Ce numéro est déjà associé à un autre compte.' 
          : lang === 'en' 
          ? 'This phone number is already associated with another account.' 
          : 'Este número de teléfono ya está asociado a otra cuenta.';
        res.status(400).json({ error: errorMsg, code: 'PHONE_ALREADY_EXISTS' });
        return;
      }
      console.warn('Profile upsert warning:', profileError);
    }

    // Insert baseline reputation event using exact columns
    try {
      await supabase.from('reputation_events').insert({
        user_id: userId,
        event_type: 'lease_created',
        score_delta: 0,
        resulting_score: 85,
        details: { description: 'Création du profil locataire et activation du passeport (Consentement RGPD enregistré)' },
      });
    } catch (repErr) {
      console.warn('Initial reputation event warning:', repErr);
    }

    // Log consent in audit_logs
    try {
      await supabase.from('audit_logs').insert({
        user_id: userId,
        action: 'RGPD_CONSENT_GRANTED',
        resource_type: 'privacy_policy',
        resource_id: 'v1.0',
        metadata: {
          consent_timestamp: consentTimestamp,
          ip: req.ip,
          user_agent: req.headers['user-agent'],
        },
      });
    } catch {
      // Non-blocking audit log
    }

    res.status(201).json({
      message: 'Compte créé avec succès dans Supabase.',
      token: sessionToken,
      tenant: {
        id: userId,
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        preferred_lang: lang,
        avatar_url: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80`,
        privacy_policy_accepted_at: consentTimestamp,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Impossible de créer le compte. Veuillez réessayer.' });
  }
});

// 2. Connexion locataire via Supabase Auth (Login)
authRouter.post('/login', loginRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Veuillez saisir votre email et votre mot de passe.' });
      return;
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const supabase = getSupabase();

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (authError) {
      res.status(401).json({ error: authError.message || 'Identifiants Supabase incorrects.' });
      return;
    }

    const user = authData.user;
    const sessionToken = authData.session?.access_token || '';

    if (!user) {
      res.status(401).json({ error: 'Utilisateur introuvable.' });
      return;
    }

    // Fetch profile from public.profiles
    let { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      const fallbackName = user.user_metadata?.name || user.user_metadata?.full_name || cleanEmail.split('@')[0];
      const newProfile = {
        id: user.id,
        name: fallbackName,
        email: cleanEmail,
        phone: user.user_metadata?.phone || null,
        preferred_lang: user.user_metadata?.preferred_lang || 'es',
        avatar_url: '',
      };
      await supabase.from('profiles').insert(newProfile);
      profile = newProfile;
    }

    res.json({
      message: 'Connexion Supabase réussie.',
      token: sessionToken,
      tenant: {
        id: user.id,
        name: profile.name,
        email: profile.email || cleanEmail,
        phone: profile.phone,
        preferred_lang: profile.preferred_lang || 'es',
        avatar_url: profile.avatar_url,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erreur lors de la connexion. Veuillez réessayer.' });
  }
});

// 3. Déconnexion (Logout)
authRouter.post('/logout', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabase();
    await supabase.auth.signOut();
  } catch (err) {
    // Ignore signout errors
  }
  res.clearCookie('rentia_token');
  res.json({ message: 'Déconnexion effectuée.' });
});
