/**
 * k6 load test — full student exam lifecycle at scale.
 *
 * Simulates the REAL client behavior after the Bundle-1 scale redesign:
 *   waiting-room jittered paper pre-fetch → key fetch at start →
 *   create_attempt → claim_session → per-answer saves over the exam →
 *   jittered heartbeats → submit_exam.
 *
 * RUN AGAINST STAGING ONLY — never the production project.
 *
 * Setup:
 *   1. Create a staging Supabase project, apply schema.sql + all migrations
 *   2. Create a batch (status 'scheduled', no access code) + N questions,
 *      then flip it to 'active' mid-test (or pre-set 'active' for simple runs)
 *   3. Run:
 *      k6 run \
 *        -e SUPABASE_URL=https://<staging>.supabase.co \
 *        -e SUPABASE_ANON_KEY=<staging-anon-key> \
 *        -e BATCH_ID=<batch-uuid> \
 *        -e VUS=2000 -e QUESTIONS=20 \
 *        loadtest/k6-exam-flow.js
 *
 * Pass criteria (exit code reflects thresholds below):
 *   - <1% RPC errors
 *   - p95 RPC latency < 2s under full load
 */
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const BASE = __ENV.SUPABASE_URL
const KEY = __ENV.SUPABASE_ANON_KEY
const BATCH_ID = __ENV.BATCH_ID
const N_QUESTIONS = parseInt(__ENV.QUESTIONS || '20')
const VUS = parseInt(__ENV.VUS || '500')

const rpcErrors = new Rate('rpc_errors')
const rpcDuration = new Trend('rpc_duration', true)

export const options = {
  scenarios: {
    exam: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: VUS },   // students arrive at waiting room
        { duration: '10m', target: VUS },  // exam in progress
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds: {
    rpc_errors: ['rate<0.01'],
    rpc_duration: ['p(95)<2000'],
  },
}

function rpc(name, body) {
  const res = http.post(`${BASE}/rest/v1/rpc/${name}`, JSON.stringify(body || {}), {
    headers: {
      'Content-Type': 'application/json',
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
    },
    tags: { rpc: name },
  })
  rpcDuration.add(res.timings.duration, { rpc: name })
  const ok = res.status >= 200 && res.status < 300
  rpcErrors.add(!ok)
  return { ok, status: res.status, body: res.body }
}

export default function () {
  const roll = `LT${__VU}-${__ITER}`
  const name = `LoadTest Student ${__VU}`

  // 1. Waiting room: jittered encrypted-paper pre-fetch
  sleep(Math.random() * 45)
  const paper = rpc('get_exam_paper_encrypted', { p_batch_id: BATCH_ID })
  check(paper, { 'paper prefetched': (r) => r.ok })

  // 2. Exam start: tiny key fetch (the spike we engineered for)
  sleep(Math.random() * 4)
  const key = rpc('get_paper_key', { p_batch_id: BATCH_ID })
  check(key, { 'key released': (r) => r.ok })

  // 3. Attempt + session
  const attempt = rpc('create_attempt', {
    p_batch_id: BATCH_ID, p_roll_number: roll, p_student_name: name,
    p_email: null, p_access_code: null,
  })
  if (!attempt.ok) return
  const attemptId = JSON.parse(attempt.body)

  const session = rpc('claim_session', {
    p_attempt_id: attemptId, p_roll_number: roll, p_student_name: name,
  })
  if (!session.ok) return
  const token = JSON.parse(session.body)

  // 4. Question list (fallback path — also covers servers without 011)
  const qs = rpc('get_exam_questions', { p_batch_id: BATCH_ID })
  if (!qs.ok) return
  const questions = JSON.parse(qs.body).slice(0, N_QUESTIONS)

  // 5. Answer at human pace (15–45s/question), heartbeat every ~30s
  let lastHeartbeat = Date.now()
  for (const q of questions) {
    sleep(15 + Math.random() * 30)
    rpc('save_response', {
      p_attempt_id: attemptId,
      p_question_id: q.id,
      p_selected_answer: ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)],
      p_session_token: token,
      p_time_spent_ms: Math.floor(15000 + Math.random() * 30000),
    })
    if (Date.now() - lastHeartbeat > 30000) {
      rpc('check_session', { p_attempt_id: attemptId, p_session_token: token })
      lastHeartbeat = Date.now()
    }
  }

  // 6. Submit
  const sub = rpc('submit_exam', { p_attempt_id: attemptId, p_session_token: token })
  check(sub, { 'submitted': (r) => r.ok })
}
