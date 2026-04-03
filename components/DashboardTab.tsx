import React, { useMemo, useState, useCallback } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { CableData, NodeData } from '../types';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

interface DashboardTabProps {
  cableData: CableData[];
  nodeData: NodeData[];
}

/* popup identifier */
type PopupId =
  | 'system' | 'type' | 'nodeConn' | 'lengthDist' | 'odDist'
  | 'deckDist' | 'pathStatus' | 'weight' | 'top20' | 'nodeConnectivity'
  | 'matrix' | 'quickStats' | null;

/* ── helper: hsl palette by index ──────────────────────────────── */
const hsl = (i: number, total: number, s = 70, l = 55) =>
  `hsl(${Math.round((i * 360) / Math.max(total, 1))}, ${s}%, ${l}%)`;

/* ── helper: horizontal bar chart (SVG) ────────────────────────── */
interface HBarItem { label: string; value: number; }
const HBarChart: React.FC<{
  items: HBarItem[];
  barHeight?: number;
  gap?: number;
  showPercent?: boolean;
  colorSeed?: number;
  compact?: boolean;
}> = ({ items, barHeight = 24, gap = 6, showPercent = false, colorSeed = 0, compact = false }) => {
  const maxVal = Math.max(...items.map(d => d.value), 1);
  const total = items.reduce((s, d) => s + d.value, 0);
  const chartW = compact ? 400 : 520;
  const labelW = compact ? 80 : 110;
  const valW = compact ? 50 : 60;
  const barW = chartW - labelW - valW;
  const actualBarH = compact ? 16 : barHeight;
  const actualGap = compact ? 3 : gap;
  const h = items.length * (actualBarH + actualGap) + actualGap;

  return (
    <svg width="100%" viewBox={`0 0 ${chartW} ${h}`} className="overflow-visible">
      {items.map((d, i) => {
        const y = i * (actualBarH + actualGap) + actualGap;
        const w = (d.value / maxVal) * barW;
        const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0';
        return (
          <g key={i} className="hbar-item">
            <title>{d.label}: {d.value}{showPercent ? ` (${pct}%)` : ''}</title>
            <text x={labelW - 6} y={y + actualBarH / 2 + 4} textAnchor="end"
              fill="#cbd5e1" fontSize={compact ? '9' : '11'} className="select-none">
              {d.label.length > (compact ? 10 : 14) ? d.label.slice(0, compact ? 9 : 13) + '..' : d.label}
            </text>
            <rect x={labelW} y={y} width={w} height={actualBarH} rx={3}
              fill={hsl(i + colorSeed, items.length + colorSeed)} opacity={0.85}
              className="transition-all duration-200 hover:opacity-100" />
            <text x={labelW + w + 4} y={y + actualBarH / 2 + 4}
              fill="#94a3b8" fontSize={compact ? '9' : '11'}>
              {d.value}{showPercent ? ` (${pct}%)` : ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

/* ── helper: donut chart (SVG) ─────────────────────────────────── */
const SvgDonut: React.FC<{
  segments: { label: string; value: number; color: string }[];
  size?: number;
  compact?: boolean;
}> = ({ segments, size = 180, compact = false }) => {
  const actualSize = compact ? 120 : size;
  const total = segments.reduce((s, d) => s + d.value, 0);
  const r = actualSize / 2 - 10;
  const cx = actualSize / 2;
  const cy = actualSize / 2;
  const strokeW = compact ? 20 : 30;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg width={actualSize} height={actualSize} viewBox={`0 0 ${actualSize} ${actualSize}`}>
        {segments.map((seg, i) => {
          const pct = total > 0 ? seg.value / total : 0;
          const dash = pct * circ;
          const el = (
            <circle key={i} cx={cx} cy={cy} r={r}
              fill="none" stroke={seg.color} strokeWidth={strokeW}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
              className="transition-all duration-200 hover:opacity-80"
              style={{ cursor: 'pointer' }}>
              <title>{seg.label}: {seg.value} ({(pct * 100).toFixed(1)}%)</title>
            </circle>
          );
          offset += dash;
          return el;
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" fill="#e2e8f0" fontSize={compact ? '14' : '18'} fontWeight="bold">
          {total}
        </text>
        <text x={cx} y={cy + (compact ? 8 : 12)} textAnchor="middle" fill="#94a3b8" fontSize={compact ? '9' : '11'}>total</text>
      </svg>
      <div className={`flex flex-col gap-1 ${compact ? 'text-[10px]' : 'text-xs'}`}>
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: seg.color }} />
            <span className="text-slate-300 whitespace-nowrap">{seg.label}: {seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── ChartCard: clickable container with hover effects ─────────── */
const ChartCard: React.FC<{
  title: string;
  titleColor?: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}> = ({ title, titleColor = 'text-blue-400', onClick, children, className = '' }) => (
  <div
    onClick={onClick}
    className={`bg-slate-800 p-3 rounded-xl border border-slate-700 shadow-lg cursor-pointer
      transition-all duration-300 ease-out
      hover:scale-[1.02] hover:border-blue-500/50 hover:shadow-blue-500/10 hover:shadow-xl
      active:scale-[0.99] ${className}`}
  >
    <h3 className={`text-xs font-bold ${titleColor} mb-2 flex items-center justify-between`}>
      <span>{title}</span>
      <span className="text-slate-500 text-[10px] font-normal">click for details</span>
    </h3>
    <div className="overflow-hidden">{children}</div>
  </div>
);

/* ── Modal Overlay ─────────────────────────────────────────────── */
const Modal: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, onClose, children }) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center"
    onClick={onClose}
  >
    {/* backdrop */}
    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
    {/* content */}
    <div
      className="relative bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl
        w-[90vw] max-w-4xl max-h-[85vh] flex flex-col animate-in"
      onClick={e => e.stopPropagation()}
    >
      {/* header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
        <h2 className="text-lg font-bold text-blue-400">{title}</h2>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white transition-colors text-2xl leading-none px-2"
        >
          &times;
        </button>
      </div>
      {/* body */}
      <div className="flex-1 overflow-y-auto p-6 text-slate-200">{children}</div>
    </div>
  </div>
);

/* ── DataTable helper ──────────────────────────────────────────── */
const DataTable: React.FC<{
  headers: string[];
  rows: (string | number)[][];
}> = ({ headers, rows }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th key={i} className="px-3 py-2 text-left text-slate-400 border-b border-slate-700 bg-slate-800 sticky top-0 font-medium text-xs uppercase tracking-wider">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri} className={`${ri % 2 === 0 ? 'bg-slate-800/30' : 'bg-slate-800/60'} hover:bg-slate-700/50 transition-colors`}>
            {row.map((cell, ci) => (
              <td key={ci} className="px-3 py-1.5 border-b border-slate-700/30 text-xs">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/* ══════════════════════════════════════════════════════════════════ */
/*  M A I N   C O M P O N E N T                                     */
/* ══════════════════════════════════════════════════════════════════ */
const DashboardTab: React.FC<DashboardTabProps> = ({ cableData, nodeData }) => {
  const [activePopup, setActivePopup] = useState<PopupId>(null);
  const openPopup = useCallback((id: PopupId) => setActivePopup(id), []);
  const closePopup = useCallback(() => setActivePopup(null), []);

  const totalLength = cableData.reduce((sum, c) => sum + (c.calculatedLength || c.length || 0), 0);
  const calculatedPaths = cableData.filter(c => c.calculatedPath).length;

  /* ── Chart.js: System Distribution (Doughnut) ───────────────── */
  const systemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    cableData.forEach(c => {
      const sys = c.system || 'Unknown';
      counts[sys] = (counts[sys] || 0) + 1;
    });
    return counts;
  }, [cableData]);

  const systemChartData = useMemo(() => ({
    labels: Object.keys(systemCounts),
    datasets: [{
      data: Object.values(systemCounts),
      backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899',
        '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#e11d48'],
      borderWidth: 2,
      borderColor: '#1e293b'
    }]
  }), [systemCounts]);

  /* ── Chart.js: Type Distribution (Bar) ──────────────────────── */
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    cableData.forEach(c => {
      const t = c.type || 'Unknown';
      counts[t] = (counts[t] || 0) + 1;
    });
    return counts;
  }, [cableData]);

  const typeChartData = useMemo(() => {
    const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    return {
      labels: sorted.map(t => t[0]),
      datasets: [{
        label: 'Cable Count',
        data: sorted.map(t => t[1]),
        backgroundColor: '#3b82f6'
      }]
    };
  }, [typeCounts]);

  /* ── Chart.js: Node Connections (Bar) ───────────────────────── */
  const cableCountsByNode = useMemo(() => {
    const counts: Record<string, number> = {};
    cableData.forEach(c => {
      if (c.fromNode) counts[c.fromNode] = (counts[c.fromNode] || 0) + 1;
      if (c.toNode && c.toNode !== c.fromNode) {
        counts[c.toNode] = (counts[c.toNode] || 0) + 1;
      }
    });
    return counts;
  }, [cableData]);

  const nodeChartData = useMemo(() => {
    const topNodes = nodeData
      .map(n => ({ ...n, connectedCables: cableCountsByNode[n.name] || 0 }))
      .sort((a, b) => b.connectedCables - a.connectedCables)
      .slice(0, 10);
    return {
      labels: topNodes.map(n => n.name),
      datasets: [{
        label: 'Connected Cables',
        data: topNodes.map(n => n.connectedCables),
        backgroundColor: '#10b981'
      }]
    };
  }, [cableCountsByNode, nodeData]);

  /* ── Chart options ──────────────────────────────────────────── */
  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { color: '#334155' } },
      y: { ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { color: '#334155' } }
    }
  }), []);

  const doughnutOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } }
  }), []);

  /* ── 4. Cable Length Distribution ────────────────────────────── */
  const lengthDistribution = useMemo(() => {
    const ranges = [
      { label: '0-10m', min: 0, max: 10 },
      { label: '10-30m', min: 10, max: 30 },
      { label: '30-50m', min: 30, max: 50 },
      { label: '50-100m', min: 50, max: 100 },
      { label: '100-200m', min: 100, max: 200 },
      { label: '200m+', min: 200, max: Infinity },
    ];
    return ranges.map(r => ({
      label: r.label,
      value: cableData.filter(c => {
        const len = c.calculatedLength || c.length || 0;
        return len >= r.min && len < r.max;
      }).length,
    }));
  }, [cableData]);

  /* ── 5. Deck Distribution ────────────────────────────────────── */
  const deckDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    cableData.forEach(c => {
      const deck = c.supplyDeck || c.fromRoom?.replace(/[^A-Za-z0-9]/g, ' ').split(' ')[0] || 'Unknown';
      counts[deck] = (counts[deck] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value }));
  }, [cableData]);

  /* ── 6. OD Distribution ──────────────────────────────────────── */
  const odDistribution = useMemo(() => {
    const ranges = [
      { label: '0-10mm', min: 0, max: 10 },
      { label: '10-15mm', min: 10, max: 15 },
      { label: '15-20mm', min: 15, max: 20 },
      { label: '20-30mm', min: 20, max: 30 },
      { label: '30-50mm', min: 30, max: 50 },
      { label: '50mm+', min: 50, max: Infinity },
    ];
    return ranges.map(r => ({
      label: r.label,
      value: cableData.filter(c => {
        const od = c.od || 0;
        return od >= r.min && od < r.max;
      }).length,
    }));
  }, [cableData]);

  /* ── 7. Cable Weight Summary ─────────────────────────────────── */
  const weightSummary = useMemo(() => {
    const cablesWithWeight = cableData.filter(c => c.cableWeight && c.cableWeight > 0);
    const totalWeight = cablesWithWeight.reduce((s, c) => s + (c.cableWeight || 0), 0);
    const avgWeight = cablesWithWeight.length > 0 ? totalWeight / cablesWithWeight.length : 0;
    const maxWeightCable = cablesWithWeight.length > 0
      ? cablesWithWeight.reduce((m, c) => (c.cableWeight || 0) > (m.cableWeight || 0) ? c : m, cablesWithWeight[0])
      : null;
    return { totalWeight, avgWeight, count: cablesWithWeight.length, maxWeightCable };
  }, [cableData]);

  /* ── 8. Path Status ──────────────────────────────────────────── */
  const pathStatus = useMemo(() => {
    const withPath = cableData.filter(c => c.calculatedPath).length;
    const withNodes = cableData.filter(c => c.fromNode && c.toNode && !c.calculatedPath).length;
    const noPath = cableData.length - withPath - withNodes;
    return [
      { label: 'Path Calculated', value: withPath, color: '#10b981' },
      { label: 'Nodes Only', value: withNodes, color: '#f59e0b' },
      { label: 'No Path', value: noPath, color: '#ef4444' },
    ];
  }, [cableData]);

  /* ── 9. System x Type Matrix ─────────────────────────────────── */
  const systemTypeMatrix = useMemo(() => {
    const matrix: Record<string, Record<string, number>> = {};
    const typeCountsLocal: Record<string, number> = {};
    cableData.forEach(c => {
      const sys = c.system || 'Unknown';
      const tp = c.type || 'Unknown';
      if (!matrix[sys]) matrix[sys] = {};
      matrix[sys][tp] = (matrix[sys][tp] || 0) + 1;
      typeCountsLocal[tp] = (typeCountsLocal[tp] || 0) + 1;
    });
    const topTypes = Object.entries(typeCountsLocal)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(t => t[0]);
    const allTypes = Object.entries(typeCountsLocal)
      .sort((a, b) => b[1] - a[1])
      .map(t => t[0]);
    const systems = Object.keys(matrix).sort();
    const maxCell = Math.max(
      ...systems.flatMap(s => topTypes.map(t => matrix[s]?.[t] || 0)),
      1
    );
    return { matrix, topTypes, allTypes, systems, maxCell };
  }, [cableData]);

  /* ── 10. Cable Length Top 20 ─────────────────────────────────── */
  const allCablesByLength = useMemo(() => {
    return [...cableData]
      .map(c => ({ label: c.name || c.id, value: Math.round((c.calculatedLength || c.length || 0) * 10) / 10 }))
      .sort((a, b) => b.value - a.value);
  }, [cableData]);

  const top20Longest = useMemo(() => allCablesByLength.slice(0, 20), [allCablesByLength]);

  /* ── 11. Node Connectivity Distribution ──────────────────────── */
  const nodeConnectivity = useMemo(() => {
    const ranges = [
      { label: '1-5', min: 1, max: 6 },
      { label: '5-10', min: 5, max: 10 },
      { label: '10-20', min: 10, max: 20 },
      { label: '20-50', min: 20, max: 50 },
      { label: '50+', min: 50, max: Infinity },
    ];
    const vals = Object.values(cableCountsByNode);
    return ranges.map(r => ({
      label: r.label,
      value: vals.filter(v => v >= r.min && v < r.max).length,
    }));
  }, [cableCountsByNode]);

  /* ── 12. Quick Stats ─────────────────────────────────────────── */
  const quickStats = useMemo(() => {
    const lengths = cableData
      .map(c => c.calculatedLength || c.length || 0)
      .filter(l => l > 0)
      .sort((a, b) => a - b);
    const avg = lengths.length > 0 ? lengths.reduce((s, l) => s + l, 0) / lengths.length : 0;
    const median = lengths.length > 0
      ? lengths.length % 2 === 0
        ? (lengths[lengths.length / 2 - 1] + lengths[lengths.length / 2]) / 2
        : lengths[Math.floor(lengths.length / 2)]
      : 0;
    const maxOdCable = cableData.length > 0
      ? cableData.reduce((m, c) => (c.od || 0) > (m.od || 0) ? c : m, cableData[0])
      : null;
    const tCounts: Record<string, number> = {};
    cableData.forEach(c => { tCounts[c.type || 'Unknown'] = (tCounts[c.type || 'Unknown'] || 0) + 1; });
    const mostCommonType = Object.entries(tCounts).sort((a, b) => b[1] - a[1])[0] || ['N/A', 0];
    const sCounts: Record<string, number> = {};
    cableData.forEach(c => { sCounts[c.system || 'Unknown'] = (sCounts[c.system || 'Unknown'] || 0) + 1; });
    const mostUsedSystem = Object.entries(sCounts).sort((a, b) => b[1] - a[1])[0] || ['N/A', 0];
    const routed = cableData.filter(c => c.calculatedPath).length;
    const routingPct = cableData.length > 0 ? (routed / cableData.length) * 100 : 0;
    return { avg, median, maxOdCable, mostCommonType, mostUsedSystem, routingPct };
  }, [cableData]);

  /* ── All nodes with cable count (for modal) ─────────────────── */
  const allNodeConnections = useMemo(() => {
    return nodeData
      .map(n => ({ name: n.name, type: n.type || '-', deck: n.deck || '-', cables: cableCountsByNode[n.name] || 0 }))
      .sort((a, b) => b.cables - a.cables);
  }, [nodeData, cableCountsByNode]);

  /* ── Weight detail per cable (for modal) ────────────────────── */
  const weightDetailRows = useMemo(() => {
    return cableData
      .filter(c => c.cableWeight && c.cableWeight > 0)
      .sort((a, b) => (b.cableWeight || 0) - (a.cableWeight || 0))
      .map(c => [c.name || c.id, c.type || '-', c.system || '-', `${(c.cableWeight || 0).toFixed(2)} kg`]);
  }, [cableData]);

  /* ══════════════════════════════════════════════════════════════ */
  /*  M O D A L   C O N T E N T   R E N D E R E R                  */
  /* ══════════════════════════════════════════════════════════════ */
  const renderModalContent = () => {
    switch (activePopup) {
      case 'system': {
        const rows = Object.entries(systemCounts).sort((a, b) => b[1] - a[1])
          .map(([sys, cnt]) => [sys, cnt, `${((cnt / cableData.length) * 100).toFixed(1)}%`]);
        return (
          <>
            <div className="h-64 mb-6"><Doughnut data={systemChartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' as const, labels: { color: '#e2e8f0' } } } }} /></div>
            <DataTable headers={['System', 'Count', 'Percentage']} rows={rows} />
          </>
        );
      }
      case 'type': {
        const allTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])
          .map(([tp, cnt]) => [tp, cnt, `${((cnt / cableData.length) * 100).toFixed(1)}%`]);
        return <DataTable headers={['Type', 'Count', 'Percentage']} rows={allTypes} />;
      }
      case 'nodeConn': {
        const rows = allNodeConnections.filter(n => n.cables > 0).map(n => [n.name, n.type, n.deck, n.cables]);
        return <DataTable headers={['Node', 'Type', 'Deck', 'Connected Cables']} rows={rows} />;
      }
      case 'lengthDist': {
        const total = lengthDistribution.reduce((s, d) => s + d.value, 0);
        const rows = lengthDistribution.map(d => [d.label, d.value, `${total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%`]);
        return (
          <>
            <div className="mb-6"><HBarChart items={lengthDistribution} showPercent colorSeed={0} /></div>
            <DataTable headers={['Range', 'Count', 'Percentage']} rows={rows} />
          </>
        );
      }
      case 'odDist': {
        const total = odDistribution.reduce((s, d) => s + d.value, 0);
        const rows = odDistribution.map(d => [d.label, d.value, `${total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%`]);
        return (
          <>
            <div className="mb-6"><HBarChart items={odDistribution} showPercent colorSeed={6} /></div>
            <DataTable headers={['OD Range', 'Count', 'Percentage']} rows={rows} />
          </>
        );
      }
      case 'deckDist': {
        const total = deckDistribution.reduce((s, d) => s + d.value, 0);
        const rows = deckDistribution.map(d => [d.label, d.value, `${total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%`]);
        return (
          <>
            <div className="mb-6"><HBarChart items={deckDistribution} colorSeed={12} /></div>
            <DataTable headers={['Deck', 'Count', 'Percentage']} rows={rows} />
          </>
        );
      }
      case 'pathStatus': {
        const total = pathStatus.reduce((s, d) => s + d.value, 0);
        const rows = pathStatus.map(d => [d.label, d.value, `${total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%`]);
        return (
          <>
            <div className="flex justify-center mb-6"><SvgDonut segments={pathStatus} /></div>
            <DataTable headers={['Status', 'Count', 'Percentage']} rows={rows} />
          </>
        );
      }
      case 'weight': {
        return (
          <>
            <div className="grid grid-cols-4 gap-3 mb-6">
              <div className="bg-slate-700/50 p-3 rounded-lg text-center">
                <div className="text-xl font-bold text-orange-400">{weightSummary.totalWeight.toFixed(1)} kg</div>
                <div className="text-xs text-slate-400">Total Weight</div>
              </div>
              <div className="bg-slate-700/50 p-3 rounded-lg text-center">
                <div className="text-xl font-bold text-orange-400">{weightSummary.avgWeight.toFixed(2)} kg</div>
                <div className="text-xs text-slate-400">Avg Weight</div>
              </div>
              <div className="bg-slate-700/50 p-3 rounded-lg text-center">
                <div className="text-xl font-bold text-orange-400">{weightSummary.count}</div>
                <div className="text-xs text-slate-400">Cables w/ Weight</div>
              </div>
              <div className="bg-slate-700/50 p-3 rounded-lg text-center">
                <div className="text-xl font-bold text-orange-400">{weightSummary.maxWeightCable ? `${(weightSummary.maxWeightCable.cableWeight || 0).toFixed(1)} kg` : 'N/A'}</div>
                <div className="text-xs text-slate-400 truncate">Heaviest ({weightSummary.maxWeightCable?.name || '-'})</div>
              </div>
            </div>
            <DataTable headers={['Cable', 'Type', 'System', 'Weight']} rows={weightDetailRows} />
          </>
        );
      }
      case 'top20': {
        const rows = allCablesByLength.filter(d => d.value > 0).map((d, i) => [i + 1, d.label, `${d.value} m`]);
        return <DataTable headers={['#', 'Cable Name', 'Length']} rows={rows} />;
      }
      case 'nodeConnectivity': {
        const total = nodeConnectivity.reduce((s, d) => s + d.value, 0);
        const rows = nodeConnectivity.map(d => [d.label, d.value, `${total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%`]);
        return (
          <>
            <div className="mb-6"><HBarChart items={nodeConnectivity} showPercent colorSeed={30} /></div>
            <DataTable headers={['Connections Range', 'Node Count', 'Percentage']} rows={rows} />
          </>
        );
      }
      case 'matrix': {
        const { matrix, allTypes, systems, maxCell } = systemTypeMatrix;
        return (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="p-2 text-left text-slate-400 border-b border-slate-700 sticky left-0 bg-slate-800 z-10">System</th>
                  {allTypes.map(tp => (
                    <th key={tp} className="p-2 text-center text-slate-400 border-b border-slate-700 min-w-[56px]">
                      <span title={tp}>{tp.length > 8 ? tp.slice(0, 7) + '..' : tp}</span>
                    </th>
                  ))}
                  <th className="p-2 text-center text-slate-400 border-b border-slate-700 font-bold">Total</th>
                </tr>
              </thead>
              <tbody>
                {systems.map((sys, si) => {
                  const rowTotal = allTypes.reduce((s, tp) => s + (matrix[sys]?.[tp] || 0), 0);
                  return (
                    <tr key={sys} className={si % 2 === 0 ? 'bg-slate-800/50' : ''}>
                      <td className="p-2 text-slate-300 border-b border-slate-700/50 sticky left-0 bg-slate-800 z-10 font-medium">{sys}</td>
                      {allTypes.map(tp => {
                        const val = matrix[sys]?.[tp] || 0;
                        const intensity = val / maxCell;
                        return (
                          <td key={tp} className="p-2 text-center border-b border-slate-700/50"
                            style={{ backgroundColor: val > 0 ? `rgba(59, 130, 246, ${0.1 + intensity * 0.7})` : 'transparent' }}
                            title={`${sys} / ${tp}: ${val}`}>
                            <span className={val > 0 ? 'text-white font-semibold' : 'text-slate-600'}>{val || '-'}</span>
                          </td>
                        );
                      })}
                      <td className="p-2 text-center border-b border-slate-700/50 font-bold text-blue-400">{rowTotal}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      }
      case 'quickStats': {
        return (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-700/50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-cyan-400 mb-1">{quickStats.avg.toFixed(1)} m</div>
              <div className="text-sm text-slate-400">Average Cable Length</div>
            </div>
            <div className="bg-slate-700/50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-cyan-400 mb-1">{quickStats.median.toFixed(1)} m</div>
              <div className="text-sm text-slate-400">Median Cable Length</div>
            </div>
            <div className="bg-slate-700/50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-cyan-400 mb-1">{quickStats.maxOdCable ? `${quickStats.maxOdCable.od} mm` : 'N/A'}</div>
              <div className="text-sm text-slate-400">Max OD ({quickStats.maxOdCable?.name || '-'})</div>
            </div>
            <div className="bg-slate-700/50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-cyan-400 mb-1">{quickStats.mostCommonType[0] as string}</div>
              <div className="text-sm text-slate-400">Most Common Type ({quickStats.mostCommonType[1]} cables)</div>
            </div>
            <div className="bg-slate-700/50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-cyan-400 mb-1">{quickStats.mostUsedSystem[0] as string}</div>
              <div className="text-sm text-slate-400">Most Used System ({quickStats.mostUsedSystem[1]} cables)</div>
            </div>
            <div className="bg-slate-700/50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-emerald-400 mb-1">{quickStats.routingPct.toFixed(1)}%</div>
              <div className="text-sm text-slate-400">Routing Completion</div>
            </div>
          </div>
        );
      }
      default:
        return null;
    }
  };

  const modalTitles: Record<string, string> = {
    system: 'Cable Distribution by System',
    type: 'Cable Distribution by Type (All)',
    nodeConn: 'Top Nodes by Connection (All)',
    lengthDist: 'Cable Length Distribution',
    odDist: 'OD Distribution (All)',
    deckDist: 'Deck Distribution (All)',
    pathStatus: 'Path Status Detail',
    weight: 'Cable Weight Detail (All)',
    top20: 'Cable Length Ranking (All)',
    nodeConnectivity: 'Node Connectivity Distribution',
    matrix: 'System x Type Matrix (Full)',
    quickStats: 'Quick Statistics Detail',
  };

  /* ══════════════════════════════════════════════════════════════ */
  /*  R E N D E R                                                  */
  /* ══════════════════════════════════════════════════════════════ */
  return (
    <div className="p-4 h-full overflow-y-auto bg-slate-900 text-slate-200">
      {/* ── KPI Stats Row (4 cards) ──────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3 mb-3">
        {[
          { value: cableData.length, label: 'Total Cables', color: 'text-blue-400' },
          { value: nodeData.length, label: 'Total Nodes', color: 'text-blue-400' },
          { value: totalLength.toFixed(1), label: 'Total Length (m)', color: 'text-blue-400' },
          { value: calculatedPaths, label: 'Calculated Paths', color: 'text-blue-400' },
        ].map((kpi, i) => (
          <div key={i}
            className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-center shadow-lg
              transition-all duration-300 hover:scale-[1.03] hover:border-blue-500/40 hover:shadow-blue-500/10"
          >
            <div className={`text-2xl font-bold ${kpi.color} mb-0.5`}>{kpi.value}</div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* ── Quick Stats Row (6 small cards) ──────────────────────── */}
      <div
        className="grid grid-cols-6 gap-2 mb-3 cursor-pointer"
        onClick={() => openPopup('quickStats')}
      >
        {[
          { value: `${quickStats.avg.toFixed(1)}`, label: 'Avg Len (m)', color: 'text-cyan-400' },
          { value: `${quickStats.median.toFixed(1)}`, label: 'Median Len', color: 'text-cyan-400' },
          { value: quickStats.maxOdCable ? `${quickStats.maxOdCable.od}mm` : 'N/A', label: `Max OD`, color: 'text-cyan-400' },
          { value: `${(quickStats.mostCommonType[0] as string).slice(0, 7)}`, label: `Top Type (${quickStats.mostCommonType[1]})`, color: 'text-cyan-400' },
          { value: `${(quickStats.mostUsedSystem[0] as string).slice(0, 7)}`, label: `Top Sys (${quickStats.mostUsedSystem[1]})`, color: 'text-cyan-400' },
          { value: `${quickStats.routingPct.toFixed(1)}%`, label: 'Routing', color: 'text-emerald-400' },
        ].map((qs, i) => (
          <div key={i}
            className="bg-slate-800 p-2 rounded-lg border border-slate-700 text-center
              transition-all duration-300 hover:scale-[1.04] hover:border-cyan-500/40 hover:shadow-cyan-500/10"
          >
            <div className={`text-lg font-bold ${qs.color} mb-0 truncate`} title={String(qs.value)}>{qs.value}</div>
            <div className="text-[9px] text-slate-400 uppercase tracking-wider truncate">{qs.label}</div>
          </div>
        ))}
      </div>

      {/* ── 3-Column Chart Grid ──────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        {/* 1. System Donut */}
        <ChartCard title="System Distribution" titleColor="text-blue-400" onClick={() => openPopup('system')}>
          <div className="h-36 flex items-center justify-center">
            <SvgDonut segments={Object.entries(systemCounts).map(([label, value], i) => ({
              label, value,
              color: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899',
                '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#e11d48'][i % 12]
            }))} compact />
          </div>
        </ChartCard>

        {/* 2. Type Bar */}
        <ChartCard title="Type Distribution (Top 10)" titleColor="text-blue-400" onClick={() => openPopup('type')}>
          <div className="h-36 relative">
            <Bar data={typeChartData} options={chartOptions} />
          </div>
        </ChartCard>

        {/* 3. Node Connection */}
        <ChartCard title="Top 10 Node Connections" titleColor="text-emerald-400" onClick={() => openPopup('nodeConn')}>
          <div className="h-36 relative">
            <Bar data={nodeChartData} options={{ ...chartOptions, indexAxis: 'y' as const }} />
          </div>
        </ChartCard>

        {/* 4. Length Distribution */}
        <ChartCard title="Length Distribution" titleColor="text-emerald-400" onClick={() => openPopup('lengthDist')}>
          <div className="h-36 overflow-hidden">
            <HBarChart items={lengthDistribution} colorSeed={0} showPercent compact />
          </div>
        </ChartCard>

        {/* 5. OD Distribution */}
        <ChartCard title="OD Distribution" titleColor="text-amber-400" onClick={() => openPopup('odDist')}>
          <div className="h-36 overflow-hidden">
            <HBarChart items={odDistribution} colorSeed={6} showPercent compact />
          </div>
        </ChartCard>

        {/* 6. Deck Distribution */}
        <ChartCard title="Deck Distribution" titleColor="text-violet-400" onClick={() => openPopup('deckDist')}>
          <div className="h-36 overflow-hidden">
            {deckDistribution.length > 0
              ? <HBarChart items={deckDistribution.slice(0, 8)} colorSeed={12} compact />
              : <p className="text-slate-500 text-sm">No deck data</p>}
          </div>
        </ChartCard>

        {/* 7. Path Status */}
        <ChartCard title="Path Status" titleColor="text-rose-400" onClick={() => openPopup('pathStatus')}>
          <div className="h-36 flex items-center justify-center">
            <SvgDonut segments={pathStatus} compact />
          </div>
        </ChartCard>

        {/* 8. Weight Summary */}
        <ChartCard title="Weight Summary" titleColor="text-orange-400" onClick={() => openPopup('weight')}>
          <div className="h-36 grid grid-cols-2 gap-2 content-center">
            <div className="bg-slate-700/40 p-2 rounded-lg text-center">
              <div className="text-base font-bold text-orange-400">{weightSummary.totalWeight.toFixed(1)}</div>
              <div className="text-[9px] text-slate-400">Total (kg)</div>
            </div>
            <div className="bg-slate-700/40 p-2 rounded-lg text-center">
              <div className="text-base font-bold text-orange-400">{weightSummary.avgWeight.toFixed(2)}</div>
              <div className="text-[9px] text-slate-400">Avg (kg)</div>
            </div>
            <div className="bg-slate-700/40 p-2 rounded-lg text-center">
              <div className="text-base font-bold text-orange-400">{weightSummary.count}</div>
              <div className="text-[9px] text-slate-400">w/ Weight</div>
            </div>
            <div className="bg-slate-700/40 p-2 rounded-lg text-center">
              <div className="text-base font-bold text-orange-400 truncate">
                {weightSummary.maxWeightCable ? `${(weightSummary.maxWeightCable.cableWeight || 0).toFixed(1)}` : 'N/A'}
              </div>
              <div className="text-[9px] text-slate-400 truncate">Max (kg)</div>
            </div>
          </div>
        </ChartCard>

        {/* 9. Top 20 Longest */}
        <ChartCard title="Top 20 Longest Cables" titleColor="text-sky-400" onClick={() => openPopup('top20')}>
          <div className="h-36 overflow-hidden">
            {top20Longest.length > 0
              ? <HBarChart items={top20Longest.slice(0, 10)} barHeight={12} gap={2} colorSeed={20} compact />
              : <p className="text-slate-500 text-sm">No data</p>}
          </div>
        </ChartCard>

        {/* 10. Node Connectivity */}
        <ChartCard title="Node Connectivity" titleColor="text-teal-400" onClick={() => openPopup('nodeConnectivity')}>
          <div className="h-36 overflow-hidden">
            <HBarChart items={nodeConnectivity} colorSeed={30} showPercent compact />
          </div>
        </ChartCard>

        {/* 11. System x Type Matrix */}
        <ChartCard title="System x Type Matrix" titleColor="text-pink-400" onClick={() => openPopup('matrix')}
          className="col-span-2">
          <div className="h-36 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] border-collapse">
                <thead>
                  <tr>
                    <th className="p-1 text-left text-slate-400 border-b border-slate-700">Sys</th>
                    {systemTypeMatrix.topTypes.map(tp => (
                      <th key={tp} className="p-1 text-center text-slate-400 border-b border-slate-700 min-w-[40px]">
                        <span title={tp}>{tp.length > 6 ? tp.slice(0, 5) + '..' : tp}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {systemTypeMatrix.systems.slice(0, 8).map((sys, si) => (
                    <tr key={sys} className={si % 2 === 0 ? 'bg-slate-800/50' : ''}>
                      <td className="p-1 text-slate-300 border-b border-slate-700/50 font-medium whitespace-nowrap">
                        {sys.length > 8 ? sys.slice(0, 7) + '..' : sys}
                      </td>
                      {systemTypeMatrix.topTypes.map(tp => {
                        const val = systemTypeMatrix.matrix[sys]?.[tp] || 0;
                        const intensity = val / systemTypeMatrix.maxCell;
                        return (
                          <td key={tp}
                            className="p-1 text-center border-b border-slate-700/50"
                            style={{ backgroundColor: val > 0 ? `rgba(59,130,246,${0.1 + intensity * 0.7})` : 'transparent' }}
                            title={`${sys}/${tp}: ${val}`}>
                            <span className={val > 0 ? 'text-white font-semibold' : 'text-slate-600'}>{val || '-'}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </ChartCard>
      </div>

      {/* ── Modal Popup ──────────────────────────────────────────── */}
      {activePopup && (
        <Modal
          title={modalTitles[activePopup] || ''}
          onClose={closePopup}
        >
          {renderModalContent()}
        </Modal>
      )}
    </div>
  );
};

export default DashboardTab;
