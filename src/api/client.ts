// Client-side API client connecting to Rentia backend + Supabase
import { PaymentRecord, ExtractedContractData } from '../types';
import { supabase } from '../lib/supabase';

const API_BASE = '/api';

export async function getAuthToken(): Promise<string | null> {
  try {
    const session = await supabase.auth.getSession();
    if (session.data?.session?.access_token) {
      return session.data.session.access_token;
    }
  } catch (err) {
    // Ignore session get errors
  }
  return localStorage.getItem('rentia_jwt_token');
}

export function setAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem('rentia_jwt_token', token);
  } else {
    localStorage.removeItem('rentia_jwt_token');
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Erreur (${res.status})`);
  }

  return data as T;
}

export const api = {
  // Auth endpoints (Supabase Auth)
  auth: {
    register: (payload: {
      name: string;
      email: string;
      password: string;
      phone?: string;
      preferred_lang?: string;
      privacy_policy_accepted: boolean;
    }) =>
      request<{ message: string; token: string; tenant: any }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    login: (email: string, password: string) =>
      request<{ message: string; token: string; tenant: any }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),

    logout: () =>
      request<{ message: string }>('/auth/logout', { method: 'POST' }),
  },

  // Tenant profile endpoints
  tenant: {
    getMe: () =>
      request<{ tenant: any }>('/tenant/me'),

    updateMe: (payload: { name: string; phone?: string; preferred_lang?: string; avatar_url?: string }) =>
      request<{ message: string; tenant: any }>('/tenant/me', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),

    exportData: () =>
      request<any>('/tenant/export-data'),

    deleteAccount: () =>
      request<{ message: string; anonymized?: boolean }>('/tenant/me', {
        method: 'DELETE',
      }),
  },

  // Lease endpoints
  leases: {
    extractContract: (payload: {
      imageBase64?: string;
      mimeType?: string;
      documentText?: string;
      pages?: Array<{ dataUrl: string; mimeType?: string; name?: string }>;
    }) =>
      request<{ extracted: ExtractedContractData }>('/leases/extract-contract', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    getLeases: () =>
      request<{ leases: any[] }>('/leases'),

    createLease: (payload: {
      address: string;
      city?: string;
      postal_code?: string;
      country?: string;
      owner_name_guess: string;
      owner_contact?: string;
      start_date: string;
      end_date?: string;
      rent: number;
      deposit?: number;
      property_type?: string;
      pages?: Array<{ dataUrl: string; mimeType?: string; name?: string }>;
      confidence_score?: number;
    }) =>
      request<{ message: string; lease: any }>('/leases', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    deleteLease: (id: string) =>
      request<{ message: string }>(`/leases/${id}`, {
        method: 'DELETE',
      }),
  },

  // Payment tracking endpoints
  payments: {
    getPayments: () =>
      request<{ payments: PaymentRecord[] }>('/payments'),

    addPayment: (payload: {
      leaseId: string;
      amount: number;
      dueDate?: string;
      paidDate?: string;
      status?: 'paid_on_time' | 'paid_late' | 'pending' | 'unpaid';
    }) =>
      request<{ message: string; payment: PaymentRecord }>('/payments', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },

  // Public landlord endpoints (Supabase RPCs: lookup_lease_by_code & confirm_lease_by_code)
  public: {
    lookupLeaseByCode: (code: string) =>
      request<{
        lease: {
          id: string;
          code: string;
          tenantName: string;
          address: string;
          city?: string;
          startDate: string;
          endDate: string;
          rent?: number;
          status: string;
          isAlreadyConfirmed: boolean;
        };
      }>(`/public/leases/${encodeURIComponent(code)}`),

    confirmLease: (
      code: string,
      payload: {
        tenancy_confirmed: 'yes' | 'no';
        rent_paid_ok: 'yes' | 'sometimes' | 'no';
        property_maintained: 'yes' | 'no';
        would_recommend: 'yes' | 'no';
        comment?: string;
        phone?: string;
      }
    ) =>
      request<{ message: string; status: string; cryptoHash: string; confirmedAt: string }>(
        `/public/leases/${encodeURIComponent(code)}/confirm`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      ),

    requestOtp: (code: string, phone: string) => {
      const cleanCode = (code || '').trim();
      const endpoint = cleanCode
        ? `/public/leases/${encodeURIComponent(cleanCode)}/request-otp`
        : `/public/request-otp`;
      return request<{ message: string; otpSent: boolean; demoCode?: string }>(
        endpoint,
        {
          method: 'POST',
          body: JSON.stringify({ phone, code: cleanCode }),
        }
      );
    },

    verifyOtp: (code: string, phone: string, otp: string) => {
      const cleanCode = (code || '').trim();
      const endpoint = cleanCode
        ? `/public/leases/${encodeURIComponent(cleanCode)}/verify-otp`
        : `/public/verify-otp`;
      return request<{ message: string; verified: boolean }>(
        endpoint,
        {
          method: 'POST',
          body: JSON.stringify({ phone, otp, code: cleanCode }),
        }
      );
    },
  },

  matching: {
    getCompatibility: (listingId: string, tenantId: string) =>
      request<{
        eligible: boolean;
        matchScore: number;
        reason?: string;
        breakdown: {
          compatibility: number;
          verification: number;
          activity: number;
          pointsBonus: number;
          totalRawPoints: number;
        };
      }>(`/matching/compatibility/${encodeURIComponent(listingId)}/${encodeURIComponent(tenantId)}`),

    getPoints: (userId: string) =>
      request<{
        userId: string;
        totalPoints: number;
        eventsCount: number;
        events: Array<{
          id: string;
          action_type: string;
          points_delta: number;
          metadata?: any;
          created_at: string;
        }>;
      }>(`/matching/points/${encodeURIComponent(userId)}`),

    recordPoints: (payload: {
      userId: string;
      actionType: 'LEASE_CONFIRMED' | 'IDENTITY_VERIFIED' | 'NOMINA_VERIFIED' | 'PROFILE_COMPLETED' | 'PAYMENT_RECORDED' | 'MAINTENANCE_RECORDED' | 'MATCH_INTERACTION';
      pointsDelta: number;
      metadata?: any;
    }) =>
      request<{ message: string; eventId: string; pointsDelta: number }>(`/matching/points/record`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    getListings: () =>
      request<any[]>(`/matching/listings`),

    createListing: (payload: any) =>
      request<{ success: boolean; listing: any }>(`/matching/listings`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    swipe: (payload: {
      actorId: string;
      actorRole: 'tenant' | 'landlord';
      listingId: string;
      targetUserId: string;
      action: 'like' | 'pass';
    }) =>
      request<{
        success: boolean;
        action: 'like' | 'pass';
        isMatch: boolean;
        matchId: string | null;
      }>(`/matching/swipe`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    getMatches: () =>
      request<any[]>(`/matching/matches`),

    getMessages: (matchId: string) =>
      request<{
        matchId: string;
        landlord_first_message_sent: boolean;
        isLandlord: boolean;
        isTenant: boolean;
        messages: any[];
      }>(`/matching/messages/${encodeURIComponent(matchId)}`),

    sendMessage: (payload: { matchId: string; content: string }) =>
      request<{
        success: boolean;
        message: any;
        landlord_first_message_sent: boolean;
      }>(`/matching/messages`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },
};
