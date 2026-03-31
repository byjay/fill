import React, { useRef } from 'react';
import { CableData, NodeData } from '../types';
import * as XLSX from 'xlsx';
import { Upload, RefreshCw, Download, Activity } from 'lucide-react';

interface SidebarProps {
  cableData: CableData[];
  nodeData: NodeData[];
  onCableDataChange: (data: CableData[]) => void;
  onNodeDataChange: (data: NodeData[]) => void;
  onCalculateAllPaths: () => void;
  onRefreshAll: () => void;
  onExportAllData: () => void;
}

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
  cableWeight: ['CABLE_WEIGHT', 'CWT']
};

const NODE_COLUMNS = {
  name: ['NODE_RNAME', 'NODE_NAME', 'NAME', 'Node'],
  structure: ['STRUCTURE_NAME', 'STRUCTURE', 'Structure'],
  component: ['COMPONENT', 'Component'],
  type: ['NODE_TYPE', 'TYPE', 'Type'],
  relation: ['RELATION', 'Relation'],
  linkLength: ['LINK_LENGTH', 'Link Length'],
  areaSize: ['AREA_SIZE', 'Area Size', 'Area']
};

function getColumnIndex(headers: string[], possibleNames: string[]) {
  const lowerHeaders = headers.map(h => String(h || '').toLowerCase().trim());
  for (const name of possibleNames) {
    const idx = lowerHeaders.indexOf(name.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

function safeParseFloat(value: any) {
  const parsed = parseFloat(String(value || '').replace(/[^0-9.-]/g, ''));
  return isNaN(parsed) ? 0 : parsed;
}

const Sidebar: React.FC<SidebarProps> = ({
  cableData,
  nodeData,
  onCableDataChange,
  onNodeDataChange,
  onCalculateAllPaths,
  onRefreshAll,
  onExportAllData
}) => {
  const cableFileRef = useRef<HTMLInputElement>(null);
  const nodeFileRef = useRef<HTMLInputElement>(null);

  const handleCableFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as any[][];
      
      if (rawData.length < 2) return;
      const headers = rawData[0];
      const indices: Record<string, number> = {};
      for (const key in CABLE_COLUMNS) {
        indices[key] = getColumnIndex(headers, CABLE_COLUMNS[key as keyof typeof CABLE_COLUMNS]);
      }

      const newCableData = rawData.slice(1).map((row, idx) => ({
        id: `c-${idx}`,
        name: indices.name >= 0 ? String(row[indices.name] || '') : '',
        type: indices.type >= 0 ? String(row[indices.type] || '') : '',
        system: indices.system >= 0 ? String(row[indices.system] || '') : '',
        fromNode: indices.fromNode >= 0 ? String(row[indices.fromNode] || '') : '',
        toNode: indices.toNode >= 0 ? String(row[indices.toNode] || '') : '',
        fromRoom: indices.fromRoom >= 0 ? String(row[indices.fromRoom] || '') : '',
        toRoom: indices.toRoom >= 0 ? String(row[indices.toRoom] || '') : '',
        fromEquip: indices.fromEquip >= 0 ? String(row[indices.fromEquip] || '') : '',
        toEquip: indices.toEquip >= 0 ? String(row[indices.toEquip] || '') : '',
        fromRest: indices.fromRest >= 0 ? safeParseFloat(row[indices.fromRest]) : 0,
        toRest: indices.toRest >= 0 ? safeParseFloat(row[indices.toRest]) : 0,
        length: indices.length >= 0 ? safeParseFloat(row[indices.length]) : 0,
        path: indices.path >= 0 ? String(row[indices.path] || '') : '',
        od: indices.outDia >= 0 ? safeParseFloat(row[indices.outDia]) : 10,
        checkNode: indices.checkNode >= 0 ? String(row[indices.checkNode] || '') : '',
        wdPage: indices.wdPage >= 0 ? String(row[indices.wdPage] || '') : '',
        supplyDeck: indices.supplyDeck >= 0 ? String(row[indices.supplyDeck] || '') : '',
        porWeight: indices.porWeight >= 0 ? safeParseFloat(row[indices.porWeight]) : 0,
        interference: indices.interference >= 0 ? String(row[indices.interference] || '') : '',
        remark: indices.remark >= 0 ? String(row[indices.remark] || '') : '',
        remark1: indices.remark1 >= 0 ? String(row[indices.remark1] || '') : '',
        remark2: indices.remark2 >= 0 ? String(row[indices.remark2] || '') : '',
        remark3: indices.remark3 >= 0 ? String(row[indices.remark3] || '') : '',
        revision: indices.revision >= 0 ? String(row[indices.revision] || '') : '',
        cableWeight: indices.cableWeight >= 0 ? safeParseFloat(row[indices.cableWeight]) : 0,
      })).filter(c => c.name);

      onCableDataChange(newCableData);
    };
    reader.readAsBinaryString(file);
  };

  const handleNodeFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as any[][];
      
      if (rawData.length < 2) return;
      const headers = rawData[0];
      const indices: Record<string, number> = {};
      for (const key in NODE_COLUMNS) {
        indices[key] = getColumnIndex(headers, NODE_COLUMNS[key as keyof typeof NODE_COLUMNS]);
      }

      const newNodeData = rawData.slice(1).map((row) => ({
        name: indices.name >= 0 ? String(row[indices.name] || '') : '',
        structure: indices.structure >= 0 ? String(row[indices.structure] || '') : '',
        component: indices.component >= 0 ? String(row[indices.component] || '') : '',
        type: indices.type >= 0 ? String(row[indices.type] || '') : '',
        relation: indices.relation >= 0 ? String(row[indices.relation] || '') : '',
        linkLength: indices.linkLength >= 0 ? safeParseFloat(row[indices.linkLength]) : 0,
        areaSize: indices.areaSize >= 0 ? safeParseFloat(row[indices.areaSize]) : 0,
      })).filter(n => n.name);

      onNodeDataChange(newNodeData);
    };
    reader.readAsBinaryString(file);
  };

  const totalLength = cableData.reduce((sum, c) => sum + (c.calculatedLength || c.length || 0), 0);
  const calculatedPaths = cableData.filter(c => c.calculatedPath).length;

  return (
    <aside className="w-80 bg-slate-900 border-r border-slate-800 p-4 flex flex-col gap-4 overflow-y-auto text-slate-300">
      <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
        <h3 className="text-blue-400 font-bold mb-3 flex items-center gap-2"><Upload size={16}/> File Upload</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Cable Info (Excel)</label>
            <input type="file" ref={cableFileRef} onChange={handleCableFileUpload} accept=".xlsx,.xls,.csv" className="hidden" />
            <button onClick={() => cableFileRef.current?.click()} className="w-full bg-slate-700 hover:bg-slate-600 text-white text-xs py-2 px-3 rounded transition-colors text-left truncate">
              {cableData.length > 0 ? `${cableData.length} cables loaded` : 'Select Cable File...'}
            </button>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Node Info (Excel)</label>
            <input type="file" ref={nodeFileRef} onChange={handleNodeFileUpload} accept=".xlsx,.xls,.csv" className="hidden" />
            <button onClick={() => nodeFileRef.current?.click()} className="w-full bg-slate-700 hover:bg-slate-600 text-white text-xs py-2 px-3 rounded transition-colors text-left truncate">
              {nodeData.length > 0 ? `${nodeData.length} nodes loaded` : 'Select Node File...'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
        <h3 className="text-blue-400 font-bold mb-3 flex items-center gap-2"><Activity size={16}/> System Stats</h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-900 p-3 rounded border border-slate-700 text-center">
            <div className="text-xl font-bold text-blue-400">{cableData.length}</div>
            <div className="text-[10px] text-slate-400 uppercase">Total Cables</div>
          </div>
          <div className="bg-slate-900 p-3 rounded border border-slate-700 text-center">
            <div className="text-xl font-bold text-blue-400">{nodeData.length}</div>
            <div className="text-[10px] text-slate-400 uppercase">Total Nodes</div>
          </div>
          <div className="bg-slate-900 p-3 rounded border border-slate-700 text-center">
            <div className="text-xl font-bold text-blue-400">{totalLength.toFixed(0)}</div>
            <div className="text-[10px] text-slate-400 uppercase">Total Length (m)</div>
          </div>
          <div className="bg-slate-900 p-3 rounded border border-slate-700 text-center">
            <div className="text-xl font-bold text-blue-400">{calculatedPaths}</div>
            <div className="text-[10px] text-slate-400 uppercase">Calculated Paths</div>
          </div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
        <h3 className="text-blue-400 font-bold mb-3">Control Panel</h3>
        <div className="space-y-2">
          <button onClick={onExportAllData} className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-3 rounded transition-colors">
            <Download size={14}/> Export All Data
          </button>
          <button onClick={onRefreshAll} className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold py-2 px-3 rounded transition-colors">
            <RefreshCw size={14}/> Refresh All
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
