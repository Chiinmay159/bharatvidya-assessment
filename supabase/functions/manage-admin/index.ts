// manage-admin — owner-gated provisioning of password-based admin accounts.
//
// The service-role key lives ONLY here (Supabase edge runtime), never in the
// browser. Every call is gated: the caller's JWT is verified and their
// admin_users role must be 'owner'. Actions:
//   provision     {email, role, organization_id?, password}
//                 → creates/updates the Supabase auth user with a password
//                   AND upserts the admin_users row (one step, from the app)
//   set_password  {email, password}    → reset a password
//   deprovision   {email}              → delete the auth user (full cleanup)
//
// CORS is restricted to the production origin.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const ALLOWED_ORIGIN = 'https://exams.matramedia.co.in'
const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  // ── Authenticate caller and require owner role ──
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Missing authorization' }, 401)

  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userData?.user?.email) return json({ error: 'Invalid session' }, 401)
  const callerEmail = userData.user.email.toLowerCase()

  // MFA enforcement (migration 027): this function authorizes via a direct
  // admin_users read rather than is_admin(), so it must apply the same aal2
  // bar itself. getUser() above already validated the token's signature —
  // this only reads a claim from that validated token.
  let aal = ''
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    aal = String(payload.aal ?? '')
  } catch { /* malformed payload → aal stays '', rejected below */ }
  if (aal !== 'aal2') return json({ error: 'MFA-verified session required' }, 403)

  const { data: callerRow } = await admin
    .from('admin_users').select('role, organization_id').eq('email', callerEmail).maybeSingle()
  if (!callerRow || callerRow.role !== 'owner') return json({ error: 'Owner role required' }, 403)
  const callerIsGlobal = callerRow.organization_id === null

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  const action = String(body.action ?? '')
  const email = String(body.email ?? '').trim().toLowerCase()
  if (!email) return json({ error: 'email required' }, 400)

  // Org owners may only manage within their own org
  function orgAllowed(targetOrg: string | null): boolean {
    return callerIsGlobal || targetOrg === callerRow!.organization_id
  }

  // Find an auth user id by email (admin list is fine at this scale)
  async function findUserId(mail: string): Promise<string | null> {
    let page = 1
    for (;;) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
      if (error || !data?.users?.length) return null
      const hit = data.users.find(u => (u.email ?? '').toLowerCase() === mail)
      if (hit) return hit.id
      if (data.users.length < 200) return null
      page++
      if (page > 50) return null
    }
  }

  try {
    if (action === 'provision') {
      const role = String(body.role ?? 'examiner')
      const organization_id = (body.organization_id as string | null) ?? null
      const password = String(body.password ?? '')
      if (!['owner', 'examiner', 'invigilator', 'viewer'].includes(role)) return json({ error: 'bad role' }, 400)
      if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400)
      if (!orgAllowed(organization_id)) return json({ error: 'Cannot provision outside your organisation' }, 403)

      // create-or-update the auth user with the password
      const existingId = await findUserId(email)
      if (existingId) {
        const { error } = await admin.auth.admin.updateUserById(existingId, { password, email_confirm: true })
        if (error) return json({ error: error.message }, 400)
      } else {
        const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
        if (error) return json({ error: error.message }, 400)
      }
      // upsert the admin_users row (service role bypasses RLS; we already gated owner)
      const { error: upErr } = await admin.from('admin_users')
        .upsert({ email, role, organization_id, created_by: callerEmail }, { onConflict: 'email' })
      if (upErr) return json({ error: upErr.message }, 400)
      return json({ ok: true, email })
    }

    if (action === 'set_password') {
      const password = String(body.password ?? '')
      if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400)
      // scope check against the target's existing admin_users row
      const { data: tgt } = await admin.from('admin_users').select('organization_id').eq('email', email).maybeSingle()
      if (!tgt) return json({ error: 'Not an admin account' }, 404)
      if (!orgAllowed(tgt.organization_id)) return json({ error: 'Out of scope' }, 403)
      const id = await findUserId(email)
      if (!id) return json({ error: 'No password account exists for this email' }, 404)
      const { error } = await admin.auth.admin.updateUserById(id, { password })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    if (action === 'deprovision') {
      if (email === callerEmail) return json({ error: 'Cannot remove yourself' }, 400)
      const { data: tgt } = await admin.from('admin_users').select('organization_id').eq('email', email).maybeSingle()
      if (tgt && !orgAllowed(tgt.organization_id)) return json({ error: 'Out of scope' }, 403)
      const id = await findUserId(email)
      if (id) await admin.auth.admin.deleteUser(id)           // remove auth user if any
      await admin.from('admin_users').delete().eq('email', email)  // remove admin grant
      return json({ ok: true })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500)
  }
})
