import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { CableData, SystemResult } from '../types';
import { solveSystem, solveSystemAtWidth } from '../services/solver';
import TrayVisualizer from './TrayVisualizer';
import { MapPin, Calculator, FileCode, Star } from 'lucide-react';

interface TrayFillTabProps {
  cableData: CableData[];
}

const TrayFillTab: React.FC<TrayFillTabProps> = ({ cableData }) => {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // Configuration State
  // Change 1: Default fillRatioLimit is now 40 (was 60)
  const [fillRatioLimit, setFillRatioLimit] = useState(40);
  const [maxHeightLimit, setMaxHeightLimit] = useState(60);
  const [numberOfTiers, setNumberOfTiers] = useState(1);
  const [manualWidth, setManualWidth] = useState<number | null>(null);

  const [systemResult, setSystemResult] = useState<SystemResult | null>(null);
  const [recommendedResult, setRecommendedResult] = useState<SystemResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  // --- Path Analysis: Extract all unique nodes from all cables ---
  const nodeStats = useMemo(() => {
    const stats: Record<string, number> = {};
    cableData.forEach(cable => {
      const pathStr = cable.calculatedPath || cable.path;
      if (pathStr) {
        const nodes = pathStr.split(/,|→/).map(n => n.trim()).filter(n => n);
        const uniqueInCable = new Set<string>(nodes);
        uniqueInCable.forEach(n => {
          stats[n] = (stats[n] || 0) + 1;
        });
      }
    });
    return Object.entries(stats)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));
  }, [cableData]);

  // Change 2: Auto-select the busiest node on mount (or when nodeStats first becomes available)
  useEffect(() => {
    if (nodeStats.length > 0 && selectedNode === null) {
      setSelectedNode(nodeStats[0].name);
    }
  }, [nodeStats]); // intentionally omit selectedNode to run only once on first populate

  // --- Filter Cables based on Node Selection ---
  const activeCables = useMemo(() => {
    if (!selectedNode) return cableData;
    return cableData.filter(c => {
      const pathStr = c.calculatedPath || c.path;
      if (!pathStr) return false;
      return pathStr.split(/,|→/).map(n => n.trim()).includes(selectedNode);
    });
  }, [cableData, selectedNode]);

  // --- Calculation Logic ---
  const calculate = useCallback((overrideWidth: number | null = null, overrideTiers: number | null = null) => {
    if (activeCables.length === 0) {
      setSystemResult(null);
      return;
    }
    setIsCalculating(true);
    const tiersToUse = overrideTiers ?? numberOfTiers;

    setTimeout(() => {
      const optimalSolution = solveSystem(activeCables, tiersToUse, maxHeightLimit, fillRatioLimit);
      setRecommendedResult(optimalSolution);
      let actualSolution: SystemResult;
      if (overrideWidth !== null) {
        actualSolution = solveSystemAtWidth(activeCables, tiersToUse, overrideWidth, maxHeightLimit, fillRatioLimit);
      } else {
        actualSolution = optimalSolution;
      }
      setSystemResult(actualSolution);
      setIsCalculating(false);
    }, 10);
  }, [activeCables, maxHeightLimit, fillRatioLimit, numberOfTiers]);

  useEffect(() => {
    if (activeCables.length > 0) {
      calculate(manualWidth, numberOfTiers);
    } else {
      setSystemResult(null);
    }
  }, [activeCables, manualWidth, numberOfTiers, maxHeightLimit, fillRatioLimit, calculate]);

  // Change 4: Determine whether current result matches the recommended (optimal) result
  const isRecommended = useMemo(() => {
    if (!systemResult || !recommendedResult) return false;
    return (
      systemResult.systemWidth === recommendedResult.systemWidth &&
      systemResult.tiers.length === recommendedResult.tiers.length
    );
  }, [systemResult, recommendedResult]);

  const exportToDxf = () => {
    if (!systemResult) return;
    const dateStr = new Date().toISOString().split('T')[0];
    const nodeStr = selectedNode ? `Node-${selectedNode}` : 'Total';
    const TRAY_WIDTH = systemResult.systemWidth;
    const TIER_PITCH = 250;
    const POST_WIDTH = 25;

    let dxf = `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n10\n0\nLAYER\n2\nTRAY_STRUCTURE\n70\n0\n62\n7\n6\nCONTINUOUS\n0\nLAYER\n2\nCABLES\n70\n0\n62\n4\n6\nCONTINUOUS\n0\nLAYER\n2\nTEXT_INFO\n70\n0\n62\n2\n6\nCONTINUOUS\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n`;

    const addLine = (x1: number, y1: number, x2: number, y2: number, layer: string) => {
      dxf += `0\nLINE\n8\n${layer}\n10\n${x1}\n20\n${y1}\n30\n0.0\n11\n${x2}\n21\n${y2}\n31\n0.0\n`;
    };
    const addCircle = (cx: number, cy: number, r: number, layer: string) => {
      dxf += `0\nCIRCLE\n8\n${layer}\n10\n${cx}\n20\n${cy}\n30\n0.0\n40\n${r}\n`;
    };
    const addText = (x: number, y: number, text: string, height: number, layer: string, align: 'left' | 'center' = 'left') => {
      dxf += `0\nTEXT\n8\n${layer}\n10\n${x}\n20\n${y}\n30\n0.0\n40\n${height}\n1\n${text}\n`;
      if (align === 'center') dxf += `72\n1\n73\n2\n11\n${x}\n21\n${y}\n31\n0.0\n`;
    };

    const totalHeight = systemResult.tiers.length * TIER_PITCH;
    // Structure
    addLine(-POST_WIDTH, 0, 0, 0, 'TRAY_STRUCTURE');
    addLine(0, 0, 0, totalHeight, 'TRAY_STRUCTURE');
    addLine(TRAY_WIDTH, 0, TRAY_WIDTH + POST_WIDTH, 0, 'TRAY_STRUCTURE');
    addLine(TRAY_WIDTH, 0, TRAY_WIDTH, totalHeight, 'TRAY_STRUCTURE');

    systemResult.tiers.forEach((tier, idx) => {
      const floorY = idx * TIER_PITCH;
      addLine(0, floorY, TRAY_WIDTH, floorY, 'TRAY_STRUCTURE');
      addText(-40, floorY + 20, `LV. L${idx + 1}`, 15, 'TEXT_INFO');
      tier.cables.forEach(c => {
        const safeY = Math.max(c.y, c.od / 2);
        addCircle(c.x - 10, floorY + safeY, c.od / 2, 'CABLES');
        addText(c.x - 10, floorY + safeY, String(c.displayIndex), Math.max(5, c.od * 0.4), 'TEXT_INFO', 'center');
      });
    });
    addText(TRAY_WIDTH / 2, -50, `TRAY WIDTH: ${TRAY_WIDTH} mm (NODE: ${selectedNode || 'ALL'})`, 25, 'TEXT_INFO', 'center');
    dxf += `0\nENDSEC\n0\nEOF`;

    const blob = new Blob([dxf], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Tray_${nodeStr}_${dateStr}.dxf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="flex h-full bg-slate-900 text-slate-200 overflow-hidden">
      <div className="w-1/4 flex flex-col border-r border-slate-800 bg-slate-800">
        <div className="p-4 border-b border-slate-700 flex justify-between items-center">
          <button
            onClick={() => setSelectedNode(null)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${!selectedNode ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          >
            Global Analysis
          </button>
          <button
            onClick={exportToDxf}
            disabled={!systemResult}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-30 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-lg transition-all"
          >
            <FileCode size={14} /> Export DXF
          </button>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden p-4">
          <div className="bg-slate-900 rounded-xl border border-slate-700 flex flex-col overflow-hidden h-full shadow-xl">
            <div className="bg-slate-800 text-slate-300 p-3 flex items-center gap-2 shrink-0 border-b border-slate-700">
              <MapPin size={14} className="text-blue-400" />
              <h3 className="text-xs font-bold uppercase tracking-widest">Aggregate Path Nodes</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {nodeStats.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-500 text-xs font-bold uppercase italic">No Path Data Found</div>
              ) : (
                nodeStats.map((node, idx) => {
                  const isBusiest = idx === 0;
                  return (
                    <button
                      key={node.name}
                      onClick={() => setSelectedNode(node.name)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg flex justify-between items-center transition-all group ${selectedNode === node.name ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-slate-800 text-slate-400'}`}
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold tracking-tight">{node.name}</span>
                          {/* Busiest node indicator in the list */}
                          {isBusiest && (
                            <span className="flex items-center gap-0.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                              <Star size={7} className="fill-current" /> BUSIEST
                            </span>
                          )}
                        </div>
                        <span className={`text-[9px] font-bold ${selectedNode === node.name ? 'text-blue-200' : 'text-slate-500'}`}>POINT CROSS-SECTION</span>
                      </div>
                      <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${selectedNode === node.name ? 'bg-white text-blue-600' : 'bg-slate-700 text-slate-400'}`}>
                        {node.count} CABLES
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Change 3 + Change 4: Main panel — no blocking overlay since we auto-select on mount.
          The "RECOMMENDED" badge is injected as an overlay on the visualizer when isRecommended. */}
      <div className="flex-1 flex flex-col relative bg-slate-100">
        {systemResult ? (
          <div className="flex-1 relative overflow-hidden">
            {/* Change 4: RECOMMENDED badge overlay */}
            {isRecommended && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
                <div className="flex items-center gap-2 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-xl border border-emerald-400/50">
                  <Star size={11} className="fill-current" />
                  RECOMMENDED
                  <Star size={11} className="fill-current" />
                </div>
              </div>
            )}
            {/* Change 3: TrayVisualizer is wrapped in a container that forces it to fill the viewport.
                The TrayVisualizer itself already uses SVG viewBox — we ensure the parent never clips it
                by keeping overflow-hidden and letting the component fill naturally. */}
            <div className="absolute inset-0 overflow-hidden">
              <TrayVisualizer
                systemResult={systemResult}
                recommendedResult={recommendedResult}
                fillRatioLimit={fillRatioLimit}
                onApplyRecommendation={() => setManualWidth(null)}
                onMatrixCellClick={(t, w) => { setNumberOfTiers(t); setManualWidth(w); }}
                onExportHtml={() => {}}
                onExportDxf={exportToDxf}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-4 opacity-50 bg-slate-900">
            {isCalculating ? (
              <>
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="font-bold uppercase tracking-widest text-sm text-blue-400">Calculating...</p>
              </>
            ) : (
              <>
                <Calculator size={64} />
                <p className="font-bold uppercase tracking-widest text-sm">Awaiting Data Analysis</p>
              </>
            )}
          </div>
        )}

        <div className="bg-slate-900 border-t border-slate-800 p-4 shrink-0 shadow-lg z-30">
          <div className="max-w-6xl mx-auto flex items-center gap-8">
            <div className="flex-1 flex gap-6">
              <div className="flex-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Stacking Height Limit (H)</label>
                <div className="flex items-center gap-3">
                  <input type="range" min="40" max="200" step="10" value={maxHeightLimit} onChange={e => setMaxHeightLimit(parseInt(e.target.value))} className="flex-1 accent-blue-500" />
                  <span className="text-xs font-bold text-blue-400 bg-slate-800 px-2 py-1 rounded border border-slate-700 w-12 text-center">{maxHeightLimit}</span>
                </div>
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Fill Rate Limit (%)</label>
                <div className="flex items-center gap-3">
                  <input type="range" min="10" max="80" step="5" value={fillRatioLimit} onChange={e => setFillRatioLimit(parseInt(e.target.value))} className="flex-1 accent-blue-500" />
                  <span className="text-xs font-bold text-blue-400 bg-slate-800 px-2 py-1 rounded border border-slate-700 w-12 text-center">{fillRatioLimit}%</span>
                </div>
              </div>
              <div className="w-48">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Tray Levels</label>
                <div className="flex bg-slate-800 rounded p-1 border border-slate-700">
                  {[1, 2, 3, 4, 5].map(t => (
                    <button key={t} onClick={() => setNumberOfTiers(t)} className={`flex-1 py-1 text-[10px] font-bold rounded transition-colors ${numberOfTiers === t ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
                      L{t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Active Cables at Node</div>
              <div className="text-2xl font-bold text-blue-400 leading-none">{activeCables.length} EA</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrayFillTab;
