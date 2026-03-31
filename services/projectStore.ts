import Dexie, { Table } from 'dexie';
import { Project, HistoryEntry, CableData, NodeData } from '../types';

class SeastarDB extends Dexie {
  projects!: Table<Project, string>;

  constructor() {
    super('SeastarProDB_v2');
    // v2: userId 인덱스 추가
    this.version(1).stores({
      projects: 'id, name, vesselNo, userId, createdAt, updatedAt',
    });
  }
}

export const db = new SeastarDB();

// ── CRUD ──────────────────────────────────────────

/** userId 기반으로 필터 — 없으면 전체(구버전 호환) */
export async function getAllProjects(userId?: string): Promise<Project[]> {
  if (userId) {
    return db.projects
      .where('userId').equals(userId)
      .reverse()
      .sortBy('updatedAt');
  }
  return db.projects.orderBy('updatedAt').reverse().toArray();
}

export async function getProject(id: string): Promise<Project | undefined> {
  return db.projects.get(id);
}

export async function saveProject(project: Project): Promise<void> {
  await db.projects.put({ ...project, updatedAt: new Date().toISOString() });
}

export async function deleteProject(id: string): Promise<void> {
  await db.projects.delete(id);
}

export function createNewProject(name: string, vesselNo: string, userId = 'anonymous'): Project {
  return {
    id: `proj_${Date.now()}`,
    name,
    vesselNo,
    userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    cables: [],
    nodes: [],
    history: [],
  };
}

// ── History helpers ────────────────────────────────

export function addHistory(
  project: Project,
  action: HistoryEntry['action'],
  description: string
): Project {
  const entry: HistoryEntry = {
    id: `h_${Date.now()}`,
    timestamp: new Date().toISOString(),
    action,
    description,
    cableCount: project.cables.length,
    nodeCount: project.nodes.length,
  };
  const history = [entry, ...project.history].slice(0, 200);
  return { ...project, history };
}

export async function updateProjectData(
  id: string,
  cables: CableData[],
  nodes: NodeData[],
  action: HistoryEntry['action'],
  description: string
): Promise<Project> {
  const existing = await getProject(id);
  if (!existing) throw new Error('Project not found');
  const updated = addHistory(
    { ...existing, cables, nodes },
    action,
    description
  );
  await saveProject(updated);
  return updated;
}
