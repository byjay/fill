import React, { useState, useMemo } from 'react';
import { CableData, NodeData } from '../types';
import {
  AlertTriangle,
  Shield,
  Zap,
  Filter,
  Download,
  RefreshCw,
  CheckCircle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type CableKind = 'POWER' | 'SIGNAL' | 'UNKNOWN';
type RiskLevel = 'HIGH' | 'MED' | 'LOW';
type FilterMode = 'ALL' | 'DANGER' | 'SAFE';

interface ClassifiedCable {
  cable: CableData;
  kind: CableKind;
}

interface SegmentResult {
  segment: string;
  powerCables: CableData[];
  signalCables: CableData[];
  risk: RiskLevel;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Classify a single cable as POWER / SIGNAL / UNKNOWN */
function classifyCable(cable: CableData): CableKind {
  // 1. Check the explicit interference field first
  if (cable.interference === 'P') return 'POWER';
  if (cable.interference === 'S') return 'SIGNAL';

  // 2. Fall back to inspecting the cable type string
  const t = (cable.type || '').toUpperCase();
  if (/PWR|POWER/.test(t)) return 'POWER';
  if (/SIG|INST|DATA/.test(t)) return 'SIGNAL';

  return 'UNKNOWN';
}

/**
 * Parse a path string into an ordered array of node segments.
 * Supports separators: " -> ", "->", " / ", "/"
 */
function parsePath(path: string): string[] {
  return path
    .split(/\s*->\s*|\s*\/\s*/)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Given an ordered list of nodes, return all consecutive-pair segment strings.
 * e.g. ['A','B','C'] -> ['A -> B', 'B -> C']
 */
function nodeSegments(nodes: string[]): string[] {
  const segs: string[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    segs.push(`${nodes[i]} -> ${nodes[i + 1]}`);
  }
  return segs;
}

/** Assign a risk level based on cable counts */
function riskLevel(powerCount: number, signalCount: number): RiskLevel {
  if (powerCount === 0 || signalCount === 0) return 'LOW';
  const total = powerCount + signalCount;
  if (powerCount >= 3 && signalCount >= 3) return 'HIGH';
  if (total >= 4) return 'HIGH';
  if (total >= 2) return 'MED';
  return 'LOW';
}

// ─── Risk badge helper ────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: RiskLevel }) {
  const cfg = {
    HIGH: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/40', icon: <AlertTriangle size={11} /> },
    MED:  { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/40', icon: <AlertTriangle size={11} /> },
    LOW:  { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/40', icon: <CheckCircle size={11} /> },
  }[level];

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.icon}
      {level}
    </span>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  color,
  icon,
}: {
  label: string;
  value: number | string;
  sub?: string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center gap-4 shadow">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 truncate">{label}</div>
        <div className="text-2xl font-black text-white leading-none mt-0.5">{value}</div>
        {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InterferenceCheckTab({ cables, nodes }: { cables: CableData[]; nodes: NodeData[] }) {
  const [hasRun, setHasRun] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>('ALL');
  const [isRunning, setIsRunning] = useState(false);

  // ── Analysis (memoised, recalculated any time cables changes) ────────────

  const { classified, segmentResults } = useMemo(() => {
    const classified: ClassifiedCable[] = cables.map(c => ({ cable: c, kind: classifyCable(c) }));

    // Build a map: segment -> { powerCables, signalCables }
    const segMap: Map<string, { power: CableData[]; signal: CableData[] }> = new Map();

    for (const { cable, kind } of classified) {
      if (kind === 'UNKNOWN') continue;

      // Use calculatedPath first, fall back to path
      const rawPath = cable.calculatedPath || cable.path || '';
      if (!rawPath) continue;

      const pathNodes = parsePath(rawPath);
      if (pathNodes.length < 2) continue;

      const segs = nodeSegments(pathNodes);
      for (const seg of segs) {
        if (!segMap.has(seg)) segMap.set(seg, { power: [], signal: [] });
        const entry = segMap.get(seg)!;
        if (kind === 'POWER') entry.power.push(cable);
        if (kind === 'SIGNAL') entry.signal.push(cable);
      }
    }

    // Build result rows — only include segments where BOTH power and signal exist
    const segmentResults: SegmentResult[] = [];
    segMap.forEach((v, seg) => {
      if (v.power.length > 0 && v.signal.length > 0) {
        segmentResults.push({
          segment: seg,
          powerCables: v.power,
          signalCables: v.signal,
          risk: riskLevel(v.power.length, v.signal.length),
        });
      }
    });

    // Sort: HIGH first, then MED, then LOW; secondary: total cable count desc
    const order: Record<RiskLevel, number> = { HIGH: 0, MED: 1, LOW: 2 };
    segmentResults.sort((a, b) => {
      const rDiff = order[a.risk] - order[b.risk];
      if (rDiff !== 0) return rDiff;
      return (b.powerCables.length + b.signalCables.length) - (a.powerCables.length + a.signalCables.length);
    });

    return { classified, segmentResults };
  }, [cables]);

  // ── KPI values ───────────────────────────────────────────────────────────

  const kpi = useMemo(() => {
    const powerCount  = classified.filter(c => c.kind === 'POWER').length;
    const signalCount = classified.filter(c => c.kind === 'SIGNAL').length;
    const highCount   = segmentResults.filter(r => r.risk === 'HIGH').length;
    const medCount    = segmentResults.filter(r => r.risk === 'MED').length;
    return {
      total:   cables.length,
      power:   powerCount,
      signal:  signalCount,
      danger:  segmentResults.length,
      high:    highCount,
      med:     medCount,
    };
  }, [cables, classified, segmentResults]);

  // ── Filtered rows ─────────────────────────────────────────────────────────

  const filteredResults = useMemo(() => {
    if (filterMode === 'DANGER') return segmentResults.filter(r => r.risk === 'HIGH' || r.risk === 'MED');
    if (filterMode === 'SAFE')   return segmentResults.filter(r => r.risk === 'LOW');
    return segmentResults;
  }, [segmentResults, filterMode]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleRun() {
    setIsRunning(true);
    // Simulate brief processing tick so UI reflects the "running" state
    setTimeout(() => {
      setHasRun(true);
      setIsRunning(false);
    }, 320);
  }

  function handleExport() {
    const header = ['경로 세그먼트', '파워케이블 수', '시그널케이블 수', '위험도', '파워케이블 목록', '시그널케이블 목록'];
    const rows = filteredResults.map(r => [
      r.segment,
      r.powerCables.length,
      r.signalCables.length,
      r.risk,
      r.powerCables.map(c => c.name || c.id).join(' | '),
      r.signalCables.map(c => c.name || c.id).join(' | '),
    ]);
    const csv = [header, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `interference_check_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200 overflow-hidden">

      {/* ── Top toolbar ── */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-800 bg-slate-900 flex-shrink-0">
        <Shield size={16} className="text-blue-400" />
        <span className="text-xs font-black uppercase tracking-widest text-blue-400">
          Interference Check
        </span>
        <span className="text-[10px] text-slate-500 flex-1">파워 / 시그널 케이블 동일 트레이 경로 간섭 분석</span>

        {/* Filter */}
        <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1">
          <Filter size={11} className="text-slate-400" />
          <select
            value={filterMode}
            onChange={e => setFilterMode(e.target.value as FilterMode)}
            className="bg-transparent text-[11px] text-slate-300 outline-none cursor-pointer"
          >
            <option value="ALL">전체</option>
            <option value="DANGER">위험</option>
            <option value="SAFE">정상</option>
          </select>
        </div>

        {/* Export */}
        {hasRun && (
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 text-[11px] font-bold text-slate-200 transition-colors"
          >
            <Download size={12} />
            CSV 내보내기
          </button>
        )}

        {/* Run button */}
        <button
          onClick={handleRun}
          disabled={isRunning || cables.length === 0}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all shadow-lg ${
            cables.length === 0
              ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
              : isRunning
              ? 'bg-blue-700 text-blue-200 cursor-wait'
              : 'bg-blue-600 hover:bg-blue-500 text-white'
          }`}
        >
          <RefreshCw size={13} className={isRunning ? 'animate-spin' : ''} />
          {isRunning ? '분석 중...' : '검사 실행'}
        </button>
      </div>

      {/* ── No cables guard ── */}
      {cables.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500">
          <Shield size={40} className="opacity-20" />
          <p className="text-sm font-bold uppercase tracking-widest">케이블 데이터를 먼저 로드하세요</p>
        </div>
      )}

      {/* ── Not-run state ── */}
      {cables.length > 0 && !hasRun && !isRunning && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-500">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
            <Zap size={30} className="text-blue-500 opacity-60" />
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-slate-300">간섭 검사를 실행하세요</p>
            <p className="text-xs text-slate-500 mt-1">
              {cables.length}개 케이블에서 파워/시그널 경로 중복을 분석합니다
            </p>
          </div>
          <button
            onClick={handleRun}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-black uppercase tracking-wider transition-all shadow-lg"
          >
            <RefreshCw size={14} />
            검사 실행
          </button>
        </div>
      )}

      {/* ── Running spinner ── */}
      {isRunning && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-400">
          <RefreshCw size={36} className="animate-spin text-blue-500" />
          <p className="text-sm font-bold">케이블 경로 분석 중...</p>
        </div>
      )}

      {/* ── Results ── */}
      {hasRun && !isRunning && (
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="총 검사 케이블 수"
              value={kpi.total}
              sub="전체 케이블"
              color="bg-blue-500/20"
              icon={<Shield size={18} className="text-blue-400" />}
            />
            <KpiCard
              label="파워케이블 수"
              value={kpi.power}
              sub={`미분류: ${kpi.total - kpi.power - kpi.signal}개`}
              color="bg-orange-500/20"
              icon={<Zap size={18} className="text-orange-400" />}
            />
            <KpiCard
              label="시그널케이블 수"
              value={kpi.signal}
              sub="SIG / INST / DATA"
              color="bg-purple-500/20"
              icon={<Zap size={18} className="text-purple-400" />}
            />
            <KpiCard
              label="간섭 위험 경로 수"
              value={kpi.danger}
              sub={`HIGH ${kpi.high} · MED ${kpi.med}`}
              color={kpi.high > 0 ? 'bg-red-500/20' : kpi.med > 0 ? 'bg-yellow-500/20' : 'bg-emerald-500/20'}
              icon={
                kpi.high > 0
                  ? <AlertTriangle size={18} className="text-red-400" />
                  : <CheckCircle size={18} className="text-emerald-400" />
              }
            />
          </div>

          {/* Summary banner */}
          {kpi.danger === 0 ? (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <CheckCircle size={18} className="text-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-emerald-300">간섭 위험 경로 없음</p>
                <p className="text-[11px] text-emerald-600 mt-0.5">
                  파워 케이블과 시그널 케이블이 동일 경로 세그먼트를 공유하는 구간이 발견되지 않았습니다.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30">
              <AlertTriangle size={18} className="text-red-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-red-300">
                  {kpi.danger}개 경로 세그먼트에서 간섭 위험 감지
                </p>
                <p className="text-[11px] text-red-600 mt-0.5">
                  파워 케이블과 시그널 케이블이 동일 트레이 구간을 공유합니다.
                  배선 분리 또는 차폐 조치를 검토하십시오.
                </p>
              </div>
            </div>
          )}

          {/* Results table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">
                경로별 간섭 분석 결과
                <span className="ml-2 text-slate-600 font-normal normal-case tracking-normal">
                  ({filteredResults.length}건)
                </span>
              </h2>
            </div>

            {filteredResults.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-slate-600">
                <p className="text-sm">해당 필터 조건의 결과가 없습니다.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-800 shadow-lg">
                <table className="w-full border-collapse" style={{ fontSize: '12px' }}>
                  <thead className="bg-slate-900 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2.5 text-left border-b border-slate-800 text-slate-400 font-bold whitespace-nowrap">
                        경로 세그먼트
                      </th>
                      <th className="px-3 py-2.5 text-center border-b border-slate-800 text-orange-400 font-bold whitespace-nowrap">
                        파워케이블 수
                      </th>
                      <th className="px-3 py-2.5 text-center border-b border-slate-800 text-purple-400 font-bold whitespace-nowrap">
                        시그널케이블 수
                      </th>
                      <th className="px-3 py-2.5 text-center border-b border-slate-800 text-slate-400 font-bold whitespace-nowrap">
                        위험도
                      </th>
                      <th className="px-3 py-2.5 text-left border-b border-slate-800 text-slate-400 font-bold">
                        케이블 목록
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResults.map((row, idx) => {
                      const rowBg = idx % 2 === 0 ? 'bg-slate-950' : 'bg-slate-900/60';
                      const riskBorder =
                        row.risk === 'HIGH' ? 'border-l-2 border-l-red-500' :
                        row.risk === 'MED'  ? 'border-l-2 border-l-yellow-500' :
                        'border-l-2 border-l-emerald-600';

                      const allCableNames = [
                        ...row.powerCables.map(c => ({ id: c.name || c.id, kind: 'P' as const })),
                        ...row.signalCables.map(c => ({ id: c.name || c.id, kind: 'S' as const })),
                      ];

                      return (
                        <tr key={row.segment} className={`${rowBg} ${riskBorder} hover:bg-slate-800/60 transition-colors`}>
                          {/* Segment */}
                          <td className="px-3 py-2.5 font-mono font-bold text-slate-200 whitespace-nowrap">
                            {row.segment}
                          </td>

                          {/* Power count */}
                          <td className="px-3 py-2.5 text-center">
                            <span className="inline-flex items-center justify-center w-8 h-6 rounded-md bg-orange-500/20 text-orange-300 font-black text-xs">
                              {row.powerCables.length}
                            </span>
                          </td>

                          {/* Signal count */}
                          <td className="px-3 py-2.5 text-center">
                            <span className="inline-flex items-center justify-center w-8 h-6 rounded-md bg-purple-500/20 text-purple-300 font-black text-xs">
                              {row.signalCables.length}
                            </span>
                          </td>

                          {/* Risk */}
                          <td className="px-3 py-2.5 text-center">
                            <RiskBadge level={row.risk} />
                          </td>

                          {/* Cable list */}
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {allCableNames.slice(0, 12).map((c, i) => (
                                <span
                                  key={i}
                                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono leading-none ${
                                    c.kind === 'P'
                                      ? 'bg-orange-500/15 text-orange-300 border border-orange-500/20'
                                      : 'bg-purple-500/15 text-purple-300 border border-purple-500/20'
                                  }`}
                                >
                                  <span className="opacity-60 text-[8px] font-bold">{c.kind}</span>
                                  {c.id}
                                </span>
                              ))}
                              {allCableNames.length > 12 && (
                                <span className="text-[10px] text-slate-500 self-center">
                                  +{allCableNames.length - 12}개 더
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-6 px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-400">
            <span className="font-bold text-slate-300 uppercase tracking-widest text-[10px]">범례</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
              HIGH — 파워 ≥3 &amp; 시그널 ≥3, 또는 합계 ≥4
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block" />
              MED — 합계 2~3
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              LOW — 최소 공유
            </span>
            <span className="flex items-center gap-1.5 ml-auto">
              <span className="px-1.5 py-0.5 rounded bg-orange-500/15 border border-orange-500/20 text-orange-300 font-mono">P</span>
              파워케이블
            </span>
            <span className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded bg-purple-500/15 border border-purple-500/20 text-purple-300 font-mono">S</span>
              시그널케이블
            </span>
          </div>

        </div>
      )}
    </div>
  );
}
