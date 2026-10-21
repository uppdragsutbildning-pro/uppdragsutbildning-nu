import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as moduleSupabase } from './supabase';

const globalScope = globalThis as typeof globalThis & {
  __uppdragsutbildningSupabaseClient?: SupabaseClient;
};

const cachedSupabase = globalScope.__uppdragsutbildningSupabaseClient;

if (cachedSupabase && cachedSupabase !== moduleSupabase) {
  void cachedSupabase.auth.dispose();
}

export const supabase = moduleSupabase;

globalScope.__uppdragsutbildningSupabaseClient = supabase;
