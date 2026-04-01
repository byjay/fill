import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { NodeData, CableData } from '../types';
import { Search, Download, FileSpreadsheet, X, ChevronRight } from 'lucide-react';
import { useResizableColumns } from '../hooks/useResizableColumns';
import { ResizeHandle } from '../hooks/ResizeHandle';

interface NodeInfoTabProps {
  nodeData: NodeData[];
  cableData: CableData[];
  onExportNodeInfo: () => void;
}

/** 해당 노드를 지나가는 케이블 추출 (path 기준) */
function getCablesThroughNode(cables: CableData[], nodeName: string): CableData[] {
  return cables.filter(c => {
    const path = (c.calculatedPath || c.path || '');
    if (!path) return false;
    const nodes = path.split(/[,→>]/).map(n => n.trim());
    return nodes.includes(nodeName);
  });
}

/** 케이블 단면적합 mm² */
function totalCrossSection(cables: CableData[]): number {
  return cables.reduce((sum, c) => {
    const r = (c.od || 10) / 2;
    return sum + Math.PI * r * r;
  }, 0);
}

const NodeInfoTab: React.FC<NodeInfoTabProps> = ({ nodeData, cableData, onExportNodeInfo }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // ── 노드별 집계 ──────────────────────────────────────────────────────────────
  const enrichedNodes = useMemo(() => {
    return nodeData.map(n => {
      const through = getCablesThroughNode(cableData, n.name);
      return {
        ...n,
        throughCables: through,
        throughCount: through.length,
        crossSection: totalCrossSection(through),
        // from/to 기준 연결 수 (기존)
        connectedCables: cableData.filter(c =>
          c.fromNode === n.name || c.toNode === n.name
        ).length,
      };
    });
  }, [nodeData, cableData]);

  const filteredNodes = useMemo(() => {
    const lower = searchTerm.toLowerCase();
    return enrichedNodes.filter(n =>
      n.name.toLowerCase().includes(lower) ||
      (n.structure || '').toLowerCase().includes(lower) ||
      (n.type || '').toLowerCase().includes(lower)
    );
  }, [enrichedNodes, searchTerm]);

  const selectedNodeData = useMemo(() =>
    enrichedNodes.find(n => n.name === selectedNode),
    [enrichedNodes, selectedNode]
  );

  // ── 컬럼 리사이즈 (노드 목록) ────────────────────────────────────────────────
  const { widths: nw, startResize: nsr } = useResizableColumns([160, 120, 80, 90, 90, 90, 90, 90]);

  // ── 컬럼 리사이즈 (케이블 상세) ──────────────────────────────────────────────
  const { widths: cw, startResize: csr } = useResizableColumns([50, 140, 100, 80, 80, 80, 50, 60]);

  // ── Excel 내보내기: 노드별 시트 ──────────────────────────────────────────────
  const handleExportNodeExcel = () => {
    const wb = XLSX.utils.book_new();

    // 전체 요약 시트
    const summaryRows = filteredNodes.map(n => ({
      NODE_NAME: n.name,
      STRUCTURE: n.structure || '',
      TYPE: n.type || '',
      LINK_LENGTH: n.linkLength || 0,
      AREA_SIZE: n.areaSize || 0,
      THROUGH_CABLES: n.throughCount,
      CONNECTED_CABLES: n.connectedCables,
      CROSS_SECTION_MM2: +n.crossSection.toFixed(1),
      RECOMMENDED_TRAY_WIDTH: recommendWidth(n.crossSection),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), '전체_노드_요약');

    // 노드별 시트 (케이블 리스트)
    for (const node of enrichedNodes) {
      if (node.throughCables.length === 0) continue;
      const sheetName = node.name.replace(/[\\/*?:\[\]]/g, '_').substring(0, 31);
      const rows = node.throughCables.map((c, i) => ({
        NO: i + 1,
        CABLE_NAME: c.name,
        CABLE_TYPE: c.type,
        SYSTEM: c.system || '',
        FROM_NODE: c.fromNode || '',
        TO_NODE: c.toNode || '',
        OD_MM: c.od || 0,
        CROSS_SECTION_MM2: +((Math.PI * Math.pow((c.od || 10) / 2, 2))).toFixed(2),
        LENGTH_M: +(c.calculatedLength || c.length || 0).toFixed(1),
        PATH: c.calculatedPath || c.path || '',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      // 시트 상단에 노드 정보 삽입
      XLSX.utils.sheet_add_aoa(ws, [
        [`NODE: ${node.name}`, '', `단면적합: ${node.crossSection.toFixed(1)} mm²`, '', `권장 트레이폭: ${recommendWidth(node.crossSection)} mm`],
        [],
      ], { origin: 'A1' });
      XLSX.utils.sheet_add_json(ws, rows, { origin: 'A3', skipHeader: false });
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    XLSX.writeFile(wb, `노드별_케이블_리스트.xlsx`);
  };

  return (
    <div className="flex h-full bg-slate-900 text-slate-200 overflow-hidden">

      {/* ── 좌측: 노드 목록 ── */}
      <div className={`flex flex-col ${selectedNode ? 'w-1/2' : 'w-full'} transition-all overflow-hidden border-r border-slate-800`}>
        {/* 툴바 */}
        <div className="p-3 border-b border-slate-800 flex flex-wrap gap-2 items-center bg-slate-800">
          <button onClick={onExportNodeInfo}
            className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
            <Download size={13} /> CSV
          </button>
          <button onClick={handleExportNodeExcel}
            className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
            <FileSpreadsheet size={13} /> 노드별 Excel
          </button>
          <div className="relative ml-auto">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search nodes..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs focus:outline-none focus:border-blue-500 text-slate-200 w-48"
            />
          </div>
        </div>

        {/* 테이블 */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-xs" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              {nw.map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            <thead className="bg-slate-950 text-slate-400 uppercase sticky top-0 z-10">
              <tr>
                {[
                  'Node Name', 'Structure', 'Type', 'Relation',
                  'Link(m)', 'Area(mm²)', 'Through', '단면적합(mm²)',
                ].map((label, i) => (
                  <th key={i} className="relative px-3 py-2.5 font-bold border-b border-slate-800 select-none overflow-hidden">
                    <span className="truncate block pr-1">{label}</span>
                    <ResizeHandle onMouseDown={(e) => nsr(i, e)} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredNodes.map(node => (
                <tr
                  key={node.name}
                  onClick={() => setSelectedNode(node.name === selectedNode ? null : node.name)}
                  className={`cursor-pointer transition-colors ${
                    selectedNode === node.name
                      ? 'bg-blue-900/40 text-white'
                      : 'hover:bg-slate-800/50'
                  }`}
                >
                  <td className="px-3 py-2 font-bold text-blue-400 truncate flex items-center gap-1">
                    {node.name}
                    <ChevronRight size={10} className="text-slate-500 shrink-0" />
                  </td>
                  <td className="px-3 py-2 truncate text-slate-300">{node.structure || '-'}</td>
                  <td className="px-3 py-2 truncate">{node.type || '-'}</td>
                  <td className="px-3 py-2 truncate text-slate-400 text-[10px]" title={node.relation || ''}>
                    {node.relation || '-'}
                  </td>
                  <td className="px-3 py-2 font-mono text-right">{(node.linkLength || 0).toFixed(1)}</td>
                  <td className="px-3 py-2 font-mono text-right">{(node.areaSize || 0).toFixed(0)}</td>
                  <td className="px-3 py-2 font-bold text-center text-emerald-400">{node.throughCount}</td>
                  <td className="px-3 py-2 font-mono text-right text-amber-400">{node.crossSection.toFixed(0)}</td>
                </tr>
              ))}
              {filteredNodes.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500 italic">노드 없음</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 우측: 선택된 노드 상세 ── */}
      {selectedNode && selectedNodeData && (
        <div className="w-1/2 flex flex-col overflow-hidden bg-slate-900">
          {/* 헤더 */}
          <div className="p-3 border-b border-slate-800 bg-slate-800 flex items-center gap-3">
            <div className="flex-1">
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">노드 상세</p>
              <h3 className="text-sm font-black text-blue-400">{selectedNode}</h3>
            </div>
            <div className="flex gap-3 text-right">
              <div>
                <p className="text-[9px] text-slate-500 uppercase">통과 케이블</p>
                <p className="text-lg font-black text-emerald-400 leading-none">{selectedNodeData.throughCount}</p>
              </div>
              <div>
                <p className="text-[9px] text-slate-500 uppercase">단면적합</p>
                <p className="text-lg font-black text-amber-400 leading-none">{selectedNodeData.crossSection.toFixed(0)}<span className="text-[9px] ml-0.5">mm²</span></p>
              </div>
              <div>
                <p className="text-[9px] text-slate-500 uppercase">권장 트레이</p>
                <p className="text-lg font-black text-blue-400 leading-none">{recommendWidth(selectedNodeData.crossSection)}<span className="text-[9px] ml-0.5">mm</span></p>
              </div>
            </div>
            <button onClick={() => setSelectedNode(null)}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors">
              <X size={14} />
            </button>
          </div>

          {/* 케이블 리스트 테이블 */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-xs" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                {cw.map((w, i) => <col key={i} style={{ width: w }} />)}
              </colgroup>
              <thead className="bg-slate-950 text-slate-400 uppercase sticky top-0 z-10">
                <tr>
                  {['#', 'Cable Name', 'Type', 'System', 'From', 'To', 'OD', 'mm²'].map((label, i) => (
                    <th key={i} className="relative px-3 py-2.5 font-bold border-b border-slate-800 select-none overflow-hidden">
                      <span className="truncate block pr-1">{label}</span>
                      <ResizeHandle onMouseDown={(e) => csr(i, e)} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {selectedNodeData.throughCables.map((c, i) => {
                  const area = Math.PI * Math.pow((c.od || 10) / 2, 2);
                  return (
                    <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-3 py-1.5 text-slate-500">{i + 1}</td>
                      <td className="px-3 py-1.5 font-bold text-slate-200 truncate">{c.name}</td>
                      <td className="px-3 py-1.5 text-slate-400 truncate">{c.type}</td>
                      <td className="px-3 py-1.5 text-slate-400 truncate">{c.system || '-'}</td>
                      <td className="px-3 py-1.5 text-slate-400 truncate">{c.fromNode || '-'}</td>
                      <td className="px-3 py-1.5 text-slate-400 truncate">{c.toNode || '-'}</td>
                      <td className="px-3 py-1.5 font-mono text-right">{c.od || 10}</td>
                      <td className="px-3 py-1.5 font-mono text-right text-amber-400">{area.toFixed(0)}</td>
                    </tr>
                  );
                })}
                {selectedNodeData.throughCables.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500 italic">
                      이 노드를 통과하는 케이블 없음
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

/** 표준 트레이폭 추천 (40% fill, 60mm 높이 기준) */
function recommendWidth(crossSection: number, fillLimit = 0.4, trayHeight = 60): number {
  const minWidth = crossSection / (trayHeight * fillLimit);
  const standards = [100, 150, 200, 300, 400, 500, 600, 800, 1000];
  return standards.find(w => w >= minWidth) ?? 1000;
}

export default NodeInfoTab;
