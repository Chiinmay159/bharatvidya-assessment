/**
 * 2.4 Email Results — Supabase Edge Function
 *
 * Deploy: supabase functions deploy email-results
 * Env vars needed:
 *   RESEND_API_KEY   — from resend.com
 *   SUPABASE_URL     — auto-set by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — auto-set by Supabase
 *
 * Called from admin UI via:
 *   supabase.functions.invoke('email-results', { body: { batch_id: '...' } })
 *
 * Security:
 *   - Requires a valid JWT in the Authorization header
 *   - Caller must be the admin (verified via is_admin() RPC)
 *   - CORS restricted to app origin
 *
 * Retry-aware:
 *   - Deduplicates by roll_number — only the latest attempt is emailed
 *   - Respects batch.show_results — hides score when results are hidden
 *   - Uses batch.pass_percentage instead of hardcoded threshold
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || 'https://bharatvidya-assessment.vercel.app'

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!

    // ── Auth: verify caller is admin ───────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create a user-scoped client with the caller's JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // Verify admin status via the is_admin() RPC
    const { data: isAdmin, error: adminErr } = await userClient.rpc('is_admin')
    if (adminErr || !isAdmin) {
      return new Response(JSON.stringify({ error: 'Unauthorized. Admin access required.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Payload ────────────────────────────────────────────
    const { batch_id } = await req.json()
    if (!batch_id) throw new Error('batch_id is required')

    // Use service-role client for data operations
    const supabase = createClient(supabaseUrl, serviceKey)

    // Fetch batch details including result-disclosure + retry settings
    const { data: batch } = await supabase
      .from('batches')
      .select('name, show_results, pass_percentage')
      .eq('id', batch_id)
      .single()
    if (!batch) throw new Error('Batch not found')

    // Fetch submitted attempts with email, ordered by attempt_number DESC
    // so latest attempt per student comes first for deduplication
    const { data: attempts } = await supabase
      .from('attempts')
      .select('student_name, email, roll_number, score, total_questions, submitted_at, attempt_number')
      .eq('batch_id', batch_id)
      .not('submitted_at', 'is', null)
      .not('email', 'is', null)
      .order('attempt_number', { ascending: false })

    if (!attempts?.length) {
      return new Response(JSON.stringify({ sent: 0, message: 'No attempts with email addresses found.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Deduplicate: keep only the latest attempt per student (by roll_number)
    const latestByStudent = new Map<string, typeof attempts[0]>()
    for (const attempt of attempts) {
      if (!latestByStudent.has(attempt.roll_number)) {
        latestByStudent.set(attempt.roll_number, attempt)
      }
    }
    const uniqueAttempts = Array.from(latestByStudent.values())

    let sent = 0
    const errors: string[] = []

    for (const attempt of uniqueAttempts) {
      if (!attempt.email) continue

      let html: string

      if (batch.show_results === false) {
        // Results hidden — don't include score or pass/fail
        html = `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 32px 24px;">
            <h2 style="color: #1e293b; margin-bottom: 4px;">Exam Completed</h2>
            <p style="color: #64748b; margin-bottom: 24px;">${escapeHtml(batch.name)}</p>
            <div style="background: #f8fafc; border-radius: 4px; padding: 20px 24px; margin-bottom: 24px;">
              <p style="margin: 0 0 8px;"><strong>Name:</strong> ${escapeHtml(attempt.student_name)}</p>
              <p style="margin: 0 0 8px;"><strong>Roll Number:</strong> ${escapeHtml(attempt.roll_number)}</p>
              <p style="margin: 0;">Your exam has been submitted successfully. Results will be shared by your instructor.</p>
            </div>
            <p style="color: #94a3b8; font-size: 13px;">This is an automated notification from BharatVidya.</p>
          </div>
        `
      } else {
        // Results visible — include score, percentage, and pass/fail status
        const pct = attempt.total_questions
          ? Math.round((attempt.score / attempt.total_questions) * 100)
          : 0

        // Build status line using batch.pass_percentage (omit if no threshold)
        let statusLine = ''
        if (batch.pass_percentage != null) {
          const passed = pct >= batch.pass_percentage
          statusLine = `<p style="margin: 0;"><strong>Status:</strong> ${passed ? '\u2705 Passed' : '\u274C Not cleared'} (passing: ${batch.pass_percentage}%)</p>`
        }

        const attemptLine = (attempt.attempt_number ?? 1) > 1
          ? `<p style="margin: 0 0 8px;"><strong>Attempt:</strong> ${attempt.attempt_number}</p>`
          : ''

        html = `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 32px 24px;">
            <h2 style="color: #1e293b; margin-bottom: 4px;">Your Exam Results</h2>
            <p style="color: #64748b; margin-bottom: 24px;">${escapeHtml(batch.name)}</p>
            <div style="background: #f8fafc; border-radius: 4px; padding: 20px 24px; margin-bottom: 24px;">
              <p style="margin: 0 0 8px;"><strong>Name:</strong> ${escapeHtml(attempt.student_name)}</p>
              <p style="margin: 0 0 8px;"><strong>Roll Number:</strong> ${escapeHtml(attempt.roll_number)}</p>
              ${attemptLine}
              <p style="margin: 0 0 8px;"><strong>Score:</strong> ${attempt.score ?? '\u2014'} / ${attempt.total_questions ?? '\u2014'}</p>
              <p style="margin: 0 0 8px;"><strong>Percentage:</strong> ${pct}%</p>
              ${statusLine}
            </div>
            <p style="color: #94a3b8; font-size: 13px;">This is an automated result notification from BharatVidya.</p>
          </div>
        `
      }

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'BharatVidya Exams <exams@bharatvidya.in>',
          to: [attempt.email],
          subject: `Your results: ${batch.name}`,
          html,
        }),
      })

      if (res.ok) {
        sent++
      } else {
        const err = await res.json()
        errors.push(`${attempt.email}: ${err.message || 'send failed'}`)
      }
    }

    // Log to audit_log via service-role
    await supabase.from('audit_log').insert({
      action: 'results_emailed',
      entity: 'batch',
      entity_id: batch_id,
      actor: 'admin',
      details: { sent, errors: errors.length, batch_name: batch.name, unique_students: uniqueAttempts.length },
    })

    return new Response(JSON.stringify({ sent, errors }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

/** Minimal HTML escape to prevent XSS in email content */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
