import { describe, it, expect } from 'vitest'
import { formatDbError } from '../errors.js'

describe('formatDbError', () => {
  it('returns mapped message for known Postgres code 23505 (unique violation)', () => {
    const err = { code: '23505', message: 'duplicate key value violates unique constraint' }
    expect(formatDbError(err)).toBe(
      'This record already exists. Please check your details and try again.'
    )
  })

  it('returns mapped message for known Postgres code 42501 (insufficient privilege)', () => {
    const err = { code: '42501', message: 'permission denied for table exams' }
    expect(formatDbError(err)).toBe('Access denied. Please contact your invigilator.')
  })

  it('returns mapped message for PGRST116 (no rows)', () => {
    const err = { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }
    expect(formatDbError(err)).toBe('No record found. Please check your details.')
  })

  it('returns fallback for unknown error with no matching code or pattern', () => {
    const err = { code: 'XXXXX', message: 'some internal postgres error with sql keyword' }
    expect(formatDbError(err)).toBe('Something went wrong. Please try again.')
  })

  it('returns custom fallback when provided', () => {
    const err = { code: 'XXXXX', message: 'some internal supabase error details' }
    expect(formatDbError(err, 'Custom fallback.')).toBe('Custom fallback.')
  })

  it('handles string errors by matching against patterns', () => {
    expect(formatDbError('row level security policy violation')).toBe(
      'Access denied. Please contact your invigilator.'
    )
  })

  it('handles string errors with network pattern', () => {
    expect(formatDbError('network error occurred')).toBe(
      'Network error. Please check your connection and try again.'
    )
  })

  it('handles RLS violation pattern in error message', () => {
    const err = { message: 'new row violates row-level security policy for table "responses"' }
    expect(formatDbError(err)).toBe('Access denied. Please contact your invigilator.')
  })

  it('returns fallback for null/undefined errors', () => {
    expect(formatDbError(null)).toBe('Something went wrong. Please try again.')
    expect(formatDbError(undefined)).toBe('Something went wrong. Please try again.')
  })

  it('passes through short human-readable messages without technical keywords', () => {
    const err = { message: 'Please enter your roll number.' }
    expect(formatDbError(err)).toBe('Please enter your roll number.')
  })

  it('handles failed to fetch pattern', () => {
    const err = { message: 'TypeError: Failed to fetch' }
    expect(formatDbError(err)).toBe(
      'Could not reach the server. Please check your connection.'
    )
  })
})
