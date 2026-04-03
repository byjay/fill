import React from 'react';
import { MousePointer, Plus, Link2, Trash2, Copy, Maximize2, Lock } from 'lucide-react';

export type EditorMode = 'select' | 'place' | 'connect';
export type AxisLock = 'none' | 'x' | 'y' | 'z';
export type ViewMode = 'plan' | 'section' | 'elevation' | 'iso';

interface Props {
  mode: EditorMode;
  onModeChange: (m: EditorMode) => void;
  axisLock: AxisLock;
  onAxisLockChange: (l: AxisLock) => void;
  activeDeck: string;
  onDeckChange: (d: string) => void;
  availableDecks: string[];
  selectedCount: number;
  totalNodes: number;
  newNodeName: string;
  onNewNodeNameChange: (n: string) => void;
  onDeleteSelected: () => void;
  onCopySelected: () => void;
  onFitView: () => void;
  viewMode: ViewMode;
  onViewModeChange: (v: ViewMode) => void;
}

const modeBtn = (active: boolean, onClick: () => void, icon: React.ReactNode, label: string) => (
  <button onClick={onClick}
    className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-colors ${
      active ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
    }`}
  >{icon} {label}</button>
);

const axisBtn = (lock: AxisLock, axis: AxisLock, onClick: () => void, color: string) => (
  <button onClick={onClick}
    className={`w-6 h-6 rounded text-[9px] font-black transition-colors ${
      lock === axis ? `${color} text-white` : 'bg-slate-800 text-slate-500 hover:text-white'
    }`}
  >{axis === 'none' ? 'F' : axis.toUpperCase()}</button>
);

export default function NodeEditorToolbar(props: Props) {
  const {
    mode, onModeChange, axisLock, onAxisLockChange,
    activeDeck, onDeckChange, availableDecks,
    selectedCount, totalNodes, newNodeName, onNewNodeNameChange,
    onDeleteSelected, onCopySelected, onFitView,
    viewMode, onViewModeChange,
  } = props;

  return (
    <div className="shrink-0 flex items-center gap-1.5 px-2 py-1.5 bg-slate-900 border-b border-slate-800 overflow-x-auto text-nowrap">
      {/* 뷰 전환 */}
      <div className="flex items-center gap-0.5 bg-slate-800 rounded p-0.5">
        {(['plan', 'section', 'elevation', 'iso'] as ViewMode[]).map(v => (
          <button key={v} onClick={() => onViewModeChange(v)}
            disabled={v !== 'plan'}
            className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase transition-colors ${
              viewMode === v ? 'bg-cyan-600 text-white' : v === 'plan' ? 'text-slate-400 hover:text-white' : 'text-slate-600 cursor-not-allowed'
            }`}
          >{v === 'plan' ? 'Plan' : v === 'section' ? 'Sect' : v === 'elevation' ? 'Elev' : 'ISO'}</button>
        ))}
      </div>

      <div className="w-px h-5 bg-slate-700" />

      {/* 모드 */}
      {modeBtn(mode === 'select', () => onModeChange('select'), <MousePointer size={10} />, 'Select')}
      {modeBtn(mode === 'place', () => onModeChange('place'), <Plus size={10} />, 'Place')}
      {modeBtn(mode === 'connect', () => onModeChange('connect'), <Link2 size={10} />, 'Connect')}

      <div className="w-px h-5 bg-slate-700" />

      {/* 축 락 */}
      <div className="flex items-center gap-0.5">
        <Lock size={9} className="text-slate-600 mr-0.5" />
        {axisBtn(axisLock, 'none', () => onAxisLockChange('none'), 'bg-slate-600')}
        {axisBtn(axisLock, 'x', () => onAxisLockChange('x'), 'bg-red-600')}
        {axisBtn(axisLock, 'y', () => onAxisLockChange('y'), 'bg-green-600')}
        {axisBtn(axisLock, 'z', () => onAxisLockChange('z'), 'bg-blue-600')}
      </div>

      <div className="w-px h-5 bg-slate-700" />

      {/* Deck 필터 */}
      <select value={activeDeck} onChange={e => onDeckChange(e.target.value)}
        className="bg-slate-800 border border-slate-700 text-[10px] text-slate-300 rounded px-1.5 py-1 focus:outline-none">
        {availableDecks.map(d => <option key={d} value={d}>{d === 'all' ? 'All Decks' : d}</option>)}
      </select>

      {/* Place 모드: 노드 이름 */}
      {mode === 'place' && (
        <input value={newNodeName} onChange={e => onNewNodeNameChange(e.target.value)}
          placeholder="노드명 (자동)"
          className="w-20 bg-slate-800 border border-slate-700 text-[10px] text-white rounded px-1.5 py-1 focus:outline-none focus:border-cyan-500" />
      )}

      <div className="flex-1" />

      {/* 통계 */}
      <span className="text-[9px] text-slate-500 font-mono">
        {selectedCount > 0 ? <span className="text-amber-400">{selectedCount} sel</span> : <span>{totalNodes} nodes</span>}
      </span>

      <div className="w-px h-5 bg-slate-700" />

      {/* 액션 */}
      <button onClick={onDeleteSelected} disabled={selectedCount === 0}
        className="p-1 text-slate-500 hover:text-red-400 disabled:opacity-30 rounded transition-colors"><Trash2 size={12} /></button>
      <button onClick={onCopySelected} disabled={selectedCount === 0}
        className="p-1 text-slate-500 hover:text-blue-400 disabled:opacity-30 rounded transition-colors"><Copy size={12} /></button>
      <button onClick={onFitView}
        className="p-1 text-slate-500 hover:text-white rounded transition-colors"><Maximize2 size={12} /></button>
    </div>
  );
}
