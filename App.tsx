import React, { useState, useCallback, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { CableData, NodeData, UserInfo } from './types';
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
import AnalysisTab from './components/AnalysisTab';
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
  Undo2,
  Redo2,
  LogOut,
  ArrowUpDown,
  FileJson,
  FolderOpen,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type AppScreen = 'login' | 'projects' | 'main';
type TabType = 'dashboard' | 'cables' | 'nodes' | 'bom' | 'routing' | 'trayfill' | '3d' | 'analysis' | 'history';

interface Snapshot {
  cables: CableData[];
  nodes: NodeData[];
}

const MAX_UNDO = 50;

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
  onJsonSave: () => void;
  onJsonLoad: (cables: CableData[], nodes: NodeData[]) => void;
  collapsed: boolean;
  onToggle: () => void;
}

const ProjectSidebar: React.FC<ProjectSidebarProps> = ({
  onCalculateAllPaths,
  onExportAllData,
  onExportCableList,
  onExportNodeInfo,
  onJsonSave,
  onJsonLoad,
  collapsed,
  onToggle,
}) => {
  const { currentProject, updateCablesAndNodes } = useProject();
  const cables = currentProject?.cables ?? [];
  const nodes = currentProject?.nodes ?? [];

  const cableFileRef = useRef<HTMLInputElement>(null);
  const nodeFileRef = useRef<HTMLInputElement>(null);
  const bothFileRef = useRef<HTMLInputElement>(null);
  const jsonLoadRef = useRef<HTMLInputElement>(null);

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

  const handleJsonLoadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const json = JSON.parse(evt.target?.result as string);
        const loadedCables: CableData[] = Array.isArray(json.cables) ? json.cables : [];
        const loadedNodes: NodeData[] = Array.isArray(json.nodes) ? json.nodes : [];
        onJsonLoad(loadedCables, loadedNodes);
      } catch {
        alert('JSON 파일을 파싱할 수 없습니다. 올바른 형식인지 확인하세요.');
      }
    };
    reader.readAsText(file);
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
        <button
          onClick={onJsonSave}
          className="p-1.5 text-slate-400 hover:text-yellow-400 hover:bg-slate-700 rounded transition-colors"
          title="JSON 저장"
        >
          <FileJson size={14} />
        </button>
        <button
          onClick={() => jsonLoadRef.current?.click()}
          className="p-1.5 text-slate-400 hover:text-yellow-400 hover:bg-slate-700 rounded transition-colors"
          title="JSON 로드"
        >
          <FolderOpen size={14} />
        </button>
        <input type="file" ref={cableFileRef} onChange={handleCableFileUpload} accept=".xlsx,.xls,.csv" className="hidden" />
        <input type="file" ref={nodeFileRef} onChange={handleNodeFileUpload} accept=".xlsx,.xls,.csv" className="hidden" />
        <input type="file" ref={bothFileRef} onChange={handleBothFileUpload} accept=".xlsx,.xls" className="hidden" />
        <input type="file" ref={jsonLoadRef} onChange={handleJsonLoadFile} accept=".json" className="hidden" />
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

      {/* JSON Save / Load */}
      <div className="mx-3 bg-slate-800 rounded-lg p-3 border border-slate-700">
        <h3 className="text-yellow-400 font-bold mb-2 flex items-center gap-1.5 text-xs">
          <FileJson size={13} /> JSON 저장 / 로드
        </h3>
        <div className="space-y-1.5">
          <button
            onClick={onJsonSave}
            className="w-full flex items-center justify-center gap-1.5 bg-yellow-700/40 hover:bg-yellow-700/60 border border-yellow-600/30 text-yellow-300 text-xs font-bold py-1.5 px-2 rounded transition-colors"
          >
            <Download size={12} /> JSON 저장
          </button>
          <input
            type="file"
            ref={jsonLoadRef}
            onChange={handleJsonLoadFile}
            accept=".json"
            className="hidden"
          />
          <button
            onClick={() => jsonLoadRef.current?.click()}
            className="w-full flex items-center justify-center gap-1.5 bg-yellow-700/40 hover:bg-yellow-700/60 border border-yellow-600/30 text-yellow-300 text-xs font-bold py-1.5 px-2 rounded transition-colors"
          >
            <FolderOpen size={12} /> JSON 로드
          </button>
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
  { id: 'analysis' as TabType, label: 'Analysis', icon: <Activity size={14} /> },
  { id: 'history' as TabType, label: 'History', icon: <History size={14} /> },
] as const;

interface MainAppProps {
  onBackToProjects: () => void;
  onLogout: () => void;
  userName?: string;
}

