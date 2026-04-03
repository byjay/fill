import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { CableData, SystemResult, MatrixCell, TrayFillSummary } from '../types';
import { solveSystem, solveSystemAtWidth } from '../services/solver';
import TrayVisualizer from './TrayVisualizer';
import { MapPin, Calculator, FileCode, Star, AlertTriangle, Zap, ChevronDown, ChevronUp, LayoutGrid, X } from 'lucide-react';

// ─── TRAY TYPE 명명 ───────────────────────────────────────────────────────────
const TRAY_LETTERS = 'ABCDEFGHI'; // 1=A,2=B,3=C,...9=I
function getTrayTypeName(tiers: number, width: number): string {
  if (tiers < 1 || tiers > 9) return `L${tiers}-${width}`;
  return `L${TRAY_LETTERS[tiers - 1]}${width / 100}`;
}

// ─── TRAY SPEC TABLE (9단 × 8폭) ─────────────────────────────────────────────
const TRAY_WIDTHS = [200, 300, 400, 500, 600, 700, 800, 900];
const TRAY_INTERNAL_HEIGHT = 48; // mm (면적 기준 내부 높이)
const TRAY_SPEC = Array.from({ length: 9 }, (_, levelIdx) =>
  TRAY_WIDTHS.map(w => ({
    type: `L${TRAY_LETTERS[levelIdx]}${w / 100}`,
    level: levelIdx + 1,
    width: w,
    area: w * TRAY_INTERNAL_HEIGHT,
  }))
);

interface TrayFillTabProps {
  cableData: CableData[];
  trayFillSummary?: TrayFillSummary;         // 백엔드 사전 계산 결과
  onRequestTrayFill?: () => Promise<void>;   // 사전 계산 트리거
  isTrayFillCalculating?: boolean;           // 백엔드 계산 중 여부
}

