import { supabase } from './supabase';
import type { Database } from './database.types';

export type Marketplace = Database['public']['Tables']['marketplaces']['Row'];
export type MarketplaceInsert = Database['public']['Tables']['marketplaces']['Insert'];
export type MarketplaceUpdate = Database['public']['Tables']['marketplaces']['Update'];
export type MarketplaceBranding = Database['public']['Tables']['marketplace_branding']['Row'];
export type MarketplaceBrandingUpsert = Database['public']['Tables']['marketplace_branding']['Insert'];
export type PartnerOrganization = Database['public']['Tables']['partner_organizations']['Row'];
export type PartnerOrganizationInsert = Database['public']['Tables']['partner_organizations']['Insert'];
export type MarketplaceTraining = Database['public']['Tables']['marketplace_trainings']['Row'];

export type MarketplaceType = 'open' | 'provider_storefront' | 'partner_curated';
export type MarketplaceStatus = 'draft' | 'active' | 'paused';
export type MarketplaceAccessMode = 'open' | 'gated' | 'mixed';

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug) && slug.length >= 2 && slug.length <= 63;
}

export async function isSlugTaken(slug: string, excludeId?: string): Promise<boolean> {
  let query = supabase.from('marketplaces').select('id').eq('slug', slug);
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function getCuratedTrainingCount(marketplaceId: string): Promise<number> {
  const { count, error } = await supabase
    .from('marketplace_trainings')
    .select('id', { count: 'exact', head: true })
    .eq('marketplace_id', marketplaceId)
    .is('removed_at', null);
  if (error) throw error;
  return count ?? 0;
}

export async function getProviderStorefrontTrainingCount(providerId: string): Promise<number> {
  const { count, error } = await supabase
    .from('trainings')
    .select('id', { count: 'exact', head: true })
    .eq('provider_id', providerId)
    .eq('is_active', true);
  if (error) throw error;
  return count ?? 0;
}
