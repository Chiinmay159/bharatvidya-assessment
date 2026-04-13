import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { logAuditEvent } from '../../lib/auditLog'
import { generateCsv, downloadCsv } from '../../lib/csv'
import { formatInTimeZone } from 'date-fns-tz'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

/* ── Column definitions for configurable export (3.6) ─── */
const BASE_COLUMNS = [
  { key: 'roll_number',    label: 'Roll Number',     default: true },
  { key: 'student_name',   label: 'Name',             default: true },
  { key: 'email',          label: 'Email',            default: true },
  { key: 'score',          label: 'Score',            default: true },
  { key: 'total_questions',label: 'Total',            default: true },
  { key: 'percentage',     label: 'Percentage',       default: true },
  { key: 'time_taken_mins',label: 'Time (min)',       default: true },
  { key: 'submitted_at',   label: 'Submitted At',     default: true },
  { key: 'tab_switches',   label: 'Tab Switches',     default: false },
  { key: 'per_question',   label: 'Per-question data', default: false },
]

function loadExportConfig() {
  try {
    const s = localStorage.getItem('bv_export_cols')
    return s ? JSON.parse(s) : null
  } catch { return null }
}

function saveExportConfig(config) {
  localStorage.setItem('bv_export_cols', JSON.stringify(config))
}

