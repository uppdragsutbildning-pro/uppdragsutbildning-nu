import { supabaseAdmin } from './supabaseAdmin.js';

// Mottagare för avtalsmejl. Köparens mottagare är organisationens medlemmar som får skriva
// (owner, admin, buyer, inte viewer), med bokningens köpare som reserv. Lärosätets mottagare är
// dess aktiva användare, med providers.contact_email som reserv.

export async function getBuyerRecipients(orgId: string, fallbackUserId: string | null): Promise<string[]> {
  const { data: members } = await supabaseAdmin
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', orgId)
    .in('access_role', ['owner', 'admin', 'buyer']);
  const ids = new Set<string>((members ?? []).map(m => m.user_id as string));
  if (ids.size === 0 && fallbackUserId) ids.add(fallbackUserId);
  const emails: string[] = [];
  for (const id of ids) {
    const { data } = await supabaseAdmin.auth.admin.getUserById(id);
    if (data.user?.email) emails.push(data.user.email);
  }
  return [...new Set(emails)];
}

export async function getProviderEmails(providerId: string): Promise<string[]> {
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('email')
    .eq('provider_id', providerId)
    .eq('role', 'provider')
    .eq('is_active', true);
  const emails = (profiles ?? []).map(p => p.email).filter((e): e is string => !!e);
  if (emails.length > 0) return [...new Set(emails)];
  const { data: provider } = await supabaseAdmin.from('providers').select('contact_email').eq('id', providerId).single();
  return provider?.contact_email ? [provider.contact_email] : [];
}
