import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('VITE_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY saknas i miljövariablerna.');
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
