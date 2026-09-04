import { Router, Request, Response } from 'express';
import { calculateMatchRanking, recordRentiaPointsEvent } from '../rankingEngine';
import { getSupabase } from '../supabase';

export const matchingRouter = Router();

/**
 * GET /api/matching/listings
 * Renvoie UNIQUEMENT les vrais logements actifs depuis Supabase (aucun faux fallback en dur)
 */
matchingRouter.get('/listings', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabase();
    const { data: listings, error } = await supabase
      .from('listings')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erreur Supabase get listings:', error);
      res.json([]);
      return;
    }

    res.json(listings || []);
  } catch (err: any) {
    console.error('Erreur get listings:', err);
    res.json([]);
  }
});

/**
 * POST /api/matching/listings
 * Permet à un propriétaire de créer une vraie annonce en base
 */
matchingRouter.post('/listings', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabase();
    const listingPayload = {
      ...req.body,
      is_active: true,
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('listings')
      .insert(listingPayload)
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json({ success: true, listing: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erreur création annonce.' });
  }
});

/**
 * GET /api/matching/candidates
 * Filtre STRICT & ÉQUITABLE :
 * - Aucune condition bloquante en base empêchant les profils vérifiés sans antécédent locatif d'être lus.
 * - Le filtrage logique retient tout locataire ayant au moins 1 location certifiée OU ayant complété la vérification de son profil / score de réputation (score >= 50 ou identité certifiée).
 * - Les comptes vides (brouillons sans vérification) sont éliminés.
 * - Respect strict de la confidentialité (prénom seul, tranche d'âge large, budget max, zéro donnée intime avant match).
 */
matchingRouter.get('/candidates', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabase();

    // On sélectionne les profils locataires actifs sans filtre SQL restrictif sur les baux
    const { data: tenants, error } = await supabase
      .from('tenants')
      .select('id, first_name, avatar_url, birth_year, max_budget, trust_score, on_time_payment_rate, verified_leases_count, is_verified, is_active')
      .limit(50);

    if (error || !tenants) {
      res.json([]);
      return;
    }

    // Filtrage logique : au moins une location vérifiée OU profil vérifié / réputation acquise
    const eligibleCandidates = tenants.filter((t: any) => {
      // Élimination des comptes sans prénom ou inactifs
      if (!t.first_name || t.first_name.trim().length === 0) return false;
      if (t.is_active === false) return false;

      const hasVerifiedLeases = (t.verified_leases_count || 0) >= 1;
      const hasVerifiedReputation = (t.trust_score || 0) >= 50 || t.is_verified === true;

      // Un profil avec identité vérifiée (score >= 50 ou is_verified: true) sans baux passés est VALIDE et inclus.
      // Un compte 100% vide sans vérification est exclu.
      return hasVerifiedLeases || hasVerifiedReputation;
    });

    // Sanitization stricte pour la vie privée
    const sanitizedCandidates = eligibleCandidates.map((t: any) => {
      let ageBracket = '25 - 35 ans';
      if (t.birth_year) {
        const age = new Date().getFullYear() - Number(t.birth_year);
        if (age < 25) ageBracket = '18 - 25 ans';
        else if (age <= 35) ageBracket = '25 - 35 ans';
        else if (age <= 45) ageBracket = '35 - 45 ans';
        else ageBracket = '45+ ans';
      }

      return {
        tenant_id: t.id,
        firstName: t.first_name,
        avatar_url: t.avatar_url || null,
        ageBracket,
        maxBudget: t.max_budget || 950,
        trustScore: t.trust_score || 70,
        onTimeRate: t.on_time_payment_rate || 100,
        verifiedLeasesCount: t.verified_leases_count || 0,
      };
    });

    res.json(sanitizedCandidates);
  } catch (err: any) {
    console.error('Erreur get candidates:', err);
    res.json([]);
  }
});

/**
 * POST /api/matching/swipe
 * Enregistre un swipe bilatéral et vérifie STRICTEMENT si l'autre partie a aussi mis un like
 * RÈGLE FONDAMENTALE : Aucun match sans double "like" réciproque vérifié en base.
 */
