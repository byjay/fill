import React, { useState, useMemo, useCallback } from 'react';
import { CableData, NodeData, CableTypeData } from '../types';
import {
  Shield,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface Props {
  cables: CableData[];
  nodes: NodeData[];
  cableTypeDB?: CableTypeData[];
}

type RuleStatus = 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
type ClassSociety = 'DNV' | 'KR' | 'LR';

interface RuleViolation {
  cableId: string;
  cableName: string;
  detail: string;
}

interface RuleResult {
  code: string;
  name: string;
  description: string;
  status: RuleStatus;
  violations: RuleViolation[];
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Determine if a cable type string indicates a Power cable.
 * Conventions observed: type contains 'P', starts with 'P', or includes keywords like 'PWR', 'POWER'.
 */
function isPowerCable(type: string): boolean {
  const t = type.toUpperCase();
  return t.startsWith('P') || t.includes('PWR') || t.includes('POWER');
}

function isSignalCable(type: string): boolean {
  const t = type.toUpperCase();
  return (
    t.startsWith('S') ||
    t.includes('SIG') ||
    t.includes('SIGNAL') ||
    t.includes('CAT') ||
    t.includes('DATA') ||
    t.includes('INST') ||
    t.startsWith('I') ||
    t.startsWith('C')
  );
}

// ─────────────────────────────────────────────
// Rule Engine
// ─────────────────────────────────────────────

function runDNVRules(cables: CableData[], cableTypeDB?: CableTypeData[]): RuleResult[] {
  const results: RuleResult[] = [];

  // DNV-1: 파워/시그널 케이블 분리
  {
    const pathMap: Record<string, { power: CableData[]; signal: CableData[] }> = {};
    for (const c of cables) {
      const pathKey = (c.path || c.calculatedPath || '').trim();
      if (!pathKey) continue;
      if (!pathMap[pathKey]) pathMap[pathKey] = { power: [], signal: [] };
      if (c.type && isPowerCable(c.type)) pathMap[pathKey].power.push(c);
      if (c.type && isSignalCable(c.type)) pathMap[pathKey].signal.push(c);
    }

    const violations: RuleViolation[] = [];
    for (const [path, { power, signal }] of Object.entries(pathMap)) {
      if (power.length > 0 && signal.length > 0) {
        const offenders = [...power, ...signal];
        for (const c of offenders) {
          violations.push({
            cableId: c.id,
            cableName: c.name,
            detail: `경로 "${path}" 에 P/S 혼재 (Power: ${power.length}개, Signal: ${signal.length}개)`,
          });
        }
      }
    }

    results.push({
      code: 'DNV-1',
      name: '파워/시그널 케이블 분리',
      description: '동일 경로(PATH)에 Power 케이블과 Signal 케이블이 혼재하면 안 됩니다.',
      status: violations.length > 0 ? 'FAIL' : 'PASS',
      violations,
    });
  }

  // DNV-2: 최소 케이블 단면적 1.5mm²
  {
    const violations: RuleViolation[] = [];
    for (const c of cables) {
      let crossSection: number | undefined;

      // cableTypeDB에서 타입 검색
      if (cableTypeDB && c.type) {
        const found = cableTypeDB.find(
          (ct) => ct.cableType.trim().toUpperCase() === c.type.trim().toUpperCase()
        );
        if (found) crossSection = found.crossSection;
      }

      if (crossSection !== undefined && crossSection < 1.5) {
        violations.push({
          cableId: c.id,
          cableName: c.name,
          detail: `단면적 ${crossSection}mm² < 1.5mm² (타입: ${c.type})`,
        });
      }
    }

    results.push({
      code: 'DNV-2',
      name: '최소 케이블 단면적 (1.5mm²)',
      description: '모든 케이블의 도체 단면적은 최소 1.5mm² 이상이어야 합니다.',
      status: violations.length > 0 ? 'FAIL' : 'PASS',
      violations,
    });
  }

  // DNV-3: 케이블 타입 미입력
  {
    const violations: RuleViolation[] = cables
      .filter((c) => !c.type || c.type.trim() === '')
      .map((c) => ({
        cableId: c.id,
        cableName: c.name,
        detail: '케이블 타입(TYPE)이 입력되지 않았습니다.',
      }));

    results.push({
      code: 'DNV-3',
      name: '케이블 타입 미입력',
      description: '모든 케이블에 타입이 반드시 지정되어야 합니다.',
      status: violations.length > 0 ? 'FAIL' : 'PASS',
      violations,
    });
  }

  // DNV-4: FROM/TO 노드 미입력
  {
    const violations: RuleViolation[] = cables
      .filter((c) => !c.fromNode?.trim() || !c.toNode?.trim())
      .map((c) => ({
        cableId: c.id,
        cableName: c.name,
        detail: `FROM: "${c.fromNode ?? '(없음)'}", TO: "${c.toNode ?? '(없음'}"`,
      }));

    results.push({
      code: 'DNV-4',
      name: 'FROM/TO 노드 미입력',
      description: '모든 케이블에 출발(FROM) 및 도착(TO) 노드가 입력되어야 합니다.',
      status: violations.length > 0 ? 'FAIL' : 'PASS',
      violations,
    });
  }

  return results;
}

function runKRRules(cables: CableData[]): RuleResult[] {
  const results: RuleResult[] = [];

  // KR-1: 전압강하 3% 이내 (길이 기준 간이 체크 — 500m 초과 시 경고)
  {
    const LENGTH_THRESHOLD = 500; // metres — simplified proxy for 3% voltage drop
    const violations: RuleViolation[] = cables
      .filter((c) => {
        const len = c.calculatedLength ?? c.length;
        return len !== undefined && len > LENGTH_THRESHOLD;
      })
      .map((c) => {
        const len = c.calculatedLength ?? c.length;
        return {
          cableId: c.id,
          cableName: c.name,
          detail: `케이블 길이 ${len}m 초과 (${LENGTH_THRESHOLD}m 기준). 전압강하 3% 초과 가능성.`,
        };
      });

    results.push({
      code: 'KR-1',
      name: '전압강하 3% 이내',
      description: `케이블 길이가 ${LENGTH_THRESHOLD}m를 초과하면 전압강하 3% 기준 위반 가능성이 있습니다 (간이 체크).`,
      status: violations.length > 0 ? 'WARN' : 'PASS',
      violations,
    });
  }

  // KR-2: 케이블 경로 미입력 경고
  {
    const violations: RuleViolation[] = cables
      .filter((c) => {
        const p = c.path?.trim() || c.calculatedPath?.trim();
        return !p;
      })
      .map((c) => ({
        cableId: c.id,
        cableName: c.name,
        detail: '경로(PATH)가 입력되지 않았습니다.',
      }));

    results.push({
      code: 'KR-2',
      name: '케이블 경로 미입력',
      description: '경로가 없는 케이블은 트레이 설계 및 클래스 검사에서 제외될 수 있습니다.',
      status: violations.length > 0 ? 'WARN' : 'PASS',
      violations,
    });
  }

  // KR-3: 케이블 OD 0 이하
  {
    const violations: RuleViolation[] = cables
      .filter((c) => c.od <= 0)
      .map((c) => ({
        cableId: c.id,
        cableName: c.name,
        detail: `OD = ${c.od}mm (0 이하는 허용되지 않음)`,
      }));

    results.push({
      code: 'KR-3',
      name: '케이블 OD 0 이하',
      description: '외경(OD)이 0 이하인 케이블은 물리적으로 불가합니다.',
      status: violations.length > 0 ? 'FAIL' : 'PASS',
      violations,
    });
  }

  // KR-4: 중복 케이블명 체크
  {
    const nameCount: Record<string, CableData[]> = {};
    for (const c of cables) {
      const key = c.name.trim();
      if (!nameCount[key]) nameCount[key] = [];
      nameCount[key].push(c);
    }

    const violations: RuleViolation[] = [];
    for (const [name, group] of Object.entries(nameCount)) {
      if (group.length > 1) {
        for (const c of group) {
          violations.push({
            cableId: c.id,
            cableName: c.name,
            detail: `케이블명 "${name}" 이(가) ${group.length}개 존재합니다.`,
          });
        }
      }
    }

    results.push({
      code: 'KR-4',
      name: '중복 케이블명',
      description: '동일한 케이블 이름이 두 개 이상 존재하면 식별이 불가능합니다.',
      status: violations.length > 0 ? 'FAIL' : 'PASS',
      violations,
    });
  }

  return results;
}

function runLRRules(cables: CableData[]): RuleResult[] {
  const results: RuleResult[] = [];

  // LR-1: 비상 케이블 경로 이중화 (system에 'EMRG' 포함 시 체크)
  {
    const emrgCables = cables.filter((c) =>
      c.system?.toUpperCase().includes('EMRG')
    );

    const violations: RuleViolation[] = [];
    // 비상 케이블은 경로가 반드시 두 개 이상의 세그먼트를 가져야 함 (단순 체크: path에 '>' 또는 '-' 구분자가 있어야 함)
    // 더 엄격한 체크: 같은 system 코드의 케이블이 2개 이상이어야 이중화로 간주
    const emrgSystemMap: Record<string, CableData[]> = {};
    for (const c of emrgCables) {
      const key = c.system ?? 'EMRG';
      if (!emrgSystemMap[key]) emrgSystemMap[key] = [];
      emrgSystemMap[key].push(c);
    }

    for (const [sys, group] of Object.entries(emrgSystemMap)) {
      if (group.length < 2) {
        for (const c of group) {
          violations.push({
            cableId: c.id,
            cableName: c.name,
            detail: `비상 시스템 "${sys}" 케이블이 1개뿐입니다. 이중화(2개 이상) 필요.`,
          });
        }
      }
    }

    results.push({
      code: 'LR-1',
      name: '비상 케이블 경로 이중화',
      description: 'EMRG(비상) 시스템 케이블은 이중화 경로를 갖춰야 합니다.',
      status:
        emrgCables.length === 0
          ? 'SKIP'
          : violations.length > 0
          ? 'FAIL'
          : 'PASS',
      violations,
    });
  }

  // LR-2: 케이블 길이 0 경고
  {
    const violations: RuleViolation[] = cables
      .filter((c) => {
        const len = c.calculatedLength ?? c.length;
        return len !== undefined && len === 0;
      })
      .map((c) => ({
        cableId: c.id,
        cableName: c.name,
        detail: '케이블 길이가 0m입니다.',
      }));

    results.push({
      code: 'LR-2',
      name: '케이블 길이 0',
      description: '길이가 0m로 계산된 케이블은 경로 또는 노드 연결을 확인해야 합니다.',
      status: violations.length > 0 ? 'WARN' : 'PASS',
      violations,
    });
  }

  // LR-3: 케이블 중량 체크 (설정된 경우 — 0 이하 WARN)
  {
    const violations: RuleViolation[] = cables
      .filter((c) => c.cableWeight !== undefined && c.cableWeight <= 0)
      .map((c) => ({
        cableId: c.id,
        cableName: c.name,
        detail: `케이블 중량이 ${c.cableWeight}kg 이하입니다.`,
      }));

    results.push({
      code: 'LR-3',
      name: '케이블 중량 이상',
      description: '중량이 입력된 케이블의 값이 0 이하인 경우 데이터 오류가 의심됩니다.',
      status: violations.length > 0 ? 'WARN' : 'PASS',
      violations,
    });
  }

  return results;
}

// ─────────────────────────────────────────────
// Status badge helpers
// ─────────────────────────────────────────────

function StatusBadge({ status }: { status: RuleStatus }) {
  if (status === 'PASS')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-green-900/60 text-green-300 border border-green-700">
        <CheckCircle size={11} />
        PASS
      </span>
    );
  if (status === 'FAIL')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-900/60 text-red-300 border border-red-700">
        <XCircle size={11} />
        FAIL
      </span>
    );
  if (status === 'WARN')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-yellow-900/60 text-yellow-300 border border-yellow-700">
        <AlertTriangle size={11} />
        WARN
      </span>
    );
  // SKIP
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-gray-700 text-gray-400 border border-gray-600">
      SKIP
    </span>
  );
}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────

