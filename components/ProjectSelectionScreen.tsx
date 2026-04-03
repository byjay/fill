import React, { useState } from 'react';
import { useProject } from '../contexts/ProjectContext';
import { Plus, Ship, Trash2, ChevronRight, Clock, Database, LogIn } from 'lucide-react';
import ProjectUploadModal, { ProjectUploadResult } from './ProjectUploadModal';
import { CableData, NodeData } from '../types';

interface Props {
  userName?: string;
  onLogout?: () => void;
  onAutoRoute?: () => void;
}

export default function ProjectSelectionScreen({ userName, onLogout, onAutoRoute }: Props) {
  const { projects, selectProject, createProject, removeProject, updateCablesAndNodes, isLoading } = useProject();
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    await removeProject(id);
    setDeleteConfirm(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between">
        <img src="/logo.jpg" alt="SEASTAR" className="h-9 object-contain" />
        <div className="flex items-center gap-3">
          {userName && (
            <span className="text-xs text-slate-300 font-medium hidden sm:block">
              👤 {userName}
            </span>
          )}
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">CABLE MANAGEMENT SYSTEM</span>
          {onLogout && (
            <button
              onClick={onLogout}
              className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-500/40 px-2 py-1 rounded transition-colors"
            >
              <LogIn size={10} className="rotate-180" /> 로그아웃
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex items-start justify-center pt-12 px-4">
        <div className="w-full max-w-2xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-black text-white">
                {userName ? `${userName}의 프로젝트` : '프로젝트 선택'}
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">호선을 선택하거나 새 프로젝트를 등록하세요</p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-lg"
            >
              <Plus size={16} /> 호선 등록
            </button>
          </div>

          {/* Create modal */}
          {showCreate && (
            <ProjectUploadModal
              onCancel={() => setShowCreate(false)}
              onConfirm={async (result: ProjectUploadResult) => {
                setCreating(true);
                try {
                  await createProject(result.vesselName, result.vesselNo);
                  await updateCablesAndNodes(
                    result.cables as CableData[],
                    result.nodes as NodeData[],
                    '파일 업로드',
                  );
                  if (result.autoRoute && onAutoRoute) {
                    onAutoRoute();
                  }
                  setShowCreate(false);
                } catch (err) {
                  console.warn('프로젝트 생성 실패:', err);
                } finally {
                  setCreating(false);
                }
              }}
            />
          )}

          {/* Project list */}
          {isLoading ? (
            <div className="text-center py-12 text-slate-500">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              프로젝트 로딩 중...
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-slate-700 rounded-xl">
              <Ship size={40} className="text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">등록된 프로젝트가 없습니다</p>
              <p className="text-xs text-slate-500 mt-1">위의 "호선 등록" 버튼으로 첫 프로젝트를 만드세요</p>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-4 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-colors mx-auto"
              >
                <Plus size={16} /> 첫 호선 등록하기
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {projects.map(proj => (
                <div
                  key={proj.id}
                  className="bg-slate-800 border border-slate-700 hover:border-blue-500/50 rounded-xl p-4 flex items-center gap-4 transition-all group"
                >
                  <div className="w-10 h-10 bg-blue-900/40 border border-blue-500/30 rounded-lg flex items-center justify-center shrink-0">
                    <Ship size={20} className="text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm truncate">{proj.name}</span>
                      {proj.vesselNo && (
                        <span className="text-[10px] text-blue-300 bg-blue-900/40 px-2 py-0.5 rounded font-bold shrink-0">{proj.vesselNo}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] text-slate-500 flex items-center gap-1">
                        <Database size={10} /> {proj.cables.length} 케이블 · {proj.nodes.length} 노드
                      </span>
                      <span className="text-[10px] text-slate-600 flex items-center gap-1">
                        <Clock size={10} /> {new Date(proj.updatedAt).toLocaleDateString('ko-KR')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {deleteConfirm === proj.id ? (
                      <>
                        <span className="text-xs text-red-400">삭제?</span>
                        <button onClick={() => handleDelete(proj.id)} className="text-xs text-red-400 hover:text-red-300 font-bold px-2">확인</button>
                        <button onClick={() => setDeleteConfirm(null)} className="text-xs text-slate-400 hover:text-slate-300 font-bold px-2">취소</button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setDeleteConfirm(proj.id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                        <button
                          onClick={() => selectProject(proj.id)}
                          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                        >
                          열기 <ChevronRight size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
