import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { formatInTimeZone } from 'date-fns-tz'
import { Spinner } from '../shared/Spinner'

/**
 * BatchSelect — the exam code gate (route: /exam).
 *
 * Exams are unlisted by default: students enter the 6-character exam
 * code their institution shared (notice board / admit card), and the
 * matching exam appears. Batches marked `listed` (open events,
 * practice exams) are browsable below the gate.
 */
export function BatchSelect({ onSelectBatch }) {
  const [code,       setCode]       = useState('')
  const [found,      setFound]      = useState(null)   // batch from code lookup
  const [looking,    setLooking]    = useState(false)
  const [codeError,  setCodeError]  = useState(null)
  const [openBatches, setOpenBatches] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [orgs,       setOrgs]       = useState({})     // org id → { display_name, logo_url }

  useEffect(() => {
    let cancelled = false
    async function fetchListed() {
      const [{ data }, orgRes] = await Promise.all([
        supabase
          .from('batches')
          .select('id, name, scheduled_start, duration_minutes, status, questions_per_student, has_access_code, show_results, pass_percentage, max_attempts, organization_id, series_module_id, listed')
          .eq('listed', true)
          .in('status', ['scheduled', 'active'])
          .order('scheduled_start', { ascending: true }),
        supabase.from('organizations').select('id, name, display_name, logo_url'),
      ])
      if (cancelled) return
      setOpenBatches(data || [])
      if (orgRes.data) setOrgs(Object.fromEntries(orgRes.data.map(o => [o.id, o])))
      setLoading(false)
    }
    fetchListed()
    return () => { cancelled = true }
  }, [])

  async function handleCodeSubmit(e) {
    e.preventDefault()
    const c = code.trim().toUpperCase()
    if (c.length < 4) { setCodeError('Exam codes are at least 4 characters.'); return }
    setLooking(true)
    setCodeError(null)
    setFound(null)
    try {
      const { data, error } = await supabase.rpc('find_batch_by_code', { p_code: c })
      if (error) throw error
      const batch = Array.isArray(data) ? data[0] : data
      if (!batch) {
        setCodeError('No exam found for this code. Check the code with your institution and try again.')
      } else {
        setFound({ ...batch, enteredCode: c })
      }
    } catch {
      setCodeError('Could not look up the code. Check your connection and try again.')
    } finally {
      setLooking(false)
    }
  }

  // Attach institution branding to the batch handed up the flow
  function selectWithOrg(batch) {
    onSelectBatch({ ...batch, org: orgs[batch.organization_id] ?? null })
  }

  /* The first viewport is composed as a single frame: the carbon field is
     the top half, the ivory ground the bottom, and the code card rides the
     horizon. The card anchors to the hero's bottom edge with
     translateY(50%), so its centerline sits ON the 50vh seam by
     construction — at every viewport, even when the error line grows it.
     Everything sits on one center axis. */
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>

      {/* ── Upper half — carbon field ─────────────────────── */}
      <div style={{ background: 'var(--gradient-hero)', height: '50vh', minHeight: 360, display: 'flex', flexDirection: 'column', padding: '28px 24px 0', position: 'relative' }}>
        {/* Brand — centered on the frame's axis */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'rgba(251,247,238,.92)', fontSize: 17, letterSpacing: '-.2px' }}>
            Matra
          </span>
          <span style={{ fontWeight: 600, color: 'rgba(251,247,238,.5)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase' }}>
            Assessment Platform
          </span>
        </div>
        {/* Headline — optically centered in the carbon visible above the card */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', paddingBottom: 96 }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(36px, 5.5vw, 54px)', fontWeight: 600, fontFamily: 'var(--font-display)', color: '#FBF7EE', letterSpacing: '-.8px', lineHeight: 1.06, textWrap: 'balance' }}>
            Find your exam
          </h1>
          <p style={{ margin: '14px 0 0', fontSize: 'clamp(14px, 1.6vw, 17px)', color: 'rgba(251,247,238,.65)', lineHeight: 1.6, maxWidth: 460 }}>
            Enter the exam code shared by your college or institution.
          </p>
        </div>

        {/* Code gate — centerline on the seam by construction */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, transform: 'translateY(50%)', padding: '0 20px', display: 'flex', justifyContent: 'center', zIndex: 1 }}>
          <form onSubmit={handleCodeSubmit} className="card card-heritage" style={{ width: '100%', maxWidth: 520, padding: '28px 28px 24px', boxShadow: 'var(--shadow-xl)' }}>
            <label htmlFor="exam-code" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 10, textAlign: 'center' }}>
              Exam code
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                id="exam-code"
                type="text"
                value={code}
                onChange={e => { setCode(e.target.value.toUpperCase()); setCodeError(null) }}
                placeholder="K7NM4P"
                autoComplete="off"
                className="form-input"
                style={{ fontFamily: 'var(--font-mono)', letterSpacing: '.22em', fontSize: 24, fontWeight: 600, textTransform: 'uppercase', textAlign: 'center', padding: '14px 16px' }}
              />
              <button type="submit" disabled={looking || !code.trim()} className="btn btn-primary" style={{ padding: '14px 28px', fontSize: 15, flexShrink: 0 }}>
                {looking ? <Spinner size={15} /> : 'Find'}
              </button>
            </div>
            {codeError && (
              <p role="alert" style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--error)', lineHeight: 1.5, textAlign: 'center' }}>{codeError}</p>
            )}
          </form>
        </div>
      </div>

      {/* ── Body — lists flow below the framed viewport ───── */}
      <main id="main-content" tabIndex={-1} style={{ flex: 1, maxWidth: 560, width: '100%', margin: '0 auto', padding: '124px 20px 64px', outline: 'none' }}>

        {/* Found exam */}
        {found && (
          <div className="u-slide-up" style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-3)', margin: '0 0 10px' }}>
              Your exam
            </h2>
            <BatchCard batch={found} org={orgs[found.organization_id]} showOrg onSelect={() => selectWithOrg(found)} highlight />
          </div>
        )}

        {/* Open (listed) exams */}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-3)', padding: '20px 0' }}>
            <Spinner size={16} /><span style={{ fontSize: 13 }}>Checking for open exams…</span>
          </div>
        ) : openBatches.length > 0 && (
          <div className="u-fade-in">
            <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-3)', margin: '0 0 10px' }}>
              Open exams — no code needed
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {openBatches.map(batch => (
                <BatchCard
                  key={batch.id}
                  batch={batch}
                  org={orgs[batch.organization_id]}
                  showOrg={new Set(openBatches.map(b => b.organization_id).filter(Boolean)).size > 1}
                  onSelect={() => selectWithOrg(batch)}
                />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function BatchCard({ batch, org, showOrg, onSelect, highlight }) {
  const isLive = batch.status === 'active'
  const dateStr = formatInTimeZone(new Date(batch.scheduled_start), 'Asia/Kolkata', 'EEE, d MMM yyyy')
  const timeStr = formatInTimeZone(new Date(batch.scheduled_start), 'Asia/Kolkata', 'hh:mm a')

  return (
    <button
      className="batch-card"
      aria-label={`Select exam: ${batch.name}`}
      onClick={onSelect}
      style={{ padding: '18px 20px 16px', width: '100%', boxSizing: 'border-box', ...(highlight ? { borderColor: 'var(--accent)', boxShadow: 'var(--shadow-card-hover)' } : {}) }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          {(showOrg || highlight) && org && (
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--accent-deep)', marginBottom: 3 }}>
              {org.display_name ?? org.name}
            </div>
          )}
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-1)', marginBottom: 5, letterSpacing: '-.15px' }}>
            {batch.name}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '3px 8px' }}>
            <span>{dateStr} · {timeStr} IST</span>
            <Dot />
            <span>{batch.duration_minutes} min</span>
            {batch.questions_per_student && (
              <><Dot /><span>{batch.questions_per_student} questions</span></>
            )}
          </div>
        </div>
        <LiveBadge live={isLive} />
      </div>
    </button>
  )
}

function LiveBadge({ live }) {
  return (
    <span style={{
      flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 'var(--radius-md)',
      fontSize: 12, fontWeight: 600,
      background: live ? 'var(--success-lt)' : 'var(--accent-lt)',
      color: live ? 'var(--success)' : 'var(--accent-deep)',
      border: `1px solid ${live ? 'var(--success)' : 'var(--accent-md)'}`,
    }}>
      {live && (
        <span
          className="u-pulse-dot"
          style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }}
        />
      )}
      {live ? 'Live now' : 'Upcoming'}
    </span>
  )
}

function Dot() {
  return <span aria-hidden="true" style={{ color: 'var(--border-md)', fontSize: 10, lineHeight: 1 }}>●</span>
}
