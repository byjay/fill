import React, { useState, useMemo, useCallback } from 'react';
import { CableData } from '../types';
import { Search, Download, Play, Save, RefreshCw, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useResizableColumns } from '../hooks/useResizableColumns';
import { ResizeHandle } from '../hooks/ResizeHandle';

interface CableListTabProps {
  cableData: CableData[];
  onCalculateAllPaths: () => void;
  onExportCableList: () => void;
  onCableEdit: (index: number, updated: Partial<CableData>) => void;
  onRouteSingle: (index: number) => void;
}

// ── 테이블 컬럼 정의 ─────────────────────────────────────────────────────────
const COL_HEADERS = [
  '#', 'SYS', 'PG', 'NAME', 'TYPE',
  'F_ROOM', 'F_EQUIP', 'F_NODE', 'F_R',
  'T_ROOM', 'T_EQUIP', 'T_NODE', 'T_R',
  'LEN', 'OD', 'CHK', 'DECK', 'WGT', 'REM', 'REV',
  'PATH',
];
const COL_INIT = [
  40, 60, 45, 130, 110,
  80, 80, 80, 40,
  80, 80, 80, 40,
  55, 45, 70, 60, 45, 70, 45,
  400,
];

// ── 편집 폼 필드 (3열 배치용) ─────────────────────────────────────────────────
interface FieldDef {
  key: keyof CableData;
  label: string;
  type?: 'text' | 'number';
  placeholder?: string;
}

// 3줄 × 6열 레이아웃으로 압축 (18 fields → 3 rows)
const FORM_FIELDS: FieldDef[][] = [
  // Row 1 (6열)
  [
    { key: 'name', label: 'CABLE NAME' },
    { key: 'type', label: 'CABLE TYPE' },
    { key: 'system', label: 'SYSTEM' },
    { key: 'wdPage', label: 'WD PAGE' },
    { key: 'od', label: 'OD (mm)', type: 'number' },
    { key: 'checkNode', label: 'CHECK/VIA', placeholder: 'comma separated' },
  ],
  // Row 2 (6열) — FROM 정보
  [
    { key: 'fromNode', label: 'FROM NODE' },
    { key: 'fromRoom', label: 'FROM ROOM' },
    { key: 'fromEquip', label: 'FROM EQUIP' },
    { key: 'fromRest', label: 'F.REST (m)', type: 'number' },
    { key: 'supplyDeck', label: 'SUPPLY DECK' },
    { key: 'revision', label: 'REVISION' },
  ],
  // Row 3 (6열) — TO 정보
  [
    { key: 'toNode', label: 'TO NODE' },
    { key: 'toRoom', label: 'TO ROOM' },
    { key: 'toEquip', label: 'TO EQUIP' },
    { key: 'toRest', label: 'T.REST (m)', type: 'number' },
    { key: 'porWeight', label: 'POR WEIGHT', type: 'number' },
    { key: 'remark', label: 'REMARK' },
  ],
];

// ─────────────────────────────────────────────────────────────────────────────