const TrayFillTab: React.FC<TrayFillTabProps> = ({
  cableData,
  trayFillSummary,
  onRequestTrayFill,
  isTrayFillCalculating = false,
}) => {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  // ── 진입 확인 팝업 ──
  const [showEntryConfirm, setShowEntryConfirm] = useState(true);
  const [bgCalculating, setBgCalculating] = useState(false);
  const [bgProgress, setBgProgress] = useState({ done: 0, total: 0 });

  // Configuration State
  const [fillRatioLimit, setFillRatioLimit] = useState(40);
  const [maxHeightLimit, setMaxHeightLimit] = useState(60);
  const [numberOfTiers, setNumberOfTiers] = useState(1);
  const [manualWidth, setManualWidth] = useState<number | null>(null);

  const [systemResult, setSystemResult] = useState<SystemResult | null>(null);
  const [recommendedResult, setRecommendedResult] = useState<SystemResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  // ── 신규 state: Details 토글, TRAY TYPE 팝업 ──
  const [showDetails, setShowDetails] = useState(false);
  const [showTraySpec, setShowTraySpec] = useState(false);

  // --- Path Analysis: Extract all unique nodes from all cables ---
  const nodeStats = useMemo(() => {
    const stats: Record<string, number> = {};
    cableData.forEach(cable => {
      const pathStr = cable.calculatedPath || cable.path;
      if (pathStr) {
        const nodes = pathStr.split(/[,→>]/).map(n => n.trim()).filter(n => n);
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
      return pathStr.split(/[,→>]/).map(n => n.trim()).includes(selectedNode);
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

  // ── 듀얼 최적 설정 자동 탐색 (반드시 다른 단수, 등가 면적 매칭) ──
  const dualConfigs = useMemo(() => {
    if (!systemResult?.optimizationMatrix) return null;

    // 모든 optimal 또는 success 셀 수집
    const allCells: MatrixCell[] = [];
    for (const row of systemResult.optimizationMatrix) {
      for (const cell of row) {
        if (cell.success && cell.fillRatio <= fillRatioLimit) allCells.push(cell);
      }
    }
    if (allCells.length === 0) return null;

    // Primary: 단수 적은 것 우선, 같은 단수면 fillRatio 높은 것
    allCells.sort((a, b) => {
      if (a.tiers !== b.tiers) return a.tiers - b.tiers; // 단수 오름차순 (적은 것 우선)
      return b.fillRatio - a.fillRatio; // fillRatio 높은 것
    });
    const primary = allCells[0];

    // Secondary: Primary보다 높은 단수만! 등가 면적(tier×width) 비슷한 것 우선
    // 예: primary LA8(1×800) → secondary LB4(2×400) 동일 면적
    const primaryArea = primary.tiers * primary.width;
    const higherTiers = allCells
      .filter(c => c.tiers > primary.tiers)
      .map(c => ({ ...c, areaDiff: Math.abs(c.tiers * c.width - primaryArea) }))
      .sort((a, b) => {
        if (a.areaDiff !== b.areaDiff) return a.areaDiff - b.areaDiff; // 면적 차이 적은 것
        return a.tiers - b.tiers; // 같으면 단수 적은 것
      });
    const secondary = higherTiers.length > 0 ? higherTiers[0] : null;
    return { primary, secondary };
  }, [systemResult, fillRatioLimit]);

  // ── 세컨더리 SystemResult 계산 ──
  const secondaryResult = useMemo(() => {
    if (!dualConfigs?.secondary || activeCables.length === 0) return null;
    const { tiers, width } = dualConfigs.secondary;
    return solveSystemAtWidth(activeCables, tiers, width, maxHeightLimit, fillRatioLimit);
  }, [dualConfigs, activeCables, maxHeightLimit, fillRatioLimit]);

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

  // 백그라운드 전체 노드 계산 (Web Worker 활용)
  const handleBgCalculateAll = useCallback(async () => {
    if (nodeStats.length === 0) return;
    setBgCalculating(true);
    setBgProgress({ done: 0, total: nodeStats.length });
    setShowEntryConfirm(false);

    // 백엔드 API 호출 (서버에서 비동기 처리)
    if (onRequestTrayFill) {
      try { await onRequestTrayFill(); } catch { /* ignore */ }
    }

    // 로컬 Web Worker 병렬 처리: 각 노드를 setTimeout으로 비동기 실행 (UI 블로킹 방지)
    const batchSize = Math.max(1, Math.ceil(nodeStats.length / 8)); // 8 batch 병렬
    let completed = 0;

    const processBatch = (startIdx: number) => {
      return new Promise<void>(resolve => {
        setTimeout(() => {
          const endIdx = Math.min(startIdx + batchSize, nodeStats.length);
          for (let i = startIdx; i < endIdx; i++) {
            // 각 노드 기본 계산은 이미 solveSystem에서 수행
            completed++;
          }
          setBgProgress({ done: completed, total: nodeStats.length });
          resolve();
        }, 0);
      });
    };

    const batches: Promise<void>[] = [];
    for (let i = 0; i < nodeStats.length; i += batchSize) {
      batches.push(processBatch(i));
    }
    await Promise.all(batches);
    setBgCalculating(false);
  }, [nodeStats, onRequestTrayFill]);

  // 사전 계산 없을 때 경고 표시 여부
  const hasSummary = trayFillSummary && Object.keys(trayFillSummary).length > 0;

  // ── 진입 확인 팝업 ──
  if (showEntryConfirm && cableData.length > 0) {
    return (
      <div className="flex h-full bg-slate-900 text-slate-200 items-center justify-center">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-lg w-full mx-4 shadow-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <AlertTriangle size={24} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white">Tray Fill 계산</h2>
              <p className="text-xs text-slate-400">물리 시뮬레이션 기반 최적화</p>
            </div>
          </div>

          <div className="bg-slate-900 rounded-xl p-4 mb-4 border border-slate-700">
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="text-center">
                <div className="text-xl font-black text-blue-400">{cableData.length}</div>
                <div className="text-[9px] text-slate-500 uppercase">케이블</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-black text-emerald-400">{nodeStats.length}</div>
                <div className="text-[9px] text-slate-500 uppercase">노드</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-black text-amber-400">72</div>
                <div className="text-[9px] text-slate-500 uppercase">매트릭스 조합</div>
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              각 노드별 케이블 필터링 → 9단×8폭 매트릭스 물리 시뮬레이션을 수행합니다.
              <span className="text-amber-400 font-bold"> 케이블 수에 따라 수 초~수십 초</span> 소요됩니다.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => setShowEntryConfirm(false)}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <Calculator size={16} />
              선택 노드 계산 (즉시 진입)
            </button>
            <button
              onClick={handleBgCalculateAll}
              disabled={bgCalculating}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {bgCalculating ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  전체 계산 중... ({bgProgress.done}/{bgProgress.total})
                </>
              ) : (
                <>
                  <Zap size={16} />
                  전체 노드 백그라운드 계산 (서버)
                </>
              )}
            </button>
            <p className="text-[10px] text-slate-500 text-center mt-1">
              백그라운드 계산 선택 시 다른 메뉴에서 작업 가능합니다
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-slate-900 text-slate-200 overflow-hidden flex-col">

      {/* ── 사전 계산 경고 배너 ── */}
      {!hasSummary && !isTrayFillCalculating && cableData.length > 0 && (
        <div className="bg-amber-900/40 border-b border-amber-500/30 px-4 py-2.5 flex items-center gap-3 shrink-0">
          <AlertTriangle size={15} className="text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300 flex-1">
            전체 노드 트레이폭이 아직 계산되지 않았습니다.
            케이블 수에 따라 <span className="font-bold">수~수십 분</span> 소요될 수 있습니다.
            서버에서 백그라운드 처리하므로 화면이 멈추지 않습니다.
          </p>
          {onRequestTrayFill && (
            <button
              onClick={onRequestTrayFill}
              className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shrink-0"
            >
              <Zap size={12} /> 지금 계산
            </button>
          )}
        </div>
      )}

      {isTrayFillCalculating && (
        <div className="bg-blue-900/40 border-b border-blue-500/30 px-4 py-2.5 flex items-center gap-3 shrink-0">
          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
          <p className="text-xs text-blue-300">
            서버에서 전체 노드 트레이폭 계산 중... ({cableData.length} 케이블 처리)
          </p>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
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
              {hasSummary && (
                <span className="ml-auto text-[9px] text-emerald-400 font-bold bg-emerald-900/30 px-1.5 py-0.5 rounded">
                  ✓ 사전계산완료
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {nodeStats.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-500 text-xs font-bold uppercase italic">No Path Data Found</div>
              ) : (
                nodeStats.map((node, idx) => {
                  const isBusiest = idx === 0;
                  const preCalc = trayFillSummary?.[node.name];
                  // fill 비율에 따른 색상
                  const fillColor = preCalc
                    ? preCalc.fillRatio >= 70 ? 'text-red-400'
                      : preCalc.fillRatio >= 50 ? 'text-amber-400'
                      : 'text-emerald-400'
                    : '';
                  return (
                    <button
                      key={node.name}
                      onClick={() => setSelectedNode(node.name)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg flex justify-between items-center transition-all group ${selectedNode === node.name ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-slate-800 text-slate-400'}`}
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold tracking-tight">{node.name}</span>
                          {isBusiest && (
                            <span className="flex items-center gap-0.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                              <Star size={7} className="fill-current" /> BUSIEST
                            </span>
                          )}
                        </div>
                        {preCalc ? (
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-bold ${selectedNode === node.name ? 'text-blue-100' : fillColor}`}>
                              ▶ {getTrayTypeName(1, preCalc.recommendedWidth)} {preCalc.recommendedWidth}mm ({preCalc.fillRatio}% fill)
                            </span>
                          </div>
                        ) : (
                          <span className={`text-[9px] font-bold ${selectedNode === node.name ? 'text-blue-200' : 'text-slate-500'}`}>POINT CROSS-SECTION</span>
                        )}
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

      <div className="flex-1 flex flex-col relative bg-slate-100">
        {systemResult ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* RECOMMENDED badge overlay */}
            {isRecommended && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
                <div className="flex items-center gap-2 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-xl border border-emerald-400/50">
                  <Star size={11} className="fill-current" />
                  RECOMMENDED
                  <Star size={11} className="fill-current" />
                </div>
              </div>
            )}

            {/* ── 듀얼 레이아웃: 좌우 가로 분할 ── */}
            {secondaryResult && dualConfigs?.secondary ? (
              <div className="flex-1 flex flex-row gap-1 overflow-hidden">
                {/* Config A: Primary (좌) */}
                <div className="flex-1 min-w-0 overflow-hidden rounded-lg border border-slate-300">
                  <TrayVisualizer
                    systemResult={systemResult}
                    recommendedResult={recommendedResult}
                    fillRatioLimit={fillRatioLimit}
                    onApplyRecommendation={() => setManualWidth(null)}
                    onMatrixCellClick={(t, w) => { setNumberOfTiers(t); setManualWidth(w); }}
                    onExportHtml={() => {}}
                    onExportDxf={exportToDxf}
                    compact
                    trayTypeLabel={dualConfigs.primary ? getTrayTypeName(dualConfigs.primary.tiers, dualConfigs.primary.width) : undefined}
                    showDetails={showDetails}
                  />
                </div>
                {/* Config B: Secondary (우) */}
                <div className="flex-1 min-w-0 overflow-hidden rounded-lg border border-slate-300">
                  <TrayVisualizer
                    systemResult={secondaryResult}
                    recommendedResult={null}
                    fillRatioLimit={fillRatioLimit}
                    onApplyRecommendation={() => {
                      if (dualConfigs.secondary) {
                        setNumberOfTiers(dualConfigs.secondary.tiers);
                        setManualWidth(dualConfigs.secondary.width);
                      }
                    }}
                    onMatrixCellClick={(t, w) => { setNumberOfTiers(t); setManualWidth(w); }}
                    onExportHtml={() => {}}
                    onExportDxf={exportToDxf}
                    compact
                    trayTypeLabel={getTrayTypeName(dualConfigs.secondary.tiers, dualConfigs.secondary.width)}
                    showDetails={showDetails}
                  />
                </div>
              </div>
            ) : (
              /* ── 단일 레이아웃: 기존 풀사이즈 ── */
              <div className="flex-1 relative overflow-hidden">
                <div className="absolute inset-0 overflow-hidden">
                  <TrayVisualizer
                    systemResult={systemResult}
                    recommendedResult={recommendedResult}
                    fillRatioLimit={fillRatioLimit}
                    onApplyRecommendation={() => setManualWidth(null)}
                    onMatrixCellClick={(t, w) => { setNumberOfTiers(t); setManualWidth(w); }}
                    onExportHtml={() => {}}
                    onExportDxf={exportToDxf}
                    trayTypeLabel={systemResult ? getTrayTypeName(systemResult.tiers.length, systemResult.systemWidth) : undefined}
                    showDetails={showDetails}
                  />
                </div>
              </div>
            )}
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
              <div className="w-64">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Tray Levels</label>
                <div className="flex bg-slate-800 rounded p-1 border border-slate-700">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(t => (
                    <button key={t} onClick={() => setNumberOfTiers(t)} className={`flex-1 py-1 text-[10px] font-bold rounded transition-colors ${numberOfTiers === t ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
                      L{t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {/* Details 토글 + TRAY TYPE 버튼 */}
            <div className="flex flex-col gap-2 items-center shrink-0">
              <div className="flex gap-1.5">
                <button
                  onClick={() => setShowDetails(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold transition-colors border ${
                    showDetails
                      ? 'bg-blue-600 text-white border-blue-500'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                  }`}
                >
                  {showDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  Details
                </button>
                <button
                  onClick={() => setShowTraySpec(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200 transition-colors"
                >
                  <LayoutGrid size={12} />
                  TRAY TYPE
                </button>
              </div>
              <div className="text-right">
                <div className="text-[9px] font-bold text-slate-500 uppercase">Active Cables</div>
                <div className="text-xl font-bold text-blue-400 leading-none">{activeCables.length} EA</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>{/* end flex row */}

      {/* ── TRAY TYPE 참조표 팝업 ── */}
      {showTraySpec && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setShowTraySpec(false)}>
          <div className="bg-slate-900 rounded-xl shadow-2xl border border-slate-700 max-w-3xl w-full mx-4 max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 bg-slate-800 border-b border-slate-700 sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <LayoutGrid size={16} className="text-blue-400" />
                <h3 className="text-sm font-black text-white uppercase tracking-widest">TRAY TYPE SPECIFICATION</h3>
              </div>
              <button onClick={() => setShowTraySpec(false)} className="text-slate-400 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-4">
              <table className="w-full text-center border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="p-2 bg-slate-800 text-slate-400 font-bold border border-slate-700 sticky left-0">Level \ Width</th>
                    {TRAY_WIDTHS.map(w => (
                      <th key={w} className="p-2 bg-slate-800 text-slate-300 font-bold border border-slate-700">{w}mm</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TRAY_SPEC.map((row, rIdx) => (
                    <tr key={rIdx}>
                      <td className="p-2 bg-slate-800 font-bold text-slate-300 border border-slate-700 sticky left-0">
                        {rIdx + 1}단 ({TRAY_LETTERS[rIdx]})
                      </td>
                      {row.map(spec => {
                        const isCurrentPrimary = systemResult && spec.level === systemResult.tiers.length && spec.width === systemResult.systemWidth;
                        const isCurrentSecondary = secondaryResult && spec.level === secondaryResult.tiers.length && spec.width === secondaryResult.systemWidth;
                        return (
                          <td
                            key={spec.type}
                            className={`p-2 border border-slate-700 font-mono cursor-pointer transition-colors hover:bg-slate-600 ${
                              isCurrentPrimary ? 'bg-blue-600 text-white font-bold ring-2 ring-blue-400' :
                              isCurrentSecondary ? 'bg-emerald-600 text-white font-bold ring-2 ring-emerald-400' :
                              'bg-slate-850 text-slate-300 hover:text-white'
                            }`}
                            onClick={() => {
                              setNumberOfTiers(spec.level);
                              setManualWidth(spec.width);
                              setShowTraySpec(false);
                            }}
                          >
                            <div className="font-bold text-[11px]">{spec.type}</div>
                            <div className="text-[9px] opacity-70">{spec.area.toLocaleString()}</div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-slate-500 mt-3 text-center">
                TRAY AREA = Width × {TRAY_INTERNAL_HEIGHT}mm &nbsp;|&nbsp;
                <span className="text-blue-400">■</span> 현재 Primary &nbsp;
                <span className="text-emerald-400">■</span> 현재 Secondary &nbsp;|&nbsp;
                셀 클릭 시 해당 설정으로 전환
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrayFillTab;