matchingRouter.post('/swipe', async (req: Request, res: Response) => {
  try {
    const { actorId, actorRole, listingId, targetUserId, action } = req.body;

    if (!actorId || !actorRole || !listingId || !targetUserId || !action) {
      res.status(400).json({ error: 'Paramètres de swipe incomplets.' });
      return;
    }

    const supabase = getSupabase();

    // 1. Enregistrer le swipe de l'utilisateur courant dans la table 'swipes'
    const { error: swipeError } = await supabase
      .from('swipes')
      .upsert({
        actor_id: actorId,
        actor_role: actorRole,
        listing_id: listingId,
        target_user_id: targetUserId,
        action: action,
      }, {
        onConflict: 'actor_id,listing_id,target_user_id'
      });

    if (swipeError) {
      console.warn('Note insertion swipe:', swipeError.message);
    }

    // 2. Si le swipe courant est un "pass", il ne peut pas y avoir de match
    if (action !== 'like') {
      res.json({
        success: true,
        action: 'pass',
        isMatch: false,
        matchId: null
      });
      return;
    }

    // 3. VÉRIFICATION STRICTE DE RÉCIPROCITÉ EN BASE DE DONNÉES :
    const oppositeRole = actorRole === 'tenant' ? 'landlord' : 'tenant';
    
    const { data: reciprocalSwipe } = await supabase
      .from('swipes')
      .select('id, action')
      .eq('actor_id', targetUserId)
      .eq('actor_role', oppositeRole)
      .eq('listing_id', listingId)
      .eq('target_user_id', actorId)
      .eq('action', 'like')
      .maybeSingle();

    const isReciprocalMatch = Boolean(reciprocalSwipe);

    let matchRecordId = null;

    // 4. Si et seulement si la réciprocité est prouvée en base, on crée l'enregistrement 'matches'
    if (isReciprocalMatch) {
      const tenantId = actorRole === 'tenant' ? actorId : targetUserId;
      const landlordId = actorRole === 'landlord' ? actorId : targetUserId;

      const { data: matchData } = await supabase
        .from('matches')
        .upsert({
          listing_id: listingId,
          tenant_id: tenantId,
          landlord_id: landlordId,
          status: 'active',
          landlord_first_message_sent: false,
        }, {
          onConflict: 'listing_id,tenant_id'
        })
        .select('id')
        .single();

      matchRecordId = matchData?.id || `match_${Date.now()}`;
    }

    res.json({
      success: true,
      action: 'like',
      isMatch: isReciprocalMatch,
      matchId: matchRecordId
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erreur lors de l\'enregistrement du swipe.' });
  }
});

/**
 * GET /api/matching/compatibility/:listingId/:tenantId
 * Calcule le score de compatibilité explicable et le classement via Supabase
 */
