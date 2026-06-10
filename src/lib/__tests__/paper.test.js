import { describe, it, expect, vi, beforeEach } from 'vitest'
import { webcrypto } from 'node:crypto'
import { createCipheriv, randomBytes } from 'node:crypto'
import { Buffer } from 'node:buffer'

const rpcMock = vi.fn()
vi.mock('../supabase', () => ({
  supabase: { rpc: (...args) => rpcMock(...args) },
}))

import { prefetchPaper, getDecryptedPaper, hasCachedPaper, clearPaperCache } from '../paper'

// jsdom lacks Web Crypto — use Node's implementation
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
}

/** Encrypt exactly like pgcrypto encrypt_iv(..., 'aes-cbc/pad:pkcs') */
function encryptLikePgcrypto(jsonText, key, iv) {
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  return Buffer.concat([cipher.update(jsonText, 'utf8'), cipher.final()])
}

const QUESTIONS = [
  { id: 'q1', question_text: 'धर्म किम्?', option_a: 'a', option_b: 'b', option_c: 'c', option_d: 'd', sort_order: 1 },
  { id: 'q2', question_text: 'Second', option_a: 'a', option_b: 'b', option_c: 'c', option_d: 'd', sort_order: 2 },
]

describe('paper (encrypted pre-fetch)', () => {
  beforeEach(() => {
    clearPaperCache()
    rpcMock.mockReset()
  })

  it('prefetches, then decrypts with the released key', async () => {
    const key = randomBytes(32)
    const iv = randomBytes(16)
    const ct = encryptLikePgcrypto(JSON.stringify(QUESTIONS), key, iv)

    rpcMock.mockImplementation(async (name) => {
      if (name === 'get_exam_paper_encrypted') {
        // Postgres base64 wraps at 76 chars — emulate that
        const wrapped = ct.toString('base64').replace(/(.{76})/g, '$1\n')
        return { data: [{ ciphertext: wrapped, iv: iv.toString('base64') }], error: null }
      }
      if (name === 'get_paper_key') {
        return { data: key.toString('hex'), error: null }
      }
      return { data: null, error: { message: 'unknown rpc' } }
    })

    expect(hasCachedPaper('batch1')).toBe(false)
    expect(await prefetchPaper('batch1')).toBe(true)
    expect(hasCachedPaper('batch1')).toBe(true)

    const questions = await getDecryptedPaper('batch1')
    expect(questions).toHaveLength(2)
    expect(questions[0].question_text).toBe('धर्म किम्?') // Devanagari survives round-trip
    expect(questions[1].id).toBe('q2')
  })

  it('prefetch is idempotent (single RPC for repeat calls)', async () => {
    rpcMock.mockResolvedValue({ data: [{ ciphertext: 'YQ==', iv: 'YQ==' }], error: null })
    await prefetchPaper('batch2')
    await prefetchPaper('batch2')
    expect(rpcMock).toHaveBeenCalledTimes(1)
  })

  it('returns null (fallback signal) when key release fails', async () => {
    rpcMock.mockImplementation(async (name) => {
      if (name === 'get_exam_paper_encrypted') {
        return { data: [{ ciphertext: 'AAAA', iv: 'AAAA' }], error: null }
      }
      return { data: null, error: { message: 'Exam has not started' } }
    })
    await prefetchPaper('batch3')
    expect(await getDecryptedPaper('batch3')).toBeNull()
  })

  it('returns null when nothing was prefetched', async () => {
    expect(await getDecryptedPaper('never-fetched')).toBeNull()
  })

  it('returns null on corrupted ciphertext (graceful fallback)', async () => {
    const key = randomBytes(32)
    rpcMock.mockImplementation(async (name) => {
      if (name === 'get_exam_paper_encrypted') {
        return { data: [{ ciphertext: randomBytes(48).toString('base64'), iv: randomBytes(16).toString('base64') }], error: null }
      }
      if (name === 'get_paper_key') return { data: key.toString('hex'), error: null }
      return { data: null, error: null }
    })
    await prefetchPaper('batch4')
    expect(await getDecryptedPaper('batch4')).toBeNull()
  })
})
