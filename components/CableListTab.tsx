import React, { useState, useMemo } from 'react';
import { CableData } from '../types';
import { Search, Download, Play, Save, X } from 'lucide-react';

interface CableListTabProps {
  cableData: CableData[];
  onCalculateAllPaths: () => void;
  onExportCableList: () => void;
  onCableEdit: (index: number, updated: Partial<CableData>) => void;
  onRouteSingle: (index: number) => void;
}

interface EditState {
  name: string;
  type: string;
  fromNode: string;
  toNode: string;
  checkNode: string;
}

const CableListTab: React.FC<CableListTabProps> = ({
  cableData,
  onCalculateAllPaths,
  onExportCableList,
  onCableEdit,
  onRouteSingle,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [systemFilter, setSystemFilter] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({
    name: '',
    type: '',
    fromNode: '',
    toNode: '',
    checkNode: '',
  });

  const systems = useMemo(() => {
    return Array.from(new Set(cableData.map(c => c.system).filter(Boolean))).sort();
  }, [cableData]);

  const filteredCables = useMemo(() => {
    return cableData
      .map((c, originalIndex) => ({ cable: c, originalIndex }))
      .filter(({ cable }) => {
        const matchesSearch =
          cable.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          cable.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (cable.system || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesSystem = systemFilter ? cable.system === systemFilter : true;
        return matchesSearch && matchesSystem;
      });
  }, [cableData, searchTerm, systemFilter]);

  const handleEditClick = (cable: CableData) => {
    setEditingId(cable.id);
    setEditState({
      name: cable.name || '',
      type: cable.type || '',
      fromNode: cable.fromNode || '',
      toNode: cable.toNode || '',
      checkNode: cable.checkNode || '',
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleSaveEdit = (originalIndex: number) => {
    onCableEdit(originalIndex, {
      name: editState.name,
      type: editState.type,
      fromNode: editState.fromNode,
      toNode: editState.toNode,
      checkNode: editState.checkNode,
    });
    setEditingId(null);
  };

  const inputCls =
    'w-full px-1.5 py-0.5 bg-slate-900 border border-amber-500 rounded text-[10px] text-slate-100 focus:outline-none focus:border-amber-300 min-w-[60px]';

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200">
      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-slate-800 flex gap-3 items-center justify-between bg-slate-800">
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
            {systems.map(sys => (
              <option key={sys} value={sys}>
                {sys}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-slate-500 font-bold">
            {filteredCables.length} / {cableData.length}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse" style={{ fontSize: '11px' }}>
          <thead
            className="bg-slate-950 text-slate-400 uppercase sticky top-0 z-10"
            style={{ fontSize: '10px' }}
          >
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
              <th
                className="px-2 py-2 font-bold border-b-2 border-slate-700 whitespace-nowrap"
                style={{ minWidth: '250px' }}
              >
                PATH (COMMA)
              </th>
              <th className="px-2 py-2 font-bold border-b-2 border-slate-700 whitespace-nowrap">DIA</th>
              <th className="px-2 py-2 font-bold border-b-2 border-slate-700 whitespace-nowrap">CHECK</th>
              <th className="px-2 py-2 font-bold border-b-2 border-slate-700 whitespace-nowrap">DECK</th>
              <th className="px-2 py-2 font-bold border-b-2 border-slate-700 whitespace-nowrap">WGT</th>
              <th className="px-2 py-2 font-bold border-b-2 border-slate-700 whitespace-nowrap">REMARK</th>
              <th className="px-2 py-2 font-bold border-b-2 border-slate-700 whitespace-nowrap">REV</th>
              <th
                className="px-2 py-2 font-bold border-b-2 border-slate-700 whitespace-nowrap sticky right-0 bg-slate-950 z-20"
                style={{ minWidth: '110px' }}
              >
                ACTIONS
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {filteredCables.map(({ cable, originalIndex }) => {
              const isEditing = editingId === cable.id;
              const rowBg = isEditing
                ? 'bg-amber-950/40 hover:bg-amber-950/60'
                : 'hover:bg-slate-800/40';

              return (
                <tr key={cable.id} className={`transition-colors ${rowBg}`}>
                  {/* SYS */}
                  <td className="px-2 py-1.5 whitespace-nowrap">{cable.system || '-'}</td>
                  {/* PG */}
                  <td className="px-2 py-1.5 whitespace-nowrap">{cable.wdPage || '-'}</td>
                  {/* NAME */}
                  <td className="px-2 py-1.5 whitespace-nowrap font-medium text-blue-400">
                    {isEditing ? (
                      <input
                        className={inputCls}
                        value={editState.name}
                        onChange={e => setEditState(s => ({ ...s, name: e.target.value }))}
                      />
                    ) : (
                      cable.name
                    )}
                  </td>
                  {/* TYPE */}
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {isEditing ? (
                      <input
                        className={inputCls}
                        value={editState.type}
                        onChange={e => setEditState(s => ({ ...s, type: e.target.value }))}
                      />
                    ) : (
                      cable.type
                    )}
                  </td>
                  {/* F_ROOM */}
                  <td className="px-2 py-1.5 whitespace-nowrap">{cable.fromRoom || '-'}</td>
                  {/* F_EQUIP */}
                  <td className="px-2 py-1.5 whitespace-nowrap">{cable.fromEquip || '-'}</td>
                  {/* F_NODE */}
                  <td className="px-2 py-1.5 whitespace-nowrap text-emerald-400">
                    {isEditing ? (
                      <input
                        className={inputCls}
                        value={editState.fromNode}
                        onChange={e => setEditState(s => ({ ...s, fromNode: e.target.value }))}
                      />
                    ) : (
                      cable.fromNode || '-'
                    )}
                  </td>
                  {/* F_R */}
                  <td className="px-2 py-1.5 whitespace-nowrap">{cable.fromRest || '-'}</td>
                  {/* T_ROOM */}
                  <td className="px-2 py-1.5 whitespace-nowrap">{cable.toRoom || '-'}</td>
                  {/* T_EQUIP */}
                  <td className="px-2 py-1.5 whitespace-nowrap">{cable.toEquip || '-'}</td>
                  {/* T_NODE */}
                  <td className="px-2 py-1.5 whitespace-nowrap text-rose-400">
                    {isEditing ? (
                      <input
                        className={inputCls}
                        value={editState.toNode}
                        onChange={e => setEditState(s => ({ ...s, toNode: e.target.value }))}
                      />
                    ) : (
                      cable.toNode || '-'
                    )}
                  </td>
                  {/* T_R */}
                  <td className="px-2 py-1.5 whitespace-nowrap">{cable.toRest || '-'}</td>
                  {/* LEN */}
                  <td className="px-2 py-1.5 whitespace-nowrap font-mono text-emerald-400 font-bold">
                    {(cable.calculatedLength || cable.length || 0).toFixed(1)}
                  </td>
                  {/* PATH */}
                  <td
                    className="px-2 py-1.5 text-slate-400 break-all"
                    style={{ minWidth: '250px' }}
                  >
                    {cable.calculatedPath || cable.path || '-'}
                  </td>
                  {/* DIA */}
                  <td className="px-2 py-1.5 whitespace-nowrap">{cable.od || '-'}</td>
                  {/* CHECK / VIA */}
                  <td className="px-2 py-1.5 whitespace-nowrap text-amber-400">
                    {isEditing ? (
                      <input
                        className={inputCls}
                        value={editState.checkNode}
                        placeholder="comma sep"
                        onChange={e => setEditState(s => ({ ...s, checkNode: e.target.value }))}
                      />
                    ) : (
                      cable.checkNode || '-'
                    )}
                  </td>
                  {/* DECK */}
                  <td className="px-2 py-1.5 whitespace-nowrap">{cable.supplyDeck || '-'}</td>
                  {/* WGT */}
                  <td className="px-2 py-1.5 whitespace-nowrap">{cable.porWeight || '-'}</td>
                  {/* REMARK */}
                  <td className="px-2 py-1.5 whitespace-nowrap">{cable.remark || '-'}</td>
                  {/* REV */}
                  <td className="px-2 py-1.5 whitespace-nowrap">{cable.revision || '-'}</td>
                  {/* ACTIONS — sticky right */}
                  <td
                    className={`px-2 py-1.5 whitespace-nowrap sticky right-0 z-10 ${
                      isEditing ? 'bg-amber-950/60' : 'bg-slate-900 group-hover:bg-slate-800'
                    }`}
                    style={{ boxShadow: '-2px 0 6px rgba(0,0,0,0.4)' }}
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleSaveEdit(originalIndex)}
                          className="flex items-center gap-0.5 bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded text-[9px] font-bold transition-colors"
                          title="Save changes"
                        >
                          <Save size={10} /> SAVE
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="flex items-center gap-0.5 bg-slate-600 hover:bg-slate-500 text-white px-1.5 py-1 rounded text-[9px] font-bold transition-colors"
                          title="Cancel"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEditClick(cable)}
                          className="flex items-center gap-0.5 bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded text-[9px] font-bold transition-colors"
                          title="Edit this cable"
                        >
                          EDIT
                        </button>
                        <button
                          onClick={() => onRouteSingle(originalIndex)}
                          className="flex items-center gap-0.5 bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded text-[9px] font-bold transition-colors"
                          title="Recalculate path for this cable"
                        >
                          ROUTE
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredCables.length === 0 && (
              <tr>
                <td
                  colSpan={21}
                  className="px-4 py-8 text-center text-slate-500 italic"
                >
                  No cables found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CableListTab;
