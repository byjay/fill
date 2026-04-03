/**
 * /api/admin/approvals
 * GET  → 승인 요청 목록 (admin only)
 * POST → 승인 요청 제출 (any authenticated user)
 */

interface Env { scms_db: D1Database; }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
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

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const userId = getUserId(request);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const db = env.scms_db;

  // ── GET: 승인 목록 (admin only) ─────────────────────────────────
  if (request.method === 'GET') {
    if (userId !== 'admin_user') return json({ error: 'Forbidden' }, 403);
    const { results } = await db
      .prepare('SELECT * FROM approval_requests ORDER BY requested_at DESC')
      .all();
    return json(results);
  }

  // ── POST: 승인 요청 제출 ─────────────────────────────────────────
  if (request.method === 'POST') {
    const body = await request.json() as any;
    const now = new Date().toISOString();
    const id = `apr_${Date.now()}`;

    // 이미 pending/approved 요청이 있으면 중복 방지
    const existing = await db
      .prepare("SELECT id, status FROM approval_requests WHERE user_id = ? AND status IN ('pending', 'approved')")
      .bind(userId)
      .first() as any;

    if (existing?.status === 'approved') return json({ already: 'approved' });
    if (existing?.status === 'pending') return json({ already: 'pending', id: existing.id });

    await db.prepare(`
      INSERT INTO approval_requests (id, user_id, name, email, company, phone, requested_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `).bind(
      id, userId,
      body.name || '', body.email || '',
      body.company || '', body.phone || '',
      now,
    ).run();

    return json({ success: true, id });
  }

  return json({ error: 'Method not allowed' }, 405);
};
