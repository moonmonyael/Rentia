import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Read Supabase credentials from environment or fallback to project configuration
const supabaseUrl = process.env.SUPABASE_URL || 'https://eysdligqudgeegtpkgsd.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5c2RsaWdxdWRnZWVndHBrZ3NkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4NTIwMTMsImV4cCI6MjEwMzQyODAxM30.fvZnX_quuWOYZ3EaRBThNG52qHbqWzuTcTULsvbQjJw';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(userToken?: string): SupabaseClient {
  if (userToken) {
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      },
    });
  }

  if (!supabaseInstance) {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase configuration missing (SUPABASE_URL and SUPABASE_ANON_KEY required)');
    }
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabaseInstance;
}

export const isSupabaseConfigured = (): boolean => {
  return Boolean(supabaseUrl && supabaseAnonKey);
};
