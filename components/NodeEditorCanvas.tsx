import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { NodeData } from '../types';

type EditorMode = 'select' | 'place' | 'connect';
type AxisLock = 'none' | 'x' | 'y' | 'z';

interface Props {
  nodes: NodeData[];
  mode: EditorMode;
  activeDeck: string;
  axisLock: AxisLock;
  selectedNodes: Set<string>;
  connectingFrom: string | null;
  onNodeClick: (name: string, shiftKey?: boolean) => void;
  onNodeMove: (name: string, x: number, z: number) => void;
  onCanvasClick: (x: number, z: number) => void;
  onSelectionChange: (names: Set<string>) => void;
}

// Deck 색상
const DECK_COLORS: Record<string, string> = {
  TW: '#3b82f6', SF: '#10b981', PR: '#f59e0b', PA: '#ef4444',
  UD: '#8b5cf6', WH: '#06b6d4', FP: '#ec4899', AP: '#6366f1',
};
function deckColor(deck?: string): string {
  if (!deck) return '#64748b';
  for (const [p, c] of Object.entries(DECK_COLORS)) {
    if (deck.toUpperCase().startsWith(p)) return c;
  }
  return '#64748b';
}

// 좌표 없는 노드 자동 배치
function autoLayout(nodes: NodeData[]): NodeData[] {
  const noCoord = nodes.filter(n => n.x == null || n.z == null);
  if (noCoord.length === 0) return nodes;
  const cols = Math.ceil(Math.sqrt(noCoord.length));
  let idx = 0;
  return nodes.map(n => {
    if (n.x != null && n.z != null) return n;
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    idx++;
    return { ...n, x: col * 2000, z: row * 2000 };
  });
}

