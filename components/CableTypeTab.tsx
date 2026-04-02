import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { CableTypeData } from '../types';
import { Search, Upload, Download, X } from 'lucide-react';
import { useResizableColumns } from '../hooks/useResizableColumns';
import { ResizeHandle } from '../hooks/ResizeHandle';

interface CableTypeTabProps {
  cableTypeData: CableTypeData[];
  onCableTypeDataChange: (data: CableTypeData[]) => void;
}

// ── Excel 파싱 ────────────────────────────────────────────────────────────────
function parseCableTypeSheet(rawData: any[][]): CableTypeData[] {
  if (rawData.length < 2) return [];
  // 헤더 행 찾기 (CABLE TYPE 컬럼이 있는 행)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, rawData.length); i++) {
    if (rawData[i].some((c: any) => String(c || '').toUpperCase().includes('CABLE TYPE'))) {
      headerIdx = i;
      break;
    }
  }
  const headers = rawData[headerIdx].map((h: any) => String(h || '').trim().toUpperCase().replace(/[\r\n]+/g, ' '));

  const idx = (names: string[]) => {
    for (const n of names) {
      const i = headers.findIndex(h => h.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  };

  const col = {
    cableType:    idx(['CABLE TYPE']),
    od:           idx(['O.D']),
    odHalf:       idx(['O.D/2']),
    crossSection: idx(['단면적', 'SECTION', 'AREA']),
    weight:       idx(['무게', 'WEIGHT']),
    din:          idx(['DIN']),
    description:  idx(['DESCRIPTION', 'DESC']),
    glandSize:    idx(['GLAND SIZE', 'GLAND']),
    terminalCore: idx(['TERMINAL CORE', 'CORE']),
    terminalEa:   idx(['TERMINAL EA', 'EA']),
  };

  const pf = (v: any) => { const n = parseFloat(String(v ?? '').replace(/[^0-9.-]/g, '')); return isNaN(n) ? 0 : n; };

  return rawData.slice(headerIdx + 1).map(r => ({
    cableType:    col.cableType >= 0    ? String(r[col.cableType] ?? '').replace(/[\r\n]+/g, ' ').trim() : '',
    od:           col.od >= 0           ? pf(r[col.od]) : 0,
    odHalf:       col.odHalf >= 0       ? pf(r[col.odHalf]) : 0,
    crossSection: col.crossSection >= 0 ? pf(r[col.crossSection]) : 0,
    weight:       col.weight >= 0       ? pf(r[col.weight]) : 0,
    din:          col.din >= 0          ? String(r[col.din] ?? '') : '',
    description:  col.description >= 0  ? String(r[col.description] ?? '') : '',
    glandSize:    col.glandSize >= 0    ? String(r[col.glandSize] ?? '') : '',
    terminalCore: col.terminalCore >= 0 ? String(r[col.terminalCore] ?? '') : '',
    terminalEa:   col.terminalEa >= 0   ? pf(r[col.terminalEa]) || undefined : undefined,
  })).filter(row => row.cableType.length > 0);
}

// ── 컬럼 헤더 정의 ─────────────────────────────────────────────────────────────
const COL_LABELS  = ['CABLE TYPE', 'O.D (mm)', 'O.D/2', '단면적 (mm²)', '무게 (kg/km)', 'DIN', 'DESCRIPTION', 'GLAND SIZE', 'Terminal Core', 'Terminal Ea'];
const COL_WIDTHS  = [130, 80, 70, 110, 110, 100, 200, 100, 120, 90];

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────────
const CableTypeTab: React.FC<CableTypeTabProps> = ({ cableTypeData, onCableTypeDataChange }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const { widths, startResize } = useResizableColumns(COL_WIDTHS);

  // ── 파일 업로드 ────────────────────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      const wb = XLSX.read(evt.target?.result, { type: 'binary' });
      // JIS 시트 우선, 없으면 첫 번째 시트
      const sheetName = wb.SheetNames.find(n => n.toUpperCase() === 'JIS') ?? wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
      const parsed = parseCableTypeSheet(raw);
      onCableTypeDataChange(parsed);
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  // ── 검색 필터 ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return cableTypeData;
    return cableTypeData.filter(r =>
      r.cableType.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      r.din.toLowerCase().includes(q) ||
      r.glandSize.toLowerCase().includes(q)
    );
  }, [cableTypeData, search]);

  const selected = useMemo(() => cableTypeData.find(r => r.cableType === selectedType), [cableTypeData, selectedType]);

  // ── Excel 내보내기 ─────────────────────────────────────────────────────────
  const handleExport = () => {
    const rows = filtered.map(r => ({
      'CABLE TYPE': r.cableType,
      'O.D (mm)': r.od,
      'O.D/2': r.odHalf,
      '단면적 (mm²)': r.crossSection.toFixed(2),
      '무게 (kg/km)': r.weight,
      'DIN': r.din,
      'DESCRIPTION': r.description,
      'GLAND SIZE': r.glandSize,
      'Terminal Core': r.terminalCore ?? '',
      'Terminal Ea': r.terminalEa ?? '',
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [14, 10, 8, 14, 14, 12, 24, 12, 14, 12].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, 'CABLE_TYPE');
    XLSX.writeFile(wb, 'cable_type_list.xlsx');
  };

  return (
    <div className="flex h-full bg-slate-900 text-slate-200 overflow-hidden">
      {/* ── 좌측: 테이블 ── */}
      <div className={`flex flex-col ${selected ? 'w-2/3' : 'w-full'} transition-all overflow-hidden border-r border-slate-800`}>
        {/* 툴바 */}
        <div className="p-3 border-b border-slate-800 bg-slate-800 flex flex-wrap items-center gap-2">
          <input type="file" ref={fileRef} accept=".xlsx,.xls" className="hidden" onChange={handleFileUpload} />
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
          >
            <Upload size={13} /> Import Excel
          </button>
          <button
            onClick={handleExport}
            disabled={cableTypeData.length === 0}
            className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
          >
            <Download size={13} /> Export
          </button>

          {/* 통계 */}
          <div className="flex items-center gap-3 text-xs text-slate-400 ml-2">
            <span><span className="text-white font-bold">{cableTypeData.length}</span> types</span>
            <span><span className="text-white font-bold">{filtered.length}</span> filtered</span>
          </div>

          {/* 검색 */}
          <div className="relative ml-auto">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search type / description..."
              className="pl-8 pr-8 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs focus:outline-none focus:border-blue-500 text-slate-200 w-52"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* 안내 (데이터 없을 때) */}
        {cableTypeData.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-600">
            <Upload size={32} />
            <div className="text-center">
              <p className="text-sm font-bold text-slate-500">케이블 타입 데이터 없음</p>
              <p className="text-xs text-slate-600 mt-1">Import Excel 버튼으로 cable type.xlsx 파일을 업로드하세요</p>
              <p className="text-xs text-slate-700 mt-0.5">컬럼: CABLE TYPE · O.D · O.D/2 · 단면적 · 무게 · DIN · DESCRIPTION · GLAND SIZE</p>
            </div>
          </div>
        )}

        {/* 테이블 */}
        {cableTypeData.length > 0 && (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-xs" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                {widths.map((w, i) => <col key={i} style={{ width: w }} />)}
              </colgroup>
              <thead className="bg-slate-950 text-slate-400 uppercase sticky top-0 z-10">
                <tr>
                  {COL_LABELS.map((label, i) => (
                    <th key={i} className="relative px-3 py-2.5 font-bold border-b border-slate-800 select-none overflow-hidden">
                      <span className="truncate block pr-1">{label}</span>
                      <ResizeHandle onMouseDown={e => startResize(i, e)} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map(row => (
                  <tr
                    key={row.cableType}
                    onClick={() => setSelectedType(prev => prev === row.cableType ? null : row.cableType)}
                    className={`cursor-pointer transition-colors ${
                      selectedType === row.cableType
                        ? 'bg-blue-900/40 text-white'
                        : 'hover:bg-slate-800/50'
                    }`}
                  >
                    <td className="px-3 py-1.5 font-bold text-blue-400 truncate">{row.cableType}</td>
                    <td className="px-3 py-1.5 font-mono text-right text-amber-400">{row.od}</td>
                    <td className="px-3 py-1.5 font-mono text-right text-slate-400">{row.odHalf}</td>
                    <td className="px-3 py-1.5 font-mono text-right">{row.crossSection.toFixed(1)}</td>
                    <td className="px-3 py-1.5 font-mono text-right text-slate-400">{row.weight}</td>
                    <td className="px-3 py-1.5 text-slate-300 truncate">{row.din}</td>
                    <td className="px-3 py-1.5 text-slate-300 truncate">{row.description}</td>
                    <td className="px-3 py-1.5 text-emerald-400 truncate">{row.glandSize}</td>
                    <td className="px-3 py-1.5 text-slate-400 truncate">{row.terminalCore}</td>
                    <td className="px-3 py-1.5 font-mono text-right text-slate-400">{row.terminalEa ?? ''}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-slate-500 italic">검색 결과 없음</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 우측: 선택된 타입 상세 ── */}
      {selected && (
        <div className="w-1/3 shrink-0 flex flex-col bg-slate-900 border-l border-slate-800 overflow-hidden">
          <div className="p-3 border-b border-slate-800 bg-slate-800 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Cable Type Detail</p>
              <h3 className="text-sm font-black text-blue-400">{selected.cableType}</h3>
            </div>
            <button onClick={() => setSelectedType(null)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded">
              <X size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {/* 시각적 OD 원 */}
            <div className="flex justify-center mb-5">
              <div className="relative flex items-center justify-center">
                <div
                  className="rounded-full border-4 border-amber-400 bg-slate-800 flex items-center justify-center text-amber-400 font-black"
                  style={{
                    width: Math.max(60, Math.min(160, selected.od * 4)),
                    height: Math.max(60, Math.min(160, selected.od * 4)),
                    fontSize: Math.max(10, Math.min(20, selected.od * 1.5)),
                  }}
                >
                  {selected.od}mm
                </div>
              </div>
            </div>

            {/* 상세 정보 */}
            <div className="space-y-2 text-xs">
              {[
                ['CABLE TYPE', selected.cableType, 'text-blue-400 font-bold'],
                ['O.D', `${selected.od} mm`, 'text-amber-400 font-mono'],
                ['O.D / 2', `${selected.odHalf} mm`, 'text-slate-300 font-mono'],
                ['단면적', `${selected.crossSection.toFixed(2)} mm²`, 'text-slate-300 font-mono'],
                ['무게', `${selected.weight} kg/km`, 'text-slate-300 font-mono'],
                ['DIN 규격', selected.din, 'text-slate-300'],
                ['Description', selected.description, 'text-slate-300'],
                ['Gland Size', selected.glandSize, 'text-emerald-400 font-bold'],
                ['Terminal Core', selected.terminalCore || '-', 'text-slate-400'],
                ['Terminal Ea', selected.terminalEa?.toString() || '-', 'text-slate-400 font-mono'],
              ].map(([label, value, cls]) => (
                <div key={label} className="flex justify-between gap-3 border-b border-slate-800/60 pb-1.5">
                  <span className="text-slate-500 shrink-0 w-28">{label}</span>
                  <span className={`text-right truncate ${cls}`}>{value}</span>
                </div>
              ))}
            </div>

            {/* O.D 기준 단면적 계산 확인 */}
            <div className="mt-4 bg-slate-800 rounded-lg p-3 text-xs">
              <div className="text-slate-500 text-[10px] uppercase font-bold mb-2">계산 검증</div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">π × (OD/2)²</span>
                  <span className="font-mono text-amber-400">{(Math.PI * selected.odHalf * selected.odHalf).toFixed(2)} mm²</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Excel 단면적</span>
                  <span className="font-mono text-slate-300">{selected.crossSection.toFixed(2)} mm²</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CableTypeTab;
