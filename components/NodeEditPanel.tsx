import React, { useState, useEffect } from 'react';
import { NodeData } from '../types';
import { ChevronUp, ChevronDown, Save, X } from 'lucide-react';

interface Props {
  node: NodeData | null;
  onSave: (nodeName: string, updated: Partial<NodeData>) => void;
  onClose: () => void;
  onRename: (oldName: string, newName: string) => void;
  connectedCableCount: number;
  connections: string[];
}

export default function NodeEditPanel({ node, onSave, onClose, onRename, connectedCableCount, connections }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [editName, setEditName] = useState('');
  const [editDeck, setEditDeck] = useState('');
  const [editStructure, setEditStructure] = useState('');
  const [editType, setEditType] = useState('');
  const [editComponent, setEditComponent] = useState('');
  const [editLinkLength, setEditLinkLength] = useState('');
  const [editX, setEditX] = useState('');
  const [editY, setEditY] = useState('');
  const [editZ, setEditZ] = useState('');

  useEffect(() => {
    if (node) {
      setEditName(node.name);
      setEditDeck(node.deck || '');
      setEditStructure(node.structure || '');
      setEditType(node.type || '');
      setEditComponent(node.component || '');
      setEditLinkLength(node.linkLength?.toString() || '');
      setEditX(node.x?.toString() || '');
      setEditY(node.y?.toString() || '');
      setEditZ(node.z?.toString() || '');
    }
  }, [node]);

  if (!node) return null;

  const handleSave = () => {
    const updated: Partial<NodeData> = {
      deck: editDeck || undefined,
      structure: editStructure || undefined,
      type: editType || undefined,
      component: editComponent || undefined,
      linkLength: editLinkLength ? parseFloat(editLinkLength) : undefined,
      x: editX ? parseFloat(editX) : undefined,
      y: editY ? parseFloat(editY) : undefined,
      z: editZ ? parseFloat(editZ) : undefined,
    };
    // 이름 변경 체크
    if (editName && editName !== node.name) {
      onRename(node.name, editName);
    }
    onSave(editName || node.name, updated);
  };

  const field = (label: string, value: string, onChange: (v: string) => void, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-[8px] text-slate-500 font-bold uppercase mb-0.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-slate-900 border border-slate-700 text-white text-[11px] px-2 py-1.5 rounded focus:outline-none focus:border-cyan-500" />
    </div>
  );

  return (
    <div className="shrink-0 bg-slate-800/90 backdrop-blur border-t border-slate-700">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black text-cyan-400">✏ EDIT NODE</span>
          <span className="text-[10px] text-white font-bold">{node.name}</span>
          <span className="text-[9px] text-slate-500">{connectedCableCount} cables</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={e => { e.stopPropagation(); handleSave(); }}
            className="flex items-center gap-1 text-[9px] font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-900/30 px-2 py-1 rounded transition-colors">
            <Save size={10} /> 저장
          </button>
          <button onClick={e => { e.stopPropagation(); onClose(); }}
            className="p-1 text-slate-500 hover:text-white rounded transition-colors"><X size={12} /></button>
          {expanded ? <ChevronDown size={12} className="text-slate-500" /> : <ChevronUp size={12} className="text-slate-500" />}
        </div>
      </div>

      {/* Form */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {field('Name', editName, setEditName, 'text', 'NODE_001')}
            {field('Deck', editDeck, setEditDeck, 'text', 'TW')}
            {field('Structure', editStructure, setEditStructure)}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {field('Type', editType, setEditType)}
            {field('Component', editComponent, setEditComponent)}
            {field('Link Length (m)', editLinkLength, setEditLinkLength, 'number', '0')}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {field('X', editX, setEditX, 'number')}
            {field('Y', editY, setEditY, 'number')}
            {field('Z', editZ, setEditZ, 'number')}
          </div>
          {/* 연결 정보 */}
          {connections.length > 0 && (
            <div>
              <label className="block text-[8px] text-slate-500 font-bold uppercase mb-1">Connections ({connections.length})</label>
              <div className="flex flex-wrap gap-1">
                {connections.map(c => (
                  <span key={c} className="text-[9px] text-cyan-400 bg-cyan-900/30 px-1.5 py-0.5 rounded font-mono">{c}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
