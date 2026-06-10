import Papa from 'papaparse'

const REQUIRED_HEADERS = ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct'] as const
const VALID_ANSWERS = ['A', 'B', 'C', 'D'] as const

/** Shape of a raw CSV row as parsed by PapaParse with header: true. */
interface CsvRow {
  question?: string
  option_a?: string
  option_b?: string
  option_c?: string
  option_d?: string
  correct?: string
}

/** A validated question ready for insertion into the questions table. */
export interface ParsedQuestion {
  question_text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_answer: string
  sort_order: number
}

export interface ParseQuestionsResult {
  questions: ParsedQuestion[]
  errors: string[]
}

/**
 * Parse and validate a CSV file of questions.
 */
export function parseQuestionsCsv(file: File): Promise<ParseQuestionsResult> {
  return new Promise((resolve) => {
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      encoding: 'UTF-8',
      complete(results) {
        const errors: string[] = []
        const rawHeaders = results.meta.fields || []

        // Validate required headers
        const missingHeaders = REQUIRED_HEADERS.filter(h => !rawHeaders.includes(h))
        if (missingHeaders.length > 0) {
          errors.push(`Missing required columns: ${missingHeaders.join(', ')}`)
          resolve({ questions: [], errors })
          return
        }

        const questions: ParsedQuestion[] = []
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
          if (!correct || !(VALID_ANSWERS as readonly string[]).includes(correct)) {
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
      error(err: Error) {
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

function sanitizeCell(value: unknown): unknown {
  if (typeof value === 'string' && FORMULA_RE.test(value)) {
    return "'" + value
  }
  return value
}

/**
 * Generate a CSV string for download.
 * All cell values are sanitized against formula injection.
 * @param rows
 * @param fields — ordered column names
 */
export function generateCsv(rows: Array<Record<string, unknown>>, fields: string[]): string {
  const sanitized = rows.map(row => {
    const clean: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(row)) {
      clean[k] = sanitizeCell(v)
    }
    return clean
  })
  return Papa.unparse({ fields, data: sanitized })
}

/**
 * Trigger a CSV file download in the browser.
 */
export function downloadCsv(csvString: string, filename: string): void {
  const bom = String.fromCharCode(0xfeff) // UTF-8 BOM so Excel opens the CSV correctly
  const blob = new Blob([bom + csvString], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
