/**
 * SCMS Pages Function — /api/naver-user
 * GET  → 네이버 access_token으로 사용자 정보 조회 (CORS 프록시)
 *
 * 브라우저에서 직접 openapi.naver.com을 호출하면 CORS 오류가 발생하므로,
 * Cloudflare Worker(서버사이드)에서 대신 호출해 반환한다.
 */

interface Env {
  scms_db: D1Database;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

export const onRequest: PagesFunction<Env> = async ({ request }) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // Authorization: Bearer <naver_access_token>
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) {
    return json({ error: 'Missing token' }, 400);
  }

  try {
    const naverRes = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await naverRes.json() as any;
    return json(data, naverRes.status);
  } catch (e: any) {
    return json({ error: 'Naver API error', detail: e?.message }, 502);
  }
};