const MainApp: React.FC<MainAppProps> = ({ onBackToProjects, onLogout, userName }) => {
  const { currentProject, projects, selectProject, updateCables, updateCablesAndNodes, clearCurrentProject } = useProject();
  const cables = currentProject?.cables ?? [];
  const nodes = currentProject?.nodes ?? [];

  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // ── Undo / Redo stacks ─────────────────────────────────────────────────────
  const [undoStack, setUndoStack] = useState<Snapshot[]>([]);
  const [redoStack, setRedoStack] = useState<Snapshot[]>([]);

  // ── Project switcher dropdown ──────────────────────────────────────────────
  const [switcherOpen, setSwitcherOpen] = useState(false);

  // Helper: push snapshot before a mutating cables/nodes update
  const pushUndo = useCallback((prevCables: CableData[], prevNodes: NodeData[]) => {
    setUndoStack(prev => {
      const next = [...prev, { cables: prevCables, nodes: prevNodes }];
      return next.length > MAX_UNDO ? next.slice(next.length - MAX_UNDO) : next;
    });
    setRedoStack([]);
  }, []);

  // ── Undo action ────────────────────────────────────────────────────────────
  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0) return;
    const snapshot = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, prev.length - 1));
    setRedoStack(prev => [{ cables, nodes }, ...prev]);
    await updateCablesAndNodes(snapshot.cables, snapshot.nodes, 'Undo');
  }, [undoStack, cables, nodes, updateCablesAndNodes]);

  // ── Redo action ────────────────────────────────────────────────────────────
  const handleRedo = useCallback(async () => {
    if (redoStack.length === 0) return;
    const snapshot = redoStack[0];
    setRedoStack(prev => prev.slice(1));
    setUndoStack(prev => [...prev, { cables, nodes }]);
    await updateCablesAndNodes(snapshot.cables, snapshot.nodes, 'Redo');
  }, [redoStack, cables, nodes, updateCablesAndNodes]);

  // ── Keyboard shortcuts Ctrl+Z / Ctrl+Y ────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

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
    pushUndo(cables, nodes);
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
  }, [cables, nodes, calculatePath, updateCables, pushUndo]);

  const handleRecalculateSelected = useCallback(
    async (indices: number[]) => {
      pushUndo(cables, nodes);
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
    [cables, nodes, calculatePath, updateCables, pushUndo]
  );

  const handleUpdateCheckNode = useCallback(
    async (index: number, checkNode: string) => {
      pushUndo(cables, nodes);
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
    [cables, nodes, calculatePath, updateCables, pushUndo]
  );

  // ── JSON Save ──────────────────────────────────────────────────────────────
  const handleJsonSave = useCallback(() => {
    const blob = new Blob([JSON.stringify({ cables, nodes }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `seastar_${currentProject?.vesselNo || 'project'}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [cables, nodes, currentProject]);

  // ── JSON Load ─────────────────────────────────────────────────────────────
  const handleJsonLoad = useCallback(async (loadedCables: CableData[], loadedNodes: NodeData[]) => {
    pushUndo(cables, nodes);
    await updateCablesAndNodes(loadedCables, loadedNodes, 'JSON 파일 로드');
  }, [cables, nodes, updateCablesAndNodes, pushUndo]);

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
        {/* Left: logo + project info + project switcher */}
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
              {/* Project switcher button */}
              <div className="relative shrink-0">
                <button
                  onClick={() => setSwitcherOpen(v => !v)}
                  className="flex items-center gap-1 text-[9px] font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-1.5 py-0.5 rounded transition-colors"
                  title="프로젝트 전환"
                >
                  <ArrowUpDown size={10} />
                  <span>전환</span>
                </button>
                {switcherOpen && (
                  <div className="absolute left-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl py-1 min-w-[200px] z-50">
                    <div className="px-3 py-1 text-[9px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-700 mb-1">
                      프로젝트 선택
                    </div>
                    {projects.map(proj => (
                      <button
                        key={proj.id}
                        onClick={() => {
                          selectProject(proj.id);
                          setSwitcherOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold transition-colors text-left ${
                          proj.id === currentProject?.id
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        <span className="truncate flex-1">{proj.name}</span>
                        {proj.vesselNo && (
                          <span className="text-[9px] text-blue-300 bg-blue-900/50 px-1 py-0.5 rounded shrink-0">
                            {proj.vesselNo}
                          </span>
                        )}
                      </button>
                    ))}
                    {projects.length === 0 && (
                      <div className="px-3 py-2 text-[11px] text-slate-500">프로젝트 없음</div>
                    )}
                  </div>
                )}
              </div>
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

        {/* Right: undo/redo + stats + back + logout */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Undo button */}
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2 py-1 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="실행 취소 (Ctrl+Z)"
          >
            <Undo2 size={11} />
            <span className="hidden sm:inline">Undo ({undoStack.length})</span>
          </button>
          {/* Redo button */}
          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2 py-1 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="다시 실행 (Ctrl+Y)"
          >
            <Redo2 size={11} />
            <span className="hidden sm:inline">Redo ({redoStack.length})</span>
          </button>

          <div className="h-4 w-px bg-slate-700 mx-0.5 shrink-0" />

          {/* Stats */}
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <span className="text-blue-400 font-bold">{cables.length}</span>
            <span>cables</span>
            <span className="text-slate-700">|</span>
            <span className="text-blue-400 font-bold">{nodes.length}</span>
            <span>nodes</span>
          </div>

          <div className="h-4 w-px bg-slate-700 mx-0.5 shrink-0" />

          {/* Back to projects */}
          <button
            onClick={() => { clearCurrentProject(); onBackToProjects(); }}
            className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2 py-1 rounded transition-colors"
            title="프로젝트 목록으로"
          >
            <ArrowLeft size={11} />
            <span className="hidden sm:inline">프로젝트</span>
          </button>

          {/* Logout */}
          <button
            onClick={onLogout}
            className="flex items-center gap-1 text-[10px] font-bold text-red-400 hover:text-white bg-slate-800 hover:bg-red-700 border border-slate-700 hover:border-red-600 px-2 py-1 rounded transition-colors"
            title="로그아웃"
          >
            <LogOut size={11} />
            <span className="hidden sm:inline">로그아웃</span>
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
          onJsonSave={handleJsonSave}
          onJsonLoad={handleJsonLoad}
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
            {activeTab === 'analysis' && (
              <AnalysisTab cableData={cables} nodeData={nodes} />
            )}
            {activeTab === 'history' && <HistoryTab />}
          </div>
        </main>
      </div>

      {/* Click-outside overlays for dropdown menus */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setMenuOpen(false)}
        />
      )}
      {switcherOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setSwitcherOpen(false)}
        />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Session persistence helpers
// ─────────────────────────────────────────────────────────────────────────────
const SESSION_KEY = 'scms_user_session';

function saveSession(user: UserInfo) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(user)); } catch { /* ignore */ }
}

function loadSession(): UserInfo | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserInfo;
  } catch { return null; }
}

function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// AppRouter — decides which screen to show
// ─────────────────────────────────────────────────────────────────────────────

const AppRouter: React.FC = () => {
  // 세션 복원: 이미 로그인했으면 'projects' 화면으로 바로 이동
  const savedSession = loadSession();
  const [user, setUser] = useState<UserInfo | null>(savedSession);
  const [screen, setScreen] = useState<AppScreen>(savedSession ? 'projects' : 'login');

  const { currentProject, clearCurrentProject } = useProject();
  const currentProjectId = currentProject?.id ?? null;

  // When a project is selected in context, auto-advance to main
  React.useEffect(() => {
    if (currentProjectId && screen === 'projects') {
      setScreen('main');
    }
  }, [currentProjectId, screen]);

  // When project is cleared, go back to project selection
  React.useEffect(() => {
    if (!currentProjectId && screen === 'main') {
      setScreen('projects');
    }
  }, [currentProjectId, screen]);

  const handleLogin = useCallback((userInfo?: { name: string; email: string; provider: string; uid?: string }) => {
    // Firebase uid를 우선 사용 (D1 API 인증 키로 활용)
    const info: UserInfo = {
      id: userInfo?.uid || userInfo?.email || `${userInfo?.provider || 'demo'}_${Date.now()}`,
      name: userInfo?.name || 'SEASTAR 사용자',
      email: userInfo?.email || '',
      provider: userInfo?.provider || 'demo',
    };
    setUser(info);
    saveSession(info);
    window.dispatchEvent(new CustomEvent('scms_user_changed', { detail: info.id }));
    setScreen('projects');
  }, []);

  const handleLogout = useCallback(() => {
    clearCurrentProject();
    clearSession();
    setUser(null);
    setScreen('login');
  }, [clearCurrentProject]);

  if (screen === 'login') {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (screen === 'projects') {
    return <ProjectSelectionScreen userName={user?.name} onLogout={handleLogout} />;
  }

  return (
    <MainApp
      onBackToProjects={() => setScreen('projects')}
      onLogout={handleLogout}
      userName={user?.name}
    />
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Root App — userId를 ProjectProvider에 주입
// ─────────────────────────────────────────────────────────────────────────────

const AppWithProvider: React.FC = () => {
  const savedSession = loadSession();
  const [userId, setUserId] = React.useState<string>(savedSession?.id || 'anonymous');

  // AppRouter가 로그인하면 userId도 업데이트해야 하지만,
  // AppRouter가 localStorage에 저장하므로 페이지 새로고침 시 반영됨.
  // 동적 업데이트: CustomEvent 사용
  React.useEffect(() => {
    const handler = (e: CustomEvent<string>) => setUserId(e.detail);
    window.addEventListener('scms_user_changed', handler as EventListener);
    return () => window.removeEventListener('scms_user_changed', handler as EventListener);
  }, []);

  return (
    <ProjectProvider userId={userId}>
      <AppRouter />
    </ProjectProvider>
  );
};

const App: React.FC = () => <AppWithProvider />;

export default App;
