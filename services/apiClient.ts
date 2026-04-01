/**
 * D1 API 클라이언트
 * Cloudflare Pages Functions (/api/projects) 호출
 */

import { getAuthToken } from './firebase';
import type { Project, CableData, NodeData, HistoryEntry, TrayFillSummary } from '../types';

const BASE = '/api';

async function authHeaders(): Promise<Record<string, string>> {
  // 1) Firebase 인증 사용자(Google) → Firebase ID 토큰 사용
  const firebaseToken = await getAuthToken();
  if (firebaseToken) {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${firebaseToken}`,
    };
  }
  // 2) 게스트/관리자(로컬 로그인) → localStorage의 userId 사용
  //    firebase 토큰이 없으면 세션에 저장된 id(guest_xxx / admin_user)를 그대로 Bearer로 전달
  try {
    const raw = localStorage.getItem('scms_user_session');
    if (raw) {
      const session = JSON.parse(raw) as { id?: string };
      if (session?.id) {
        return {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.id}`,
        };
      }
    }
  } catch { /* ignore */ }
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer anonymous',
  };
}

// ── 프로젝트 목록 조회 ──────────────────────────────────
export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${BASE}/projects`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`fetchProjects failed: ${res.status}`);
  return res.json();
}

// ── 새 프로젝트 생성 ──────────────────────────────────
export async function createProjectAPI(name: string, vesselNo: string): Promise<Project> {
  const res = await fetch(`${BASE}/projects`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ name, vesselNo }),
  });
  if (!res.ok) throw new Error(`createProject failed: ${res.status}`);
  return res.json();
}

// ── 프로젝트 업데이트 (cables + nodes + history) ──────────
export async function updateProjectAPI(
  id: string,
  cables: CableData[],
  nodes: NodeData[],
  history: HistoryEntry[],
): Promise<{ success: boolean; updatedAt: string }> {
  const res = await fetch(`${BASE}/projects/${id}`, {
    method: 'PUT',
    headers: await authHeaders(),
    body: JSON.stringify({ cables, nodes, history }),
  });
  if (!res.ok) throw new Error(`updateProject failed: ${res.status}`);
  return res.json();
}

// ── 프로젝트 삭제 ──────────────────────────────────
export async function deleteProjectAPI(id: string): Promise<void> {
  const res = await fetch(`${BASE}/projects/${id}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`deleteProject failed: ${res.status}`);
}

// ── 트레이 폭 사전 계산 (백엔드 Worker) ──────────────────────────────────
export async function calculateTrayFillAPI(projectId: string): Promise<{
  success: boolean;
  nodeCount: number;
  cableCount: number;
  results: TrayFillSummary;
}> {
  const res = await fetch(`${BASE}/tray-fill`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ projectId }),
  });
  if (!res.ok) throw new Error(`trayFill failed: ${res.status}`);
  return res.json();
}

// ── 히스토리 엔트리 생성 헬퍼 ──────────────────────────────────
export function makeHistoryEntry(
  action: HistoryEntry['action'],
  description: string,
  cables: CableData[],
  nodes: NodeData[],
): HistoryEntry {
  return {
    id: `h_${Date.now()}`,
    timestamp: new Date().toISOString(),
    action,
    description,
    cableCount: cables.length,
    nodeCount: nodes.length,
  };
}
