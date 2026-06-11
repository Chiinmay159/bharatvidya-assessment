import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { formatDbError } from '../../lib/errors'
import { Spinner } from '../shared/Spinner'

/**
 * SeriesView — modular exam series (e.g. 20-20-20-40 across a year).
 *
 * A series = weighted module slots; each slot is examined by ordinary
 * batches (main + optional make-up sittings). One series roster syncs
 * to every attached batch. Aggregate decides the pass; module failures
 * stay on the record.
 */
export function SeriesView({ userEmail }) {
  const [seriesList, setSeriesList] = useState(null)
  const [selected, setSelected] = useState(null) // series row
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('exam_series')
      .select('*, series_modules(id, position, label, weight_marks)')
      .order('created_at', { ascending: false })
    if (err) { setError(formatDbError(err, 'Failed to load series.')); return }
    setSeriesList(data ?? [])
  }, [])

  useEffect(() => {
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
  }, [load])

  if (!seriesList && !error) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={26} color="var(--accent)" /></div>
  }

  if (selected) {
    return (
      <SeriesDetail
        series={selected}
        onBack={() => { setSelected(null); load() }}
      />
    )
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>Exam Series</h2>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-3)' }}>
        Modular assessments — weighted modules spread across a term or year, with an aggregate result.
      </p>

      {error && <Banner kind="error">{error}</Banner>}

      <NewSeriesForm userEmail={userEmail} onCreated={load} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
        {seriesList?.length === 0 && (
          <div className="card" style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
            No series yet. Create one above — e.g. "Sanskrit Foundations 2026–27" with modules 20-20-20-40.
          </div>
        )}
        {seriesList?.map(s => {
          const total = (s.series_modules ?? []).reduce((sum, m) => sum + m.weight_marks, 0)
          return (
            <button key={s.id} onClick={() => setSelected(s)} className="card" style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 20px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--surface)' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{s.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  {(s.series_modules ?? []).length} modules · {total} marks total
                  {s.aggregate_pass_marks ? ` · pass at ${s.aggregate_pass_marks}` : ''}
                  {s.show_running_total ? ' · running total visible to students' : ''}
                </div>
              </div>
              <span style={{ color: 'var(--accent-deep)', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>Manage →</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── Create form ─────────────────────────────────────────── */
function NewSeriesForm({ userEmail, onCreated }) {
  const [name, setName] = useState('')
  const [weights, setWeights] = useState('20, 20, 20, 40')
  const [passMarks, setPassMarks] = useState('40')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)
    const parsed = weights.split(',').map(w => parseInt(w.trim())).filter(n => Number.isInteger(n) && n > 0)
    if (!name.trim() || parsed.length === 0) { setError('Name and at least one positive module weight are required.'); return }
    const total = parsed.reduce((a, b) => a + b, 0)
    const pass = passMarks ? parseInt(passMarks) : null
    if (pass != null && (pass < 1 || pass > total)) { setError(`Pass marks must be between 1 and ${total}.`); return }

    setBusy(true)
    try {
      const { data: series, error: e1 } = await supabase.from('exam_series')
        .insert({ name: name.trim(), aggregate_pass_marks: pass, created_by: userEmail })
        .select().single()
      if (e1) throw e1
      const { error: e2 } = await supabase.from('series_modules').insert(
        parsed.map((w, i) => ({
          series_id: series.id, position: i + 1,
          label: i === parsed.length - 1 && parsed.length > 1 ? 'Final' : `Module ${i + 1}`,
          weight_marks: w,
        }))
      )
      if (e2) throw e2
      setName(''); setWeights('20, 20, 20, 40'); setPassMarks('40')
      onCreated()
    } catch (err) {
      setError(formatDbError(err, 'Could not create the series.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleCreate} className="card" style={{ padding: '18px 20px' }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>New series</h3>
      {error && <Banner kind="error">{error}</Banner>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Series name (e.g. Sanskrit Foundations 2026–27)" aria-label="Series name" style={{ ...input, flex: '2 1 240px' }} required />
        <input value={weights} onChange={e => setWeights(e.target.value)} placeholder="Module weights, e.g. 20, 20, 20, 40" aria-label="Module weights" style={{ ...input, flex: '1 1 160px' }} />
        <input value={passMarks} onChange={e => setPassMarks(e.target.value)} type="number" min="1" placeholder="Pass marks" aria-label="Aggregate pass marks" style={{ ...input, width: 110, flex: '0 0 110px' }} />
        <button type="submit" disabled={busy} className="btn btn-primary" style={{ padding: '9px 18px', flexShrink: 0 }}>
          {busy ? <Spinner size={14} /> : 'Create'}
        </button>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-3)' }}>
        Weights are comma-separated marks per module — they define both the module count and the aggregate total.
      </p>
    </form>
  )
}

/* ── Detail: modules, batches, roster, results ───────────── */
function SeriesDetail({ series, onBack }) {
  const [modules, setModules] = useState([])
  const [attached, setAttached] = useState([])   // batches in this series
  const [available, setAvailable] = useState([]) // unattached draft/scheduled batches
  const [rosterCount, setRosterCount] = useState(0)
  const [rosterText, setRosterText] = useState('')
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [m, b, av, rc] = await Promise.all([
      supabase.from('series_modules').select('*').eq('series_id', series.id).order('position'),
      supabase.from('batches').select('id, name, status, scheduled_start, series_module_id, is_makeup')
        .not('series_module_id', 'is', null),
      supabase.from('batches').select('id, name, status, scheduled_start')
        .is('series_module_id', null).in('status', ['draft', 'scheduled']).order('scheduled_start'),
      supabase.from('series_roster').select('*', { count: 'exact', head: true }).eq('series_id', series.id),
    ])
    const mods = m.data ?? []
    setModules(mods)
    const modIds = new Set(mods.map(x => x.id))
    setAttached((b.data ?? []).filter(x => modIds.has(x.series_module_id)))
    setAvailable(av.data ?? [])
    setRosterCount(rc.count ?? 0)
  }, [series.id])

  useEffect(() => {
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
  }, [load])

  async function attach(batchId, moduleId, isMakeup) {
    setError(null); setNotice(null)
    const { error: err } = await supabase.from('batches')
      .update({ series_module_id: moduleId, is_makeup: isMakeup }).eq('id', batchId)
    if (err) { setError(formatDbError(err, 'Attach failed.')); return }
    // Keep the roster in sync for the newly attached batch
    if (rosterCount > 0) await supabase.rpc('sync_series_roster', { p_series_id: series.id })
    setNotice('Batch attached' + (rosterCount > 0 ? ' and roster synced.' : '.'))
    load()
  }

  async function detach(batchId) {
    setError(null); setNotice(null)
    const { error: err } = await supabase.from('batches')
      .update({ series_module_id: null, is_makeup: false }).eq('id', batchId)
    if (err) setError(formatDbError(err, 'Detach failed.'))
    else load()
  }

  async function saveRoster(e) {
    e.preventDefault()
    setError(null); setNotice(null); setBusy(true)
    try {
      // Lines: roll, name, email (comma separated)
      const rows = rosterText.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
        const [roll, name, email] = l.split(',').map(p => p?.trim())
        return { series_id: series.id, roll_number: roll, student_name: name, email: email ?? '' }
      })
      const bad = rows.findIndex(r => !r.roll_number || !r.student_name || !r.email)
      if (rows.length === 0 || bad !== -1) {
        throw new Error(`Each line must be: roll, name, email${bad !== -1 ? ` (problem on line ${bad + 1})` : ''}`)
      }
      const { error: e1 } = await supabase.from('series_roster').delete().eq('series_id', series.id)
      if (e1) throw e1
      const { error: e2 } = await supabase.from('series_roster').insert(rows)
      if (e2) throw e2
      const { data: synced, error: e3 } = await supabase.rpc('sync_series_roster', { p_series_id: series.id })
      if (e3) throw e3
      setNotice(`Roster saved (${rows.length} students) and synced to ${synced} batch${synced !== 1 ? 'es' : ''}.`)
      setRosterText('')
      load()
    } catch (err) {
      setError(formatDbError(err, 'Roster save failed.'))
    } finally {
      setBusy(false)
    }
  }

  async function loadResults() {
    setError(null)
    const { data, error: err } = await supabase.rpc('series_results', { p_series_id: series.id })
    if (err) { setError(formatDbError(err, 'Failed to load results.')); return }
    setResults(data ?? [])
  }

  function exportCsv() {
    if (!results) return
    const header = 'Roll,Name,Module,Status,Weighted Marks,Aggregate,Aggregate Result\n'
    const lines = results.map(r =>
      [r.roll_number, `"${r.student_name}"`, `"${r.module_label} (${r.weight_marks})"`, r.module_status,
       r.weighted_marks ?? '', r.aggregate_marks, r.aggregate_passed ? 'PASS' : 'FAIL'].join(','))
    const blob = new Blob([header + lines.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${series.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-series-results.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const totalMarks = modules.reduce((s, m) => s + m.weight_marks, 0)
  // Group results by student for display
  const students = results
    ? [...new Map(results.map(r => [r.roll_number, r])).values()]
    : null

  return (
    <div>
      <button onClick={onBack} style={backBtn}>← All series</button>
      <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>{series.name}</h2>
      <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--text-3)' }}>
        {totalMarks} marks total{series.aggregate_pass_marks ? ` · aggregate pass at ${series.aggregate_pass_marks}` : ''} · {rosterCount} students on roster
      </p>

      {notice && <Banner kind="success">{notice}</Banner>}
      {error && <Banner kind="error">{error}</Banner>}

      {/* Modules + attached batches */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={sectionHead}>Modules</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {modules.map(m => {
            const batches = attached.filter(b => b.series_module_id === m.id)
            return (
              <div key={m.id} className="card" style={{ padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
                    {m.position}. {m.label}
                    <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: 'var(--accent-deep)' }}>{m.weight_marks} marks</span>
                  </div>
                  {available.length > 0 && (
                    <AttachControl available={available} onAttach={(batchId, isMakeup) => attach(batchId, m.id, isMakeup)} />
                  )}
                </div>
                {batches.length > 0 ? (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {batches.map(b => (
                      <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{b.name}</span>
                        <span>· {b.status}</span>
                        {b.is_makeup && <span style={{ color: 'var(--warn)', fontWeight: 700 }}>make-up</span>}
                        {['draft', 'scheduled'].includes(b.status) && (
                          <button onClick={() => detach(b.id)} style={{ all: 'unset', cursor: 'pointer', color: 'var(--error)', fontSize: 11, fontWeight: 600 }}>
                            detach
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-3)' }}>No batch yet — create a batch as usual, then attach it here.</p>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Roster */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={sectionHead}>Series roster {rosterCount > 0 && <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>— {rosterCount} students (saving replaces it)</span>}</h3>
        <form onSubmit={saveRoster} className="card" style={{ padding: '16px 18px' }}>
          <textarea
            value={rosterText} onChange={e => setRosterText(e.target.value)}
            placeholder={'One student per line:  roll, name, email\nBV001, Asha Kulkarni, asha@example.com'}
            rows={4} aria-label="Series roster"
            style={{ ...input, width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
            <button type="submit" disabled={busy || !rosterText.trim()} className="btn btn-primary" style={{ padding: '9px 18px' }}>
              {busy ? <Spinner size={14} /> : 'Save & sync to all module batches'}
            </button>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Same roll numbers across every module — enforced from here.</span>
          </div>
        </form>
      </section>

      {/* Results */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <h3 style={{ ...sectionHead, margin: 0 }}>Aggregate results</h3>
          <button onClick={loadResults} className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: 12 }}>
            {results ? 'Refresh' : 'Load results'}
          </button>
          {results?.length > 0 && (
            <button onClick={exportCsv} className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: 12 }}>
              Export CSV
            </button>
          )}
        </div>

        {students && students.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>No rostered students yet.</p>
        )}
        {students && students.length > 0 && (
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th style={th}>Roll</th>
                  <th style={{ ...th, textAlign: 'left' }}>Name</th>
                  {modules.map(m => <th key={m.id} style={th}>{m.label} /{m.weight_marks}</th>)}
                  <th style={th}>Aggregate /{totalMarks}</th>
                  <th style={th}>Result</th>
                </tr>
              </thead>
              <tbody>
                {students.map(stu => {
                  const rows = results.filter(r => r.roll_number === stu.roll_number)
                  return (
                    <tr key={stu.roll_number} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{stu.roll_number}</td>
                      <td style={{ ...td, textAlign: 'left' }}>{stu.student_name}</td>
                      {modules.map(m => {
                        const r = rows.find(x => x.module_position === m.position)
                        if (!r) return <td key={m.id} style={td}>—</td>
                        return (
                          <td key={m.id} style={{ ...td, color: r.module_status === 'failed' ? 'var(--error)' : r.module_status === 'absent' ? 'var(--text-3)' : 'var(--text-1)' }}>
                            {r.module_status === 'absent' ? 'absent' : r.weighted_marks}
                            {r.module_status === 'failed' && ' ✗'}
                          </td>
                        )
                      })}
                      <td style={{ ...td, fontWeight: 700 }}>{rows[0]?.aggregate_marks}</td>
                      <td style={{ ...td, fontWeight: 700, color: rows[0]?.aggregate_passed ? 'var(--success)' : 'var(--error)' }}>
                        {rows[0]?.aggregate_passed ? 'PASS' : 'FAIL'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
          Module failures stay on the record (✗) even when the aggregate passes — per the agreed policy.
          Absent counts 0 until the student takes a make-up sitting attached to the same module.
        </p>
      </section>
    </div>
  )
}

function AttachControl({ available, onAttach }) {
  const [batchId, setBatchId] = useState('')
  const [makeup, setMakeup] = useState(false)
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <select value={batchId} onChange={e => setBatchId(e.target.value)} aria-label="Batch to attach" style={{ ...input, fontSize: 12, padding: '6px 8px' }}>
        <option value="">Attach a batch…</option>
        {available.map(b => <option key={b.id} value={b.id}>{b.name} ({b.status})</option>)}
      </select>
      <label style={{ fontSize: 11, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
        <input type="checkbox" checked={makeup} onChange={e => setMakeup(e.target.checked)} /> make-up
      </label>
      <button type="button" disabled={!batchId} onClick={() => { onAttach(batchId, makeup); setBatchId(''); setMakeup(false) }}
        className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}>
        Attach
      </button>
    </div>
  )
}

function Banner({ kind, children }) {
  const isErr = kind === 'error'
  return (
    <div role={isErr ? 'alert' : 'status'} style={{
      padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 14,
      background: isErr ? 'var(--error-lt)' : 'var(--success-lt)',
      color: isErr ? 'var(--error)' : 'var(--success)',
      border: '1px solid var(--border)',
    }}>{children}</div>
  )
}

const sectionHead = { margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }
const backBtn = {
  all: 'unset', cursor: 'pointer', fontSize: 13, fontWeight: 500,
  color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 14,
}
const input = {
  padding: '9px 12px', fontSize: 13, border: '1px solid var(--border-md)',
  borderRadius: 'var(--radius-sm)', background: 'var(--surface)', color: 'var(--text-1)',
  fontFamily: 'inherit',
}
const th = { padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'center', whiteSpace: 'nowrap' }
const td = { padding: '9px 12px', textAlign: 'center', verticalAlign: 'middle' }
