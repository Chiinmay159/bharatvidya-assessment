/**
 * Pairwise answer-similarity statistics for collusion forensics.
 *
 * Method: probability-standardized match indices (the g2 / omega / Zjk
 * family from the psychometric literature) computed against empirical
 * cohort option frequencies — published, unpatented statistics.
 *
 * The signal is WRONG-answer agreement: two strong students matching on
 * correct answers is expected; two students repeatedly choosing the SAME
 * wrong option is not. For each pair we compare observed wrong-matches W
 * against its expectation under independence and standardize:
 *
 *   per question i, option k:  p_ik = cohort share choosing k
 *   wrong-match prob           w_i  = Σ_{k ≠ correct_i} p_ik²
 *   over items both answered:  E_W = Σ w_i,  V_W = Σ w_i(1 − w_i)
 *   z_W = (W − E_W) / √V_W,    p one-sided with continuity correction
 *
 * Known limitation (v1, no IRT): probabilities are unconditional cohort
 * shares, not ability-conditioned. This slightly inflates the all-match
 * z for pairs of similar ability — which is why flags key on z_W, not
 * z_all. Including the pair's own answers in p_ik biases E_W upward,
 * i.e. errs conservative.
 *
 * Flags are investigative signals, never verdicts. The `high` tier is
 * Bonferroni-adjusted across all pairs, so the chance of even one false
 * `high` flag in an honest batch is ≤ 5%.
 */

export interface SimilarityAttempt {
  attempt_id: string
  roll_number: string
  student_name: string
  attempt_number: number
  answers: Record<string, string> // question_id -> 'A'|'B'|'C'|'D'
}

export interface SimilarityQuestion {
  id: string
  correct_answer: string
}

export type PairTier = 'high' | 'review' | null

export interface PairResult {
  roll_a: string
  name_a: string
  roll_b: string
  name_b: string
  common_items: number
  matches: number
  wrong_matches: number
  expected_wrong_matches: number
  z_all: number | null
  z_wrong: number | null
  p_one_sided: number
  p_bonferroni: number
  tier: PairTier
}

export interface SimilarityReport {
  pairs: PairResult[] // sorted most-suspicious first
  n_students: number
  n_pairs: number
  n_questions: number
  min_common_items: number
  excluded_pairs: number // pairs skipped for too few common items
  low_cohort: boolean // below MIN_STUDENTS — treat statistics as unreliable
}

export const MIN_STUDENTS = 25
export const HIGH_FAMILY_ALPHA = 0.05 // Bonferroni family-wise bar for 'high'
export const REVIEW_P = 0.001 // per-pair bar for 'review'
export const MIN_WRONG_MATCHES = 3 // a flag needs at least this many shared wrong answers

const OPT_INDEX: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 }

/** One-sided upper-tail survival of the standard normal, stable to extreme z. */
export function normalSurvival(z: number): number {
  if (!Number.isFinite(z)) return z > 0 ? 0 : 1
  if (z > 6) {
    // Mills-ratio asymptotic: accurate where the A&S polynomial underflows
    const phi = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI)
    const zi = 1 / z
    return phi * zi * (1 - zi * zi + 3 * zi ** 4)
  }
  if (z < -6) return 1 - normalSurvival(-z)
  // Abramowitz & Stegun 7.1.26 (|err| < 1.5e-7)
  const x = Math.abs(z) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * x)
  const erfc =
    t *
    (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) *
    Math.exp(-x * x)
  return z >= 0 ? erfc / 2 : 1 - erfc / 2
}

/** Keep each student's latest attempt; retries must not pair with themselves. */
function latestPerRoll(attempts: SimilarityAttempt[]): SimilarityAttempt[] {
  const byRoll = new Map<string, SimilarityAttempt>()
  for (const a of attempts) {
    const prev = byRoll.get(a.roll_number)
    if (!prev || a.attempt_number > prev.attempt_number) byRoll.set(a.roll_number, a)
  }
  return [...byRoll.values()]
}

