/* Dev-only supabase stub for the design harness (vite aliases
   src/lib/supabase.ts to this file ONLY when DESIGN_HARNESS=1).
   A chainable query builder over static fixtures so the real admin view
   components render with representative data — no network, no session.
   Filtering support is minimal on purpose: eq/in/order/limit cover what
   the admin views need to group data sensibly. */

const now = Date.now()
const iso = (offsetMin) => new Date(now + offsetMin * 60000).toISOString()

const ORGS = [
  { id: 'org-1', name: 'BORI', display_name: 'Bhandarkar Oriental Research Institute', logo_url: null },
  { id: 'org-2', name: 'MITWPU', display_name: 'MIT World Peace University', logo_url: null },
]

const BATCHES = [
  { id: 'b-1', name: 'Introduction to IKS · Batch 7', status: 'active', scheduled_start: iso(-40), duration_minutes: 60, questions_per_student: 20, organization_id: 'org-1', listed: false, has_access_code: true, exam_code: 'K7NM4P2Q', show_results: true, pass_percentage: 40, max_attempts: 1, series_module_id: null, created_at: iso(-2000), access_code: null },
  { id: 'b-2', name: 'Veda Vidya · Module 2', status: 'scheduled', scheduled_start: iso(60 * 26), duration_minutes: 45, questions_per_student: 25, organization_id: 'org-1', listed: true, has_access_code: false, exam_code: 'VD2MOD25', show_results: true, pass_percentage: 40, max_attempts: 1, series_module_id: 'sm-1', created_at: iso(-4000), access_code: null },
  { id: 'b-3', name: 'Sanskrit Foundations · Batch 3', status: 'scheduled', scheduled_start: iso(60 * 50), duration_minutes: 90, questions_per_student: 40, organization_id: 'org-2', listed: false, has_access_code: true, exam_code: 'SF3QRT88', show_results: false, pass_percentage: 50, max_attempts: 1, series_module_id: null, created_at: iso(-3000), access_code: null },
  { id: 'b-4', name: 'Arthashastra Reading · Final', status: 'completed', scheduled_start: iso(-60 * 72), duration_minutes: 60, questions_per_student: 30, organization_id: 'org-1', listed: false, has_access_code: true, exam_code: 'AR9FIN01', show_results: true, pass_percentage: 40, max_attempts: 1, series_module_id: null, created_at: iso(-9000), access_code: null },
  { id: 'b-5', name: 'Introduction to IKS · Batch 6', status: 'completed', scheduled_start: iso(-60 * 200), duration_minutes: 60, questions_per_student: 20, organization_id: 'org-2', listed: false, has_access_code: true, exam_code: 'IK6PRV55', show_results: true, pass_percentage: 40, max_attempts: 1, series_module_id: null, created_at: iso(-12000), access_code: null },
]

const STUDENTS = ['Aarav Menon', 'Diya Nair', 'Kabir Rao', 'Meera Iyer', 'Rohan Das', 'Sara Khan', 'Vikram Sen', 'Anaya Kulkarni']

const ATTEMPTS = STUDENTS.map((s, i) => ({
  id: `at-${i}`, batch_id: i < 5 ? 'b-4' : 'b-1', student_name: s,
  roll_number: `GEO-20${41 + i}`, email: `student${i}@example.edu`,
  started_at: iso(-60 * 72 + i), submitted_at: i === 7 ? null : iso(-60 * 71 + i),
  score: [18, 17, 15, 14, 12, 16, 11, null][i], total_questions: 20,
  status: i === 7 ? 'in_progress' : 'submitted',
  tab_switch_count: [0, 0, 2, 0, 1, 0, 0, 0][i], is_late: false, seed: 1000 + i,
}))

const ROSTER = STUDENTS.map((s, i) => ({
  id: `ro-${i}`, batch_id: i < 5 ? 'b-4' : 'b-1', student_name: s,
  roll_number: `GEO-20${41 + i}`, email: `student${i}@example.edu`,
}))

