/**
 * SCMS Pages Function → /api/groups/join
 * POST → 초대코드로 그룹 가입
 */

interface Env {
  scms_db: D1Database;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
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

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const userId = getUserId(request);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const db   = env.scms_db;
  const body = await request.json() as any;
  const code = (body.invite_code || '').trim();

  if (!code) return json({ error: 'invite_code is required' }, 400);

  // 그룹 찾기
  const group = await db
    .prepare('SELECT * FROM user_groups WHERE invite_code = ?')
    .bind(code)
    .first() as any;

  if (!group) return json({ error: '초대코드가 올바르지 않습니다.' }, 404);

  // 이미 가입 여부 확인
  const already = await db
    .prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?')
    .bind(group.id, userId)
    .first() as any;

  if (already) {
    return json({
      message: 'already_member',
      group: { id: group.id, name: group.name, invite_code: group.invite_code, role: already.role },
    });
  }

  // 멤버 추가
  const now = new Date().toISOString();
  await db
    .prepare('INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?,?,?,?)')
    .bind(group.id, userId, 'member', now)
    .run();

  return json({
    message: 'joined',
    group: { id: group.id, name: group.name, invite_code: group.invite_code, role: 'member' },
  });
};
