/**
 * Seeded PRNG and question randomization for BharatVidya Assessment App.
 *
 * Determinism guarantee: Given the same (rollNumber, batchId) and question pool
 * (sorted by sort_order ASC), selectAndShuffleQuestions always returns
 * the same output. This survives page refresh.
 */

/** Raw question row from the get_exam_questions RPC (correct_answer stripped server-side). */
export interface BankQuestion {
  id: string
  question_text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
}

export type OptionLabel = 'A' | 'B' | 'C' | 'D'

export interface ShuffledOption {
  /** Display label after shuffling (A/B/C/D as shown to the student). */
  label: OptionLabel
  text: string
  /** Pre-shuffle label — what gets stored in the responses table. */
  originalLabel: OptionLabel
}

export interface ShuffledQuestion {
  questionId: string
  questionText: string
  options: ShuffledOption[]
}

/**
 * cyrb53 — fast, well-distributed 32-bit hash.
 * Uses Math.imul for 32-bit integer multiplication.
 * Returns a 32-bit unsigned integer suitable as a mulberry32 seed.
 */
function cyrb53(str: string): number {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 0x85ebca77)
    h2 = Math.imul(h2 ^ ch, 0xc2b2ae3d)
  }
  h1 ^= Math.imul(h1 ^ (h2 >>> 15), 0x735a2d97)
  h2 ^= Math.imul(h2 ^ (h1 >>> 15), 0xcaf649a9)
  h1 ^= h2 >>> 16
  h2 ^= h1 >>> 16
  return h1 >>> 0
}

/**
 * mulberry32 PRNG.
 * @param seed — 32-bit unsigned integer
 * @returns closure returning floats in [0, 1)
 */
function mulberry32(seed: number): () => number {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Fisher-Yates shuffle using a seeded RNG.
 * Returns a new array; original is not mutated.
 * @param array
 * @param rng — seeded PRNG returning [0, 1)
 */
function seededShuffle<T>(array: readonly T[], rng: () => number): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const temp = result[i]
    result[i] = result[j]
    result[j] = temp
  }
  return result
}

/**
 * Shuffle the 4 options of a single question using the running RNG.
 * Returns a transformed question with shuffled options.
 *
 * IMPORTANT: selected_answer stored in responses table MUST use
 * originalLabel (pre-shuffle label), NOT the display label.
 * This ensures consistent scoring and CSV export.
 *
 * NOTE: correctLabel is intentionally NOT returned. Correct-answer
 * evaluation happens server-side via the set_is_correct trigger
 * and the submit_exam RPC. The client never learns the correct answer.
 *
 * @param question — raw question from get_exam_questions RPC
 * @param rng — seeded PRNG (state advances)
 */
function shuffleOptions(question: BankQuestion, rng: () => number): ShuffledQuestion {
  const originalOptions: Array<{ originalLabel: OptionLabel; text: string }> = [
    { originalLabel: 'A', text: question.option_a },
    { originalLabel: 'B', text: question.option_b },
    { originalLabel: 'C', text: question.option_c },
    { originalLabel: 'D', text: question.option_d },
  ]
  const shuffled = seededShuffle(originalOptions, rng)
  const labels: OptionLabel[] = ['A', 'B', 'C', 'D']
  const options: ShuffledOption[] = shuffled.map((opt, i) => ({
    label: labels[i],
    text: opt.text,
    originalLabel: opt.originalLabel,
  }))
  return {
    questionId: question.id,
    questionText: question.question_text,
    options,
  }
}

/**
 * Full pipeline: select and shuffle questions for a student.
 *
 * @param questions — all questions for the batch, MUST be sorted by sort_order ASC
 * @param rollNumber
 * @param batchId
 * @param questionsPerStudent — null = use all
 * @param attemptNumber — attempt number (changes seed for retries)
 */
export function selectAndShuffleQuestions(
  questions: readonly BankQuestion[],
  rollNumber: string,
  batchId: string,
  questionsPerStudent?: number | null,
  attemptNumber = 1
): ShuffledQuestion[] {
  const seed = cyrb53(rollNumber + '|' + batchId + '|' + attemptNumber)
  const rng = mulberry32(seed)

  // Shuffle the full pool (selection + ordering in one pass)
  const shuffled = seededShuffle(questions, rng)

  // Slice to the student's quota
  const selected = questionsPerStudent ? shuffled.slice(0, questionsPerStudent) : shuffled

  // Shuffle options for each selected question using the same RNG stream
  return selected.map(q => shuffleOptions(q, rng))
}
