import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import {
  bufferAnswer, markSynced, getUnsynced, nextSeq, clearAttempt,
  mergeBufferedAnswers,
} from '../answerBuffer'

const A1 = 'attempt-0000-0000-0000-000000000001'
const A2 = 'attempt-0000-0000-0000-000000000002'

function rec(attemptId, questionId, answer, seq) {
  return { attemptId, questionId, answer, timeSpentMs: 1200, seq, savedAt: 1700000000000 + seq }
}

describe('answerBuffer (IndexedDB write-ahead)', () => {
  beforeEach(async () => {
    await clearAttempt(A1)
    await clearAttempt(A2)
  })

  it('round-trips an answer and reports it unsynced', async () => {
    await bufferAnswer(rec(A1, 'q1', 'B', 1))
    const unsynced = await getUnsynced(A1)
    expect(unsynced).toHaveLength(1)
    expect(unsynced[0]).toMatchObject({ questionId: 'q1', answer: 'B', seq: 1, synced: 0 })
  })

  it('last write per question wins', async () => {
    await bufferAnswer(rec(A1, 'q1', 'B', 1))
    await bufferAnswer(rec(A1, 'q1', 'D', 2))
    const unsynced = await getUnsynced(A1)
    expect(unsynced).toHaveLength(1)
    expect(unsynced[0].answer).toBe('D')
  })

  it('markSynced removes records from the unsynced set but keeps them stored', async () => {
    await bufferAnswer(rec(A1, 'q1', 'A', 1))
    await bufferAnswer(rec(A1, 'q2', 'C', 2))
    await markSynced(A1, ['q1'])
    const unsynced = await getUnsynced(A1)
    expect(unsynced.map(r => r.questionId)).toEqual(['q2'])
  })

  it('isolates attempts and clears them independently', async () => {
    await bufferAnswer(rec(A1, 'q1', 'A', 1))
    await bufferAnswer(rec(A2, 'q1', 'B', 1))
    await clearAttempt(A1)
    expect(await getUnsynced(A1)).toHaveLength(0)
    expect((await getUnsynced(A2))[0].answer).toBe('B')
  })

  it('nextSeq is monotonic over existing records', async () => {
    await bufferAnswer(rec(A1, 'q1', 'A', 5))
    expect(await nextSeq(A1)).toBe(6)
  })

  it('returns unsynced in seq order', async () => {
    await bufferAnswer(rec(A1, 'q3', 'A', 3))
    await bufferAnswer(rec(A1, 'q1', 'B', 1))
    await bufferAnswer(rec(A1, 'q2', 'C', 2))
    const unsynced = await getUnsynced(A1)
    expect(unsynced.map(r => r.seq)).toEqual([1, 2, 3])
  })
})

describe('mergeBufferedAnswers (resume recovery)', () => {
  it('buffered unsynced answers overlay server answers', () => {
    const server = { q1: 'A', q2: 'B' }
    const buffered = [
      { ...rec('a', 'q2', 'D', 2), synced: 0 }, // changed after last sync
      { ...rec('a', 'q3', 'C', 3), synced: 0 }, // never reached server
    ]
    const { answeredMap, queue } = mergeBufferedAnswers(server, buffered)
    expect(answeredMap).toEqual({ q1: 'A', q2: 'D', q3: 'C' })
    expect(queue.map(q => q.questionId)).toEqual(['q2', 'q3'])
  })

  it('drops buffered entries the server already has identically', () => {
    const server = { q1: 'A' }
    const buffered = [{ ...rec('a', 'q1', 'A', 1), synced: 0 }]
    const { answeredMap, queue } = mergeBufferedAnswers(server, buffered)
    expect(answeredMap).toEqual({ q1: 'A' })
    expect(queue).toHaveLength(0)
  })

  it('is a no-op with an empty buffer', () => {
    const { answeredMap, queue } = mergeBufferedAnswers({ q1: 'A' }, [])
    expect(answeredMap).toEqual({ q1: 'A' })
    expect(queue).toHaveLength(0)
  })
})
