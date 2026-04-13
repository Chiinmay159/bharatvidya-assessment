import Papa from 'papaparse'

const REQUIRED_HEADERS = ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct']
const VALID_ANSWERS = ['A', 'B', 'C', 'D']

/**
 * Parse and validate a CSV file of questions.
 * @param {File} file
 * @returns {Promise<{ questions: Array, errors: string[] }>}
 */
export function parseQuestionsCsv(file) {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: 'UTF-8',
      complete(results) {
        const errors = []
        const rawHeaders = results.meta.fields || []

        // Validate required headers
        const missingHeaders = REQUIRED_HEADERS.filter(h => !rawHeaders.includes(h))
        if (missingHeaders.length > 0) {
          errors.push(`Missing required columns: ${missingHeaders.join(', ')}`)
          resolve({ questions: [], errors })
          return
        }

        const questions = []
        results.data.forEach((row, idx) => {
          const rowNum = idx + 2 // account for header row
          const q = row.question?.trim()
          const a = row.option_a?.trim()
          const b = row.option_b?.trim()
          const c = row.option_c?.trim()
          const d = row.option_d?.trim()
          const correct = row.correct?.trim().toUpperCase()

          if (!q) { errors.push(`Row ${rowNum}: question is empty`); return }
          if (!a) { errors.push(`Row ${rowNum}: option_a is empty`); return }
          if (!b) { errors.push(`Row ${rowNum}: option_b is empty`); return }
          if (!c) { errors.push(`Row ${rowNum}: option_c is empty`); return }
          if (!d) { errors.push(`Row ${rowNum}: option_d is empty`); return }
          if (!VALID_ANSWERS.includes(correct)) {
            errors.push(`Row ${rowNum}: correct answer "${row.correct}" is invalid — must be A, B, C, or D`)
            return
          }

          questions.push({
            question_text: q,
            option_a: a,
            option_b: b,
            option_c: c,
            option_d: d,
            correct_answer: correct,
            sort_order: questions.length + 1,
          })
        })

        resolve({ questions, errors })
      },
      error(err) {
        resolve({ questions: [], errors: [err.message] })
      },
    })
  })
}

/**
 * Sanitize a cell value to prevent spreadsheet formula injection.
 * Values starting with =, +, -, @, \t, or \r are prefixed with a
 * single-quote so they are treated as text in Excel/Sheets.
 */
const FORMULA_RE = /^[=+\-@\t\r]/

function sanitizeCell(value) {
  if (typeof value === 'string' && FORMULA_RE.test(value)) {
    return "'" + value
  }
  return value
}

/**
 * Generate a CSV string for download.
 * All cell values are sanitized against formula injection.
 * @param {Array<Object>} rows
 * @param {string[]} fields — ordered column names
 * @returns {string}
 */
export function generateCsv(rows, fields) {
  const sanitized = rows.map(row => {
    const clean = {}
    for (const [k, v] of Object.entries(row)) {
      clean[k] = sanitizeCell(v)
    }
    return clean
  })
  return Papa.unparse({ fields, data: sanitized })
}

/**
 * Trigger a CSV file download in the browser.
 * @param {string} csvString
 * @param {string} filename
 */
export function downloadCsv(csvString, filename) {
  const blob = new Blob(['\uFEFF' + csvString], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
