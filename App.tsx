import React, { useState, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { CableData, NodeData } from './types';
import { ProjectProvider, useProject } from './contexts/ProjectContext';
import LoginScreen from './components/LoginScreen';
import ProjectSelectionScreen from './components/ProjectSelectionScreen';
import DashboardTab from './components/DashboardTab';
import CableListTab from './components/CableListTab';
import NodeInfoTab from './components/NodeInfoTab';
import ThreeDViewTab from './components/ThreeDViewTab';
import RoutingTab from './components/RoutingTab';
import TrayFillTab from './components/TrayFillTab';
import BOMTab from './components/BOMTab';
import {
  LayoutDashboard,
  List,
  Network,
  Box as BoxIcon,
  Map,
  Layers,
  ChevronDown,
  Upload,
  Download,
  Activity,
  History,
  ArrowLeft,
  Package,
  Menu,
  X,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type AppScreen = 'login' | 'projects' | 'main';
type TabType = 'dashboard' | 'cables' | 'nodes' | 'bom' | 'routing' | 'trayfill' | '3d' | 'history';

// ─────────────────────────────────────────────────────────────────────────────
// Excel column maps (moved here so Sidebar can use project context)
// ─────────────────────────────────────────────────────────────────────────────

const CABLE_COLUMNS = {
  name: ['CABLE_NAME', 'NAME', 'Cable Name'],
  type: ['CABLE_TYPE', 'TYPE', 'Type'],
  system: ['CABLE_SYSTEM', 'SYSTEM', 'System'],
  fromNode: ['FROM_NODE', 'From Node', 'FROM'],
  toNode: ['TO_NODE', 'To Node', 'TO'],
  fromRoom: ['FROM_ROOM', 'From Room'],
  toRoom: ['TO_ROOM', 'To Room'],
  fromEquip: ['FROM_EQUIP', 'From Equipment'],
  toEquip: ['TO_EQUIP', 'To Equipment'],
  fromRest: ['FROM_REST', 'FROM REST'],
  toRest: ['TO_REST', 'TO REST'],
  length: ['POR_LENGTH', 'LENGTH', 'Length', 'POR LENGTH'],
  path: ['CABLE_PATH', 'PATH', 'Path', 'CABLE PATH'],
  outDia: ['CABLE_OUTDIA', 'OUT_DIA', 'Diameter', 'OD', 'DIA', 'OUTER DIA', 'DIA_MM'],
  checkNode: ['CHECK_NODE', 'Check Node', 'Check', 'VIA'],
  wdPage: ['WD_PAGE', 'PAGE'],
  supplyDeck: ['SUPPLY_DECK', 'DECK'],
  porWeight: ['POR_WEIGHT', 'WEIGHT'],
  interference: ['INTERFERENCE'],
  remark: ['REMARK'],
  remark1: ['REMARK1'],
  remark2: ['REMARK2'],
  remark3: ['REMARK3'],
  revision: ['REVISION', 'REV'],
  cableWeight: ['CABLE_WEIGHT', 'CWT'],
};

const NODE_COLUMNS = {
  name: ['NODE_RNAME', 'NODE_NAME', 'NAME', 'Node'],
  structure: ['STRUCTURE_NAME', 'STRUCTURE', 'Structure'],
  component: ['COMPONENT', 'Component'],
  type: ['NODE_TYPE', 'TYPE', 'Type'],
  relation: ['RELATION', 'Relation'],
  linkLength: ['LINK_LENGTH', 'Link Length'],
  areaSize: ['AREA_SIZE', 'Area Size', 'Area'],
};

function getColumnIndex(headers: string[], possibleNames: string[]) {
  const lowerHeaders = headers.map(h => String(h || '').toLowerCase().trim());
  for (const name of possibleNames) {
    const idx = lowerHeaders.indexOf(name.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

function safeParseFloat(value: unknown) {
  const parsed = parseFloat(String(value || '').replace(/[^0-9.-]/g, ''));
  return isNaN(parsed) ? 0 : parsed;
}

function parseCableSheet(rawData: unknown[][]): CableData[] {
  if (rawData.length < 2) return [];
  const headers = rawData[0] as string[];
  const indices: Record<string, number> = {};
  for (const key in CABLE_COLUMNS) {
    indices[key] = getColumnIndex(headers, CABLE_COLUMNS[key as keyof typeof CABLE_COLUMNS]);
  }
  return rawData.slice(1).map((row, idx) => ({
    id: `c-${idx}`,
    name: indices.name >= 0 ? String((row as unknown[])[indices.name] || '') : '',
    type: indices.type >= 0 ? String((row as unknown[])[indices.type] || '') : '',
    system: indices.system >= 0 ? String((row as unknown[])[indices.system] || '') : '',
    fromNode: indices.fromNode >= 0 ? String((row as unknown[])[indices.fromNode] || '') : '',
    toNode: indices.toNode >= 0 ? String((row as unknown[])[indices.toNode] || '') : '',
    fromRoom: indices.fromRoom >= 0 ? String((row as unknown[])[indices.fromRoom] || '') : '',
    toRoom: indices.toRoom >= 0 ? String((row as unknown[])[indices.toRoom] || '') : '',
    fromEquip: indices.fromEquip >= 0 ? String((row as unknown[])[indices.fromEquip] || '') : '',
    toEquip: indices.toEquip >= 0 ? String((row as unknown[])[indices.toEquip] || '') : '',
    fromRest: indices.fromRest >= 0 ? safeParseFloat((row as unknown[])[indices.fromRest]) : 0,
    toRest: indices.toRest >= 0 ? safeParseFloat((row as unknown[])[indices.toRest]) : 0,
    length: indices.length >= 0 ? safeParseFloat((row as unknown[])[indices.length]) : 0,
    path: indices.path >= 0 ? String((row as unknown[])[indices.path] || '') : '',
    od: indices.outDia >= 0 ? safeParseFloat((row as unknown[])[indices.outDia]) : 10,
    checkNode: indices.checkNode >= 0 ? String((row as unknown[])[indices.checkNode] || '') : '',
    wdPage: indices.wdPage >= 0 ? String((row as unknown[])[indices.wdPage] || '') : '',
    supplyDeck: indices.supplyDeck >= 0 ? String((row as unknown[])[indices.supplyDeck] || '') : '',
    porWeight: indices.porWeight >= 0 ? safeParseFloat((row as unknown[])[indices.porWeight]) : 0,
    interference: indices.interference >= 0 ? String((row as unknown[])[indices.interference] || '') : '',
    remark: indices.remark >= 0 ? String((row as unknown[])[indices.remark] || '') : '',
    remark1: indices.remark1 >= 0 ? String((row as unknown[])[indices.remark1] || '') : '',
    remark2: indices.remark2 >= 0 ? String((row as unknown[])[indices.remark2] || '') : '',
    remark3: indices.remark3 >= 0 ? String((row as unknown[])[indices.remark3] || '') : '',
    revision: indices.revision >= 0 ? String((row as unknown[])[indices.revision] || '') : '',
    cableWeight: indices.cableWeight >= 0 ? safeParseFloat((row as unknown[])[indices.cableWeight]) : 0,
  })).filter(c => c.name);
}

function parseNodeSheet(rawData: unknown[][]): NodeData[] {
  if (rawData.length < 2) return [];
  const headers = rawData[0] as string[];
  const indices: Record<string, number> = {};
  for (const key in NODE_COLUMNS) {
    indices[key] = getColumnIndex(headers, NODE_COLUMNS[key as keyof typeof NODE_COLUMNS]);
  }
  return rawData.slice(1).map(row => ({
    name: indices.name >= 0 ? String((row as unknown[])[indices.name] || '') : '',
    structure: indices.structure >= 0 ? String((row as unknown[])[indices.structure] || '') : '',
    component: indices.component >= 0 ? String((row as unknown[])[indices.component] || '') : '',
    type: indices.type >= 0 ? String((row as unknown[])[indices.type] || '') : '',
    relation: indices.relation >= 0 ? String((row as unknown[])[indices.relation] || '') : '',
    linkLength: indices.linkLength >= 0 ? safeParseFloat((row as unknown[])[indices.linkLength]) : 0,
    areaSize: indices.areaSize >= 0 ? safeParseFloat((row as unknown[])[indices.areaSize]) : 0,
  })).filter(n => n.name);
}

// ─────────────────────────────────────────────────────────────────────────────
// Compact Sidebar (uses ProjectContext directly)
// ─────────────────────────────────────────────────────────────────────────────

interface ProjectSidebarProps {
  onCalculateAllPaths: () => void;
  onExportAllData: () => void;
  onExportCableList: () => void;
  onExportNodeInfo: () => void;
  collapsed: boolean;
  onToggle: () => void;
}

const ProjectSidebar: React.FC<ProjectSidebarProps> = ({
  onCalculateAllPaths,
  onExportAllData,
  onExportCableList,
  onExportNodeInfo,
  collapsed,
  onToggle,
}) => {
  const { currentProject, updateCablesAndNodes } = useProject();
  const cables = currentProject?.cables ?? [];
  const nodes = currentProject?.nodes ?? [];

  const cableFileRef = useRef<HTMLInputElement>(null);
  const nodeFileRef = useRef<HTMLInputElement>(null);
  const bothFileRef = useRef<HTMLInputElement>(null);

  const readExcelFile = (file: File): Promise<unknown[][]> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][];
        resolve(rawData);
      };
      reader.readAsBinaryString(file);
    });
  };

  const handleCableFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const rawData = await readExcelFile(file);
    const newCables = parseCableSheet(rawData);
    await updateCablesAndNodes(newCables, nodes, `케이블 파일 업로드: ${file.name}`);
    e.target.value = '';
  };

  const handleNodeFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const rawData = await readExcelFile(file);
    const newNodes = parseNodeSheet(rawData);
    await updateCablesAndNodes(cables, newNodes, `노드 파일 업로드: ${file.name}`);
    e.target.value = '';
  };

  const handleBothFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      let newCables: CableData[] = cables;
      let newNodes: NodeData[] = nodes;
      wb.SheetNames.forEach(sheetName => {
        const ws = wb.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][];
        const lowerName = sheetName.toLowerCase();
        if (lowerName.includes('cable') || lowerName.includes('케이블')) {
          const parsed = parseCableSheet(rawData);
          if (parsed.length > 0) newCables = parsed;
        } else if (lowerName.includes('node') || lowerName.includes('노드')) {
          const parsed = parseNodeSheet(rawData);
          if (parsed.length > 0) newNodes = parsed;
        }
      });
      await updateCablesAndNodes(newCables, newNodes, `통합 파일 업로드: ${file.name}`);
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const totalLength = cables.reduce((sum, c) => sum + (c.calculatedLength || c.length || 0), 0);
  const calculatedPaths = cables.filter(c => c.calculatedPath).length;

  if (collapsed) {
    return (
      <aside className="w-10 bg-slate-900 border-r border-slate-800 flex flex-col items-center pt-2 gap-3 shrink-0">
        <button
          onClick={onToggle}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
          title="사이드바 열기"
        >
          <Menu size={16} />
        </button>
        <button
          onClick={() => cableFileRef.current?.click()}
          className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded transition-colors"
          title="케이블 파일 업로드"
        >
          <Upload size={14} />
        </button>
        <button
          onClick={() => nodeFileRef.current?.click()}
          className="p-1.5 text-slate-400 hover:text-purple-400 hover:bg-slate-700 rounded transition-colors"
          title="노드 파일 업로드"
        >
          <Network size={14} />
        </button>
        <button
          onClick={onCalculateAllPaths}
          className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-700 rounded transition-colors"
          title="전체 경로 계산"
        >
          <Activity size={14} />
        </button>
        <button
          onClick={onExportAllData}
          className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-700 rounded transition-colors"
          title="전체 내보내기"
        >
          <Download size={14} />
        </button>
        <input type="file" ref={cableFileRef} onChange={handleCableFileUpload} accept=".xlsx,.xls,.csv" className="hidden" />
        <input type="file" ref={nodeFileRef} onChange={handleNodeFileUpload} accept=".xlsx,.xls,.csv" className="hidden" />
        <input type="file" ref={bothFileRef} onChange={handleBothFileUpload} accept=".xlsx,.xls" className="hidden" />
      </aside>
    );
  }

  return (
    <aside className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col gap-3 overflow-y-auto text-slate-300 shrink-0">
      {/* Sidebar header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">파일 & 제어판</span>
        <button
          onClick={onToggle}
          className="p-1 text-slate-500 hover:text-white hover:bg-slate-700 rounded transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* File Upload */}
      <div className="mx-3 bg-slate-800 rounded-lg p-3 border border-slate-700">
        <h3 className="text-blue-400 font-bold mb-2 flex items-center gap-1.5 text-xs">
          <Upload size={13} /> 파일 업로드
        </h3>
        <div className="space-y-2">
          <div>
            <label className="text-[10px] text-slate-400 mb-1 block">케이블 정보 (Excel)</label>
            <input type="file" ref={cableFileRef} onChange={handleCableFileUpload} accept=".xlsx,.xls,.csv" className="hidden" />
            <button
              onClick={() => cableFileRef.current?.click()}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white text-[11px] py-1.5 px-2 rounded transition-colors text-left truncate"
            >
              {cables.length > 0 ? `${cables.length}개 케이블 로드됨` : '케이블 파일 선택...'}
            </button>
          </div>
          <div>
            <label className="text-[10px] text-slate-400 mb-1 block">노드 정보 (Excel)</label>
            <input type="file" ref={nodeFileRef} onChange={handleNodeFileUpload} accept=".xlsx,.xls,.csv" className="hidden" />
            <button
              onClick={() => nodeFileRef.current?.click()}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white text-[11px] py-1.5 px-2 rounded transition-colors text-left truncate"
            >
              {nodes.length > 0 ? `${nodes.length}개 노드 로드됨` : '노드 파일 선택...'}
            </button>
          </div>
          <div>
            <label className="text-[10px] text-slate-400 mb-1 block">통합 파일 (멀티시트)</label>
            <input type="file" ref={bothFileRef} onChange={handleBothFileUpload} accept=".xlsx,.xls" className="hidden" />
            <button
              onClick={() => bothFileRef.current?.click()}
              className="w-full bg-blue-900/40 hover:bg-blue-900/60 border border-blue-700/30 text-blue-300 text-[11px] py-1.5 px-2 rounded transition-colors text-left truncate"
            >
              통합 Excel 업로드...
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="mx-3 bg-slate-800 rounded-lg p-3 border border-slate-700">
        <h3 className="text-blue-400 font-bold mb-2 flex items-center gap-1.5 text-xs">
          <Activity size={13} /> 통계
        </h3>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="bg-slate-900 p-2 rounded border border-slate-700 text-center">
            <div className="text-lg font-bold text-blue-400">{cables.length}</div>
            <div className="text-[9px] text-slate-400 uppercase">케이블</div>
          </div>
          <div className="bg-slate-900 p-2 rounded border border-slate-700 text-center">
            <div className="text-lg font-bold text-blue-400">{nodes.length}</div>
            <div className="text-[9px] text-slate-400 uppercase">노드</div>
          </div>
          <div className="bg-slate-900 p-2 rounded border border-slate-700 text-center">
            <div className="text-lg font-bold text-emerald-400">{totalLength.toFixed(0)}</div>
            <div className="text-[9px] text-slate-400 uppercase">총길이(m)</div>
          </div>
          <div className="bg-slate-900 p-2 rounded border border-slate-700 text-center">
            <div className="text-lg font-bold text-emerald-400">{calculatedPaths}</div>
            <div className="text-[9px] text-slate-400 uppercase">경로계산</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="mx-3 bg-slate-800 rounded-lg p-3 border border-slate-700">
        <h3 className="text-blue-400 font-bold mb-2 text-xs">제어판</h3>
        <div className="space-y-1.5">
          <button
            onClick={onCalculateAllPaths}
            className="w-full flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1.5 px-2 rounded transition-colors"
          >
            <Activity size={12} /> 전체 경로 계산
          </button>
          <button
            onClick={onExportCableList}
            className="w-full flex items-center justify-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold py-1.5 px-2 rounded transition-colors"
          >
            <Download size={12} /> 케이블 목록 내보내기
          </button>
          <button
            onClick={onExportNodeInfo}
            className="w-full flex items-center justify-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold py-1.5 px-2 rounded transition-colors"
          >
            <Download size={12} /> 노드 정보 내보내기
          </button>
          <button
            onClick={onExportAllData}
            className="w-full flex items-center justify-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold py-1.5 px-2 rounded transition-colors"
          >
            <Download size={12} /> 전체 JSON 내보내기
          </button>
        </div>
      </div>

      <div className="pb-3" />
    </aside>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// History Tab (inline — reads from project context)
// ─────────────────────────────────────────────────────────────────────────────

const HistoryTab: React.FC = () => {
  const { currentProject } = useProject();
  const history = currentProject?.history ?? [];

  const actionLabel: Record<string, string> = {
    file_upload: '파일 업로드',
    path_calculation: '경로 계산',
    cable_edit: '케이블 편집',
    manual_save: '수동 저장',
    data_clear: '데이터 초기화',
  };

  const actionColor: Record<string, string> = {
    file_upload: 'text-blue-400',
    path_calculation: 'text-emerald-400',
    cable_edit: 'text-yellow-400',
    manual_save: 'text-purple-400',
    data_clear: 'text-red-400',
  };

  if (history.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500">
        <div className="text-center">
          <History size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">아직 기록이 없습니다</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      <table className="w-full text-xs text-slate-300 border-collapse">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="text-left py-2 px-3 text-slate-500 font-bold uppercase tracking-wider w-48">시각</th>
            <th className="text-left py-2 px-3 text-slate-500 font-bold uppercase tracking-wider w-32">작업 유형</th>
            <th className="text-left py-2 px-3 text-slate-500 font-bold uppercase tracking-wider">설명</th>
            <th className="text-right py-2 px-3 text-slate-500 font-bold uppercase tracking-wider w-24">케이블</th>
            <th className="text-right py-2 px-3 text-slate-500 font-bold uppercase tracking-wider w-24">노드</th>
          </tr>
        </thead>
        <tbody>
          {[...history].reverse().map((entry) => (
            <tr key={entry.id} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
              <td className="py-2 px-3 text-slate-400">
                {new Date(entry.timestamp).toLocaleString('ko-KR')}
              </td>
              <td className={`py-2 px-3 font-bold ${actionColor[entry.action] ?? 'text-slate-400'}`}>
                {actionLabel[entry.action] ?? entry.action}
              </td>
              <td className="py-2 px-3">{entry.description}</td>
              <td className="py-2 px-3 text-right text-blue-400">
                {entry.cableCount !== undefined ? entry.cableCount : '-'}
              </td>
              <td className="py-2 px-3 text-right text-blue-400">
                {entry.nodeCount !== undefined ? entry.nodeCount : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main App (uses ProjectContext)
// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'dashboard' as TabType, label: 'Dashboard', icon: <LayoutDashboard size={14} /> },
  { id: 'cables' as TabType, label: 'Cable List', icon: <List size={14} /> },
  { id: 'nodes' as TabType, label: 'Node Info', icon: <Network size={14} /> },
  { id: 'bom' as TabType, label: 'BOM', icon: <Package size={14} /> },
  { id: 'routing' as TabType, label: 'Routing', icon: <Map size={14} /> },
  { id: 'trayfill' as TabType, label: 'Tray Fill', icon: <Layers size={14} /> },
  { id: '3d' as TabType, label: '3D View', icon: <BoxIcon size={14} /> },
  { id: 'history' as TabType, label: 'History', icon: <History size={14} /> },
] as const;

interface MainAppProps {
  onBackToProjects: () => void;
}

const MainApp: React.FC<MainAppProps> = ({ onBackToProjects }) => {
  const { currentProject, updateCables, clearCurrentProject } = useProject();
  const cables = currentProject?.cables ?? [];
  const nodes = currentProject?.nodes ?? [];

  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // ── Dijkstra path calculation ──────────────────────────────────────────────

  const calculateShortestPath = useCallback(
    (fromNode: string, toNode: string): { path: string[]; length: number } | null => {
      if (fromNode === toNode) return { path: [fromNode], length: 0 };

      const nodeMap: Record<string, { relations: string[]; linkLength: number }> = {};
      nodes.forEach(node => {
        nodeMap[node.name] = {
          relations: node.relation
            ? node.relation.split(',').map(s => s.trim()).filter(Boolean)
            : [],
          linkLength: node.linkLength || 1,
        };
      });

      if (!nodeMap[fromNode] || !nodeMap[toNode]) return null;

      const distances: Record<string, number> = {};
      const previous: Record<string, string | null> = {};
      const unvisited = new Set<string>();

      nodes.forEach(node => {
        distances[node.name] = Infinity;
        previous[node.name] = null;
        unvisited.add(node.name);
      });
      distances[fromNode] = 0;

      while (unvisited.size > 0) {
        let currentNode: string | null = null;
        let minDist = Infinity;

        unvisited.forEach(node => {
          if (distances[node] < minDist) {
            minDist = distances[node];
            currentNode = node;
          }
        });

        if (currentNode === null || currentNode === toNode) break;
        unvisited.delete(currentNode);

        const neighbors = nodeMap[currentNode].relations;
        neighbors.forEach(neighbor => {
          if (unvisited.has(neighbor)) {
            const alt = distances[currentNode!] + nodeMap[currentNode!].linkLength;
            if (alt < distances[neighbor]) {
              distances[neighbor] = alt;
              previous[neighbor] = currentNode;
            }
          }
        });
      }

      if (distances[toNode] === Infinity) return null;

      const path: string[] = [];
      let current: string | null = toNode;
      while (current !== null) {
        path.unshift(current);
        current = previous[current];
      }

      return { path, length: Math.round(distances[toNode] * 10) / 10 };
    },
    [nodes]
  );

  const calculatePathWithCheckpoints = useCallback(
    (
      fromNode: string,
      toNode: string,
      checkNodes: string[]
    ): { path: string[]; length: number } | null => {
      const fullPath = [fromNode];
      let totalLength = 0;
      let currentNode = fromNode;

      for (const checkpoint of checkNodes) {
        const segment = calculateShortestPath(currentNode, checkpoint);
        if (!segment) return null;
        fullPath.push(...segment.path.slice(1));
        totalLength += segment.length;
        currentNode = checkpoint;
      }

      const finalSegment = calculateShortestPath(currentNode, toNode);
      if (!finalSegment) return null;
      fullPath.push(...finalSegment.path.slice(1));
      totalLength += finalSegment.length;

      return { path: fullPath, length: totalLength };
    },
    [calculateShortestPath]
  );

  const calculatePath = useCallback(
    (
      fromNode: string,
      toNode: string,
      checkNodeStr = ''
    ): { path: string[]; length: number } | null => {
      const checkNodes = checkNodeStr
        ? checkNodeStr.split(',').map(s => s.trim()).filter(Boolean)
        : [];
      return checkNodes.length > 0
        ? calculatePathWithCheckpoints(fromNode, toNode, checkNodes)
        : calculateShortestPath(fromNode, toNode);
    },
    [calculatePathWithCheckpoints, calculateShortestPath]
  );

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleCalculateAllPaths = useCallback(async () => {
    if (nodes.length === 0) {
      alert('노드 데이터를 먼저 로드하세요.');
      return;
    }
    const newData = cables.map(cable => {
      if (cable.fromNode && cable.toNode) {
        const result = calculatePath(cable.fromNode, cable.toNode, cable.checkNode);
        if (result) {
          return {
            ...cable,
            calculatedPath: result.path.join(','),
            calculatedLength: result.length + (cable.fromRest || 0) + (cable.toRest || 0),
          };
        }
      }
      return cable;
    });
    await updateCables(newData, '전체 경로 계산');
  }, [cables, nodes, calculatePath, updateCables]);

  const handleRecalculateSelected = useCallback(
    async (indices: number[]) => {
      const newData = [...cables];
      indices.forEach(index => {
        const cable = newData[index];
        if (cable.fromNode && cable.toNode) {
          const result = calculatePath(cable.fromNode, cable.toNode, cable.checkNode);
          if (result) {
            newData[index] = {
              ...cable,
              calculatedPath: result.path.join(','),
              calculatedLength: result.length + (cable.fromRest || 0) + (cable.toRest || 0),
            };
          }
        }
      });
      await updateCables(newData, '선택 케이블 경로 재계산');
    },
    [cables, calculatePath, updateCables]
  );

  const handleUpdateCheckNode = useCallback(
    async (index: number, checkNode: string) => {
      const newData = [...cables];
      newData[index] = { ...newData[index], checkNode };
      const cable = newData[index];
      if (cable.fromNode && cable.toNode) {
        const result = calculatePath(cable.fromNode, cable.toNode, checkNode);
        if (result) {
          newData[index].calculatedPath = result.path.join(',');
          newData[index].calculatedLength =
            result.length + (cable.fromRest || 0) + (cable.toRest || 0);
        }
      }
      await updateCables(newData, '경유지 노드 업데이트');
    },
    [cables, calculatePath, updateCables]
  );

  const handleExportAllData = useCallback(() => {
    const data = {
      cables,
      nodes,
      exportDate: new Date().toISOString(),
      projectName: currentProject?.name,
      vesselNo: currentProject?.vesselNo,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `seastar_${currentProject?.vesselNo || 'export'}_all_data.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [cables, nodes, currentProject]);

  const handleExportCableList = useCallback(() => {
    const csvRows = [
      'CABLE_SYSTEM,WD_PAGE,CABLE_NAME,CABLE_TYPE,FROM_ROOM,FROM_EQUIP,FROM_NODE,FROM_REST,TO_ROOM,TO_EQUIP,TO_NODE,TO_REST,TOTAL_LENGTH,CABLE_PATH,CABLE_OUTDIA,CHECK_NODE,SUPPLY_DECK,POR_WEIGHT,REMARK,REVISION',
    ];
    cables.forEach(cable => {
      const length = cable.calculatedLength || cable.length || 0;
      const path = cable.calculatedPath || cable.path || '';
      csvRows.push(
        `"${cable.system}","${cable.wdPage || ''}","${cable.name}","${cable.type}","${cable.fromRoom || ''}","${cable.fromEquip || ''}","${cable.fromNode}",${cable.fromRest || 0},"${cable.toRoom || ''}","${cable.toEquip || ''}","${cable.toNode}",${cable.toRest || 0},${length.toFixed(1)},"${path}",${cable.od || 0},"${cable.checkNode || ''}","${cable.supplyDeck || ''}",${cable.porWeight || 0},"${cable.remark || ''}","${cable.revision || ''}"`
      );
    });
    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `seastar_${currentProject?.vesselNo || 'export'}_cables.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [cables, currentProject]);

  const handleExportNodeInfo = useCallback(() => {
    const csvRows = ['NODE_NAME,STRUCTURE_NAME,NODE_TYPE,RELATION,LINK_LENGTH,AREA_SIZE,CONNECTED_CABLES'];
    const cableCounts: Record<string, number> = {};
    cables.forEach(c => {
      if (c.fromNode) cableCounts[c.fromNode] = (cableCounts[c.fromNode] || 0) + 1;
      if (c.toNode && c.toNode !== c.fromNode) {
        cableCounts[c.toNode] = (cableCounts[c.toNode] || 0) + 1;
      }
    });
    nodes.forEach(node => {
      const connectedCables = cableCounts[node.name] || 0;
      csvRows.push(
        `${node.name},${node.structure || ''},${node.type || ''},${node.relation || ''},${node.linkLength || 0},${node.areaSize || 0},${connectedCables}`
      );
    });
    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `seastar_${currentProject?.vesselNo || 'export'}_nodes.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [cables, nodes, currentProject]);

  // ── Active tab ─────────────────────────────────────────────────────────────
  const activeTabObj = TABS.find(t => t.id === activeTab);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans flex flex-col h-screen overflow-hidden">
      {/* ── Compact Header (40-44px) ── */}
      <header
        className="bg-slate-900 border-b border-slate-800 px-3 flex items-center justify-between shrink-0 shadow-md z-30"
        style={{ height: 42 }}
      >
        {/* Left: logo + project info */}
        <div className="flex items-center gap-2 min-w-0">
          <img src="/logo.jpg" alt="SEASTAR" className="h-6 object-contain shrink-0" />
          <div className="h-4 w-px bg-slate-700 shrink-0" />
          {currentProject && (
            <>
              <span className="text-[11px] font-black text-white truncate max-w-[120px]">
                {currentProject.name}
              </span>
              {currentProject.vesselNo && (
                <span className="text-[9px] font-bold text-blue-300 bg-blue-900/50 px-1.5 py-0.5 rounded shrink-0">
                  {currentProject.vesselNo}
                </span>
              )}
            </>
          )}
        </div>

        {/* Center: dropdown tab navigation */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors"
          >
            {activeTabObj?.icon}
            <span>{activeTabObj?.label}</span>
            <ChevronDown
              size={12}
              className={`transition-transform ${menuOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {menuOpen && (
            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl py-1 min-w-[180px] z-50">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setMenuOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold transition-colors ${
                    activeTab === tab.id
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: stats + back button */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <span className="text-blue-400 font-bold">{cables.length}</span>
            <span>cables</span>
            <span className="text-slate-700">|</span>
            <span className="text-blue-400 font-bold">{nodes.length}</span>
            <span>nodes</span>
          </div>
          <button
            onClick={() => { clearCurrentProject(); onBackToProjects(); }}
            className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2 py-1 rounded transition-colors"
          >
            <ArrowLeft size={11} />
            <span className="hidden sm:inline">프로젝트</span>
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <ProjectSidebar
          onCalculateAllPaths={handleCalculateAllPaths}
          onExportAllData={handleExportAllData}
          onExportCableList={handleExportCableList}
          onExportNodeInfo={handleExportNodeInfo}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(v => !v)}
        />

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden bg-slate-950">
          <div className="flex-1 overflow-hidden flex flex-col">
            {activeTab === 'dashboard' && (
              <DashboardTab cableData={cables} nodeData={nodes} />
            )}
            {activeTab === 'cables' && (
              <CableListTab
                cableData={cables}
                onCalculateAllPaths={handleCalculateAllPaths}
                onExportCableList={handleExportCableList}
              />
            )}
            {activeTab === 'nodes' && (
              <NodeInfoTab
                nodeData={nodes}
                cableData={cables}
                onExportNodeInfo={handleExportNodeInfo}
              />
            )}
            {activeTab === 'bom' && <BOMTab cableData={cables} />}
            {activeTab === 'routing' && (
              <RoutingTab
                cableData={cables}
                onUpdateCheckNode={handleUpdateCheckNode}
                onRecalculateSelected={handleRecalculateSelected}
              />
            )}
            {activeTab === 'trayfill' && <TrayFillTab cableData={cables} />}
            {activeTab === '3d' && (
              <ThreeDViewTab cableData={cables} nodeData={nodes} />
            )}
            {activeTab === 'history' && <HistoryTab />}
          </div>
        </main>
      </div>

      {/* Click-outside overlay for dropdown menu */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// AppRouter — decides which screen to show
// ─────────────────────────────────────────────────────────────────────────────

const AppRouter: React.FC = () => {
  const { currentProject } = useProject();
  const currentProjectId = currentProject?.id ?? null;
  const [screen, setScreen] = useState<AppScreen>('login');

  // When a project is selected in context, auto-advance to main
  React.useEffect(() => {
    if (currentProjectId && screen === 'projects') {
      setScreen('main');
    }
  }, [currentProjectId, screen]);

  // When project is cleared (e.g. back button calls clearCurrentProject), go back to project selection
  React.useEffect(() => {
    if (!currentProjectId && screen === 'main') {
      setScreen('projects');
    }
  }, [currentProjectId, screen]);

  if (screen === 'login') {
    return <LoginScreen onLogin={() => setScreen('projects')} />;
  }

  if (screen === 'projects') {
    return <ProjectSelectionScreen />;
  }

  // main — Back button in MainApp calls clearCurrentProject() + onBackToProjects()
  return (
    <MainApp
      onBackToProjects={() => setScreen('projects')}
    />
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Root App
// ─────────────────────────────────────────────────────────────────────────────

const App: React.FC = () => {
  return (
    <ProjectProvider>
      <AppRouter />
    </ProjectProvider>
  );
};

export default App;
