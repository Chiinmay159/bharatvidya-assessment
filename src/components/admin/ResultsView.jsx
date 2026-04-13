import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { logAuditEvent } from '../../lib/auditLog'
import { generateCsv, downloadCsv } from '../../lib/csv'
import { formatInTimeZone } from 'date-fns-tz'
import { FocusTrapModal } from '../shared/FocusTrapModal'

import { ResultsSummaryBar } from './ResultsSummaryBar'
import { ResultsAnalytics } from './ResultsAnalytics'
import { ResultsTable } from './ResultsTable'
import { ExportConfigModal } from './ExportConfigModal'
import { EmailConfirmModal } from './EmailConfirmModal'
import { ResetBatchModal } from './ResetBatchModal'

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
      range: `${lo}\u2013${hi}%`,
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

      <button onClick={onBack} style={backBtn} className="no-print">&larr; Back to batches</button>

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
            &#x23CE; Print
          </button>
          <button onClick={() => setEmailConfirm(true)} disabled={!emailableCount || loading} style={{ ...btnSecondary, opacity: emailableCount ? 1 : .4 }}>
            &#x2709; Email Results ({emailableCount})
          </button>
          <button onClick={() => setShowExportConfig(true)} style={btnSecondary}>
            &#x2699; Export Options
          </button>
          <button onClick={handleExport} disabled={!attempts.length} style={{ ...btnSecondary, opacity: attempts.length ? 1 : .4 }}>
            &darr; Download CSV
          </button>
          <button onClick={() => setConfirmReset(true)} disabled={loading} style={{ ...btnDanger, opacity: loading ? .4 : 1 }}>
            &#x21BA; Reset all
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

      {loading && <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>Loading results&hellip;</div>}

      {!loading && attempts.length === 0 && (
        <div className="card" style={{ padding: '48px 32px', textAlign: 'center' }}>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 14 }}>No submissions yet.</p>
        </div>
      )}

      {!loading && attempts.length > 0 && (
        <>
          <ResultsSummaryBar
            attempts={attempts}
            avg={avg}
            median={median}
            stddev={stddev}
            highest={highest}
            avgTime={avgTime}
          />

          {/* 2.3 Analytics toggle */}
          <button
            onClick={() => setShowAnalytics(v => !v)}
            style={{ ...btnSecondary, marginBottom: 16 }}
            className="no-print"
          >
            {showAnalytics ? '\u25B2 Hide Analytics' : '\u25BC Show Analytics'}
          </button>

          {showAnalytics && (
            <ResultsAnalytics histogram={histogram} hardest={hardest} easiest={easiest} />
          )}

          <ResultsTable
            batch={batch}
            sorted={sorted}
            tabSwitches={tabSwitches}
            sortKey={sortKey}
            sortDir={sortDir}
            toggleSort={toggleSort}
            onDeleteAttempt={(a) => { setActionError(null); setConfirmDelete(a) }}
          />
        </>
      )}

      {/* ── 3.6 Export config modal ───────────────────── */}
      {showExportConfig && (
        <ExportConfigModal
          exportCols={exportCols}
          setExportCols={setExportCols}
          baseColumns={BASE_COLUMNS}
          onSave={() => { saveExportConfig(exportCols); setShowExportConfig(false) }}
          onClose={() => setShowExportConfig(false)}
        />
      )}

      {/* ── 2.4 Email confirm modal ───────────────────── */}
      {emailConfirm && (
        <EmailConfirmModal
          batch={batch}
          emailableCount={emailableCount}
          emailing={emailing}
          onConfirm={handleEmailResults}
          onClose={() => setEmailConfirm(false)}
        />
      )}

      {/* ── Delete single attempt modal ───────────────── */}
      {confirmDelete && (
        <FocusTrapModal ariaLabel="Confirm delete attempt" onClose={() => setConfirmDelete(null)}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>&#x1F5D1;&#xFE0F;</div>
          <h3 style={modalTitle}>Delete attempt?</h3>
          <p style={modalBody}>
            <strong>{confirmDelete.student_name}</strong> ({confirmDelete.roll_number}) will be able to retake the exam. Their responses and score will be permanently deleted.
          </p>
          {actionError && <p style={{ color: 'var(--error)', fontSize: 12, margin: '0 0 12px' }}>{actionError}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleDeleteAttempt} disabled={actionLoading} style={{ ...btnDestructive, flex: 1, opacity: actionLoading ? .6 : 1 }}>
              {actionLoading ? 'Deleting\u2026' : 'Yes, delete'}
            </button>
            <button onClick={() => { setConfirmDelete(null); setActionError(null) }} disabled={actionLoading} style={{ ...btnSecondary, flex: 1 }}>Cancel</button>
          </div>
        </FocusTrapModal>
      )}

      {/* ── 3.5 Reset batch modal (double confirm) ────── */}
      {confirmReset && (
        <ResetBatchModal
          batch={batch}
          attempts={attempts}
          resetNameInput={resetNameInput}
          setResetNameInput={setResetNameInput}
          actionLoading={actionLoading}
          actionError={actionError}
          onConfirm={handleResetBatch}
          onClose={() => { setConfirmReset(false); setResetNameInput(''); setActionError(null) }}
        />
      )}
    </div>
  )
}

/* ── Styles ───────────────────────────────────────────────── */
const backBtn = { all: 'unset', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20 }
const btnSecondary = { all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-md)', color: 'var(--text-2)', fontSize: 13, fontWeight: 500 }
const btnDanger = { all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', padding: '8px 14px', borderRadius: 8, background: 'var(--error-lt)', color: 'var(--error)', border: '1px solid #FECACA', fontSize: 13, fontWeight: 500 }
const btnDestructive = { all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '9px 16px', borderRadius: 8, background: 'var(--error)', color: '#fff', fontSize: 13, fontWeight: 600 }
const modalTitle = { margin: '0 0 10px', fontSize: 17, fontWeight: 700, color: 'var(--text-1)' }
const modalBody  = { margin: '0 0 20px', fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6 }
