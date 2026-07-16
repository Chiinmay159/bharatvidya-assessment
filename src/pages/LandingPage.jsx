import { Link } from 'react-router-dom'
import { motion as Motion, MotionConfig } from 'motion/react'
import {
  INK, IVORY, CARBON, GOLD, GOLD_L, TEAL, RED, CARD_SHADOW,
  SiteHeader, SiteFooter, Grain, SiteStyles,
} from '../components/site/SiteChrome'

/**
 * LandingPage — Matra Assessment Platform (route: /).
 *
 * Plush editorial-luxury direction: ivory ground, carbon header/footer,
 * gold as the metal, teal and red as living gradient accents. Fraunces
 * display over Instrument Sans. Motion for staggered reveals and hover
 * physics; MotionConfig honours prefers-reduced-motion. Static and
 * light: nothing here touches the exam-day critical path.
 *
 * Chrome + palette live in components/site/SiteChrome so every public
 * page shares one system. Copy discipline: declarative, concrete,
 * triadic; every claim describes shipped, tested behaviour.
 */

const ease = [0.22, 1, 0.36, 1]
const rise = {
  hidden: { opacity: 0, y: 28 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.7, ease, delay: i * 0.09 } }),
}

export function LandingPage() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen flex flex-col font-[Instrument_Sans,system-ui,sans-serif]" style={{ background: IVORY, color: INK }}>
        <SiteStyles />
        <SiteHeader />
        <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
          <Hero />
          <Guarantees />
          <StudentPath />
          <VerifyPanel />
          <Institutions />
          <Reframe />
        </main>
        <SiteFooter />
      </div>
    </MotionConfig>
  )
}

