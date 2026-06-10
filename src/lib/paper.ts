import { supabase } from './supabase'
import type { BankQuestion } from './seed'

/**
 * paper.ts — encrypted question-paper pre-fetch (scale hardening).
 *
 * During the WaitingRoom phase each client downloads the AES-256-CBC
 * encrypted paper (spread over the waiting window with jitter). At exam
 * start, only a 64-hex-char key is fetched — so 2000 simultaneous starts
 * cost 2000 tiny RPCs instead of 2000 full question-paper fetches.
 *
 * The ciphertext never contains correct answers (stripped server-side,
 * same as get_exam_questions). Decryption uses native Web Crypto.
 */

interface CachedPaper {
  ciphertextB64: string
  ivB64: string
}

interface EncryptedPaperRow {
  ciphertext?: string
  iv?: string
}

// Module-level cache: batchId → { ciphertextB64, ivB64 }
const cache = new Map<string, CachedPaper>()

export function hasCachedPaper(batchId: string): boolean {
  return cache.has(batchId)
}

/** Pre-fetch the encrypted paper. Safe to call repeatedly; no-op if cached. */
export async function prefetchPaper(batchId: string): Promise<boolean> {
  if (cache.has(batchId)) return true
  const { data, error } = await supabase.rpc('get_exam_paper_encrypted', { p_batch_id: batchId })
  if (error || !data || data.length === 0) return false
  const row: EncryptedPaperRow | null | undefined = Array.isArray(data) ? data[0] : data
  if (!row?.ciphertext || !row?.iv) return false
  cache.set(batchId, { ciphertextB64: row.ciphertext, ivB64: row.iv })
  return true
}

/**
 * Fetch the key (tiny payload) and decrypt the cached paper.
 * Returns the questions array (same shape as get_exam_questions rows),
 * or null if anything fails (caller falls back to get_exam_questions).
 */
export async function getDecryptedPaper(batchId: string): Promise<BankQuestion[] | null> {
  try {
    const entry = cache.get(batchId)
    if (!entry) return null
    if (!globalThis.crypto?.subtle) return null // non-secure context fallback

    const { data: keyHex, error } = await supabase.rpc('get_paper_key', { p_batch_id: batchId })
    if (error || !keyHex) return null

    const keyBytes = hexToBytes(keyHex as string)
    const iv = b64ToBytes(entry.ivB64)
    const ciphertext = b64ToBytes(entry.ciphertextB64)

    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['decrypt'])
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, ciphertext)
    const questions: unknown = JSON.parse(new TextDecoder().decode(plainBuf))
    if (!Array.isArray(questions) || questions.length === 0) return null
    return questions as BankQuestion[]
  } catch {
    return null // any failure → caller uses the direct-fetch fallback
  }
}

export function clearPaperCache(batchId?: string): void {
  if (batchId) cache.delete(batchId)
  else cache.clear()
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const clean = hex.replace(/^\\x/, '')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16)
  return out
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  // Postgres encode(..., 'base64') wraps lines with \n
  const bin = atob(b64.replace(/\s/g, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
