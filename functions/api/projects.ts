/**
 * SCMS Pages Function — /api/projects
 * GET  → 해당 userId의 프로젝트 목록
 * POST → 새 프로젝트 생성
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

/** Authorization 헤더에서 userId 추출 (Bearer <userId>) */
function getUserId(request: Request): string | null {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  return token || null;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  const userId = getUserId(request);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const db = env.scms_db;

  // ── GET: 프로젝트 목록 (admin은 전체 조회) ──────────────────────────────────
  if (request.method === 'GET') {
    const isAdmin = userId === 'admin_user';
    const query = isAdmin
      ? 'SELECT * FROM projects ORDER BY updated_at DESC'
      : 'SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC';
    const stmt = isAdmin
      ? db.prepare(query)
      : db.prepare(query).bind(userId);

    const { results } = await stmt.all();

    const projects = results.map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      vesselNo: r.vessel_no,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      cables: JSON.parse(r.cables_json || '[]'),
      nodes: JSON.parse(r.nodes_json || '[]'),
      history: JSON.parse(r.history_json || '[]'),
    }));

    return json(projects);
  }

  // ── POST: 새 프로젝트 ──────────────────────────────────
  if (request.method === 'POST') {
    const body = await request.json() as any;
    const now = new Date().toISOString();
    const id = `proj_${Date.now()}`;

    await db
      .prepare(`INSERT INTO projects (id, user_id, name, vessel_no, created_at, updated_at, cables_json, nodes_json, history_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        id,
        userId,
        body.name || 'Unnamed',
        body.vesselNo || '',
        now,
        now,
        '[]',
        '[]',
        '[]',
      )
      .run();

    return json({ id, userId, name: body.name, vesselNo: body.vesselNo, createdAt: now, updatedAt: now, cables: [], nodes: [], history: [] });
  }

  return json({ error: 'Method not allowed' }, 405);
};
