import { Router, Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import { getSupabase } from '../supabase';
import { requireTenantAuth, optionalTenantAuth, AuthenticatedRequest } from '../middleware/auth';
import { generateLeaseCode } from '../utils/codeGenerator';

export const leaseRouter = Router();

// Lazy initialization of Gemini client
let aiClient: GoogleGenAI | null = null;
function getAi(): GoogleGenAI {
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// 1. Extraire les informations d'un contrat via l'IA Gemini (Multi-Pages, Images & PDF)
// Accessible avec ou sans session active (optionalTenantAuth)
leaseRouter.post('/extract-contract', optionalTenantAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { imageBase64, mimeType, documentText, pages } = req.body;

    const rawPages: Array<{ dataUrl: string; mimeType?: string; name?: string }> = Array.isArray(pages) && pages.length > 0
      ? pages
      : imageBase64
      ? [{ dataUrl: imageBase64, mimeType: mimeType || 'image/jpeg', name: 'page-1.jpg' }]
      : [];

    if (rawPages.length === 0 && !documentText) {
      res.status(400).json({ error: 'Veuillez fournir au moins une page (photo ou PDF) ou le texte du contrat.' });
      return;
    }

    const prompt = `Tu es un expert juridique assermenté en analyse de contrats de bail locatif et d'états des lieux.
Analyse le document fourni (multi-pages ou PDF) et extrait avec la plus haute fidélité les informations clés pour créer une location vérifiable :

1. L'adresse complète exacte du logement loué (numéro, rue, appartement)
2. La ville (city)
3. Le code postal (postalCode)
4. Le pays (country - ex: España, France, etc.)
5. Le nom complet du bailleur / propriétaire ou agence (landlordName)
6. Le contact du bailleur (email ou téléphone si présent)
7. Le nom du locataire (tenantName)
8. Le montant exact du loyer mensuel en nombre entier (rent)
9. Le montant du dépôt de garantie / caution (deposit)
10. La devise (currency, ex: €)
11. La date de début de bail au format YYYY-MM ou YYYY-MM-DD (startDate)
12. La date de fin de bail au format YYYY-MM ou YYYY-MM-DD, ou "Actual" si bail en cours (endDate)
13. Le type de logement (propertyType : Studio, Appartement T2, Appartement T3, Maison, etc.)
14. Les scores de confiance estimés (entre 0.0 et 1.0) pour l'adresse, le loyer, les dates et le bailleur.`;

    let parts: any[] = [];

    for (let i = 0; i < rawPages.length; i++) {
      const page = rawPages[i];
      if (page.dataUrl) {
        const cleanBase64 = page.dataUrl.replace(/^data:[^;]+;base64,/, '');
        let pageMime = page.mimeType;
        if (!pageMime || pageMime === 'application/octet-stream') {
          if (page.dataUrl.startsWith('data:application/pdf') || page.name?.toLowerCase().endsWith('.pdf') || cleanBase64.startsWith('JVBERi')) {
            pageMime = 'application/pdf';
          } else if (page.dataUrl.startsWith('data:image/png') || page.name?.toLowerCase().endsWith('.png')) {
            pageMime = 'image/png';
          } else if (page.dataUrl.startsWith('data:image/webp') || page.name?.toLowerCase().endsWith('.webp')) {
            pageMime = 'image/webp';
          } else {
            pageMime = 'image/jpeg';
          }
        }
        parts.push({
          inlineData: {
            mimeType: pageMime,
            data: cleanBase64,
          },
        });
      }
    }

    if (documentText) {
      parts.push({ text: `Document text:\n${documentText}` });
    }

    parts.push({ text: prompt });

    const ai = getAi();
    const candidateModels = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
    let response: any = null;
    let lastError: any = null;

    const schemaConfig = {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          address: { type: Type.STRING, description: "Adresse complète du logement loué" },
          city: { type: Type.STRING, description: "Ville" },
          postalCode: { type: Type.STRING, description: "Code postal" },
          country: { type: Type.STRING, description: "Pays" },
          landlordName: { type: Type.STRING, description: "Nom complet du bailleur ou de l'agence" },
          landlordContact: { type: Type.STRING, description: "Email ou téléphone du propriétaire si trouvé" },
          tenantName: { type: Type.STRING, description: "Nom du locataire" },
          rent: { type: Type.INTEGER, description: "Montant du loyer mensuel" },
          deposit: { type: Type.INTEGER, description: "Montant du dépôt de garantie" },
          currency: { type: Type.STRING, description: "Symbole de devise" },
          startDate: { type: Type.STRING, description: "Date de début (YYYY-MM)" },
          endDate: { type: Type.STRING, description: "Date de fin (YYYY-MM ou Actual)" },
          propertyType: { type: Type.STRING, description: "Type de bien" },
          confidence: {
            type: Type.OBJECT,
            properties: {
              address: { type: Type.NUMBER },
              rent: { type: Type.NUMBER },
              dates: { type: Type.NUMBER },
              landlord: { type: Type.NUMBER },
              overall: { type: Type.NUMBER },
            },
          },
        },
        required: ["address", "landlordName", "startDate", "rent"],
      },
    };

    for (const modelName of candidateModels) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents: parts,
          config: schemaConfig,
        });
        if (response?.text) {
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[Gemini Extraction] Model ${modelName} failed, trying next candidate:`, err.message);
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error("Impossible d'obtenir une réponse de l'IA Gemini.");
    }

    const parsed = JSON.parse(response.text || '{}');
    const cleanStr = (val: any) => (!val || val === 'null' || val === 'undefined' || val === 'N/A' ? '' : String(val).trim());

    res.json({
      extracted: {
        address: cleanStr(parsed.address),
        city: cleanStr(parsed.city),
        postalCode: cleanStr(parsed.postalCode),
        country: cleanStr(parsed.country) || 'España',
        landlordName: cleanStr(parsed.landlordName),
        landlordContact: cleanStr(parsed.landlordContact),
        tenantName: cleanStr(parsed.tenantName) || req.tenant?.name || '',
        rent: Number(parsed.rent) || 0,
        deposit: Number(parsed.deposit) || 0,
        currency: cleanStr(parsed.currency) || '€',
        startDate: cleanStr(parsed.startDate),
        endDate: cleanStr(parsed.endDate) || 'Actual',
        propertyType: cleanStr(parsed.propertyType) || 'Appartement',
        confidence: parsed.confidence || {
          address: 0.9,
          rent: 0.9,
          dates: 0.85,
          landlord: 0.85,
          overall: 0.88,
        },
        pagesCount: rawPages.length || 1,
      },
    });
  } catch (err: any) {
    console.error('Erreur extraction contrat Gemini:', err);
    res.status(500).json({
      error: err?.message || "Une erreur est survenue lors de l'analyse du document par l'IA. Veuillez vérifier la lisibilité du fichier ou saisir les informations manuellement."
    });
  }
});

// Require authenticated tenant on all modifications & persistent lease endpoints
leaseRouter.use(requireTenantAuth);

// 2. Voir ses propres locations depuis Supabase (table leases)
leaseRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.tenant!.id;
    const supabase = getSupabase();

    const { data: leases, error } = await supabase
      .from('leases')
      .select(`
        id,
        code,
        address,
        city,
        postal_code,
        country,
        currency,
        property_type,
        rent,
        deposit,
        start_date,
        end_date,
        owner_name_guess,
        owner_contact,
        status,
        created_at,
        verifications (
          id,
          tenancy_confirmed,
          rent_paid_ok,
          property_maintained,
          would_recommend,
          comment,
          crypto_hash,
          confirmed_at
        )
      `)
      .eq('user_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message || 'Erreur lors du chargement des locations.' });
      return;
    }

    // Format for frontend
    const formattedLeases = (leases || []).map(l => {
      const verif = Array.isArray(l.verifications) ? l.verifications[0] : l.verifications;
      return {
        id: l.id,
        code: l.code,
        address: l.address,
        city: l.city,
        postalCode: l.postal_code,
        country: l.country,
        currency: l.currency || '€',
        propertyType: l.property_type || 'Appartement',
        rent: Number(l.rent) || 0,
        deposit: Number(l.deposit) || 0,
        startDate: l.start_date,
        endDate: l.end_date,
        ownerNameGuess: l.owner_name_guess,
        ownerContact: l.owner_contact,
        status: l.status,
        confidenceScore: 0.96,
        contractPagesCount: 1,
        createdAt: l.created_at,
        verification: verif ? {
          id: verif.id,
          tenancyConfirmed: verif.tenancy_confirmed,
          rentPaidOk: verif.rent_paid_ok,
          propertyMaintained: verif.property_maintained,
          wouldRecommend: verif.would_recommend,
          comment: verif.comment,
          cryptoHash: verif.crypto_hash,
          confirmedAt: verif.confirmed_at,
        } : null,
      };
    });

    res.json({ leases: formattedLeases });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erreur lors de la récupération des locations.' });
  }
});

// 3. Créer une nouvelle location dans Supabase (table leases + contracts + Storage upload)
leaseRouter.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.tenant!.id;
    const {
      address,
      city,
      postal_code,
      country,
      owner_name_guess,
      owner_contact,
      start_date,
      end_date,
      rent,
      deposit,
      property_type,
      pages,
      confidence_score,
    } = req.body;

    if (!address || !owner_name_guess || !start_date || !rent) {
      res.status(400).json({ error: 'Veuillez renseigner l’adresse, le propriétaire, la date de début et le loyer.' });
      return;
    }

    const supabase = getSupabase(req.supabaseToken);
    const code = generateLeaseCode();
    const rawPages = Array.isArray(pages) ? pages : [];

    // 1. Insert into public.leases using exact existing schema columns
    const newLeasePayload = {
      user_id: tenantId,
      code,
      address: String(address).trim(),
      city: city ? String(city).trim() : 'Madrid',
      postal_code: postal_code ? String(postal_code).trim() : null,
      country: country ? String(country).trim() : 'España',
      currency: '€',
      property_type: property_type ? String(property_type).trim() : 'Appartement',
      rent: Number(rent) || 0,
      deposit: Number(deposit) || 0,
      start_date: String(start_date).trim(),
      end_date: end_date ? String(end_date).trim() : 'Actual',
      owner_name_guess: String(owner_name_guess).trim(),
      owner_contact: owner_contact ? String(owner_contact).trim() : null,
      status: 'pending',
    };

    const { data: createdLease, error: leaseErr } = await supabase
      .from('leases')
      .insert(newLeasePayload)
      .select()
      .single();

    if (leaseErr || !createdLease) {
      res.status(400).json({ error: leaseErr?.message || 'Impossible d’enregistrer le bail dans Supabase.' });
      return;
    }

    const leaseId = createdLease.id;

    // 2. Upload contract files to Supabase Storage (bucket "contracts") & save in contracts table
    if (rawPages.length > 0) {
      for (let i = 0; i < rawPages.length; i++) {
        try {
          const page = rawPages[i];
          const dataUrl = page.dataUrl || '';
          if (dataUrl.includes('base64,')) {
            const parts = dataUrl.split(';base64,');
            const mimeType = parts[0].replace('data:', '') || 'image/jpeg';
            const base64Data = parts[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const ext = mimeType.includes('pdf') ? 'pdf' : 'jpg';
            const storagePath = `${tenantId}/${code}/contract_page_${i + 1}.${ext}`;

            // Upload to Supabase Storage "contracts" bucket
            const { error: uploadErr } = await supabase.storage
              .from('contracts')
              .upload(storagePath, buffer, {
                contentType: mimeType,
                upsert: true,
              });

            if (!uploadErr) {
              await supabase.from('contracts').insert({
                user_id: tenantId,
                lease_id: leaseId,
                file_path: storagePath,
                file_name: page.name || `page-${i + 1}.${ext}`,
                file_size_bytes: buffer.length,
                mime_type: mimeType,
                page_count: 1,
                status: 'uploaded',
              });
            }
          }
        } catch (storageErr) {
          console.warn('Storage upload error for page:', storageErr);
        }
      }
    }

    // 3. Update trust score in profiles & record in reputation_events using exact columns
    let currentTrustScore = 85;
    try {
      const { data: currentProfile } = await supabase
        .from('profiles')
        .select('trust_score')
        .eq('id', tenantId)
        .maybeSingle();
      if (currentProfile && typeof currentProfile.trust_score === 'number') {
        currentTrustScore = currentProfile.trust_score;
      }
    } catch {
      // Fallback to default
    }

    const scoreDelta = 5;
    const newTrustScore = Math.min(100, Math.max(40, currentTrustScore + scoreDelta));

    // Update profile trust_score
    try {
      await supabase
        .from('profiles')
        .update({
          trust_score: newTrustScore,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tenantId);
    } catch (errProfile) {
      console.warn('Profile trust_score update warning:', errProfile);
    }

    // Insert reputation event using exact columns:
    // event_type, score_delta, resulting_score, details, user_id, lease_id
    try {
      await supabase.from('reputation_events').insert({
        user_id: tenantId,
        lease_id: leaseId,
        event_type: 'lease_created',
        score_delta: scoreDelta,
        resulting_score: newTrustScore,
        details: {
          code,
          address: createdLease.address,
          description: `Ajout du bail ${code} (${createdLease.address})`,
        },
      });
    } catch (errRep) {
      console.warn('Reputation event insert warning:', errRep);
    }

    res.status(201).json({
      message: 'Location créée et contrat archivé avec succès dans Supabase.',
      lease: {
        id: createdLease.id,
        code: createdLease.code,
        address: createdLease.address,
        city: createdLease.city,
        postalCode: createdLease.postal_code,
        country: createdLease.country,
        currency: createdLease.currency || '€',
        propertyType: createdLease.property_type || 'Appartement',
        rent: createdLease.rent,
        deposit: createdLease.deposit,
        startDate: createdLease.start_date,
        endDate: createdLease.end_date,
        ownerNameGuess: createdLease.owner_name_guess,
        ownerContact: createdLease.owner_contact,
        status: createdLease.status,
        confidenceScore: Number(confidence_score) || 0.96,
        contractPagesCount: rawPages.length || 1,
        createdAt: createdLease.created_at,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erreur lors de la création de la location.' });
  }
});

// 4. Supprimer une location non-vérifiée (bloquée par trigger si status = 'verified')
leaseRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.tenant!.id;
    const { id } = req.params;
    const supabase = getSupabase();

    // Check lease
    const { data: lease, error: fetchErr } = await supabase
      .from('leases')
      .select('id, status')
      .eq('id', id)
      .eq('user_id', tenantId)
      .maybeSingle();

    if (!lease) {
      res.status(404).json({ error: 'Location introuvable.' });
      return;
    }

    if (lease.status === 'verified') {
      res.status(400).json({
        error: 'RENTIA_LOCK: Une location déjà certifiée par le propriétaire ne peut plus être supprimée.',
      });
      return;
    }

    const { error: deleteErr } = await supabase
      .from('leases')
      .delete()
      .eq('id', id)
      .eq('user_id', tenantId);

    if (deleteErr) {
      res.status(400).json({ error: deleteErr.message });
      return;
    }

    res.json({ message: 'Location supprimée avec succès.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erreur lors de la suppression de la location.' });
  }
});
