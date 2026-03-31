import React, { useMemo } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { CableData, NodeData } from '../types';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

interface DashboardTabProps {
  cableData: CableData[];
  nodeData: NodeData[];
}

const DashboardTab: React.FC<DashboardTabProps> = ({ cableData, nodeData }) => {
  const totalLength = cableData.reduce((sum, c) => sum + (c.calculatedLength || c.length || 0), 0);
  const calculatedPaths = cableData.filter(c => c.calculatedPath).length;

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
        backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'],
        borderWidth: 2,
        borderColor: '#1e293b'
      }]
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
      labels: sorted.map(t => t[0]),
      datasets: [{
        label: 'Cable Count',
        data: sorted.map(t => t[1]),
        backgroundColor: '#3b82f6'
      }]
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
      .map(n => ({ ...n, connectedCables: cableCounts[n.name] || 0 }))
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
  }, [cableData, nodeData]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#e2e8f0' } } },
    scales: {
      x: { ticks: { color: '#e2e8f0' }, grid: { color: '#334155' } },
      y: { ticks: { color: '#e2e8f0' }, grid: { color: '#334155' } }
    }
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' as const, labels: { color: '#e2e8f0' } } }
  };

  return (
    <div className="p-6 h-full overflow-y-auto bg-slate-900 text-slate-200">
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 text-center shadow-lg">
          <div className="text-3xl font-bold text-blue-400 mb-1">{cableData.length}</div>
          <div className="text-xs text-slate-400 uppercase tracking-wider">Total Cables</div>
        </div>
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 text-center shadow-lg">
          <div className="text-3xl font-bold text-blue-400 mb-1">{nodeData.length}</div>
          <div className="text-xs text-slate-400 uppercase tracking-wider">Total Nodes</div>
        </div>
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 text-center shadow-lg">
          <div className="text-3xl font-bold text-blue-400 mb-1">{totalLength.toFixed(1)}</div>
          <div className="text-xs text-slate-400 uppercase tracking-wider">Total Length (m)</div>
        </div>
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 text-center shadow-lg">
          <div className="text-3xl font-bold text-blue-400 mb-1">{calculatedPaths}</div>
          <div className="text-xs text-slate-400 uppercase tracking-wider">Calculated Paths</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-lg flex flex-col h-80">
          <h3 className="text-sm font-bold text-blue-400 mb-4">Cable Distribution by System</h3>
          <div className="flex-1 relative">
            <Doughnut data={systemChartData} options={doughnutOptions} />
          </div>
        </div>
        <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-lg flex flex-col h-80">
          <h3 className="text-sm font-bold text-blue-400 mb-4">Cable Distribution by Type</h3>
          <div className="flex-1 relative">
            <Bar data={typeChartData} options={chartOptions} />
          </div>
        </div>
      </div>

      <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-lg flex flex-col h-80">
        <h3 className="text-sm font-bold text-blue-400 mb-4">Top 10 Nodes by Connection</h3>
        <div className="flex-1 relative">
          <Bar data={nodeChartData} options={{ ...chartOptions, indexAxis: 'y' }} />
        </div>
      </div>
    </div>
  );
};

export default DashboardTab;