const QUESTIONS = Array.from({ length: 6 }, (_, i) => ({
  id: `q-${i}`, batch_id: 'b-4', sort_order: i + 1,
  question_text: ['Which upaveda relates to Ayurveda?', 'The Arthashastra is chiefly attributed to —', 'Panini’s grammar is titled —', 'Which darshana emphasises logic?', 'The term "matra" in prosody measures —', 'Which veda contains the Gayatri mantra?'][i],
  option_a: 'Option A', option_b: 'Option B', option_c: 'Option C', option_d: 'Option D',
  correct_answer: 'A', marks: 1,
}))

const BANK_QUESTIONS = QUESTIONS.map((q, i) => ({
  ...q, id: `bq-${i}`, batch_id: null, topic: ['Vedanga', 'Niti', 'Vyakarana', 'Darshana', 'Chandas', 'Veda'][i],
  difficulty: ['easy', 'medium', 'medium', 'hard', 'medium', 'easy'][i], times_used: [4, 2, 7, 1, 3, 5][i],
  status: ['approved', 'approved', 'in_review', 'draft', 'approved', 'retired'][i],
  created_by: i === 2 ? 'registrar@bori.ac.in' : 'chinmay@matramedia.co.in',
  created_at: iso(-8000), updated_at: iso(-4000 + i * 100),
}))

const ADMIN_USERS = [
  { id: 'au-1', email: 'chinmay@matramedia.co.in', role: 'owner', organization_id: null, created_at: iso(-90000), created_by: null, organizations: null },
  { id: 'au-2', email: 'registrar@bori.ac.in', role: 'examiner', organization_id: 'org-1', created_at: iso(-50000), created_by: 'chinmay@matramedia.co.in', organizations: ORGS[0] },
  { id: 'au-3', email: 'invigilator@mitwpu.edu.in', role: 'invigilator', organization_id: 'org-2', created_at: iso(-20000), created_by: 'chinmay@matramedia.co.in', organizations: ORGS[1] },
]

const CERTIFICATES = ATTEMPTS.filter(a => a.score >= 12).map((a, i) => ({
  id: `c-${i}`, attempt_id: a.id, batch_id: a.batch_id, student_name: a.student_name,
  roll_number: a.roll_number, verify_code: `MATRA-7F3K-9QX${i}`, issued_at: iso(-60 * 70),
  revoked_at: null, score: a.score, total_questions: a.total_questions,
}))

const AUDIT_LOG = [
  { id: 'al-1', actor: 'chinmay@matramedia.co.in', action: 'publish_results', target: 'Arthashastra Reading · Final', created_at: iso(-60 * 70), details: {} },
  { id: 'al-2', actor: 'chinmay@matramedia.co.in', action: 'grant_time_extension', target: 'Kabir Rao · +5 min', created_at: iso(-60 * 71), details: {} },
  { id: 'al-3', actor: 'registrar@bori.ac.in', action: 'upload_roster', target: 'Introduction to IKS · Batch 7', created_at: iso(-60 * 90), details: {} },
]

const TABLES = {
  organizations: ORGS, batches: BATCHES, attempts: ATTEMPTS, roster: ROSTER,
  questions: QUESTIONS, bank_questions: BANK_QUESTIONS, admin_users: ADMIN_USERS,
  certificates: CERTIFICATES, audit_log: AUDIT_LOG,
  students: STUDENTS.map((s, i) => ({ id: `st-${i}`, student_name: s, roll_number: `GEO-20${41 + i}`, email: `student${i}@example.edu` })),
  series_roster: [], series_modules: [], exam_series: [], tab_switches: [], responses: [], late_responses: [],
}

