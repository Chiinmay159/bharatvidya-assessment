import { describe, it, expect } from 'vitest'
import { selectAndShuffleQuestions } from '../seed.js'

/** Helper: create a minimal question pool sorted by sort_order */
function makeQuestions(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `q${i + 1}`,
    question_text: `Question ${i + 1}`,
    option_a: `${i + 1}A`,
    option_b: `${i + 1}B`,
    option_c: `${i + 1}C`,
    option_d: `${i + 1}D`,
    sort_order: i + 1,
  }))
}

describe('selectAndShuffleQuestions', () => {
  const questions = makeQuestions(10)
  const rollNumber = 'STU001'
  const batchId = 'batch-abc'

  it('returns all questions when questionsPerStudent is null', () => {
    const result = selectAndShuffleQuestions(questions, rollNumber, batchId, null)
    expect(result).toHaveLength(questions.length)

    // Every original question ID should be present
    const returnedIds = result.map(q => q.questionId)
    const originalIds = questions.map(q => q.id)
    expect(returnedIds.sort()).toEqual(originalIds.sort())
  })

  it('limits to questionsPerStudent when specified', () => {
    const limit = 5
    const result = selectAndShuffleQuestions(questions, rollNumber, batchId, limit)
    expect(result).toHaveLength(limit)

    // All returned IDs should come from the original pool
    const originalIds = new Set(questions.map(q => q.id))
    result.forEach(q => {
      expect(originalIds.has(q.questionId)).toBe(true)
    })
  })

  it('same seed (roll + batch) produces same order (deterministic)', () => {
    const result1 = selectAndShuffleQuestions(questions, rollNumber, batchId, null)
    const result2 = selectAndShuffleQuestions(questions, rollNumber, batchId, null)

    // Exact same question order
    expect(result1.map(q => q.questionId)).toEqual(result2.map(q => q.questionId))

    // Exact same option order within each question
    result1.forEach((q, i) => {
      expect(q.options.map(o => o.originalLabel)).toEqual(
        result2[i].options.map(o => o.originalLabel)
      )
    })
  })

  it('different roll numbers produce different orders', () => {
    const resultA = selectAndShuffleQuestions(questions, 'STU001', batchId, null)
    const resultB = selectAndShuffleQuestions(questions, 'STU002', batchId, null)

    const orderA = resultA.map(q => q.questionId)
    const orderB = resultB.map(q => q.questionId)

    // With 10 questions, probability of identical shuffle is 1/10! -- effectively zero
    expect(orderA).not.toEqual(orderB)
  })

  it('returns shuffled options with display labels A-D and originalLabel tracking', () => {
    const result = selectAndShuffleQuestions(questions, rollNumber, batchId, 1)
    const q = result[0]

    expect(q).toHaveProperty('questionId')
    expect(q).toHaveProperty('questionText')
    expect(q.options).toHaveLength(4)

    const labels = q.options.map(o => o.label)
    expect(labels).toEqual(['A', 'B', 'C', 'D'])

    // Every option must have an originalLabel from the set {A, B, C, D}
    const origLabels = q.options.map(o => o.originalLabel).sort()
    expect(origLabels).toEqual(['A', 'B', 'C', 'D'])
  })
})
