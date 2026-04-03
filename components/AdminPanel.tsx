import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useProject } from '../contexts/ProjectContext';
import {
  Shield, Users, Ship, ChevronRight, LogOut, Trash2, Clock, Database,
  RefreshCw, Home, UserCheck, UserX, Mail, CheckCircle, XCircle,
  ChevronDown, ChevronUp, Download, Search, Lock, Unlock, Settings,
  AlertTriangle, Check, X, Edit3, Save,
} from 'lucide-react';
import {
  fetchAdminUsersAPI,
  updateUserPermissionsAPI,
  deleteUserAPI,
  fetchApprovalsAPI,
  processApprovalAPI,
} from '../services/apiClient';
import type { AdminUser, ApprovalRequest, UserPermissions } from '../types';
import { MENU_PERMISSIONS, DEFAULT_PERMISSIONS } from '../types';

interface Props {
  userName?: string;
  onLogout: () => void;
  onGoToProjects: () => void;
}

// ── 메뉴 그룹 ─────────────────────────────────────────────────────
const MENU_GROUPS = ['기본 메뉴', '고급 메뉴', '특별 권한'] as const;

// ── 유틸 ─────────────────────────────────────────────────────────
function mergePerms(p: Partial<UserPermissions>): UserPermissions {
  return { ...DEFAULT_PERMISSIONS, ...p };
}

function providerLabel(p: string) {
  const m: Record<string, string> = { google: 'Google', kakao: 'Kakao', naver: 'Naver', local: 'Guest', demo: 'Demo', unknown: '??' };
  return m[p] || p;
}

function providerColor(p: string) {
  const m: Record<string, string> = {
    google: 'text-red-400 bg-red-900/30',
    kakao: 'text-yellow-400 bg-yellow-900/30',
    naver: 'text-emerald-400 bg-emerald-900/30',
    local: 'text-slate-300 bg-slate-700',
    demo: 'text-purple-400 bg-purple-900/30',
  };
  return m[p] || 'text-slate-400 bg-slate-700';
}

