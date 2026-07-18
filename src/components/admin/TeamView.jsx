import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { formatDbError } from '../../lib/errors'
import { Spinner } from '../shared/Spinner'
import { MfaFactorsCard } from './MfaFactorsCard'

const ROLES = [
  { value: 'owner',       label: 'Owner',       desc: 'Everything, incl. managing this team and deleting data' },
  { value: 'examiner',    label: 'Examiner',    desc: 'Batches, question bank, papers, certificates, results' },
  { value: 'invigilator', label: 'Invigilator', desc: 'Mission control and monitoring during exams' },
  { value: 'viewer',      label: 'Viewer',      desc: 'Read-only access to results and analytics' },
]

/**
 * TeamView — organisations and admin accounts (multi-institution).
 *
 * Org model: an admin with an organisation set sees ONLY that org's
 * batches (enforced by RLS, not just UI). Admins with no organisation
 * are global. Only owners can manage this screen (RLS-enforced).
 */
export function TeamView({ userEmail }) {
  const [admins, setAdmins] = useState(null)
  const [orgs, setOrgs] = useState(null)
  const [myRole, setMyRole] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  // New admin form
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState('examiner')
  const [newOrg, setNewOrg] = useState('')
  const [newPass, setNewPass] = useState('')
  const [busy, setBusy] = useState(false)
  // New org form
  const [newOrgName, setNewOrgName] = useState('')

  const load = useCallback(async () => {
    const [a, o, r] = await Promise.all([
      supabase.from('admin_users').select('*').order('created_at'),
      supabase.from('organizations').select('*').order('name'),
      supabase.rpc('admin_role'),
    ])
    if (a.error) { setError(formatDbError(a.error, 'Failed to load team.')); return }
    setAdmins(a.data ?? [])
    setOrgs(o.data ?? [])
    setMyRole(r.data ?? null)
  }, [])

  useEffect(() => {
    const t = setTimeout(load, 0) // defer a tick (lint: no sync setState in effects)
    return () => clearTimeout(t)
  }, [load])

  const isOwner = myRole === 'owner'
  const orgName = (id) => orgs?.find(o => o.id === id)?.name ?? 'All organisations (global)'

  async function addAdmin(e) {
    e.preventDefault()
    if (!newEmail.trim()) return
    const mail = newEmail.trim().toLowerCase()
    setBusy(true); setError(null); setNotice(null)

    if (newPass) {
      // Password account: provision the auth user + admin row in one step
      if (newPass.length < 8) { setError('Password must be at least 8 characters.'); setBusy(false); return }
      const { data, error: err } = await supabase.functions.invoke('manage-admin', {
        body: { action: 'provision', email: mail, role: newRole, organization_id: newOrg || null, password: newPass },
      })
      setBusy(false)
      if (err || data?.error) { setError(data?.error || 'Could not create the account.'); return }
      setNotice(`${mail} added as ${newRole}. They can sign in at /admin with this email and password.`)
      setNewEmail(''); setNewPass('')
      load()
      return
    }

    // Google account: just the admin grant (they sign in with Google)
    const { error: err } = await supabase.from('admin_users').insert({
      email: mail, role: newRole, organization_id: newOrg || null, created_by: userEmail,
    })
    setBusy(false)
    if (err) { setError(formatDbError(err, 'Could not add admin.')); return }
    setNotice(`${mail} added as ${newRole}. They can sign in at /admin with Google.`)
    setNewEmail('')
    load()
  }

  async function setPassword(admin) {
    const pw = window.prompt(`Set a new password for ${admin.email} (min 8 chars):`, '')
    if (pw === null) return
    if (pw.length < 8) { setError('Password must be at least 8 characters.'); return }
    setError(null); setNotice(null)
    const { data, error: err } = await supabase.functions.invoke('manage-admin', {
      body: { action: 'provision', email: admin.email, role: admin.role, organization_id: admin.organization_id, password: pw },
    })
    if (err || data?.error) setError(data?.error || 'Could not set the password.')
    else setNotice(`Password set for ${admin.email}.`)
  }

  async function changeRole(admin, role) {
    setError(null)
    const { error: err } = await supabase.from('admin_users').update({ role }).eq('id', admin.id)
    if (err) setError(formatDbError(err, 'Role change failed.'))
    else load()
  }

  async function changeOrg(admin, orgId) {
    setError(null)
    const { error: err } = await supabase.from('admin_users').update({ organization_id: orgId || null }).eq('id', admin.id)
    if (err) setError(formatDbError(err, 'Organisation change failed.'))
    else load()
  }

  async function resetMfa(admin) {
    if (!window.confirm(
      `Reset two-factor authentication for ${admin.email}?\n\nAll their enrolled authenticators stop working and their sessions are signed out. They'll set up a fresh authenticator at next sign-in.`
    )) return
    setError(null); setNotice(null)
    const { data, error: err } = await supabase.functions.invoke('manage-admin', {
      body: { action: 'reset_mfa', email: admin.email },
    })
    if (err || data?.error) { setError(data?.error || 'Could not reset MFA.'); return }
    setNotice(data.removed === 0
      ? `${admin.email} had no authenticators enrolled — nothing to reset.`
      : `MFA reset for ${admin.email}. They'll enroll a new authenticator at next sign-in.`)
  }

  async function removeAdmin(admin) {
    if (!window.confirm(`Remove ${admin.email}? They will immediately lose admin access (and any password login is deleted).`)) return
    setError(null); setNotice(null)
    // deprovision cleans up the auth user (if any) AND the admin grant
    const { data, error: err } = await supabase.functions.invoke('manage-admin', {
      body: { action: 'deprovision', email: admin.email },
    })
    if (err || data?.error) {
      // Fallback: at least revoke the admin grant
      const { error: delErr } = await supabase.from('admin_users').delete().eq('id', admin.id)
      if (delErr) { setError(data?.error || formatDbError(delErr, 'Removal failed.')); return }
    }
    setNotice(`${admin.email} removed.`); load()
  }

  async function addOrg(e) {
    e.preventDefault()
    if (!newOrgName.trim()) return
    setError(null)
    const { error: err } = await supabase.from('organizations').insert({ name: newOrgName.trim() })
    if (err) { setError(formatDbError(err, 'Could not create organisation.')); return }
    setNewOrgName('')
    load()
  }

  if (!admins && !error) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={26} color="var(--accent)" /></div>
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>Organisation &amp; Team</h2>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-3)' }}>
        Institutions and the people who can administer their exams. Access changes take effect immediately — no deploy needed.
      </p>

      {notice && <Banner kind="success">{notice}</Banner>}
      {error && <Banner kind="error">{error}</Banner>}
      {!isOwner && (
        <Banner kind="warn">You are signed in as <strong>{myRole}</strong> — this screen is read-only. Only owners can manage the team.</Banner>
      )}

      {/* ── Your own authenticators (any role) ── */}
      <MfaFactorsCard />

      {/* ── Organisations ── */}
      <section style={{ marginBottom: 28 }}>
        <h3 style={sectionHead}>Organisations</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {orgs?.map(o => (
            <span key={o.id} style={{ padding: '6px 14px', borderRadius: 'var(--radius-pill)', fontSize: 13, fontWeight: 600, background: 'var(--accent-lt)', color: 'var(--accent-deep)', border: '1px solid var(--accent-md)' }}>
              {o.name}
            </span>
          ))}
        </div>
        {isOwner && (
          <form onSubmit={addOrg} style={{ display: 'flex', gap: 8, maxWidth: 420 }}>
            <input
              value={newOrgName} onChange={e => setNewOrgName(e.target.value)}
              placeholder="New institution name (e.g. BORI)" aria-label="New organisation name"
              style={input}
            />
            <button type="submit" disabled={!newOrgName.trim()} className="btn btn-secondary" style={{ padding: '9px 16px', flexShrink: 0 }}>
              Add
            </button>
          </form>
        )}
        <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
          Assign batches to an institution when creating/editing them. Admins scoped to an institution see only its batches.
        </p>
      </section>

      {/* ── Team ── */}
      <section>
        <h3 style={sectionHead}>Admin accounts</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {admins?.map(a => {
            const isSelf = a.email === userEmail
            return (
              <div key={a.id} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
                    {a.email} {isSelf && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>(you)</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{orgName(a.organization_id)}</div>
                </div>
                {isOwner && !isSelf ? (
                  <>
                    <select value={a.role} onChange={e => changeRole(a, e.target.value)} aria-label={`Role for ${a.email}`} style={{ ...input, width: 'auto', flexShrink: 0 }}>
                      {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    <select value={a.organization_id ?? ''} onChange={e => changeOrg(a, e.target.value)} aria-label={`Organisation for ${a.email}`} style={{ ...input, width: 'auto', flexShrink: 0 }}>
                      <option value="">Global (all orgs)</option>
                      {orgs?.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                    <button onClick={() => setPassword(a)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 12, flexShrink: 0 }} title="Create or reset a password for this account">
                      Set password
                    </button>
                    <button onClick={() => resetMfa(a)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 12, flexShrink: 0 }} title="Remove their authenticators so they can enroll again — for lost phones">
                      Reset MFA
                    </button>
                    <button onClick={() => removeAdmin(a)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 12, color: 'var(--error)', flexShrink: 0 }}>
                      Remove
                    </button>
                  </>
                ) : (
                  <span style={{ padding: '4px 12px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 700, background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)', flexShrink: 0 }}>
                    {ROLES.find(r => r.value === a.role)?.label ?? a.role}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {isOwner && (
          <form onSubmit={addAdmin} className="card" style={{ padding: '18px 20px', maxWidth: 640 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>Add admin</h4>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <input
                type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                placeholder="person@example.com" aria-label="New admin email" required
                style={{ ...input, flex: '2 1 200px' }}
              />
              <select value={newRole} onChange={e => setNewRole(e.target.value)} aria-label="New admin role" style={{ ...input, flex: '1 1 120px' }}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <select value={newOrg} onChange={e => setNewOrg(e.target.value)} aria-label="New admin organisation" style={{ ...input, flex: '1 1 150px' }}>
                <option value="">Global (all orgs)</option>
                {orgs?.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
              <input
                type="text" value={newPass} onChange={e => setNewPass(e.target.value)}
                placeholder="Password (optional — leave blank for Google sign-in)" aria-label="Password for this admin"
                autoComplete="new-password"
                style={{ ...input, flex: '2 1 280px' }}
              />
              <button type="submit" disabled={busy || !newEmail.trim()} className="btn btn-primary" style={{ padding: '9px 18px', flexShrink: 0 }}>
                {busy ? <Spinner size={14} /> : 'Add admin'}
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
              {ROLES.find(r => r.value === newRole)?.desc}.
              {' '}Leave password blank if they'll sign in with Google; set a password (min 8 chars) for institutions not on Google — created instantly, no dashboard needed.
            </p>
          </form>
        )}
      </section>
    </div>
  )
}

function Banner({ kind, children }) {
  const styles = {
    success: { background: 'var(--success-lt)', color: 'var(--success)' },
    error:   { background: 'var(--error-lt)',   color: 'var(--error)' },
    warn:    { background: 'var(--warn-lt)',    color: 'var(--warn)' },
  }
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} style={{ padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 14, border: '1px solid var(--border)', ...styles[kind] }}>
      {children}
    </div>
  )
}

const sectionHead = { margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }
const input = {
  padding: '9px 12px', fontSize: 13, border: '1px solid var(--border-md)',
  borderRadius: 'var(--radius-sm)', background: 'var(--surface)', color: 'var(--text-1)',
  fontFamily: 'inherit', boxSizing: 'border-box',
}
