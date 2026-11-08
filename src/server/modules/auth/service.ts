import type Database from 'better-sqlite3';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
export interface User {
  id: string;
  username: string;
  passwordHash: string;
}
export function findUser(db: Database.Database) {
  return db
    .prepare('SELECT id,username,passwordHash FROM user LIMIT 1')
    .get() as User | undefined;
}
export async function createOwner(
  db: Database.Database,
  username: string,
  password: string,
  now: number,
) {
  const passwordHash = await hash(password);
  try {
    db.prepare(
      'INSERT INTO user(id,username,passwordHash,createdAt) VALUES(?,?,?,?)',
    ).run(randomUUID(), username, passwordHash, new Date(now).toISOString());
    return true;
  } catch (error) {
    if (findUser(db)) return false;
    throw error;
  }
}
export async function checkPassword(
  user: User | undefined,
  username: string,
  password: string,
) {
  if (!user || user.username !== username) return false;
  return verify(user.passwordHash, password);
}
export function sessionHash(raw: string) {
  return createHash('sha256').update(raw).digest('hex');
}
export function newSession(db: Database.Database, userId: string, now: number) {
  const raw = randomBytes(32).toString('base64url');
  db.prepare(
    'INSERT INTO session(id,userId,createdAt,expiresAt,lastSeenAt) VALUES(?,?,?,?,?)',
  ).run(
    sessionHash(raw),
    userId,
    new Date(now).toISOString(),
    new Date(now + 7 * 86400000).toISOString(),
    new Date(now).toISOString(),
  );
  return raw;
}
export function getSession(db: Database.Database, raw: string, now: number) {
  const id = sessionHash(raw);
  const session = db
    .prepare('SELECT userId,expiresAt,lastSeenAt FROM session WHERE id=?')
    .get(id) as
    { userId: string; expiresAt: string; lastSeenAt: string } | undefined;
  if (!session) return undefined;
  if (
    Date.parse(session.expiresAt) <= now ||
    Date.parse(session.lastSeenAt) + 12 * 3600000 <= now
  ) {
    db.prepare('DELETE FROM session WHERE id=?').run(id);
    return undefined;
  }
  db.prepare('UPDATE session SET lastSeenAt=? WHERE id=?').run(
    new Date(now).toISOString(),
    id,
  );
  return db
    .prepare('SELECT id,username FROM user WHERE id=?')
    .get(session.userId) as { id: string; username: string } | undefined;
}
