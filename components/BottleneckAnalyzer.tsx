/**
 * BottleneckAnalyzer — 병목 분석 + 자동 분산 + 우회 제안 UI
 *
 * 독립 컴포넌트. App.tsx에서 호출만 하면 됨.
 * 기존 코드 수정 없이 동작.
 */
import React, { useState, useMemo, useCallback } from 'react';
import type { CableData, NodeData } from '../types';
import {
  smartRoute, smartRouteCables, analyzeBottlenecks,
  DEFAULT_OPTIONS,
} from '../services/smartRouter';
import type { SmartRouterOptions, SmartRouterReport } from '../services/smartRouter';
import {
  AlertTriangle, Zap, ArrowRight, Check, X, RefreshCw,
  ChevronDown, ChevronUp, Settings, Play, BarChart3,
} from 'lucide-react';

interface BottleneckAnalyzerProps {
  cables: CableData[];
  nodes: NodeData[];
  onApplyRouting?: (newCables: CableData[]) => void;  // 결과 적용 콜백
}

// ── 병목 노드 상세 패널 ──────────────────────────────────────────
interface NodeDetail {
  nodeName: string;
  cableCount: number;
  cables: CableData[];
}

// ── 우회 제안 ──────────────────────────────────────────────────
interface RerouteProposal {
  cable: CableData;
  originalPath: string;
  originalLength: number;
  newPath: string;
  newLength: number;
  extraLength: number;
  extraPercent: number;
  bypassedNode: string;
  selected: boolean;
}