/* ── Hero ───────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative overflow-hidden" style={{ background: IVORY }}>
      {/* Living auras */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="aura absolute -top-32 -left-24 w-[520px] h-[520px] rounded-full opacity-[.32]"
          style={{ background: `radial-gradient(circle at 40% 40%, ${GOLD_L}, transparent 65%)`, filter: 'blur(60px)' }} />
        <div className="aura aura-2 absolute top-24 -right-32 w-[560px] h-[560px] rounded-full opacity-[.22]"
          style={{ background: `radial-gradient(circle at 55% 45%, ${TEAL}, transparent 62%)`, filter: 'blur(70px)' }} />
        <div className="aura aura-3 absolute -bottom-40 left-1/3 w-[460px] h-[460px] rounded-full opacity-[.14]"
          style={{ background: `radial-gradient(circle at 50% 50%, ${RED}, transparent 60%)`, filter: 'blur(80px)' }} />
        <Grain />
      </div>

      <div className="relative mx-auto max-w-6xl px-5 md:px-8 pt-16 md:pt-24 pb-20 md:pb-28">
        <Motion.p variants={rise} initial="hidden" animate="show" custom={0}
          className="m-0 mb-5 text-[11px] font-bold tracking-[.22em] uppercase" style={{ color: TEAL }}>
          Secure examinations · Verifiable results
        </Motion.p>
        <Motion.h1 variants={rise} initial="hidden" animate="show" custom={1}
          className="m-0 font-[Fraunces,serif] font-semibold tracking-[-0.02em] leading-[1.04] text-balance text-[clamp(42px,7.5vw,84px)]"
          style={{ color: INK }}>
          An examination<br />
          is a <em className="not-italic" style={{ background: `linear-gradient(110deg, ${GOLD} 10%, ${RED} 55%, ${TEAL} 95%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', fontStyle: 'italic', fontFamily: 'Fraunces, serif' }}>promise</em>.
        </Motion.h1>
        <Motion.p variants={rise} initial="hidden" animate="show" custom={2}
          className="mt-7 mb-0 max-w-xl text-[17px] md:text-[19px] leading-[1.75] text-pretty" style={{ color: '#433E33' }}>
          Students never lose answers to a bad connection. Institutions get scores
          no one can dispute. Anyone can check a certificate in seconds.
        </Motion.p>
        <Motion.div variants={rise} initial="hidden" animate="show" custom={3} className="mt-10 flex flex-wrap items-center gap-4">
          <Link to="/exam" className="no-underline rounded-full px-7 py-3.5 text-[15px] font-bold transition-transform hover:scale-[1.03] active:scale-[0.96]"
            style={{ background: `linear-gradient(135deg, ${GOLD_L}, ${GOLD})`, color: CARBON, boxShadow: '0 6px 28px rgba(201,162,39,.4)' }}>
            Enter your exam →
          </Link>
          <Link to="/admin" className="no-underline rounded-full px-7 py-3.5 text-[15px] font-bold transition-colors"
            style={{ border: `1.5px solid ${INK}`, color: INK }}
            onMouseEnter={e => { e.currentTarget.style.background = CARBON; e.currentTarget.style.color = IVORY }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = INK }}>
            Open the admin portal
          </Link>
          <Link to="/verify" className="no-underline text-[14px] font-bold" style={{ color: TEAL }}>
            Verify a certificate ↗
          </Link>
        </Motion.div>
        <Motion.p variants={rise} initial="hidden" animate="show" custom={4}
          className="mt-12 mb-0 text-[13px]" style={{ color: '#8A8272' }}>
          Runs <strong style={{ color: '#4B463A' }}>BharatVidya</strong>'s examinations in Indian Knowledge Systems.
        </Motion.p>
      </div>
    </section>
  )
}

/* ── Six guarantees ─────────────────────────────────────── */

const GUARANTEES = [
  { c: GOLD, title: 'Scoring no one can touch', body: 'Answers are scored on the server, never in the browser. The answer key never leaves the server either. Nothing about a result depends on the student’s device.' },
  { c: TEAL, title: 'Only your students, only your exam', body: 'A student needs the exam code you issued, plus a roll number and email that match your roster. If they don’t match, there is no way in.' },
  { c: RED, title: 'A dropped connection costs nothing', body: 'Every answer is saved on the student’s device first, then sent. If the network fails, the answers sync when it returns. If they arrive after the deadline, the examiner decides whether to count them.' },
  { c: TEAL, title: 'Watch the exam live', body: 'See every student’s presence, progress, and integrity signals on one screen. Grant extra time during the exam itself.' },
  { c: RED, title: 'Honest numbers afterwards', body: 'Item analysis shows which questions worked. Similarity analysis flags students whose answers match more than chance allows. A flag starts an investigation; a person makes the decision.' },
  { c: GOLD, title: 'Certificates that answer for themselves', body: 'Every certificate carries a code. Anyone can enter it on the verification page and see the holder, the exam, and the result. No phone calls, no attestation letters.' },
]

function Guarantees() {
  return (
    <section className="relative mx-auto max-w-6xl px-5 md:px-8 py-20 md:py-28">
      <Motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }}>
        <Motion.p variants={rise} custom={0} className="m-0 mb-3 text-[11px] font-bold tracking-[.22em] uppercase" style={{ color: RED }}>The platform</Motion.p>
        <Motion.h2 variants={rise} custom={1} className="m-0 mb-12 font-[Fraunces,serif] font-semibold tracking-tight text-balance text-[clamp(30px,4.5vw,48px)]" style={{ color: INK }}>
          Six quiet guarantees.
        </Motion.h2>
      </Motion.div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {GUARANTEES.map((g, i) => (
          <Motion.article key={g.title}
            initial={{ opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.6, ease, delay: (i % 3) * 0.1 }}
            className="rounded-2xl p-7 relative overflow-hidden"
            style={{ background: '#FFFFFF', boxShadow: CARD_SHADOW }}>
            <div aria-hidden="true" className="w-9 h-9 rounded-full mb-5"
              style={{ background: `radial-gradient(circle at 30% 30%, ${g.c}, ${g.c}22 70%)`, opacity: 0.9 }} />
            <h3 className="m-0 mb-2.5 font-[Fraunces,serif] text-[19px] font-semibold leading-snug text-balance" style={{ color: INK }}>{g.title}</h3>
            <p className="m-0 text-[15px] leading-[1.75] text-pretty" style={{ color: '#4B4438' }}>{g.body}</p>
          </Motion.article>
        ))}
      </div>
    </section>
  )
}

/* ── Student path ───────────────────────────────────────── */

const STEPS = [
  { n: '01', title: 'Collect your exam code', body: 'Your institution shares it on the notice board, the admit card, or through your teacher. Matra never emails codes to students.' },
  { n: '02', title: 'Prove it’s you', body: 'Enter your roll number and the email your institution registered for you. Both must match, or the exam will not open.' },
  { n: '03', title: 'Sit the exam', body: 'The exam starts for everyone at the scheduled time. Every answer is saved the moment you choose it.' },
]

function StudentPath() {
  return (
    <section id="students" className="relative overflow-hidden" style={{ background: '#F4EEDF' }}>
      <div className="mx-auto max-w-6xl px-5 md:px-8 py-20 md:py-24">
        <Motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }}>
          <Motion.p variants={rise} custom={0} className="m-0 mb-3 text-[11px] font-bold tracking-[.22em] uppercase" style={{ color: TEAL }}>For students</Motion.p>
          <Motion.h2 variants={rise} custom={1} className="m-0 mb-12 font-[Fraunces,serif] font-semibold tracking-tight text-balance text-[clamp(30px,4.5vw,48px)]" style={{ color: INK }}>
            Your exam, in three steps.
          </Motion.h2>
        </Motion.div>
        <div className="grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Motion.div key={s.n}
              initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, ease, delay: i * 0.12 }}
              className="rounded-2xl p-7" style={{ background: IVORY, border: '1px solid #E5DCC6' }}>
              <span className="font-[Fraunces,serif] text-[34px] font-semibold block mb-3" style={{ color: GOLD }}>{s.n}</span>
              <h3 className="m-0 mb-2 font-[Fraunces,serif] text-[19px] font-semibold text-balance" style={{ color: INK }}>{s.title}</h3>
              <p className="m-0 text-[15px] leading-[1.75] text-pretty" style={{ color: '#4B4438' }}>{s.body}</p>
            </Motion.div>
          ))}
        </div>
        <Motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.3 }}
          className="mt-9 flex flex-wrap gap-x-8 gap-y-3">
          <a href="/students.html" className="text-[14.5px] font-bold no-underline" style={{ color: TEAL }}>Read the full student guide →</a>
          <Link to="/check" className="text-[14.5px] font-bold no-underline" style={{ color: TEAL }}>Run a device check →</Link>
        </Motion.div>
      </div>
    </section>
  )
}

/* ── Verify panel ───────────────────────────────────────── */

function VerifyPanel() {
  return (
    <section className="mx-auto max-w-6xl px-5 md:px-8 py-20 md:py-24">
      <Motion.div
        initial={{ opacity: 0, scale: 0.97 }} whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.7, ease }}
        className="relative overflow-hidden rounded-3xl px-7 py-14 md:px-16 md:py-16"
        style={{ background: `linear-gradient(130deg, ${TEAL} 0%, #0A5C5D 55%, ${CARBON} 130%)` }}>
        <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-24 w-[380px] h-[380px] rounded-full opacity-30"
          style={{ background: `radial-gradient(circle, ${GOLD_L}, transparent 65%)`, filter: 'blur(50px)' }} />
        <p className="m-0 mb-3 text-[11px] font-bold tracking-[.22em] uppercase" style={{ color: GOLD_L }}>Verification</p>
        <h2 className="m-0 mb-4 font-[Fraunces,serif] font-semibold tracking-tight text-balance text-[clamp(28px,4vw,44px)]" style={{ color: IVORY }}>
          Holding a Matra certificate?
        </h2>
        <p className="m-0 mb-8 max-w-lg text-[16px] leading-[1.75] text-pretty" style={{ color: 'rgba(251,247,238,.85)' }}>
          Enter the certificate code and see who earned it, in which exam, with what
          result. It takes seconds. Nothing to sign up for, no one to call.
        </p>
        <Link to="/verify" className="inline-block no-underline rounded-full px-7 py-3.5 text-[15px] font-bold transition-transform hover:scale-[1.03] active:scale-[0.96]"
          style={{ background: `linear-gradient(135deg, ${GOLD_L}, ${GOLD})`, color: CARBON, boxShadow: '0 6px 28px rgba(0,0,0,.3)' }}>
          Verify a certificate →
        </Link>
      </Motion.div>
    </section>
  )
}

/* ── Institutions ───────────────────────────────────────── */

function Institutions() {
  return (
    <section id="institutions" className="relative overflow-hidden" style={{ background: CARBON }}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 right-0 w-[500px] h-[500px] rounded-full opacity-[.13]"
          style={{ background: `radial-gradient(circle, ${RED}, transparent 60%)`, filter: 'blur(70px)' }} />
        <div className="absolute -bottom-40 -left-20 w-[460px] h-[460px] rounded-full opacity-[.1]"
          style={{ background: `radial-gradient(circle, ${TEAL}, transparent 60%)`, filter: 'blur(70px)' }} />
        <Grain />
      </div>
      <div className="relative mx-auto max-w-6xl px-5 md:px-8 py-20 md:py-28 grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <Motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }}>
          <Motion.p variants={rise} custom={0} className="m-0 mb-3 text-[11px] font-bold tracking-[.22em] uppercase" style={{ color: GOLD_L }}>For institutions</Motion.p>
          <Motion.h2 variants={rise} custom={1} className="m-0 mb-5 font-[Fraunces,serif] font-semibold tracking-tight text-balance text-[clamp(30px,4.5vw,50px)]" style={{ color: IVORY }}>
            Run exams that survive scrutiny.
          </Motion.h2>
          <Motion.p variants={rise} custom={2} className="m-0 mb-8 max-w-xl text-[16px] leading-[1.8] text-pretty" style={{ color: 'rgba(251,247,238,.78)' }}>
            Compose papers from your question bank. Watch every student live on exam
            day. Publish results the same hour, with certificates anyone can verify.
            Admin accounts are created by your institution and protected with
            two-factor authentication.
          </Motion.p>
          <Motion.div variants={rise} custom={3}>
            <Link to="/admin" className="inline-block no-underline rounded-full px-7 py-3.5 text-[15px] font-bold transition-transform hover:scale-[1.03] active:scale-[0.96]"
              style={{ background: `linear-gradient(135deg, ${GOLD_L}, ${GOLD})`, color: CARBON, boxShadow: '0 6px 28px rgba(201,162,39,.25)' }}>
              Open the admin portal →
            </Link>
          </Motion.div>
        </Motion.div>
        <Motion.ul initial={{ opacity: 0, x: 24 }} whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.7, ease, delay: 0.15 }}
          className="list-none m-0 p-0 flex flex-col gap-3">
          {[
            ['Question bank', 'Per-institution, reviewed, reusable across exams'],
            ['Mission control', 'Live presence, progress, and time extensions'],
            ['Integrity forensics', 'Anomalies plus chance-corrected similarity flags'],
            ['Verifiable certificates', 'Issued in bulk, revocable, publicly checkable'],
          ].map(([t, d], i) => (
            <li key={t} className="rounded-xl px-5 py-4 flex items-baseline gap-4"
              style={{ background: 'rgba(251,247,238,.05)', border: '1px solid rgba(251,247,238,.1)' }}>
              <span aria-hidden="true" className="font-[Fraunces,serif] text-[15px] font-semibold" style={{ color: [GOLD_L, '#3FB6B0', '#E06B62', GOLD_L][i] }}>0{i + 1}</span>
              <span>
                <strong className="block text-[14.5px] mb-0.5" style={{ color: IVORY }}>{t}</strong>
                <span className="text-[13px] leading-relaxed" style={{ color: 'rgba(251,247,238,.55)' }}>{d}</span>
              </span>
            </li>
          ))}
        </Motion.ul>
      </div>
    </section>
  )
}

/* ── Closing reframe ────────────────────────────────────── */

function Reframe() {
  return (
    <section className="mx-auto max-w-4xl px-5 md:px-8 py-24 md:py-32 text-center">
      <Motion.p
        initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }} transition={{ duration: 0.9, ease }}
        className="m-0 font-[Fraunces,serif] italic font-medium tracking-tight leading-[1.35] text-[clamp(24px,3.6vw,38px)]"
        style={{ color: INK }}>
        Examinations have always run on trust.<br />
        <span style={{ background: `linear-gradient(110deg, ${TEAL}, ${GOLD} 60%, ${RED})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
          Matra makes that trust checkable.
        </span>
      </Motion.p>
    </section>
  )
}