const ClassRuleTab: React.FC<Props> = ({ cables, nodes, cableTypeDB }) => {
  const [activeClass, setActiveClass] = useState<ClassSociety>('DNV');
  const [hasRun, setHasRun] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<ClassSociety, RuleResult[]>>({
    DNV: [],
    KR: [],
    LR: [],
  });

  // Run all checks
  const handleRunChecks = useCallback(() => {
    setIsRunning(true);
    // Simulate async (allows React to re-render spinner first)
    setTimeout(() => {
      setResults({
        DNV: runDNVRules(cables, cableTypeDB),
        KR: runKRRules(cables),
        LR: runLRRules(cables),
      });
      setHasRun(true);
      setIsRunning(false);
      setExpandedRules(new Set());
    }, 0);
  }, [cables, cableTypeDB]);

  // KPI aggregation for active class
  const kpi = useMemo(() => {
    const activeResults = results[activeClass];
    return {
      total: activeResults.length,
      pass: activeResults.filter((r) => r.status === 'PASS').length,
      fail: activeResults.filter((r) => r.status === 'FAIL').length,
      warn: activeResults.filter((r) => r.status === 'WARN').length,
      skip: activeResults.filter((r) => r.status === 'SKIP').length,
    };
  }, [results, activeClass]);

  // Global KPI across all classes
  const globalKpi = useMemo(() => {
    const all = [...results.DNV, ...results.KR, ...results.LR];
    return {
      total: all.length,
      pass: all.filter((r) => r.status === 'PASS').length,
      fail: all.filter((r) => r.status === 'FAIL').length,
      warn: all.filter((r) => r.status === 'WARN').length,
    };
  }, [results]);

  const toggleRule = useCallback((code: string) => {
    setExpandedRules((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  const activeResults = results[activeClass];

  // Class tab style
  const tabClass = (cls: ClassSociety) =>
    `px-5 py-2 text-sm font-semibold rounded-t border-b-2 transition-colors ${
      activeClass === cls
        ? 'bg-gray-800 border-blue-500 text-blue-400'
        : 'bg-gray-900 border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
    }`;

  const classBadgeColors: Record<ClassSociety, string> = {
    DNV: 'text-blue-400 border-blue-600 bg-blue-900/30',
    KR: 'text-emerald-400 border-emerald-600 bg-emerald-900/30',
    LR: 'text-purple-400 border-purple-600 bg-purple-900/30',
  };

  return (
    <div className="flex flex-col h-full bg-gray-950 text-gray-200 overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-700 shrink-0">
        <Shield size={18} className="text-blue-400" />
        <h2 className="text-base font-bold text-gray-100">Classification Rule Checker</h2>
        <span className="text-xs text-gray-500">DNV · KR · LR 규정 검사</span>

        <div className="ml-auto flex items-center gap-2">
          {hasRun && (
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded border ${
                globalKpi.fail > 0
                  ? 'text-red-400 border-red-700 bg-red-900/30'
                  : globalKpi.warn > 0
                  ? 'text-yellow-400 border-yellow-700 bg-yellow-900/30'
                  : 'text-green-400 border-green-700 bg-green-900/30'
              }`}
            >
              {globalKpi.fail > 0
                ? `FAIL ${globalKpi.fail}건`
                : globalKpi.warn > 0
                ? `WARN ${globalKpi.warn}건`
                : 'ALL PASS'}
            </span>
          )}
          <button
            onClick={handleRunChecks}
            disabled={isRunning || cables.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors"
          >
            <RefreshCw size={13} className={isRunning ? 'animate-spin' : ''} />
            {isRunning ? '검사 중...' : '검사 실행'}
          </button>
        </div>
      </div>

      {/* ── Class Tabs ── */}
      <div className="flex gap-0.5 px-4 pt-3 shrink-0 bg-gray-950 border-b border-gray-800">
        {(['DNV', 'KR', 'LR'] as ClassSociety[]).map((cls) => (
          <button key={cls} className={tabClass(cls)} onClick={() => setActiveClass(cls)}>
            <span className={`mr-1.5 text-xs font-bold border rounded px-1 py-0.5 ${classBadgeColors[cls]}`}>
              {cls}
            </span>
            {cls === 'DNV' && 'Det Norske Veritas'}
            {cls === 'KR' && '한국선급'}
            {cls === 'LR' && "Lloyd's Register"}
            {hasRun && results[cls].some((r) => r.status === 'FAIL') && (
              <XCircle size={11} className="inline ml-1.5 text-red-400" />
            )}
            {hasRun &&
              !results[cls].some((r) => r.status === 'FAIL') &&
              results[cls].some((r) => r.status === 'WARN') && (
                <AlertTriangle size={11} className="inline ml-1.5 text-yellow-400" />
              )}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* No data hint */}
        {cables.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-600">
            <Shield size={40} className="mb-3 opacity-30" />
            <p className="text-sm">케이블 데이터가 없습니다.</p>
          </div>
        )}

        {/* Before first run */}
        {cables.length > 0 && !hasRun && !isRunning && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <RefreshCw size={36} className="mb-3 opacity-30" />
            <p className="text-sm">상단 "검사 실행" 버튼을 눌러 규정 검사를 시작하세요.</p>
            <p className="text-xs text-gray-600 mt-1">케이블 {cables.length}개 준비됨</p>
          </div>
        )}

        {/* Running */}
        {isRunning && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <RefreshCw size={36} className="mb-3 animate-spin opacity-50" />
            <p className="text-sm">규정 검사 중...</p>
          </div>
        )}

        {/* Results */}
        {hasRun && !isRunning && cables.length > 0 && (
          <>
            {/* ── KPI Cards ── */}
            <div className="grid grid-cols-4 gap-3 shrink-0">
              <div className="rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-center">
                <p className="text-xs text-gray-500 mb-1">총 규칙</p>
                <p className="text-2xl font-bold text-gray-200">{kpi.total}</p>
              </div>
              <div className="rounded-lg bg-green-900/30 border border-green-800 px-4 py-3 text-center">
                <p className="text-xs text-green-500 mb-1">PASS</p>
                <p className="text-2xl font-bold text-green-300">{kpi.pass}</p>
              </div>
              <div className="rounded-lg bg-red-900/30 border border-red-800 px-4 py-3 text-center">
                <p className="text-xs text-red-500 mb-1">FAIL</p>
                <p className="text-2xl font-bold text-red-300">{kpi.fail}</p>
              </div>
              <div className="rounded-lg bg-yellow-900/30 border border-yellow-800 px-4 py-3 text-center">
                <p className="text-xs text-yellow-500 mb-1">WARNING</p>
                <p className="text-2xl font-bold text-yellow-300">{kpi.warn}</p>
              </div>
            </div>

            {/* ── Rule Table ── */}
            <div className="rounded-lg border border-gray-700 overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[80px_1fr_100px_90px_80px] bg-gray-800 border-b border-gray-700 text-xs text-gray-400 font-semibold">
                <div className="px-3 py-2">규칙 코드</div>
                <div className="px-3 py-2">규칙명</div>
                <div className="px-3 py-2 text-center">결과</div>
                <div className="px-3 py-2 text-center">위반 케이블</div>
                <div className="px-3 py-2 text-center">상세</div>
              </div>

              {activeResults.length === 0 && (
                <div className="px-4 py-6 text-center text-gray-600 text-sm">
                  이 클래스에 해당하는 규칙이 없습니다.
                </div>
              )}

              {activeResults.map((rule) => {
                const isExpanded = expandedRules.has(rule.code);
                const rowBg =
                  rule.status === 'FAIL'
                    ? 'bg-red-950/30'
                    : rule.status === 'WARN'
                    ? 'bg-yellow-950/20'
                    : rule.status === 'PASS'
                    ? 'bg-gray-900/50'
                    : 'bg-gray-900/20';

                return (
                  <div key={rule.code} className={`border-b border-gray-800 last:border-0 ${rowBg}`}>
                    {/* Rule row */}
                    <div className="grid grid-cols-[80px_1fr_100px_90px_80px] items-center">
                      <div className="px-3 py-2.5">
                        <span className="text-xs font-mono font-bold text-gray-300">{rule.code}</span>
                      </div>
                      <div className="px-3 py-2.5">
                        <p className="text-sm font-medium text-gray-200">{rule.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{rule.description}</p>
                      </div>
                      <div className="px-3 py-2.5 flex justify-center">
                        <StatusBadge status={rule.status} />
                      </div>
                      <div className="px-3 py-2.5 text-center">
                        {rule.violations.length > 0 ? (
                          <span
                            className={`text-sm font-bold ${
                              rule.status === 'FAIL'
                                ? 'text-red-400'
                                : rule.status === 'WARN'
                                ? 'text-yellow-400'
                                : 'text-gray-400'
                            }`}
                          >
                            {rule.violations.length}개
                          </span>
                        ) : (
                          <span className="text-sm text-gray-600">-</span>
                        )}
                      </div>
                      <div className="px-3 py-2.5 flex justify-center">
                        {rule.violations.length > 0 ? (
                          <button
                            onClick={() => toggleRule(rule.code)}
                            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronDown size={13} />
                            ) : (
                              <ChevronRight size={13} />
                            )}
                            {isExpanded ? '접기' : '보기'}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-700">-</span>
                        )}
                      </div>
                    </div>

                    {/* Violation list (expanded) */}
                    {isExpanded && rule.violations.length > 0 && (
                      <div className="mx-3 mb-3 rounded border border-gray-700 bg-gray-900 overflow-hidden">
                        {/* Sub-header */}
                        <div className="grid grid-cols-[140px_1fr] bg-gray-800 border-b border-gray-700 text-xs text-gray-500 font-semibold">
                          <div className="px-3 py-1.5">케이블명</div>
                          <div className="px-3 py-1.5">위반 내용</div>
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          {rule.violations.map((v, idx) => (
                            <div
                              key={`${v.cableId}-${idx}`}
                              className={`grid grid-cols-[140px_1fr] border-b border-gray-800 last:border-0 ${
                                idx % 2 === 0 ? 'bg-gray-900' : 'bg-gray-900/50'
                              }`}
                            >
                              <div className="px-3 py-2 flex flex-col">
                                <span className="text-xs font-semibold text-gray-200 font-mono truncate">
                                  {v.cableName}
                                </span>
                                <span className="text-xs text-gray-600 font-mono truncate">
                                  {v.cableId}
                                </span>
                              </div>
                              <div className="px-3 py-2 flex items-center">
                                <span className="text-xs text-gray-400 leading-relaxed">{v.detail}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Summary bar ── */}
            {kpi.total > 0 && (
              <div className="flex items-center gap-3 px-3 py-2 rounded bg-gray-800 border border-gray-700 text-xs text-gray-400">
                <Shield size={13} className="text-gray-500" />
                <span>
                  {activeClass} 검사 완료 —&nbsp;
                  <span className="text-green-400 font-semibold">{kpi.pass} PASS</span>
                  {kpi.fail > 0 && (
                    <span className="text-red-400 font-semibold ml-2">{kpi.fail} FAIL</span>
                  )}
                  {kpi.warn > 0 && (
                    <span className="text-yellow-400 font-semibold ml-2">{kpi.warn} WARN</span>
                  )}
                  {kpi.skip > 0 && (
                    <span className="text-gray-500 ml-2">{kpi.skip} SKIP</span>
                  )}
                </span>
                <span className="ml-auto text-gray-600">케이블 {cables.length}개 대상</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ClassRuleTab;
