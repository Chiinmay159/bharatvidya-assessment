/**
 * answerBuffer — IndexedDB write-ahead buffer for exam answers.
 *
 * Every answer is persisted locally BEFORE the network save attempt, so a
 * reload, crash, or connectivity blip never loses a selection. Records are
 * marked synced once the server accepts them; unsynced records are re-queued
 * on resume and drained on reconnect.
 *
 * Failure policy: storage is best-effort and NEVER interrupts the exam —
 * every function swallows storage errors (quota, private mode, eviction)
 * and degrades to the in-memory queue the exam hook already keeps.
 * Eviction reality (verified against MDN/WebKit, 2026): best-effort origin
 * data can be dropped whole-origin under pressure; navigator.storage.persist()
 * prevents that where granted (Chrome/Safari decide silently on heuristics,
 * Firefox prompts) — request it, but never rely on it.
 */

export interface BufferedAnswer {
  attemptId: string
  questionId: string
  answer: string
  timeSpentMs: number | null
  seq: number
  savedAt: number // client clock — informational only, never trusted server-side
  synced: 0 | 1 // IDB indexes can't use booleans
}

const DB_NAME = 'bv-exam-buffer'
const STORE = 'answers'

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return }
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: ['attemptId', 'questionId'] })
          store.createIndex('byAttempt', 'attemptId')
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore | null {
  try {
    return db.transaction(STORE, mode).objectStore(STORE)
  } catch {
    return null
  }
}

function reqDone<T>(req: IDBRequest<T>): Promise<T | null> {
  return new Promise(resolve => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
  })
}

/** Persist an answer (write-ahead, pre-network). Last write per question wins. */
export async function bufferAnswer(rec: Omit<BufferedAnswer, 'synced'>): Promise<void> {
  const db = await openDb()
  if (!db) return
  const store = tx(db, 'readwrite')
  if (!store) return
  await reqDone(store.put({ ...rec, synced: 0 }))
}

/** Mark question answers as accepted by the server. */
export async function markSynced(attemptId: string, questionIds: string[]): Promise<void> {
  const db = await openDb()
  if (!db) return
  const store = tx(db, 'readwrite')
  if (!store) return
  for (const qid of questionIds) {
    const existing = (await reqDone(store.get([attemptId, qid]))) as BufferedAnswer | null
    if (existing) await reqDone(store.put({ ...existing, synced: 1 }))
  }
}

/** All unsynced answers for an attempt, oldest first. */
export async function getUnsynced(attemptId: string): Promise<BufferedAnswer[]> {
  const db = await openDb()
  if (!db) return []
  const store = tx(db, 'readonly')
  if (!store) return []
  const all = (await reqDone(store.index('byAttempt').getAll(attemptId))) as BufferedAnswer[] | null
  return (all ?? []).filter(r => r.synced === 0).sort((a, b) => a.seq - b.seq)
}

/** Next monotonic sequence number for an attempt. */
export async function nextSeq(attemptId: string): Promise<number> {
  const db = await openDb()
  if (!db) return Date.now() // still monotonic enough for ordering
  const store = tx(db, 'readonly')
  if (!store) return Date.now()
  const all = (await reqDone(store.index('byAttempt').getAll(attemptId))) as BufferedAnswer[] | null
  return (all ?? []).reduce((mx, r) => Math.max(mx, r.seq), 0) + 1
}

/** Drop everything for an attempt (after successful submission). */
export async function clearAttempt(attemptId: string): Promise<void> {
  const db = await openDb()
  if (!db) return
  const store = tx(db, 'readwrite')
  if (!store) return
  const all = (await reqDone(store.index('byAttempt').getAllKeys(attemptId))) as IDBValidKey[] | null
  for (const key of all ?? []) await reqDone(store.delete(key))
}

/**
 * Ask the browser to exempt this origin from storage eviction.
 * Chrome/Safari decide silently on engagement heuristics; Firefox prompts.
 * A denial is normal — the buffer stays best-effort either way.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

/**
 * Merge recovered buffer records over server-known answers (pure — tested).
 * Buffered-unsynced entries are newer than the server copy by construction
 * (this device wrote them after its last successful sync), so they win.
 */
export function mergeBufferedAnswers(
  serverMap: Record<string, string>,
  buffered: BufferedAnswer[],
): { answeredMap: Record<string, string>; queue: BufferedAnswer[] } {
  const answeredMap = { ...serverMap }
  const queue: BufferedAnswer[] = []
  for (const rec of buffered) {
    if (serverMap[rec.questionId] === rec.answer) continue // server already has it
    answeredMap[rec.questionId] = rec.answer
    queue.push(rec)
  }
  return { answeredMap, queue }
}
