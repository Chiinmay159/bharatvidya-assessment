import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { formatDbError } from '../../lib/errors'
import { Spinner } from '../shared/Spinner'

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
    setBusy(true); setError(null); setNotice(null)
    const { error: err } = await supabase.from('admin_users').insert({
      email: newEmail.trim().toLowerCase(),
      role: newRole,
      organization_id: newOrg || null,
      created_by: userEmail,
    })
    setBusy(false)
    if (err) { setError(formatDbError(err, 'Could not add admin.')); return }
    setNotice(`${newEmail.trim()} added as ${newRole}. They can now sign in at /admin with Google.`)
    setNewEmail('')
    load()
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

  async function removeAdmin(admin) {
    if (!window.confirm(`Remove ${admin.email}? They will immediately lose admin access.`)) return
    setError(null)
    const { error: err } = await supabase.from('admin_users').delete().eq('id', admin.id)
    if (err) setError(formatDbError(err, 'Removal failed.'))
    else { setNotice(`${admin.email} removed.`); load() }
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
              <button type="submit" disabled={busy || !newEmail.trim()} className="btn btn-primary" style={{ padding: '9px 18px', flexShrink: 0 }}>
                {busy ? <Spinner size={14} /> : 'Add'}
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
              {ROLES.find(r => r.value === newRole)?.desc}. They sign in with Google using this email — no invitation needed.
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
