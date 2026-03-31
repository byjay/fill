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

  // userId 바뀌면 해당 유저 프로젝트 로드
  useEffect(() => {
    setIsLoading(true);
    setCurrentProject(null);
    fetchProjects()
      .then(all => setProjects(all))
      .catch(err => {
        console.warn('D1 fetch failed, using empty list:', err);
        setProjects([]);
      })
      .finally(() => setIsLoading(false));
  }, [userId]);

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
    const proj = await createProjectAPI(name, vesselNo);
    setProjects(prev => [proj, ...prev]);
    setCurrentProject(proj);
    return proj;
  }, []);

  const removeProject = useCallback(async (id: string) => {
    await deleteProjectAPI(id);
    setProjects(prev => prev.filter(p => p.id !== id));
    if (currentProject?.id === id) setCurrentProject(null);
  }, [currentProject]);

  /** 내부 헬퍼: D1에 저장 + state 업데이트 */
  const _persist = useCallback(async (
    proj: Project,
    cables: CableData[],
    nodes: NodeData[],
    action: HistoryEntry['action'],
    description: string,
  ): Promise<Project> => {
    const entry = makeHistoryEntry(action, description, cables, nodes);
    const history = [entry, ...proj.history].slice(0, 200);
    const { updatedAt } = await updateProjectAPI(proj.id, cables, nodes, history);
    const updated: Project = { ...proj, cables, nodes, history, updatedAt };
    setCurrentProject(updated);
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
    return updated;
  }, []);

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
