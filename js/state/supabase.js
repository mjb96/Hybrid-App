// =============================================================================
// SUPABASE CLIENT — lazy initialisation so the module is safe to import in
// Node.js test environments that have no window.
// =============================================================================

const supabaseUrl = 'https://uzxvufzlaipdwuffxqyo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6eHZ1ZnpsYWlwZHd1ZmZ4cXlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MDE1MTYsImV4cCI6MjA5NjE3NzUxNn0.G26YRJzt4ndScofQvp4fi-G8MP-Fs2Ovn0e6Y9t4Dxg';

let _client = undefined; // undefined = not yet resolved; null = offline mode

export function getSupabaseClient() {
  if (_client !== undefined) return _client;
  try {
    if (typeof window !== 'undefined' && window.supabase && supabaseUrl.startsWith('http')) {
      _client = window.supabase.createClient(supabaseUrl, supabaseKey);
    } else {
      console.warn('Supabase global not found. App will run in offline mode.');
      _client = null;
    }
  } catch (e) {
    console.error('Critical Supabase initialization failure:', e);
    _client = null;
  }
  return _client;
}
