import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mock supabase before importing the hook
const rpcMock = vi.fn()
const fromMock = vi.fn()
vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    from: (...args) => fromMock(...args),
  },
}))

import { useTimer } from '../useTimer'

function mockServerTime(isoString) {
  rpcMock.mockImplementation(async (name) => {
    if (name === 'get_server_time') return { data: isoString, error: null }
    return { data: null, error: null }
  })
  fromMock.mockReturnValue({
    select: () => ({ eq: () => ({ single: async () => ({ data: { status: 'active' } }) }) }),
  })
}

describe('useTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    rpcMock.mockReset()
    fromMock.mockReset()
  })

  it('counts down from server-synced time and formats correctly', async () => {
    const now = new Date('2026-06-11T10:00:00Z')
    vi.setSystemTime(now)
    mockServerTime(now.toISOString())

    const { result } = renderHook(() =>
      useTimer({
        scheduledStart: '2026-06-11T10:00:00Z',
        durationMinutes: 30,
        onTimeUp: vi.fn(),
        onBatchEnded: vi.fn(),
        batchId: 'b1',
        enabled: true,
      })
    )

    await act(async () => { await vi.advanceTimersByTimeAsync(1100) })
    expect(result.current.syncStatus).toBe('synced')
    // ~30 minutes remaining
    expect(result.current.remainingMs).toBeGreaterThan(29 * 60 * 1000)
    expect(result.current.remainingFormatted).toMatch(/^\d{2}:\d{2}$/)
    expect(result.current.isUrgent).toBe(false)
  })

  it('fires onTimeUp exactly once at expiry', async () => {
    const onTimeUp = vi.fn()
    const start = new Date('2026-06-11T10:00:00Z')
    // 2 seconds left in the exam
    vi.setSystemTime(new Date(start.getTime() + 60 * 1000 - 2000))
    mockServerTime(new Date(start.getTime() + 60 * 1000 - 2000).toISOString())

    renderHook(() =>
      useTimer({
        scheduledStart: start.toISOString(),
        durationMinutes: 1,
        onTimeUp,
        onBatchEnded: vi.fn(),
        batchId: 'b1',
        enabled: true,
      })
    )

    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    expect(onTimeUp).toHaveBeenCalledTimes(1)
  })

  it('is immune to wall-clock tampering after sync (monotonic)', async () => {
    const now = new Date('2026-06-11T10:00:00Z')
    vi.setSystemTime(now)
    mockServerTime(now.toISOString())

    // performance.now ticks independently of Date.now in this mock
    let perfMs = 1_000_000
    performance.now.mockImplementation(() => perfMs)

    const { result } = renderHook(() =>
      useTimer({
        scheduledStart: now.toISOString(),
        durationMinutes: 30,
        onTimeUp: vi.fn(),
        onBatchEnded: vi.fn(),
        batchId: 'b1',
        enabled: true,
      })
    )

    await act(async () => { await vi.advanceTimersByTimeAsync(1100) })
    const before = result.current.remainingMs

    // Student sets their clock back 2 hours — Date.now() lies, perf doesn't
    vi.setSystemTime(new Date(now.getTime() - 2 * 3600 * 1000))
    perfMs += 5000 // 5 real seconds pass
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })

    const after = result.current.remainingMs
    // Remaining should have decreased ~5s, NOT increased by 2 hours
    expect(before - after).toBeGreaterThanOrEqual(4000)
    expect(before - after).toBeLessThanOrEqual(11000)
  })

  it('flags urgency under five minutes', async () => {
    const start = new Date('2026-06-11T10:00:00Z')
    vi.setSystemTime(new Date(start.getTime() + 26 * 60 * 1000)) // 4 min left of 30
    mockServerTime(new Date(start.getTime() + 26 * 60 * 1000).toISOString())

    const { result } = renderHook(() =>
      useTimer({
        scheduledStart: start.toISOString(),
        durationMinutes: 30,
        onTimeUp: vi.fn(),
        onBatchEnded: vi.fn(),
        batchId: 'b1',
        enabled: true,
      })
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(1100) })
    expect(result.current.isUrgent).toBe(true)
    expect(result.current.isExpired).toBe(false)
  })

  it('falls back to wall clock when server time is unavailable', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'down' } })
    fromMock.mockReturnValue({
      select: () => ({ eq: () => ({ single: async () => ({ data: { status: 'active' } }) }) }),
    })
    const now = new Date('2026-06-11T10:00:00Z')
    vi.setSystemTime(now)

    const { result } = renderHook(() =>
      useTimer({
        scheduledStart: now.toISOString(),
        durationMinutes: 10,
        onTimeUp: vi.fn(),
        onBatchEnded: vi.fn(),
        batchId: 'b1',
        enabled: true,
      })
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(1100) })
    expect(result.current.syncStatus).toBe('fallback')
    expect(result.current.remainingMs).toBeGreaterThan(0)
  })
})
