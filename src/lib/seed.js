/**
 * Seeded PRNG and question randomization for BharatVidya Assessment App.
 *
 * Determinism guarantee: Given the same (rollNumber, batchId) and question pool
 * (sorted by sort_order ASC), selectAndShuffleQuestions always returns
 * the same output. This survives page refresh.
 */

/**
 * cyrb53 — fast, well-distributed 32-bit hash.
 * Uses Math.imul for 32-bit integer multiplication.
 * Returns a 32-bit unsigned integer suitable as a mulberry32 seed.
 */
function cyrb53(str) {
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
 * @param {number} seed — 32-bit unsigned integer
 * @returns {() => number} — closure returning floats in [0, 1)
 */
function mulberry32(seed) {
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
 * @param {Array} array
 * @param {() => number} rng — seeded PRNG returning [0, 1)
 */
function seededShuffle(array, rng) {
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
 * @param {Object} question — raw question from get_exam_questions RPC
 * @param {() => number} rng — seeded PRNG (state advances)
 * @returns {{ questionId, questionText, options }}
 *   options: [{ label, text, originalLabel }]  (label = display A/B/C/D)
 */
function shuffleOptions(question, rng) {
  const originalOptions = [
    { originalLabel: 'A', text: question.option_a },
    { originalLabel: 'B', text: question.option_b },
    { originalLabel: 'C', text: question.option_c },
    { originalLabel: 'D', text: question.option_d },
  ]
  const shuffled = seededShuffle(originalOptions, rng)
  const labels = ['A', 'B', 'C', 'D']
  const options = shuffled.map((opt, i) => ({
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
 * @param {Array} questions — all questions for the batch, MUST be sorted by sort_order ASC
 * @param {string} rollNumber
 * @param {string} batchId
 * @param {number|null} questionsPerStudent — null = use all
 * @returns {Array<ShuffledQuestion>}
 */
export function selectAndShuffleQuestions(questions, rollNumber, batchId, questionsPerStudent) {
  const seed = cyrb53(rollNumber + '|' + batchId)
  const rng = mulberry32(seed)

  // Shuffle the full pool (selection + ordering in one pass)
  const shuffled = seededShuffle(questions, rng)

  // Slice to the student's quota
  const selected = questionsPerStudent ? shuffled.slice(0, questionsPerStudent) : shuffled

  // Shuffle options for each selected question using the same RNG stream
  return selected.map(q => shuffleOptions(q, rng))
}
