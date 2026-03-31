import React, { useMemo } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { CableData, NodeData } from '../types';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

interface AnalysisTabProps {
  cableData: CableData[];
  nodeData: NodeData[];
}

// Assume a standard tray width of 300mm for fill % estimation
const TRAY_WIDTH_MM = 300;
const TRAY_DEPTH_MM = 100;
const TRAY_AREA_MM2 = TRAY_WIDTH_MM * TRAY_DEPTH_MM;

const PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#a78bfa',
];

const chartBaseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#e2e8f0', font: { size: 11 } } },
  },
  scales: {
    x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#1e293b' } },
    y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#1e293b' } },
  },
};

const doughnutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: { color: '#e2e8f0', font: { size: 10 }, boxWidth: 12, padding: 10 },
    },
  },
};

const AnalysisTab: React.FC<AnalysisTabProps> = ({ cableData, nodeData }) => {
  // ── Chart data ────────────────────────────────────────────────────────────

  const systemChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    cableData.forEach(c => {
      const sys = c.system || 'Unknown';
      counts[sys] = (counts[sys] || 0) + 1;
    });
    return {
      labels: Object.keys(counts),
      datasets: [{
        data: Object.values(counts),
        backgroundColor: PALETTE,
        borderWidth: 2,
        borderColor: '#0f172a',
      }],
    };
  }, [cableData]);

  const typeChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    cableData.forEach(c => {
      const t = c.type || 'Unknown';
      counts[t] = (counts[t] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    return {
      labels: sorted.map(([k]) => k),
      datasets: [{
        label: 'Cable Count',
        data: sorted.map(([, v]) => v),
        backgroundColor: '#3b82f6',
        borderRadius: 3,
      }],
    };
  }, [cableData]);

  const nodeChartData = useMemo(() => {
    const cableCounts: Record<string, number> = {};
    cableData.forEach(c => {
      if (c.fromNode) cableCounts[c.fromNode] = (cableCounts[c.fromNode] || 0) + 1;
      if (c.toNode && c.toNode !== c.fromNode) {
        cableCounts[c.toNode] = (cableCounts[c.toNode] || 0) + 1;
      }
    });
    const topNodes = nodeData
      .map(n => ({ name: n.name, count: cableCounts[n.name] || 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    return {
      labels: topNodes.map(n => n.name),
      datasets: [{
        label: 'Connected Cables',
        data: topNodes.map(n => n.count),
        backgroundColor: '#10b981',
        borderRadius: 3,
      }],
    };
  }, [cableData, nodeData]);

  // ── Length analysis by system ─────────────────────────────────────────────

  const lengthStats = useMemo(() => {
    const map: Record<string, number[]> = {};
    cableData.forEach(c => {
      const sys = c.system || 'Unknown';
      const len = c.calculatedLength || c.length || 0;
      if (!map[sys]) map[sys] = [];
      map[sys].push(len);
    });
    return Object.entries(map).map(([system, lens]) => {
      const total = lens.reduce((s, v) => s + v, 0);
      const avg = total / lens.length;
      const max = Math.max(...lens);
      const min = Math.min(...lens);
      return { system, count: lens.length, total, avg, max, min };
    }).sort((a, b) => b.total - a.total);
  }, [cableData]);

  const grandLength = useMemo(() => ({
    count: lengthStats.reduce((s, r) => s + r.count, 0),
    total: lengthStats.reduce((s, r) => s + r.total, 0),
  }), [lengthStats]);

  // ── Cable tray capacity per node ──────────────────────────────────────────

  const trayStats = useMemo(() => {
    const nodeMap: Record<string, { count: number; odSum: number; area: number }> = {};

    cableData.forEach(c => {
      if (!c.calculatedPath) return;
      const nodes = c.calculatedPath.split(',').map(s => s.trim()).filter(Boolean);
      const od = c.od || 0;
      const cableArea = 0.7854 * od * od; // π/4 × d²

      nodes.forEach(nodeName => {
        if (!nodeMap[nodeName]) nodeMap[nodeName] = { count: 0, odSum: 0, area: 0 };
        nodeMap[nodeName].count += 1;
        nodeMap[nodeName].odSum += od;
        nodeMap[nodeName].area += cableArea;
      });
    });

    return Object.entries(nodeMap)
      .map(([node, d]) => ({
        node,
        count: d.count,
        odSum: d.odSum,
        area: d.area,
        fillPct: (d.area / TRAY_AREA_MM2) * 100,
      }))
      .sort((a, b) => b.fillPct - a.fillPct);
  }, [cableData]);

  // ── Empty state ───────────────────────────────────────────────────────────

  if (cableData.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500 bg-slate-900">
        <p className="text-sm font-bold uppercase tracking-widest">케이블 데이터를 먼저 로드하세요</p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-5 h-full overflow-y-auto bg-slate-900 text-slate-200 space-y-6">

      {/* ── Section 1: Cable Distribution Charts ── */}
      <section>
        <h2 className="text-xs font-black uppercase tracking-widest text-blue-400 mb-3 border-b border-slate-700 pb-1">
          Cable Distribution
        </h2>
        <div className="grid grid-cols-3 gap-4">
          {/* System doughnut */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 flex flex-col h-72 shadow-lg">
            <h3 className="text-[11px] font-bold text-slate-300 mb-3">By System</h3>
            <div className="flex-1 relative">
              <Doughnut data={systemChartData} options={doughnutOptions} />
            </div>
          </div>

          {/* Cable type top-10 horizontal bar */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 flex flex-col h-72 shadow-lg">
            <h3 className="text-[11px] font-bold text-slate-300 mb-3">Cable Type (Top 10)</h3>
            <div className="flex-1 relative">
              <Bar
                data={typeChartData}
                options={{
                  ...chartBaseOptions,
                  indexAxis: 'y' as const,
                  plugins: {
                    ...chartBaseOptions.plugins,
                    legend: { display: false },
                  },
                }}
              />
            </div>
          </div>

          {/* Node connections top-10 horizontal bar */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 flex flex-col h-72 shadow-lg">
            <h3 className="text-[11px] font-bold text-slate-300 mb-3">Node Connections (Top 10)</h3>
            <div className="flex-1 relative">
              <Bar
                data={nodeChartData}
                options={{
                  ...chartBaseOptions,
                  indexAxis: 'y' as const,
                  plugins: {
                    ...chartBaseOptions.plugins,
                    legend: { display: false },
                  },
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 2: Length Analysis ── */}
      <section>
        <h2 className="text-xs font-black uppercase tracking-widest text-emerald-400 mb-3 border-b border-slate-700 pb-1">
          Length Analysis by System
        </h2>
        <div className="overflow-x-auto rounded-xl border border-slate-700 shadow-lg">
          <table className="w-full border-collapse" style={{ fontSize: '12px' }}>
            <thead className="bg-slate-950 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left border-b border-slate-700 text-slate-400 font-bold">System</th>
                <th className="px-3 py-2 text-right border-b border-slate-700 text-slate-400 font-bold">Cable Count</th>
                <th className="px-3 py-2 text-right border-b border-slate-700 text-blue-400 font-bold">Total Length (m)</th>
                <th className="px-3 py-2 text-right border-b border-slate-700 text-slate-400 font-bold">Avg Length (m)</th>
                <th className="px-3 py-2 text-right border-b border-slate-700 text-slate-400 font-bold">Max Length (m)</th>
                <th className="px-3 py-2 text-right border-b border-slate-700 text-slate-400 font-bold">Min Length (m)</th>
              </tr>
            </thead>
            <tbody>
              {lengthStats.map((row, i) => (
                <tr
                  key={row.system}
                  className={i % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800/40'}
                >
                  <td className="px-3 py-2 font-medium text-white">{row.system}</td>
                  <td className="px-3 py-2 text-right text-blue-300">{row.count}</td>
                  <td className="px-3 py-2 text-right text-emerald-300 font-mono font-bold">{row.total.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right font-mono">{row.avg.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right font-mono">{row.max.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right font-mono">{row.min.toFixed(1)}</td>
                </tr>
              ))}
              {/* Grand total row */}
              <tr className="bg-slate-700 font-bold border-t-2 border-slate-500">
                <td className="px-3 py-2 text-white">Grand Total</td>
                <td className="px-3 py-2 text-right text-yellow-300">{grandLength.count}</td>
                <td className="px-3 py-2 text-right text-yellow-300 font-mono">{grandLength.total.toFixed(1)}</td>
                <td className="px-3 py-2 text-right text-slate-400">—</td>
                <td className="px-3 py-2 text-right text-slate-400">—</td>
                <td className="px-3 py-2 text-right text-slate-400">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Section 3: Cable Tray Capacity ── */}
      <section>
        <div className="flex items-center gap-3 mb-3 border-b border-slate-700 pb-1">
          <h2 className="text-xs font-black uppercase tracking-widest text-yellow-400">
            Cable Tray Capacity (per Node)
          </h2>
          <span className="text-[10px] text-slate-500">
            Based on calculatedPath · Tray reference: {TRAY_WIDTH_MM}mm × {TRAY_DEPTH_MM}mm = {TRAY_AREA_MM2.toLocaleString()} mm²
          </span>
        </div>
        {trayStats.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">경로 계산 후 표시됩니다 (calculatedPath 필요)</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-700 shadow-lg">
            <table className="w-full border-collapse" style={{ fontSize: '12px' }}>
              <thead className="bg-slate-950 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left border-b border-slate-700 text-slate-400 font-bold">Node</th>
                  <th className="px-3 py-2 text-right border-b border-slate-700 text-slate-400 font-bold">Cable Count</th>
                  <th className="px-3 py-2 text-right border-b border-slate-700 text-slate-400 font-bold">Total OD Sum (mm)</th>
                  <th className="px-3 py-2 text-right border-b border-slate-700 text-blue-400 font-bold">Total Area (mm²)</th>
                  <th className="px-3 py-2 text-right border-b border-slate-700 text-yellow-400 font-bold w-40">Estimated Fill %</th>
                </tr>
              </thead>
              <tbody>
                {trayStats.map((row, i) => {
                  const fillColor =
                    row.fillPct >= 100 ? 'text-red-400' :
                    row.fillPct >= 80  ? 'text-orange-400' :
                    row.fillPct >= 60  ? 'text-yellow-300' :
                    'text-emerald-400';
                  return (
                    <tr
                      key={row.node}
                      className={i % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800/40'}
                    >
                      <td className="px-3 py-2 font-medium text-white">{row.node}</td>
                      <td className="px-3 py-2 text-right text-blue-300">{row.count}</td>
                      <td className="px-3 py-2 text-right font-mono">{row.odSum.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right font-mono text-blue-300">{row.area.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Mini fill bar */}
                          <div className="w-20 bg-slate-700 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                row.fillPct >= 100 ? 'bg-red-500' :
                                row.fillPct >= 80  ? 'bg-orange-500' :
                                row.fillPct >= 60  ? 'bg-yellow-400' :
                                'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(row.fillPct, 100)}%` }}
                            />
                          </div>
                          <span className={`font-mono font-bold ${fillColor}`}>
                            {row.fillPct.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default AnalysisTab;
