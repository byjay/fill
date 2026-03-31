import React, { useState, useMemo } from 'react';
import { CableData } from '../types';
import { Search, Download, Play } from 'lucide-react';

interface CableListTabProps {
  cableData: CableData[];
  onCalculateAllPaths: () => void;
  onExportCableList: () => void;
}

const CableListTab: React.FC<CableListTabProps> = ({ cableData, onCalculateAllPaths, onExportCableList }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [systemFilter, setSystemFilter] = useState('');

  const systems = useMemo(() => {
    return Array.from(new Set(cableData.map(c => c.system).filter(Boolean))).sort();
  }, [cableData]);

  const filteredCables = useMemo(() => {
    return cableData.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            c.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (c.system || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSystem = systemFilter ? c.system === systemFilter : true;
      return matchesSearch && matchesSystem;
    });
  }, [cableData, searchTerm, systemFilter]);

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200">
      <div className="px-3 py-2 border-b border-slate-800 flex gap-3 items-center justify-between bg-slate-800">
        <div className="flex items-center gap-2">
          <button onClick={onCalculateAllPaths} className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-[10px] font-bold transition-colors">
            <Play size={12}/> ROUTE ALL
          </button>
          <button onClick={onExportCableList} className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded text-[10px] font-bold transition-colors">
            <Download size={12}/> CSV
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
            {systems.map(sys => (
              <option key={sys} value={sys}>{sys}</option>
            ))}
          </select>
          <span className="text-[10px] text-slate-500 font-bold">{filteredCables.length} / {cableData.length}</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse" style={{ fontSize: '11px' }}>
          <thead className="bg-slate-950 text-slate-400 uppercase sticky top-0 z-10" style={{ fontSize: '10px' }}>
            <tr>
              <th className="px-2 py-2 font-bold border-b-2 border-slate-700 whitespace-nowrap">SYS</th>
              <th className="px-2 py-2 font-bold border-b-2 border-slate-700 whitespace-nowrap">PG</th>
              <th className="px-2 py-2 font-bold border-b-2 border-slate-700 whitespace-nowrap">NAME</th>
              <th className="px-2 py-2 font-bold border-b-2 border-slate-700 whitespace-nowrap">TYPE</th>
              <th className="px-2 py-2 font-bold border-b-2 border-slate-700 whitespace-nowrap">F_ROOM</th>
              <th className="px-2 py-2 font-bold border-b-2 border-slate-700 whitespace-nowrap">F_EQUIP</th>
              <th className="px-2 py-2 font-bold border-b-2 border-slate-700 whitespace-nowrap">F_NODE</th>
              <th className="px-2 py-2 font-bold border-b-2 border-slate-700 whitespace-nowrap">F_R</th>
              <th className="px-2 py-2 font-bold border-b-2 border-slate-700 whitespace-nowrap">T_ROOM</th>
              <th className="px-2 py-2 font-bold border-b-2 border-slate-700 whitespace-nowrap">T_EQUIP</th>
              <th className="px-2 py-2 font-bold border-b-2 border-slate-700 whitespace-nowrap">T_NODE</th>
              <th className="px-2 py-2 font-bold border-b-2 border-slate-700 whitespace-nowrap">T_R</th>
              <th className="px-2 py-2 font-bold border-b-2 border-slate-700 whitespace-nowrap">LEN</th>
              <th className="px-2 py-2 font-bold border-b-2 border-slate-700 whitespace-nowrap" style={{ minWidth: '250px' }}>PATH (COMMA)</th>
              <th className="px-2 py-2 font-bold border-b-2 border-slate-700 whitespace-nowrap">DIA</th>
              <th className="px-2 py-2 font-bold border-b-2 border-slate-700 whitespace-nowrap">CHECK</th>
              <th className="px-2 py-2 font-bold border-b-2 border-slate-700 whitespace-nowrap">DECK</th>
              <th className="px-2 py-2 font-bold border-b-2 border-slate-700 whitespace-nowrap">WGT</th>
              <th className="px-2 py-2 font-bold border-b-2 border-slate-700 whitespace-nowrap">REMARK</th>
              <th className="px-2 py-2 font-bold border-b-2 border-slate-700 whitespace-nowrap">REV</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {filteredCables.map(cable => (
              <tr key={cable.id} className="hover:bg-slate-800/40 transition-colors">
                <td className="px-2 py-1.5 whitespace-nowrap">{cable.system || '-'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{cable.wdPage || '-'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap font-medium text-blue-400">{cable.name}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{cable.type}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{cable.fromRoom || '-'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{cable.fromEquip || '-'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap text-emerald-400">{cable.fromNode || '-'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{cable.fromRest || '-'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{cable.toRoom || '-'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{cable.toEquip || '-'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap text-rose-400">{cable.toNode || '-'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{cable.toRest || '-'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap font-mono text-emerald-400 font-bold">{(cable.calculatedLength || cable.length || 0).toFixed(1)}</td>
                <td className="px-2 py-1.5 text-slate-400 break-all" style={{ minWidth: '250px' }}>{cable.calculatedPath || cable.path || '-'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{cable.od || '-'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap text-amber-400">{cable.checkNode || '-'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{cable.supplyDeck || '-'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{cable.porWeight || '-'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{cable.remark || '-'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{cable.revision || '-'}</td>
              </tr>
            ))}
            {filteredCables.length === 0 && (
              <tr>
                <td colSpan={20} className="px-4 py-8 text-center text-slate-500 italic">No cables found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CableListTab;
