import { supabase } from './supabase'

export interface AuditEventOptions {
  action: string
  entity: string
  entityId?: string
  details?: Record<string, unknown> | null
}

/**
 * Logs an admin event to the audit_log table.
 * Fire-and-forget — never throws, never blocks the main action.
 */
export async function logAuditEvent({ action, entity, entityId, details }: AuditEventOptions): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const actor = session?.user?.email || 'unknown'
    await supabase.from('audit_log').insert({
      action,
      entity,
      entity_id: entityId ?? null,
      actor,
      details: details ?? null,
    })
  } catch {
    // Audit failures must never block the main action
  }
}