const RPCS = {
  admin_role: 'owner',
  is_admin: true,
  is_admin_member: true,
  mission_control: BATCHES.filter(b => b.status === 'active').length
    ? STUDENTS.map((s, i) => ({
        attempt_id: `at-${i}`, student_name: s, roll_number: `GEO-20${41 + i}`,
        state: i === 7 ? 'in_progress' : i === 6 ? 'not_started' : 'submitted',
        answers_saved: i === 7 ? 12 : 20, tab_switches: [0, 0, 2, 0, 1, 0, 0, 0][i],
        clipboard: 0, integrity_flags: [], extra_time_minutes: i === 2 ? 5 : 0,
        last_seen: iso(-1),
      }))
    : [],
  item_analysis: QUESTIONS.map((q, i) => ({
    question_id: q.id, sort_order: q.sort_order, question_text: q.question_text,
    attempts: 8, correct: 8 - i, pct_correct: Math.round(((8 - i) / 8) * 100),
    discrimination: [0.42, 0.38, 0.3, 0.22, 0.35, 0.4][i],
  })),
  batch_similarity_matrix: [],
  anomaly_report: [],
  program_analytics: [],
  bank_item_performance: [],
  series_results: [],
}

function makeBuilder(rows) {
  const state = { rows: [...(rows ?? [])], single: false }
  const b = {}
  const chain = (fn) => (...args) => { fn?.(...args); return b }
  b.select = chain()
  b.eq = chain((col, val) => { state.rows = state.rows.filter(r => r[col] === val) })
  b.neq = chain((col, val) => { state.rows = state.rows.filter(r => r[col] !== val) })
  b.in = chain((col, vals) => { state.rows = state.rows.filter(r => vals.includes(r[col])) })
  b.not = chain((col, op, val) => { if (op === 'is' && val === null) state.rows = state.rows.filter(r => r[col] !== null) })
  b.is = chain((col, val) => { state.rows = state.rows.filter(r => r[col] === val) })
  b.gte = chain(); b.lte = chain(); b.gt = chain(); b.lt = chain(); b.like = chain(); b.ilike = chain(); b.or = chain(); b.range = chain()
  b.order = chain((col, opts = {}) => {
    const asc = opts.ascending !== false
    state.rows.sort((x, y) => (x[col] > y[col] ? 1 : -1) * (asc ? 1 : -1))
  })
  b.limit = chain(n => { state.rows = state.rows.slice(0, n) })
  b.single = () => { state.single = true; return b }
  b.maybeSingle = () => { state.single = true; return b }
  // mutations are no-ops that echo success
  b.insert = chain(); b.update = chain(); b.upsert = chain(); b.delete = chain()
  b.then = (resolve, reject) => {
    const data = state.single ? (state.rows[0] ?? null) : state.rows
    return Promise.resolve({ data, error: null }).then(resolve, reject)
  }
  return b
}

const session = {
  user: { id: 'user-dev', email: 'chinmay@matramedia.co.in' },
  access_token: 'dev', expires_at: Math.floor(now / 1000) + 86400,
}

export const supabase = {
  from: (table) => makeBuilder(TABLES[table]),
  rpc: async (name) => ({ data: RPCS[name] ?? [], error: null }),
  functions: { invoke: async () => ({ data: { ok: true }, error: null }) },
  auth: {
    getSession: async () => ({ data: { session } }),
    getUser: async () => ({ data: { user: session.user } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ({ error: null }),
    refreshSession: async () => ({ data: { session }, error: null }),
    signInWithOAuth: async () => ({ error: null }),
    signInWithPassword: async () => ({ error: null }),
    mfa: {
      getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal2', nextLevel: 'aal2' } }),
      listFactors: async () => ({ data: { all: [{ id: 'f-1', factor_type: 'totp', status: 'verified', friendly_name: 'Authenticator · 18 Jul 2026', created_at: iso(-60) }], totp: [{ id: 'f-1', factor_type: 'totp', status: 'verified', friendly_name: 'Authenticator · 18 Jul 2026', created_at: iso(-60) }] }, error: null }),
      enroll: async () => ({ data: null, error: { message: 'Design harness: enrollment disabled' } }),
      challenge: async () => ({ data: null, error: { message: 'Design harness' } }),
      verify: async () => ({ data: null, error: { message: 'Design harness' } }),
      unenroll: async () => ({ data: null, error: null }),
    },
  },
  channel: () => ({ on() { return this }, subscribe() { return this } }),
  removeChannel: () => {},
}
