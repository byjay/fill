/**
 * SCMS Pages Function — /api/projects/:id
 * GET    → 특정 프로젝트 조회
 * PUT    → 프로젝트 업데이트 (cables, nodes, history)
 * DELETE → 프로젝트 삭제
 *
 * admin_user는 모든 프로젝트에 접근 가능
 */

interface Env {
  scms_db: D1Database;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
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
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  const userId = getUserId(request);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const id = params.id as string;
  const db = env.scms_db;
  const isAdmin = userId === 'admin_user';

  // ── GET ──────────────────────────────────
  if (request.method === 'GET') {
    const row = await db
      .prepare(isAdmin
        ? 'SELECT * FROM projects WHERE id = ?'
        : 'SELECT * FROM projects WHERE id = ? AND user_id = ?')
      .bind(...(isAdmin ? [id] : [id, userId]))
      .first() as any;

    if (!row) return json({ error: 'Not found' }, 404);

    return json({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      vesselNo: row.vessel_no,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      cables: JSON.parse(row.cables_json || '[]'),
      nodes: JSON.parse(row.nodes_json || '[]'),
      history: JSON.parse(row.history_json || '[]'),
    });
  }

  // ── PUT (업데이트) ──────────────────────────────────
  if (request.method === 'PUT') {
    const body = await request.json() as any;
    const now = new Date().toISOString();

    // history에 최대 200개 유지
    const history = (body.history || []).slice(0, 200);

    await db
      .prepare(isAdmin
        ? `UPDATE projects SET cables_json = ?, nodes_json = ?, history_json = ?, updated_at = ? WHERE id = ?`
        : `UPDATE projects SET cables_json = ?, nodes_json = ?, history_json = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
      .bind(
        JSON.stringify(body.cables || []),
        JSON.stringify(body.nodes || []),
        JSON.stringify(history),
        now,
        id,
        ...(isAdmin ? [] : [userId]),
      )
      .run();

    return json({ success: true, updatedAt: now });
  }

  // ── DELETE ──────────────────────────────────
  if (request.method === 'DELETE') {
    await db
      .prepare(isAdmin
        ? 'DELETE FROM projects WHERE id = ?'
        : 'DELETE FROM projects WHERE id = ? AND user_id = ?')
      .bind(...(isAdmin ? [id] : [id, userId]))
      .run();

    return json({ success: true });
  }

  return json({ error: 'Method not allowed' }, 405);
};
