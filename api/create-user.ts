export const config = { runtime: "edge" };

declare const process: { env: Record<string, string | undefined> };

export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://iswctazjdtirrzswqkor.supabase.co";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Service role key saknas" }), { status: 500 });
  }

  const { email, password, full_name, role, provider_id, phone } = await req.json();

  if (!email || !password || !full_name || !role) {
    return new Response(JSON.stringify({ error: "Obligatoriska fält saknas" }), { status: 400 });
  }

  // Step 1: Create auth user via Supabase Admin API
  const authRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
    }),
  });

  if (!authRes.ok) {
    const err = await authRes.json();
    return new Response(JSON.stringify({ error: err.message || "Kunde inte skapa auth-användare" }), { status: 400 });
  }

  const authData = await authRes.json();
  const userId = authData.id;

  // Step 2: Insert profile
  const profileRes = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Prefer": "return=minimal",
    },
    body: JSON.stringify({
      id: userId,
      email,
      full_name,
      role,
      provider_id: provider_id || null,
      phone: phone || null,
      is_active: true,
    }),
  });

  if (!profileRes.ok) {
    const err = await profileRes.json();
    // Auth user was created — clean up to avoid orphaned users
    await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: {
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
    });
    return new Response(JSON.stringify({ error: err.message || "Kunde inte skapa profil" }), { status: 400 });
  }

  return new Response(JSON.stringify({ success: true, userId }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
