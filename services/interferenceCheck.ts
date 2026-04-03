/**
 * interferenceCheck.ts
 * 케이블 간섭(Interference) 자동 검증 모듈
 * 기존 SCM 코드 수정 없이 독립 작동
 */

import type { CableData, NodeData } from '../types';

// ─── 타입 정의 ──────────────────────────────────────────────────

export type SystemCategory = 'POWER' | 'SIGNAL' | 'SPECIAL';

export interface InterferenceRule {
  id: string;
  name: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  check: (cables: CableData[], nodes: NodeData[]) => InterferenceResult[];
}

export interface InterferenceResult {
  ruleId: string;
  ruleName: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  affectedCables: string[];   // 케이블 name 목록
  affectedNodes: string[];    // 관련 노드
  suggestion: string;         // 해결 제안
}

export interface InterferenceReport {
  timestamp: string;
  totalCables: number;
  totalNodes: number;
  results: InterferenceResult[];
  summary: {
    errors: number;
    warnings: number;
    infos: number;
    passed: number;       // 문제없는 규칙 수
    totalRules: number;
  };
}

// ─── 헬퍼 함수 ──────────────────────────────────────────────────

/** 시스템을 카테고리로 분류 */
export function categorizeSystem(system: string): SystemCategory {
  const s = (system || '').toUpperCase();
  if (s === 'POWER' || s === 'LTG') return 'POWER';
  if (s === 'FIRE') return 'SPECIAL';   // 소방은 별도 트레이 필수
  return 'SIGNAL'; // CONT, COMM, 기타
}

/** 노드별 통과 케이블 맵 생성 */
export function buildNodeCableMap(cables: CableData[]): Map<string, CableData[]> {
  const map = new Map<string, CableData[]>();
  cables.forEach(cable => {
    const path = cable.calculatedPath || cable.path || '';
    if (!path) return;
    path
      .split(/[,→>]/)
      .map(n => n.trim())
      .filter(Boolean)
      .forEach(nodeName => {
        if (!map.has(nodeName)) map.set(nodeName, []);
        map.get(nodeName)!.push(cable);
      });
  });
  return map;
}

/** 케이블 단면적 계산 (mm²) — od 기반 원형 근사 */
function cableCrossSection(cable: CableData): number {
  const r = (cable.od || 0) / 2;
  return Math.PI * r * r;
}

/** 케이블 타입에서 전압 등급 추정 */
function estimateVoltageClass(cableType: string): 'HV' | 'LV' | 'UNKNOWN' {
  const t = (cableType || '').toUpperCase();
  // TY = 특수(고압 계열), MY/DY = 저압
  if (t.startsWith('TY') || t.includes('HV') || t.includes('HIGH')) return 'HV';
  if (t.startsWith('MY') || t.startsWith('DY') || t.includes('LV') || t.includes('LOW')) return 'LV';
  return 'UNKNOWN';
}

// ─── 규칙 구현 ──────────────────────────────────────────────────

/** R01: 파워-시그널 혼재 금지 */
const ruleR01: InterferenceRule = {
  id: 'R01',
  name: '파워-시그널 혼재 금지',
  description: '같은 노드를 통과하는 POWER 계열과 SIGNAL 계열 케이블이 동시에 존재하면 에러',
  severity: 'error',
  check(cables) {
    const nodeCableMap = buildNodeCableMap(cables);
    const results: InterferenceResult[] = [];

    nodeCableMap.forEach((nodeCables, nodeName) => {
      const categories = new Set(
        nodeCables.map(c => categorizeSystem(c.system || ''))
      );
      if (categories.has('POWER') && categories.has('SIGNAL')) {
        const powerCables = nodeCables
          .filter(c => categorizeSystem(c.system || '') === 'POWER')
          .map(c => c.name);
        const signalCables = nodeCables
          .filter(c => categorizeSystem(c.system || '') === 'SIGNAL')
          .map(c => c.name);
        results.push({
          ruleId: 'R01',
          ruleName: '파워-시그널 혼재 금지',
          severity: 'error',
          message: `노드 [${nodeName}]에서 파워 케이블(${powerCables.length}개)과 시그널 케이블(${signalCables.length}개)이 혼재합니다.`,
          affectedCables: [...powerCables, ...signalCables],
          affectedNodes: [nodeName],
          suggestion: '파워와 시그널 케이블을 별도 트레이/경로로 분리하십시오.',
        });
      }
    });

    return results;
  },
};

