import React, { useMemo, useState, useRef, useCallback, Suspense, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Line } from '@react-three/drei';
import { CableData, NodeData } from '../types';
import * as THREE from 'three';
import {
  RefreshCw,
  Eye,
  EyeOff,
  RotateCcw,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  Info,
} from 'lucide-react';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface ThreeDViewTabProps {
  cableData: CableData[];
  nodeData: NodeData[];
}

interface NodePosition {
  node: NodeData;
  position: THREE.Vector3;
}

// ─────────────────────────────────────────────────────────────────────────────
// Color helpers
// ─────────────────────────────────────────────────────────────────────────────
const DECK_COLORS: Record<string, string> = {
  '01': '#f59e0b',
  '02': '#10b981',
  '03': '#3b82f6',
  '04': '#a855f7',
  '05': '#ef4444',
  '06': '#f97316',
  '07': '#06b6d4',
  '08': '#84cc16',
  default: '#94a3b8',
};

const TYPE_COLORS: Record<string, string> = {
  junction: '#f59e0b',
  terminal: '#10b981',
  equipment: '#3b82f6',
  panel: '#a855f7',
  penetration: '#ef4444',
  default: '#94a3b8',
};

function getNodeColor(node: NodeData): string {
  if (node.deck) {
    const key = node.deck.toString().padStart(2, '0');
    return DECK_COLORS[key] ?? DECK_COLORS.default;
  }
  if (node.type) {
    const key = node.type.toLowerCase();
    return TYPE_COLORS[key] ?? TYPE_COLORS.default;
  }
  return TYPE_COLORS.default;
}

