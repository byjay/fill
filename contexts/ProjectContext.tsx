import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Project, CableData, NodeData, HistoryEntry } from '../types';
import {
  fetchProjects,
  createProjectAPI,
  updateProjectAPI,
  deleteProjectAPI,
  makeHistoryEntry,
} from '../services/apiClient';

interface ProjectContextValue {
  projects: Project[];
  currentProject: Project | null;
  isLoading: boolean;
  userId: string;
  // actions
  loadProjects: () => Promise<void>;
  selectProject: (id: string) => void;
  createProject: (name: string, vesselNo: string) => Promise<Project>;
  removeProject: (id: string) => Promise<void>;
  updateCables: (cables: CableData[], description?: string) => Promise<void>;
  updateNodes: (nodes: NodeData[], description?: string) => Promise<void>;
  updateCablesAndNodes: (cables: CableData[], nodes: NodeData[], description?: string) => Promise<void>;
  saveCurrentProject: () => Promise<void>;
  clearCurrentProject: () => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

interface ProjectProviderProps {
  children: React.ReactNode;
  userId?: string;
}

export function ProjectProvider({ children, userId = 'anonymous' }: ProjectProviderProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // localStorage 키 (userId별 분리)
  const localStorageKey = `scms_local_projects_${userId}`;

  // localStorage에서 로컬 프로젝트 로드
  const loadLocalProjects = useCallback((): Project[] => {
    try {
      const raw = localStorage.getItem(localStorageKey);
      if (!raw) return [];
      return JSON.parse(raw) as Project[];
    } catch { return []; }
  }, [localStorageKey]);

  // localStorage에 로컬 프로젝트 저장
  const saveLocalProjects = useCallback((projs: Project[]) => {
    try { localStorage.setItem(localStorageKey, JSON.stringify(projs)); } catch { /* ignore */ }
  }, [localStorageKey]);

  // userId 바뀌면 해당 유저 프로젝트 로드 (API 실패 시 localStorage fallback)
  useEffect(() => {
    setIsLoading(true);
    setCurrentProject(null);
    fetchProjects()
      .then(all => {
        // API 프로젝트 + 로컬 프로젝트 병합 (중복 id 제거)
        const local = loadLocalProjects();
        const apiIds = new Set(all.map(p => p.id));
        const merged = [...all, ...local.filter(p => !apiIds.has(p.id))];
        setProjects(merged);
      })
      .catch(err => {
        console.warn('D1 fetch failed, using localStorage fallback:', err);
        setProjects(loadLocalProjects());
      })
      .finally(() => setIsLoading(false));
  }, [userId, loadLocalProjects]);

  const loadProjects = useCallback(async () => {
    setIsLoading(true);
    try {
      const all = await fetchProjects();
      setProjects(all);
      if (currentProject) {
        const updated = all.find(p => p.id === currentProject.id);
        if (updated) setCurrentProject(updated);
      }
    } catch (err) {
      console.warn('loadProjects error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentProject]);

  const selectProject = useCallback((id: string) => {
    const proj = projects.find(p => p.id === id) ?? null;
    setCurrentProject(proj);
  }, [projects]);

  const createProject = useCallback(async (name: string, vesselNo: string): Promise<Project> => {
    try {
      const proj = await createProjectAPI(name, vesselNo);
      setProjects(prev => [proj, ...prev]);
      setCurrentProject(proj);
      return proj;
    } catch (apiErr) {
      // API 실패 시 localStorage fallback (게스트 모드 포함)
      console.warn('createProjectAPI failed, using localStorage fallback:', apiErr);
      const localProj: Project = {
        id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name,
        vesselNo,
        userId,
        cables: [],
        nodes: [],
        history: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setProjects(prev => {
        const updated = [localProj, ...prev];
        saveLocalProjects(updated);
        return updated;
      });
      setCurrentProject(localProj);
      return localProj;
    }
  }, [userId, saveLocalProjects]);

  const removeProject = useCallback(async (id: string) => {
    // 로컬 프로젝트면 API 호출 없이 localStorage에서만 삭제
    if (id.startsWith('local_')) {
      setProjects(prev => {
        const updated = prev.filter(p => p.id !== id);
        saveLocalProjects(updated.filter(p => p.id.startsWith('local_')));
        return updated;
      });
    } else {
      try { await deleteProjectAPI(id); } catch (e) { console.warn('deleteProjectAPI failed:', e); }
      setProjects(prev => prev.filter(p => p.id !== id));
    }
    if (currentProject?.id === id) setCurrentProject(null);
  }, [currentProject, saveLocalProjects]);

  /** 내부 헬퍼: D1에 저장 + state 업데이트 (로컬 프로젝트는 localStorage 사용) */
  const _persist = useCallback(async (
    proj: Project,
    cables: CableData[],
    nodes: NodeData[],
    action: HistoryEntry['action'],
    description: string,
  ): Promise<Project> => {
    const entry = makeHistoryEntry(action, description, cables, nodes);
    const history = [entry, ...proj.history].slice(0, 200);
    const updatedAt = new Date().toISOString();
    const updated: Project = { ...proj, cables, nodes, history, updatedAt };

    if (proj.id.startsWith('local_')) {
      // 로컬 프로젝트: localStorage에만 저장
      setCurrentProject(updated);
      setProjects(prev => {
        const next = prev.map(p => p.id === updated.id ? updated : p);
        saveLocalProjects(next.filter(p => p.id.startsWith('local_')));
        return next;
      });
    } else {
      try {
        const res = await updateProjectAPI(proj.id, cables, nodes, history);
        const syncedUpdated = { ...updated, updatedAt: res.updatedAt };
        setCurrentProject(syncedUpdated);
        setProjects(prev => prev.map(p => p.id === syncedUpdated.id ? syncedUpdated : p));
        return syncedUpdated;
      } catch (e) {
        console.warn('updateProjectAPI failed, saving locally:', e);
        setCurrentProject(updated);
        setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
      }
    }
    return updated;
  }, [saveLocalProjects]);

  const updateCables = useCallback(async (cables: CableData[], description = '케이블 데이터 업데이트') => {
    if (!currentProject) return;
    await _persist(currentProject, cables, currentProject.nodes, 'cable_edit', description);
  }, [currentProject, _persist]);

  const updateNodes = useCallback(async (nodes: NodeData[], description = '노드 데이터 업데이트') => {
    if (!currentProject) return;
    await _persist(currentProject, currentProject.cables, nodes, 'cable_edit', description);
  }, [currentProject, _persist]);

  const updateCablesAndNodes = useCallback(async (cables: CableData[], nodes: NodeData[], description = '파일 업로드') => {
    if (!currentProject) return;
    await _persist(currentProject, cables, nodes, 'file_upload', description);
  }, [currentProject, _persist]);

  const saveCurrentProject = useCallback(async () => {
    if (!currentProject) return;
    await _persist(currentProject, currentProject.cables, currentProject.nodes, 'manual_save', '수동 저장');
  }, [currentProject, _persist]);

  const clearCurrentProject = useCallback(() => {
    setCurrentProject(null);
  }, []);

  return (
    <ProjectContext.Provider value={{
      projects,
      currentProject,
      isLoading,
      userId,
      loadProjects,
      selectProject,
      createProject,
      removeProject,
      updateCables,
      updateNodes,
      updateCablesAndNodes,
      saveCurrentProject,
      clearCurrentProject,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
}