export function computeSimilarityReport(
  questions: SimilarityQuestion[],
  attempts: SimilarityAttempt[],
): SimilarityReport {
  const students = latestPerRoll(attempts)
  const nQ = questions.length
  const n = students.length
  const qIndex = new Map<string, number>()
  questions.forEach((q, i) => qIndex.set(q.id, i))
  const correct = new Int8Array(nQ)
  questions.forEach((q, i) => { correct[i] = OPT_INDEX[q.correct_answer] ?? -1 })

  // Answer matrix: -1 = unanswered
  const mat: Int8Array[] = students.map(s => {
    const row = new Int8Array(nQ).fill(-1)
    for (const [qid, ans] of Object.entries(s.answers)) {
      const qi = qIndex.get(qid)
      const oi = OPT_INDEX[ans]
      if (qi !== undefined && oi !== undefined) row[qi] = oi
    }
    return row
  })

  // Cohort option shares -> per-question match/wrong-match probabilities
  const m = new Float64Array(nQ) // P(two independent students match)
  const mv = new Float64Array(nQ) // m(1-m)
  const w = new Float64Array(nQ) // P(match on the same WRONG option)
  const wv = new Float64Array(nQ)
  for (let qi = 0; qi < nQ; qi++) {
    const counts = [0, 0, 0, 0]
    let nAns = 0
    for (let s = 0; s < n; s++) {
      const a = mat[s][qi]
      if (a >= 0) { counts[a]++; nAns++ }
    }
    if (nAns === 0) continue
    let mi = 0
    let wi = 0
    for (let k = 0; k < 4; k++) {
      const p = counts[k] / nAns
      mi += p * p
      if (k !== correct[qi]) wi += p * p
    }
    m[qi] = mi
    mv[qi] = mi * (1 - mi)
    w[qi] = wi
    wv[qi] = wi * (1 - wi)
  }

  // Need enough jointly-answered items for the normal approximation to
  // mean anything; scale down for short papers but never below 8.
  const minCommon = Math.max(8, Math.min(20, Math.floor(0.6 * nQ)))

  const rawPairs: Array<Omit<PairResult, 'p_bonferroni' | 'tier'>> = []
  let excluded = 0
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const A = mat[i]
      const B = mat[j]
      let common = 0
      let matches = 0
      let wrong = 0
      let eM = 0
      let vM = 0
      let eW = 0
      let vW = 0
      for (let qi = 0; qi < nQ; qi++) {
        const a = A[qi]
        const b = B[qi]
        if (a < 0 || b < 0) continue
        common++
        eM += m[qi]; vM += mv[qi]
        eW += w[qi]; vW += wv[qi]
        if (a === b) {
          matches++
          if (a !== correct[qi]) wrong++
        }
      }
      if (common < minCommon) { excluded++; continue }
      const zAll = vM > 0 ? (matches - eM) / Math.sqrt(vM) : null
      const zWrong = vW > 0 ? (wrong - eW) / Math.sqrt(vW) : null
      const p = vW > 0 ? Math.min(1, normalSurvival((wrong - 0.5 - eW) / Math.sqrt(vW))) : 1
      rawPairs.push({
        roll_a: students[i].roll_number, name_a: students[i].student_name,
        roll_b: students[j].roll_number, name_b: students[j].student_name,
        common_items: common, matches, wrong_matches: wrong,
        expected_wrong_matches: eW, z_all: zAll, z_wrong: zWrong, p_one_sided: p,
      })
    }
  }

  const nPairs = rawPairs.length
  const pairs: PairResult[] = rawPairs.map(r => {
    const pBonf = Math.min(1, r.p_one_sided * nPairs)
    let tier: PairTier = null
    if (r.wrong_matches >= MIN_WRONG_MATCHES) {
      if (pBonf <= HIGH_FAMILY_ALPHA) tier = 'high'
      else if (r.p_one_sided <= REVIEW_P) tier = 'review'
    }
    return { ...r, p_bonferroni: pBonf, tier }
  })
  pairs.sort((a, b) => a.p_one_sided - b.p_one_sided || b.wrong_matches - a.wrong_matches)

  return {
    pairs,
    n_students: n,
    n_pairs: nPairs,
    n_questions: nQ,
    min_common_items: minCommon,
    excluded_pairs: excluded,
    low_cohort: n < MIN_STUDENTS,
  }
}
