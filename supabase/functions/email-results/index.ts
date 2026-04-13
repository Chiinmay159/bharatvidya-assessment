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
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { batch_id } = await req.json()
    if (!batch_id) throw new Error('batch_id is required')

    const supabaseUrl  = Deno.env.get('SUPABASE_URL')!
    const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!

    const supabase = createClient(supabaseUrl, serviceKey)

    // Fetch batch details
    const { data: batch } = await supabase
      .from('batches').select('name').eq('id', batch_id).single()
    if (!batch) throw new Error('Batch not found')

    // Fetch submitted attempts with email
    const { data: attempts } = await supabase
      .from('attempts')
      .select('student_name, email, roll_number, score, total_questions, submitted_at')
      .eq('batch_id', batch_id)
      .not('submitted_at', 'is', null)
      .not('email', 'is', null)

    if (!attempts?.length) {
      return new Response(JSON.stringify({ sent: 0, message: 'No attempts with email addresses found.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let sent = 0
    const errors: string[] = []

    for (const attempt of attempts) {
      if (!attempt.email) continue
      const pct = attempt.total_questions
        ? Math.round((attempt.score / attempt.total_questions) * 100)
        : 0

      const html = `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 32px 24px;">
          <h2 style="color: #1e293b; margin-bottom: 4px;">Your Exam Results</h2>
          <p style="color: #64748b; margin-bottom: 24px;">${batch.name}</p>
          <div style="background: #f8fafc; border-radius: 8px; padding: 20px 24px; margin-bottom: 24px;">
            <p style="margin: 0 0 8px;"><strong>Name:</strong> ${attempt.student_name}</p>
            <p style="margin: 0 0 8px;"><strong>Roll Number:</strong> ${attempt.roll_number}</p>
            <p style="margin: 0 0 8px;"><strong>Score:</strong> ${attempt.score ?? '—'} / ${attempt.total_questions ?? '—'}</p>
            <p style="margin: 0 0 8px;"><strong>Percentage:</strong> ${pct}%</p>
            <p style="margin: 0;"><strong>Status:</strong> ${pct >= 60 ? '✅ Passed' : '❌ Not cleared'}</p>
          </div>
          <p style="color: #94a3b8; font-size: 13px;">This is an automated result notification from BharatVidya.</p>
        </div>
      `

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

    // Log to audit_log
    await supabase.from('audit_log').insert({
      action: 'results_emailed',
      entity: 'batch',
      entity_id: batch_id,
      actor: 'system',
      details: { sent, errors: errors.length, batch_name: batch.name },
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
