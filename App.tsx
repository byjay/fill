import React, { useState, useCallback } from 'react';
import { CableData, NodeData } from './types';
import Sidebar from './components/Sidebar';
import DashboardTab from './components/DashboardTab';
import CableListTab from './components/CableListTab';
import NodeInfoTab from './components/NodeInfoTab';
import ThreeDViewTab from './components/ThreeDViewTab';
import RoutingTab from './components/RoutingTab';
import TrayFillTab from './components/TrayFillTab';
import { Box, LayoutDashboard, List, Network, Box as BoxIcon, Map, Layers, ChevronDown } from 'lucide-react';

type TabType = 'dashboard' | 'cables' | 'nodes' | '3d' | 'routing' | 'trayfill';

const App: React.FC = () => {
  const [cableData, setCableData] = useState<CableData[]>([]);
  const [nodeData, setNodeData] = useState<NodeData[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');

  const calculateShortestPath = useCallback((fromNode: string, toNode: string): { path: string[], length: number } | null => {
    if (fromNode === toNode) return { path: [fromNode], length: 0 };

    const nodeMap: Record<string, { relations: string[], linkLength: number }> = {};
    nodeData.forEach(node => {
      nodeMap[node.name] = {
        relations: node.relation ? node.relation.split(',').map(s => s.trim()).filter(Boolean) : [],
        linkLength: node.linkLength || 1
      };
    });

    if (!nodeMap[fromNode] || !nodeMap[toNode]) return null;

    const distances: Record<string, number> = {};
    const previous: Record<string, string | null> = {};
    const unvisited = new Set<string>();

    nodeData.forEach(node => {
      distances[node.name] = Infinity;
      previous[node.name] = null;
      unvisited.add(node.name);
    });
    distances[fromNode] = 0;

    while (unvisited.size > 0) {
      let currentNode: string | null = null;
      let minDist = Infinity;
      
      unvisited.forEach(node => {
        if (distances[node] < minDist) {
          minDist = distances[node];
          currentNode = node;
        }
      });

      if (currentNode === null || currentNode === toNode) break;
      unvisited.delete(currentNode);

      const neighbors = nodeMap[currentNode].relations;
      neighbors.forEach(neighbor => {
        if (unvisited.has(neighbor)) {
          const alt = distances[currentNode] + nodeMap[currentNode].linkLength;
          if (alt < distances[neighbor]) {
            distances[neighbor] = alt;
            previous[neighbor] = currentNode;
          }
        }
      });
    }

    if (distances[toNode] === Infinity) return null;

    const path: string[] = [];
    let current: string | null = toNode;
    while (current !== null) {
      path.unshift(current);
      current = previous[current];
    }

    return { path, length: Math.round(distances[toNode] * 10) / 10 };
  }, [nodeData]);

  const calculatePathWithCheckpoints = useCallback((fromNode: string, toNode: string, checkNodes: string[]): { path: string[], length: number } | null => {
    const fullPath = [fromNode];
    let totalLength = 0;
    let currentNode = fromNode;

    for (const checkpoint of checkNodes) {
      const segment = calculateShortestPath(currentNode, checkpoint);
      if (!segment) return null;
      
      fullPath.push(...segment.path.slice(1));
      totalLength += segment.length;
      currentNode = checkpoint;
    }

    const finalSegment = calculateShortestPath(currentNode, toNode);
    if (!finalSegment) return null;
    
    fullPath.push(...finalSegment.path.slice(1));
    totalLength += finalSegment.length;

    return { path: fullPath, length: totalLength };
  }, [calculateShortestPath]);

  const calculatePath = useCallback((fromNode: string, toNode: string, checkNodeStr = ''): { path: string[], length: number } | null => {
    const checkNodes = checkNodeStr ? checkNodeStr.split(',').map(s => s.trim()).filter(Boolean) : [];
    if (checkNodes.length > 0) {
      return calculatePathWithCheckpoints(fromNode, toNode, checkNodes);
    } else {
      return calculateShortestPath(fromNode, toNode);
    }
  }, [calculatePathWithCheckpoints, calculateShortestPath]);

  const handleCalculateAllPaths = useCallback(() => {
    if (nodeData.length === 0) {
      alert('Please load node data first.');
      return;
    }

    const newData = cableData.map(cable => {
      if (cable.fromNode && cable.toNode) {
        const result = calculatePath(cable.fromNode, cable.toNode, cable.checkNode);
        if (result) {
          return {
            ...cable,
            calculatedPath: result.path.join(','),
            calculatedLength: result.length + (cable.fromRest || 0) + (cable.toRest || 0)
          };
        }
      }
      return cable;
    });

    setCableData(newData);
  }, [cableData, nodeData, calculatePath]);

  const handleRecalculateSelected = useCallback((indices: number[]) => {
    const newData = [...cableData];
    indices.forEach(index => {
      const cable = newData[index];
      if (cable.fromNode && cable.toNode) {
        const result = calculatePath(cable.fromNode, cable.toNode, cable.checkNode);
        if (result) {
          newData[index] = {
            ...cable,
            calculatedPath: result.path.join(','),
            calculatedLength: result.length + (cable.fromRest || 0) + (cable.toRest || 0)
          };
        }
      }
    });
    setCableData(newData);
  }, [cableData, calculatePath]);

  const handleUpdateCheckNode = useCallback((index: number, checkNode: string) => {
    const newData = [...cableData];
    newData[index] = { ...newData[index], checkNode };
    
    const cable = newData[index];
    if (cable.fromNode && cable.toNode) {
      const result = calculatePath(cable.fromNode, cable.toNode, checkNode);
      if (result) {
        newData[index].calculatedPath = result.path.join(',');
        newData[index].calculatedLength = result.length + (cable.fromRest || 0) + (cable.toRest || 0);
      }
    }
    setCableData(newData);
  }, [cableData, calculatePath]);

  const handleExportAllData = useCallback(() => {
    const data = {
      cables: cableData,
      nodes: nodeData,
      exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'seastar_all_data.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [cableData, nodeData]);

  const handleExportCableList = useCallback(() => {
    const csvRows = ['CABLE_SYSTEM,WD_PAGE,CABLE_NAME,CABLE_TYPE,FROM_ROOM,FROM_EQUIP,FROM_NODE,FROM_REST,TO_ROOM,TO_EQUIP,TO_NODE,TO_REST,TOTAL_LENGTH,CABLE_PATH,CABLE_OUTDIA,CHECK_NODE,SUPPLY_DECK,POR_WEIGHT,REMARK,REVISION'];
    cableData.forEach(cable => {
      const length = cable.calculatedLength || cable.length || 0;
      const path = cable.calculatedPath || cable.path || '';
      csvRows.push(`"${cable.system}","${cable.wdPage || ''}","${cable.name}","${cable.type}","${cable.fromRoom || ''}","${cable.fromEquip || ''}","${cable.fromNode}",${cable.fromRest || 0},"${cable.toRoom || ''}","${cable.toEquip || ''}","${cable.toNode}",${cable.toRest || 0},${length.toFixed(1)},"${path}",${cable.od || 0},"${cable.checkNode || ''}","${cable.supplyDeck || ''}",${cable.porWeight || 0},"${cable.remark || ''}","${cable.revision || ''}"`);
    });
    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'seastar_export.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [cableData]);

  const handleExportNodeInfo = useCallback(() => {
    const csvRows = ['NODE_NAME,STRUCTURE_NAME,NODE_TYPE,RELATION,LINK_LENGTH,AREA_SIZE,CONNECTED_CABLES'];
    
    const cableCounts: Record<string, number> = {};
    cableData.forEach(c => {
      if (c.fromNode) cableCounts[c.fromNode] = (cableCounts[c.fromNode] || 0) + 1;
      if (c.toNode && c.toNode !== c.fromNode) {
        cableCounts[c.toNode] = (cableCounts[c.toNode] || 0) + 1;
      }
    });

    nodeData.forEach(node => {
      const connectedCables = cableCounts[node.name] || 0;
      csvRows.push(`${node.name},${node.structure || ''},${node.type || ''},${node.relation || ''},${node.linkLength || 0},${node.areaSize || 0},${connectedCables}`);
    });
    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'node_info.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [cableData, nodeData]);

  const handleRefreshAll = useCallback(() => {
    setCableData([...cableData]);
    setNodeData([...nodeData]);
  }, [cableData, nodeData]);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
    { id: 'cables', label: 'Cable List', icon: <List size={16} /> },
    { id: 'nodes', label: 'Node Info', icon: <Network size={16} /> },
    { id: '3d', label: '3D View', icon: <BoxIcon size={16} /> },
    { id: 'routing', label: 'Routing', icon: <Map size={16} /> },
    { id: 'trayfill', label: 'Tray Fill', icon: <Layers size={16} /> },
  ] as const;

  const [menuOpen, setMenuOpen] = useState(false);
  const activeTabObj = tabs.find(t => t.id === activeTab);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans flex flex-col h-screen overflow-hidden">
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex justify-between items-center shrink-0 shadow-md z-30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-900/50">
            <Box size={18}/>
          </div>
          <h1 className="text-sm font-black tracking-tight text-white">SEASTAR <span className="text-blue-500">PRO</span></h1>
        </div>

        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
          >
            {activeTabObj?.icon} {activeTabObj?.label} <ChevronDown size={14} className={`transition-transform ${menuOpen ? 'rotate-180' : ''}`}/>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl py-1 min-w-[180px] z-50">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id as TabType); setMenuOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold transition-colors ${
                    activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <span>{cableData.length} cables</span>
          <span>|</span>
          <span>{nodeData.length} nodes</span>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          cableData={cableData}
          nodeData={nodeData}
          onCableDataChange={setCableData}
          onNodeDataChange={setNodeData}
          onCalculateAllPaths={handleCalculateAllPaths}
          onRefreshAll={handleRefreshAll}
          onExportAllData={handleExportAllData}
        />

        <main className="flex-1 flex flex-col overflow-hidden bg-slate-950">
          <div className="flex-1 overflow-hidden">
            {activeTab === 'dashboard' && <DashboardTab cableData={cableData} nodeData={nodeData} />}
            {activeTab === 'cables' && <CableListTab cableData={cableData} onCalculateAllPaths={handleCalculateAllPaths} onExportCableList={handleExportCableList} />}
            {activeTab === 'nodes' && <NodeInfoTab nodeData={nodeData} cableData={cableData} onExportNodeInfo={handleExportNodeInfo} />}
            {activeTab === '3d' && <ThreeDViewTab cableData={cableData} nodeData={nodeData} />}
            {activeTab === 'routing' && <RoutingTab cableData={cableData} onUpdateCheckNode={handleUpdateCheckNode} onRecalculateSelected={handleRecalculateSelected} />}
            {activeTab === 'trayfill' && <TrayFillTab cableData={cableData} />}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;