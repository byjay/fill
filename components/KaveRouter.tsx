/**
 * KaveRouter — 독립 노드 에디터 + DXF 뷰어
 *
 * 기존 SCM 코드와 완전 분리. App.tsx에서 호출만 함.
 * Props로 nodeData/cableData를 받고, onNodeEdit/onNodesUpdate로 결과를 돌려줌.
 */
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { NodeData, CableData, NodeConnection } from '../types';
import { useNodeEditor } from '../hooks/useNodeEditor';
import { useDXFStore } from '../hooks/useDXFStore';
import { Upload, Layers, X, Eye, EyeOff, FileText, Trash2 } from 'lucide-react';

// Lazy load heavy components
const NodeEditorCanvas = React.lazy(() => import('./NodeEditorCanvas'));
const NodeEditorToolbar = React.lazy(() => import('./NodeEditorToolbar'));
const NodeEditPanel = React.lazy(() => import('./NodeEditPanel'));
const DXFCanvasRenderer = React.lazy(() => import('./DXFCanvasRenderer'));

// ── Props ─────────────────────────────────────────────────
interface KaveRouterProps {
  nodeData: NodeData[];
  cableData: CableData[];
  onNodeEdit: (nodeName: string, updated: Partial<NodeData>) => void;
  onNodesUpdate: (newNodes: NodeData[], description?: string) => void;
}

// ── 케이블 통과 노드 계산 ─────────────────────────────────
function getCablesThroughNode(cables: CableData[], nodeName: string): CableData[] {
  return cables.filter(c => {
    const path = c.calculatedPath || c.path || '';
    if (!path) return false;
    return path.split(/[,→>]/).map(n => n.trim()).includes(nodeName);
  });
}

