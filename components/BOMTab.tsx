import React, { useMemo, useState } from 'react';
import { CableData } from '../types';
import { Download } from 'lucide-react';

interface BOMTabProps {
  cableData: CableData[];
}

// BOM view modes
type ViewMode = 'type' | 'system' | 'pivot';

// System abbreviation mapping (케이블 시스템 → 약어)
function getSysAbbr(sys: string): string {
  const s = (sys || '').toUpperCase();
  if (s.includes('CON') || s === 'C') return 'Con.';
  if (s.includes('FIR') || s.includes('FIRE') || s === 'F') return 'Fir.';
  if (s.includes('LIG') || s.includes('LIGHT') || s === 'L') return 'Lig.';
  if (s.includes('NAV') || s.includes('NAVI') || s === 'N') return 'Nav.';
  if (s.includes('POW') || s.includes('POWER') || s === 'P') return 'Pow.';
  if (s.includes('AUT') || s.includes('AUTO') || s === 'A') return 'Aut.';
  return sys || 'S';
}

export default function BOMTab({ cableData }: BOMTabProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('pivot');
  const [marginPct, setMarginPct] = useState(0);

  const systems = useMemo(() =>
    Array.from(new Set(cableData.map(c => c.system).filter(Boolean) as string[])).sort(),
    [cableData]
  );

  const types = useMemo(() =>
    Array.from(new Set(cableData.map(c => c.type).filter(Boolean) as string[])).sort(),
    [cableData]
  );

  // Build pivot: type → system → { qty, len }
  const pivot = useMemo(() => {
    const map: Record<string, Record<string, { qty: number; len: number; wgt: number }>> = {};
    cableData.forEach(c => {
      const t = c.type || 'N/A';
      const s = c.system || 'N/A';
      if (!map[t]) map[t] = {};
      if (!map[t][s]) map[t][s] = { qty: 0, len: 0, wgt: 0 };
      map[t][s].qty += 1;
      const rawLen = c.calculatedLength || c.length || 0;
      map[t][s].len += rawLen * (1 + marginPct / 100);
      map[t][s].wgt += (c.porWeight || 0);
    });
    return map;
  }, [cableData, marginPct]);

  // Type summary (aggregated by type across all systems)
  const typeSummary = useMemo(() => {
    return types.map(t => {
      let totalQty = 0;
      let totalLen = 0;
      let totalWgt = 0;
      systems.forEach(s => {
        const cell = pivot[t]?.[s];
        if (cell) { totalQty += cell.qty; totalLen += cell.len; totalWgt += cell.wgt; }
      });
      // also count types not in current systems list
      Object.values(pivot[t] || {}).forEach(cell => {
        // already counted above for known systems
      });
      return { type: t, qty: totalQty, len: totalLen, wgt: totalWgt };
    });
  }, [types, systems, pivot]);

  const grandTotals = useMemo(() => ({
    qty: typeSummary.reduce((s, r) => s + r.qty, 0),
    len: typeSummary.reduce((s, r) => s + r.len, 0),
    wgt: typeSummary.reduce((s, r) => s + r.wgt, 0),
  }), [typeSummary]);

  const exportCSV = () => {
    const lines: string[] = [];
    if (viewMode === 'pivot') {
      const headers = ['No', 'Cable Type', ...systems.flatMap(s => [`${getSysAbbr(s)} Length`, `${getSysAbbr(s)} Weight`]), 'S Length', 'S Weight', 'Total Length', 'Total Weight'];
      lines.push(headers.join(','));
      typeSummary.forEach((row, i) => {
        const cells = [String(i + 1), row.type];
        systems.forEach(s => {
          const c = pivot[row.type]?.[s];
          cells.push(c ? c.len.toFixed(0) : '');
          cells.push(c ? c.wgt.toFixed(0) : '');
        });
        cells.push(row.len.toFixed(0), row.wgt.toFixed(0), row.len.toFixed(0), row.wgt.toFixed(0));
        lines.push(cells.join(','));
      });
      // Grand total row
      const totalCells = ['0', 'Total'];
      systems.forEach(s => {
        const sysTotLen = typeSummary.reduce((acc, row) => acc + (pivot[row.type]?.[s]?.len || 0), 0);
        const sysTotWgt = typeSummary.reduce((acc, row) => acc + (pivot[row.type]?.[s]?.wgt || 0), 0);
        totalCells.push(sysTotLen.toFixed(0), sysTotWgt.toFixed(0));
      });
      totalCells.push(grandTotals.len.toFixed(0), grandTotals.wgt.toFixed(0), grandTotals.len.toFixed(0), grandTotals.wgt.toFixed(0));
      lines.push(totalCells.join(','));
    } else if (viewMode === 'type') {
      lines.push(['No', 'Cable Type', 'Qty', 'Total Length (m)', 'Total Weight'].join(','));
      typeSummary.forEach((row, i) => {
        lines.push([String(i + 1), row.type, String(row.qty), row.len.toFixed(1), row.wgt > 0 ? row.wgt.toFixed(0) : '0'].join(','));
      });
      lines.push(['-', 'Total', String(grandTotals.qty), grandTotals.len.toFixed(1), grandTotals.wgt > 0 ? grandTotals.wgt.toFixed(0) : '0'].join(','));
    } else if (viewMode === 'system') {
      lines.push(['No', 'System', 'Cables', 'Total Length (m)', 'Total Weight'].join(','));
      const sysRows = systems.map((s, i) => {
        const cables = cableData.filter(c => c.system === s);
        const len = cables.reduce((acc, c) => acc + ((c.calculatedLength || c.length || 0) * (1 + marginPct / 100)), 0);
        const wgt = cables.reduce((acc, c) => acc + (c.porWeight || 0), 0);
        return [String(i + 1), s, String(cables.length), len.toFixed(1), wgt > 0 ? wgt.toFixed(0) : '0'].join(',');
      });
      sysRows.forEach(r => lines.push(r));
    }
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'BOM.csv';
    a.click();
  };

  if (cableData.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500 bg-slate-900">
        <div className="text-center">
          <p className="font-bold uppercase tracking-widest text-sm">케이블 데이터를 먼저 로드하세요</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200">
      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-slate-800 bg-slate-800 flex items-center gap-4 shrink-0">
        <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-700">
          {(['pivot', 'type', 'system'] as ViewMode[]).map(m => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`px-3 py-1 text-[11px] font-bold rounded transition-colors ${viewMode === m ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {m === 'pivot' ? 'PIVOT' : m === 'type' ? 'BY TYPE' : 'BY SYSTEM'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 font-bold uppercase">Margin</span>
          <input
            type="number"
            min={0}
            max={50}
            value={marginPct}
            onChange={e => setMarginPct(parseInt(e.target.value) || 0)}
            className="w-16 bg-slate-900 border border-slate-700 text-white text-xs px-2 py-1 rounded text-center"
          />
          <span className="text-[10px] text-slate-400">%</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[10px] text-slate-500">{cableData.length} cables · {types.length} types · {systems.length} systems</span>
          <button onClick={exportCSV} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3 py-1.5 rounded transition-colors">
            <Download size={12} /> CSV
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {viewMode === 'pivot' && (
          <PivotView
            types={types}
            systems={systems}
            pivot={pivot}
            typeSummary={typeSummary}
            grandTotals={grandTotals}
          />
        )}
        {viewMode === 'type' && <TypeView typeSummary={typeSummary} grandTotals={grandTotals} />}
        {viewMode === 'system' && <SystemView systems={systems} pivot={pivot} cableData={cableData} marginPct={marginPct} />}
      </div>
    </div>
  );
}

// ── Pivot View (matches screenshot) ────────────────────────────────
function PivotView({ types, systems, pivot, typeSummary, grandTotals }: {
  types: string[];
  systems: string[];
  pivot: Record<string, Record<string, { qty: number; len: number; wgt: number }>>;
  typeSummary: { type: string; qty: number; len: number; wgt: number }[];
  grandTotals: { qty: number; len: number; wgt: number };
}) {
  const fmtLen = (v: number) => v > 0 ? v.toFixed(0) : '';
  const fmtWgt = (v: number) => v > 0 ? v.toFixed(0) : '';

  return (
    <table className="w-full border-collapse" style={{ fontSize: '11px' }}>
      <thead className="bg-slate-950 sticky top-0 z-10">
        <tr>
          <th className="px-2 py-2 text-left border-b-2 border-r border-slate-700 text-slate-400 font-bold w-8">No</th>
          <th className="px-2 py-2 text-left border-b-2 border-r border-slate-700 text-slate-400 font-bold w-28">Cable Type</th>
          {systems.map(s => (
            <React.Fragment key={s}>
              <th className="px-2 py-2 text-center border-b-2 border-slate-700 text-blue-400 font-bold" style={{ background: 'rgba(30,60,100,0.3)' }}>
                {getSysAbbr(s)} Length
              </th>
              <th className="px-2 py-2 text-center border-b-2 border-r border-slate-700 text-slate-400 font-bold" style={{ background: 'rgba(30,40,60,0.2)' }}>
                {getSysAbbr(s)} Weight
              </th>
            </React.Fragment>
          ))}
          <th className="px-2 py-2 text-center border-b-2 border-slate-700 text-emerald-400 font-bold bg-slate-800">S Length</th>
          <th className="px-2 py-2 text-center border-b-2 border-slate-700 text-slate-400 font-bold bg-slate-800">S Weight</th>
          <th className="px-2 py-2 text-center border-b-2 border-slate-700 text-yellow-400 font-bold bg-slate-800">Total Length</th>
          <th className="px-2 py-2 text-center border-b-2 border-slate-700 text-yellow-400 font-bold bg-slate-800">Total Weight</th>
        </tr>
      </thead>
      <tbody>
        {typeSummary.map((row, i) => (
          <tr key={row.type} className={i % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800/50'}>
            <td className="px-2 py-1.5 text-center border-r border-slate-800 text-blue-400 font-bold">{i + 1}</td>
            <td className="px-2 py-1.5 border-r border-slate-800 font-medium text-white">{row.type}</td>
            {systems.map(s => {
              const cell = pivot[row.type]?.[s];
              return (
                <React.Fragment key={s}>
                  <td className="px-2 py-1.5 text-right border-slate-800 text-blue-300" style={{ background: 'rgba(30,60,100,0.1)' }}>
                    {cell ? fmtLen(cell.len) : ''}
                  </td>
                  <td className="px-2 py-1.5 text-right border-r border-slate-800" style={{ background: 'rgba(30,40,60,0.1)' }}>
                    {cell ? fmtWgt(cell.wgt) : ''}
                  </td>
                </React.Fragment>
              );
            })}
            <td className="px-2 py-1.5 text-right border-slate-800 text-emerald-400 font-bold bg-slate-800/30">{fmtLen(row.len)}</td>
            <td className="px-2 py-1.5 text-right border-slate-800 bg-slate-800/30">{fmtWgt(row.wgt)}</td>
            <td className="px-2 py-1.5 text-right border-slate-800 text-yellow-400 font-bold bg-slate-800/30">{fmtLen(row.len)}</td>
            <td className="px-2 py-1.5 text-right bg-slate-800/30 text-yellow-300 font-bold">{fmtWgt(row.wgt)}</td>
          </tr>
        ))}
        {/* Total row */}
        <tr className="bg-slate-700 font-bold border-t-2 border-slate-500">
          <td className="px-2 py-2 text-center border-r border-slate-600 text-slate-300">0</td>
          <td className="px-2 py-2 border-r border-slate-600 text-white">Total</td>
          {systems.map(s => {
            const sysTotLen = typeSummary.reduce((acc, row) => acc + (pivot[row.type]?.[s]?.len || 0), 0);
            const sysTotWgt = typeSummary.reduce((acc, row) => acc + (pivot[row.type]?.[s]?.wgt || 0), 0);
            return (
              <React.Fragment key={s}>
                <td className="px-2 py-2 text-right border-slate-600 text-blue-300">
                  {sysTotLen > 0 ? sysTotLen.toFixed(0) : '0'}
                </td>
                <td className="px-2 py-2 text-right border-r border-slate-600">
                  {sysTotWgt > 0 ? sysTotWgt.toFixed(0) : '0'}
                </td>
              </React.Fragment>
            );
          })}
          <td className="px-2 py-2 text-right text-emerald-300">{grandTotals.len.toFixed(0)}</td>
          <td className="px-2 py-2 text-right">{grandTotals.wgt.toFixed(0)}</td>
          <td className="px-2 py-2 text-right text-yellow-300">{grandTotals.len.toFixed(0)}</td>
          <td className="px-2 py-2 text-right text-yellow-200">{grandTotals.wgt.toFixed(0)}</td>
        </tr>
      </tbody>
    </table>
  );
}

// ── Type View ────────────────────────────────
function TypeView({ typeSummary, grandTotals }: {
  typeSummary: { type: string; qty: number; len: number; wgt: number }[];
  grandTotals: { qty: number; len: number; wgt: number };
}) {
  return (
    <table className="w-full border-collapse" style={{ fontSize: '12px' }}>
      <thead className="bg-slate-950 sticky top-0">
        <tr>
          <th className="px-3 py-2 text-left border-b-2 border-slate-700 text-slate-400 font-bold w-8">No</th>
          <th className="px-3 py-2 text-left border-b-2 border-slate-700 text-slate-400 font-bold">Cable Type</th>
          <th className="px-3 py-2 text-right border-b-2 border-slate-700 text-slate-400 font-bold">Qty</th>
          <th className="px-3 py-2 text-right border-b-2 border-slate-700 text-blue-400 font-bold">Total Length (m)</th>
          <th className="px-3 py-2 text-right border-b-2 border-slate-700 text-slate-400 font-bold">Total Weight</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800">
        {typeSummary.map((row, i) => (
          <tr key={row.type} className="hover:bg-slate-800/40">
            <td className="px-3 py-2 text-center text-blue-400 font-bold">{i + 1}</td>
            <td className="px-3 py-2 font-medium text-white">{row.type}</td>
            <td className="px-3 py-2 text-right">{row.qty}</td>
            <td className="px-3 py-2 text-right text-blue-300 font-mono">{row.len.toFixed(1)}</td>
            <td className="px-3 py-2 text-right">{row.wgt > 0 ? row.wgt.toFixed(0) : '-'}</td>
          </tr>
        ))}
        <tr className="bg-slate-700 font-bold border-t-2 border-slate-500">
          <td className="px-3 py-2 text-center">-</td>
          <td className="px-3 py-2 text-white">Total</td>
          <td className="px-3 py-2 text-right text-yellow-300">{grandTotals.qty}</td>
          <td className="px-3 py-2 text-right text-yellow-300 font-mono">{grandTotals.len.toFixed(1)}</td>
          <td className="px-3 py-2 text-right text-yellow-300">{grandTotals.wgt > 0 ? grandTotals.wgt.toFixed(0) : '-'}</td>
        </tr>
      </tbody>
    </table>
  );
}

// ── System View ────────────────────────────────
function SystemView({ systems, pivot, cableData, marginPct }: {
  systems: string[];
  pivot: Record<string, Record<string, { qty: number; len: number; wgt: number }>>;
  cableData: CableData[];
  marginPct: number;
}) {
  const sysData = systems.map(s => {
    const cables = cableData.filter(c => c.system === s);
    const len = cables.reduce((acc, c) => acc + ((c.calculatedLength || c.length || 0) * (1 + marginPct / 100)), 0);
    const wgt = cables.reduce((acc, c) => acc + (c.porWeight || 0), 0);
    return { system: s, qty: cables.length, len, wgt };
  });

  return (
    <table className="w-full border-collapse" style={{ fontSize: '12px' }}>
      <thead className="bg-slate-950 sticky top-0">
        <tr>
          <th className="px-3 py-2 text-left border-b-2 border-slate-700 text-slate-400 font-bold w-8">No</th>
          <th className="px-3 py-2 text-left border-b-2 border-slate-700 text-slate-400 font-bold">System</th>
          <th className="px-3 py-2 text-right border-b-2 border-slate-700 text-slate-400 font-bold">Cables</th>
          <th className="px-3 py-2 text-right border-b-2 border-slate-700 text-blue-400 font-bold">Total Length (m)</th>
          <th className="px-3 py-2 text-right border-b-2 border-slate-700 text-slate-400 font-bold">Total Weight</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800">
        {sysData.map((row, i) => (
          <tr key={row.system} className="hover:bg-slate-800/40">
            <td className="px-3 py-2 text-center text-blue-400 font-bold">{i + 1}</td>
            <td className="px-3 py-2 font-medium text-white">{row.system}</td>
            <td className="px-3 py-2 text-right">{row.qty}</td>
            <td className="px-3 py-2 text-right text-blue-300 font-mono">{row.len.toFixed(1)}</td>
            <td className="px-3 py-2 text-right">{row.wgt > 0 ? row.wgt.toFixed(0) : '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
