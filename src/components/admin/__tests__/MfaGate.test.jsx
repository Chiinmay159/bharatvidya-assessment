import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MfaGate } from '../MfaGate'
import { supabase } from '../../../lib/supabase'

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      mfa: {
        listFactors: vi.fn(),
        enroll: vi.fn(),
        unenroll: vi.fn(),
        challenge: vi.fn(),
        verify: vi.fn(),
      },
    },
  },
}))

const PENDING_KEY = 'bv-mfa-pending-enrollment'
const USER = 'user-1'

function mockSession() {
  supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: USER } } } })
}
function mockFactors(all) {
  supabase.auth.mfa.listFactors.mockResolvedValue({
    data: { all, totp: all.filter(f => f.factor_type === 'totp' && f.status === 'verified') },
    error: null,
  })
}
function mockEnroll(id, qr = `qr-${id}`) {
  supabase.auth.mfa.enroll.mockResolvedValue({
    data: { id, totp: { qr_code: qr, uri: `otpauth://totp/x?secret=s-${id}`, secret: `s-${id}` } },
    error: null,
  })
}

describe('MfaGate enrollment (pending-factor persistence)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    mockSession()
    supabase.auth.mfa.unenroll.mockResolvedValue({ data: null, error: null })
  })

  it('fresh enroll: clears abandoned factors, mints a secret, caches it for reload', async () => {
    mockFactors([{ id: 'old-1', factor_type: 'totp', status: 'unverified' }])
    mockEnroll('new-1')
    render(<MfaGate mode="enroll" userEmail="a@b.c" onVerified={() => {}} onSignOut={() => {}} />)

    await waitFor(() => expect(screen.getByAltText('TOTP enrollment QR code')).toBeInTheDocument())
    expect(supabase.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'old-1' })
    expect(supabase.auth.mfa.enroll).toHaveBeenCalledTimes(1)
    expect(JSON.parse(sessionStorage.getItem(PENDING_KEY))).toMatchObject({ userId: USER, factorId: 'new-1' })
  })

  it('reload with a live pending factor reuses the SAME QR — no unenroll, no new secret', async () => {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({
      userId: USER, factorId: 'pend-1', qr: 'qr-pend-1', uri: 'otpauth://x', secret: 'sec-1',
    }))
    mockFactors([{ id: 'pend-1', factor_type: 'totp', status: 'unverified' }])
    render(<MfaGate mode="enroll" userEmail="a@b.c" onVerified={() => {}} onSignOut={() => {}} />)

    await waitFor(() => expect(screen.getByAltText('TOTP enrollment QR code')).toBeInTheDocument())
    expect(screen.getByAltText('TOTP enrollment QR code')).toHaveAttribute('src', 'qr-pend-1')
    expect(supabase.auth.mfa.enroll).not.toHaveBeenCalled()
    expect(supabase.auth.mfa.unenroll).not.toHaveBeenCalled()
  })

  it('cached factor that no longer exists server-side is discarded and re-minted', async () => {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({
      userId: USER, factorId: 'gone-1', qr: 'qr-gone', uri: 'u', secret: 's',
    }))
    mockFactors([])
    mockEnroll('new-2')
    render(<MfaGate mode="enroll" userEmail="a@b.c" onVerified={() => {}} onSignOut={() => {}} />)

    await waitFor(() => expect(screen.getByAltText('TOTP enrollment QR code')).toBeInTheDocument())
    expect(screen.getByAltText('TOTP enrollment QR code')).toHaveAttribute('src', 'qr-new-2')
    expect(supabase.auth.mfa.enroll).toHaveBeenCalledTimes(1)
  })

  it('"Start over" unenrolls the current factor and mints a fresh secret', async () => {
    mockFactors([])
    mockEnroll('first')
    render(<MfaGate mode="enroll" userEmail="a@b.c" onVerified={() => {}} onSignOut={() => {}} />)
    await waitFor(() => expect(screen.getByAltText('TOTP enrollment QR code')).toBeInTheDocument())

    mockEnroll('second', 'qr-second')
    fireEvent.click(screen.getByText(/Start over with a fresh code/i))
    await waitFor(() =>
      expect(screen.getByAltText('TOTP enrollment QR code')).toHaveAttribute('src', 'qr-second'))
    expect(supabase.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'first' })
  })

  it('successful verify clears the pending cache and calls onVerified', async () => {
    mockFactors([])
    mockEnroll('f-1')
    supabase.auth.mfa.challenge.mockResolvedValue({ data: { id: 'ch-1' }, error: null })
    supabase.auth.mfa.verify.mockResolvedValue({ data: {}, error: null })
    const onVerified = vi.fn()
    render(<MfaGate mode="enroll" userEmail="a@b.c" onVerified={onVerified} onSignOut={() => {}} />)
    await waitFor(() => expect(screen.getByAltText('TOTP enrollment QR code')).toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /Activate & sign in/i }))
    await waitFor(() => expect(onVerified).toHaveBeenCalled())
    expect(supabase.auth.mfa.verify).toHaveBeenCalledWith({ factorId: 'f-1', challengeId: 'ch-1', code: '123456' })
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull()
  })

  it('verify mode targets the enrolled verified factor', async () => {
    mockFactors([{ id: 'v-1', factor_type: 'totp', status: 'verified' }])
    supabase.auth.mfa.challenge.mockResolvedValue({ data: { id: 'ch-2' }, error: null })
    supabase.auth.mfa.verify.mockResolvedValue({ data: {}, error: null })
    const onVerified = vi.fn()
    render(<MfaGate mode="verify" userEmail="a@b.c" onVerified={onVerified} onSignOut={() => {}} />)

    await waitFor(() => expect(screen.getByPlaceholderText('6-digit code')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '654321' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
    await waitFor(() =>
      expect(supabase.auth.mfa.verify).toHaveBeenCalledWith({ factorId: 'v-1', challengeId: 'ch-2', code: '654321' }))
  })
})