export function ResultsView({ batch, onBack }) {
  const [attempts,     setAttempts]     = useState([])
  const [questions,    setQuestions]    = useState([])
  const [responses,    setResponses]    = useState([])
  const [tabSwitches,  setTabSwitches]  = useState({})   // { attemptId: count }
  const [loading,      setLoading]      = useState(true)
  const [sortKey,      setSortKey]      = useState('score')
  const [sortDir,      setSortDir]      = useState('desc')

  // Action states
  const [confirmDelete,   setConfirmDelete]   = useState(null)
  const [confirmReset,    setConfirmReset]    = useState(false)
  const [resetNameInput,  setResetNameInput]  = useState('')   // 3.5 double-confirm
  const [actionLoading,   setActionLoading]   = useState(false)
  const [actionError,     setActionError]     = useState(null)

  // UI panel states
  const [showAnalytics,   setShowAnalytics]   = useState(false)   // 2.3
  const [showExportConfig,setShowExportConfig] = useState(false)  // 3.6
  const [exportCols,      setExportCols]      = useState(() => {
    const saved = loadExportConfig()
    if (saved) return saved
    return Object.fromEntries(BASE_COLUMNS.map(c => [c.key, c.default]))
  })

  // Email results state (2.4)
  const [emailConfirm,  setEmailConfirm]  = useState(false)
  const [emailing,      setEmailing]      = useState(false)
  const [emailMsg,      setEmailMsg]      = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [ar, qr] = await Promise.all([
      supabase.from('attempts')
        .select('*')
        .eq('batch_id', batch.id)
        .not('submitted_at', 'is', null)
        .order('submitted_at', { ascending: false }),
      supabase.from('questions')
        .select('id, question_text, sort_order, correct_answer')
        .eq('batch_id', batch.id)
        .order('sort_order'),
    ])
    const att = ar.data || [], qs = qr.data || []
    setAttempts(att); setQuestions(qs)

    if (att.length) {
      const attIds = att.map(a => a.id)
      const [respR, tsR] = await Promise.all([
        supabase.from('responses')
          .select('attempt_id, question_id, selected_answer, is_correct')
          .in('attempt_id', attIds),
        supabase.from('tab_switches')
          .select('attempt_id')
          .in('attempt_id', attIds),
      ])
      setResponses(respR.data || [])
      // Count tab switches per attempt
      const ts = {}
      ;(tsR.data || []).forEach(r => { ts[r.attempt_id] = (ts[r.attempt_id] || 0) + 1 })
      setTabSwitches(ts)
    } else {
      setResponses([]); setTabSwitches({})
    }
    setLoading(false)
  }, [batch.id])

  useEffect(() => { fetchAll() }, [fetchAll])

  /* ── Delete single attempt ───────────────────────────── */
  async function handleDeleteAttempt() {
    if (!confirmDelete) return
    setActionLoading(true); setActionError(null)
    try {
      const { error } = await supabase.from('attempts').delete().eq('id', confirmDelete.id)
      if (error) throw error
      await logAuditEvent({
        action: 'attempt_deleted', entity: 'attempt', entityId: confirmDelete.id,
        details: { batch_name: batch.name, roll_number: confirmDelete.roll_number },
      })
      setConfirmDelete(null)
      await fetchAll()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  /* ── Reset all attempts (3.5: requires typing batch name) ── */
  async function handleResetBatch() {
    setActionLoading(true); setActionError(null)
    try {
      const { error } = await supabase.from('attempts').delete().eq('batch_id', batch.id)
      if (error) throw error
      await logAuditEvent({
        action: 'batch_reset', entity: 'batch', entityId: batch.id,
        details: { batch_name: batch.name },
      })
      setConfirmReset(false); setResetNameInput('')
      await fetchAll()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  /* ── Email results (2.4) ─────────────────────────────── */
  async function handleEmailResults() {
    setEmailing(true); setEmailMsg(null)
    try {
      const { data, error } = await supabase.functions.invoke('email-results', {
        body: { batch_id: batch.id },
      })
      if (error) throw error
      setEmailMsg(`Sent to ${data.sent} students.${data.errors?.length ? ` ${data.errors.length} failed.` : ''}`)
    } catch (err) {
      setEmailMsg('Email sending failed: ' + (err.message || 'Unknown error'))
    } finally {
      setEmailing(false)
      setEmailConfirm(false)
    }
  }

  /* ── Print results (2.5) ─────────────────────────────── */
  function handlePrint() {
    window.print()
    logAuditEvent({ action: 'results_exported', entity: 'batch', entityId: batch.id, details: { format: 'print' } })
  }

  /* ── Sort ────────────────────────────────────────────── */
  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = [...attempts].sort((a, b) => {
    let va = sortKey === 'percentage' ? (a.total_questions ? a.score / a.total_questions : 0) : a[sortKey]
    let vb = sortKey === 'percentage' ? (b.total_questions ? b.score / b.total_questions : 0) : b[sortKey]
    if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    return sortDir === 'asc' ? va - vb : vb - va
  })

  /* ── Export CSV (3.6: configurable columns) ──────────── */
  function handleExport() {
    const rm = {}
    responses.forEach(r => { if (!rm[r.attempt_id]) rm[r.attempt_id] = {}; rm[r.attempt_id][r.question_id] = r })
    const perQ = exportCols.per_question
    const qf = perQ ? questions.flatMap(q => [`q_${q.sort_order}_text`, `q_${q.sort_order}_answer`, `q_${q.sort_order}_correct`]) : []

    const fields = BASE_COLUMNS
      .filter(c => c.key !== 'per_question' && c.key !== 'tab_switches' && exportCols[c.key])
      .map(c => c.key)
    if (exportCols.tab_switches) fields.push('tab_switches')
    if (perQ) fields.push(...qf)

    const rows = attempts.map(a => {
      const row = {}
      if (exportCols.roll_number)     row.roll_number     = a.roll_number
      if (exportCols.student_name)    row.student_name    = a.student_name
      if (exportCols.email)           row.email           = a.email || ''
      if (exportCols.score)           row.score           = a.score ?? ''
      if (exportCols.total_questions) row.total_questions = a.total_questions ?? ''
      if (exportCols.percentage)      row.percentage      = a.total_questions ? ((a.score / a.total_questions) * 100).toFixed(1) : ''
      if (exportCols.time_taken_mins) row.time_taken_mins = a.submitted_at && a.started_at
        ? Math.round((new Date(a.submitted_at) - new Date(a.started_at)) / 60000) : ''
      if (exportCols.submitted_at)    row.submitted_at    = a.submitted_at
        ? formatInTimeZone(new Date(a.submitted_at), 'Asia/Kolkata', 'dd/MM/yyyy HH:mm:ss') : ''
      if (exportCols.tab_switches)    row.tab_switches    = tabSwitches[a.id] || 0
      if (perQ) {
        questions.forEach(q => {
          const r = rm[a.id]?.[q.id]
          row[`q_${q.sort_order}_text`]    = q.question_text.slice(0, 80)
          row[`q_${q.sort_order}_answer`]  = r ? r.selected_answer : ''
          row[`q_${q.sort_order}_correct`] = r ? (r.is_correct ? 'TRUE' : 'FALSE') : ''
        })
      }
      return row
    })

    downloadCsv(generateCsv(rows, fields), `${batch.name.replace(/\s+/g, '_')}_results.csv`)
    logAuditEvent({ action: 'results_exported', entity: 'batch', entityId: batch.id, details: { format: 'csv' } })
  }

  /* ── Summary stats ───────────────────────────────────── */
  const pctList = attempts
    .filter(a => a.total_questions)
    .map(a => (a.score / a.total_questions) * 100)
  const avg     = pctList.length ? (pctList.reduce((s, v) => s + v, 0) / pctList.length).toFixed(1) : null
  const highest = pctList.length ? Math.max(...pctList).toFixed(1) : null
  const sortedPcts = [...pctList].sort((a, b) => a - b)
  const median = sortedPcts.length
    ? sortedPcts.length % 2 === 0
      ? ((sortedPcts[sortedPcts.length / 2 - 1] + sortedPcts[sortedPcts.length / 2]) / 2).toFixed(1)
      : sortedPcts[Math.floor(sortedPcts.length / 2)].toFixed(1)
    : null
  const stddev = pctList.length && avg
    ? Math.sqrt(pctList.reduce((s, v) => s + Math.pow(v - parseFloat(avg), 2), 0) / pctList.length).toFixed(1)
    : null

  /* ── 2.3 Analytics data ──────────────────────────────── */
  const histogram = Array.from({ length: 10 }, (_, i) => {
    const lo = i * 10, hi = lo + 10
    return {
      range: `${lo}–${hi}%`,
      count: pctList.filter(p => p >= lo && (i === 9 ? p <= hi : p < hi)).length,
    }
  })

  // Per-question correctness rates
  const qStats = questions.map(q => {
    const qResps = responses.filter(r => r.question_id === q.id)
    const correct = qResps.filter(r => r.is_correct).length
    const pct = qResps.length ? Math.round((correct / qResps.length) * 100) : null
    return { id: q.id, text: q.question_text.slice(0, 60), pct, attempts: qResps.length }
  }).filter(q => q.pct !== null)

  const hardest = [...qStats].sort((a, b) => a.pct - b.pct).slice(0, 5)
  const easiest = [...qStats].sort((a, b) => b.pct - a.pct).slice(0, 5)

  const avgTime = attempts.length
    ? Math.round(
        attempts
          .filter(a => a.submitted_at && a.started_at)
          .reduce((s, a) => s + (new Date(a.submitted_at) - new Date(a.started_at)) / 60000, 0)
        / attempts.filter(a => a.submitted_at && a.started_at).length
      )
    : null

  const emailableCount = attempts.filter(a => a.email).length

  return (
    <div>
      {/* 2.5 Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-header { display: block !important; margin-bottom: 16px; }
          body { font-size: 12px; }
          .card { box-shadow: none !important; border: 1px solid #ccc !important; }
          table { font-size: 11px; }
          header, nav { display: none !important; }
        }
        @media screen {
          .print-header { display: none; }
        }
      `}</style>

      {/* Print-only header */}
      <div className="print-header">
        <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>BharatVidya Exams — Results</h2>
        <p style={{ margin: '0 0 4px' }}><strong>Batch:</strong> {batch.name}</p>
        <p style={{ margin: '0 0 4px' }}><strong>Submissions:</strong> {attempts.length} · <strong>Generated:</strong> {new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
      </div>

      <button onClick={onBack} style={backBtn} className="no-print">← Back to batches</button>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }} className="no-print">
        <div>
          <h2 style={{ margin: '0 0 3px', fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>
            {batch.name} — Results
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)' }}>{attempts.length} submissions</p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={handlePrint} disabled={!attempts.length} style={{ ...btnSecondary, opacity: attempts.length ? 1 : .4 }}>
            ⎙ Print
          </button>
          <button onClick={() => setEmailConfirm(true)} disabled={!emailableCount || loading} style={{ ...btnSecondary, opacity: emailableCount ? 1 : .4 }}>
            ✉ Email Results ({emailableCount})
          </button>
          <button onClick={() => setShowExportConfig(true)} style={btnSecondary}>
            ⚙ Export Options
          </button>
          <button onClick={handleExport} disabled={!attempts.length} style={{ ...btnSecondary, opacity: attempts.length ? 1 : .4 }}>
            ↓ Download CSV
          </button>
          <button onClick={() => setConfirmReset(true)} disabled={loading} style={{ ...btnDanger, opacity: loading ? .4 : 1 }}>
            ↺ Reset all
          </button>
        </div>
      </div>

      {emailMsg && (
        <div style={{ background: 'var(--success-lt)', border: '1px solid #A7F3D0', borderRadius: 8, padding: '10px 14px', color: 'var(--success)', fontSize: 13, marginBottom: 16 }} className="no-print">
          {emailMsg}
        </div>
      )}
      {actionError && (
        <div style={{ background: 'var(--error-lt)', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: 'var(--error)', fontSize: 13, marginBottom: 16 }}>
          {actionError}
        </div>
      )}

      {loading && <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>Loading results…</div>}

      {!loading && attempts.length === 0 && (
        <div className="card" style={{ padding: '48px 32px', textAlign: 'center' }}>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 14 }}>No submissions yet.</p>
        </div>
      )}

      {!loading && attempts.length > 0 && (
        <>
          {/* Summary bar */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <StatCard label="Submissions" value={attempts.length} />
            {avg    !== null && <StatCard label="Class average"  value={`${avg}%`} />}
            {median !== null && <StatCard label="Median"         value={`${median}%`} />}
            {stddev !== null && <StatCard label="Std deviation"  value={`${stddev}%`} />}
            {highest!== null && <StatCard label="Highest"        value={`${highest}%`} />}
            {avgTime!== null && <StatCard label="Avg time"       value={`${avgTime} min`} />}
          </div>

          {/* 2.3 Analytics toggle */}
          <button
            onClick={() => setShowAnalytics(v => !v)}
            style={{ ...btnSecondary, marginBottom: 16 }}
            className="no-print"
          >
            {showAnalytics ? '▲ Hide Analytics' : '▼ Show Analytics'}
          </button>

          {/* 2.3 Analytics section */}
          {showAnalytics && (
            <div style={{ marginBottom: 24 }} className="no-print">
              <div className="card" style={{ padding: '24px', marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Score Distribution</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={histogram} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip formatter={(v) => [v, 'Students']} />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                      {histogram.map((_, i) => (
                        <Cell key={i} fill={i >= 6 ? 'var(--success)' : i >= 4 ? 'var(--accent)' : 'var(--error)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <QuestionList title="Top 5 Hardest Questions" questions={hardest} colorVar="var(--error)" />
                <QuestionList title="Top 5 Easiest Questions"  questions={easiest} colorVar="var(--success)" />
              </div>
            </div>
          )}

          {/* Results table */}
          <div className="card" style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  {[
                    { label: 'Roll No.',   key: 'roll_number' },
                    { label: 'Name',       key: 'student_name' },
                    { label: 'Score',      key: 'score' },
                    { label: 'Total',      key: 'total_questions' },
                    { label: '%',          key: 'percentage' },
                    { label: 'Time (min)', key: null },
                    { label: 'Tab Sw.',    key: null },
                    { label: 'Submitted',  key: null },
                    { label: '',           key: null },
                  ].map(({ label, key }, i) => (
                    <th
                      key={i}
                      onClick={key ? () => toggleSort(key) : undefined}
                      style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-2)', fontSize: 12, whiteSpace: 'nowrap', cursor: key ? 'pointer' : 'default', userSelect: 'none' }}
                    >
                      {label}
                      {sortKey === key && <span style={{ marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((a, i) => {
                  const pct       = a.total_questions ? ((a.score / a.total_questions) * 100).toFixed(1) : '-'
                  const timeTaken = a.submitted_at && a.started_at
                    ? Math.round((new Date(a.submitted_at) - new Date(a.started_at)) / 60000) : '-'
                  const passed  = parseFloat(pct) >= 60
                  const tswitch = tabSwitches[a.id] || 0
                  return (
                    <tr key={a.id} style={{ borderBottom: i < sorted.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '11px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-2)' }}>{a.roll_number}</td>
                      <td style={{ padding: '11px 14px', fontWeight: 500, color: 'var(--text-1)' }}>{a.student_name}</td>
                      <td style={{ padding: '11px 14px', fontWeight: 700, color: 'var(--text-1)' }}>{a.score ?? '-'}</td>
                      <td style={{ padding: '11px 14px', color: 'var(--text-3)' }}>{a.total_questions ?? '-'}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: passed ? 'var(--success)' : 'var(--error)' }}>
                          {pct}{pct !== '-' ? '%' : ''}
                        </span>
                      </td>
                      <td style={{ padding: '11px 14px', color: 'var(--text-2)' }}>{timeTaken}</td>
                      <td style={{ padding: '11px 14px', color: tswitch > 0 ? 'var(--warn)' : 'var(--text-3)', fontWeight: tswitch > 0 ? 600 : 400 }}>
                        {tswitch || '—'}
                      </td>
                      <td style={{ padding: '11px 14px', color: 'var(--text-3)', fontSize: 12 }}>
                        {a.submitted_at ? formatInTimeZone(new Date(a.submitted_at), 'Asia/Kolkata', 'dd MMM, hh:mm a') : '-'}
                      </td>
                      <td style={{ padding: '11px 14px' }} className="no-print">
                        <button onClick={() => { setActionError(null); setConfirmDelete(a) }} style={deleteLink}>Delete</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── 3.6 Export config modal ───────────────────── */}
      {showExportConfig && (
        <Modal onClose={() => setShowExportConfig(false)}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, textAlign: 'left' }}>Export Columns</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {BASE_COLUMNS.map(col => (
              <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={!!exportCols[col.key]}
                  onChange={e => setExportCols(prev => ({ ...prev, [col.key]: e.target.checked }))}
                  style={{ accentColor: 'var(--accent)', width: 15, height: 15 }}
                />
                {col.label}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => {
                saveExportConfig(exportCols)
                setShowExportConfig(false)
              }}
              style={btnPrimary}
            >
              Save & Close
            </button>
            <button onClick={() => setShowExportConfig(false)} style={btnSecondary}>Cancel</button>
          </div>
        </Modal>
      )}

      {/* ── 2.4 Email confirm modal ───────────────────── */}
      {emailConfirm && (
        <Modal onClose={() => setEmailConfirm(false)}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✉️</div>
          <h3 style={modalTitle}>Email results?</h3>
          <p style={modalBody}>
            Send exam results to <strong>{emailableCount} students</strong> who have email addresses on record for <strong>{batch.name}</strong>.
          </p>
          <p style={{ margin: '0 0 20px', fontSize: 12, color: 'var(--warn)', background: 'var(--warn-lt)', padding: '8px 12px', borderRadius: 6 }}>
            Resend free tier: 100 emails/day. Make sure RESEND_API_KEY is configured in Vercel.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleEmailResults} disabled={emailing} style={{ ...btnPrimary, flex: 1, opacity: emailing ? .6 : 1 }}>
              {emailing ? 'Sending…' : `Send to ${emailableCount} students`}
            </button>
            <button onClick={() => setEmailConfirm(false)} disabled={emailing} style={{ ...btnSecondary, flex: 1 }}>Cancel</button>
          </div>
        </Modal>
      )}

      {/* ── Delete single attempt modal ───────────────── */}
      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🗑️</div>
          <h3 style={modalTitle}>Delete attempt?</h3>
          <p style={modalBody}>
            <strong>{confirmDelete.student_name}</strong> ({confirmDelete.roll_number}) will be able to retake the exam. Their responses and score will be permanently deleted.
          </p>
          {actionError && <p style={{ color: 'var(--error)', fontSize: 12, margin: '0 0 12px' }}>{actionError}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleDeleteAttempt} disabled={actionLoading} style={{ ...btnDestructive, flex: 1, opacity: actionLoading ? .6 : 1 }}>
              {actionLoading ? 'Deleting…' : 'Yes, delete'}
            </button>
            <button onClick={() => { setConfirmDelete(null); setActionError(null) }} disabled={actionLoading} style={{ ...btnSecondary, flex: 1 }}>Cancel</button>
          </div>
        </Modal>
      )}

      {/* ── 3.5 Reset batch modal (double confirm) ────── */}
      {confirmReset && (
        <Modal onClose={() => { setConfirmReset(false); setResetNameInput('') }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <h3 style={modalTitle}>Reset all attempts?</h3>
          <p style={modalBody}>
            This will permanently delete <strong>all {attempts.length} submission{attempts.length !== 1 ? 's' : ''}</strong> for <strong>{batch.name}</strong>, including in-progress attempts.
          </p>
          <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--error)', background: 'var(--error-lt)', padding: '8px 12px', borderRadius: 6 }}>
            This action cannot be undone.
          </p>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-2)' }}>
            Type the batch name to confirm:
          </p>
          <input
            value={resetNameInput}
            onChange={e => setResetNameInput(e.target.value)}
            placeholder={batch.name}
            style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border-md)', borderRadius: 6, fontSize: 13, marginBottom: 16, boxSizing: 'border-box', fontFamily: 'inherit', color: 'var(--text-1)' }}
          />
          {actionError && <p style={{ color: 'var(--error)', fontSize: 12, margin: '0 0 12px' }}>{actionError}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleResetBatch}
              disabled={actionLoading || resetNameInput !== batch.name}
              style={{ ...btnDestructive, flex: 1, opacity: (actionLoading || resetNameInput !== batch.name) ? .4 : 1 }}
            >
              {actionLoading ? 'Resetting…' : 'Yes, reset all'}
            </button>
            <button onClick={() => { setConfirmReset(false); setResetNameInput(''); setActionError(null) }} disabled={actionLoading} style={{ ...btnSecondary, flex: 1 }}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ── Sub-components ───────────────────────────────────────── */
function StatCard({ label, value }) {
  return (
    <div className="card" style={{ padding: '14px 20px', minWidth: 100 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>{label}</div>
    </div>
  )
}

function QuestionList({ title, questions, colorVar }) {
  return (
    <div className="card" style={{ padding: '20px 24px' }}>
      <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{title}</h4>
      {questions.length === 0
        ? <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)' }}>Not enough data</p>
        : questions.map((q, i) => (
          <div key={q.id} style={{ marginBottom: i < questions.length - 1 ? 10 : 0 }}>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 2, lineHeight: 1.4 }}>{q.text}…</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: colorVar }}>{q.pct}% correct ({q.attempts} attempts)</div>
          </div>
        ))
      }
    </div>
  )
}

function Modal({ children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ maxWidth: 440, width: '100%', padding: '32px 28px', textAlign: 'center', boxShadow: 'var(--shadow-xl)', maxHeight: '90vh', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  )
}

/* ── Styles ───────────────────────────────────────────────── */
const backBtn = { all: 'unset', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20 }
const btnPrimary = { all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '8px 16px', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600 }
const btnSecondary = { all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-md)', color: 'var(--text-2)', fontSize: 13, fontWeight: 500 }
const btnDanger = { all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', padding: '8px 14px', borderRadius: 8, background: 'var(--error-lt)', color: 'var(--error)', border: '1px solid #FECACA', fontSize: 13, fontWeight: 500 }
const btnDestructive = { all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '9px 16px', borderRadius: 8, background: 'var(--error)', color: '#fff', fontSize: 13, fontWeight: 600 }
const deleteLink = { all: 'unset', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--error)', padding: '3px 8px', borderRadius: 5, border: '1px solid #FECACA', background: 'var(--error-lt)', whiteSpace: 'nowrap' }
const modalTitle = { margin: '0 0 10px', fontSize: 17, fontWeight: 700, color: 'var(--text-1)' }
const modalBody  = { margin: '0 0 20px', fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6 }
