import { db } from '../db/index.ts';
import { auditEvents } from '../db/schema.ts';
import crypto from 'crypto';

export interface LogAuditParams {
  actor_user_id?: string | null;
  actor_name?: string | null;
  actor_role?: string | null;
  event_type: string;
  entity_type: string;
  entity_id: string;
  metadata?: Record<string, any> | null;
  ip_address?: string | null;
}

export async function logAuditEvent(params: LogAuditParams) {
  try {
    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    await db.insert(auditEvents).values({
      id,
      actor_user_id: params.actor_user_id || null,
      actor_name: params.actor_name || null,
      actor_role: params.actor_role || null,
      event_type: params.event_type,
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      ip_address: params.ip_address || null,
      created_at: nowIso,
    });
  } catch (err) {
    console.error('Failed to log audit event:', err);
  }
}
