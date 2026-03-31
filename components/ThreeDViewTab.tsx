import React, { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Line, Sphere, Grid } from '@react-three/drei';
import { CableData, NodeData } from '../types';
import * as THREE from 'three';
import { RefreshCw, Eye, EyeOff } from 'lucide-react';

interface ThreeDViewTabProps {
  cableData: CableData[];
  nodeData: NodeData[];
}

const NetworkVisualization = ({ cableData, nodeData, showNodes, showCables }: { cableData: CableData[], nodeData: NodeData[], showNodes: boolean, showCables: boolean }) => {
  const nodePositions = useMemo(() => {
    const positions: Record<string, THREE.Vector3> = {};
    nodeData.forEach((node, index) => {
      const angle = (index / nodeData.length) * Math.PI * 2;
      const radius = 50;
      positions[node.name] = new THREE.Vector3(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius
      );
    });
    return positions;
  }, [nodeData]);

  const cableLines = useMemo(() => {
    const lines: THREE.Vector3[][] = [];
    cableData.forEach(cable => {
      if (!cable.calculatedPath) return;
      const pathNodes = cable.calculatedPath.split(' → ');
      const points: THREE.Vector3[] = [];
      
      for (let i = 0; i < pathNodes.length; i++) {
        const pos = nodePositions[pathNodes[i]];
        if (pos) {
          if (i === 0) {
            points.push(pos.clone());
          } else {
            const prevPos = nodePositions[pathNodes[i - 1]];
            if (prevPos) {
              // Right angle connection
              points.push(new THREE.Vector3(prevPos.x, pos.y, pos.z));
              points.push(pos.clone());
            }
          }
        }
      }
      if (points.length >= 2) {
        lines.push(points);
      }
    });
    return lines;
  }, [cableData, nodePositions]);

  const cableCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    cableData.forEach(c => {
      if (c.fromNode) counts[c.fromNode] = (counts[c.fromNode] || 0) + 1;
      if (c.toNode && c.toNode !== c.fromNode) {
        counts[c.toNode] = (counts[c.toNode] || 0) + 1;
      }
    });
    return counts;
  }, [cableData]);

  return (
    <group>
      <Grid infiniteGrid fadeDistance={200} sectionColor="#444" cellColor="#222" />
      {showNodes && nodeData.map(node => {
        const pos = nodePositions[node.name];
        if (!pos) return null;
        const count = cableCounts[node.name] || 0;
        const size = Math.max(0.5, Math.min(2, count * 0.2));
        return (
          <Sphere key={node.name} args={[size, 16, 16]} position={pos}>
            <meshLambertMaterial color="#3b82f6" />
          </Sphere>
        );
      })}
      {showCables && cableLines.map((points, idx) => (
        <Line key={idx} points={points} color="#10b981" lineWidth={1} />
      ))}
    </group>
  );
};

const ThreeDViewTab: React.FC<ThreeDViewTabProps> = ({ cableData, nodeData }) => {
  const [showNodes, setShowNodes] = useState(true);
  const [showCables, setShowCables] = useState(true);
  const [key, setKey] = useState(0); // For forcing re-render/reset

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200">
      <div className="p-4 border-b border-slate-800 flex flex-wrap gap-4 items-center bg-slate-800">
        <button onClick={() => setKey(k => k + 1)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-lg">
          <RefreshCw size={16}/> Reset View
        </button>
        <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-300 hover:text-white transition-colors">
          <input type="checkbox" checked={showNodes} onChange={e => setShowNodes(e.target.checked)} className="hidden" />
          {showNodes ? <Eye size={16} className="text-blue-400"/> : <EyeOff size={16} className="text-slate-500"/>}
          Show Nodes
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-300 hover:text-white transition-colors">
          <input type="checkbox" checked={showCables} onChange={e => setShowCables(e.target.checked)} className="hidden" />
          {showCables ? <Eye size={16} className="text-emerald-400"/> : <EyeOff size={16} className="text-slate-500"/>}
          Show Cables
        </label>
      </div>

      <div className="flex-1 bg-black relative">
        <Canvas key={key} camera={{ position: [100, 100, 100], fov: 75 }}>
          <ambientLight intensity={0.8} />
          <directionalLight position={[100, 100, 100]} intensity={1} />
          <NetworkVisualization cableData={cableData} nodeData={nodeData} showNodes={showNodes} showCables={showCables} />
          <OrbitControls makeDefault />
        </Canvas>
      </div>
    </div>
  );
};

export default ThreeDViewTab;
