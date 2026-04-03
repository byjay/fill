/**
 * /api/admin/users/:id
 * PUT    → 사용자 권한/상태 수정 (admin only)
 * DELETE → 사용자 삭제 + 본인 프로젝트 삭제 (admin only)
 */

interface Env { scms_db: D1Database; }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function getUserId(req: Request): string | null {
  return req.headers.get('Authorization')?.replace('Bearer ', '').trim() || null;
}

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const callerId = getUserId(request);
  if (!callerId || callerId !== 'admin_user') return json({ error: 'Forbidden' }, 403);

  const targetId = params.id as string;
  const db = env.scms_db;

  // ── PUT: 권한/상태 수정 ─────────────────────────────────────────
  if (request.method === 'PUT') {
    const body = await request.json() as any;
    const now = new Date().toISOString();

    // user_permissions upsert
    await db.prepare(`
      INSERT INTO user_permissions (user_id, name, email, provider, permissions, status, created_at, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        permissions = excluded.permissions,
        status = excluded.status,
        name = COALESCE(excluded.name, user_permissions.name),
        email = COALESCE(excluded.email, user_permissions.email)
    `).bind(
      targetId,
      body.name || '',
      body.email || '',
      body.provider || '',
      JSON.stringify(body.permissions || {}),
      body.status || 'active',
      now,
      now,
    ).run();

    return json({ success: true });
  }

  // ── DELETE: 사용자 삭제 ─────────────────────────────────────────
  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const deleteProjects = url.searchParams.get('projects') === 'true';

    if (deleteProjects) {
      await db.prepare('DELETE FROM projects WHERE user_id = ?').bind(targetId).run();
    }
    await db.prepare('DELETE FROM user_permissions WHERE user_id = ?').bind(targetId).run();
    await db.prepare('DELETE FROM approval_requests WHERE user_id = ?').bind(targetId).run();

    return json({ success: true, deleted_projects: deleteProjects });
  }

  return json({ error: 'Method not allowed' }, 405);
};