// ── 엑셀 내보내기 (xlsx) ─────────────────────────────────────────
async function exportUsersToExcel(users: AdminUser[]) {
  try {
    const XLSX = await import('xlsx');
    const rows = users.map(u => {
      const perms = mergePerms(u.permissions);
      const row: Record<string, unknown> = {
        '사용자ID': u.user_id,
        '이름': u.name,
        '이메일': u.email,
        '프로바이더': providerLabel(u.provider),
        '상태': u.status === 'active' ? '활성' : '정지',
        '프로젝트 수': u.project_count,
        '가입일': u.created_at ? new Date(u.created_at).toLocaleDateString('ko-KR') : '',
        '마지막 접속': u.last_seen ? new Date(u.last_seen).toLocaleDateString('ko-KR') : '',
      };
      for (const m of MENU_PERMISSIONS) {
        row[m.label] = (perms as any)[m.id] ? 'O' : 'X';
      }
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '사용자 목록');
    XLSX.writeFile(wb, `SCMS_사용자목록_${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (e) {
    alert('엑셀 내보내기 실패: ' + e);
  }
}

// ── 개별 사용자 행 ────────────────────────────────────────────────
interface UserRowProps {
  user: AdminUser;
  onSave: (u: AdminUser, perms: UserPermissions, status: 'active' | 'suspended') => Promise<void>;
  onDelete: (u: AdminUser, withProjects: boolean) => Promise<void>;
}

function UserRow({ user, onSave, onDelete }: UserRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [perms, setPerms] = useState<UserPermissions>(mergePerms(user.permissions));
  const [status, setStatus] = useState<'active' | 'suspended'>(user.status);
  const [saving, setSaving] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [withProjects, setWithProjects] = useState(false);
  const [saved, setSaved] = useState(false);

  const togglePerm = (id: string) => {
    setPerms(p => ({ ...p, [id]: !(p as any)[id] }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ ...user, status }, perms, status);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    await onDelete(user, withProjects);
  };

  // 그룹별 메뉴 분류
  const grouped = MENU_GROUPS.map(g => ({
    group: g,
    items: MENU_PERMISSIONS.filter(m => m.group === g),
  }));

  const allOn = MENU_PERMISSIONS.every(m => (perms as any)[m.id]);
  const allOff = MENU_PERMISSIONS.every(m => !(perms as any)[m.id]);

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${
      status === 'suspended' ? 'border-red-800/50 bg-red-950/20' : 'border-slate-700 bg-slate-800'
    }`}>
      {/* 헤더 행 */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-700/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        {/* 아바타 */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
          user.user_id === 'admin_user'
            ? 'bg-amber-900/50 text-amber-300 border border-amber-700/50'
            : 'bg-slate-700 text-slate-300 border border-slate-600'
        }`}>
          {(user.name || user.user_id).slice(0, 1).toUpperCase()}
        </div>

        {/* 이름 + 이메일 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-white truncate max-w-[140px]">
              {user.name || user.user_id.slice(0, 20)}
            </span>
            {user.user_id === 'admin_user' && (
              <span className="text-[8px] text-amber-400 bg-amber-900/30 px-1.5 py-0.5 rounded font-bold shrink-0">ADMIN</span>
            )}
            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded shrink-0 ${providerColor(user.provider)}`}>
              {providerLabel(user.provider)}
            </span>
            {status === 'suspended' && (
              <span className="text-[8px] text-red-400 bg-red-900/30 px-1.5 py-0.5 rounded font-bold shrink-0">정지</span>
            )}
          </div>
          <div className="text-[9px] text-slate-500 truncate mt-0.5">{user.email || user.user_id}</div>
        </div>

        {/* 프로젝트 수 */}
        <div className="text-[9px] text-slate-400 shrink-0 text-right hidden sm:block">
          <Database size={8} className="inline mr-0.5" />
          {user.project_count}건
        </div>

        {/* 펼치기 */}
        <div className="text-slate-500 shrink-0">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {/* 펼쳐진 권한 설정 */}
      {expanded && (
        <div className="border-t border-slate-700/50 p-4 space-y-4">
          {/* 상태 토글 */}
          {user.user_id !== 'admin_user' && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400">계정 상태</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setStatus('active')}
                  className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-colors ${
                    status === 'active'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-700 text-slate-400 hover:bg-emerald-900/40 hover:text-emerald-300'
                  }`}
                >
                  <Unlock size={10} /> 활성
                </button>
                <button
                  onClick={() => setStatus('suspended')}
                  className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-colors ${
                    status === 'suspended'
                      ? 'bg-red-700 text-white'
                      : 'bg-slate-700 text-slate-400 hover:bg-red-900/40 hover:text-red-300'
                  }`}
                >
                  <Lock size={10} /> 정지
                </button>
              </div>
            </div>
          )}

          {/* 전체 선택 */}
          {user.user_id !== 'admin_user' && (
            <div className="flex items-center gap-2 pb-1 border-b border-slate-700/50">
              <span className="text-[10px] font-bold text-slate-400 flex-1">메뉴 접근 권한</span>
              <button
                onClick={() => setPerms(Object.fromEntries(MENU_PERMISSIONS.map(m => [m.id, true])) as any)}
                className="text-[9px] text-emerald-400 hover:text-emerald-300 font-bold px-2 py-0.5 rounded bg-emerald-900/20 hover:bg-emerald-900/40 transition-colors"
              >
                전체 허용
              </button>
              <button
                onClick={() => setPerms(Object.fromEntries(MENU_PERMISSIONS.map(m => [m.id, false])) as any)}
                className="text-[9px] text-red-400 hover:text-red-300 font-bold px-2 py-0.5 rounded bg-red-900/20 hover:bg-red-900/40 transition-colors"
              >
                전체 차단
              </button>
            </div>
          )}

          {/* 권한 체크박스 그리드 */}
          {user.user_id !== 'admin_user' ? (
            <div className="space-y-3">
              {grouped.map(({ group, items }) => (
                <div key={group}>
                  <div className="text-[9px] text-slate-500 font-bold uppercase mb-1.5 px-1">{group}</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                    {items.map(m => (
                      <label
                        key={m.id}
                        className={`flex items-center gap-1.5 cursor-pointer text-[10px] font-medium rounded-lg px-2 py-1.5 transition-colors ${
                          (perms as any)[m.id]
                            ? 'text-white bg-blue-900/30 border border-blue-700/40'
                            : 'text-slate-500 bg-slate-700/30 border border-slate-700/30 hover:border-slate-600'
                        } ${m.group === '특별 권한' ? 'border-dashed col-span-2 sm:col-span-1' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={!!(perms as any)[m.id]}
                          onChange={() => togglePerm(m.id)}
                          className="w-3 h-3 accent-blue-500 shrink-0"
                        />
                        {m.group === '특별 권한' ? (
                          <span className="flex items-center gap-1">
                            <Download size={9} className="text-cyan-400" />
                            {m.label}
                          </span>
                        ) : m.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-amber-400/80 bg-amber-900/20 border border-amber-800/40 rounded-lg px-3 py-2 flex items-center gap-2">
              <Shield size={12} /> 관리자는 모든 권한을 보유합니다
            </div>
          )}

          {/* 저장 / 삭제 버튼 */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
            {user.user_id !== 'admin_user' ? (
              <>
                {/* 삭제 */}
                {deleteMode ? (
                  <div className="flex flex-col gap-1.5">
                    <label className="flex items-center gap-1.5 text-[10px] text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={withProjects}
                        onChange={e => setWithProjects(e.target.checked)}
                        className="w-3 h-3 accent-red-500"
                      />
                      프로젝트 데이터도 함께 삭제
                    </label>
                    <div className="flex gap-1.5">
                      <button
                        onClick={handleDelete}
                        className="text-[10px] text-red-300 bg-red-900/50 hover:bg-red-800/60 border border-red-700/50 px-3 py-1.5 rounded-lg font-bold transition-colors"
                      >
                        삭제 확정
                      </button>
                      <button
                        onClick={() => { setDeleteMode(false); setWithProjects(false); }}
                        className="text-[10px] text-slate-400 hover:text-slate-300 border border-slate-600 px-3 py-1.5 rounded-lg font-bold transition-colors"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteMode(true)}
                    className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-900/20 border border-transparent hover:border-red-800/40 px-2.5 py-1.5 rounded-lg transition-colors"
                  >
                    <Trash2 size={11} /> 사용자 삭제
                  </button>
                )}

                {/* 저장 */}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className={`flex items-center gap-1.5 text-[10px] font-bold px-4 py-1.5 rounded-lg transition-colors ${
                    saved
                      ? 'bg-emerald-700 text-white'
                      : 'bg-blue-600 hover:bg-blue-500 text-white'
                  }`}
                >
                  {saving ? (
                    <RefreshCw size={11} className="animate-spin" />
                  ) : saved ? (
                    <Check size={11} />
                  ) : (
                    <Save size={11} />
                  )}
                  {saved ? '저장됨' : saving ? '저장 중...' : '권한 저장'}
                </button>
              </>
            ) : (
              <span className="text-[9px] text-slate-600">관리자 계정은 수정 불가</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────
export default function AdminPanel({ userName, onLogout, onGoToProjects }: Props) {
  const { projects, removeProject, isLoading, loadProjects } = useProject();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'overview' | 'projects' | 'users' | 'approvals'>('overview');

  // 사용자 관리
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');

  // 승인 관리
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [approvalsLoading, setApprovalsLoading] = useState(false);

  // 통계
  const totalProjects = projects.length;
  const totalCables = projects.reduce((sum, p) => sum + (p.cables?.length || 0), 0);
  const totalNodes = projects.reduce((sum, p) => sum + (p.nodes?.length || 0), 0);
  const pendingCount = approvals.filter(a => a.status === 'pending').length;

  // 사용자 로드
  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const list = await fetchAdminUsersAPI();
      setUsers(list);
    } catch (e: any) {
      setUsersError(e.message || '불러오기 실패');
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // 승인 로드
  const loadApprovals = useCallback(async () => {
    setApprovalsLoading(true);
    try {
      const list = await fetchApprovalsAPI();
      setApprovals(list);
    } catch {
      // fallback: localStorage
      try {
        const raw = localStorage.getItem('scms_approval_requests');
        if (raw) setApprovals(JSON.parse(raw));
      } catch {}
    } finally {
      setApprovalsLoading(false);
    }
  }, []);

  // 탭 전환 시 데이터 로드
  useEffect(() => {
    if (activeSection === 'users') loadUsers();
    if (activeSection === 'approvals') loadApprovals();
  }, [activeSection, loadUsers, loadApprovals]);

  // 프로젝트 삭제
  const handleDeleteProject = async (id: string) => {
    await removeProject(id);
    setDeleteConfirm(null);
  };

  // 사용자 권한 저장
  const handleSaveUser = async (user: AdminUser, perms: UserPermissions, status: 'active' | 'suspended') => {
    await updateUserPermissionsAPI(user.user_id, {
      name: user.name,
      email: user.email,
      provider: user.provider,
      permissions: perms,
      status,
    });
    setUsers(prev => prev.map(u =>
      u.user_id === user.user_id ? { ...u, permissions: perms, status } : u
    ));
  };

  // 사용자 삭제
  const handleDeleteUser = async (user: AdminUser, withProjects: boolean) => {
    if (!window.confirm(`${user.name || user.user_id} 사용자를 삭제하시겠습니까?`)) return;
    await deleteUserAPI(user.user_id, withProjects);
    setUsers(prev => prev.filter(u => u.user_id !== user.user_id));
    if (withProjects) await loadProjects();
  };

  // 승인 처리
  const handleApproval = async (id: string, status: 'approved' | 'rejected') => {
    try {
      await processApprovalAPI(id, status);
      setApprovals(prev => prev.map(a => a.id === id ? { ...a, status } : a));
      if (status === 'approved') await loadUsers();
    } catch {
      // fallback: localStorage
      setApprovals(prev => {
        const updated = prev.map(a => a.id === id ? { ...a, status } : a);
        try { localStorage.setItem('scms_approval_requests', JSON.stringify(updated)); } catch {}
        return updated;
      });
    }
  };

  // 검색 필터
  const filteredUsers = useMemo(() => {
    const q = userSearch.toLowerCase().trim();
    if (!q) return users;
    return users.filter(u =>
      u.user_id.toLowerCase().includes(q) ||
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  const TABS = [
    { id: 'overview'  as const, label: '개요',    icon: <Shield size={12} /> },
    { id: 'projects'  as const, label: '프로젝트', icon: <Ship size={12} /> },
    { id: 'users'     as const, label: '사용자',   icon: <Users size={12} /> },
    { id: 'approvals' as const, label: `신청${pendingCount > 0 ? ` (${pendingCount})` : ''}`, icon: <UserCheck size={12} /> },
  ];

  return (
    <div className="h-screen bg-slate-950 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="shrink-0 bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-amber-400" />
            <span className="text-sm font-black text-white">Admin</span>
            <span className="text-[8px] text-amber-400/60 bg-amber-900/30 px-1.5 py-0.5 rounded font-bold">ADMIN</span>
          </div>
          <div className="h-4 w-px bg-slate-700" />
          <button onClick={onGoToProjects}
            className="flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300 font-bold transition-colors">
            <Home size={12} /> 메인 (호선 관리)
          </button>
        </div>
        <div className="flex items-center gap-3">
          {userName && <span className="text-[10px] text-slate-400">👤 {userName}</span>}
          <button onClick={onLogout}
            className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 border border-slate-700 hover:border-red-500/40 px-2.5 py-1 rounded transition-colors">
            <LogOut size={10} /> 로그아웃
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="shrink-0 flex border-b border-slate-800 bg-slate-900/50">
        {TABS.map(tab => (
          <button key={tab.id}
            onClick={() => setActiveSection(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-bold transition-colors border-b-2 ${
              activeSection === tab.id
                ? 'text-amber-400 border-amber-400 bg-amber-900/10'
                : 'text-slate-500 border-transparent hover:text-slate-300'
            }`}
          >
            {tab.icon} {tab.label}
            {tab.id === 'approvals' && pendingCount > 0 && (
              <span className="ml-0.5 w-4 h-4 bg-red-500 text-white text-[8px] rounded-full flex items-center justify-center font-bold">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">

        {/* ── 개요 ── */}
        {activeSection === 'overview' && (
          <div className="max-w-4xl mx-auto flex flex-col gap-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: '전체 프로젝트', value: totalProjects, color: 'text-white' },
                { label: '등록 사용자', value: users.length || '—', color: 'text-white' },
                { label: '총 케이블', value: totalCables.toLocaleString(), color: 'text-blue-400' },
                { label: '총 노드', value: totalNodes.toLocaleString(), color: 'text-emerald-400' },
              ].map(c => (
                <div key={c.label} className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                  <div className="text-[10px] text-slate-500 font-bold uppercase">{c.label}</div>
                  <div className={`text-2xl font-black mt-1 ${c.color}`}>{c.value}</div>
                </div>
              ))}
            </div>

            {pendingCount > 0 && (
              <button onClick={() => setActiveSection('approvals')}
                className="w-full flex items-center justify-between bg-amber-600 hover:bg-amber-700 text-white rounded-xl px-4 py-3 transition-colors">
                <div className="flex items-center gap-2">
                  <UserCheck size={16} />
                  <span className="text-sm font-bold">사용 승인 대기 {pendingCount}건</span>
                </div>
                <ChevronRight size={16} />
              </button>
            )}

            <button onClick={onGoToProjects}
              className="w-full flex items-center justify-between bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-4 py-3.5 transition-colors">
              <div className="flex items-center gap-2">
                <Ship size={16} />
                <span className="text-sm font-bold">프로젝트 선택 / 호선 관리</span>
              </div>
              <ChevronRight size={16} />
            </button>

            <button onClick={() => { loadProjects(); loadUsers(); loadApprovals(); }}
              className="w-full flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-white border border-slate-700 rounded-xl py-2.5 transition-colors">
              <RefreshCw size={12} /> 데이터 새로고침
            </button>
          </div>
        )}

        {/* ── 프로젝트 ── */}
        {activeSection === 'projects' && (
          <div className="max-w-4xl mx-auto flex flex-col gap-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-white">전체 프로젝트 ({totalProjects})</h3>
              <button onClick={() => loadProjects()} className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white transition-colors">
                <RefreshCw size={10} /> 새로고침
              </button>
            </div>
            {isLoading ? (
              <div className="text-center py-8 text-slate-500 text-xs">로딩 중...</div>
            ) : projects.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs">프로젝트가 없습니다</div>
            ) : (
              projects.map(proj => (
                <div key={proj.id} className="bg-slate-800 border border-slate-700 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-900/40 border border-blue-500/30 rounded-lg flex items-center justify-center shrink-0">
                    <Ship size={14} className="text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-white text-xs truncate">{proj.name}</span>
                      {proj.vesselNo && (
                        <span className="text-[9px] text-blue-300 bg-blue-900/40 px-1.5 py-0.5 rounded font-bold shrink-0">{proj.vesselNo}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] text-slate-500">
                        <Database size={8} className="inline mr-0.5" />
                        {proj.cables?.length || 0}C · {proj.nodes?.length || 0}N
                      </span>
                      <span className="text-[9px] text-slate-600">
                        <Clock size={8} className="inline mr-0.5" />
                        {new Date(proj.updatedAt).toLocaleDateString('ko-KR')}
                      </span>
                      <span className="text-[9px] text-slate-600 truncate">
                        👤 {proj.userId === 'admin_user' ? 'Admin' : proj.userId.slice(0, 18)}
                      </span>
                    </div>
                  </div>
                  {deleteConfirm === proj.id ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => handleDeleteProject(proj.id)} className="text-[10px] text-red-400 font-bold px-1.5">삭제</button>
                      <button onClick={() => setDeleteConfirm(null)} className="text-[10px] text-slate-400 font-bold px-1.5">취소</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirm(proj.id)}
                      className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-900/20 rounded transition-all shrink-0">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── 사용자 관리 ── */}
        {activeSection === 'users' && (
          <div className="max-w-4xl mx-auto flex flex-col gap-3">
            {/* 툴바 */}
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-white flex-1">사용자 관리 ({filteredUsers.length}명)</h3>
              <button
                onClick={() => exportUsersToExcel(filteredUsers)}
                className="flex items-center gap-1.5 text-[10px] font-bold text-cyan-400 hover:text-cyan-300 bg-cyan-900/20 hover:bg-cyan-900/40 border border-cyan-800/40 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Download size={11} /> 사용자 목록 엑셀
              </button>
              <button
                onClick={loadUsers}
                disabled={usersLoading}
                className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white border border-slate-700 px-2.5 py-1.5 rounded-lg transition-colors"
              >
                <RefreshCw size={10} className={usersLoading ? 'animate-spin' : ''} /> 새로고침
              </button>
            </div>

            {/* 검색 */}
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="이름, 이메일, ID 검색..."
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-xs text-white pl-8 pr-3 py-2 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* 안내 */}
            <div className="text-[10px] text-slate-500 bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 flex items-center gap-2">
              <Settings size={10} className="text-slate-400 shrink-0" />
              사용자 행을 클릭하면 권한 설정을 펼칠 수 있습니다. 체크박스로 메뉴 접근 권한 및 엑셀 다운로드 권한을 개별 설정하세요.
            </div>

            {/* 사용자 목록 */}
            {usersLoading ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-slate-600" />
                사용자 목록 불러오는 중...
              </div>
            ) : usersError ? (
              <div className="text-center py-8 border border-dashed border-red-800/40 rounded-xl text-red-400 text-xs">
                <AlertTriangle size={20} className="mx-auto mb-2" />
                {usersError}
                <br />
                <button onClick={loadUsers} className="mt-2 text-slate-400 hover:text-white underline">재시도</button>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-700 rounded-xl">
                <Users size={28} className="text-slate-600 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">등록된 사용자가 없습니다</p>
                <p className="text-[10px] text-slate-500 mt-1">사용자들이 로그인하면 여기에 표시됩니다</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredUsers.map(u => (
                  <UserRow
                    key={u.user_id}
                    user={u}
                    onSave={handleSaveUser}
                    onDelete={handleDeleteUser}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── 사용 승인 신청 ── */}
        {activeSection === 'approvals' && (
          <div className="max-w-4xl mx-auto flex flex-col gap-3">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-bold text-white">사용 승인 신청</h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500">{approvals.length}건</span>
                <button onClick={loadApprovals} className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white border border-slate-700 px-2 py-1 rounded transition-colors">
                  <RefreshCw size={9} className={approvalsLoading ? 'animate-spin' : ''} /> 새로고침
                </button>
              </div>
            </div>

            {approvals.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-700 rounded-xl">
                <UserCheck size={32} className="text-slate-600 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">승인 신청이 없습니다</p>
                <p className="text-[10px] text-slate-500 mt-1">비관리자가 Google로 로그인하면 승인 요청이 여기에 표시됩니다</p>
              </div>
            ) : (
              approvals.map(req => (
                <div key={req.id} className={`bg-slate-800 border rounded-xl p-4 ${
                  req.status === 'pending'  ? 'border-amber-500/40' :
                  req.status === 'approved' ? 'border-emerald-500/30' : 'border-red-500/30'
                }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-bold text-white">{req.name}</span>
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
                          req.status === 'pending'  ? 'text-amber-400 bg-amber-900/30' :
                          req.status === 'approved' ? 'text-emerald-400 bg-emerald-900/30' :
                                                      'text-red-400 bg-red-900/30'
                        }`}>
                          {req.status === 'pending' ? '대기' : req.status === 'approved' ? '승인됨' : '거절됨'}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 text-[10px] text-slate-400">
                        <span><Mail size={10} className="inline mr-1" />{req.email}</span>
                        {(req.company || req.phone) && (
                          <span>🏢 {req.company}{req.company && req.phone ? ' · ' : ''}📞 {req.phone}</span>
                        )}
                        <span className="text-slate-600 text-[9px]">
                          <Clock size={9} className="inline mr-1" />
                          {new Date(req.requested_at).toLocaleString('ko-KR')}
                        </span>
                        <span className="text-slate-600 text-[9px] truncate">ID: {req.user_id}</span>
                      </div>
                    </div>
                    {req.status === 'pending' && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => handleApproval(req.id, 'approved')}
                          className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-900/30 hover:bg-emerald-900/50 border border-emerald-800/40 px-2.5 py-1.5 rounded-lg transition-colors">
                          <CheckCircle size={12} /> 승인
                        </button>
                        <button onClick={() => handleApproval(req.id, 'rejected')}
                          className="flex items-center gap-1 text-[10px] font-bold text-red-400 hover:text-red-300 bg-red-900/30 hover:bg-red-900/50 border border-red-800/40 px-2.5 py-1.5 rounded-lg transition-colors">
                          <XCircle size={12} /> 거절
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
