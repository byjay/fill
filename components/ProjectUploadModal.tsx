import React, { useState, useRef, useCallback, DragEvent } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, X, Zap, Ship } from 'lucide-react';
import { CableData, NodeData } from '../types';

// ── Column Maps (same as App.tsx) ──────────────────────────────────────────
const CABLE_COLUMNS: Record<string, string[]> = {
  name: ['CABLE_NAME', 'NAME', 'Cable Name'],
  type: ['CABLE_TYPE', 'TYPE', 'Type'],
  fromNode: ['FROM_NODE', 'From Node', 'FROM'],
  toNode: ['TO_NODE', 'To Node', 'TO'],
  outDia: ['CABLE_OUTDIA', 'OUT_DIA', 'OD', 'DIA', 'OUTER DIA', 'DIA_MM', 'Diameter'],
  length: ['POR_LENGTH', 'LENGTH', 'Length', 'POR LENGTH'],
  system: ['CABLE_SYSTEM', 'SYSTEM', 'System'],
  fromRoom: ['FROM_ROOM', 'From Room'],
  toRoom: ['TO_ROOM', 'To Room'],
  fromEquip: ['FROM_EQUIP', 'From Equipment'],
  toEquip: ['TO_EQUIP', 'To Equipment'],
  fromRest: ['FROM_REST', 'FROM REST'],
  toRest: ['TO_REST', 'TO REST'],
  path: ['CABLE_PATH', 'PATH', 'Path'],
  checkNode: ['CHECK_NODE', 'Check Node', 'VIA'],
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

const NODE_COLUMNS: Record<string, string[]> = {
  name: ['NODE_RNAME', 'NODE_NAME', 'NAME', 'Node'],
  structure: ['STRUCTURE_NAME', 'STRUCTURE', 'Structure'],
  component: ['COMPONENT', 'Component'],
  type: ['NODE_TYPE', 'TYPE', 'Type'],
  relation: ['RELATION', 'Relation'],
  linkLength: ['LINK_LENGTH', 'Link Length'],
  areaSize: ['AREA_SIZE', 'Area Size', 'Area'],
  x: ['X_COORD', 'X', 'COORD_X', 'POS_X'],
  y: ['Y_COORD', 'Y', 'COORD_Y', 'POS_Y'],
  z: ['Z_COORD', 'Z', 'COORD_Z', 'POS_Z'],
  deck: ['DECK', 'DECK_NO', 'FLOOR'],
};

function getIdx(headers: string[], cols: string[]): number {
  const lo = headers.map(h => String(h || '').toLowerCase().trim());
  for (const c of cols) { const i = lo.indexOf(c.toLowerCase()); if (i >= 0) return i; }
  return -1;
}
function safeFloat(v: unknown): number {
  const n = parseFloat(String(v || '').replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

interface ValidationResult {
  warnings: string[];
  errors: string[];
}

function validateCableHeaders(headers: string[]): ValidationResult {
  const warnings: string[] = [], errors: string[] = [];
  const required = { name: 'CABLE_NAME', fromNode: 'FROM_NODE', toNode: 'TO_NODE' };
  for (const [key, hint] of Object.entries(required)) {
    if (getIdx(headers, CABLE_COLUMNS[key]) < 0)
      errors.push(`필수 컬럼 누락: ${hint} (${CABLE_COLUMNS[key].join('/')}) `);
  }
  if (getIdx(headers, CABLE_COLUMNS.outDia) < 0)
    warnings.push('OD 컬럼 없음 → 기본값 10mm 적용 (OD, DIA, OUTER DIA 사용)');
  if (getIdx(headers, CABLE_COLUMNS.length) < 0)
    warnings.push('LENGTH 컬럼 없음 → 노드 LINK_LENGTH로 산출');
  return { warnings, errors };
}

function validateNodeHeaders(headers: string[]): ValidationResult {
  const warnings: string[] = [], errors: string[] = [];
  if (getIdx(headers, NODE_COLUMNS.name) < 0)
    errors.push('필수 컬럼 누락: NODE_NAME (NODE_RNAME, NODE_NAME, NAME 중 하나 필요)');
  if (getIdx(headers, NODE_COLUMNS.linkLength) < 0)
    warnings.push('LINK_LENGTH 없음 → 라우팅 거리 = 0 처리 (길이 산출 불가)');
  return { warnings, errors };
}

function parseCables(raw: unknown[][]): CableData[] {
  if (raw.length < 2) return [];
  const headers = raw[0] as string[];
  const idx: Record<string, number> = {};
  for (const k in CABLE_COLUMNS) idx[k] = getIdx(headers, CABLE_COLUMNS[k]);
  return raw.slice(1).map((row, i) => {
    const r = row as unknown[];
    return {
      id: `c-${i}`,
      name: idx.name >= 0 ? String(r[idx.name] || '') : '',
      type: idx.type >= 0 ? String(r[idx.type] || '') : '',
      system: idx.system >= 0 ? String(r[idx.system] || '') : '',
      fromNode: idx.fromNode >= 0 ? String(r[idx.fromNode] || '') : '',
      toNode: idx.toNode >= 0 ? String(r[idx.toNode] || '') : '',
      fromRoom: idx.fromRoom >= 0 ? String(r[idx.fromRoom] || '') : '',
      toRoom: idx.toRoom >= 0 ? String(r[idx.toRoom] || '') : '',
      fromEquip: idx.fromEquip >= 0 ? String(r[idx.fromEquip] || '') : '',
      toEquip: idx.toEquip >= 0 ? String(r[idx.toEquip] || '') : '',
      fromRest: idx.fromRest >= 0 ? safeFloat(r[idx.fromRest]) : 0,
      toRest: idx.toRest >= 0 ? safeFloat(r[idx.toRest]) : 0,
      length: idx.length >= 0 ? safeFloat(r[idx.length]) : 0,
      path: idx.path >= 0 ? String(r[idx.path] || '') : '',
      od: idx.outDia >= 0 ? (safeFloat(r[idx.outDia]) || 10) : 10,
      checkNode: idx.checkNode >= 0 ? String(r[idx.checkNode] || '') : '',
      wdPage: idx.wdPage >= 0 ? String(r[idx.wdPage] || '') : '',
      supplyDeck: idx.supplyDeck >= 0 ? String(r[idx.supplyDeck] || '') : '',
      porWeight: idx.porWeight >= 0 ? safeFloat(r[idx.porWeight]) : 0,
      interference: idx.interference >= 0 ? String(r[idx.interference] || '') : '',
      remark: idx.remark >= 0 ? String(r[idx.remark] || '') : '',
      remark1: idx.remark1 >= 0 ? String(r[idx.remark1] || '') : '',
      remark2: idx.remark2 >= 0 ? String(r[idx.remark2] || '') : '',
      remark3: idx.remark3 >= 0 ? String(r[idx.remark3] || '') : '',
      revision: idx.revision >= 0 ? String(r[idx.revision] || '') : '',
      cableWeight: idx.cableWeight >= 0 ? safeFloat(r[idx.cableWeight]) : 0,
    };
  }).filter(c => c.name);
}

function parseNodes(raw: unknown[][]): NodeData[] {
  if (raw.length < 2) return [];
  const headers = raw[0] as string[];
  const idx: Record<string, number> = {};
  for (const k in NODE_COLUMNS) idx[k] = getIdx(headers, NODE_COLUMNS[k]);
  const pc = (r: unknown[], i: number): number | undefined => {
    if (i < 0) return undefined;
    const v = r[i];
    if (v === '' || v == null) return undefined;
    const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
    return isNaN(n) ? undefined : n;
  };
  return raw.slice(1).map(row => {
    const r = row as unknown[];
    return {
      name: idx.name >= 0 ? String(r[idx.name] || '') : '',
      structure: idx.structure >= 0 ? String(r[idx.structure] || '') : '',
      component: idx.component >= 0 ? String(r[idx.component] || '') : '',
      type: idx.type >= 0 ? String(r[idx.type] || '') : '',
      relation: idx.relation >= 0 ? String(r[idx.relation] || '') : '',
      linkLength: idx.linkLength >= 0 ? safeFloat(r[idx.linkLength]) : 0,
      areaSize: idx.areaSize >= 0 ? safeFloat(r[idx.areaSize]) : 0,
      x: pc(r, idx.x), y: pc(r, idx.y), z: pc(r, idx.z),
      deck: idx.deck >= 0 ? (String(r[idx.deck] || '') || undefined) : undefined,
    };
  }).filter(n => n.name);
}

function readXlsx(file: File): Promise<unknown[][]> {
  return new Promise(res => {
    const reader = new FileReader();
    reader.onload = e => {
      const wb = XLSX.read(e.target?.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      res(XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][]);
    };
    reader.readAsBinaryString(file);
  });
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface FileState {
  file: File | null;
  raw: unknown[][];
  data: CableData[] | NodeData[];
  validation: ValidationResult;
  loading: boolean;
}

export interface ProjectUploadResult {
  vesselName: string;
  vesselNo: string;
  cables: CableData[];
  nodes: NodeData[];
  autoRoute: boolean;
}

interface Props {
  onConfirm: (result: ProjectUploadResult) => Promise<void>;
  onCancel: () => void;
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ProjectUploadModal({ onConfirm, onCancel }: Props) {
  const [vesselName, setVesselName] = useState('');
  const [vesselNo, setVesselNo] = useState('');
  const [autoRoute, setAutoRoute] = useState(true);
  const [creating, setCreating] = useState(false);

  const [cableState, setCableState] = useState<FileState>({ file: null, raw: [], data: [], validation: { warnings: [], errors: [] }, loading: false });
  const [nodeState, setNodeState] = useState<FileState>({ file: null, raw: [], data: [], validation: { warnings: [], errors: [] }, loading: false });

  const [cableDragOver, setCableDragOver] = useState(false);
  const [nodeDragOver, setNodeDragOver] = useState(false);

  const cableInputRef = useRef<HTMLInputElement>(null);
  const nodeInputRef = useRef<HTMLInputElement>(null);

  const processCableFile = useCallback(async (file: File) => {
    setCableState(s => ({ ...s, file, loading: true }));
    const raw = await readXlsx(file);
    const headers = raw.length > 0 ? (raw[0] as string[]) : [];
    const validation = validateCableHeaders(headers);
    const data = parseCables(raw);
    setCableState({ file, raw, data, validation, loading: false });
  }, []);

  const processNodeFile = useCallback(async (file: File) => {
    setNodeState(s => ({ ...s, file, loading: true }));
    const raw = await readXlsx(file);
    const headers = raw.length > 0 ? (raw[0] as string[]) : [];
    const validation = validateNodeHeaders(headers);
    const data = parseNodes(raw);
    setNodeState({ file, raw, data, validation, loading: false });
  }, []);

  const handleCableDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setCableDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) processCableFile(file);
  }, [processCableFile]);

  const handleNodeDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setNodeDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) processNodeFile(file);
  }, [processNodeFile]);

  const canCreate = vesselName.trim() && cableState.data.length > 0 && nodeState.data.length > 0;

  const handleCreate = async () => {
    if (!canCreate || creating) return;
    setCreating(true);
    try {
      await onConfirm({
        vesselName: vesselName.trim(),
        vesselNo: vesselNo.trim(),
        cables: cableState.data as CableData[],
        nodes: nodeState.data as NodeData[],
        autoRoute,
      });
    } finally {
      setCreating(false);
    }
  };

  const DropZone = ({
    label, icon, state, dragOver,
    onDrop, onDragOver, onDragLeave, onFileChange, inputRef,
  }: {
    label: string; icon: React.ReactNode; state: FileState; dragOver: boolean;
    onDrop: (e: DragEvent<HTMLDivElement>) => void;
    onDragOver: (e: DragEvent<HTMLDivElement>) => void;
    onDragLeave: () => void;
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    inputRef: React.RefObject<HTMLInputElement>;
  }) => (
    <div className="flex-1 flex flex-col gap-2">
      <div className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
        {icon} {label}
      </div>
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => inputRef.current?.click()}
        className={`flex-1 border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all min-h-[160px]
          ${dragOver ? 'border-blue-400 bg-blue-500/10' : state.data.length > 0 ? 'border-emerald-500/60 bg-emerald-900/10' : 'border-slate-600 hover:border-slate-400 hover:bg-slate-700/30'}`}
      >
        {state.loading ? (
          <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        ) : state.data.length > 0 ? (
          <>
            <CheckCircle2 size={28} className="text-emerald-400" />
            <div className="text-center">
              <div className="text-lg font-black text-emerald-400">{state.data.length}</div>
              <div className="text-[10px] text-slate-400">건 로드됨</div>
              <div className="text-[9px] text-slate-500 truncate max-w-[140px] mt-1">{state.file?.name}</div>
            </div>
          </>
        ) : (
          <>
            <Upload size={24} className="text-slate-500" />
            <div className="text-center">
              <div className="text-xs text-slate-400 font-medium">드래그하거나 클릭</div>
              <div className="text-[10px] text-slate-500 mt-1">.xlsx / .xls</div>
            </div>
          </>
        )}
      </div>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onFileChange} />
      {/* Validation */}
      {state.validation.errors.length > 0 && (
        <div className="bg-red-900/30 border border-red-500/30 rounded-lg p-2 space-y-1">
          {state.validation.errors.map((e, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[10px] text-red-400">
              <AlertTriangle size={10} className="mt-0.5 shrink-0" /> {e}
            </div>
          ))}
        </div>
      )}
      {state.validation.warnings.length > 0 && (
        <div className="bg-amber-900/20 border border-amber-500/20 rounded-lg p-2 space-y-1">
          {state.validation.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[10px] text-amber-400">
              <AlertTriangle size={10} className="mt-0.5 shrink-0" /> {w}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-[90vw] max-w-2xl flex flex-col"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <Ship size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-black text-white">새 프로젝트 생성</h2>
              <p className="text-[10px] text-slate-400">케이블 & 노드 파일을 업로드하면 자동 설정됩니다</p>
            </div>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-white p-1 rounded transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
          {/* Vessel info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block mb-1.5">호선명 *</label>
              <input
                type="text" value={vesselName} onChange={e => setVesselName(e.target.value)}
                placeholder="예: 선박명 또는 프로젝트명"
                className="w-full bg-slate-800 border border-slate-600 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block mb-1.5">호선번호</label>
              <input
                type="text" value={vesselNo} onChange={e => setVesselNo(e.target.value)}
                placeholder="예: 1234"
                className="w-full bg-slate-800 border border-slate-600 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          {/* File drop zones */}
          <div className="flex gap-4" style={{ minHeight: '200px' }}>
            <DropZone
              label="케이블 리스트 (Excel)"
              icon={<FileSpreadsheet size={14} className="text-blue-400" />}
              state={cableState}
              dragOver={cableDragOver}
              onDrop={handleCableDrop}
              onDragOver={e => { e.preventDefault(); setCableDragOver(true); }}
              onDragLeave={() => setCableDragOver(false)}
              onFileChange={e => { const f = e.target.files?.[0]; if (f) processCableFile(f); e.target.value = ''; }}
              inputRef={cableInputRef}
            />
            <DropZone
              label="노드 정보 (Excel)"
              icon={<FileSpreadsheet size={14} className="text-emerald-400" />}
              state={nodeState}
              dragOver={nodeDragOver}
              onDrop={handleNodeDrop}
              onDragOver={e => { e.preventDefault(); setNodeDragOver(true); }}
              onDragLeave={() => setNodeDragOver(false)}
              onFileChange={e => { const f = e.target.files?.[0]; if (f) processNodeFile(f); e.target.value = ''; }}
              inputRef={nodeInputRef}
            />
          </div>

          {/* Auto routing toggle */}
          {cableState.data.length > 0 && nodeState.data.length > 0 && (
            <label className="flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 cursor-pointer hover:border-blue-500/50 transition-colors">
              <input
                type="checkbox" checked={autoRoute} onChange={e => setAutoRoute(e.target.checked)}
                className="w-4 h-4 accent-blue-500"
              />
              <div>
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <Zap size={14} className="text-amber-400" />
                  파일 로드 후 자동 라우팅 실행
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">케이블 경로를 자동으로 계산합니다 (시간이 소요됩니다)</div>
              </div>
            </label>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700 flex items-center justify-between gap-3">
          <div className="text-[10px] text-slate-500">
            {cableState.data.length > 0 && <span className="text-blue-400 font-bold mr-3">케이블 {cableState.data.length}건</span>}
            {nodeState.data.length > 0 && <span className="text-emerald-400 font-bold">노드 {nodeState.data.length}건</span>}
            {!cableState.data.length && !nodeState.data.length && '파일을 업로드하세요'}
          </div>
          <div className="flex gap-2">
            <button onClick={onCancel} className="px-4 py-2 text-xs text-slate-400 border border-slate-700 rounded-xl hover:bg-slate-800 transition-colors">
              취소
            </button>
            <button
              onClick={handleCreate}
              disabled={!canCreate || creating}
              className="px-6 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-xl transition-colors flex items-center gap-2"
            >
              {creating ? (
                <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> 생성 중...</>
              ) : (
                <><Ship size={14} /> 프로젝트 생성</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
