/**
 * SCMS Pages Function — /api/tray-fill
 * POST { projectId } → 전체 노드 트레이 폭 사전 계산
 *
 * 브라우저 대신 서버에서 케이블 집계 + 적정 트레이폭 산출.
 * 2469케이블 × 1094노드도 Worker에서 ~20ms 이내 처리.
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
  const token = auth.replace('Bearer ', '').trim();
  return token || null;
}

// 표준 트레이 폭 (IEC / 선박 규격)
const STANDARD_WIDTHS = [100, 150, 200, 300, 400, 500, 600, 800, 1000];

/**
 * 케이블 집합 → 적정 트레이폭 계산
 * @param cables  해당 노드를 지나는 케이블 목록
 * @param fillLimit  fill 비율 상한 (기본 0.40 = 40%)
 * @param trayHeight mm 단위 트레이 높이 (기본 60mm)
 */
function recommendWidth(
  cables: { od: number }[],
  fillLimit = 0.40,
  trayHeight = 60,
): { recommendedWidth: number; totalArea: number; fillRatio: number } {
  const totalArea = cables.reduce((sum, c) => {
    const r = (c.od || 10) / 2;
    return sum + Math.PI * r * r;
  }, 0);

  // 필요 최소 폭 = totalArea / (height × fillLimit)
  const minWidth = totalArea / (trayHeight * fillLimit);
  const recommendedWidth = STANDARD_WIDTHS.find(w => w >= minWidth) ?? 1000;
  const fillRatio = Math.round((totalArea / (recommendedWidth * trayHeight)) * 100);

  return { recommendedWidth, totalArea: Math.round(totalArea), fillRatio };
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const userId = getUserId(request);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const body = await request.json() as { projectId?: string };
  const { projectId } = body;
  if (!projectId) return json({ error: 'projectId required' }, 400);

  // 프로젝트 소유권 확인
  const isAdmin = userId === 'admin_user';
  const row = await env.scms_db
    .prepare(isAdmin
      ? 'SELECT cables_json FROM projects WHERE id = ?'
      : 'SELECT cables_json FROM projects WHERE id = ? AND user_id = ?')
    .bind(...(isAdmin ? [projectId] : [projectId, userId]))
    .first<{ cables_json: string }>();

  if (!row) return json({ error: 'Project not found or access denied' }, 404);

  const cables: { od?: number; path?: string; calculatedPath?: string }[] =
    JSON.parse(row.cables_json || '[]');

  // ── 노드별 케이블 집계 ────────────────────────────────────────────────
  const nodeCables: Record<string, { od: number }[]> = {};

  for (const cable of cables) {
    const pathStr = cable.calculatedPath || cable.path || '';
    if (!pathStr) continue;
    // 구분자: 쉼표, →, > 모두 지원
    const nodes = pathStr.split(/[,→>]/).map(n => n.trim()).filter(Boolean);
    const unique = [...new Set(nodes)];
    for (const nodeName of unique) {
      if (!nodeCables[nodeName]) nodeCables[nodeName] = [];
      nodeCables[nodeName].push({ od: cable.od ?? 10 });
    }
  }

  // ── 노드별 트레이폭 계산 ──────────────────────────────────────────────
  const results: Record<string, {
    cableCount: number;
    totalArea: number;
    recommendedWidth: number;
    fillRatio: number;
  }> = {};

  for (const [nodeName, cableList] of Object.entries(nodeCables)) {
    const { recommendedWidth, totalArea, fillRatio } = recommendWidth(cableList);
    results[nodeName] = {
      cableCount: cableList.length,
      totalArea,
      recommendedWidth,
      fillRatio,
    };
  }

  // 노드 수 / 처리 케이블 수 메타 정보 포함
  return json({
    success: true,
    nodeCount: Object.keys(results).length,
    cableCount: cables.length,
    results,
  });
};
