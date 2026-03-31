import React, { useState, useMemo } from 'react';
import { NodeData, CableData } from '../types';
import { Search, Download } from 'lucide-react';

interface NodeInfoTabProps {
  nodeData: NodeData[];
  cableData: CableData[];
  onExportNodeInfo: () => void;
}

const NodeInfoTab: React.FC<NodeInfoTabProps> = ({ nodeData, cableData, onExportNodeInfo }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const enrichedNodeData = useMemo(() => {
    const cableCounts: Record<string, number> = {};
    cableData.forEach(c => {
      if (c.fromNode) cableCounts[c.fromNode] = (cableCounts[c.fromNode] || 0) + 1;
      if (c.toNode && c.toNode !== c.fromNode) {
        cableCounts[c.toNode] = (cableCounts[c.toNode] || 0) + 1;
      }
    });

    return nodeData.map(n => ({
      ...n,
      connectedCables: cableCounts[n.name] || 0
    })).filter(n => 
      n.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (n.structure || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (n.type || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [nodeData, cableData, searchTerm]);

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200">
      <div className="p-4 border-b border-slate-800 flex flex-wrap gap-4 items-center justify-between bg-slate-800">
        <button onClick={onExportNodeInfo} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-lg">
          <Download size={16}/> Export Node Info
        </button>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search nodes..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500 text-slate-200 w-64"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-xl">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-400 uppercase text-xs sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 font-bold border-b border-slate-700">Node Name</th>
                <th className="px-4 py-3 font-bold border-b border-slate-700">Structure</th>
                <th className="px-4 py-3 font-bold border-b border-slate-700">Type</th>
                <th className="px-4 py-3 font-bold border-b border-slate-700">Relation</th>
                <th className="px-4 py-3 font-bold border-b border-slate-700">Link Length (m)</th>
                <th className="px-4 py-3 font-bold border-b border-slate-700">Area Size (mm²)</th>
                <th className="px-4 py-3 font-bold border-b border-slate-700">Connected Cables</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {enrichedNodeData.map(node => (
                <tr key={node.name} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-blue-400">{node.name}</td>
                  <td className="px-4 py-3">{node.structure || '-'}</td>
                  <td className="px-4 py-3">{node.type || '-'}</td>
                  <td className="px-4 py-3 max-w-xs truncate text-slate-400" title={node.relation || '-'}>
                    {node.relation || '-'}
                  </td>
                  <td className="px-4 py-3 font-mono">{(node.linkLength || 0).toFixed(1)}</td>
                  <td className="px-4 py-3 font-mono">{(node.areaSize || 0).toFixed(0)}</td>
                  <td className="px-4 py-3 font-bold text-emerald-400">{node.connectedCables}</td>
                </tr>
              ))}
              {enrichedNodeData.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500 italic">No nodes found matching criteria</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default NodeInfoTab;