const CableListTab: React.FC<CableListTabProps> = ({
  cableData,
  onCalculateAllPaths,
  onExportCableList,
  onCableEdit,
  onRouteSingle,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [systemFilter, setSystemFilter] = useState('');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null); // originalIndex
  const [editState, setEditState] = useState<Partial<CableData>>({});
  const [panelExpanded, setPanelExpanded] = useState(true);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }, [sortKey]);
  const { widths, startResize } = useResizableColumns(COL_INIT);

  // ── 필터링 ───────────────────────────────────────────────────────────────
  const systems = useMemo(() =>
    Array.from(new Set(cableData.map(c => c.system).filter(Boolean))).sort(),
    [cableData]
  );

  const filteredCables = useMemo(() => {
    const lower = searchTerm.toLowerCase();
    return cableData
      .map((cable, originalIndex) => ({ cable, originalIndex }))
      .filter(({ cable }) => {
        const matchSearch =
          cable.name.toLowerCase().includes(lower) ||
          cable.type.toLowerCase().includes(lower) ||
          (cable.system || '').toLowerCase().includes(lower) ||
          (cable.fromNode || '').toLowerCase().includes(lower) ||
          (cable.toNode || '').toLowerCase().includes(lower);
        const matchSys = systemFilter ? cable.system === systemFilter : true;
        return matchSearch && matchSys;
      });
  }, [cableData, searchTerm, systemFilter]);

  const sortedCables = useMemo(() => {
    if (!sortKey) return filteredCables;
    return [...filteredCables].sort((a, b) => {
      const getVal = (cable: CableData): string | number => {
        const map: Record<string, keyof CableData> = {
          '#': 'id', 'SYS': 'system', 'PG': 'wdPage', 'NAME': 'name', 'TYPE': 'type',
          'F_ROOM': 'fromRoom', 'F_EQUIP': 'fromEquip', 'F_NODE': 'fromNode', 'F_R': 'fromRest',
          'T_ROOM': 'toRoom', 'T_EQUIP': 'toEquip', 'T_NODE': 'toNode', 'T_R': 'toRest',
          'LEN': 'calculatedLength', 'OD': 'od', 'CHK': 'checkNode', 'DECK': 'supplyDeck',
          'WGT': 'porWeight', 'REM': 'remark', 'REV': 'revision', 'PATH': 'calculatedPath',
        };
        const prop = map[sortKey];
        if (!prop) return '';
        if (sortKey === 'LEN') return cable.calculatedLength || cable.length || 0;
        const v = cable[prop];
        return v ?? '';
      };
      const av = getVal(a.cable), bv = getVal(b.cable);
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [filteredCables, sortKey, sortDir]);

  // 선택된 케이블 (originalIndex 기준)
  const selectedCable = selectedIndex !== null ? cableData[selectedIndex] : null;

  // ── 행 클릭 → 선택 & 편집 상태 세팅 ────────────────────────────────────
  const handleRowClick = useCallback((originalIndex: number, cable: CableData) => {
    if (selectedIndex === originalIndex) {
      // 같은 행 재클릭 → 선택 해제
      setSelectedIndex(null);
      setEditState({});
    } else {
      setSelectedIndex(originalIndex);
      setEditState({ ...cable });
      setPanelExpanded(true);
    }
  }, [selectedIndex]);

  // ── 필드 변경 ────────────────────────────────────────────────────────────
  const handleFieldChange = useCallback(<K extends keyof CableData>(key: K, value: CableData[K]) => {
    setEditState(prev => ({ ...prev, [key]: value }));
  }, []);

  // ── 저장 ────────────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    if (selectedIndex === null) return;
    onCableEdit(selectedIndex, editState);
  }, [selectedIndex, editState, onCableEdit]);

  // ── 재루팅 ──────────────────────────────────────────────────────────────
  const handleReroute = useCallback(() => {
    if (selectedIndex === null) return;
    // 먼저 편집 상태 저장 후 재루팅
    onCableEdit(selectedIndex, editState);
    setTimeout(() => onRouteSingle(selectedIndex), 50);
  }, [selectedIndex, editState, onCableEdit, onRouteSingle]);

  // ── 입력 클래스 ─────────────────────────────────────────────────────────
  const inputCls =
    'w-full px-2 py-1 bg-slate-800 border border-slate-600 rounded text-[11px] text-slate-100 ' +
    'focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 placeholder-slate-500';

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200 overflow-hidden">

      {/* ── 툴바 ─────────────────────────────────────────────────────── */}
      <div className="px-3 py-2 border-b border-slate-800 flex gap-3 items-center justify-between bg-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={onCalculateAllPaths}
            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-[10px] font-bold transition-colors"
          >
            <Play size={12} /> ROUTE ALL
          </button>
          <button
            onClick={onExportCableList}
            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded text-[10px] font-bold transition-colors"
          >
            <Download size={12} /> CSV
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-7 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-[11px] focus:outline-none focus:border-blue-500 text-slate-200 w-48"
            />
          </div>
          <select
            value={systemFilter}
            onChange={e => setSystemFilter(e.target.value)}
            className="px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-[11px] focus:outline-none focus:border-blue-500 text-slate-200"
          >
            <option value="">All SYS</option>
            {systems.map(sys => <option key={sys} value={sys}>{sys}</option>)}
          </select>
          <span className="text-[10px] text-slate-500 font-bold">
            {filteredCables.length} / {cableData.length}
          </span>
        </div>
      </div>

      {/* ── 상단 편집 패널 (선택된 케이블 있을 때만) ──────────────────────── */}
      {selectedCable && (
        <div className="shrink-0 border-b border-slate-700 bg-slate-850 overflow-hidden" style={{ backgroundColor: '#0f172a' }}>
          {/* 패널 헤더 */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800 border-b border-slate-700">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-black text-amber-400 uppercase tracking-wider">✏ EDIT CABLE</span>
              <span className="text-[11px] font-bold text-blue-300">{selectedCable.name}</span>
              <span className="text-[10px] text-slate-500">→ #{selectedIndex}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded text-[10px] font-bold transition-colors"
              >
                <Save size={11} /> 저장
              </button>
              <button
                onClick={handleReroute}
                className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-[10px] font-bold transition-colors"
              >
                <RefreshCw size={11} /> 재루팅
              </button>
              <button
                onClick={() => setPanelExpanded(v => !v)}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                title={panelExpanded ? '접기' : '펼치기'}
              >
                {panelExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              <button
                onClick={() => { setSelectedIndex(null); setEditState({}); }}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                title="닫기"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* 폼 + PATH 레이아웃 (좌 70%: 폼 컴팩트, 우 30%: DECK PATH) */}
          {panelExpanded && (
            <div className="flex gap-2 p-1.5" style={{ maxHeight: '150px' }}>
              {/* 좌: 컴팩트 폼 (70%) */}
              <div className="flex-[7] overflow-y-auto space-y-1">
                {FORM_FIELDS.map((row, rowIdx) => (
                  <div key={rowIdx} className="grid grid-cols-6 gap-1">
                    {row.map(field => (
                      <div key={String(field.key)} className="flex items-center gap-1">
                        <label className="text-[7px] font-black text-slate-500 uppercase w-14 shrink-0 text-right">
                          {field.label}
                        </label>
                        <input
                          type={field.type || 'text'}
                          className="flex-1 px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-[10px] text-white focus:outline-none focus:border-blue-500"
                          placeholder={field.placeholder || ''}
                          value={String(editState[field.key] ?? '')}
                          onChange={e => {
                            const v = field.type === 'number'
                              ? (parseFloat(e.target.value) || 0)
                              : e.target.value;
                            handleFieldChange(field.key, v as CableData[typeof field.key]);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              {/* 우: DECK별 PATH (30%) */}
              <div className="flex-[3] bg-slate-900 border border-slate-700 rounded overflow-y-auto">
                <div className="px-2 py-1 bg-slate-800 border-b border-slate-700 sticky top-0">
                  <span className="text-[8px] font-black text-emerald-400 uppercase">PATH by DECK</span>
                </div>
                <div className="px-2 py-1">
                  {(() => {
                    const pathStr = selectedCable.calculatedPath || selectedCable.path || '';
                    if (!pathStr) return <span className="text-[9px] text-slate-600">(경로 없음)</span>;
                    const pathNodes = pathStr.includes('→') ? pathStr.split('→').map((s: string) => s.trim()) : pathStr.split(',').map((s: string) => s.trim());
                    // 데크 코드별 그룹핑 (노드 앞 2글자가 데크 코드)
                    const deckGroups: Record<string, string[]> = {};
                    pathNodes.forEach((n: string) => {
                      const deck = (n.match(/^[A-Za-z]+/)?.[0] || n.substring(0, 2)).substring(0, 2).toUpperCase();
                      if (!deckGroups[deck]) deckGroups[deck] = [];
                      deckGroups[deck].push(n);
                    });
                    return Object.entries(deckGroups).map(([deck, nodes]) => (
                      <div key={deck} className="mb-1">
                        <span className="text-[8px] font-bold text-amber-400">{deck}</span>
                        <span className="text-[8px] text-slate-500 ml-1">({nodes.length})</span>
                        <div className="text-[8px] text-emerald-300 font-mono break-all leading-tight">
                          {nodes.join(' → ')}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 케이블 테이블 ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <table
          className="text-left border-collapse"
          style={{ fontSize: '12px', tableLayout: 'fixed', width: `${widths.reduce((a, b) => a + b, 0)}px`, minWidth: '100%' }}
        >
          <colgroup>
            {widths.map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead className="bg-slate-800 text-white uppercase sticky top-0 z-10" style={{ fontSize: '13px' }}>
            <tr>
              {COL_HEADERS.map((label, i) => (
                <th
                  key={i}
                  onClick={() => handleSort(label)}
                  className="relative px-2 py-2 font-black border border-slate-500 overflow-hidden select-none whitespace-nowrap cursor-pointer hover:bg-slate-700 transition-colors"
                >
                  <span className="flex items-center gap-1 pr-2">
                    <span>{label}</span>
                    {sortKey === label ? (
                      <span className="text-blue-400 text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>
                    ) : (
                      <span className="text-slate-600 text-[10px]">⇅</span>
                    )}
                  </span>
                  <ResizeHandle onMouseDown={(e) => { e.stopPropagation(); startResize(i, e); }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {sortedCables.map(({ cable, originalIndex }) => {
              const isSelected = selectedIndex === originalIndex;
              const rowCls = isSelected
                ? 'bg-amber-950/50 border-l-2 border-l-amber-400'
                : 'hover:bg-slate-800/40 border-l-2 border-l-transparent';

              return (
                <tr
                  key={cable.id}
                  onClick={() => handleRowClick(originalIndex, cable)}
                  className={`cursor-pointer transition-colors ${rowCls}`}
                >
                  {/* # */}
                  <td className="px-2 py-1.5 text-slate-500 font-mono whitespace-nowrap overflow-hidden">{originalIndex + 1}</td>
                  {/* SYS */}
                  <td className="px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis">{cable.system || '-'}</td>
                  {/* PG */}
                  <td className="px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis">{cable.wdPage || '-'}</td>
                  {/* NAME */}
                  <td className="px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis font-medium text-blue-400" title={cable.name}>
                    {cable.name}
                  </td>
                  {/* TYPE */}
                  <td className="px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis" title={cable.type}>{cable.type}</td>
                  {/* F_ROOM */}
                  <td className="px-2 py-1.5 break-words" style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{cable.fromRoom || '-'}</td>
                  {/* F_EQUIP */}
                  <td className="px-2 py-1.5 break-words" style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{cable.fromEquip || '-'}</td>
                  {/* F_NODE */}
                  <td className="px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis text-emerald-400" title={cable.fromNode}>
                    {cable.fromNode || '-'}
                  </td>
                  {/* F_R */}
                  <td className="px-2 py-1.5 whitespace-nowrap overflow-hidden font-mono text-right">{cable.fromRest || '-'}</td>
                  {/* T_ROOM */}
                  <td className="px-2 py-1.5 break-words" style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{cable.toRoom || '-'}</td>
                  {/* T_EQUIP */}
                  <td className="px-2 py-1.5 break-words" style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{cable.toEquip || '-'}</td>
                  {/* T_NODE */}
                  <td className="px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis text-rose-400" title={cable.toNode}>
                    {cable.toNode || '-'}
                  </td>
                  {/* T_R */}
                  <td className="px-2 py-1.5 whitespace-nowrap overflow-hidden font-mono text-right">{cable.toRest || '-'}</td>
                  {/* LEN */}
                  <td className="px-2 py-1.5 whitespace-nowrap overflow-hidden font-mono text-emerald-400 font-bold text-right">
                    {(cable.calculatedLength || cable.length || 0).toFixed(1)}
                  </td>
                  {/* OD */}
                  <td className="px-2 py-1.5 whitespace-nowrap overflow-hidden font-mono text-right">{cable.od || '-'}</td>
                  {/* CHK */}
                  <td className="px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis text-amber-400" title={cable.checkNode || ''}>
                    {cable.checkNode || '-'}
                  </td>
                  {/* DECK */}
                  <td className="px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis">{cable.supplyDeck || '-'}</td>
                  {/* WGT */}
                  <td className="px-2 py-1.5 whitespace-nowrap overflow-hidden font-mono text-right">{cable.porWeight || '-'}</td>
                  {/* REM */}
                  <td className="px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis text-slate-400" title={cable.remark || ''}>
                    {cable.remark || '-'}
                  </td>
                  {/* REV */}
                  <td className="px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis">{cable.revision || '-'}</td>
                  {/* PATH — deck 코드별 그룹핑 */}
                  <td
                    className="px-2 py-1.5 text-[10px]"
                    style={{ whiteSpace: 'normal', lineHeight: '1.5', minWidth: '300px' }}
                    title={cable.calculatedPath || cable.path || ''}
                  >
                    {(() => {
                      const pathStr = cable.calculatedPath || cable.path || '';
                      if (!pathStr) return <span className="text-slate-600 italic">no path</span>;
                      const pathNodes = pathStr.split(/[,→>]/).map(s => s.trim()).filter(Boolean);
                      // 앞 2글자로 deck 그룹핑
                      const deckGroups: Record<string, string[]> = {};
                      const deckOrder: string[] = [];
                      pathNodes.forEach(n => {
                        const dk = n.match(/^[A-Za-z]+/)?.[0]?.substring(0, 2).toUpperCase() || n.substring(0, 2).toUpperCase();
                        if (!deckGroups[dk]) { deckGroups[dk] = []; deckOrder.push(dk); }
                        deckGroups[dk].push(n);
                      });
                      return (
                        <div className="space-y-0.5">
                          {deckOrder.map(dk => (
                            <div key={dk} className="flex items-start gap-1.5">
                              <span className="inline-block text-[9px] font-black text-amber-400 bg-amber-900/20 border border-amber-700/30 px-1 rounded shrink-0 mt-0.5 min-w-[24px] text-center">{dk}</span>
                              <span className="text-emerald-300 font-mono break-all leading-snug">{deckGroups[dk].join(', ')}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </td>
                </tr>
              );
            })}
            {sortedCables.length === 0 && (
              <tr>
                <td colSpan={COL_HEADERS.length} className="px-4 py-8 text-center text-slate-500 italic">
                  No cables found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── 하단 상태바 ─────────────────────────────────────────────────── */}
      <div className="shrink-0 px-3 py-1 bg-slate-950 border-t border-slate-800 flex items-center gap-3 text-[10px] text-slate-500">
        {selectedCable ? (
          <>
            <span className="text-amber-400 font-bold">● {selectedCable.name}</span>
            <span>선택됨 — 위 패널에서 편집 후 저장/재루팅</span>
            <button
              onClick={handleSave}
              className="ml-auto flex items-center gap-1 bg-emerald-700 hover:bg-emerald-600 text-white px-2 py-0.5 rounded text-[9px] font-bold transition-colors"
            >
              <Save size={9} /> 저장
            </button>
            <button
              onClick={handleReroute}
              className="flex items-center gap-1 bg-blue-700 hover:bg-blue-600 text-white px-2 py-0.5 rounded text-[9px] font-bold transition-colors"
            >
              <RefreshCw size={9} /> 재루팅
            </button>
          </>
        ) : (
          <span>행을 클릭하면 편집 패널이 열립니다</span>
        )}
        <span className="ml-auto text-slate-600">
          {sortedCables.length} / {cableData.length} cables
        </span>
      </div>
    </div>
  );
};

export default CableListTab;
