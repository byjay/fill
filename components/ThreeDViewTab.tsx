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
  RotateCw,
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

type CameraPreset = 'iso' | 'top' | 'side' | 'front' | null;

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
// 좌표 스케일 자동 계산 (최장 축 = 100 Three.js 단위)
// ─────────────────────────────────────────────────────────────────────────────
function computeCoordScale(nodes: NodeData[]): number {
  const xs = nodes.map(n => n.x ?? 0);
  const ys = nodes.map(n => n.y ?? 0);
  const zs = nodes.map(n => n.z ?? 0);
  const maxRange = Math.max(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
    Math.max(...zs) - Math.min(...zs),
    1,
  );
  return 100 / maxRange;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-layout: ship-like linear grid grouped by deck/structure, with light spring adjustment
// ─────────────────────────────────────────────────────────────────────────────
function buildPositions(
  nodeData: NodeData[],
  mode: 'coord' | 'auto' = 'auto',
): Record<string, THREE.Vector3> {
  const positions: Record<string, THREE.Vector3> = {};

  if (nodeData.length === 0) return positions;

  // 좌표 모드: 실제 x, y, z 좌표 사용 (선박 좌표계 → Three.js 매핑)
  // 선박 X(선폭) → Three.js X, 선박 Y(선미→선수) → Three.js Z, 선박 Z(높이) → Three.js Y
  if (mode === 'coord') {
    const withCoords = nodeData.filter(
      n => n.x !== undefined && n.y !== undefined && n.z !== undefined,
    );
    if (withCoords.length > 0) {
      const scale = computeCoordScale(withCoords);
      // 최솟값 오프셋 계산 (원점 근처로 이동)
      const minX = Math.min(...withCoords.map(n => n.x ?? 0));
      const minY = Math.min(...withCoords.map(n => n.y ?? 0));
      const minZ = Math.min(...withCoords.map(n => n.z ?? 0));
      nodeData.forEach(node => {
        if (node.x !== undefined && node.y !== undefined && node.z !== undefined) {
          positions[node.name] = new THREE.Vector3(
            (node.x - minX) * scale,
            (node.z - minZ) * scale,  // 선박 Z(높이) → Three.js Y(상하)
            (node.y - minY) * scale,  // 선박 Y(선미→선수) → Three.js Z
          );
        }
      });
      return positions;
    }
  }

  // ── Build adjacency from relation field ──
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

  // ── Group by deck → structure for ship-like linear layout ──
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

  // ── Initial placement: linear grid grouped by structure (ship-like) ──
  decks.forEach((deck) => {
    const deckNodes = deckMap[deck];
    const y = deckYMap[deck] ?? 0;

    // Sub-group by structure within each deck
    const structMap: Record<string, NodeData[]> = {};
    deckNodes.forEach((node) => {
      const struct = node.structure ?? '_none';
      if (!structMap[struct]) structMap[struct] = [];
      structMap[struct].push(node);
    });
    const structs = Object.keys(structMap).sort();

    structs.forEach((struct, sIdx) => {
      const nodes = structMap[struct];
      const zOffset = sIdx * 12; // structures spread along Z (fore/aft)

      // Arrange nodes in a rectangular grid within each structure
      const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
      nodes.forEach((node, nIdx) => {
        const row = Math.floor(nIdx / cols);
        const col = nIdx % cols;
        positions[node.name] = new THREE.Vector3(
          col * 5,        // X: across beam (port/starboard)
          y,              // Y: deck height
          zOffset + row * 5, // Z: fore/aft within structure group
        );
      });
    });
  });

  // ── Light spring adjustment (50 iterations) — pull connected nodes closer ──
  // without collapsing into circles
  const SPRING_ITERATIONS = 50;
  const SPRING_ATTRACTION = 0.02;
  const REPEL_DIST = 8;
  const MAX_DISP = 1.5;

  const nodeNames = nodeData.map((n) => n.name);

  for (let iter = 0; iter < SPRING_ITERATIONS; iter++) {
    const disp: Record<string, { dx: number; dz: number }> = {};
    nodeNames.forEach((name) => {
      disp[name] = { dx: 0, dz: 0 };
    });

    // Attraction: pull connected nodes slightly closer
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
        disp[name].dx += dx * SPRING_ATTRACTION;
        disp[name].dz += dz * SPRING_ATTRACTION;
      });
    });

    // Repulsion: push apart only if nodes are too close (< REPEL_DIST)
    for (let i = 0; i < nodeNames.length; i++) {
      for (let j = i + 1; j < nodeNames.length; j++) {
        const a = nodeNames[i];
        const b = nodeNames[j];
        const pa = positions[a];
        const pb = positions[b];
        if (!pa || !pb) continue;

        const dx = pa.x - pb.x;
        const dz = pa.z - pb.z;
        const dist = Math.sqrt(dx * dx + dz * dz + 0.01);
        if (dist < REPEL_DIST) {
          const push = (REPEL_DIST - dist) * 0.1;
          const nx = dx / dist;
          const nz = dz / dist;
          disp[a].dx += nx * push;
          disp[a].dz += nz * push;
          disp[b].dx -= nx * push;
          disp[b].dz -= nz * push;
        }
      }
    }

    // Apply displacement with clamp
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
    });
  }

  return positions;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cable path parser
