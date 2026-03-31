import Dexie, { Table } from 'dexie';
import { Project, HistoryEntry, CableData, NodeData } from '../types';

class SeastarDB extends Dexie {
  projects!: Table<Project, string>;

  constructor() {
    super('SeastarProDB_v1');
    this.version(1).stores({
      projects: 'id, name, vesselNo, createdAt, updatedAt',
    });
  }
}

export const db = new SeastarDB();

// ── CRUD ──────────────────────────────────────────

export async function getAllProjects(): Promise<Project[]> {
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

export function createNewProject(name: string, vesselNo: string): Project {
  return {
    id: `proj_${Date.now()}`,
    name,
    vesselNo,
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
  // Keep last 200 history entries
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
