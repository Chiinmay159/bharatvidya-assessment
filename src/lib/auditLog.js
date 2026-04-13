import { supabase, ADMIN_EMAIL } from './supabase'

/**
 * Logs an admin event to the audit_log table.
 * Fire-and-forget — never throws, never blocks the main action.
 *
 * @param {{ action: string, entity: string, entityId?: string, details?: object }} opts
 */
export async function logAuditEvent({ action, entity, entityId, details }) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const actor = session?.user?.email || ADMIN_EMAIL
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
