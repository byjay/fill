/**
 * SCMS Pages Function → /api/groups
 * GET  → 내가 속한 그룹 목록 (멤버 수 포함)
 * POST → 새 그룹 생성 (랜덤 초대코드 자동 발급)
 */

interface Env {
  scms_db: D1Database;
}

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

function getUserId(request: Request): string | null {
  const auth = request.headers.get('Authorization') || '';
  return auth.replace('Bearer ', '').trim() || null;
}

/** 6자리 숫자 초대코드 생성 */
function genInviteCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const userId = getUserId(request);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const db = env.scms_db;

  // ── GET: 내가 속한 그룹 목록 ────────────────────────────────────
  if (request.method === 'GET') {
    const { results } = await db
      .prepare(`
        SELECT
          g.id, g.name, g.invite_code, g.created_by, g.created_at,
          gm.role,
          (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count
        FROM user_groups g
        JOIN group_members gm ON g.id = gm.group_id AND gm.user_id = ?
        ORDER BY g.created_at DESC
      `)
      .bind(userId)
      .all();

    return json(results);
  }

  // ── POST: 그룹 생성 ─────────────────────────────────────────────
  if (request.method === 'POST') {
    const body = await request.json() as any;
    if (!body.name?.trim()) return json({ error: 'Group name is required' }, 400);

    const now  = new Date().toISOString();
    const id   = `grp_${Date.now()}`;
    let code   = genInviteCode();

    // 초대코드 충돌 방지 (재시도 3회)
    for (let i = 0; i < 3; i++) {
      const exists = await db
        .prepare('SELECT 1 FROM user_groups WHERE invite_code = ?')
        .bind(code).first();
      if (!exists) break;
      code = genInviteCode();
    }

    // 그룹 생성
    await db
      .prepare('INSERT INTO user_groups (id, name, invite_code, created_by, created_at) VALUES (?,?,?,?,?)')
      .bind(id, body.name.trim(), code, userId, now)
      .run();

    // 생성자를 owner로 자동 등록
    await db
      .prepare('INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?,?,?,?)')
      .bind(id, userId, 'owner', now)
      .run();

    return json({ id, name: body.name.trim(), invite_code: code, created_by: userId, created_at: now, role: 'owner', member_count: 1 });
  }

  return json({ error: 'Method not allowed' }, 405);
};