// ── Main Component ─────────────────────────────────────────
const KaveRouter: React.FC<KaveRouterProps> = ({ nodeData, cableData, onNodeEdit, onNodesUpdate }) => {
  // DXF 상태
  const dxfStore = useDXFStore();
  const dxfFileRef = useRef<HTMLInputElement>(null);
  const [showLayerPanel, setShowLayerPanel] = useState(false);

  // 노드 에디터 상태
  const editor = useNodeEditor({ nodes: nodeData, onNodeEdit, onNodesUpdate });

  // 캔버스 크기 추적
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setCanvasSize({ width: Math.floor(width), height: Math.floor(height) });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // DXF 업로드 핸들러
  const handleDXFUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    dxfStore.loadDXF(file);
    e.target.value = '';
  }, [dxfStore]);

  // 선택된 노드 정보
  const selectedNodeData = editor.selectedNodeData;
  const connectedCableCount = useMemo(() => {
    if (!selectedNodeData) return 0;
    return getCablesThroughNode(cableData, selectedNodeData.name).length;
  }, [cableData, selectedNodeData]);

  const connections = useMemo(() => {
    if (!selectedNodeData?.relation) return [];
    return selectedNodeData.relation.split(',').map(s => s.trim()).filter(Boolean);
  }, [selectedNodeData]);

  // SVG viewBox (NodeEditorCanvas에서 사용하는 것과 동기화용)
  const [viewBox, setViewBox] = useState({ x: -5000, y: -5000, w: 50000, h: 40000 });

  return (
    <div className="flex flex-col h-full bg-slate-950 overflow-hidden">
      {/* ── 상단: DXF 컨트롤 + 노드 에디터 툴바 ── */}
      <div className="shrink-0 flex items-center gap-1 px-2 py-1 bg-slate-800 border-b border-slate-700">
        {/* DXF 업로드 */}
        <button onClick={() => dxfFileRef.current?.click()}
          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-emerald-800/60 hover:bg-emerald-700 border border-emerald-700/40 text-emerald-300 transition-colors">
          <Upload size={10} /> DXF 배경
        </button>
        <input type="file" ref={dxfFileRef} onChange={handleDXFUpload} accept=".dxf" className="hidden" />

        {dxfStore.dxfFileName && (
          <>
            <span className="text-[9px] text-slate-400 font-mono truncate max-w-[120px]">
              <FileText size={9} className="inline mr-0.5" />{dxfStore.dxfFileName}
            </span>
            <button onClick={() => setShowLayerPanel(!showLayerPanel)}
              className={`p-1 rounded transition-colors ${showLayerPanel ? 'text-cyan-400 bg-cyan-900/30' : 'text-slate-500 hover:text-white'}`}>
              <Layers size={11} />
            </button>
            <button onClick={dxfStore.clearDXF}
              className="p-1 text-slate-500 hover:text-red-400 rounded transition-colors">
              <X size={11} />
            </button>
            <span className="text-[8px] text-slate-600">
              {dxfStore.dxf?.entities.length ?? 0} entities
            </span>
          </>
        )}

        {dxfStore.loading && (
          <span className="text-[9px] text-amber-400 animate-pulse">DXF 파싱 중...</span>
        )}
        {dxfStore.error && (
          <span className="text-[9px] text-red-400">{dxfStore.error}</span>
        )}

        <div className="w-px h-4 bg-slate-700 mx-1" />

        {/* 노드 수 표시 */}
        <span className="text-[9px] text-slate-500 font-mono">
          <span className="text-blue-400 font-bold">{nodeData.length}</span> nodes
          <span className="mx-1 text-slate-700">|</span>
          <span className="text-emerald-400 font-bold">{cableData.length}</span> cables
        </span>
      </div>

      {/* ── 노드 에디터 툴바 ── */}
      <React.Suspense fallback={null}>
        <NodeEditorToolbar
          mode={editor.mode} onModeChange={editor.setMode}
          axisLock={editor.axisLock} onAxisLockChange={editor.setAxisLock}
          activeDeck={editor.activeDeck} onDeckChange={editor.setActiveDeck}
          availableDecks={editor.availableDecks}
          selectedCount={editor.selectedNodes.size} totalNodes={nodeData.length}
          newNodeName={editor.newNodeName} onNewNodeNameChange={editor.setNewNodeName}
          onDeleteSelected={editor.deleteSelected} onCopySelected={editor.copySelected}
          onFitView={() => {}}
          viewMode={editor.viewMode} onViewModeChange={editor.setViewMode}
        />
      </React.Suspense>

      {/* ── 메인: 캔버스 영역 (DXF 배경 + SVG 노드 오버레이) ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* 레이어 패널 (사이드) */}
        {showLayerPanel && dxfStore.dxf && (
          <div className="w-48 shrink-0 bg-slate-900 border-r border-slate-800 overflow-auto">
            <div className="px-2 py-1.5 border-b border-slate-800 flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Layers</span>
              <div className="flex gap-1">
                <button onClick={() => dxfStore.setAllLayersVisible(true)}
                  className="text-[8px] text-slate-500 hover:text-white px-1">All</button>
                <button onClick={() => dxfStore.setAllLayersVisible(false)}
                  className="text-[8px] text-slate-500 hover:text-white px-1">None</button>
              </div>
            </div>
            {dxfStore.layerList.map(name => {
              const visible = dxfStore.visibleLayers.has(name);
              return (
                <button key={name} onClick={() => dxfStore.toggleLayer(name)}
                  className={`w-full flex items-center gap-1.5 px-2 py-1 text-[9px] hover:bg-slate-800 transition-colors ${
                    visible ? 'text-slate-300' : 'text-slate-600'
                  }`}>
                  {visible ? <Eye size={9} className="text-cyan-400" /> : <EyeOff size={9} />}
                  <span className="truncate">{name || '(default)'}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* 캔버스 컨테이너 */}
        <div ref={containerRef} className="flex-1 relative overflow-hidden">
          {/* DXF 배경 레이어 (Canvas 2D) */}
          {dxfStore.dxf && (
            <React.Suspense fallback={null}>
              <DXFCanvasRenderer
                dxf={dxfStore.dxf}
                viewBox={viewBox}
                width={canvasSize.width}
                height={canvasSize.height}
                visibleLayers={dxfStore.visibleLayers}
                className="absolute inset-0 z-0"
              />
            </React.Suspense>
          )}

          {/* SVG 노드 오버레이 */}
          <React.Suspense fallback={<div className="flex-1 flex items-center justify-center text-slate-500 text-xs">로딩 중...</div>}>
            <NodeEditorCanvas
              nodes={editor.visibleNodes}
              mode={editor.mode}
              activeDeck={editor.activeDeck}
              axisLock={editor.axisLock}
              selectedNodes={editor.selectedNodes}
              connectingFrom={editor.connectingFrom}
              onNodeClick={editor.handleNodeClick}
              onNodeMove={editor.moveNode}
              onCanvasClick={editor.handleCanvasClick}
              onSelectionChange={editor.setSelectedNodes}
            />
          </React.Suspense>
        </div>
      </div>

      {/* ── 하단: 노드 편집 패널 ── */}
      {selectedNodeData && (
        <React.Suspense fallback={null}>
          <NodeEditPanel
            node={selectedNodeData}
            onSave={(name, updated) => onNodeEdit(name, updated)}
            onClose={() => editor.setSelectedNodes(new Set())}
            onRename={(oldName, newName) => editor.renameNode(oldName, newName)}
            connectedCableCount={connectedCableCount}
            connections={connections}
          />
        </React.Suspense>
      )}
    </div>
  );
};

export default KaveRouter;