/** R02: 소방 케이블 전용 트레이 */
const ruleR02: InterferenceRule = {
  id: 'R02',
  name: '소방 케이블 전용 트레이',
  description: 'FIRE 시스템 케이블은 다른 시스템과 혼재 불가',
  severity: 'error',
  check(cables) {
    const nodeCableMap = buildNodeCableMap(cables);
    const results: InterferenceResult[] = [];

    nodeCableMap.forEach((nodeCables, nodeName) => {
      const fireCables = nodeCables.filter(c => categorizeSystem(c.system || '') === 'SPECIAL');
      const otherCables = nodeCables.filter(c => categorizeSystem(c.system || '') !== 'SPECIAL');
      if (fireCables.length > 0 && otherCables.length > 0) {
        results.push({
          ruleId: 'R02',
          ruleName: '소방 케이블 전용 트레이',
          severity: 'error',
          message: `노드 [${nodeName}]에서 소방 케이블(${fireCables.length}개)이 비소방 케이블(${otherCables.length}개)과 혼재합니다.`,
          affectedCables: [
            ...fireCables.map(c => c.name),
            ...otherCables.map(c => c.name),
          ],
          affectedNodes: [nodeName],
          suggestion: '소방(FIRE) 케이블은 전용 트레이를 사용해야 합니다. 별도 경로를 지정하십시오.',
        });
      }
    });

    return results;
  },
};

/** R03: 트레이 과적 경고 */
const ruleR03: InterferenceRule = {
  id: 'R03',
  name: '트레이 과적 경고',
  description: '한 노드를 통과하는 케이블의 총 단면적이 트레이 표준 용량의 40% 충전율을 초과',
  severity: 'warning',
  check(cables, nodes) {
    const nodeCableMap = buildNodeCableMap(cables);
    const results: InterferenceResult[] = [];

    // 표준 트레이 높이 60mm, 충전율 40%
    const TRAY_HEIGHT_MM = 60;
    const FILL_RATIO_LIMIT = 0.4;

    nodeCableMap.forEach((nodeCables, nodeName) => {
      const totalArea = nodeCables.reduce((sum, c) => sum + cableCrossSection(c), 0);

      // 총 OD 합으로 최소 트레이 폭 추정 (mm)
      const totalOD = nodeCables.reduce((sum, c) => sum + (c.od || 0), 0);
      // 표준 트레이폭 후보: 100, 150, 200, 300, 400, 500, 600 mm
      const standardWidths = [100, 150, 200, 300, 400, 500, 600];
      const estimatedWidth = standardWidths.find(w => w >= totalOD / 2) || 600;

      const trayCapacity = estimatedWidth * TRAY_HEIGHT_MM;
      const allowedArea = trayCapacity * FILL_RATIO_LIMIT;

      if (totalArea > allowedArea) {
        results.push({
          ruleId: 'R03',
          ruleName: '트레이 과적 경고',
          severity: 'warning',
          message: `노드 [${nodeName}]: 케이블 총 단면적 ${totalArea.toFixed(1)}mm²가 트레이 허용 용량 ${allowedArea.toFixed(1)}mm²(${estimatedWidth}×${TRAY_HEIGHT_MM}×${FILL_RATIO_LIMIT * 100}%)를 초과합니다. (케이블 ${nodeCables.length}개)`,
          affectedCables: nodeCables.map(c => c.name),
          affectedNodes: [nodeName],
          suggestion: `트레이 폭을 증설하거나 일부 케이블을 다른 경로로 분산하십시오.`,
        });
      }
    });

    return results;
  },
};

/** R04: 고압-저압 분리 */
const ruleR04: InterferenceRule = {
  id: 'R04',
  name: '고압-저압 분리',
  description: '케이블 타입 기반 고압(HV)과 저압(LV)이 같은 경로에 있으면 경고',
  severity: 'warning',
  check(cables) {
    const nodeCableMap = buildNodeCableMap(cables);
    const results: InterferenceResult[] = [];

    nodeCableMap.forEach((nodeCables, nodeName) => {
      const hvCables = nodeCables.filter(c => estimateVoltageClass(c.type) === 'HV');
      const lvCables = nodeCables.filter(c => estimateVoltageClass(c.type) === 'LV');

      if (hvCables.length > 0 && lvCables.length > 0) {
        results.push({
          ruleId: 'R04',
          ruleName: '고압-저압 분리',
          severity: 'warning',
          message: `노드 [${nodeName}]에서 고압 케이블(${hvCables.length}개)과 저압 케이블(${lvCables.length}개)이 혼재합니다.`,
          affectedCables: [
            ...hvCables.map(c => c.name),
            ...lvCables.map(c => c.name),
          ],
          affectedNodes: [nodeName],
          suggestion: '고압(HV)과 저압(LV) 케이블은 분리된 트레이/경로를 사용하십시오.',
        });
      }
    });

    return results;
  },
};

