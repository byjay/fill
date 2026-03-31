import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Project, CableData, NodeData } from '../types';
import {
  getAllProjects,
  saveProject,
  createNewProject,
  deleteProject,
  updateProjectData,
  addHistory,
} from '../services/projectStore';

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

  // userId가 바뀌면 해당 유저의 프로젝트만 로드
  useEffect(() => {
    setIsLoading(true);
    setCurrentProject(null);
    getAllProjects(userId).then(all => {
      setProjects(all);
      setIsLoading(false);
    });
  }, [userId]);

  const loadProjects = useCallback(async () => {
    setIsLoading(true);
    try {
      const all = await getAllProjects(userId);
      setProjects(all);
      if (currentProject) {
        const updated = all.find(p => p.id === currentProject.id);
        if (updated) setCurrentProject(updated);
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentProject, userId]);

  const selectProject = useCallback((id: string) => {
    const proj = projects.find(p => p.id === id) ?? null;
    setCurrentProject(proj);
  }, [projects]);

  const createProject = useCallback(async (name: string, vesselNo: string): Promise<Project> => {
    const proj = createNewProject(name, vesselNo, userId);
    await saveProject(proj);
    setProjects(prev => [proj, ...prev]);
    setCurrentProject(proj);
    return proj;
  }, [userId]);

  const removeProject = useCallback(async (id: string) => {
    await deleteProject(id);
    setProjects(prev => prev.filter(p => p.id !== id));
    if (currentProject?.id === id) setCurrentProject(null);
  }, [currentProject]);

  const updateCables = useCallback(async (cables: CableData[], description = '케이블 데이터 업데이트') => {
    if (!currentProject) return;
    const updated = await updateProjectData(currentProject.id, cables, currentProject.nodes, 'cable_edit', description);
    setCurrentProject(updated);
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
  }, [currentProject]);

  const updateNodes = useCallback(async (nodes: NodeData[], description = '노드 데이터 업데이트') => {
    if (!currentProject) return;
    const updated = await updateProjectData(currentProject.id, currentProject.cables, nodes, 'cable_edit', description);
    setCurrentProject(updated);
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
  }, [currentProject]);

  const updateCablesAndNodes = useCallback(async (cables: CableData[], nodes: NodeData[], description = '파일 업로드') => {
    if (!currentProject) return;
    const updated = await updateProjectData(currentProject.id, cables, nodes, 'file_upload', description);
    setCurrentProject(updated);
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
  }, [currentProject]);

  const saveCurrentProject = useCallback(async () => {
    if (!currentProject) return;
    const updated = addHistory(currentProject, 'manual_save', '수동 저장');
    await saveProject(updated);
    setCurrentProject(updated);
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
  }, [currentProject]);

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
