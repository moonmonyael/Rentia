import { createClient } from '@supabase/supabase-js';

// Supabase project configuration
export const SUPABASE_URL = 'https://eysdligqudgeegtpkgsd.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5c2RsaWdxdWRnZWVndHBrZ3NkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4NTIwMTMsImV4cCI6MjEwMzQyODAxM30.fvZnX_quuWOYZ3EaRBThNG52qHbqWzuTcTULsvbQjJw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