const BottleneckAnalyzer: React.FC<BottleneckAnalyzerProps> = ({
  cables, nodes, onApplyRouting,
}) => {
  // 상태
  const [analyzing, setAnalyzing] = useState(false);
  const [report, setReport] = useState<SmartRouterReport | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeDetail | null>(null);
  const [proposals, setProposals] = useState<RerouteProposal[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [applied, setApplied] = useState(false);

  // 옵션
  const [loadFactor, setLoadFactor] = useState(0.5);
  const [maxPerNode, setMaxPerNode] = useState(80);
  const [maxDetour, setMaxDetour] = useState(1.5);
  const [systemSep, setSystemSep] = useState(true);

  // 현재 병목 분석 (즉시)
  const currentBottlenecks = useMemo(() => {
    return analyzeBottlenecks(cables, nodes, maxPerNode);
  }, [cables, nodes, maxPerNode]);

  // ── 자동 분산 실행 ──────────────────────────────────────────
  const handleAutoBalance = useCallback(() => {
    setAnalyzing(true);
    setApplied(false);
    setSelectedNode(null);
    setProposals([]);

    // setTimeout으로 UI 블로킹 방지
    setTimeout(() => {
      const opts: SmartRouterOptions = {
        loadBalanceFactor: loadFactor,
        maxCablesPerNode: maxPerNode,
        maxDetourRatio: maxDetour,
        systemSeparation: systemSep,
        optimizeBatchOrder: true,
      };

      const result = smartRoute(cables, nodes, opts);
      setReport(result);
      setAnalyzing(false);
    }, 50);
  }, [cables, nodes, loadFactor, maxPerNode, maxDetour, systemSep]);

  // ── 병목 노드 클릭 → 케이블 리스트 ──────────────────────────
  const handleNodeClick = useCallback((nodeName: string) => {
    // 해당 노드를 통과하는 케이블 찾기
    const throughCables = cables.filter(c => {
      const path = c.calculatedPath || c.path || '';
      return path.split(/[,→>]/).map(s => s.trim()).includes(nodeName);
    });

    setSelectedNode({
      nodeName,
      cableCount: throughCables.length,
      cables: throughCables,
    });

    // 우회 제안 생성
    if (report) {
      const newProposals: RerouteProposal[] = [];
      throughCables.forEach(cable => {
        const smartResult = report.results.find(r => r.cable.id === cable.id);
        if (!smartResult || !smartResult.path) return;

        const origPath = cable.calculatedPath || cable.path || '';
        const origLength = cable.calculatedLength || cable.length || 0;
        const newPath = smartResult.path.join(',');
        const newLength = smartResult.physicalLength + (cable.fromRest || 0) + (cable.toRest || 0);

        // 경로가 실제로 달라진 경우만 제안
        if (origPath !== newPath && origPath) {
          newProposals.push({
            cable,
            originalPath: origPath,
            originalLength: origLength,
            newPath,
            newLength,
            extraLength: newLength - origLength,
            extraPercent: origLength > 0 ? ((newLength - origLength) / origLength) * 100 : 0,
            bypassedNode: nodeName,
            selected: true, // 기본 선택
          });
        }
      });

      setProposals(newProposals);
    }
  }, [cables, report]);

  // ── 선택적 적용 ──────────────────────────────────────────
  const handleApplySelected = useCallback(() => {
    const selectedProposals = proposals.filter(p => p.selected);
    if (selectedProposals.length === 0) return;

    const updatedCables = cables.map(cable => {
      const proposal = selectedProposals.find(p => p.cable.id === cable.id);
      if (!proposal) return cable;
      return {
        ...cable,
        calculatedPath: proposal.newPath,
        calculatedLength: proposal.newLength,
      };
    });

    onApplyRouting?.(updatedCables);
    setApplied(true);
  }, [cables, proposals, onApplyRouting]);

  // ── 전체 적용 ──────────────────────────────────────────
  const handleApplyAll = useCallback(() => {
    if (!report) return;
    const opts: SmartRouterOptions = {
      loadBalanceFactor: loadFactor,
      maxCablesPerNode: maxPerNode,
      maxDetourRatio: maxDetour,
      systemSeparation: systemSep,
      optimizeBatchOrder: true,
    };
    const routed = smartRouteCables(cables, nodes, opts);
    onApplyRouting?.(routed);
    setApplied(true);
  }, [cables, nodes, report, loadFactor, maxPerNode, maxDetour, systemSep, onApplyRouting]);

  // ── 제안 토글 ──────────────────────────────────────────
  const toggleProposal = useCallback((index: number) => {
    setProposals(prev => prev.map((p, i) =>
      i === index ? { ...p, selected: !p.selected } : p
    ));
  }, []);

  // 색상 유틸
  const utilizationColor = (util: number) => {
    if (util >= 1) return 'text-red-400 bg-red-900/30';
    if (util >= 0.8) return 'text-amber-400 bg-amber-900/30';
    if (util >= 0.5) return 'text-yellow-400 bg-yellow-900/30';
    return 'text-emerald-400 bg-emerald-900/30';
  };

  const utilizationBar = (util: number) => {
    const pct = Math.min(util * 100, 100);
    const color = util >= 1 ? 'bg-red-500' : util >= 0.8 ? 'bg-amber-500' : util >= 0.5 ? 'bg-yellow-500' : 'bg-emerald-500';
    return (
      <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200 overflow-hidden">
      {/* ── 상단 툴바 ── */}
      <div className="shrink-0 px-3 py-2 bg-slate-800 border-b border-slate-700 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-cyan-400" />
          <span className="text-xs font-bold text-white">병목 분석 & 자동 분산</span>
        </div>

        <button onClick={handleAutoBalance} disabled={analyzing}
          className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1 rounded text-[10px] font-bold transition-colors">
          {analyzing ? <RefreshCw size={10} className="animate-spin" /> : <Zap size={10} />}
          {analyzing ? '분석 중...' : '자동 분산 실행'}
        </button>

        {report && !applied && (
          <button onClick={handleApplyAll}
            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded text-[10px] font-bold transition-colors">
            <Check size={10} /> 전체 적용
          </button>
        )}

        {applied && (
          <span className="text-[10px] text-emerald-400 font-bold">✅ 적용 완료</span>
        )}

        <div className="flex-1" />

        <button onClick={() => setShowSettings(!showSettings)}
          className={`p-1 rounded transition-colors ${showSettings ? 'text-cyan-400 bg-cyan-900/30' : 'text-slate-500 hover:text-white'}`}>
          <Settings size={12} />
        </button>

        {/* 현재 병목 요약 */}
        <div className="flex items-center gap-2 text-[9px]">
          <span className="text-slate-500">병목 노드:</span>
          <span className={currentBottlenecks.overloaded > 0 ? 'text-red-400 font-bold' : 'text-emerald-400'}>
            {currentBottlenecks.overloaded}개
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-500">최대 부하:</span>
          <span className="text-amber-400 font-bold">{currentBottlenecks.stats.maxLoad}</span>
        </div>
      </div>

      {/* ── 설정 패널 ── */}
      {showSettings && (
        <div className="shrink-0 px-3 py-2 bg-slate-800/50 border-b border-slate-700 flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <label className="text-[8px] text-slate-500 font-bold uppercase">분산 강도</label>
            <input type="range" min="0" max="1" step="0.1" value={loadFactor}
              onChange={e => setLoadFactor(parseFloat(e.target.value))}
              className="w-20 h-1 accent-cyan-500" />
            <span className="text-[9px] text-cyan-400 font-mono w-6">{loadFactor}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[8px] text-slate-500 font-bold uppercase">노드 상한</label>
            <input type="number" value={maxPerNode} onChange={e => setMaxPerNode(parseInt(e.target.value) || 80)}
              className="w-12 px-1 py-0.5 bg-slate-700 border border-slate-600 rounded text-[9px] text-white text-center" />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[8px] text-slate-500 font-bold uppercase">최대 우회</label>
            <input type="number" value={maxDetour} step="0.1" onChange={e => setMaxDetour(parseFloat(e.target.value) || 1.5)}
              className="w-12 px-1 py-0.5 bg-slate-700 border border-slate-600 rounded text-[9px] text-white text-center" />
            <span className="text-[8px] text-slate-500">배</span>
          </div>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={systemSep} onChange={e => setSystemSep(e.target.checked)}
              className="w-3 h-3 accent-cyan-500" />
            <span className="text-[8px] text-slate-400">P/S 분리</span>
          </label>
        </div>
      )}

      {/* ── 메인 콘텐츠 ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* 왼쪽: 병목 노드 리스트 */}
        <div className="w-64 shrink-0 border-r border-slate-700 overflow-auto">
          <div className="px-2 py-1.5 bg-slate-800/50 border-b border-slate-700 text-[9px] font-bold text-slate-400 uppercase">
            병목 노드 TOP 20 (클릭하여 상세)
          </div>
          {currentBottlenecks.bottlenecks.map((bn, i) => {
            const util = bn.utilization;
            const isSelected = selectedNode?.nodeName === bn.nodeName;
            return (
              <div key={bn.nodeName}
                onClick={() => handleNodeClick(bn.nodeName)}
                className={`px-2 py-1.5 cursor-pointer transition-colors border-b border-slate-800/50 ${
                  isSelected ? 'bg-cyan-900/30 border-l-2 border-l-cyan-400' : 'hover:bg-slate-800/50 border-l-2 border-l-transparent'
                }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[8px] text-slate-600 font-mono w-4">{i + 1}</span>
                    <span className="text-[10px] font-bold text-white">{bn.nodeName}</span>
                  </div>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${utilizationColor(util)}`}>
                    {bn.cableCount}
                  </span>
                </div>
                {utilizationBar(util)}
              </div>
            );
          })}
        </div>

        {/* 중앙: 선택된 노드의 케이블 리스트 + 우회 제안 */}
        <div className="flex-1 overflow-auto">
          {!selectedNode && !report && (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <AlertTriangle size={32} className="mb-3 text-slate-600" />
              <p className="text-sm font-bold">병목 노드를 클릭하거나</p>
              <p className="text-xs mt-1">"자동 분산 실행" 버튼을 눌러주세요</p>
            </div>
          )}

          {/* 분석 결과 요약 */}
          {report && !selectedNode && (
            <div className="p-4 space-y-3">
              <h3 className="text-sm font-bold text-white">분산 분석 결과</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                  <div className="text-[9px] text-slate-500 font-bold uppercase">부하 편차 (전)</div>
                  <div className="text-lg font-black text-red-400">{report.loadBalance.before.stdDev.toFixed(1)}</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                  <div className="text-[9px] text-slate-500 font-bold uppercase">부하 편차 (후)</div>
                  <div className="text-lg font-black text-emerald-400">{report.loadBalance.after.stdDev.toFixed(1)}</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                  <div className="text-[9px] text-slate-500 font-bold uppercase">개선율</div>
                  <div className="text-lg font-black text-cyan-400">{report.loadBalance.improvement.toFixed(1)}%</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                  <div className="text-[9px] text-slate-500 font-bold uppercase">우회된 케이블</div>
                  <div className="text-lg font-black text-amber-400">{report.detourStats.totalDetoured}</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                  <div className="text-[9px] text-slate-500 font-bold uppercase">평균 우회율</div>
                  <div className="text-lg font-black text-yellow-400">{((report.detourStats.avgDetourRatio - 1) * 100).toFixed(1)}%</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                  <div className="text-[9px] text-slate-500 font-bold uppercase">추가 길이 합</div>
                  <div className="text-lg font-black text-orange-400">{report.detourStats.totalExtraLength.toFixed(1)}m</div>
                </div>
              </div>
              <p className="text-[10px] text-slate-500">← 왼쪽 병목 노드를 클릭하면 해당 노드의 케이블 목록과 우회 제안을 볼 수 있습니다.</p>
            </div>
          )}

          {/* 선택된 노드 상세 */}
          {selectedNode && (
            <div className="p-3 space-y-3">
              {/* 노드 헤더 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-white">{selectedNode.nodeName}</span>
                  <span className="text-[10px] text-amber-400 bg-amber-900/30 px-2 py-0.5 rounded font-bold">
                    {selectedNode.cableCount} 케이블 통과
                  </span>
                </div>
                <button onClick={() => setSelectedNode(null)}
                  className="p-1 text-slate-500 hover:text-white rounded"><X size={14} /></button>
              </div>

              {/* 우회 제안 */}
              {proposals.length > 0 && (
                <div className="bg-slate-800/50 rounded-lg border border-cyan-800/30 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-cyan-400 uppercase">
                      우회 제안 ({proposals.length}건)
                    </span>
                    <button onClick={handleApplySelected}
                      disabled={proposals.filter(p => p.selected).length === 0}
                      className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-2 py-0.5 rounded text-[9px] font-bold transition-colors">
                      <Check size={9} /> 선택 적용 ({proposals.filter(p => p.selected).length})
                    </button>
                  </div>

                  {proposals.map((p, i) => (
                    <div key={p.cable.id}
                      className={`mb-1.5 p-2 rounded border transition-colors cursor-pointer ${
                        p.selected ? 'bg-cyan-900/20 border-cyan-700/50' : 'bg-slate-900/50 border-slate-700'
                      }`}
                      onClick={() => toggleProposal(i)}>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={p.selected} readOnly
                          className="w-3 h-3 accent-cyan-500 shrink-0" />
                        <span className="text-[10px] font-bold text-blue-300">{p.cable.name}</span>
                        <span className="text-[9px] text-slate-500">{p.cable.type}</span>
                        <div className="flex-1" />
                        <span className={`text-[9px] font-bold ${p.extraPercent > 10 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          +{p.extraPercent.toFixed(1)}%
                        </span>
                        <span className="text-[9px] text-slate-500">
                          ({p.originalLength.toFixed(1)}m → {p.newLength.toFixed(1)}m)
                        </span>
                      </div>
                      {p.selected && (
                        <div className="mt-1 text-[8px] text-slate-400 font-mono truncate">
                          <span className="text-red-400">전:</span> {p.originalPath.split(',').slice(0, 8).join('→')}{p.originalPath.split(',').length > 8 ? '...' : ''}
                          <br />
                          <span className="text-emerald-400">후:</span> {p.newPath.split(',').slice(0, 8).join('→')}{p.newPath.split(',').length > 8 ? '...' : ''}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {proposals.length === 0 && report && (
                <div className="text-[10px] text-slate-500 bg-slate-800/50 rounded p-3">
                  이 노드를 통과하는 케이블에 대한 우회 경로가 없거나, 이미 최적 상태입니다.
                </div>
              )}

              {/* 케이블 리스트 */}
              <div>
                <div className="text-[9px] font-bold text-slate-400 uppercase mb-1">
                  통과 케이블 ({selectedNode.cableCount})
                </div>
                <div className="max-h-60 overflow-auto space-y-0.5">
                  {selectedNode.cables.map(c => (
                    <div key={c.id} className="flex items-center gap-2 px-2 py-1 bg-slate-800/50 rounded text-[10px]">
                      <span className="text-blue-400 font-bold w-24 truncate">{c.name}</span>
                      <span className="text-slate-500 w-12">{c.type}</span>
                      <span className="text-slate-500 w-14">{c.system}</span>
                      <span className="text-emerald-400 font-mono w-14 text-right">
                        {(c.calculatedLength || c.length || 0).toFixed(1)}m
                      </span>
                      <span className="text-slate-600 flex-1 truncate font-mono text-[8px]">
                        {c.fromNode} → {c.toNode}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 오른쪽: 분산 결과 그래프 (간단 바 차트) */}
        {report && (
          <div className="w-48 shrink-0 border-l border-slate-700 overflow-auto bg-slate-900/50">
            <div className="px-2 py-1.5 bg-slate-800/50 border-b border-slate-700 text-[8px] font-bold text-slate-400 uppercase">
              부하 분포 (전→후)
            </div>
            {report.bottlenecks.slice(0, 15).map(bn => {
              const beforeLoad = currentBottlenecks.bottlenecks.find(b => b.nodeName === bn.nodeName)?.cableCount || 0;
              const afterLoad = bn.cableCount;
              const maxVal = Math.max(beforeLoad, afterLoad, maxPerNode);
              return (
                <div key={bn.nodeName} className="px-2 py-1 border-b border-slate-800/30">
                  <div className="text-[8px] text-slate-400 font-mono mb-0.5">{bn.nodeName}</div>
                  <div className="flex items-center gap-1">
                    <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500/60 rounded-full" style={{ width: `${(beforeLoad / maxVal) * 100}%` }} />
                    </div>
                    <span className="text-[7px] text-red-400 w-5 text-right">{beforeLoad}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500/60 rounded-full" style={{ width: `${(afterLoad / maxVal) * 100}%` }} />
                    </div>
                    <span className="text-[7px] text-emerald-400 w-5 text-right">{afterLoad}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default BottleneckAnalyzer;
