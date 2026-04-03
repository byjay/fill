/**
 * /api/admin/users
 * GET  → 전체 사용자 목록 (admin_user만 접근 가능)
 * POST → 사용자 정보 upsert (user_id 기준, 자기 자신만)
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

const DEFAULT_PERMS = JSON.stringify({
  dashboard: true, cables: true, nodes: true, bom: true,
  routing: true, trayfill: true, '3d': true, analysis: true,
  cabletype: true, voltagedrop: true,
  classrule: true, 'bom-adv': true, drum: true,
  'deck-qty': true, bottleneck: true, 'kave-router': true,
  excel_export: true,
});

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const userId = getUserId(request);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const db = env.scms_db;

  // ── GET: 전체 사용자 목록 (admin only) ─────────────────────────
  if (request.method === 'GET') {
    if (userId !== 'admin_user') return json({ error: 'Forbidden' }, 403);

    // user_permissions 테이블에서 등록된 사용자 가져오기
    const { results: regUsers } = await db
      .prepare('SELECT * FROM user_permissions ORDER BY created_at DESC')
      .all();

    // projects 테이블에서 알려진 user_id 목록 가져오기 (미등록 사용자 포함)
    const { results: projUsers } = await db
      .prepare('SELECT DISTINCT user_id, COUNT(*) AS cnt FROM projects GROUP BY user_id')
      .all();

    // 통합: regUsers를 기반으로, projUsers에서 미등록 사용자 추가
    const regIds = new Set(regUsers.map((u: any) => u.user_id));
    const extra = (projUsers as any[]).filter(p => !regIds.has(p.user_id)).map(p => ({
      user_id: p.user_id,
      name: '',
      email: '',
      provider: 'unknown',
      permissions: DEFAULT_PERMS,
      status: 'active',
      created_at: '',
      last_seen: null,
    }));

    // 각 사용자별 프로젝트 수 결합
    const projMap: Record<string, number> = {};
    for (const p of projUsers as any[]) projMap[p.user_id] = p.cnt;

    const merged = [...regUsers, ...extra].map((u: any) => ({
      ...u,
      permissions: (() => { try { return JSON.parse(u.permissions || '{}'); } catch { return {}; } })(),
      project_count: projMap[u.user_id] || 0,
    }));

    return json(merged);
  }

  // ── POST: 사용자 정보 upsert (자기 자신) ─────────────────────────
  if (request.method === 'POST') {
    const body = await request.json() as any;
    const now = new Date().toISOString();

    await db.prepare(`
      INSERT INTO user_permissions (user_id, name, email, provider, permissions, status, created_at, last_seen)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        name = excluded.name,
        email = excluded.email,
        provider = excluded.provider,
        last_seen = excluded.last_seen
    `).bind(
      userId,
      body.name || '',
      body.email || '',
      body.provider || '',
      DEFAULT_PERMS,
      body.created_at || now,
      now,
    ).run();

    return json({ success: true });
  }

  return json({ error: 'Method not allowed' }, 405);
};