/** R05: 과밀 노드 경고 */
const ruleR05: InterferenceRule = {
  id: 'R05',
  name: '과밀 노드 경고',
  description: '한 노드에 50개 이상 케이블 통과 시 경고, 100개 이상이면 에러',
  severity: 'warning',
  check(cables) {
    const nodeCableMap = buildNodeCableMap(cables);
    const results: InterferenceResult[] = [];

    nodeCableMap.forEach((nodeCables, nodeName) => {
      const count = nodeCables.length;
      if (count >= 100) {
        results.push({
          ruleId: 'R05',
          ruleName: '과밀 노드 경고',
          severity: 'error',
          message: `노드 [${nodeName}]에 ${count}개의 케이블이 통과합니다. (100개 이상 — 심각)`,
          affectedCables: nodeCables.map(c => c.name),
          affectedNodes: [nodeName],
          suggestion: '경로를 재설계하여 케이블을 분산시키십시오. 100개 이상은 물리적으로 수용 불가능합니다.',
        });
      } else if (count >= 50) {
        results.push({
          ruleId: 'R05',
          ruleName: '과밀 노드 경고',
          severity: 'warning',
          message: `노드 [${nodeName}]에 ${count}개의 케이블이 통과합니다. (50개 이상)`,
          affectedCables: nodeCables.map(c => c.name),
          affectedNodes: [nodeName],
          suggestion: '일부 케이블을 대체 경로로 분산하는 것을 검토하십시오.',
        });
      }
    });

    return results;
  },
};

/** R06: 역방향 중복 케이블 */
const ruleR06: InterferenceRule = {
  id: 'R06',
  name: '역방향 중복 케이블',
  description: '같은 from/to 노드 쌍에 동일 타입 케이블이 2개 이상이면 정보',
  severity: 'info',
  check(cables) {
    const results: InterferenceResult[] = [];

    // (from, to) 쌍의 정규화 키 → 케이블 그룹
    const pairMap = new Map<string, CableData[]>();

    cables.forEach(cable => {
      const from = (cable.fromNode || '').trim();
      const to = (cable.toNode || '').trim();
      if (!from || !to) return;

      // 방향 무관하게 정규화 (알파벳순 정렬)
      const key = [from, to].sort().join('::') + '::' + (cable.type || '').toUpperCase();
      if (!pairMap.has(key)) pairMap.set(key, []);
      pairMap.get(key)!.push(cable);
    });

    pairMap.forEach((group, key) => {
      if (group.length >= 2) {
        const [from, to] = key.split('::');
        const cableType = group[0].type || 'N/A';
        results.push({
          ruleId: 'R06',
          ruleName: '역방향 중복 케이블',
          severity: 'info',
          message: `노드 [${from}] ↔ [${to}] 사이에 동일 타입(${cableType}) 케이블이 ${group.length}개 존재합니다.`,
          affectedCables: group.map(c => c.name),
          affectedNodes: [from, to],
          suggestion: '의도된 중복인지 확인하십시오. 불필요한 경우 통합을 검토하십시오.',
        });
      }
    });

    return results;
  },
};

/** R07: 경로 미계산 케이블 */
const ruleR07: InterferenceRule = {
  id: 'R07',
  name: '경로 미계산 케이블',
  description: 'calculatedPath가 없는 케이블 목록',
  severity: 'warning',
  check(cables) {
    const unrouted = cables.filter(c => {
      const path = (c.calculatedPath || '').trim();
      return !path;
    });

    if (unrouted.length === 0) return [];

    return [{
      ruleId: 'R07',
      ruleName: '경로 미계산 케이블',
      severity: 'warning',
      message: `경로가 계산되지 않은 케이블이 ${unrouted.length}개 있습니다.`,
      affectedCables: unrouted.map(c => c.name),
      affectedNodes: [],
      suggestion: '경로 자동 계산을 실행하거나, 수동으로 경로를 지정하십시오.',
    }];
  },
};

// ─── 규칙 레지스트리 ────────────────────────────────────────────

export const ALL_RULES: InterferenceRule[] = [
  ruleR01,
  ruleR02,
  ruleR03,
  ruleR04,
  ruleR05,
  ruleR06,
  ruleR07,
];

// ─── 메인 함수 ──────────────────────────────────────────────────

export function runInterferenceCheck(
  cables: CableData[],
  nodes: NodeData[],
  options?: { enabledRules?: string[] }
): InterferenceReport {
  const enabledIds = options?.enabledRules;
  const rulesToRun = enabledIds
    ? ALL_RULES.filter(r => enabledIds.includes(r.id))
    : ALL_RULES;

  const allResults: InterferenceResult[] = [];
  let passedCount = 0;

  rulesToRun.forEach(rule => {
    const ruleResults = rule.check(cables, nodes);
    if (ruleResults.length === 0) {
      passedCount++;
    } else {
      allResults.push(...ruleResults);
    }
  });

  const errors = allResults.filter(r => r.severity === 'error').length;
  const warnings = allResults.filter(r => r.severity === 'warning').length;
  const infos = allResults.filter(r => r.severity === 'info').length;

  return {
    timestamp: new Date().toISOString(),
    totalCables: cables.length,
    totalNodes: nodes.length,
    results: allResults,
    summary: {
      errors,
      warnings,
      infos,
      passed: passedCount,
      totalRules: rulesToRun.length,
    },
  };
}
