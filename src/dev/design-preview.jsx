/* eslint-disable react-refresh/only-export-components -- dev-only mount script, not a component module */
/* Dev-only design harness — NOT part of the production build (app.html is
   the only rollup input). Mounts the admin chrome + shared primitives with
   static sample data so the reskin can be reviewed without an aal2 session. */
import { createRoot } from 'react-dom/client'
import '../index.css'
import { AdminLayout } from '../components/admin/AdminLayout'
import { StatCard, Section, EmptyCard } from '../components/admin/AdminDashboardWidgets'

const Icon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" />
  </svg>
)

function Swatch({ name, varName }) {
  return (
    <div style={{ flex: 1, minWidth: 90 }}>
      <div style={{ height: 44, borderRadius: 8, background: `var(${varName})`, boxShadow: 'var(--shadow-sm)' }} />
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{name}</div>
    </div>
  )
}

function Preview() {
  const navItems = [
    { label: 'Dashboard', active: true, onClick: () => {} },
    { label: 'Batches', active: false, onClick: () => {} },
    { label: 'Question bank', active: false, onClick: () => {} },
    { label: 'Results', active: false, onClick: () => {} },
    { label: 'Team', active: false, onClick: () => {} },
  ]
  return (
    <AdminLayout user={{ email: 'chinmay@matramedia.co.in' }} orgLabel="Matra" navItems={navItems}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

        <div>
          <h2 style={{ margin: '0 0 12px', fontSize: 20, color: 'var(--text-1)' }}>Palette</h2>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Swatch name="bg" varName="--bg" />
            <Swatch name="carbon" varName="--carbon" />
            <Swatch name="accent" varName="--accent" />
            <Swatch name="accent-md" varName="--accent-md" />
            <Swatch name="teal" varName="--teal" />
            <Swatch name="red" varName="--red" />
          </div>
        </div>

        <div>
          <h2 style={{ margin: '0 0 12px', fontSize: 20, color: 'var(--text-1)' }}>Stat cards</h2>
          <div style={{ display: 'flex', gap: 14 }}>
            <StatCard value="12" label="Active batches" color="var(--teal)" bg="var(--teal-lt)" border="var(--teal-lt)" icon={<Icon />} />
            <StatCard value="342" label="Students rostered" color="var(--accent-deep)" bg="var(--accent-lt)" border="var(--accent-md)" icon={<Icon />} />
            <StatCard value="98.2%" label="Submission rate" color="var(--success)" bg="var(--success-lt)" border="var(--success-lt)" icon={<Icon />} />
            <StatCard value="3" label="Flagged pairs" color="var(--red)" bg="var(--red-lt)" border="var(--red-lt)" icon={<Icon />} />
          </div>
        </div>

        <div>
          <h2 style={{ margin: '0 0 12px', fontSize: 20, color: 'var(--text-1)' }}>Actions & inputs</h2>
          <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary">Create batch</button>
              <button className="btn btn-secondary">Export CSV</button>
              <button className="btn btn-success">Publish results</button>
              <button className="btn btn-primary" disabled>Disabled</button>
              <button className="action-link">Manage →</button>
            </div>
            <div style={{ display: 'flex', gap: 10, maxWidth: 560 }}>
              <input className="form-input" placeholder="Batch name" />
              <input className="form-input" placeholder="Exam code" />
            </div>
          </div>
        </div>

        <Section title="Table & states" count={2} countColor="var(--teal)">
          <div className="card" style={{ overflow: 'hidden' }}>
            {['Geography · Batch 3', 'Sanskrit Foundations · Batch 1'].map((n, i) => (
              <div key={n} className="table-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{n}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>342 rostered · starts 09:30</div>
                </div>
                <span style={{ padding: '3px 12px', borderRadius: 'var(--radius-pill)', fontSize: 11, fontWeight: 700, background: 'var(--teal-lt)', color: 'var(--teal-deep)' }}>SCHEDULED</span>
              </div>
            ))}
          </div>
          <EmptyCard icon={<Icon />} text="No flagged responses in this batch." />
        </Section>

        <div>
          <h2 style={{ margin: '0 0 12px', fontSize: 20, color: 'var(--text-1)' }}>Auth card (heritage cap)</h2>
          <div style={{ background: 'var(--gradient-hero)', padding: 48, borderRadius: 'var(--radius-xl)', display: 'flex', justifyContent: 'center' }}>
            <div className="card card-heritage" style={{ width: 360, padding: '40px 32px', textAlign: 'center', boxShadow: 'var(--shadow-xl)' }}>
              <h1 style={{ margin: '0 0 4px', fontSize: 21, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-.35px' }}>Admin Portal</h1>
              <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text-3)' }}>Matra Assessment Platform · Restricted access</p>
              <button className="btn btn-primary btn-block">Sign in</button>
            </div>
          </div>
        </div>

      </div>
    </AdminLayout>
  )
}

createRoot(document.getElementById('root')).render(<Preview />)