export default function NodeEditorCanvas(props: Props) {
  const { nodes: rawNodes, mode, axisLock, selectedNodes, connectingFrom,
    onNodeClick, onNodeMove, onCanvasClick, onSelectionChange } = props;

  const svgRef = useRef<SVGSVGElement>(null);
  const nodes = useMemo(() => autoLayout(rawNodes), [rawNodes]);

  // viewBox state
  const [vb, setVb] = useState({ x: -5000, y: -5000, w: 50000, h: 40000 });

  // 드래그 상태
  const [dragging, setDragging] = useState<{ name: string; startX: number; startZ: number; origX: number; origZ: number } | null>(null);
  const [panning, setPanning] = useState<{ startMX: number; startMY: number; startVBX: number; startVBY: number } | null>(null);
  const [cursorCanvas, setCursorCanvas] = useState<{ x: number; y: number } | null>(null);

  // fit view on mount
  useEffect(() => {
    if (nodes.length === 0) return;
    const xs = nodes.map(n => n.x ?? 0);
    const zs = nodes.map(n => n.z ?? 0);
    const minX = Math.min(...xs) - 3000;
    const maxX = Math.max(...xs) + 3000;
    const minZ = Math.min(...zs) - 3000;
    const maxZ = Math.max(...zs) + 3000;
    setVb({ x: minX, y: minZ, w: maxX - minX || 50000, h: maxZ - minZ || 40000 });
  }, [nodes.length]);

  // 연결 엣지
  const edges = useMemo(() => {
    const edgeSet = new Set<string>();
    const result: [string, string][] = [];
    const nodeMap = new Map(nodes.map(n => [n.name, n]));
    nodes.forEach(node => {
      if (!node.relation) return;
      node.relation.split(',').map(s => s.trim()).filter(Boolean).forEach(nb => {
        if (!nodeMap.has(nb)) return;
        const key = [node.name, nb].sort().join('|');
        if (!edgeSet.has(key)) { edgeSet.add(key); result.push([node.name, nb]); }
      });
    });
    return result;
  }, [nodes]);

  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.name, n])), [nodes]);

  // screen → canvas 좌표 변환
  const screenToCanvas = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: vb.x + ((clientX - rect.left) / rect.width) * vb.w,
      y: vb.y + ((clientY - rect.top) / rect.height) * vb.h,
    };
  }, [vb]);

  // 줌
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.15 : 0.87;
    const pt = screenToCanvas(e.clientX, e.clientY);
    setVb(prev => ({
      x: pt.x - (pt.x - prev.x) * factor,
      y: pt.y - (pt.y - prev.y) * factor,
      w: prev.w * factor,
      h: prev.h * factor,
    }));
  }, [screenToCanvas]);

  // 포인터 핸들러
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const pt = screenToCanvas(e.clientX, e.clientY);
    // 빈 영역 클릭
    setPanning({ startMX: e.clientX, startMY: e.clientY, startVBX: vb.x, startVBY: vb.y });
  }, [screenToCanvas, vb]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const pt = screenToCanvas(e.clientX, e.clientY);
    setCursorCanvas(pt);

    if (dragging) {
      let newX = pt.x;
      let newZ = pt.y;
      if (axisLock === 'x') newZ = dragging.origZ;
      if (axisLock === 'z') newX = dragging.origX;
      setDragging({ ...dragging, startX: newX, startZ: newZ });
      return;
    }
    if (panning) {
      const dx = ((e.clientX - panning.startMX) / (svgRef.current?.getBoundingClientRect().width ?? 1)) * vb.w;
      const dy = ((e.clientY - panning.startMY) / (svgRef.current?.getBoundingClientRect().height ?? 1)) * vb.h;
      setVb(prev => ({ ...prev, x: panning.startVBX - dx, y: panning.startVBY - dy }));
    }
  }, [screenToCanvas, dragging, panning, vb, axisLock]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (dragging) {
      onNodeMove(dragging.name, dragging.startX, dragging.startZ);
      setDragging(null);
      return;
    }
    if (panning) {
      // 클릭 판별 (이동 거리 작으면 클릭)
      const dx = Math.abs(e.clientX - panning.startMX);
      const dy = Math.abs(e.clientY - panning.startMY);
      if (dx < 5 && dy < 5) {
        const pt = screenToCanvas(e.clientX, e.clientY);
        onCanvasClick(pt.x, pt.y);
      }
      setPanning(null);
    }
  }, [dragging, panning, onNodeMove, onCanvasClick, screenToCanvas]);

  // 노드 드래그 시작
  const handleNodePointerDown = useCallback((e: React.PointerEvent, name: string) => {
    e.stopPropagation();
    if (mode === 'select') {
      onNodeClick(name, e.shiftKey);
      const node = nodeMap.get(name);
      if (node) {
        setDragging({ name, startX: node.x ?? 0, startZ: node.z ?? 0, origX: node.x ?? 0, origZ: node.z ?? 0 });
      }
    } else {
      onNodeClick(name, e.shiftKey);
    }
  }, [mode, nodeMap, onNodeClick]);

  // 동적 크기
  const nodeRadius = Math.max(vb.w / 250, 80);
  const fontSize = Math.max(vb.w / 200, 100);
  const lineWidth = Math.max(vb.w / 800, 20);

  // 그리드 생성
  const gridLines = useMemo(() => {
    const lines: React.ReactNode[] = [];
    const majorStep = 5000;
    const minorStep = 1000;
    const startX = Math.floor(vb.x / majorStep) * majorStep;
    const endX = Math.ceil((vb.x + vb.w) / majorStep) * majorStep;
    const startY = Math.floor(vb.y / majorStep) * majorStep;
    const endY = Math.ceil((vb.y + vb.h) / majorStep) * majorStep;

    // 보조 그리드 (1000mm)
    for (let x = Math.floor(vb.x / minorStep) * minorStep; x <= vb.x + vb.w; x += minorStep) {
      lines.push(<line key={`mx${x}`} x1={x} y1={vb.y} x2={x} y2={vb.y + vb.h} stroke="#334155" strokeWidth={lineWidth * 0.3} opacity={0.2} />);
    }
    for (let y = Math.floor(vb.y / minorStep) * minorStep; y <= vb.y + vb.h; y += minorStep) {
      lines.push(<line key={`my${y}`} x1={vb.x} y1={y} x2={vb.x + vb.w} y2={y} stroke="#334155" strokeWidth={lineWidth * 0.3} opacity={0.2} />);
    }

    // 주 그리드 (5000mm)
    for (let x = startX; x <= endX; x += majorStep) {
      lines.push(<line key={`Mx${x}`} x1={x} y1={vb.y} x2={x} y2={vb.y + vb.h} stroke="#475569" strokeWidth={lineWidth * 0.5} opacity={0.3} />);
    }
    for (let y = startY; y <= endY; y += majorStep) {
      lines.push(<line key={`My${y}`} x1={vb.x} y1={y} x2={vb.x + vb.w} y2={y} stroke="#475569" strokeWidth={lineWidth * 0.5} opacity={0.3} />);
    }

    // 원점 축
    lines.push(<line key="axisX" x1={vb.x} y1={0} x2={vb.x + vb.w} y2={0} stroke="#ef4444" strokeWidth={lineWidth} opacity={0.5} />);
    lines.push(<line key="axisZ" x1={0} y1={vb.y} x2={0} y2={vb.y + vb.h} stroke="#3b82f6" strokeWidth={lineWidth} opacity={0.5} />);

    return lines;
  }, [vb, lineWidth]);

  const cursor = mode === 'select' ? 'default' : mode === 'place' ? 'crosshair' : 'pointer';

  return (
    <div className="flex-1 relative overflow-hidden bg-slate-950">
      <svg ref={svgRef}
        width="100%" height="100%"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ cursor, touchAction: 'none' }}
      >
        {/* 그리드 */}
        {gridLines}

        {/* 연결 라인 */}
        {edges.map(([from, to]) => {
          const a = nodeMap.get(from);
          const b = nodeMap.get(to);
          if (!a || !b || a.x == null || b.x == null || a.z == null || b.z == null) return null;
          const isHighlight = selectedNodes.has(from) || selectedNodes.has(to);
          return (
            <line key={`${from}-${to}`}
              x1={a.x} y1={a.z} x2={b.x} y2={b.z}
              stroke={isHighlight ? '#fbbf24' : '#3b82f6'}
              strokeWidth={lineWidth * (isHighlight ? 1.5 : 1)}
              opacity={isHighlight ? 0.9 : 0.5}
            />
          );
        })}

        {/* 연결 프리뷰 */}
        {connectingFrom && cursorCanvas && (() => {
          const fromNode = nodeMap.get(connectingFrom);
          if (!fromNode || fromNode.x == null || fromNode.z == null) return null;
          return (
            <line x1={fromNode.x} y1={fromNode.z} x2={cursorCanvas.x} y2={cursorCanvas.y}
              stroke="#fbbf24" strokeWidth={lineWidth} strokeDasharray={`${lineWidth * 3},${lineWidth * 2}`} opacity={0.7} />
          );
        })()}

        {/* 노드 */}
        {nodes.map(node => {
          if (node.x == null || node.z == null) return null;
          const isSelected = selectedNodes.has(node.name);
          const isDraggingThis = dragging?.name === node.name;
          const cx = isDraggingThis ? dragging!.startX : node.x;
          const cy = isDraggingThis ? dragging!.startZ : node.z;
          const isConnecting = connectingFrom === node.name;
          const color = deckColor(node.deck);

          return (
            <g key={node.name} onPointerDown={e => handleNodePointerDown(e, node.name)}>
              {/* 글로우 */}
              {(isSelected || isConnecting) && (
                <circle cx={cx} cy={cy} r={nodeRadius * 1.8} fill="none"
                  stroke={isConnecting ? '#fbbf24' : '#fbbf24'} strokeWidth={lineWidth * 0.5} opacity={0.4} />
              )}
              {/* 노드 원 */}
              <circle cx={cx} cy={cy} r={nodeRadius}
                fill={color} stroke={isSelected ? '#fbbf24' : '#1e293b'} strokeWidth={isSelected ? lineWidth * 1.5 : lineWidth * 0.5}
                opacity={0.9} style={{ cursor: mode === 'select' ? 'grab' : 'pointer' }} />
              {/* 레이블 */}
              <text x={cx} y={cy - nodeRadius * 1.5} textAnchor="middle"
                fontSize={fontSize} fill="#cbd5e1" fontFamily="monospace" fontWeight="bold"
                style={{ pointerEvents: 'none', userSelect: 'none' }}>
                {node.name}
              </text>
              {/* Deck 표시 */}
              {node.deck && (
                <text x={cx} y={cy + nodeRadius * 2.2} textAnchor="middle"
                  fontSize={fontSize * 0.7} fill={color} fontFamily="monospace" opacity={0.7}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}>
                  {node.deck}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* 좌표 표시 */}
      {cursorCanvas && (
        <div className="absolute bottom-2 right-2 bg-slate-900/80 backdrop-blur px-2 py-1 rounded text-[9px] text-slate-400 font-mono">
          X: {cursorCanvas.x.toFixed(0)} &nbsp; Z: {cursorCanvas.y.toFixed(0)}
        </div>
      )}

      {/* 모드 표시 */}
      <div className="absolute top-2 left-2 bg-slate-900/70 px-2 py-1 rounded text-[9px] text-cyan-400 font-bold uppercase">
        {mode === 'select' ? '🖱 SELECT' : mode === 'place' ? '✚ PLACE' : '🔗 CONNECT'}
        {axisLock !== 'none' && (
          <span className={`ml-1.5 ${axisLock === 'x' ? 'text-red-400' : axisLock === 'y' ? 'text-green-400' : 'text-blue-400'}`}>
            LOCK {axisLock.toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}