function getNodeColorForLegend(label: string): string {
  const padded = label.padStart(2, '0');
  if (DECK_COLORS[padded]) return DECK_COLORS[padded];
  const lower = label.toLowerCase();
  if (TYPE_COLORS[lower]) return TYPE_COLORS[lower];
  return DECK_COLORS.default;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-layout: force-directed using relation field, with deck-based Y separation
// Nodes without coords are positioned via a simplified spring/repulsion layout.
// ─────────────────────────────────────────────────────────────────────────────
function buildPositions(nodeData: NodeData[]): Record<string, THREE.Vector3> {
  const positions: Record<string, THREE.Vector3> = {};

  if (nodeData.length === 0) return positions;

  // If ALL nodes have explicit x/y/z coords, use them directly (scaled for comfort)
  const hasCoords = nodeData.every(
    (n) => n.x !== undefined && n.y !== undefined && n.z !== undefined,
  );

  if (hasCoords) {
    nodeData.forEach((node) => {
      const x = (node.x ?? 0) * 0.1;
      const y = (node.y ?? 0) * 0.1;
      const z = (node.z ?? 0) * 0.1;
      positions[node.name] = new THREE.Vector3(x, y, z);
    });
    return positions;
  }

  // Build adjacency from relation field
  const adjacency: Record<string, string[]> = {};
  nodeData.forEach((node) => {
    const neighbors = node.relation
      ? String(node.relation)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    adjacency[node.name] = neighbors;
  });

  // Group nodes by deck for hierarchical Y layout
  const deckMap: Record<string, NodeData[]> = {};
  nodeData.forEach((node) => {
    const deck = node.deck ?? 'default';
    if (!deckMap[deck]) deckMap[deck] = [];
    deckMap[deck].push(node);
  });
  const decks = Object.keys(deckMap).sort();
  const deckYMap: Record<string, number> = {};
  decks.forEach((deck, i) => {
    deckYMap[deck] = i * 14;
  });

  // Initialize positions: circle per deck in XZ plane
  nodeData.forEach((node) => {
    const deck = node.deck ?? 'default';
    const deckNodes = deckMap[deck];
    const idx = deckNodes.indexOf(node);
    const count = deckNodes.length;
    const radius = Math.max(15, count * 1.8);
    const angle = (idx / count) * Math.PI * 2;
    const y = deckYMap[deck] ?? 0;
    positions[node.name] = new THREE.Vector3(
      Math.cos(angle) * radius,
      y,
      Math.sin(angle) * radius,
    );
  });

  // Force-directed iterations (simplified Fruchterman-Reingold in XZ plane only)
  const ITERATIONS = 80;
  const IDEAL_LENGTH = 8;          // ideal spring rest length
  const REPULSION = 200;           // repulsion constant
  const ATTRACTION = 0.05;         // spring attraction constant
  const MAX_DISP = 3;              // max displacement per iteration

  const nodeNames = nodeData.map((n) => n.name);

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const disp: Record<string, { dx: number; dz: number }> = {};
    nodeNames.forEach((name) => {
      disp[name] = { dx: 0, dz: 0 };
    });

    // Repulsion between all pairs
    for (let i = 0; i < nodeNames.length; i++) {
      for (let j = i + 1; j < nodeNames.length; j++) {
        const a = nodeNames[i];
        const b = nodeNames[j];
        const pa = positions[a];
        const pb = positions[b];
        if (!pa || !pb) continue;

        const dx = pa.x - pb.x;
        const dz = pa.z - pb.z;
        const distSq = dx * dx + dz * dz + 0.01;
        const dist = Math.sqrt(distSq);
        const force = REPULSION / distSq;

        disp[a].dx += (dx / dist) * force;
        disp[a].dz += (dz / dist) * force;
        disp[b].dx -= (dx / dist) * force;
        disp[b].dz -= (dz / dist) * force;
      }
    }

    // Attraction along edges (relation links)
    nodeNames.forEach((name) => {
      const neighbors = adjacency[name] ?? [];
      const pa = positions[name];
      if (!pa) return;
      neighbors.forEach((neighbor) => {
        const pb = positions[neighbor];
        if (!pb) return;
        const dx = pb.x - pa.x;
        const dz = pb.z - pa.z;
        const dist = Math.sqrt(dx * dx + dz * dz + 0.01);
        const force = ATTRACTION * (dist - IDEAL_LENGTH);
        disp[name].dx += (dx / dist) * force;
        disp[name].dz += (dz / dist) * force;
      });
    });

    // Apply displacement (clamped, preserve deck Y)
    nodeNames.forEach((name) => {
      const pos = positions[name];
      if (!pos) return;
      const d = disp[name];
      const mag = Math.sqrt(d.dx * d.dx + d.dz * d.dz);
      if (mag > MAX_DISP) {
        d.dx = (d.dx / mag) * MAX_DISP;
        d.dz = (d.dz / mag) * MAX_DISP;
      }
      pos.x += d.dx;
      pos.z += d.dz;
      // Y is locked to deck level — do not change
    });
  }

  return positions;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cable path parser
// calculatedPath is comma-separated node names.
// Also supports ' → ' arrow notation.
// ─────────────────────────────────────────────────────────────────────────────
function parseCablePath(cable: CableData): string[] {
  const raw = cable.calculatedPath || cable.path || '';
  if (!raw) return [];
  if (raw.includes(' → ')) return raw.split(' → ').map((s) => s.trim()).filter(Boolean);
  if (raw.includes(',')) return raw.split(',').map((s) => s.trim()).filter(Boolean);
  return [raw.trim()].filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// Camera reset helper component
// ─────────────────────────────────────────────────────────────────────────────
interface CameraControllerProps {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  resetSignal: number;
  autoRotate: boolean;
  center: THREE.Vector3;
  distance: number;
}

const CameraController: React.FC<CameraControllerProps> = ({
  controlsRef,
  resetSignal,
  autoRotate,
  center,
  distance,
}) => {
  const { camera } = useThree();
  const prevResetSignal = useRef(resetSignal);

  useFrame(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
    }
  });

  useEffect(() => {
    if (resetSignal !== prevResetSignal.current) {
      prevResetSignal.current = resetSignal;
      camera.position.set(
        center.x + distance,
        center.y + distance * 0.6,
        center.z + distance,
      );
      camera.lookAt(center);
      if (controlsRef.current) {
        controlsRef.current.target.copy(center);
        controlsRef.current.update();
      }
    }
  }, [resetSignal, camera, center, distance, controlsRef]);

  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Node sphere mesh
// ─────────────────────────────────────────────────────────────────────────────
interface NodeSphereProps {
  nodePos: NodePosition;
  isSelected: boolean;
  isHighlighted: boolean;
  connectedCableCount: number;
  showLabel: boolean;
  onClick: (name: string) => void;
}

const NodeSphere: React.FC<NodeSphereProps> = ({
  nodePos,
  isSelected,
  isHighlighted,
  connectedCableCount,
  showLabel,
  onClick,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const baseColor = getNodeColor(nodePos.node);
  const size = Math.max(0.4, Math.min(1.2, 0.4 + connectedCableCount * 0.08));

  const color = isSelected ? '#ffffff' : isHighlighted ? '#fbbf24' : baseColor;

  useFrame((_, delta) => {
    if (meshRef.current && (isSelected || isHighlighted)) {
      meshRef.current.rotation.y += delta * 1.5;
    }
  });

  return (
    <group position={nodePos.position}>
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onClick(nodePos.node.name);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'default';
        }}
      >
        <sphereGeometry args={[size, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={isSelected || isHighlighted ? color : '#000000'}
          emissiveIntensity={isSelected ? 0.6 : isHighlighted ? 0.4 : 0}
          roughness={0.3}
          metalness={0.4}
        />
      </mesh>

      {/* Glow ring for selected/highlighted */}
      {(isSelected || isHighlighted) && (
        <mesh>
          <sphereGeometry args={[size * 1.4, 16, 16]} />
          <meshStandardMaterial
            color={color}
            transparent
            opacity={0.15}
            side={THREE.BackSide}
          />
        </mesh>
      )}

      {showLabel && (
        <Text
          position={[0, size + 0.5, 0]}
          fontSize={0.6}
          color={isSelected ? '#ffffff' : isHighlighted ? '#fbbf24' : '#cbd5e1'}
          anchorX="center"
          anchorY="bottom"
          renderOrder={1}
          depthOffset={-1}
        >
          {nodePos.node.name}
        </Text>
      )}
    </group>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Cable line — traces actual node connections from calculatedPath
// ─────────────────────────────────────────────────────────────────────────────
interface CableLineProps {
  cable: CableData;
  positions: Record<string, THREE.Vector3>;
  isHighlighted: boolean;
}

const CableLine: React.FC<CableLineProps> = ({ cable, positions, isHighlighted }) => {
  const pathNodes = parseCablePath(cable);

  // Build point array by resolving each node name to its 3D position.
  // Skip segments where a node has no known position.
  const segments: THREE.Vector3[][] = [];
  let current: THREE.Vector3[] = [];

  for (const nodeName of pathNodes) {
    const pos = positions[nodeName];
    if (pos) {
      current.push(pos.clone());
    } else {
      // Gap in path — end current segment and start a new one
      if (current.length >= 2) segments.push(current);
      current = [];
    }
  }
  if (current.length >= 2) segments.push(current);

  if (segments.length === 0) return null;

  const color = isHighlighted ? '#fbbf24' : '#10b981';
  const lineWidth = isHighlighted ? 3 : 1;

  return (
    <>
      {segments.map((pts, i) => (
        <Line
          key={i}
          points={pts}
          color={color}
          lineWidth={lineWidth}
          transparent
          opacity={isHighlighted ? 1 : 0.4}
        />
      ))}
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Grid floor
// ─────────────────────────────────────────────────────────────────────────────
const GridFloor: React.FC<{ center: THREE.Vector3 }> = ({ center }) => (
  <gridHelper
    args={[200, 40, '#1e293b', '#1e293b']}
    position={[center.x, center.y - 2, center.z]}
  />
);

// ─────────────────────────────────────────────────────────────────────────────
// Main scene
// ─────────────────────────────────────────────────────────────────────────────
interface SceneProps {
  nodeData: NodeData[];
  cableData: CableData[];
  selectedNode: string | null;
  highlightedNodes: Set<string>;
  highlightedCables: Set<string>;
  showLabels: boolean;
  showNodes: boolean;
  showCables: boolean;
  cableCounts: Record<string, number>;
  positions: Record<string, THREE.Vector3>;
  center: THREE.Vector3;
  onNodeClick: (name: string) => void;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  resetSignal: number;
  autoRotate: boolean;
  distance: number;
}

const Scene: React.FC<SceneProps> = ({
  nodeData,
  cableData,
  selectedNode,
  highlightedNodes,
  highlightedCables,
  showLabels,
  showNodes,
  showCables,
  cableCounts,
  positions,
  center,
  onNodeClick,
  controlsRef,
  resetSignal,
  autoRotate,
  distance,
}) => (
  <>
    <ambientLight intensity={0.5} />
    <directionalLight position={[50, 80, 50]} intensity={0.8} castShadow />
    <pointLight position={[-50, 50, -50]} intensity={0.3} color="#3b82f6" />

    <GridFloor center={center} />

    <CameraController
      controlsRef={controlsRef}
      resetSignal={resetSignal}
      autoRotate={autoRotate}
      center={center}
      distance={distance}
    />

    <OrbitControls
      ref={controlsRef}
      makeDefault
      autoRotate={autoRotate}
      autoRotateSpeed={0.5}
      enableDamping
      dampingFactor={0.05}
      minDistance={5}
      maxDistance={500}
    />

    {/* Cable lines rendered below nodes */}
    {showCables &&
      cableData.map((cable) => (
        <CableLine
          key={cable.id}
          cable={cable}
          positions={positions}
          isHighlighted={highlightedCables.has(cable.name)}
        />
      ))}

    {/* Node spheres */}
    {showNodes &&
      nodeData.map((node) => {
        const pos = positions[node.name];
        if (!pos) return null;
        return (
          <NodeSphere
            key={node.name}
            nodePos={{ node, position: pos }}
            isSelected={selectedNode === node.name}
            isHighlighted={highlightedNodes.has(node.name)}
            connectedCableCount={cableCounts[node.name] ?? 0}
            showLabel={showLabels}
            onClick={onNodeClick}
          />
        );
      })}
  </>
);

// ─────────────────────────────────────────────────────────────────────────────
// Color legend
// ─────────────────────────────────────────────────────────────────────────────
interface LegendProps {
  nodeData: NodeData[];
}

const ColorLegend: React.FC<LegendProps> = ({ nodeData }) => {
  const [collapsed, setCollapsed] = useState(false);

  const useDeck = nodeData.some((n) => n.deck);
  const keys = useMemo(() => {
    if (useDeck) {
      return [...new Set(nodeData.map((n) => n.deck ?? 'default'))].sort();
    }
    return [...new Set(nodeData.map((n) => n.type ?? 'default'))].sort();
  }, [nodeData, useDeck]);

  if (keys.length === 0) return null;

  return (
    <div className="absolute bottom-4 left-4 bg-slate-900/90 border border-slate-700 rounded-lg shadow-2xl text-xs z-10 backdrop-blur-sm">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center gap-2 px-3 py-2 w-full text-slate-300 font-bold hover:text-white transition-colors"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        {useDeck ? 'Deck' : 'Type'} Legend
      </button>
      {!collapsed && (
        <div className="px-3 pb-3 space-y-1.5 max-h-52 overflow-y-auto">
          {keys.map((k) => (
            <div key={k} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: getNodeColorForLegend(k) }}
              />
              <span className="text-slate-300 capitalize">{k}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Node info panel (right sidebar)
// ─────────────────────────────────────────────────────────────────────────────
interface NodeInfoPanelProps {
  nodeData: NodeData[];
  selectedNode: string | null;
  cableCounts: Record<string, number>;
  cableData: CableData[];
  onNodeClick: (name: string) => void;
  nodeSearch: string;
  onNodeSearchChange: (v: string) => void;
}

const NodeInfoPanel: React.FC<NodeInfoPanelProps> = ({
  nodeData,
  selectedNode,
  cableCounts,
  cableData,
  onNodeClick,
  nodeSearch,
  onNodeSearchChange,
}) => {
  const selected = nodeData.find((n) => n.name === selectedNode);

  const connectedCables = useMemo(
    () =>
      selectedNode
        ? cableData.filter((c) => {
            const path = parseCablePath(c);
            return (
              path.includes(selectedNode) ||
              c.fromNode === selectedNode ||
              c.toNode === selectedNode
            );
          })
        : [],
    [selectedNode, cableData],
  );

  const filteredNodes = useMemo(
    () =>
      nodeData.filter((n) =>
        n.name.toLowerCase().includes(nodeSearch.toLowerCase()),
      ),
    [nodeData, nodeSearch],
  );

  return (
    <div className="w-64 shrink-0 bg-slate-900 border-l border-slate-800 flex flex-col overflow-hidden">
      {/* Selected node info */}
      <div className="p-3 border-b border-slate-800">
        <div className="flex items-center gap-2 mb-2">
          <Info size={14} className="text-blue-400" />
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">Node Info</span>
        </div>
        {selected ? (
          <div className="space-y-1.5">
            <div className="text-sm font-bold text-white truncate">{selected.name}</div>
            <div className="space-y-1 text-xs">
              {selected.deck && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Deck</span>
                  <span className="text-slate-300">{selected.deck}</span>
                </div>
              )}
              {selected.type && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Type</span>
                  <span className="text-slate-300 capitalize">{selected.type}</span>
                </div>
              )}
              {selected.structure && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Structure</span>
                  <span className="text-slate-300 truncate max-w-[120px]">{selected.structure}</span>
                </div>
              )}
              {selected.relation && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 shrink-0">Neighbors</span>
                  <span className="text-slate-300 text-right truncate max-w-[130px]">{selected.relation}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Cables</span>
                <span className="text-emerald-400 font-bold">{cableCounts[selected.name] ?? 0}</span>
              </div>
              {selected.linkLength !== undefined && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Link Len</span>
                  <span className="text-slate-300">{selected.linkLength}m</span>
                </div>
              )}
            </div>
            {connectedCables.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-800">
                <div className="text-xs text-slate-500 mb-1 font-bold">Connected Cables</div>
                <div className="space-y-0.5 max-h-24 overflow-y-auto">
                  {connectedCables.map((c) => (
                    <div key={c.id} className="text-xs text-slate-400 truncate">
                      {c.name}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-slate-600 italic">Click a node to inspect</div>
        )}
      </div>

      {/* Node list */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-2 border-b border-slate-800">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={nodeSearch}
              onChange={(e) => onNodeSearchChange(e.target.value)}
              placeholder="Search nodes..."
              className="w-full bg-slate-800 border border-slate-700 rounded pl-7 pr-2 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500"
            />
            {nodeSearch && (
              <button
                onClick={() => onNodeSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X size={10} />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto text-xs">
          {filteredNodes.length === 0 && (
            <div className="p-3 text-slate-600 italic text-center">No nodes</div>
          )}
          {filteredNodes.map((node) => (
            <button
              key={node.name}
              onClick={() => onNodeClick(node.name)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors border-b border-slate-800/50 ${
                selectedNode === node.name
                  ? 'bg-blue-900/40 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: getNodeColor(node) }}
              />
              <span className="truncate flex-1">{node.name}</span>
              {(cableCounts[node.name] ?? 0) > 0 && (
                <span className="text-emerald-500 font-mono">{cableCounts[node.name]}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Cable search panel
// ─────────────────────────────────────────────────────────────────────────────
interface CableSearchProps {
  cableData: CableData[];
  highlightedCables: Set<string>;
  onHighlight: (cableName: string | null) => void;
}

const CableSearchPanel: React.FC<CableSearchProps> = ({
  cableData,
  highlightedCables,
  onHighlight,
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const results = useMemo(
    () =>
      query.length >= 1
        ? cableData
            .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 12)
        : [],
    [cableData, query],
  );

  const activeHighlight = highlightedCables.size > 0 ? [...highlightedCables][0] : null;

  return (
    <div className="relative">
      <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5">
        <Search size={13} className="text-slate-500 shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search cable path..."
          className="bg-transparent text-xs text-slate-300 placeholder-slate-600 focus:outline-none w-44"
        />
        {(query || activeHighlight) && (
          <button
            onClick={() => {
              setQuery('');
              onHighlight(null);
              setOpen(false);
            }}
            className="text-slate-500 hover:text-slate-300"
          >
            <X size={12} />
          </button>
        )}
      </div>
      {activeHighlight && !open && (
        <div className="absolute top-full mt-1 left-0 bg-slate-800 border border-amber-500/50 rounded px-2 py-1 text-xs text-amber-400 whitespace-nowrap z-20">
          Highlighting: {activeHighlight}
        </div>
      )}
      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 left-0 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl z-20 min-w-[220px] max-h-52 overflow-y-auto">
          {results.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                onHighlight(c.name);
                setQuery(c.name);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-700 transition-colors border-b border-slate-700/50 last:border-0 ${
                highlightedCables.has(c.name) ? 'text-amber-400' : 'text-slate-300'
              }`}
            >
              <div className="font-bold truncate">{c.name}</div>
              {c.system && <div className="text-slate-500 truncate">{c.system}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Loading fallback
// ─────────────────────────────────────────────────────────────────────────────
const CanvasLoader: React.FC = () => (
  <div className="absolute inset-0 flex items-center justify-center bg-slate-950 z-10">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-xs text-slate-500">Loading 3D scene...</span>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Small reusable toggle button
// ─────────────────────────────────────────────────────────────────────────────
interface ToggleBtnProps {
  active: boolean;
  onToggle: () => void;
  activeLabel: string;
  inactiveLabel: string;
  activeColor: string;
}

const ToggleBtn: React.FC<ToggleBtnProps> = ({
  active,
  onToggle,
  activeLabel,
  inactiveLabel,
  activeColor,
}) => (
  <button
    onClick={onToggle}
    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
      active
        ? `bg-slate-800 border-slate-600 ${activeColor}`
        : 'bg-slate-900 border-slate-800 text-slate-600'
    }`}
  >
    {active ? <Eye size={13} /> : <EyeOff size={13} />}
    {active ? activeLabel : inactiveLabel}
  </button>
);

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
const ThreeDViewTab: React.FC<ThreeDViewTabProps> = ({ cableData, nodeData }) => {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(false);
  const [showNodes, setShowNodes] = useState(true);
  const [showCables, setShowCables] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const [highlightedCables, setHighlightedCables] = useState<Set<string>>(new Set());
  const [nodeSearch, setNodeSearch] = useState('');
  const [canvasKey, setCanvasKey] = useState(0);

  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // Build positions once per nodeData change (force-directed layout)
  const positions = useMemo(() => buildPositions(nodeData), [nodeData]);

  // Scene bounding info for camera placement
  const { center, distance } = useMemo(() => {
    const vecs = Object.values(positions);
    if (vecs.length === 0) return { center: new THREE.Vector3(), distance: 60 };
    const box = new THREE.Box3();
    vecs.forEach((v) => box.expandByPoint(v));
    const c = new THREE.Vector3();
    box.getCenter(c);
    const size = new THREE.Vector3();
    box.getSize(size);
    const d = Math.max(size.length() * 0.8, 30);
    return { center: c, distance: d };
  }, [positions]);

  // Cable counts per node (from path, or fallback to fromNode/toNode)
  const cableCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    cableData.forEach((c) => {
      const path = parseCablePath(c);
      if (path.length > 0) {
        path.forEach((nodeName) => {
          counts[nodeName] = (counts[nodeName] ?? 0) + 1;
        });
      } else {
        if (c.fromNode) counts[c.fromNode] = (counts[c.fromNode] ?? 0) + 1;
        if (c.toNode && c.toNode !== c.fromNode)
          counts[c.toNode] = (counts[c.toNode] ?? 0) + 1;
      }
    });
    return counts;
  }, [cableData]);

  // Highlighted nodes derived from highlighted cable paths
  const highlightedNodes = useMemo(() => {
    const nodes = new Set<string>();
    if (highlightedCables.size === 0) return nodes;
    cableData.forEach((c) => {
      if (highlightedCables.has(c.name)) {
        parseCablePath(c).forEach((n) => nodes.add(n));
        if (c.fromNode) nodes.add(c.fromNode);
        if (c.toNode) nodes.add(c.toNode);
      }
    });
    return nodes;
  }, [highlightedCables, cableData]);

  const handleNodeClick = useCallback((name: string) => {
    setSelectedNode((prev) => (prev === name ? null : name));
  }, []);

  const handleHighlightCable = useCallback((cableName: string | null) => {
    setHighlightedCables(cableName === null ? new Set() : new Set([cableName]));
  }, []);

  const handleReset = useCallback(() => {
    setResetSignal((s) => s + 1);
  }, []);

  const handleHardReset = useCallback(() => {
    setSelectedNode(null);
    setHighlightedCables(new Set());
    setNodeSearch('');
    setCanvasKey((k) => k + 1);
  }, []);

  const hasData = nodeData.length > 0;

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200 overflow-hidden">
      {/* Top toolbar */}
      <div className="shrink-0 px-4 py-2 bg-slate-800 border-b border-slate-700 flex flex-wrap items-center gap-3">
        <button
          onClick={handleReset}
          title="Reset camera view"
          className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
        >
          <RotateCcw size={13} /> Reset View
        </button>
        <button
          onClick={handleHardReset}
          title="Clear selection and reload"
          className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
        >
          <RefreshCw size={13} /> Clear
        </button>

        <div className="w-px h-5 bg-slate-700" />

        <ToggleBtn
          active={showNodes}
          onToggle={() => setShowNodes((v) => !v)}
          activeLabel="Nodes On"
          inactiveLabel="Nodes Off"
          activeColor="text-blue-400"
        />
        <ToggleBtn
          active={showCables}
          onToggle={() => setShowCables((v) => !v)}
          activeLabel="Cables On"
          inactiveLabel="Cables Off"
          activeColor="text-emerald-400"
        />
        <ToggleBtn
          active={showLabels}
          onToggle={() => setShowLabels((v) => !v)}
          activeLabel="Labels On"
          inactiveLabel="Labels Off"
          activeColor="text-amber-400"
        />
        <ToggleBtn
          active={autoRotate}
          onToggle={() => setAutoRotate((v) => !v)}
          activeLabel="Rotating"
          inactiveLabel="Auto-Rotate"
          activeColor="text-purple-400"
        />

        <div className="w-px h-5 bg-slate-700" />

        <CableSearchPanel
          cableData={cableData}
          highlightedCables={highlightedCables}
          onHighlight={handleHighlightCable}
        />

        {/* Stats */}
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          <span>{nodeData.length} nodes</span>
          <span className="text-slate-700">|</span>
          <span>{cableData.length} cables</span>
          {selectedNode && (
            <>
              <span className="text-slate-700">|</span>
              <span className="text-blue-400">Selected: {selectedNode}</span>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-slate-600 hover:text-slate-400"
              >
                <X size={12} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas area */}
        <div className="flex-1 relative bg-slate-950">
          {!hasData ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-slate-600">
              <div className="w-16 h-16 rounded-full border-2 border-slate-800 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <div className="text-center">
                <div className="text-sm font-bold text-slate-500">No node data loaded</div>
                <div className="text-xs text-slate-700 mt-1">
                  Upload node data from the sidebar to visualize the network
                </div>
              </div>
            </div>
          ) : (
            <Suspense fallback={<CanvasLoader />}>
              <Canvas
                key={canvasKey}
                camera={{
                  position: [
                    center.x + distance,
                    center.y + distance * 0.6,
                    center.z + distance,
                  ],
                  fov: 60,
                  near: 0.1,
                  far: 2000,
                }}
                gl={{ antialias: true, alpha: false }}
                style={{ background: '#020617' }}
                onPointerMissed={() => setSelectedNode(null)}
              >
                <Scene
                  nodeData={nodeData}
                  cableData={cableData}
                  selectedNode={selectedNode}
                  highlightedNodes={highlightedNodes}
                  highlightedCables={highlightedCables}
                  showLabels={showLabels}
                  showNodes={showNodes}
                  showCables={showCables}
                  cableCounts={cableCounts}
                  positions={positions}
                  center={center}
                  onNodeClick={handleNodeClick}
                  controlsRef={controlsRef}
                  resetSignal={resetSignal}
                  autoRotate={autoRotate}
                  distance={distance}
                />
              </Canvas>
            </Suspense>
          )}

          {hasData && <ColorLegend nodeData={nodeData} />}

          {hasData && (
            <div className="absolute bottom-4 right-4 text-xs text-slate-700 text-right space-y-0.5 pointer-events-none">
              <div>Left drag: Orbit</div>
              <div>Right drag: Pan</div>
              <div>Scroll: Zoom</div>
            </div>
          )}
        </div>

        {/* Right panel */}
        <NodeInfoPanel
          nodeData={nodeData}
          selectedNode={selectedNode}
          cableCounts={cableCounts}
          cableData={cableData}
          onNodeClick={handleNodeClick}
          nodeSearch={nodeSearch}
          onNodeSearchChange={setNodeSearch}
        />
      </div>
    </div>
  );
};

export default ThreeDViewTab;
