import { Request, Response, NextFunction } from 'express';
import { getSupabase } from '../supabase';

export interface AuthenticatedTenant {
  id: string;
  name: string;
  email: string;
  phone?: string;
  preferred_lang: string;
  avatar_url?: string;
}

export interface AuthenticatedRequest extends Request {
  tenant?: AuthenticatedTenant;
  supabaseToken?: string;
}

export async function requireTenantAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    let token: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (req.cookies && req.cookies.rentia_token) {
      token = req.cookies.rentia_token;
    }

    if (!token) {
      res.status(401).json({ error: 'Connexion requise pour accéder à cette ressource.' });
      return;
    }

    // Native Supabase Auth Token verification
    const supabase = getSupabase();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !userData?.user) {
      res.status(401).json({ error: 'Session invalide ou expirée.' });
      return;
    }

    const user = userData.user;
    const userId = user.id;
    const userEmail = user.email || '';
    const rawName = user.user_metadata?.name || user.user_metadata?.full_name || userEmail.split('@')[0] || 'Locataire Rentia';

    // Check or upsert profile in Supabase profiles table
    let { data: profile } = await supabase
      .from('profiles')
      .select('id, name, email, phone, preferred_lang, avatar_url')
      .eq('id', userId)
      .maybeSingle();

    if (!profile) {
      const newProfile = {
        id: userId,
        name: rawName,
        email: userEmail,
        phone: user.user_metadata?.phone || null,
        preferred_lang: user.user_metadata?.preferred_lang || 'es',
        avatar_url: user.user_metadata?.avatar_url || '',
      };

      await supabase.from('profiles').insert(newProfile);
      profile = newProfile;

      // Add initial reputation event for new user profile using exact schema columns
      try {
        await supabase.from('reputation_events').insert({
          user_id: userId,
          event_type: 'lease_created',
          score_delta: 0,
          resulting_score: 85,
          details: { description: 'Création et vérification du profil locataire' },
        });
      } catch (repErr) {
        console.warn('Initial reputation event warning in auth:', repErr);
      }
    }

    req.tenant = {
      id: userId,
      name: profile?.name || rawName,
      email: profile?.email || userEmail,
      phone: profile?.phone || undefined,
      preferred_lang: profile?.preferred_lang || 'es',
      avatar_url: profile?.avatar_url || '',
    };
    req.supabaseToken = token;
    next();
  } catch {
    res.status(401).json({ error: 'Session invalide ou expirée.' });
  }
}

export async function optionalTenantAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    let token: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (req.cookies && req.cookies.rentia_token) {
      token = req.cookies.rentia_token;
    }

    if (!token) {
      next();
      return;
    }

    // Native Supabase Auth verification
    const supabase = getSupabase();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (!userError && userData?.user) {
      const user = userData.user;
      const userId = user.id;
      const userEmail = user.email || '';
      const rawName = user.user_metadata?.name || user.user_metadata?.full_name || userEmail.split('@')[0] || 'Locataire';

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, name, email, phone, preferred_lang, avatar_url')
        .eq('id', userId)
        .maybeSingle();

      req.tenant = {
        id: userId,
        name: profile?.name || rawName,
        email: profile?.email || userEmail,
        phone: profile?.phone || undefined,
        preferred_lang: profile?.preferred_lang || 'es',
        avatar_url: profile?.avatar_url || '',
      };
      req.supabaseToken = token;
    }

    next();
  } catch {
    next();
  }
}


