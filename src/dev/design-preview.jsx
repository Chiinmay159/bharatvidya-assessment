/* eslint-disable react-refresh/only-export-components -- dev-only mount script, not a component module */
/* Dev-only design harness — NOT part of the production build (app.html is
   the only rollup input). Run with `npm run dev:design`: vite then aliases
   src/lib/supabase.ts to the fixture stub, so the REAL admin views render
   with representative data and no session. Plain `npm run dev` keeps the
   real client, and this page falls back to the primitives sheet only. */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { AdminLayout } from '../components/admin/AdminLayout'
import { StatCard, Section, EmptyCard } from '../components/admin/AdminDashboardWidgets'
import { AdminDashboard } from '../components/admin/AdminDashboard'
import { BatchList } from '../components/admin/BatchList'
import { QuestionBank } from '../components/admin/QuestionBank'
import { ResultsView } from '../components/admin/ResultsView'
import { MissionControl } from '../components/admin/MissionControl'
import { BatchAnalytics } from '../components/admin/BatchAnalytics'
import { CertificatesPanel } from '../components/admin/CertificatesPanel'
import { TeamView } from '../components/admin/TeamView'
import { SeriesView } from '../components/admin/SeriesView'
import { InsightsView } from '../components/admin/InsightsView'
import { ActivityLog } from '../components/admin/ActivityLog'
import { StudentsView } from '../components/admin/StudentsView'

const HARNESS = import.meta.env.VITE_DESIGN_HARNESS === '1'
const EMAIL = 'chinmay@matramedia.co.in'
const noop = () => {}

// Matches the b-4 fixture in supabase-stub.js (completed, has attempts)
const SAMPLE_BATCH = {
  id: 'b-4', name: 'Arthashastra Reading · Final', status: 'completed',
  scheduled_start: new Date(Date.now() - 72 * 3600e3).toISOString(),
  duration_minutes: 60, questions_per_student: 30, organization_id: 'org-1',
  exam_code: 'AR9FIN01', show_results: true, pass_percentage: 40, max_attempts: 1,
}
const LIVE_BATCH = { ...SAMPLE_BATCH, id: 'b-1', name: 'Introduction to IKS · Batch 7', status: 'active' }

const VIEWS = {
  dashboard:  () => <AdminDashboard onViewAllBatches={noop} onCreateBatch={noop} onViewResults={noop} onManageRoster={noop} onManageQuestions={noop} />,
  batches:    () => <BatchList onSelectBatch={noop} onCreateBatch={noop} onViewResults={noop} onManageQuestions={noop} onManageRoster={noop} onMissionControl={noop} />,
  'question bank': () => <QuestionBank userEmail={EMAIL} />,
  results:    () => <ResultsView batch={SAMPLE_BATCH} canManage onBack={noop} onViewAnalytics={noop} onViewCertificates={noop} />,
  'mission control': () => <MissionControl batch={LIVE_BATCH} onBack={noop} />,
  analytics:  () => <BatchAnalytics batch={SAMPLE_BATCH} onBack={noop} />,
  certificates: () => <CertificatesPanel batch={SAMPLE_BATCH} canManage onBack={noop} />,
  team:       () => <TeamView userEmail={EMAIL} />,
  series:     () => <SeriesView userEmail={EMAIL} />,
  insights:   () => <InsightsView />,
  'activity log': () => <ActivityLog onBack={noop} />,
  students:   () => <StudentsView />,
  primitives: () => <Primitives />,
}

const Icon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" />
  </svg>
)

function Primitives() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
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
      <Section title="Empty state" count={0} countColor="var(--teal)">
        <EmptyCard icon={<Icon />} text="No flagged responses in this batch." />
      </Section>
    </div>
  )
}

function Preview() {
  const [view, setView] = useState(HARNESS ? 'dashboard' : 'primitives')
  const keys = HARNESS ? Object.keys(VIEWS) : ['primitives']
  const navItems = keys.map(k => ({ label: k, active: view === k, onClick: () => setView(k) }))
  const Body = VIEWS[view]
  return (
    <AdminLayout user={{ email: EMAIL }} orgLabel="Matra" navItems={navItems}>
      {!HARNESS && (
        <p style={{ margin: '0 0 20px', fontSize: 12, color: 'var(--text-3)' }}>
          Primitives only — run <code>npm run dev:design</code> to render the full views against fixture data.
        </p>
      )}
      <Body key={view} />
    </AdminLayout>
  )
}

createRoot(document.getElementById('root')).render(<Preview />)
