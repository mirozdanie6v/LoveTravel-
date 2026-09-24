import type { Env } from '../db/repository';

export async function cleanupExpiredDemoSessions(env: Env) {
  const before = await env.DB.prepare("SELECT COUNT(*) AS n FROM demo_sessions WHERE expires_at IS NOT NULL AND datetime(expires_at) < datetime('now')").first<{n:number}>();
  const expired = Number(before?.n ?? 0);
  if (expired > 0) {
    await env.DB.prepare("DELETE FROM demo_sessions WHERE expires_at IS NOT NULL AND datetime(expires_at) < datetime('now')").run();
  }
  return { expiredSessionsDeleted: expired, ranAt: new Date().toISOString() };
}
