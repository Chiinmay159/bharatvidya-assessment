import { formatInTimeZone } from 'date-fns-tz'

export function ConfirmIdentity({ batch, student, onConfirm, onBack }) {
  const dateStr = formatInTimeZone(new Date(batch.scheduled_start), 'Asia/Kolkata', 'dd MMM yyyy')
  const timeStr = formatInTimeZone(new Date(batch.scheduled_start), 'Asia/Kolkata', 'hh:mm a')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '14px 24px' }}>
        <button onClick={onBack} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-2)', fontSize: 14, fontWeight: 500 }}>
          <ArrowLeft /> Back
        </button>
      </header>

      {/* Body */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px 60px' }}>
        <div className="u-slide-up" style={{ width: '100%', maxWidth: 420 }}>

          {/* Title block */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'var(--accent-lt)', border: '2px solid var(--accent-md)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 14px',
            }}>
              <UserCheckIcon />
            </div>
            <h1 style={{ margin: '0 0 5px', fontSize: 21, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.3px' }}>
              Is this you?
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text-2)', lineHeight: 1.5 }}>
              Verify your details before entering the exam.
            </p>
          </div>

          {/* Ticket card */}
          <div className="card" style={{ overflow: 'hidden', marginBottom: 14 }}>
            {/* Ticket header */}
            <div style={{ background: 'var(--gradient-hero)', padding: '14px 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'rgba(255,255,255,.55)', textTransform: 'uppercase', marginBottom: 3 }}>
                Exam Admission
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: '-.2px', lineHeight: 1.3 }}>
                {batch.name}
              </div>
            </div>

            {/* Ticket perforation */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, margin: '0 -1px' }}>
              <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--bg)', border: '1px solid var(--border)', flexShrink: 0, marginLeft: -7 }} />
              <div style={{ flex: 1, borderTop: '2px dashed var(--border)', margin: '0 4px' }} />
              <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--bg)', border: '1px solid var(--border)', flexShrink: 0, marginRight: -7 }} />
            </div>

            {/* Ticket body */}
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <InfoRow label="Name"     value={student.studentName} />
              <InfoRow label="Roll No"  value={student.rollNumber} mono />
              {student.email && <InfoRow label="Email" value={student.email} />}
              <div style={{ borderTop: '1px solid var(--border)', margin: '2px 0' }} />
              <InfoRow label="Date"     value={`${dateStr} at ${timeStr} IST`} />
              <InfoRow label="Duration" value={`${batch.duration_minutes} minutes`} />
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={onConfirm} className="btn btn-primary btn-block" style={{ padding: '13px 20px', fontSize: 15 }}>
              Yes, that's me — continue →
            </button>
            <button onClick={onBack} className="btn btn-secondary btn-block" style={{ padding: '11px 20px' }}>
              Not me — go back
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

function InfoRow({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-3)', flexShrink: 0 }}>{label}</span>
      <span style={{
        fontSize: 14, fontWeight: 600, color: 'var(--text-1)', textAlign: 'right',
        fontFamily: mono ? 'var(--font-mono)' : undefined,
        wordBreak: 'break-all',
      }}>
        {value}
      </span>
    </div>
  )
}

function UserCheckIcon() {
  return (
    <svg width="24" height="24" fill="none" stroke="var(--accent)" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="7" r="4" />
      <polyline points="16 11 18 13 22 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ArrowLeft() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m0 0l7-7m-7 7l7 7" />
    </svg>
  )
}
