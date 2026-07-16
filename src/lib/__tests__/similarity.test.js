import { describe, it, expect } from 'vitest'
import { computeSimilarityReport, normalSurvival, MIN_STUDENTS } from '../similarity'

/* Deterministic LCG so cohort fixtures are reproducible (no Math.random) */
function lcg(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const OPTS = ['A', 'B', 'C', 'D']

function makeQuestions(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `q${i}`,
    correct_answer: OPTS[i % 4],
  }))
}

/** Random cohort: each student answers correct with prob pCorrect, else a
    weighted wrong option (one popular distractor per question). */
function makeCohort(questions, nStudents, rand, pCorrect = 0.6) {
  return Array.from({ length: nStudents }, (_, s) => {
    const answers = {}
    for (const q of questions) {
      if (rand() < pCorrect) {
        answers[q.id] = q.correct_answer
      } else {
        const wrong = OPTS.filter(o => o !== q.correct_answer)
        const r = rand()
        answers[q.id] = r < 0.5 ? wrong[0] : r < 0.8 ? wrong[1] : wrong[2]
      }
    }
    return {
      attempt_id: `a${s}`,
      roll_number: `R${s}`,
      student_name: `Student ${s}`,
      attempt_number: 1,
      answers,
    }
  })
}

describe('normalSurvival', () => {
  it('matches known values of the standard normal upper tail', () => {
    expect(normalSurvival(0)).toBeCloseTo(0.5, 4)
    expect(normalSurvival(1.6449)).toBeCloseTo(0.05, 3)
    expect(normalSurvival(3)).toBeCloseTo(0.00135, 4)
    expect(normalSurvival(-1.6449)).toBeCloseTo(0.95, 3)
  })
  it('stays finite and monotone in the extreme tail', () => {
    const p8 = normalSurvival(8)
    const p10 = normalSurvival(10)
    expect(p8).toBeGreaterThan(0)
    expect(p8).toBeLessThan(1e-14)
    expect(p10).toBeLessThan(p8)
  })
})

describe('computeSimilarityReport — exact small case', () => {
  // 3 students, minimum paper: verify expectations by hand.
  // Force minCommon = 8 via 8 questions all answered.
  const questions = makeQuestions(8) // correct: A B C D A B C D
  const student = (roll, answers) => ({
    attempt_id: roll, roll_number: roll, student_name: roll, attempt_number: 1, answers,
  })
  // s1 and s2 identical (all A); s3 all correct.
  const all = qs => Object.fromEntries(qs.map(q => [q.id, 'A']))
  const allCorrect = qs => Object.fromEntries(qs.map(q => [q.id, q.correct_answer]))
  const report = computeSimilarityReport(questions, [
    student('s1', all(questions)),
    student('s2', all(questions)),
    student('s3', allCorrect(questions)),
  ])

  it('counts matches and wrong matches exactly', () => {
    const p12 = report.pairs.find(p => p.roll_a === 's1' && p.roll_b === 's2')
    expect(p12.common_items).toBe(8)
    expect(p12.matches).toBe(8)
    // correct is A on questions 0 and 4 → 6 of the 8 matches are wrong-matches
    expect(p12.wrong_matches).toBe(6)
  })

  it('computes E[wrong matches] from cohort option shares', () => {
    // On a non-A question: shares are A=2/3 (wrong), correct=1/3.
    // w_i = (2/3)^2 = 4/9 for the 6 non-A questions; on A-questions the
    // only wrong shares are 0 → w_i = 0. E_W = 6 * 4/9 = 8/3.
    const p12 = report.pairs.find(p => p.roll_a === 's1' && p.roll_b === 's2')
    expect(p12.expected_wrong_matches).toBeCloseTo(8 / 3, 10)
  })

  it('flags the identical pair as most suspicious', () => {
    expect(report.pairs[0].roll_a).toBe('s1')
    expect(report.pairs[0].roll_b).toBe('s2')
  })

  it('reports low_cohort below MIN_STUDENTS', () => {
    expect(report.n_students).toBeLessThan(MIN_STUDENTS)
    expect(report.low_cohort).toBe(true)
  })
})

describe('computeSimilarityReport — planted copier in a realistic cohort', () => {
  const questions = makeQuestions(40)
  const rand = lcg(42)
  const cohort = makeCohort(questions, 60, rand)
  // Plant: student 1 copies student 0 verbatim.
  cohort[1] = { ...cohort[1], answers: { ...cohort[0].answers } }
  const report = computeSimilarityReport(questions, cohort)

  it('ranks the planted pair first and tiers it high', () => {
    const top = report.pairs[0]
    expect([top.roll_a, top.roll_b].sort()).toEqual(['R0', 'R1'])
    expect(top.tier).toBe('high')
    expect(top.wrong_matches).toBeGreaterThanOrEqual(3)
  })

  it('flags no other pair high (Bonferroni holds on honest pairs)', () => {
    const highs = report.pairs.filter(p => p.tier === 'high')
    expect(highs).toHaveLength(1)
  })

  it('compares every pair', () => {
    expect(report.n_students).toBe(60)
    expect(report.n_pairs + report.excluded_pairs).toBe((60 * 59) / 2)
  })
})

describe('computeSimilarityReport — guards', () => {
  it('uses only the latest attempt per roll (no self-pairing)', () => {
    const questions = makeQuestions(10)
    const answers = Object.fromEntries(questions.map(q => [q.id, 'B']))
    const attempts = [
      { attempt_id: 'x1', roll_number: 'R1', student_name: 'One', attempt_number: 1, answers },
      { attempt_id: 'x2', roll_number: 'R1', student_name: 'One', attempt_number: 2, answers },
      { attempt_id: 'y1', roll_number: 'R2', student_name: 'Two', attempt_number: 1, answers },
    ]
    const report = computeSimilarityReport(questions, attempts)
    expect(report.n_students).toBe(2)
    expect(report.n_pairs).toBe(1)
  })

  it('excludes pairs with too few jointly answered items', () => {
    const questions = makeQuestions(30)
    const rand = lcg(7)
    const cohort = makeCohort(questions, 30, rand)
    // Student 0 answered only the first 3 questions.
    cohort[0] = {
      ...cohort[0],
      answers: Object.fromEntries(questions.slice(0, 3).map(q => [q.id, 'A'])),
    }
    const report = computeSimilarityReport(questions, cohort)
    expect(report.excluded_pairs).toBe(29)
    const involvingR0 = report.pairs.filter(p => p.roll_a === 'R0' || p.roll_b === 'R0')
    expect(involvingR0).toHaveLength(0)
  })
})
