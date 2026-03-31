import React, { useState } from 'react';
import { CableData } from '../types';
import { Save, RefreshCw, CheckSquare, Square } from 'lucide-react';

interface RoutingTabProps {
  cableData: CableData[];
  onUpdateCheckNode: (index: number, checkNode: string) => void;
  onRecalculateSelected: (indices: number[]) => void;
}

const RoutingTab: React.FC<RoutingTabProps> = ({ cableData, onUpdateCheckNode, onRecalculateSelected }) => {
  const [selectedCableIndex, setSelectedCableIndex] = useState<number | ''>('');
  const [checkNodeInput, setCheckNodeInput] = useState('');
  const [selectedRoutes, setSelectedRoutes] = useState<Set<number>>(new Set());

  const handleSelectCable = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = parseInt(e.target.value);
    if (isNaN(idx)) {
      setSelectedCableIndex('');
      setCheckNodeInput('');
      return;
    }
    setSelectedCableIndex(idx);
    setCheckNodeInput(cableData[idx].checkNode || '');
  };

  const handleSaveCheckNode = () => {
    if (typeof selectedCableIndex === 'number') {
      onUpdateCheckNode(selectedCableIndex, checkNodeInput);
    }
  };

  const toggleRouteSelection = (index: number) => {
    const newSet = new Set(selectedRoutes);
    if (newSet.has(index)) newSet.delete(index);
    else newSet.add(index);
    setSelectedRoutes(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedRoutes.size === cableData.length) {
      setSelectedRoutes(new Set());
    } else {
      setSelectedRoutes(new Set(cableData.map((_, i) => i)));
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200">
      <div className="p-4 border-b border-slate-800 flex flex-col gap-4 bg-slate-800">
        <div className="flex flex-wrap gap-4 items-center">
          <select 
            value={selectedCableIndex} 
            onChange={handleSelectCable}
            className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500 text-slate-200 w-64"
          >
            <option value="">Select Cable</option>
            {cableData.map((c, i) => (
              <option key={c.id} value={i}>{c.name} ({c.fromNode} → {c.toNode})</option>
            ))}
          </select>
          <input 
            type="text" 
            placeholder="CHECK_NODE (comma separated)" 
            value={checkNodeInput}
            onChange={e => setCheckNodeInput(e.target.value)}
            className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500 text-slate-200 w-64"
          />
          <button onClick={handleSaveCheckNode} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-lg">
            <Save size={16}/> Save Check Node
          </button>
          <button onClick={() => onRecalculateSelected(Array.from(selectedRoutes))} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-lg">
            <RefreshCw size={16}/> Recalculate Selected
          </button>
        </div>
        <div className="flex gap-4">
          <button onClick={toggleSelectAll} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm font-medium transition-colors">
            {selectedRoutes.size === cableData.length && cableData.length > 0 ? <CheckSquare size={16}/> : <Square size={16}/>}
            {selectedRoutes.size === cableData.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-xl">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-400 uppercase text-xs sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 font-bold border-b border-slate-700 w-12 text-center">
                  <input type="checkbox" checked={selectedRoutes.size === cableData.length && cableData.length > 0} onChange={toggleSelectAll} className="accent-blue-500" />
                </th>
                <th className="px-4 py-3 font-bold border-b border-slate-700">Cable Name</th>
                <th className="px-4 py-3 font-bold border-b border-slate-700">Path (From → To)</th>
                <th className="px-4 py-3 font-bold border-b border-slate-700">Length (m)</th>
                <th className="px-4 py-3 font-bold border-b border-slate-700">Check Node</th>
                <th className="px-4 py-3 font-bold border-b border-slate-700">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {cableData.map((cable, index) => (
                <tr key={cable.id} className="hover:bg-slate-700/30 transition-colors cursor-pointer" onClick={() => toggleRouteSelection(index)}>
                  <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedRoutes.has(index)} onChange={() => toggleRouteSelection(index)} className="accent-blue-500" />
                  </td>
                  <td className="px-4 py-3 font-medium text-blue-400">{cable.name}</td>
                  <td className="px-4 py-3 text-slate-300">{cable.fromNode} → {cable.toNode}</td>
                  <td className="px-4 py-3 font-mono">{(cable.calculatedLength || cable.length || 0).toFixed(1)}</td>
                  <td className="px-4 py-3 text-amber-400">{cable.checkNode || '-'}</td>
                  <td className="px-4 py-3">
                    {cable.calculatedPath ? <span className="text-emerald-400 flex items-center gap-1"><CheckSquare size={14}/> Calculated</span> : <span className="text-slate-500">-</span>}
                  </td>
                </tr>
              ))}
              {cableData.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500 italic">No cables loaded</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default RoutingTab;
