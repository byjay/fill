/**
 * /api/admin/approvals/:id
 * PUT → 승인/거절 (admin only)
 */

interface Env { scms_db: D1Database; }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'PUT,OPTIONS',
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

const DEFAULT_PERMS = JSON.stringify({
  dashboard: true, cables: true, nodes: true, bom: true,
  routing: true, trayfill: true, '3d': true, analysis: true,
  cabletype: true, voltagedrop: true,
  classrule: true, 'bom-adv': true, drum: true,
  'deck-qty': true, bottleneck: true, 'kave-router': true,
  excel_export: true,
});

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const callerId = getUserId(request);
  if (!callerId || callerId !== 'admin_user') return json({ error: 'Forbidden' }, 403);

  const approvalId = params.id as string;
  const db = env.scms_db;

  if (request.method === 'PUT') {
    const body = await request.json() as any;
    const status = body.status as 'approved' | 'rejected';
    if (!['approved', 'rejected'].includes(status)) return json({ error: 'Invalid status' }, 400);

    // 승인 요청 상태 업데이트
    await db
      .prepare('UPDATE approval_requests SET status = ? WHERE id = ?')
      .bind(status, approvalId)
      .run();

    // 승인 시 → user_permissions에 기본 권한으로 등록
    if (status === 'approved') {
      const req = await db
        .prepare('SELECT * FROM approval_requests WHERE id = ?')
        .bind(approvalId)
        .first() as any;

      if (req) {
        const now = new Date().toISOString();
        await db.prepare(`
          INSERT INTO user_permissions (user_id, name, email, provider, permissions, status, created_at, last_seen)
          VALUES (?, ?, ?, 'google', ?, 'active', ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            status = 'active',
            name = COALESCE(excluded.name, user_permissions.name)
        `).bind(req.user_id, req.name, req.email, DEFAULT_PERMS, now, now).run();
      }
    }

    return json({ success: true });
  }

  return json({ error: 'Method not allowed' }, 405);
};
