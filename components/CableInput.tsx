
import React, { useState, useRef } from 'react';
import { CableData, NodeData } from '../types';
import { Table, Trash2, RotateCcw, FileSpreadsheet, FileJson, Copy, Network } from 'lucide-react';
import * as XLSX from 'xlsx';

interface CableInputProps {
  onCableDataChange: (data: CableData[]) => void;
  onNodeDataChange: (data: NodeData[]) => void;
}

const CableInput: React.FC<CableInputProps> = ({ onCableDataChange, onNodeDataChange }) => {
  const [activeTab, setActiveTab] = useState<'json' | 'nodes' | 'tsv'>('json');
  const [inputText, setInputText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleProcessData = (text: string) => {
    try {
      if (activeTab === 'json') {
        const parsed = JSON.parse(text);
        if (parsed.cables) {
          const formatted = parsed.cables.map((c: any, idx: number) => ({
            id: `c-${idx}`,
            name: c.name,
            type: c.type,
            od: c.outDia || c.od, // Handle both 'outDia' from user and 'od' internal
            system: c.system,
            fromNode: c.fromNode,
            toNode: c.toNode,
            path: c.path,
            calculatedPath: c.path ? c.path.split(',').map((s: string) => s.trim()).join(' → ') : undefined
          }));
          onCableDataChange(formatted);
        }
        if (parsed.nodes) {
          onNodeDataChange(parsed.nodes);
        }
      } else if (activeTab === 'tsv') {
          // TSV Parsing logic (existing)
          const lines = text.trim().split('\n');
          const data: CableData[] = lines.map((line, i) => {
              const parts = line.split('\t');
              return {
                  id: `c-${i}`,
                  name: parts[2] || parts[0],
                  type: parts[3] || parts[1],
                  od: parseFloat(parts[14]) || parseFloat(parts[2]) || 10,
                  system: parts[0],
                  path: parts[13]
              };
          });
          onCableDataChange(data);
      }
    } catch (e) {
      alert("Invalid data format. Please check your input.");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result as string;
      if (file.name.endsWith('.json')) {
          setInputText(bstr);
          setActiveTab('json');
          handleProcessData(bstr);
      } else {
          const wb = XLSX.read(bstr, { type: 'binary' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
          const text = data.map(row => row.join('\t')).join('\n');
          setInputText(text);
          setActiveTab('tsv');
          handleProcessData(text);
      }
    };
    if (file.name.endsWith('.json')) reader.readAsText(file);
    else reader.readAsBinaryString(file);
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 px-2 py-2 border-b border-gray-200 flex gap-1">
        <button onClick={() => setActiveTab('json')} className={`flex-1 py-2 text-[10px] font-black rounded flex items-center justify-center gap-1.5 transition-colors ${activeTab === 'json' ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-400'}`}>
            <FileJson size={14}/> JSON
        </button>
        <button onClick={() => setActiveTab('tsv')} className={`flex-1 py-2 text-[10px] font-black rounded flex items-center justify-center gap-1.5 transition-colors ${activeTab === 'tsv' ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-400'}`}>
            <Table size={14}/> TSV/Excel
        </button>
      </div>
      
      <div className="p-4 flex-1 flex flex-col gap-3">
        <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-2 px-3 py-2.5 w-full text-xs font-black bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-all shadow-lg uppercase tracking-widest"
        >
            <FileSpreadsheet size={16} /> Import Data File
        </button>
        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".json, .xlsx, .xls, .csv" />

        <div className="flex-1 flex flex-col min-h-0">
            <label className="text-[10px] font-black text-slate-400 uppercase mb-1 flex justify-between">
                <span>Raw Data Input Area</span>
                <span>{inputText.length > 0 ? `${inputText.length} chars` : 'Empty'}</span>
            </label>
            <textarea
                className="flex-1 w-full p-3 font-mono text-[10px] border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-slate-50"
                placeholder={activeTab === 'json' ? "Paste Cable JSON data here..." : "Paste TSV data here..."}
                value={inputText}
                onChange={(e) => {
                    setInputText(e.target.value);
                    handleProcessData(e.target.value);
                }}
                spellCheck={false}
            />
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={() => { setInputText(''); onCableDataChange([]); }}
            className="flex items-center justify-center gap-1 px-3 py-2 text-[10px] font-black text-red-500 bg-red-50 hover:bg-red-100 border border-red-100 rounded-md transition-colors flex-1 uppercase tracking-wider"
          >
            <Trash2 size={14} /> Clear Data
          </button>
        </div>
      </div>
    </div>
  );
};

export default CableInput;