// ─────────────────────────────────────────────────────────────────────────────
function parseCablePath(cable: CableData): string[] {
  const raw = cable.calculatedPath || cable.path || '';
  if (!raw) return [];
  if (raw.includes(' → ')) return raw.split(' → ').map((s) => s.trim()).filter(Boolean);
  if (raw.includes(',')) return raw.split(',').map((s) => s.trim()).filter(Boolean);
  return [raw.trim()].filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// Camera controller — handles reset, presets, and auto-rotate
// ─────────────────────────────────────────────────────────────────────────────
interface CameraControllerProps {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  resetSignal: number;
  autoRotate: boolean;
  center: THREE.Vector3;
  distance: number;
  cameraPreset: CameraPreset;
  onPresetApplied: () => void;
}

const CameraController: React.FC<CameraControllerProps> = ({
  controlsRef,
  resetSignal,
  autoRotate,
  center,
  distance,
  cameraPreset,
  onPresetApplied,
}) => {
  const { camera } = useThree();
  const prevResetSignal = useRef(resetSignal);
  const prevPreset = useRef<CameraPreset>(null);

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

  useEffect(() => {
    if (cameraPreset && cameraPreset !== prevPreset.current) {
      prevPreset.current = cameraPreset;

      let px = center.x;
      let py = center.y;
      let pz = center.z;

      switch (cameraPreset) {
        case 'iso':
          px = center.x + distance;
          py = center.y + distance;
          pz = center.z + distance;
          break;
        case 'top':
          px = center.x;
          py = center.y + distance * 1.5;
          pz = center.z;
          break;
        case 'side':
          px = center.x + distance * 1.5;
          py = center.y;
          pz = center.z;
          break;
        case 'front':
          px = center.x;
          py = center.y;
          pz = center.z + distance * 1.5;
          break;
      }

      camera.position.set(px, py, pz);
      camera.lookAt(center);
      if (controlsRef.current) {
        controlsRef.current.target.copy(center);
        controlsRef.current.update();
      }
      onPresetApplied();
    }
  }, [cameraPreset, camera, center, distance, controlsRef, onPresetApplied]);

  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Node sphere mesh — with fire-path animation support
// ─────────────────────────────────────────────────────────────────────────────
interface NodeSphereProps {
  nodePos: NodePosition;
  isSelected: boolean;
  isHighlighted: boolean;
  isFirePath: boolean;
  connectedCableCount: number;
  showLabel: boolean;
  onClick: (name: string) => void;
}

const NodeSphere: React.FC<NodeSphereProps> = ({
  nodePos,
  isSelected,
  isHighlighted,
  isFirePath,
  connectedCableCount,
  showLabel,
  onClick,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const baseColor = getNodeColor(nodePos.node);
  const size = Math.max(0.4, Math.min(1.2, 0.4 + connectedCableCount * 0.08));

  const color = isSelected ? '#ffffff' : isHighlighted ? '#fbbf24' : baseColor;

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    if (isFirePath) {
      // Scale pulse: 1.0 → 1.4
      const scaleFactor = 1.0 + 0.2 * (Math.sin(t * 3) * 0.5 + 0.5);
      if (meshRef.current) {
        meshRef.current.scale.setScalar(scaleFactor);
      }
      // Color shift: red (#ff4444) → orange (#ff8800)
      const s = Math.sin(t * 3) * 0.5 + 0.5; // 0..1
      const r = 1.0;
      const g = 0.267 + (0.533 - 0.267) * s; // ~0.267 to 0.533
      const b = 0.267 * (1 - s);
      if (matRef.current) {
        matRef.current.color.setRGB(r, g, b);
        matRef.current.emissive.setRGB(r * 0.5, g * 0.3, b * 0.1);
        matRef.current.emissiveIntensity = 0.3 + 0.7 * s;
      }
      // Glow ring scale
      if (glowRef.current) {
        glowRef.current.scale.setScalar(scaleFactor * 1.1);
      }
    } else if (isSelected || isHighlighted) {
      if (meshRef.current) {
        meshRef.current.rotation.y += 1.5 * (1 / 60);
      }
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
        {/* Box for equipment/panel; sphere for junction/penetration/others */}
        {(() => {
          const t = (nodePos.node.type ?? '').toLowerCase();
          return t === 'equipment' || t === 'panel'
            ? <boxGeometry args={[size * 1.6, size * 1.6, size * 1.6]} />
            : <sphereGeometry args={[size, 16, 16]} />;
        })()}
        <meshStandardMaterial
          ref={matRef}
          color={isFirePath ? '#ff4444' : color}
          emissive={
            isFirePath ? '#ff4444' : isSelected || isHighlighted ? color : '#000000'
          }
          emissiveIntensity={isFirePath ? 0.6 : isSelected ? 0.6 : isHighlighted ? 0.4 : 0}
          roughness={0.3}
          metalness={0.4}
        />
      </mesh>

      {/* Glow ring for selected / highlighted / fire-path */}
      {(isSelected || isHighlighted || isFirePath) && (
        <mesh ref={glowRef}>
          <sphereGeometry args={[size * 1.4, 16, 16]} />
          <meshStandardMaterial
            color={isFirePath ? '#ff6600' : color}
            transparent
            opacity={isFirePath ? 0.25 : 0.15}
            side={THREE.BackSide}
          />
        </mesh>
      )}

      {showLabel && (
        <Text
          position={[0, size + 0.5, 0]}
          fontSize={0.6}
          color={
            isFirePath
              ? '#ff8800'
              : isSelected
              ? '#ffffff'
              : isHighlighted
              ? '#fbbf24'
              : '#cbd5e1'
          }
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
// Supports fire-path animation mode
// ─────────────────────────────────────────────────────────────────────────────
interface CableLineProps {
  cable: CableData;
  positions: Record<string, THREE.Vector3>;
  isHighlighted: boolean;
  isFirePath: boolean;
}

const CableLine: React.FC<CableLineProps> = ({
  cable,
  positions,
  isHighlighted,
  isFirePath,
}) => {
  const pathNodes = parseCablePath(cable);

  const segments: THREE.Vector3[][] = [];
  let current: THREE.Vector3[] = [];

  if (pathNodes.length > 0) {
    // calculatedPath 기반 렌더링
    for (const nodeName of pathNodes) {
      const pos = positions[nodeName];
      if (pos) {
        current.push(pos.clone());
      } else {
        if (current.length >= 2) segments.push(current);
        current = [];
      }
    }
    if (current.length >= 2) segments.push(current);
  }

  // Fallback: path가 없거나 세그먼트가 비었으면 fromNode → toNode 직선 연결
  if (segments.length === 0) {
    const fromPos = cable.fromNode ? positions[cable.fromNode] : null;
    const toPos = cable.toNode ? positions[cable.toNode] : null;
    if (fromPos && toPos) {
      segments.push([fromPos.clone(), toPos.clone()]);
    }
  }

  if (segments.length === 0) return null;

  // Animated fire-path line color/opacity driven by time
  const FireLine: React.FC<{ pts: THREE.Vector3[] }> = ({ pts }) => {
    const lineRef = useRef<THREE.Line>(null);

    useFrame((state) => {
      const t = state.clock.elapsedTime;
      const s = Math.sin(t * 4) * 0.5 + 0.5; // 0..1
      if (lineRef.current) {
        const mat = lineRef.current.material as THREE.LineBasicMaterial;
        if (mat) {
          // Interpolate red→orange
          const r = 1.0;
          const g = 0.267 + (0.533 - 0.267) * s;
          mat.color.setRGB(r, g, 0);
          mat.opacity = 0.5 + 0.5 * s;
        }
      }
    });

    return (
      <primitive
        object={
          (() => {
            const geometry = new THREE.BufferGeometry().setFromPoints(pts);
            const material = new THREE.LineBasicMaterial({
              color: new THREE.Color('#ff4444'),
              transparent: true,
              opacity: 0.8,
              linewidth: 3,
            });
            const line = new THREE.Line(geometry, material);
            return line;
          })()
        }
        ref={lineRef}
      />
    );
  };

  if (isFirePath) {
    return (
      <>
        {segments.map((pts, i) => (
          <FireLine key={i} pts={pts} />
        ))}
      </>
    );
  }

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
// Grid floor (자동 배치 모드용)
// ─────────────────────────────────────────────────────────────────────────────
const GridFloor: React.FC<{ center: THREE.Vector3 }> = ({ center }) => (
  <gridHelper
    args={[200, 40, '#1e293b', '#1e293b']}
    position={[center.x, center.y - 2, center.z]}
  />
);

// ─────────────────────────────────────────────────────────────────────────────
// Deck 반투명 평면 (좌표 모드용)
// ─────────────────────────────────────────────────────────────────────────────
interface DeckPlaneProps {
  yPosition: number;
  sizeX: number;
  sizeZ: number;
  centerX: number;
  centerZ: number;
  color: string;
  label: string;
}

const DeckPlane: React.FC<DeckPlaneProps> = ({ yPosition, sizeX, sizeZ, centerX, centerZ, color, label }) => (
  <group position={[centerX, yPosition, centerZ]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[sizeX, sizeZ]} />
      <meshStandardMaterial color={color} transparent opacity={0.07} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
    {/* 테두리 라인 */}
    <Line
      points={[
        [-sizeX / 2, 0, -sizeZ / 2], [sizeX / 2, 0, -sizeZ / 2],
        [sizeX / 2, 0, sizeZ / 2], [-sizeX / 2, 0, sizeZ / 2],
        [-sizeX / 2, 0, -sizeZ / 2],
      ]}
      color={color} lineWidth={1} transparent opacity={0.35}
    />
    <Text position={[-sizeX / 2 + 1, 0.5, -sizeZ / 2 + 1]} fontSize={2} color={color} anchorX="left" anchorY="bottom">
      {`DECK ${label}`}
    </Text>
  </group>
);

// ─────────────────────────────────────────────────────────────────────────────
// 좌표축 + 눈금 (좌표 모드용)
// ─────────────────────────────────────────────────────────────────────────────
interface CoordAxesProps {
  origin: THREE.Vector3;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  scale: number; // Three.js 단위 → 실제 단위 역수
}

const CoordAxes: React.FC<CoordAxesProps> = ({ origin, sizeX, sizeY, sizeZ, scale }) => {
  const tickStep = Math.pow(10, Math.floor(Math.log10((Math.max(sizeX, sizeZ) / scale) / 5)));
  const realTickStep = tickStep * scale;

  const xTicks: number[] = [];
  for (let v = 0; v <= sizeX; v += realTickStep) xTicks.push(v);
  const zTicks: number[] = [];
  for (let v = 0; v <= sizeZ; v += realTickStep) zTicks.push(v);
  const yTicks: number[] = [];
  for (let v = 0; v <= sizeY; v += realTickStep) yTicks.push(v);

  const fmt = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}km` : `${v.toFixed(0)}m`;

  return (
    <group position={origin}>
      {/* X축 (빨강) */}
      <Line points={[[0,0,0],[sizeX+4,0,0]]} color="#ef4444" lineWidth={2} />
      <Text position={[sizeX+6,0,0]} fontSize={2} color="#ef4444" anchorX="left">X</Text>
      {xTicks.map(v => (
        <group key={`xt${v}`} position={[v,0,0]}>
          <Line points={[[0,-0.5,0],[0,0.5,0]]} color="#ef4444" lineWidth={1} />
          <Text position={[0,-2,0]} fontSize={1.2} color="#6b7280" anchorX="center">{fmt(v/scale)}</Text>
        </group>
      ))}
      {/* Y축 = 선박 Z 높이 (초록) */}
      <Line points={[[0,0,0],[0,sizeY+4,0]]} color="#22c55e" lineWidth={2} />
      <Text position={[0,sizeY+6,0]} fontSize={2} color="#22c55e" anchorX="center">Z(Height)</Text>
      {yTicks.map(v => (
        <group key={`yt${v}`} position={[0,v,0]}>
          <Line points={[[-0.5,0,0],[0.5,0,0]]} color="#22c55e" lineWidth={1} />
          <Text position={[-2,0,0]} fontSize={1.2} color="#6b7280" anchorX="right">{fmt(v/scale)}</Text>
        </group>
      ))}
      {/* Z축 = 선박 Y 선수미 (파랑) */}
      <Line points={[[0,0,0],[0,0,sizeZ+4]]} color="#3b82f6" lineWidth={2} />
      <Text position={[0,0,sizeZ+6]} fontSize={2} color="#3b82f6" anchorX="center">Y(Fore/Aft)</Text>
      {zTicks.map(v => (
        <group key={`zt${v}`} position={[0,0,v]}>
          <Line points={[[0,-0.5,0],[0,0.5,0]]} color="#3b82f6" lineWidth={1} />
          <Text position={[0,-2,0]} fontSize={1.2} color="#6b7280" anchorX="center">{fmt(v/scale)}</Text>
        </group>
      ))}
    </group>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main scene
// ─────────────────────────────────────────────────────────────────────────────
interface DeckPlaneData {
  label: string;
  yPosition: number;
  color: string;
}

interface SceneProps {
  nodeData: NodeData[];
  cableData: CableData[];
  selectedNode: string | null;
  highlightedNodes: Set<string>;
  highlightedCables: Set<string>;
  firePathNodes: Set<string>;
  firePathCables: Set<string>;
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
  cameraPreset: CameraPreset;
  onPresetApplied: () => void;
  // 좌표 모드 전용
  isCoordMode: boolean;
  showDeckPlanes: boolean;
  deckPlanes: DeckPlaneData[];
  sceneBounds: { sizeX: number; sizeY: number; sizeZ: number };
  coordScale: number;
}

const Scene: React.FC<SceneProps> = ({
  nodeData,
  cableData,
  selectedNode,
  highlightedNodes,
  highlightedCables,
  firePathNodes,
  firePathCables,
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
  cameraPreset,
  onPresetApplied,
  isCoordMode,
  showDeckPlanes,
  deckPlanes,
  sceneBounds,
  coordScale,
}) => (
  <>
    <ambientLight intensity={0.5} />
    <directionalLight position={[50, 80, 50]} intensity={0.8} castShadow />
    <pointLight position={[-50, 50, -50]} intensity={0.3} color="#3b82f6" />

    {/* 좌표 모드: Deck 평면 + 축 / 자동 모드: 격자 */}
    {isCoordMode ? (
      <>
        {showDeckPlanes && deckPlanes.map(dp => (
          <DeckPlane
            key={dp.label}
            label={dp.label}
            yPosition={dp.yPosition}
            sizeX={sceneBounds.sizeX * 1.15}
            sizeZ={sceneBounds.sizeZ * 1.15}
            centerX={center.x}
            centerZ={center.z}
            color={dp.color}
          />
        ))}
        <CoordAxes
          origin={new THREE.Vector3(
            center.x - sceneBounds.sizeX / 2,
            center.y - sceneBounds.sizeY / 2,
            center.z - sceneBounds.sizeZ / 2,
          )}
          sizeX={sceneBounds.sizeX}
          sizeY={sceneBounds.sizeY}
          sizeZ={sceneBounds.sizeZ}
          scale={coordScale}
        />
      </>
    ) : (
      <GridFloor center={center} />
    )}

    <CameraController
      controlsRef={controlsRef}
      resetSignal={resetSignal}
      autoRotate={autoRotate}
      center={center}
      distance={distance}
      cameraPreset={cameraPreset}
      onPresetApplied={onPresetApplied}
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
          isFirePath={firePathCables.has(cable.name)}
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
            isFirePath={firePathNodes.has(node.name)}
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
              {selected.x !== undefined && (
                <div className="border-t border-slate-800 mt-1 pt-1">
                  <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wide mb-0.5">Coordinates</div>
                  <div className="font-mono text-[10px] text-cyan-400">
                    X:{selected.x.toFixed(1)} Y:{(selected.y ?? 0).toFixed(1)} Z:{(selected.z ?? 0).toFixed(1)}
                  </div>
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
// Camera preset button
// ─────────────────────────────────────────────────────────────────────────────
interface PresetBtnProps {
  label: string;
  onClick: () => void;
}

const PresetBtn: React.FC<PresetBtnProps> = ({ label, onClick }) => (
  <button
    onClick={onClick}
    className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors border bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white hover:border-slate-500 active:scale-95"
  >
    {label}
  </button>
);

// ─────────────────────────────────────────────────────────────────────────────
// Auto-rotate toggle button
// ─────────────────────────────────────────────────────────────────────────────
interface AutoRotateBtnProps {
  active: boolean;
  onToggle: () => void;
}

const AutoRotateBtn: React.FC<AutoRotateBtnProps> = ({ active, onToggle }) => (
  <button
    onClick={onToggle}
    title={active ? 'Stop auto-rotate' : 'Start auto-rotate'}
    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
      active
        ? 'bg-purple-900/60 border-purple-500 text-purple-300 shadow-[0_0_8px_rgba(168,85,247,0.4)]'
        : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'
    }`}
  >
    <RotateCw size={13} className={active ? 'animate-spin' : ''} style={active ? { animationDuration: '2s' } : {}} />
    {active ? 'Rotating' : 'Auto-Rotate'}
  </button>
);

// ─────────────────────────────────────────────────────────────────────────────
// Unique cable paths count helper
// ─────────────────────────────────────────────────────────────────────────────
function countUniquePaths(cableData: CableData[]): number {
  const paths = new Set<string>();
  cableData.forEach((c) => {
    const raw = c.calculatedPath || c.path || '';
    if (raw.trim()) paths.add(raw.trim());
  });
  return paths.size;
}

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
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>(null);

  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // 좌표 모드 / 자동 배치 모드
  const hasCoordData = useMemo(
    () => nodeData.some(n => n.x !== undefined && n.y !== undefined && n.z !== undefined),
    [nodeData],
  );
  const [layoutMode, setLayoutMode] = useState<'coord' | 'auto'>('auto');
  const [showDeckPlanes, setShowDeckPlanes] = useState(true);
  const isCoordMode = layoutMode === 'coord' && hasCoordData;

  // 좌표 모드 전환 시 자동으로 coord 모드 활성화
  useEffect(() => {
    if (hasCoordData) setLayoutMode('coord');
    else setLayoutMode('auto');
  }, [hasCoordData]);

  // Build positions
  const positions = useMemo(
    () => buildPositions(nodeData, isCoordMode ? 'coord' : 'auto'),
    [nodeData, isCoordMode],
  );

  // coordScale: Three.js 단위 → 실제 단위 변환
  const coordScale = useMemo(() => {
    if (!isCoordMode) return 1;
    const withCoords = nodeData.filter(n => n.x !== undefined && n.y !== undefined && n.z !== undefined);
    return withCoords.length > 0 ? computeCoordScale(withCoords) : 1;
  }, [nodeData, isCoordMode]);

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

  // Scene bounds (bounding box)
  const sceneBounds = useMemo(() => {
    const vecs = Object.values(positions);
    if (vecs.length === 0) return { sizeX: 100, sizeY: 10, sizeZ: 100 };
    const box = new THREE.Box3();
    vecs.forEach(v => box.expandByPoint(v));
    const size = new THREE.Vector3();
    box.getSize(size);
    return { sizeX: Math.max(size.x, 1), sizeY: Math.max(size.y, 1), sizeZ: Math.max(size.z, 1) };
  }, [positions]);

  // Deck 평면 데이터 (좌표 모드용)
  const deckPlanes = useMemo((): DeckPlaneData[] => {
    if (!isCoordMode) return [];
    const deckYs: Record<string, number[]> = {};
    nodeData.forEach(n => {
      if (!n.deck) return;
      const pos = positions[n.name];
      if (!pos) return;
      if (!deckYs[n.deck]) deckYs[n.deck] = [];
      deckYs[n.deck].push(pos.y);
    });
    return Object.entries(deckYs).map(([label, ys]) => ({
      label,
      yPosition: ys.reduce((a, b) => a + b, 0) / ys.length,
      color: DECK_COLORS[label.padStart(2, '0')] ?? DECK_COLORS.default,
    })).sort((a, b) => a.yPosition - b.yPosition);
  }, [nodeData, positions, isCoordMode]);

  // Cable counts per node
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

  // Fire-path: when a cable is highlighted, show fire animation on its path
  const firePathCables = useMemo(() => {
    if (highlightedCables.size === 0) return new Set<string>();
    return new Set(highlightedCables);
  }, [highlightedCables]);

  const firePathNodes = useMemo(() => {
    if (highlightedCables.size === 0) return new Set<string>();
    return new Set(highlightedNodes);
  }, [highlightedCables, highlightedNodes]);

  // Disable auto-rotate when a path is highlighted (fire path active)
  const effectiveAutoRotate = autoRotate && highlightedCables.size === 0;

  // Unique path count for stats bar
  const pathCount = useMemo(() => countUniquePaths(cableData), [cableData]);

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

  const handlePreset = useCallback((preset: CameraPreset) => {
    setCameraPreset(preset);
  }, []);

  const handlePresetApplied = useCallback(() => {
    setCameraPreset(null);
  }, []);

  const hasData = nodeData.length > 0;

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200 overflow-hidden">
      {/* Top toolbar */}
      <div className="shrink-0 px-4 py-2 bg-slate-800 border-b border-slate-700 flex flex-wrap items-center gap-3">
        {/* Reset / Clear */}
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

        {/* Camera presets */}
        <PresetBtn label="ISO" onClick={() => handlePreset('iso')} />
        <PresetBtn label="TOP" onClick={() => handlePreset('top')} />
        <PresetBtn label="SIDE" onClick={() => handlePreset('side')} />
        <PresetBtn label="FRONT" onClick={() => handlePreset('front')} />

        <div className="w-px h-5 bg-slate-700" />

        {/* Visibility toggles */}
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

        {/* Auto-rotate with visual active state */}
        <AutoRotateBtn
          active={autoRotate}
          onToggle={() => setAutoRotate((v) => !v)}
        />

        {/* Coord mode toggle (only when coord data exists) */}
        {hasCoordData && (
          <>
            <div className="w-px h-5 bg-slate-700" />
            <button
              onClick={() => setLayoutMode(m => m === 'coord' ? 'auto' : 'coord')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                isCoordMode
                  ? 'bg-cyan-900/60 border-cyan-500 text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.3)]'
                  : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'
              }`}
            >
              {isCoordMode ? '📍 Coord' : '🔀 Auto'}
            </button>
            {isCoordMode && (
              <button
                onClick={() => setShowDeckPlanes(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                  showDeckPlanes
                    ? 'bg-slate-800 border-slate-600 text-amber-400'
                    : 'bg-slate-900 border-slate-800 text-slate-600'
                }`}
              >
                {showDeckPlanes ? <Eye size={13} /> : <EyeOff size={13} />}
                Decks
              </button>
            )}
          </>
        )}

        <div className="w-px h-5 bg-slate-700" />

        <CableSearchPanel
          cableData={cableData}
          highlightedCables={highlightedCables}
          onHighlight={handleHighlightCable}
        />

        {/* Stats: X Nodes · Y Cables · Z Paths */}
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-500 font-mono">
          <span className="text-slate-400 font-bold">{nodeData.length}</span>
          <span className="text-slate-600">Nodes</span>
          <span className="text-slate-700">·</span>
          <span className="text-slate-400 font-bold">{cableData.length}</span>
          <span className="text-slate-600">Cables</span>
          <span className="text-slate-700">·</span>
          <span className="text-slate-400 font-bold">{pathCount}</span>
          <span className="text-slate-600">Paths</span>
          {selectedNode && (
            <>
              <span className="text-slate-700 mx-1">|</span>
              <span className="text-blue-400">Selected: {selectedNode}</span>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-slate-600 hover:text-slate-400"
              >
                <X size={12} />
              </button>
            </>
          )}
          {highlightedCables.size > 0 && (
            <>
              <span className="text-slate-700 mx-1">|</span>
              <span className="text-orange-400 flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                Fire Path
              </span>
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
                  firePathNodes={firePathNodes}
                  firePathCables={firePathCables}
                  showLabels={showLabels}
                  showNodes={showNodes}
                  showCables={showCables}
                  cableCounts={cableCounts}
                  positions={positions}
                  center={center}
                  onNodeClick={handleNodeClick}
                  controlsRef={controlsRef}
                  resetSignal={resetSignal}
                  autoRotate={effectiveAutoRotate}
                  distance={distance}
                  cameraPreset={cameraPreset}
                  onPresetApplied={handlePresetApplied}
                  isCoordMode={isCoordMode}
                  showDeckPlanes={showDeckPlanes}
                  deckPlanes={deckPlanes}
                  sceneBounds={sceneBounds}
                  coordScale={coordScale}
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
