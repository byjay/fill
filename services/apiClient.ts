/**
 * D1 API 클라이언트
 * Cloudflare Pages Functions (/api/projects) 호출
 */

import { getAuthToken } from './firebase';
import type { Project, CableData, NodeData, HistoryEntry, TrayFillSummary, AdminUser, ApprovalRequest, UserPermissions } from '../types';

const BASE = '/api';

async function authHeaders(): Promise<Record<string, string>> {
  // 항상 localStorage의 session.id (Firebase UID or guest_xxx) 를 userId로 사용.
  // Firebase ID 토큰(JWT)은 매 세션마다 갱신되어 userId로 부적합 — session.id는 안정적인 식별자.
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

// ── 관리자 API ──────────────────────────────────────────────────

export async function fetchAdminUsersAPI(): Promise<AdminUser[]> {
  try {
    const res = await fetch(`${BASE}/admin/users`, { headers: await authHeaders() });
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

export async function updateUserPermissionsAPI(
  userId: string,
  permissions: Partial<UserPermissions>,
  status?: 'active' | 'suspended',
): Promise<void> {
  try {
    await fetch(`${BASE}/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify({ permissions, status }),
    });
  } catch { /* ignore */ }
}

export async function deleteUserAPI(userId: string): Promise<void> {
  try {
    await fetch(`${BASE}/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
  } catch { /* ignore */ }
}

export async function fetchApprovalsAPI(): Promise<ApprovalRequest[]> {
  try {
    const res = await fetch(`${BASE}/admin/approvals`, { headers: await authHeaders() });
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

export async function processApprovalAPI(
  requestId: string,
  action: 'approve' | 'reject',
): Promise<void> {
  try {
    // 백엔드: PUT method + { status: 'approved'|'rejected' } 형태 필요
    const status = action === 'approve' ? 'approved' : 'rejected';
    await fetch(`${BASE}/admin/approvals/${encodeURIComponent(requestId)}`, {
      method: 'PUT',   // POST → PUT (백엔드 요구사항)
      headers: await authHeaders(),
      body: JSON.stringify({ status }),  // { action } → { status }
    });
  } catch { /* ignore */ }
}

// ── 승인 요청 제출 (pendingUser.uid 직접 전달 → 'anonymous' 충돌 방지) ────────
export async function submitApprovalRequestAPI(data: {
  name: string;
  email: string;
  company: string;
  phone: string;
  provider?: string;
}, overrideUserId?: string): Promise<{ success?: boolean; id?: string; already?: string; error?: string }> {
  try {
    // overrideUserId가 있으면 (미승인 사용자의 Firebase UID) 그것을 사용
    // 없으면 localStorage 세션에서 읽음 (로그인된 사용자)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': overrideUserId
        ? `Bearer ${overrideUserId}`
        : ((await authHeaders())['Authorization'] || 'Bearer anonymous'),
    };
    const res = await fetch(`${BASE}/admin/approvals`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return res.json();
  } catch (e) {
    return { error: String(e) };
  }
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
