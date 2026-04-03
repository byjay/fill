/**
 * GroupPanel.tsx
 * 그룹 관리 UI — 생성 / 가입 / 멤버확인 / 프로젝트 공유 설정
 * ProjectTab 또는 ProjectSelectionScreen에서 열 수 있음
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Plus, LogIn, Copy, Check, Trash2, LogOut as LeaveIcon,
  ChevronDown, ChevronRight, Share2, X as XIcon, RefreshCw,
} from 'lucide-react';
import {
  fetchGroupsAPI, createGroupAPI, joinGroupAPI, leaveGroupAPI,
  deleteGroupAPI, fetchGroupDetailAPI, setProjectGroupAPI,
  GroupInfo, GroupDetail,
} from '../services/apiClient';
import type { Project } from '../types';

interface GroupPanelProps {
  userId: string;
  projects: Project[];          // 내 프로젝트 목록 (공유 설정용)
  onClose: () => void;
  onGroupsChanged?: () => void; // 그룹 변경 후 프로젝트 목록 재로드 콜백
}

const GroupPanel: React.FC<GroupPanelProps> = ({ userId, projects, onClose, onGroupsChanged }) => {
  const [groups, setGroups]         = useState<GroupInfo[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  // 그룹 생성
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName]       = useState('');
  const [creating, setCreating]     = useState(false);

  // 그룹 가입
  const [showJoin, setShowJoin]     = useState(false);
  const [joinCode, setJoinCode]     = useState('');
  const [joining, setJoining]       = useState(false);

  // 그룹 상세 (멤버/공유 설정)
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail]         = useState<GroupDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 복사 피드백
  const [copiedId, setCopiedId]     = useState<string | null>(null);

  // ── 그룹 목록 로드 ──────────────────────────────────────────────
  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchGroupsAPI();
      setGroups(list);
    } catch (e: any) {
      setError(e?.message || '그룹 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  // ── 그룹 상세 로드 ──────────────────────────────────────────────
  const toggleDetail = async (groupId: string) => {
    if (expandedId === groupId) { setExpandedId(null); setDetail(null); return; }
    setExpandedId(groupId);
    setDetailLoading(true);
    try {
      const d = await fetchGroupDetailAPI(groupId);
      setDetail(d);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  // ── 그룹 생성 ────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const g = await createGroupAPI(newName.trim());
      setGroups(prev => [g, ...prev]);
      setNewName('');
      setShowCreate(false);
      onGroupsChanged?.();
    } catch (e: any) {
      setError(e?.message || '그룹 생성 실패');
    } finally {
      setCreating(false);
    }
  };

  // ── 그룹 가입 ────────────────────────────────────────────────────
  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    setError(null);
    try {
      const { message, group } = await joinGroupAPI(joinCode.trim());
      if (message === 'already_member') {
        setError('이미 가입된 그룹입니다.');
      } else {
        setGroups(prev => [...prev, { ...group, member_count: 1 } as GroupInfo]);
        setJoinCode('');
        setShowJoin(false);
        onGroupsChanged?.();
      }
    } catch (e: any) {
      setError(e?.message || '가입 실패: 코드를 확인해주세요.');
    } finally {
      setJoining(false);
    }
  };

  // ── 탈퇴 ─────────────────────────────────────────────────────────
  const handleLeave = async (groupId: string) => {
    if (!confirm('이 그룹에서 탈퇴하시겠습니까?')) return;
    try {
      await leaveGroupAPI(groupId);
      setGroups(prev => prev.filter(g => g.id !== groupId));
      if (expandedId === groupId) { setExpandedId(null); setDetail(null); }
      onGroupsChanged?.();
    } catch (e: any) {
      setError(e?.message || '탈퇴 실패');
    }
  };

  // ── 그룹 삭제 ────────────────────────────────────────────────────
  const handleDelete = async (groupId: string) => {
    if (!confirm('그룹을 삭제하면 공유된 모든 프로젝트의 공유가 해제됩니다.\n계속하시겠습니까?')) return;
    try {
      await deleteGroupAPI(groupId);
      setGroups(prev => prev.filter(g => g.id !== groupId));
      if (expandedId === groupId) { setExpandedId(null); setDetail(null); }
      onGroupsChanged?.();
    } catch (e: any) {
      setError(e?.message || '삭제 실패');
    }
  };

  // ── 프로젝트 공유 토글 ───────────────────────────────────────────
  const handleShareToggle = async (groupId: string, projectId: string, currentlyShared: boolean) => {
    try {
      await setProjectGroupAPI(groupId, projectId, !currentlyShared);
      // 상세 새로고침
      const d = await fetchGroupDetailAPI(groupId);
      setDetail(d);
      onGroupsChanged?.();
    } catch (e: any) {
      setError(e?.message || '공유 설정 실패');
    }
  };

  // ── 초대코드 복사 ────────────────────────────────────────────────
  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  // 내 소유 프로젝트만 공유 설정 가능
  const myOwnProjects = projects.filter(p => p.userId === userId);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60 shrink-0">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-blue-400" />
            <span className="text-white font-bold text-sm">그룹 관리</span>
            <span className="text-[11px] text-slate-500 ml-1">타 호선 데이터 격리 + 팀 공유</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadGroups} className="text-slate-400 hover:text-white transition-colors">
              <RefreshCw size={15} />
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
              <XIcon size={18} />
            </button>
          </div>
        </div>

        {/* 보안 안내 배너 */}
        <div className="mx-4 mt-3 px-4 py-2.5 bg-blue-900/30 border border-blue-700/40 rounded-xl shrink-0">
          <p className="text-[11px] text-blue-300 leading-relaxed">
            🔒 <strong>데이터 격리 정책:</strong> 그룹에 공유되지 않은 프로젝트는 <strong>본인만</strong> 볼 수 있습니다.
            같은 그룹원은 그룹에 공유된 프로젝트만 열람 가능합니다.
          </p>
        </div>

        {/* 에러 */}
        {error && (
          <div className="mx-4 mt-2 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-xl shrink-0">
            <p className="text-[11px] text-red-400">⚠️ {error}</p>
          </div>
        )}

        {/* 액션 버튼 */}
        <div className="flex gap-2 px-4 pt-3 pb-2 shrink-0">
          <button
            onClick={() => { setShowCreate(true); setShowJoin(false); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors"
          >
            <Plus size={14} /> 그룹 생성
          </button>
          <button
            onClick={() => { setShowJoin(true); setShowCreate(false); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold rounded-xl transition-colors"
          >
            <LogIn size={14} /> 초대코드 입장
          </button>
        </div>

        {/* 그룹 생성 폼 */}
        {showCreate && (
          <div className="mx-4 mb-2 p-3 bg-slate-800/60 border border-slate-700/50 rounded-xl shrink-0">
            <p className="text-[11px] text-slate-400 mb-2 font-semibold">새 그룹 이름 (예: M-001 전선팀)</p>
            <div className="flex gap-2">
              <input
                type="text" value={newName} autoFocus
                placeholder="그룹 이름 입력"
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                className="flex-1 bg-slate-900 border border-slate-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-blue-500"
              />
              <button onClick={handleCreate} disabled={creating || !newName.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors">
                {creating ? '...' : '생성'}
              </button>
              <button onClick={() => { setShowCreate(false); setNewName(''); }}
                className="px-3 py-2 bg-slate-700 text-slate-300 text-xs rounded-lg hover:bg-slate-600 transition-colors">취소</button>
            </div>
          </div>
        )}

        {/* 가입 폼 */}
        {showJoin && (
          <div className="mx-4 mb-2 p-3 bg-slate-800/60 border border-slate-700/50 rounded-xl shrink-0">
            <p className="text-[11px] text-slate-400 mb-2 font-semibold">6자리 초대코드를 입력하세요</p>
            <div className="flex gap-2">
              <input
                type="text" value={joinCode} autoFocus maxLength={6}
                placeholder="000000"
                onChange={e => setJoinCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                className="flex-1 bg-slate-900 border border-slate-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-green-500 tracking-[0.3em] text-center font-mono"
              />
              <button onClick={handleJoin} disabled={joining || joinCode.length < 6}
                className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors">
                {joining ? '...' : '입장'}
              </button>
              <button onClick={() => { setShowJoin(false); setJoinCode(''); }}
                className="px-3 py-2 bg-slate-700 text-slate-300 text-xs rounded-lg hover:bg-slate-600 transition-colors">취소</button>
            </div>
          </div>
        )}

        {/* 그룹 목록 */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2 mt-1">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-500 text-sm">
              <RefreshCw size={16} className="animate-spin mr-2" /> 로딩 중...
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-600 text-xs gap-2">
              <Users size={32} className="opacity-30" />
              <p>아직 속한 그룹이 없습니다.</p>
              <p className="text-slate-700">그룹을 생성하거나 초대코드로 입장하세요.</p>
            </div>
          ) : (
            groups.map(g => (
              <div key={g.id} className="bg-slate-800/50 border border-slate-700/40 rounded-xl overflow-hidden">
                {/* 그룹 헤더 */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    onClick={() => toggleDetail(g.id)}
                    className="flex-1 flex items-center gap-3 text-left"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-black shrink-0 ${g.role === 'owner' ? 'bg-blue-600' : 'bg-slate-600'}`}>
                      {g.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm font-semibold truncate">{g.name}</span>
                        {g.role === 'owner' && (
                          <span className="text-[9px] bg-blue-600/80 text-white px-1.5 py-0.5 rounded font-bold shrink-0">OWNER</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[11px] text-slate-400">멤버 {g.member_count}명</span>
                        <span className="text-[11px] text-slate-500">코드: {g.invite_code}</span>
                      </div>
                    </div>
                    {expandedId === g.id
                      ? <ChevronDown size={14} className="text-slate-400 shrink-0" />
                      : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
                  </button>

                  {/* 초대코드 복사 */}
                  <button
                    onClick={() => copyCode(g.invite_code, g.id)}
                    className="p-2 text-slate-400 hover:text-blue-400 transition-colors shrink-0"
                    title="초대코드 복사"
                  >
                    {copiedId === g.id ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                  </button>

                  {/* 탈퇴/삭제 */}
                  {g.role === 'owner' ? (
                    <button onClick={() => handleDelete(g.id)}
                      className="p-2 text-slate-500 hover:text-red-400 transition-colors shrink-0" title="그룹 삭제">
                      <Trash2 size={14} />
                    </button>
                  ) : (
                    <button onClick={() => handleLeave(g.id)}
                      className="p-2 text-slate-500 hover:text-orange-400 transition-colors shrink-0" title="탈퇴">
                      <LeaveIcon size={14} />
                    </button>
                  )}
                </div>

                {/* 상세 패널 */}
                {expandedId === g.id && (
                  <div className="border-t border-slate-700/40 px-4 py-3 space-y-3 bg-slate-900/40">
                    {detailLoading ? (
                      <div className="text-center text-slate-500 text-xs py-3">
                        <RefreshCw size={12} className="animate-spin inline mr-1" /> 불러오는 중...
                      </div>
                    ) : detail ? (
                      <>
                        {/* 멤버 목록 */}
                        <div>
                          <p className="text-[11px] text-slate-400 font-semibold mb-1.5">👥 그룹 멤버</p>
                          <div className="space-y-1">
                            {detail.members.map(m => (
                              <div key={m.user_id} className="flex items-center gap-2 text-[11px]">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${m.role === 'owner' ? 'bg-blue-600/60 text-blue-200' : 'bg-slate-700 text-slate-400'}`}>
                                  {m.role === 'owner' ? 'OWNER' : 'MEMBER'}
                                </span>
                                <span className="text-slate-300 font-mono truncate">{m.user_id}</span>
                                {m.user_id === userId && <span className="text-blue-400 text-[9px]">(나)</span>}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* 프로젝트 공유 설정 (소유자만 자기 프로젝트 공유 가능) */}
                        {myOwnProjects.length > 0 && (
                          <div>
                            <p className="text-[11px] text-slate-400 font-semibold mb-1.5">
                              <Share2 size={11} className="inline mr-1" />내 프로젝트 공유 설정
                            </p>
                            <div className="space-y-1">
                              {myOwnProjects.map(p => {
                                const isShared = (p as any).groupId === g.id;
                                return (
                                  <div key={p.id} className="flex items-center justify-between py-1">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-[12px] text-white truncate">{p.name}</span>
                                      <span className="text-[10px] text-slate-500 shrink-0">{p.cables?.length || 0}케이블</span>
                                    </div>
                                    <button
                                      onClick={() => handleShareToggle(g.id, p.id, isShared)}
                                      className={`ml-2 px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors shrink-0 ${
                                        isShared
                                          ? 'bg-blue-600/80 text-white hover:bg-red-600/80'
                                          : 'bg-slate-700 text-slate-400 hover:bg-blue-600/60 hover:text-white'
                                      }`}
                                    >
                                      {isShared ? '공유 중 (해제)' : '공유하기'}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-[11px] text-slate-500 text-center py-2">상세 정보를 불러오지 못했습니다.</p>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default GroupPanel;