matchingRouter.get('/compatibility/:listingId/:tenantId', async (req: Request, res: Response) => {
  try {
    const { listingId, tenantId } = req.params;
    const result = await calculateMatchRanking(listingId, tenantId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erreur lors du calcul de compatibilité.' });
  }
});

/**
 * GET /api/matching/points/:userId
 * Récupère le récapitulatif des Rentia Points et l'historique des événements depuis Supabase
 */
matchingRouter.get('/points/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const supabase = getSupabase();

    const { data: events, error } = await supabase
      .from('rentia_points_events')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    const eventsList = events || [];
    const totalPoints = eventsList.reduce((sum, ev) => sum + (ev.points_delta || 0), 0);
    
    res.json({
      userId,
      totalPoints,
      eventsCount: eventsList.length,
      events: eventsList,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erreur lors de la récupération des points.' });
  }
});

/**
 * POST /api/matching/points/record
 * Enregistre une action donnant des Rentia Points avec protection anti-fraude sur Supabase
 */
matchingRouter.post('/points/record', async (req: Request, res: Response) => {
  try {
    const { userId, actionType, pointsDelta, metadata } = req.body;

    if (!userId || !actionType || pointsDelta === undefined) {
      res.status(400).json({ error: 'userId, actionType et pointsDelta sont requis.' });
      return;
    }

    const result = await recordRentiaPointsEvent(userId, actionType, pointsDelta, metadata);
    res.json({
      message: 'Points enregistrés avec succès.',
      ...result,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erreur lors de l\'enregistrement des points.' });
  }
});

/**
 * GET /api/matching/matches
 * Renvoie STRICTEMENT les matchs de l'utilisateur authentifié (sécurité RLS + auth backend)
 */
matchingRouter.get('/matches', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabase();
    
    // Récupération sécurisée du token utilisateur
    const authHeader = req.headers.authorization;
    let userId: string | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      const { data: userData } = await supabase.auth.getUser(token);
      if (userData?.user?.id) {
        userId = userData.user.id;
      }
    }

    if (!userId) {
      res.status(401).json({ error: 'Connexion requise pour consulter les matchs.' });
      return;
    }

    // Récupérer les matchs où l'utilisateur est soit tenant_id soit landlord_id
    const { data: matches, error } = await supabase
      .from('matches')
      .select(`
        id,
        listing_id,
        tenant_id,
        landlord_id,
        status,
        landlord_first_message_sent,
        compatibility_score,
        created_at,
        listings (
          id,
          title,
          city,
          neighborhood,
          rent,
          images,
          property_type
        ),
        tenant_profile:profiles!matches_tenant_id_fkey (
          id,
          name,
          avatar_url,
          trust_score
        ),
        landlord_profile:profiles!matches_landlord_id_fkey (
          id,
          name,
          avatar_url
        )
      `)
      .or(`tenant_id.eq.${userId},landlord_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) {
      // Fallback simple query si les relations de clés étrangères diffèrent
      const { data: fallbackMatches } = await supabase
        .from('matches')
        .select('*')
        .or(`tenant_id.eq.${userId},landlord_id.eq.${userId}`)
        .order('created_at', { ascending: false });
      
      res.json(fallbackMatches || []);
      return;
    }

    // Normalisation des données retournées
    const formattedMatches = (matches || []).map((m: any) => ({
      id: m.id,
      listing_id: m.listing_id,
      tenant_id: m.tenant_id,
      landlord_id: m.landlord_id,
      status: m.status,
      landlord_first_message_sent: m.landlord_first_message_sent,
      compatibility_score: m.compatibility_score,
      created_at: m.created_at,
      listing: m.listings || undefined,
      tenant: m.tenant_profile || undefined,
      landlord: m.landlord_profile || undefined,
    }));

    res.json(formattedMatches);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erreur lors de la récupération des matchs.' });
  }
});

/**
 * GET /api/matching/messages/:matchId
 * Récupère l'historique des messages d'un match
 * Sécurité : Vérifie que l'utilisateur connecté est bien l'un des 2 participants au match.
 */
matchingRouter.get('/messages/:matchId', async (req: Request, res: Response) => {
  try {
    const { matchId } = req.params;
    const supabase = getSupabase();

    // Authentification de la session
    const authHeader = req.headers.authorization;
    let userId: string | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      const { data: userData } = await supabase.auth.getUser(token);
      if (userData?.user?.id) {
        userId = userData.user.id;
      }
    }

    if (!userId) {
      res.status(401).json({ error: 'Connexion requise pour accéder aux messages.' });
      return;
    }

    // 1. Vérification d'accès : le match existe-t-il et l'utilisateur en fait-il partie ?
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('id, tenant_id, landlord_id, landlord_first_message_sent')
      .eq('id', matchId)
      .maybeSingle();

    if (matchError || !match) {
      res.status(404).json({ error: 'Match introuvable.' });
      return;
    }

    if (match.tenant_id !== userId && match.landlord_id !== userId) {
      res.status(403).json({ error: 'Accès interdit : vous ne faites pas partie de cette conversation.' });
      return;
    }

    // 2. Récupérer les messages
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('id, match_id, sender_id, content, read_at, created_at')
      .eq('match_id', matchId)
      .order('created_at', { ascending: true });

    if (msgError) {
      res.status(500).json({ error: msgError.message });
      return;
    }

    const formattedMessages = (messages || []).map((msg: any) => ({
      id: msg.id,
      match_id: msg.match_id,
      sender_id: msg.sender_id,
      sender_role: msg.sender_id === match.landlord_id ? 'landlord' : 'tenant',
      content: msg.content,
      created_at: msg.created_at,
      read_at: msg.read_at,
    }));

    res.json({
      matchId: match.id,
      landlord_first_message_sent: match.landlord_first_message_sent,
      isLandlord: userId === match.landlord_id,
      isTenant: userId === match.tenant_id,
      messages: formattedMessages,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erreur lors de la récupération des messages.' });
  }
});

/**
 * POST /api/matching/messages
 * Envoi d'un message avec APPLICATION STRICTE DE LA RÈGLE MÉTIER :
 * RÈGLE : Le propriétaire DOIT envoyer le tout premier message.
 * Le locataire NE PEUT PAS initier la conversation tant que `landlord_first_message_sent` est false.
 */
matchingRouter.post('/messages', async (req: Request, res: Response) => {
  try {
    const { matchId, content } = req.body;

    if (!matchId || !content || !content.trim()) {
      res.status(400).json({ error: 'Identifiant de match et contenu de message requis.' });
      return;
    }

    const supabase = getSupabase();

    // 1. Authentification STRICTE de l'expéditeur via la session (jamais via un champ body client)
    const authHeader = req.headers.authorization;
    let senderId: string | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      const { data: userData } = await supabase.auth.getUser(token);
      if (userData?.user?.id) {
        senderId = userData.user.id;
      }
    }

    if (!senderId) {
      res.status(401).json({ error: 'Connexion requise pour envoyer un message.' });
      return;
    }

    // 2. Récupérer le match en base de données
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('id, tenant_id, landlord_id, landlord_first_message_sent, status')
      .eq('id', matchId)
      .maybeSingle();

    if (matchError || !match) {
      res.status(404).json({ error: 'Match introuvable.' });
      return;
    }

    // 3. Sécurité : Vérifier que l'expéditeur fait partie du match
    const isLandlord = senderId === match.landlord_id;
    const isTenant = senderId === match.tenant_id;

    if (!isLandlord && !isTenant) {
      res.status(403).json({ error: 'Accès interdit : vous ne faites pas partie de ce match.' });
      return;
    }

    // 4. APPLICATION STRICTE DE LA RÈGLE MÉTIER :
    // Si le premier message du propriétaire n'a pas encore été envoyé ET que l'expéditeur est le locataire -> REFUS CATÉGORIQUE
    if (!match.landlord_first_message_sent && isTenant) {
      res.status(403).json({
        error: 'RÈGLE MÉTIER RENTIA : Le propriétaire doit obligatoirement envoyer le premier message pour initier la conversation. Le locataire ne peut que répondre.',
        code: 'LANDLORD_FIRST_MESSAGE_REQUIRED'
      });
      return;
    }

    // 5. Insertion du message dans la table Supabase `messages`
    const { data: insertedMessage, error: insertError } = await supabase
      .from('messages')
      .insert({
        match_id: matchId,
        sender_id: senderId,
        content: content.trim(),
      })
      .select('id, match_id, sender_id, content, created_at')
      .single();

    if (insertError) {
      res.status(500).json({ error: insertError.message });
      return;
    }

    // 6. Si c'est le propriétaire qui envoie son premier message, déverrouiller la conversation
    if (isLandlord && !match.landlord_first_message_sent) {
      await supabase
        .from('matches')
        .update({ landlord_first_message_sent: true })
        .eq('id', matchId);
    }

    res.json({
      success: true,
      message: {
        id: insertedMessage.id,
        match_id: insertedMessage.match_id,
        sender_id: insertedMessage.sender_id,
        sender_role: isLandlord ? 'landlord' : 'tenant',
        content: insertedMessage.content,
        created_at: insertedMessage.created_at,
      },
      landlord_first_message_sent: isLandlord ? true : match.landlord_first_message_sent,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erreur lors de l\'envoi du message.' });
  }
});
