import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { redact } from '../../lib/logger.js';
export interface AuditInput {
  action: string;
  targetType: string;
  targetId: string;
  targetName: string;
  detail?: Record<string, unknown>;
}
export function recordAudit(db: Database.Database, input: AuditInput) {
  const detail = input.detail ?? {};
  if (JSON.stringify(redact(detail)) !== JSON.stringify(detail))
    throw new Error('Audit detail contains a secret field');
  db.prepare(
    'INSERT INTO audit_entry(id,at,action,targetType,targetId,targetName,detail) VALUES(?,?,?,?,?,?,?)',
  ).run(
    randomUUID(),
    new Date().toISOString(),
    input.action,
    input.targetType,
    input.targetId,
    input.targetName,
    JSON.stringify(detail),
  );
}
