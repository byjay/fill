
import React, { useState, useMemo, useEffect } from 'react';
import { SystemResult } from '../types';
import { ZoomIn, ZoomOut, Maximize, Calculator, CheckCircle2, AlertTriangle, List, Grid, Download, ArrowRight, FileCode } from 'lucide-react';

interface TrayVisualizerProps {
  systemResult: SystemResult;
  recommendedResult: SystemResult | null;
  fillRatioLimit: number;
  onApplyRecommendation: () => void;
  onMatrixCellClick: (tiers: number, width: number) => void;
  onExportHtml: () => void;
  onExportDxf: () => void;
  compact?: boolean;        // 컴팩트 모드: 사이드바·매트릭스 숨김, 헤더 축소
  trayTypeLabel?: string;   // TRAY TYPE 라벨 (예: "LA4")
  showDetails?: boolean;    // Summary/Matrix 표시 여부 (compact=false일 때만 유효)
}

const TrayVisualizer: React.FC<TrayVisualizerProps> = ({
  systemResult,
  recommendedResult,
  fillRatioLimit,
  onApplyRecommendation,
  onMatrixCellClick,
  onExportHtml,
  onExportDxf,
  compact = false,
  trayTypeLabel,
  showDetails = true,
}) => {
  // zoom===0 means "fit to viewport" (SVG uses width/height 100%)
  // zoom>0 means explicit pixel scaling with scroll
  const [zoom, setZoom] = useState(0);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  // Clear highlight and reset to fit view when systemResult changes (re-calculation)
  useEffect(() => {
      setHighlightedId(null);
      setZoom(0);
  }, [systemResult]);

  // --- Status Analysis Logic ---
  const currentWidth = systemResult.systemWidth;
  const optimalWidth = recommendedResult?.systemWidth || currentWidth;
  const maxFill = Math.max(...systemResult.tiers.map(t => t.fillRatio));
  const isPhysicallySuccessful = systemResult.success;

  let status: 'optimal' | 'overfilled' | 'inefficient' | 'error' = 'optimal';
  let message = "Optimized Result";

  if (!isPhysicallySuccessful) {
      status = 'error';
      message = "Physical Conflict: Cables do not fit vertically.";
  } else if (maxFill > fillRatioLimit) {
      status = 'overfilled';
      message = `Over Capacity: Fill rate exceeds ${fillRatioLimit}% limit.`;
  } else if (currentWidth > optimalWidth) {
      status = 'inefficient';
      message = `Low Efficiency: Tray is wider than necessary.`;
  } else if (currentWidth < optimalWidth) {
      status = 'optimal';
  }

  // --- Theme Colors based on Status ---
  const theme = {
      optimal: { bg: 'bg-slate-900', border: 'border-slate-700', icon: 'bg-blue-600', text: 'text-white' },
      overfilled: { bg: 'bg-red-600', border: 'border-red-700', icon: 'bg-red-800', text: 'text-white' },
      inefficient: { bg: 'bg-amber-500', border: 'border-amber-600', icon: 'bg-amber-700', text: 'text-white' },
      error: { bg: 'bg-red-700', border: 'border-red-800', icon: 'bg-red-900', text: 'text-white' },
  }[status];


  const getTypeColor = (type: string) => {
    let hash = 0;
    for (let i = 0; i < type.length; i++) {
        hash = type.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 85%, 70%)`;
  };

  const processedTiers = useMemo(() => {
    let globalCounter = 1;
    return systemResult.tiers.map(tier => ({
      ...tier,
      cables: tier.cables.map(c => ({
        ...c,
        displayIndex: globalCounter++
      }))
    }));
  }, [systemResult]);

  const TRAY_WIDTH = systemResult.systemWidth;
  const TRAY_HEIGHT = systemResult.maxHeightPerTier;
  // TIER_PITCH: 단 간격 = 120mm 고정 (사용자 지정)
  // SVG 스케일: 1mm = 1px 기준, 단 간격 120px
  const TIER_PITCH = 120;
  const TIER_COUNT = systemResult.tiers.length;

  const POST_WIDTH = 25;
  const BEAM_HEIGHT = 15;
  
  const MARGIN_LEFT_LABEL = 80;
  const MARGIN_RIGHT_LABEL = 240; 
  const MARGIN_TOP = 50;
  const MARGIN_BOTTOM = 80;

  const DRAWING_WIDTH = MARGIN_LEFT_LABEL + POST_WIDTH + TRAY_WIDTH + POST_WIDTH + MARGIN_RIGHT_LABEL;
  const STRUCTURE_HEIGHT = (TIER_COUNT * TIER_PITCH) + MARGIN_TOP;
  const SVG_HEIGHT = STRUCTURE_HEIGHT + MARGIN_BOTTOM;

  const X_TRAY_START = MARGIN_LEFT_LABEL + POST_WIDTH;
  const X_TRAY_END = X_TRAY_START + TRAY_WIDTH;
  const X_POST_RIGHT_START = X_TRAY_END;

  const getTierY = (tierIndex: number) => {
      // 단 바닥 Y 좌표: 하단부터 쌓아 올림, 단 간격 TIER_PITCH(120)
      return STRUCTURE_HEIGHT - MARGIN_TOP - (tierIndex * TIER_PITCH);
  };

  const handleCableClick = (id: string) => {
      setHighlightedId(prev => prev === id ? null : id);
  };

  const handleExternalAction = (action: () => void) => {
      setHighlightedId(null); // Clear highlight on action
      action();
  };

  return (
    <div className={`flex ${compact ? 'flex-col' : 'flex-col lg:flex-row'} h-full bg-slate-100 gap-3 overflow-hidden`}>
      <div className="flex-1 flex flex-col gap-3 h-full overflow-hidden">
        {/* Main Visualizer */}
        <div className="flex-1 bg-white rounded-lg shadow-lg border border-gray-300 overflow-hidden relative flex flex-col">

            {/* Dynamic Status Header */}
            <div className={`${theme.bg} ${theme.text} ${compact ? 'px-3 py-2' : 'p-4'} shadow-md border-b ${theme.border} shrink-0 transition-colors duration-300`}>
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className={`${theme.icon} ${compact ? 'p-1.5' : 'p-2'} rounded shadow-md transition-colors`}>
                            {status === 'optimal' ? <CheckCircle2 size={compact ? 14 : 18} /> : <AlertTriangle size={compact ? 14 : 18} />}
                        </div>
                        <div>
                            {trayTypeLabel && (
                                <span className="text-[10px] font-black uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded mr-2">{trayTypeLabel}</span>
                            )}
                            {compact ? (
                                <span className="text-sm font-black leading-none">
                                    W {TRAY_WIDTH}mm × L{TIER_COUNT} {status !== 'optimal' && <span className="text-xs opacity-80 ml-2">{message}</span>}
                                </span>
                            ) : (
                                <>
                                    <h2 className="text-[9px] font-black uppercase tracking-widest opacity-80 leading-none mb-1">
                                        {status === 'optimal' ? 'System Optimized' : 'Attention Required'}
                                    </h2>
                                    <p className="text-lg font-black leading-none">
                                        {status === 'optimal' ? `W ${TRAY_WIDTH} mm` : message}
                                    </p>
                                </>
                            )}
                        </div>
                    </div>

                    {!compact && (
                    <div className="flex items-center gap-2">
                        {status !== 'optimal' && recommendedResult && (
                            <button
                                onClick={() => handleExternalAction(onApplyRecommendation)}
                                className="flex items-center gap-2 bg-white text-slate-900 px-3 py-1.5 rounded shadow hover:bg-slate-100 transition-colors font-bold text-[10px] uppercase"
                            >
                                <span>Use Recommended: W {recommendedResult.systemWidth} mm</span>
                                <ArrowRight size={12}/>
                            </button>
                        )}

                        <div className="flex gap-1.5">
                            <button
                                onClick={() => handleExternalAction(onExportHtml)}
                                className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-3 py-1.5 rounded shadow transition-colors flex items-center gap-2 font-bold text-[10px] uppercase"
                                title="Export Report to HTML"
                            >
                                <Download size={12} /> HTML
                            </button>
                            <button
                                onClick={() => handleExternalAction(onExportDxf)}
                                className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-3 py-1.5 rounded shadow transition-colors flex items-center gap-2 font-bold text-[10px] uppercase"
                                title="Export to DXF (CAD)"
                            >
                                <FileCode size={12} /> DXF (CAD)
                            </button>
                        </div>

                        {status === 'optimal' && (
                            <div className="hidden sm:flex px-3 py-2 rounded font-black text-[10px] items-center gap-2 border shadow-sm bg-white/10 border-white/20">
                                <Calculator size={14}/>
                                <div className="flex flex-col items-end leading-tight">
                                    <span>{fillRatioLimit}% Limit Applied</span>
                                </div>
                            </div>
                        )}
                    </div>
                    )}
                </div>
            </div>

            {/* Calculation Breakdown Panel — hidden in compact or when showDetails=false */}
            {!compact && showDetails && (
            <div className="bg-slate-50 border-b border-slate-200 p-3 flex flex-wrap gap-3 shrink-0">
                {systemResult.tiers.map((tier, idx) => (
                    <div key={idx} className="bg-white rounded border border-slate-200 p-2 shadow-sm flex flex-col gap-1 flex-1 min-w-[160px]">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-1 mb-1">
                            <span className="text-[10px] font-black text-slate-700 uppercase">Tier L{idx+1} Summary</span>
                            <span className={`text-[9px] font-bold px-1.5 rounded ${tier.maxStackHeight > TRAY_HEIGHT ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                H: {tier.maxStackHeight.toFixed(0)}mm
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
                            <div className="flex justify-between text-slate-500"><span>Σ OD:</span> <span className="font-mono font-bold text-slate-900">{tier.totalODSum.toFixed(1)}</span></div>
                            <div className="flex justify-between text-slate-500"><span>Σ Area:</span> <span className="font-mono font-bold text-slate-900">{tier.totalCableArea.toFixed(0)}</span></div>
                            <div className="col-span-2 border-t border-dashed border-slate-200 mt-1 pt-1 flex justify-between items-center">
                                <span className="text-slate-500 text-[9px]">Fill Calc:</span>
                                <span className={`font-mono font-bold ${tier.fillRatio > fillRatioLimit ? 'text-red-600' : 'text-blue-600'}`}>
                                    {(tier.totalCableArea).toFixed(0)} / {(TRAY_WIDTH * TRAY_HEIGHT).toFixed(0)} = {tier.fillRatio.toFixed(1)}%
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            )}

            <div className="flex-1 relative bg-white shadow-inner" style={{ overflow: zoom === 0 ? 'hidden' : 'auto' }}>
                <div className="absolute top-2 right-2 flex gap-1.5 z-10">
                    <button onClick={() => setZoom(z => z === 0 ? 0.8 : Math.max(0.2, z - 0.1))} className="p-1.5 bg-white border border-slate-200 rounded shadow text-slate-500 hover:text-slate-900"><ZoomOut size={14}/></button>
                    <button onClick={() => setZoom(0)} title="Fit to viewport" className="p-1.5 bg-white border border-slate-200 rounded shadow text-slate-500 hover:text-slate-900"><Maximize size={14}/></button>
                    <button onClick={() => setZoom(z => z === 0 ? 1.2 : Math.min(4, z + 0.1))} className="p-1.5 bg-white border border-slate-200 rounded shadow text-slate-500 hover:text-slate-900"><ZoomIn size={14}/></button>
                </div>

                {/* zoom===0 → SVG fills container exactly (auto-scale via viewBox + preserveAspectRatio) */}
                {/* zoom>0  → SVG at explicit pixel size, container scrolls for pan/detail */}
                <div className={zoom === 0 ? 'absolute inset-0' : 'min-w-full min-h-full flex items-center justify-center p-12'}>
                    <svg
                        width={zoom === 0 ? '100%' : DRAWING_WIDTH * zoom}
                        height={zoom === 0 ? '100%' : SVG_HEIGHT * zoom}
                        viewBox={`0 0 ${DRAWING_WIDTH} ${SVG_HEIGHT}`}
                        preserveAspectRatio="xMidYMid meet"
                        className="bg-white"
                        onClick={() => setHighlightedId(null)} // Click background to deselect
                    >
                        <defs>
                        <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
                            <path d="M0,0 L0,6 L8,3 z" fill="#000" />
                        </marker>
                        </defs>
                        
                        <g fill="#f1f5f9" stroke="#1e293b" strokeWidth="2" onClick={(e) => e.stopPropagation()}>
                            <rect x={MARGIN_LEFT_LABEL} y={20} width={POST_WIDTH} height={STRUCTURE_HEIGHT - 20} rx="2" />
                            <rect x={X_POST_RIGHT_START} y={20} width={POST_WIDTH} height={STRUCTURE_HEIGHT - 20} rx="2" />
                        </g>

                        {/* Pass 1: Draw All Structures (Beams) First */}
                        {processedTiers.map((tier, idx) => {
                            const floorY = getTierY(idx);
                            const isHeightOverflow = tier.maxStackHeight > TRAY_HEIGHT;
                            return (
                                <g key={`struct-${idx}`} onClick={(e) => e.stopPropagation()}>
                                    <text x={20} y={floorY - 15} fontSize="18" fontWeight="950" fill="#cbd5e1">LV. L{idx + 1}</text>
                                    <rect x={X_TRAY_START} y={floorY} width={TRAY_WIDTH} height={BEAM_HEIGHT} fill="#334155" stroke="#0f172a" strokeWidth="2" />
                                    
                                    {/* Design Limit Line */}
                                    <line x1={X_TRAY_START - 10} y1={floorY - TRAY_HEIGHT} x2={X_TRAY_END + 10} y2={floorY - TRAY_HEIGHT} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4,2" />
                                    <text x={X_TRAY_START - 15} y={floorY - TRAY_HEIGHT + 4} textAnchor="end" fontSize="10" fill="#94a3b8" fontWeight="bold">H{TRAY_HEIGHT}</text>

                                    {/* Actual Height Line (if overflow) */}
                                    {isHeightOverflow && (
                                        <g>
                                            <line x1={X_TRAY_START} y1={floorY - tier.maxStackHeight} x2={X_TRAY_END} y2={floorY - tier.maxStackHeight} stroke="#ef4444" strokeWidth="1" strokeDasharray="2,2" />
                                            <text x={X_TRAY_END + 15} y={floorY - tier.maxStackHeight + 4} textAnchor="start" fontSize="10" fill="#ef4444" fontWeight="bold">ACTUAL H{tier.maxStackHeight.toFixed(0)}</text>
                                        </g>
                                    )}

                                    {/* Summary Stats (Right) */}
                                    <g transform={`translate(${X_POST_RIGHT_START + POST_WIDTH + 15}, ${floorY - 40})`}>
                                        <text x="0" y="0" fontSize="14" fontWeight="black" fill="#1e293b" className="tracking-tight uppercase">
                                            Σ OD: <tspan fill="#2563eb">{tier.totalODSum.toFixed(1)}</tspan>
                                        </text>
                                        <text x="0" y="20" fontSize="14" fontWeight="black" fill="#1e293b" className="tracking-tight uppercase">
                                            Σ AREA: <tspan fill="#2563eb">{tier.totalCableArea.toFixed(0)}</tspan>
                                        </text>
                                        
                                        <g transform="translate(0, 35)">
                                            <text x="0" y="0" fontSize="10" fontWeight="bold" fill="#64748b">FILL RATE</text>
                                            <rect x="0" y="5" width="130" height="12" fill="#e2e8f0" rx="2" />
                                            <rect x="0" y="5" width={Math.min(130, 130 * (tier.fillRatio/fillRatioLimit))} height="12" fill={tier.fillRatio > fillRatioLimit ? "#ef4444" : "#3b82f6"} rx="2" />
                                            <text x="135" y="15" fontSize="12" fontWeight="black" fill={tier.fillRatio > fillRatioLimit ? "#ef4444" : "#3b82f6"}>{tier.fillRatio.toFixed(1)}%</text>
                                        </g>
                                    </g>
                                </g>
                            );
                        })}

                        {/* Pass 2: Draw All Cables Second (Overlay on top of structure) */}
                        {processedTiers.map((tier, idx) => {
                            const floorY = getTierY(idx);
                            return (
                                <g key={`cables-${idx}`} onClick={(e) => e.stopPropagation()}>
                                    {tier.cables.map((c) => {
                                        const isHighlighted = highlightedId === c.id;
                                        const isDimmed = highlightedId !== null && !isHighlighted;
                                        // Visual Fix: Ensure cable never sinks below floor
                                        const safeY = Math.max(c.y, c.od / 2);
                                        const cy = floorY - safeY;
                                        
                                        return (
                                            <g key={c.id} 
                                            onClick={(e) => { e.stopPropagation(); handleCableClick(c.id); }}
                                            className="cursor-pointer"
                                            >
                                                <circle 
                                                    cx={X_TRAY_START + c.x} 
                                                    cy={cy} 
                                                    r={c.od/2} 
                                                    fill={getTypeColor(c.type)}
                                                    stroke={isHighlighted ? "#f59e0b" : "#000"} 
                                                    strokeWidth={isHighlighted ? "3" : "1.2"} 
                                                    className="transition-all duration-200"
                                                    opacity={isDimmed ? 0.2 : 1}
                                                />
                                                {/* Glow Effect for Highlighted */}
                                                {isHighlighted && (
                                                    <circle 
                                                        cx={X_TRAY_START + c.x} 
                                                        cy={cy} 
                                                        r={(c.od/2) + 2} 
                                                        fill="none"
                                                        stroke="#f59e0b"
                                                        strokeWidth="2"
                                                        opacity="0.5"
                                                    />
                                                )}
                                                <text 
                                                    x={X_TRAY_START + c.x} 
                                                    y={cy} 
                                                    fontSize={Math.max(10, Math.min(c.od * 0.6, 16))} 
                                                    textAnchor="middle" 
                                                    dominantBaseline="middle" 
                                                    fill="#000" 
                                                    fontWeight="950" 
                                                    style={{ pointerEvents: 'none' }}
                                                    opacity={isDimmed ? 0.2 : 1}
                                                >
                                                    {c.displayIndex}
                                                </text>
                                            </g>
                                        );
                                    })}
                                </g>
                            );
                        })}

                        <g transform={`translate(0, ${STRUCTURE_HEIGHT - 25})`}>
                            <line x1={X_TRAY_START} y1={0} x2={X_TRAY_END} y2={0} stroke="#000" strokeWidth="3" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
                            <text x={X_TRAY_START + (TRAY_WIDTH/2)} y={30} textAnchor="middle" fontSize="28" fontWeight="1000" fill="#000" className="font-mono tracking-tighter">W {TRAY_WIDTH} mm</text>
                        </g>
                    </svg>
                </div>
            </div>
        </div>

        {/* Optimization Matrix Table — hidden in compact or when showDetails=false */}
        {!compact && showDetails && systemResult.optimizationMatrix && (
            <div className="h-48 bg-white rounded-lg shadow-lg border border-gray-300 overflow-hidden flex flex-col shrink-0">
                <div className="bg-slate-800 text-white p-2 px-3 border-b border-slate-700 flex items-center gap-2">
                    <Grid size={14} className="text-blue-400" />
                    <h3 className="text-[10px] font-black uppercase tracking-widest leading-none">Matrix (Fill Rate Focus)</h3>
                </div>
                <div className="flex-1 overflow-auto p-2 bg-slate-50">
                    <table className="w-full text-center border-collapse text-[10px]">
                        <thead>
                            <tr>
                                <th className="p-1 border bg-slate-200 text-slate-600 font-bold sticky left-0 z-10">Tier \ Width</th>
                                {systemResult.optimizationMatrix[0].map(cell => (
                                    <th key={cell.width} className="p-1 border bg-slate-100 text-slate-700 font-bold min-w-[50px]">{cell.width}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {systemResult.optimizationMatrix.map((row, rIdx) => (
                                <tr key={rIdx}>
                                    <td className="p-1 border bg-slate-100 font-bold text-slate-800 sticky left-0 z-10">{row[0].tiers}</td>
                                    {row.map((cell, cIdx) => (
                                        <td 
                                            key={cIdx} 
                                            onClick={() => handleExternalAction(() => onMatrixCellClick(cell.tiers, cell.width))}
                                            className={`p-1 border font-mono transition-all border-white cursor-pointer relative hover:z-30 hover:shadow-lg hover:ring-2 hover:ring-slate-900 hover:scale-105 transform duration-150
                                            ${cell.isOptimal 
                                                ? 'bg-green-500 text-white font-bold shadow-inner' 
                                                : cell.fillRatio <= fillRatioLimit 
                                                    ? 'bg-blue-50 text-blue-900' 
                                                    : 'bg-red-50 text-red-300'}
                                            ${cell.width === TRAY_WIDTH && cell.tiers === TIER_COUNT ? 'ring-2 ring-blue-600 z-20' : ''}
                                        `}>
                                            <div className="flex flex-col items-center pointer-events-none">
                                                <span className="text-[9px] leading-tight">{cell.fillRatio.toFixed(1)}%</span>
                                            </div>
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}
      </div>

      {!compact && (
      <div className="w-full lg:w-80 flex flex-col bg-white rounded-lg shadow-lg border border-gray-300 overflow-hidden shrink-0">
        <div className="bg-slate-900 text-white p-3.5 flex items-center gap-2 border-b border-slate-800">
          <List size={14} className="text-blue-500" />
          <h3 className="text-[10px] font-black uppercase tracking-widest leading-none">CABLE INDEX</h3>
        </div>
        <div className="flex-1 overflow-y-auto bg-slate-50 p-2 space-y-3">
          {processedTiers.map((tier, idx) => (
            <div key={idx} className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-100 px-2.5 py-2 border-b border-slate-200 flex justify-between items-center">
                <span className="font-black text-[10px] text-slate-700 uppercase">LV. L{idx + 1}</span>
                <span className="text-[9px] font-black text-blue-700 bg-blue-100 px-2 rounded-full border border-blue-200 uppercase">
                  {tier.cables.length} EA
                </span>
              </div>
              <div className="max-h-[500px] overflow-y-auto">
                <table className="min-w-full text-[9px] table-auto">
                  <thead className="sticky top-0 bg-white shadow-sm z-10">
                    <tr className="text-left font-black text-slate-400 uppercase border-b border-slate-100">
                      <th className="w-7 px-1 py-1.5 text-center">NO</th>
                      <th className="px-1 py-1.5">NAME</th>
                      <th className="w-12 px-1 py-1.5">TYPE</th>
                      <th className="w-8 px-1 py-1.5 text-right">OD</th>
                      <th className="px-1 py-1.5">FROM→TO</th>
                      <th className="w-10 px-1 py-1.5 text-right">LEN</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 font-medium">
                    {tier.cables.map(c => {
                       const isHighlighted = highlightedId === c.id;
                       const typeColor = getTypeColor(c.type);
                       return (
                          <tr
                            key={c.id}
                            onClick={() => handleCableClick(c.id)}
                            className={`cursor-pointer transition-colors border-b border-slate-50 last:border-0 ${
                                isHighlighted
                                ? 'bg-yellow-100 hover:bg-yellow-200 ring-1 ring-inset ring-yellow-300'
                                : 'hover:bg-blue-50'
                            }`}
                          >
                            <td className="px-1 py-1 text-center">
                              <span className={`inline-flex w-5 h-5 rounded font-black items-center justify-center text-[8px] transition-colors
                                  ${isHighlighted ? 'bg-yellow-500 text-white' : 'bg-slate-200 text-slate-900'}
                              `}>
                                {c.displayIndex}
                              </span>
                            </td>
                            <td className="px-1 py-1 truncate text-slate-800 font-bold max-w-[64px]" title={`${c.name} (Sys: ${c.system || '-'})`}>{c.name}</td>
                            <td className="px-1 py-1 max-w-[48px]">
                              <span
                                className="inline-block truncate rounded px-1 font-bold text-white text-[8px] leading-4 max-w-full"
                                style={{ backgroundColor: typeColor }}
                                title={c.type || '-'}
                              >
                                {c.type || '-'}
                              </span>
                            </td>
                            <td className="px-1 py-1 text-right font-mono font-black text-slate-950">{c.od.toFixed(0)}</td>
                            <td className="px-1 py-1 truncate text-slate-500 max-w-[72px]" title={`${c.fromNode || '-'} → ${c.toNode || '-'}`}>
                              {c.fromNode || '-'} → {c.toNode || '-'}
                            </td>
                            <td className="px-1 py-1 text-right font-mono font-black text-slate-700 whitespace-nowrap">
                              {(c.calculatedLength || c.length || 0).toFixed(0)}m
                            </td>
                          </tr>
                       );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
};

export default TrayVisualizer;
