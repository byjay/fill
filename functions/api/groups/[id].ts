/**
 * SCMS Pages Function → /api/groups/:id
 * GET    → 그룹 멤버 목록 조회 (그룹원만 가능)
 * DELETE → 그룹 삭제 (owner만) 또는 그룹 탈퇴 (멤버, ?leave=true)
 * PATCH  → 프로젝트를 그룹에 연결/해제 (owner만)
 */

interface Env {
  scms_db: D1Database;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,DELETE,PATCH,OPTIONS',
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

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const userId = getUserId(request);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const groupId = params.id as string;
  const db      = env.scms_db;

  // 그룹 존재 + 내 역할 확인
  const membership = await db
    .prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?')
    .bind(groupId, userId)
    .first() as any;

  if (!membership) return json({ error: 'Group not found or access denied' }, 404);

  const isOwner = membership.role === 'owner';

  // ── GET: 멤버 목록 ───────────────────────────────────────────────
  if (request.method === 'GET') {
    const group = await db
      .prepare('SELECT id, name, invite_code, created_by, created_at FROM user_groups WHERE id = ?')
      .bind(groupId)
      .first() as any;

    const { results: members } = await db
      .prepare('SELECT user_id, role, joined_at FROM group_members WHERE group_id = ? ORDER BY joined_at ASC')
      .bind(groupId)
      .all();

    // 이 그룹에 연결된 프로젝트 수
    const { results: projCount } = await db
      .prepare('SELECT COUNT(*) AS cnt FROM projects WHERE group_id = ?')
      .bind(groupId)
      .all();

    return json({
      ...group,
      my_role: membership.role,
      members,
      project_count: (projCount[0] as any)?.cnt || 0,
    });
  }

  // ── DELETE: 그룹 삭제(owner) 또는 탈퇴(member) ──────────────────
  if (request.method === 'DELETE') {
    const url    = new URL(request.url);
    const isLeave = url.searchParams.get('leave') === 'true';

    if (isLeave || !isOwner) {
      // 탈퇴: owner는 탈퇴 불가 (멤버를 owner로 넘기거나 그룹 삭제해야 함)
      if (isOwner) return json({ error: 'Owner cannot leave. Transfer ownership or delete the group.' }, 400);
      await db
        .prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?')
        .bind(groupId, userId)
        .run();
      return json({ message: 'left' });
    }

    // 그룹 삭제 (owner): 연결된 프로젝트의 group_id를 NULL로 해제
    await db.prepare('UPDATE projects SET group_id = NULL WHERE group_id = ?').bind(groupId).run();
    await db.prepare('DELETE FROM group_members WHERE group_id = ?').bind(groupId).run();
    await db.prepare('DELETE FROM user_groups WHERE id = ?').bind(groupId).run();
    return json({ message: 'deleted' });
  }

  // ── PATCH: 프로젝트를 그룹에 연결/해제 ─────────────────────────
  if (request.method === 'PATCH') {
    const body      = await request.json() as any;
    const projectId = body.project_id as string;
    const attach    = body.attach as boolean; // true=연결, false=해제

    if (!projectId) return json({ error: 'project_id required' }, 400);

    // 해당 프로젝트의 소유자인지 확인
    const proj = await db
      .prepare('SELECT user_id, group_id FROM projects WHERE id = ?')
      .bind(projectId)
      .first() as any;

    if (!proj) return json({ error: 'Project not found' }, 404);
    if (proj.user_id !== userId) return json({ error: 'Only the project owner can share it' }, 403);

    if (attach) {
      await db
        .prepare('UPDATE projects SET group_id = ? WHERE id = ?')
        .bind(groupId, projectId)
        .run();
    } else {
      // 해제: 본인 그룹에 연결된 경우만
      if (proj.group_id !== groupId) return json({ error: 'Project is not in this group' }, 400);
      await db
        .prepare('UPDATE projects SET group_id = NULL WHERE id = ?')
        .bind(projectId)
        .run();
    }

    return json({ success: true, project_id: projectId, group_id: attach ? groupId : null });
  }

  return json({ error: 'Method not allowed' }, 405);
};
