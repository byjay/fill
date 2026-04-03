/**
 * classRuleCheck.ts
 * 선급(Classification Society) 규정 자동 검증 모듈
 * DNV, Lloyd's Register, KR(한국선급), ABS, BV 규정 기반
 *
 * 기존 SCM 코드 수정 없이 독립 작동
 */

import type { CableData, NodeData, CableTypeData } from '../types';

// ─── 타입 정의 ───────────────────────────────────────────────

export type ClassSociety = 'DNV' | 'LR' | 'KR' | 'ABS' | 'BV' | 'COMMON';

export interface RuleCheckOptions {
  classSociety: ClassSociety;
  vesselType: 'cargo' | 'tanker' | 'passenger' | 'naval' | 'offshore';
  voltage: number;
  frequency: number;
}

export interface ClassRule {
  id: string;
  category: string;
  name: string;
  description: string;
  reference: string;
  classSociety: ClassSociety | ClassSociety[];
  severity: 'critical' | 'major' | 'minor' | 'advisory';
  check: (data: RuleCheckData) => RuleCheckResult[];
}

export interface RuleCheckData {
  cables: CableData[];
  nodes: NodeData[];
  cableTypeDB: CableTypeData[];
  options: RuleCheckOptions;
}

export interface RuleCheckResult {
  ruleId: string;
  ruleName: string;
  category: string;
  reference: string;
  severity: 'critical' | 'major' | 'minor' | 'advisory';
  status: 'pass' | 'fail' | 'warning' | 'not_applicable';
  message: string;
  details: string;
  affectedCables: string[];
  affectedNodes: string[];
  recommendation: string;
}

export interface ClassRuleReport {
  timestamp: string;
  classSociety: ClassSociety;
  vesselType: string;
  totalCables: number;
  totalNodes: number;
  results: RuleCheckResult[];
  summary: {
    critical: number;
    major: number;
    minor: number;
    advisory: number;
    passed: number;
    notApplicable: number;
    totalRules: number;
    complianceRate: number;
  };
  byCategory: Record<string, {
    total: number;
    passed: number;
    failed: number;
  }>;
}

// ─── 헬퍼 함수 ──────────────────────────────────────────────

/** 케이블 시스템에서 전압 등급 추정 */
function estimateVoltageLevel(cable: CableData): 'HV' | 'LV' | 'ELV' | 'unknown' {
  const sys = (cable.system ?? '').toUpperCase();
  const name = (cable.name ?? '').toUpperCase();
  const type = (cable.type ?? '').toUpperCase();
  const combined = `${sys} ${name} ${type}`;

  if (/6\.6KV|6600|3\.3KV|3300|11KV|HIGH\s*VOLT/i.test(combined)) return 'HV';
  if (/24V|12V|5V|ELV|EXTRA\s*LOW/i.test(combined)) return 'ELV';
  if (/440V|380V|220V|LV|LOW\s*VOLT|POWER|MOTOR|PUMP|FAN|COMP/i.test(combined)) return 'LV';
  if (/CTRL|CONTROL|SIGNAL|INST|COMM|DATA|NETWORK|CAT|FIBER/i.test(combined)) return 'ELV';
  return 'unknown';
}

/** 케이블이 비상 회로인지 판별 */
function isEmergencyCircuit(cable: CableData): boolean {
  const combined = `${cable.system ?? ''} ${cable.name ?? ''} ${cable.remark ?? ''}`.toUpperCase();
  return /EMERG|EM\b|E\/G|EPB|FIRE|SAFETY|LIFE\s*BOAT|BILGE|G\.A\.|GENERAL\s*ALARM/i.test(combined);
}

/** 노드가 기관실에 있는지 추정 (deck 코드 기반) */
function isEngineRoom(node: NodeData): boolean {
  const deck = (node.deck ?? '').toUpperCase();
  const name = (node.name ?? '').toUpperCase();
  const structure = (node.structure ?? '').toUpperCase();
  const combined = `${deck} ${name} ${structure}`;
  return /E\.?R|ENGINE|MACH|M\.?R|BOILER|SHAFT/i.test(combined);
}

/** 케이블 타입에서 차폐 여부 추정 */
function isShieldedCable(cableType: string): boolean {
  return /SH|SHIELD|SCRN|SCREEN|S$|IS\b/i.test(cableType);
}

/** 노드가 위험 구역인지 추정 */
function isHazardousArea(node: NodeData): boolean {
  const combined = `${node.deck ?? ''} ${node.name ?? ''} ${node.structure ?? ''} ${node.component ?? ''}`.toUpperCase();
  return /HAZ|ZONE\s*[012]|PAINT|BATT|CARGO\s*TANK|PUMP\s*ROOM|COFFERDAM/i.test(combined);
}

/** 케이블이 제어/통신 케이블인지 추정 */
function isControlOrCommCable(cable: CableData): boolean {
  const combined = `${cable.system ?? ''} ${cable.type ?? ''} ${cable.name ?? ''}`.toUpperCase();
  return /CTRL|CONTROL|SIGNAL|INST|COMM|DATA|NETWORK|CAT|FIBER|TELE|ALARM/i.test(combined);
}

/** 케이블이 전력(파워) 케이블인지 추정 */
function isPowerCable(cable: CableData): boolean {
  const combined = `${cable.system ?? ''} ${cable.type ?? ''} ${cable.name ?? ''}`.toUpperCase();
  return /POWER|PWR|MOTOR|PUMP|FAN|COMP|HEATER|FEEDER|MAIN/i.test(combined);
}

/** 케이블이 소방 관련인지 추정 */
function isFireSafetyCable(cable: CableData): boolean {
  const combined = `${cable.system ?? ''} ${cable.name ?? ''} ${cable.remark ?? ''}`.toUpperCase();
  return /FIRE|F\.?A\.|SPRINKLER|SMOKE|CO2|DRENCHER|DETECT/i.test(combined);
}

/** 케이블 단면적 추출 (CableTypeData에서) */
function getCrossSection(cable: CableData, cableTypeDB: CableTypeData[]): number | null {
  const ct = cableTypeDB.find(t => t.cableType === cable.type);
  return ct?.crossSection ?? null;
}

/** 케이블 외경 추출 */
function getOD(cable: CableData, cableTypeDB: CableTypeData[]): number {
  if (cable.od && cable.od > 0) return cable.od;
  const ct = cableTypeDB.find(t => t.cableType === cable.type);
  return ct?.od ?? 0;
}

/** 케이블의 from/to 노드 객체 조회 */
function findNode(nodeName: string | undefined, nodes: NodeData[]): NodeData | undefined {
  if (!nodeName) return undefined;
  return nodes.find(n => n.name === nodeName);
}

/** 케이블 종류 추정 (동력/조명/제어/통신) */
function estimateCableUsage(cable: CableData): 'power' | 'lighting' | 'control' | 'communication' | 'unknown' {
  const combined = `${cable.system ?? ''} ${cable.name ?? ''} ${cable.type ?? ''}`.toUpperCase();
  if (/LIGHT|LTG|LAMP|FLUOR/i.test(combined)) return 'lighting';
  if (/COMM|DATA|NETWORK|CAT|FIBER|TELE|LAN/i.test(combined)) return 'communication';
  if (/CTRL|CONTROL|SIGNAL|INST|ALARM|SENSOR/i.test(combined)) return 'control';
  if (/POWER|PWR|MOTOR|PUMP|FAN|COMP|HEATER|FEEDER/i.test(combined)) return 'power';
  return 'unknown';
}

/** path 문자열에서 노드 목록 파싱 */
function parsePath(cable: CableData): string[] {
  const raw = cable.calculatedPath ?? cable.path ?? '';
  if (!raw) return [];
  return raw.split(/[→>\/\-,;|]+/).map(s => s.trim()).filter(Boolean);
}

// ─── 규칙 정의 ──────────────────────────────────────────────

const RULES: ClassRule[] = [];

// ---------- Category 1: 케이블 선정 ----------

// CR01: 전압강하 한도
RULES.push({
  id: 'CR01',
  category: '케이블 선정',
  name: '전압강하 한도',
  description: '케이블 전압강하가 선급 기준 한도를 초과하는지 확인',
  reference: 'IEC 60092-352, DNV Pt.4 Ch.8 Sec.3',
  classSociety: 'COMMON',
  severity: 'major',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    // 전압강하 데이터가 CableData에 직접 없으므로, 길이와 단면적으로 추정
    // Advisory: 데이터 부족 시 안내만 제공
    const longCables = data.cables.filter(c => {
      const len = c.calculatedLength ?? c.length ?? 0;
      return len > 50; // 50m 이상 케이블에 대해 경고
    });

    if (longCables.length === 0) {
      results.push({
        ruleId: 'CR01', ruleName: '전압강하 한도', category: '케이블 선정',
        reference: 'IEC 60092-352, DNV Pt.4 Ch.8 Sec.3',
        severity: 'advisory', status: 'pass',
        message: '50m 이상 장거리 케이블 없음',
        details: '전압강하 관련 장거리 케이블이 발견되지 않았습니다.',
        affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
      return results;
    }

    const limits: Record<string, { lighting: number; power: number }> = {
      DNV: { lighting: 6, power: 6 },
      KR:  { lighting: 4, power: 5 },
      LR:  { lighting: 6, power: 6 },
      ABS: { lighting: 6, power: 6 },
      BV:  { lighting: 6, power: 6 },
      COMMON: { lighting: 6, power: 6 },
    };

    const limit = limits[data.options.classSociety] ?? limits.COMMON;

    for (const cable of longCables) {
      const cs = getCrossSection(cable, data.cableTypeDB);
      const len = cable.calculatedLength ?? cable.length ?? 0;
      const usage = estimateCableUsage(cable);
      const maxDrop = usage === 'lighting' ? limit.lighting : limit.power;

      if (cs && cs > 0) {
        // 간이 전압강하 추정: Vd ≈ 2 × ρ × L × I / (S × V) × 100 (%)
        // 전류 정보 없으므로 단면적 대비 길이만으로 경고
        // 경험적 기준: L/S > 35 이면 주의 (440V 기준)
        const ratio = len / cs;
        if (ratio > 35) {
          results.push({
            ruleId: 'CR01', ruleName: '전압강하 한도', category: '케이블 선정',
            reference: 'IEC 60092-352, DNV Pt.4 Ch.8 Sec.3',
            severity: 'major', status: 'warning',
            message: `${cable.name}: 길이/단면적 비율(${ratio.toFixed(1)})이 높아 전압강하 ${maxDrop}% 초과 우려`,
            details: `길이=${len}m, 단면적=${cs}mm², L/S=${ratio.toFixed(1)}, 허용전압강하=${maxDrop}%`,
            affectedCables: [cable.id],
            affectedNodes: [cable.fromNode ?? '', cable.toNode ?? ''].filter(Boolean),
            recommendation: `전압강하 상세 계산 필요. 단면적 증가 또는 경로 단축 검토.`,
          });
        }
      } else {
        results.push({
          ruleId: 'CR01', ruleName: '전압강하 한도', category: '케이블 선정',
          reference: 'IEC 60092-352, DNV Pt.4 Ch.8 Sec.3',
          severity: 'advisory', status: 'warning',
          message: `${cable.name}: 단면적 데이터 없음, 전압강하 검토 불가`,
          details: `길이=${len}m, 케이블 타입=${cable.type}`,
          affectedCables: [cable.id], affectedNodes: [],
          recommendation: '케이블 타입 DB에 단면적 정보를 등록하고 전압강하를 재검토하세요.',
        });
      }
    }

    if (results.length === 0) {
      results.push({
        ruleId: 'CR01', ruleName: '전압강하 한도', category: '케이블 선정',
        reference: 'IEC 60092-352, DNV Pt.4 Ch.8 Sec.3',
        severity: 'major', status: 'pass',
        message: '장거리 케이블의 전압강하 비율 양호',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR02: 케이블 허용전류 초과
RULES.push({
  id: 'CR02',
  category: '케이블 선정',
  name: '케이블 허용전류 초과',
  description: '각 케이블의 부하전류가 허용전류를 초과하는지 확인 (온도 보정 계수 적용)',
  reference: 'IEC 60092-352 Table A.1',
  classSociety: 'COMMON',
  severity: 'critical',
  check: (data) => {
    // 전류 데이터가 CableData에 없으므로 advisory로 처리
    const results: RuleCheckResult[] = [];
    const cablesWithoutCurrentData = data.cables.filter(c => {
      const cs = getCrossSection(c, data.cableTypeDB);
      return cs !== null && cs > 0;
    });

    if (cablesWithoutCurrentData.length > 0) {
      results.push({
        ruleId: 'CR02', ruleName: '케이블 허용전류 초과', category: '케이블 선정',
        reference: 'IEC 60092-352 Table A.1',
        severity: 'advisory', status: 'not_applicable',
        message: `${data.cables.length}개 케이블에 대해 부하전류 데이터 없음, 자동 검증 불가`,
        details: '부하전류, 허용전류 데이터가 CableData에 포함되지 않아 자동 검증이 불가합니다. ' +
                 '기관실(45°C) 케이블은 온도 보정 계수 0.87, 일반 구역(40°C)은 1.0 적용 필요.',
        affectedCables: [], affectedNodes: [],
        recommendation: '전기 부하 목록(Load List)과 대조하여 각 케이블의 부하전류가 허용전류 이내인지 확인하세요.',
      });
    }
    return results;
  },
});

// CR03: 단락전류 내량
RULES.push({
  id: 'CR03',
  category: '케이블 선정',
  name: '단락전류 내량',
  description: '케이블 단면적 vs 단락전류 시간 관계 (I²t ≤ K²S²)',
  reference: 'IEC 60092-352 Sec.7',
  classSociety: 'COMMON',
  severity: 'critical',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    results.push({
      ruleId: 'CR03', ruleName: '단락전류 내량', category: '케이블 선정',
      reference: 'IEC 60092-352 Sec.7',
      severity: 'advisory', status: 'not_applicable',
      message: '단락전류 데이터 없음, 자동 검증 불가',
      details: '단락전류(I_sc)와 차단시간(t) 데이터 필요. 공식: I²t ≤ K²S² (구리 K=143).',
      affectedCables: [], affectedNodes: [],
      recommendation: '단락전류 계산서와 대조하여 I²t ≤ K²S² 조건을 확인하세요.',
    });
    return results;
  },
});

// CR04: 최소 단면적
RULES.push({
  id: 'CR04',
  category: '케이블 선정',
  name: '최소 단면적',
  description: '케이블 용도별 최소 단면적 충족 여부 확인',
  reference: 'IEC 60092-352 Sec.5.2',
  classSociety: 'COMMON',
  severity: 'major',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const minCrossSection: Record<string, number> = {
      power: 1.5,
      lighting: 1.5,
      control: 0.75,
      communication: 0.5,
      unknown: 0.75,
    };

    const violations: CableData[] = [];
    for (const cable of data.cables) {
      const cs = getCrossSection(cable, data.cableTypeDB);
      if (cs === null) continue;
      const usage = estimateCableUsage(cable);
      const minCS = minCrossSection[usage];
      if (cs < minCS) {
        violations.push(cable);
        results.push({
          ruleId: 'CR04', ruleName: '최소 단면적', category: '케이블 선정',
          reference: 'IEC 60092-352 Sec.5.2',
          severity: 'major', status: 'fail',
          message: `${cable.name}: 단면적 ${cs}mm²이 최소 기준 ${minCS}mm²(${usage}) 미달`,
          details: `케이블 타입=${cable.type}, 용도=${usage}, 단면적=${cs}mm², 최소 요구=${minCS}mm²`,
          affectedCables: [cable.id], affectedNodes: [],
          recommendation: `최소 ${minCS}mm² 이상의 케이블로 변경하세요.`,
        });
      }
    }

    if (violations.length === 0) {
      results.push({
        ruleId: 'CR04', ruleName: '최소 단면적', category: '케이블 선정',
        reference: 'IEC 60092-352 Sec.5.2',
        severity: 'major', status: data.cableTypeDB.length > 0 ? 'pass' : 'not_applicable',
        message: data.cableTypeDB.length > 0
          ? '모든 케이블이 최소 단면적 기준을 충족합니다.'
          : '케이블 타입 DB가 없어 단면적 검증을 수행할 수 없습니다.',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: data.cableTypeDB.length > 0 ? '' : '케이블 타입 DB를 등록하세요.',
      });
    }
    return results;
  },
});

// ---------- Category 2: 케이블 포설 ----------

// CR05: 허용 굴곡 반경
RULES.push({
  id: 'CR05',
  category: '케이블 포설',
  name: '허용 굴곡 반경',
  description: '케이블 외경 대비 최소 굴곡 반경 충족 여부 (고정 6D/8D, 이동 10D)',
  reference: 'IEC 60092-352 Sec.9.3',
  classSociety: 'COMMON',
  severity: 'minor',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    // 굴곡 정보는 경로 데이터에서 직접 판단 불가 -> advisory
    const largeCables = data.cables.filter(c => getOD(c, data.cableTypeDB) > 30);

    if (largeCables.length > 0) {
      const minBendRadii = largeCables.map(c => {
        const od = getOD(c, data.cableTypeDB);
        const shielded = isShieldedCable(c.type);
        const multiplier = shielded ? 8 : 6;
        return { cable: c, od, minBendRadius: od * multiplier };
      });

      results.push({
        ruleId: 'CR05', ruleName: '허용 굴곡 반경', category: '케이블 포설',
        reference: 'IEC 60092-352 Sec.9.3',
        severity: 'advisory', status: 'warning',
        message: `OD 30mm 이상 대형 케이블 ${largeCables.length}개 — 현장 굴곡 반경 확인 필요`,
        details: minBendRadii.slice(0, 10).map(r =>
          `${r.cable.name}: OD=${r.od}mm, 최소 굴곡 반경=${r.minBendRadius}mm`
        ).join('; '),
        affectedCables: largeCables.map(c => c.id),
        affectedNodes: [],
        recommendation: '대형 케이블 포설 구간에서 최소 굴곡 반경(비차폐 6D, 차폐 8D)을 준수하세요.',
      });
    } else {
      results.push({
        ruleId: 'CR05', ruleName: '허용 굴곡 반경', category: '케이블 포설',
        reference: 'IEC 60092-352 Sec.9.3',
        severity: 'minor', status: 'pass',
        message: 'OD 30mm 이상 대형 케이블 없음',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR06: 트레이 충전율
RULES.push({
  id: 'CR06',
  category: '케이블 포설',
  name: '트레이 충전율',
  description: '트레이 충전율이 규정 한도(단층 100%, 다층 40~50%)를 초과하는지 확인',
  reference: 'IEC 61537, DNV Pt.4 Ch.8 Sec.9',
  classSociety: 'COMMON',
  severity: 'major',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    // 트레이 충전율은 TrayFillTab에서 별도 계산 -> 여기서는 노드별 케이블 밀집도 확인
    const nodeMap = new Map<string, CableData[]>();

    for (const cable of data.cables) {
      const pathNodes = parsePath(cable);
      for (const nd of pathNodes) {
        if (!nodeMap.has(nd)) nodeMap.set(nd, []);
        nodeMap.get(nd)!.push(cable);
      }
    }

    const densNodes = Array.from(nodeMap.entries())
      .filter(([, cables]) => cables.length > 30)
      .sort((a, b) => b[1].length - a[1].length);

    if (densNodes.length > 0) {
      for (const [nodeName, cables] of densNodes.slice(0, 10)) {
        const totalArea = cables.reduce((sum, c) => {
          const od = getOD(c, data.cableTypeDB);
          return sum + Math.PI * (od / 2) ** 2;
        }, 0);

        results.push({
          ruleId: 'CR06', ruleName: '트레이 충전율', category: '케이블 포설',
          reference: 'IEC 61537, DNV Pt.4 Ch.8 Sec.9',
          severity: 'major', status: 'warning',
          message: `노드 ${nodeName}: ${cables.length}개 케이블 통과, 충전율 확인 필요`,
          details: `총 단면적=${totalArea.toFixed(0)}mm², 다층 적층 시 트레이 단면적의 40%(IEC)/50%(DNV) 이내 준수 필요`,
          affectedCables: cables.slice(0, 20).map(c => c.id),
          affectedNodes: [nodeName],
          recommendation: '트레이 충전율 계산(TrayFill 탭)을 수행하고, 필요 시 트레이 폭을 증가하거나 다단 구성하세요.',
        });
      }
    } else {
      results.push({
        ruleId: 'CR06', ruleName: '트레이 충전율', category: '케이블 포설',
        reference: 'IEC 61537, DNV Pt.4 Ch.8 Sec.9',
        severity: 'major', status: 'pass',
        message: '과밀 노드(30개 케이블 이상) 없음',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR07: 수직 구간 케이블 지지
RULES.push({
  id: 'CR07',
  category: '케이블 포설',
  name: '수직 구간 케이블 지지',
  description: '수직 3m 이상 구간에서 중간 지지 필요 여부 확인',
  reference: 'IEC 60092-352 Sec.9.5',
  classSociety: 'COMMON',
  severity: 'minor',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    // 노드의 z좌표 차이로 수직 구간 추정
    const verticalCables: { cable: CableData; heightDiff: number }[] = [];

    for (const cable of data.cables) {
      const fromN = findNode(cable.fromNode, data.nodes);
      const toN = findNode(cable.toNode, data.nodes);
      if (fromN?.z !== undefined && toN?.z !== undefined) {
        const diff = Math.abs(fromN.z - toN.z);
        if (diff >= 3) {
          verticalCables.push({ cable, heightDiff: diff });
        }
      }
    }

    if (verticalCables.length > 0) {
      for (const { cable, heightDiff } of verticalCables) {
        results.push({
          ruleId: 'CR07', ruleName: '수직 구간 케이블 지지', category: '케이블 포설',
          reference: 'IEC 60092-352 Sec.9.5',
          severity: heightDiff >= 6 ? 'major' : 'minor',
          status: 'warning',
          message: `${cable.name}: 수직 구간 ${heightDiff.toFixed(1)}m — ${heightDiff >= 6 ? '케이블 자중 계산 및 중간 지지 필수' : '중간 지지 권장'}`,
          details: `from=${cable.fromNode}, to=${cable.toNode}, 높이차=${heightDiff.toFixed(1)}m`,
          affectedCables: [cable.id],
          affectedNodes: [cable.fromNode ?? '', cable.toNode ?? ''].filter(Boolean),
          recommendation: heightDiff >= 6
            ? '수직 6m 이상: 케이블 자중을 계산하고 중간 클리트/행거를 설치하세요.'
            : '수직 3m 이상: 중간 지지(클리트)를 설치하세요.',
        });
      }
    } else {
      results.push({
        ruleId: 'CR07', ruleName: '수직 구간 케이블 지지', category: '케이블 포설',
        reference: 'IEC 60092-352 Sec.9.5',
        severity: 'minor', status: 'pass',
        message: '수직 3m 이상 구간 케이블 없음 (또는 Z좌표 데이터 부족)',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// ---------- Category 3: 분리 요구사항 ----------

// CR08: 전력-제어 분리
RULES.push({
  id: 'CR08',
  category: '분리 요구사항',
  name: '전력-제어 분리',
  description: '파워 케이블과 제어/통신 케이블이 같은 트레이(노드)를 공유하는지 확인',
  reference: 'IEC 60092-352 Sec.8.2, DNV Pt.4 Ch.8 Sec.5',
  classSociety: 'COMMON',
  severity: 'major',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const nodeMap = new Map<string, { power: CableData[]; control: CableData[] }>();

    for (const cable of data.cables) {
      const pathNodes = parsePath(cable);
      const power = isPowerCable(cable);
      const ctrl = isControlOrCommCable(cable);
      if (!power && !ctrl) continue;

      for (const nd of pathNodes) {
        if (!nodeMap.has(nd)) nodeMap.set(nd, { power: [], control: [] });
        const entry = nodeMap.get(nd)!;
        if (power) entry.power.push(cable);
        if (ctrl) entry.control.push(cable);
      }
    }

    const mixedNodes = Array.from(nodeMap.entries())
      .filter(([, v]) => v.power.length > 0 && v.control.length > 0);

    if (mixedNodes.length > 0) {
      for (const [nodeName, { power, control }] of mixedNodes.slice(0, 15)) {
        results.push({
          ruleId: 'CR08', ruleName: '전력-제어 분리', category: '분리 요구사항',
          reference: 'IEC 60092-352 Sec.8.2, DNV Pt.4 Ch.8 Sec.5',
          severity: 'major', status: 'warning',
          message: `노드 ${nodeName}: 전력(${power.length}개)과 제어/통신(${control.length}개) 케이블 혼재`,
          details: `전력: ${power.slice(0, 5).map(c => c.name).join(', ')}${power.length > 5 ? ' ...' : ''}; ` +
                   `제어: ${control.slice(0, 5).map(c => c.name).join(', ')}${control.length > 5 ? ' ...' : ''}`,
          affectedCables: [...power.slice(0, 10), ...control.slice(0, 10)].map(c => c.id),
          affectedNodes: [nodeName],
          recommendation: '전력 케이블과 제어/통신 케이블은 별도 트레이를 사용하거나 격벽(separator)을 설치하세요.',
        });
      }
    } else {
      results.push({
        ruleId: 'CR08', ruleName: '전력-제어 분리', category: '분리 요구사항',
        reference: 'IEC 60092-352 Sec.8.2, DNV Pt.4 Ch.8 Sec.5',
        severity: 'major', status: 'pass',
        message: '전력-제어 케이블 혼재 노드 없음',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR09: 비상 케이블 경로 분리
RULES.push({
  id: 'CR09',
  category: '분리 요구사항',
  name: '비상 케이블 경로 분리',
  description: '비상 회로와 일반 회로가 같은 경로(노드)를 공유하는지 확인',
  reference: 'SOLAS Ch.II-1 Reg.45',
  classSociety: 'COMMON',
  severity: 'critical',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const emergCables = data.cables.filter(isEmergencyCircuit);
    const normalCables = data.cables.filter(c => !isEmergencyCircuit(c));

    if (emergCables.length === 0) {
      results.push({
        ruleId: 'CR09', ruleName: '비상 케이블 경로 분리', category: '분리 요구사항',
        reference: 'SOLAS Ch.II-1 Reg.45',
        severity: 'critical', status: 'not_applicable',
        message: '비상 회로 케이블이 식별되지 않음',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '비상 회로 케이블에 EMERG/EM/FIRE 등의 시스템 코드를 부여하세요.',
      });
      return results;
    }

    // 비상 케이블 경로 노드 수집
    const emergNodeSet = new Set<string>();
    for (const cable of emergCables) {
      for (const nd of parsePath(cable)) emergNodeSet.add(nd);
    }

    // 일반 케이블이 비상 노드를 공유하는지 확인
    const sharedNodes = new Map<string, { emerg: string[]; normal: string[] }>();
    for (const cable of normalCables) {
      for (const nd of parsePath(cable)) {
        if (emergNodeSet.has(nd)) {
          if (!sharedNodes.has(nd)) sharedNodes.set(nd, { emerg: [], normal: [] });
          sharedNodes.get(nd)!.normal.push(cable.name);
        }
      }
    }
    for (const cable of emergCables) {
      for (const nd of parsePath(cable)) {
        if (sharedNodes.has(nd)) {
          sharedNodes.get(nd)!.emerg.push(cable.name);
        }
      }
    }

    if (sharedNodes.size > 0) {
      for (const [nodeName, { emerg, normal }] of Array.from(sharedNodes.entries()).slice(0, 10)) {
        results.push({
          ruleId: 'CR09', ruleName: '비상 케이블 경로 분리', category: '분리 요구사항',
          reference: 'SOLAS Ch.II-1 Reg.45',
          severity: 'critical', status: 'fail',
          message: `노드 ${nodeName}: 비상 회로(${emerg.length}개)와 일반 회로(${normal.length}개) 경로 공유`,
          details: `비상: ${[...new Set(emerg)].slice(0, 5).join(', ')}; 일반: ${[...new Set(normal)].slice(0, 5).join(', ')}`,
          affectedCables: [],
          affectedNodes: [nodeName],
          recommendation: '비상 회로와 일반 회로는 물리적으로 분리된 경로(별도 트레이/덕트)를 사용해야 합니다. SOLAS 요구사항.',
        });
      }
    } else {
      results.push({
        ruleId: 'CR09', ruleName: '비상 케이블 경로 분리', category: '분리 요구사항',
        reference: 'SOLAS Ch.II-1 Reg.45',
        severity: 'critical', status: 'pass',
        message: '비상 회로와 일반 회로의 경로가 분리되어 있습니다.',
        details: `비상 케이블 ${emergCables.length}개 식별됨`,
        affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR10: 소방 케이블 내화
RULES.push({
  id: 'CR10',
  category: '분리 요구사항',
  name: '소방 케이블 내화',
  description: '소방 시스템 케이블에 내화 등급(IEC 60331) 요구',
  reference: 'SOLAS Ch.II-2, IEC 60331',
  classSociety: 'COMMON',
  severity: 'critical',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const fireCables = data.cables.filter(isFireSafetyCable);
    const emergCables = data.cables.filter(c => isEmergencyCircuit(c) && !isFireSafetyCable(c));

    if (fireCables.length === 0 && emergCables.length === 0) {
      results.push({
        ruleId: 'CR10', ruleName: '소방 케이블 내화', category: '분리 요구사항',
        reference: 'SOLAS Ch.II-2, IEC 60331',
        severity: 'advisory', status: 'not_applicable',
        message: '소방/비상 시스템 케이블이 식별되지 않음',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '소방 시스템 케이블에 FIRE/F.A./SPRINKLER 등의 시스템 코드를 부여하세요.',
      });
      return results;
    }

    const allFireEmerg = [...fireCables, ...emergCables];
    // 내화 등급은 케이블 타입명에서 추정
    for (const cable of allFireEmerg) {
      const typeStr = `${cable.type ?? ''} ${cable.remark ?? ''}`.toUpperCase();
      const hasFireRating = /FR|FIRE\s*RES|HF|LSZH|LSOH|SHF|FLAME/i.test(typeStr);

      if (!hasFireRating) {
        results.push({
          ruleId: 'CR10', ruleName: '소방 케이블 내화', category: '분리 요구사항',
          reference: 'SOLAS Ch.II-2, IEC 60331',
          severity: 'critical', status: 'warning',
          message: `${cable.name}: 소방/비상 케이블이지만 내화 등급 표시 없음`,
          details: `타입=${cable.type}, 시스템=${cable.system}`,
          affectedCables: [cable.id], affectedNodes: [],
          recommendation: 'IEC 60331 내화 시험을 통과한 케이블(FR 등급)을 사용하세요.',
        });
      }
    }

    if (results.length === 0) {
      results.push({
        ruleId: 'CR10', ruleName: '소방 케이블 내화', category: '분리 요구사항',
        reference: 'SOLAS Ch.II-2, IEC 60331',
        severity: 'critical', status: 'pass',
        message: '소방/비상 케이블에 내화 등급이 확인됩니다.',
        details: `소방 케이블 ${fireCables.length}개, 비상 케이블 ${emergCables.length}개`,
        affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR11: 주/비상 배전반 간 연결
RULES.push({
  id: 'CR11',
  category: '분리 요구사항',
  name: '주/비상 배전반 간 연결',
  description: '주 배전반과 비상 배전반 연결 케이블이 최단 경로이며 기관실 통과를 최소화하는지 확인',
  reference: 'SOLAS Ch.II-1 Reg.42',
  classSociety: 'COMMON',
  severity: 'major',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    // MSB/ESB 연결 케이블 탐색
    const msbEsbCables = data.cables.filter(c => {
      const combined = `${c.fromEquip ?? ''} ${c.toEquip ?? ''} ${c.name ?? ''} ${c.system ?? ''}`.toUpperCase();
      const hasMain = /MSB|MAIN\s*SW|MAIN\s*BOARD|M\.?S\.?B/i.test(combined);
      const hasEmerg = /ESB|EMERG|E\.?S\.?B|EMER.*BOARD|EMER.*SW/i.test(combined);
      return hasMain && hasEmerg;
    });

    if (msbEsbCables.length === 0) {
      results.push({
        ruleId: 'CR11', ruleName: '주/비상 배전반 간 연결', category: '분리 요구사항',
        reference: 'SOLAS Ch.II-1 Reg.42',
        severity: 'advisory', status: 'not_applicable',
        message: 'MSB-ESB 연결 케이블이 식별되지 않음',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: 'MSB-ESB 연결 케이블을 확인하세요.',
      });
      return results;
    }

    for (const cable of msbEsbCables) {
      const pathNodes = parsePath(cable);
      const erNodes = pathNodes.filter(nd => {
        const node = findNode(nd, data.nodes);
        return node ? isEngineRoom(node) : false;
      });

      if (erNodes.length > 0) {
        results.push({
          ruleId: 'CR11', ruleName: '주/비상 배전반 간 연결', category: '분리 요구사항',
          reference: 'SOLAS Ch.II-1 Reg.42',
          severity: 'major', status: 'warning',
          message: `${cable.name}: MSB-ESB 연결 케이블이 기관실 구간(${erNodes.join(', ')})을 통과`,
          details: `경로: ${pathNodes.join(' → ')}`,
          affectedCables: [cable.id],
          affectedNodes: erNodes,
          recommendation: 'MSB-ESB 연결 케이블은 기관실 통과를 최소화하는 최단 경로로 포설하세요.',
        });
      } else {
        results.push({
          ruleId: 'CR11', ruleName: '주/비상 배전반 간 연결', category: '분리 요구사항',
          reference: 'SOLAS Ch.II-1 Reg.42',
          severity: 'major', status: 'pass',
          message: `${cable.name}: MSB-ESB 연결 케이블이 기관실을 통과하지 않음`,
          details: `경로: ${pathNodes.join(' → ')}`,
          affectedCables: [cable.id], affectedNodes: [],
          recommendation: '',
        });
      }
    }
    return results;
  },
});

// ---------- Category 4: 환경 ----------

// CR12: 기관실 고온 구간
RULES.push({
  id: 'CR12',
  category: '환경',
  name: '기관실 고온 구간',
  description: '기관실 내 케이블이 90°C 이상 내열 등급인지, 배기관 근처 이격 여부 확인',
  reference: 'IEC 60092-352 Sec.6.2',
  classSociety: 'COMMON',
  severity: 'major',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const erCables: CableData[] = [];

    for (const cable of data.cables) {
      const pathNodes = parsePath(cable);
      const fromN = findNode(cable.fromNode, data.nodes);
      const toN = findNode(cable.toNode, data.nodes);

      const passesER = pathNodes.some(nd => {
        const node = findNode(nd, data.nodes);
        return node ? isEngineRoom(node) : false;
      }) || (fromN && isEngineRoom(fromN)) || (toN && isEngineRoom(toN));

      if (passesER) erCables.push(cable);
    }

    if (erCables.length === 0) {
      results.push({
        ruleId: 'CR12', ruleName: '기관실 고온 구간', category: '환경',
        reference: 'IEC 60092-352 Sec.6.2',
        severity: 'major', status: 'not_applicable',
        message: '기관실 통과 케이블이 식별되지 않음 (노드 데이터 부족 가능)',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '노드의 deck/structure 필드에 기관실 정보(ER, ENGINE 등)를 입력하세요.',
      });
      return results;
    }

    // 내열 등급 확인 (케이블 타입명에서 추정)
    const nonHeatResistant: CableData[] = [];
    for (const cable of erCables) {
      const typeStr = `${cable.type ?? ''}`.toUpperCase();
      const hasHeatRating = /90|105|HT|HEAT|EPR|XLPE|SILICONE/i.test(typeStr);
      if (!hasHeatRating) nonHeatResistant.push(cable);
    }

    if (nonHeatResistant.length > 0) {
      results.push({
        ruleId: 'CR12', ruleName: '기관실 고온 구간', category: '환경',
        reference: 'IEC 60092-352 Sec.6.2',
        severity: 'major', status: 'warning',
        message: `기관실 통과 케이블 ${nonHeatResistant.length}개에서 내열 등급 표시 미확인`,
        details: nonHeatResistant.slice(0, 10).map(c => `${c.name}(${c.type})`).join(', '),
        affectedCables: nonHeatResistant.slice(0, 20).map(c => c.id),
        affectedNodes: [],
        recommendation: '기관실 내 케이블은 90°C 이상 내열 등급(EPR, XLPE) 케이블을 사용하세요. 배기관 근처는 250mm 이상 이격 또는 차열판 설치.',
      });
    } else {
      results.push({
        ruleId: 'CR12', ruleName: '기관실 고온 구간', category: '환경',
        reference: 'IEC 60092-352 Sec.6.2',
        severity: 'major', status: 'pass',
        message: `기관실 통과 케이블 ${erCables.length}개 — 내열 등급 확인됨`,
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR13: 데크 관통 방화 처리
RULES.push({
  id: 'CR13',
  category: '환경',
  name: '데크 관통 방화 처리',
  description: 'A급 방화 구획 관통 시 방화 충전재(MCT) 필수',
  reference: 'SOLAS Ch.II-2 Reg.9, IMO MSC/Circ.1120',
  classSociety: 'COMMON',
  severity: 'critical',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    // 케이블이 서로 다른 deck을 통과하는지 확인
    const crossDeckCables: { cable: CableData; decks: string[] }[] = [];

    for (const cable of data.cables) {
      const decks = new Set<string>();
      const fromN = findNode(cable.fromNode, data.nodes);
      const toN = findNode(cable.toNode, data.nodes);
      if (fromN?.deck) decks.add(fromN.deck);
      if (toN?.deck) decks.add(toN.deck);

      // 경로 상의 노드 deck도 확인
      const pathNodes = parsePath(cable);
      for (const nd of pathNodes) {
        const node = findNode(nd, data.nodes);
        if (node?.deck) decks.add(node.deck);
      }

      if (decks.size > 1) {
        crossDeckCables.push({ cable, decks: Array.from(decks) });
      }
    }

    if (crossDeckCables.length === 0) {
      results.push({
        ruleId: 'CR13', ruleName: '데크 관통 방화 처리', category: '환경',
        reference: 'SOLAS Ch.II-2 Reg.9, IMO MSC/Circ.1120',
        severity: 'critical', status: 'not_applicable',
        message: '데크 관통 케이블이 식별되지 않음 (deck 데이터 부족 가능)',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '노드에 deck 정보를 입력하면 관통 구간을 자동 검출할 수 있습니다.',
      });
      return results;
    }

    results.push({
      ruleId: 'CR13', ruleName: '데크 관통 방화 처리', category: '환경',
      reference: 'SOLAS Ch.II-2 Reg.9, IMO MSC/Circ.1120',
      severity: 'critical', status: 'warning',
      message: `${crossDeckCables.length}개 케이블이 2개 이상 데크를 관통 — 방화 충전재(MCT) 확인 필요`,
      details: crossDeckCables.slice(0, 10).map(c =>
        `${c.cable.name}: ${c.decks.join(' ↔ ')}`
      ).join('; '),
      affectedCables: crossDeckCables.slice(0, 30).map(c => c.cable.id),
      affectedNodes: [],
      recommendation: 'A급 방화 구획 관통 부위에 IMO 승인 방화 충전재(MCT)를 설치하고 관통부 기록을 관리하세요.',
    });

    return results;
  },
});

// CR14: 위험 구역 케이블
RULES.push({
  id: 'CR14',
  category: '환경',
  name: '위험 구역 케이블',
  description: 'Zone 0/1/2 위험 구역 내 케이블 종류 제한 및 IS 케이블 별도 트레이 확인',
  reference: 'IEC 60092-502, DNV Pt.4 Ch.8 Sec.11',
  classSociety: ['DNV', 'KR'],
  severity: 'critical',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const hazCables: { cable: CableData; hazNodes: string[] }[] = [];

    for (const cable of data.cables) {
      const hazNodes: string[] = [];
      const fromN = findNode(cable.fromNode, data.nodes);
      const toN = findNode(cable.toNode, data.nodes);
      if (fromN && isHazardousArea(fromN)) hazNodes.push(fromN.name);
      if (toN && isHazardousArea(toN)) hazNodes.push(toN.name);

      const pathNodes = parsePath(cable);
      for (const nd of pathNodes) {
        const node = findNode(nd, data.nodes);
        if (node && isHazardousArea(node)) hazNodes.push(node.name);
      }

      if (hazNodes.length > 0) {
        hazCables.push({ cable, hazNodes: [...new Set(hazNodes)] });
      }
    }

    if (hazCables.length === 0) {
      results.push({
        ruleId: 'CR14', ruleName: '위험 구역 케이블', category: '환경',
        reference: 'IEC 60092-502, DNV Pt.4 Ch.8 Sec.11',
        severity: 'critical', status: 'not_applicable',
        message: '위험 구역 통과 케이블이 식별되지 않음',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '위험 구역 노드에 HAZ/ZONE 등의 표시를 추가하세요.',
      });
      return results;
    }

    // IS(본질안전) 케이블과 일반 케이블이 같은 위험 구역에 있는지 확인
    const isCables = hazCables.filter(hc => {
      const typeStr = `${hc.cable.type ?? ''} ${hc.cable.system ?? ''}`.toUpperCase();
      return /IS\b|INTRINSIC|EX\s*I/i.test(typeStr);
    });

    const nonIsCables = hazCables.filter(hc => {
      const typeStr = `${hc.cable.type ?? ''} ${hc.cable.system ?? ''}`.toUpperCase();
      return !/IS\b|INTRINSIC|EX\s*I/i.test(typeStr);
    });

    if (hazCables.length > 0) {
      results.push({
        ruleId: 'CR14', ruleName: '위험 구역 케이블', category: '환경',
        reference: 'IEC 60092-502, DNV Pt.4 Ch.8 Sec.11',
        severity: 'critical', status: 'warning',
        message: `위험 구역 내 케이블 ${hazCables.length}개 (IS: ${isCables.length}개, 일반: ${nonIsCables.length}개) — 방폭 적합성 확인 필요`,
        details: hazCables.slice(0, 10).map(hc =>
          `${hc.cable.name}: 구역=${hc.hazNodes.join(', ')}`
        ).join('; '),
        affectedCables: hazCables.slice(0, 30).map(hc => hc.cable.id),
        affectedNodes: [...new Set(hazCables.flatMap(hc => hc.hazNodes))],
        recommendation: '위험 구역 내 IS 케이블은 별도 트레이를 사용하고, 일반 케이블은 Zone 등급에 맞는 방폭 사양을 적용하세요.',
      });
    }

    return results;
  },
});

// ---------- Category 5: 접지 ----------

// CR15: 차폐 케이블 접지
RULES.push({
  id: 'CR15',
  category: '접지',
  name: '차폐 케이블 접지',
  description: '차폐 케이블의 쉴드 접지 방법(한쪽/양쪽) 확인',
  reference: 'IEC 60092-352 Sec.10',
  classSociety: 'COMMON',
  severity: 'minor',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const shieldedCables = data.cables.filter(c => isShieldedCable(c.type));

    if (shieldedCables.length === 0) {
      results.push({
        ruleId: 'CR15', ruleName: '차폐 케이블 접지', category: '접지',
        reference: 'IEC 60092-352 Sec.10',
        severity: 'minor', status: 'not_applicable',
        message: '차폐 케이블이 식별되지 않음',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
      return results;
    }

    const commShielded = shieldedCables.filter(isControlOrCommCable);
    const powerShielded = shieldedCables.filter(isPowerCable);

    results.push({
      ruleId: 'CR15', ruleName: '차폐 케이블 접지', category: '접지',
      reference: 'IEC 60092-352 Sec.10',
      severity: 'advisory', status: 'warning',
      message: `차폐 케이블 ${shieldedCables.length}개 — 접지 방법 확인 필요 (전력: ${powerShielded.length}개, 제어/통신: ${commShielded.length}개)`,
      details: '전력 차폐 케이블은 양쪽 접지 권장, 제어/통신 차폐 케이블은 한쪽 접지(EMC 기준) 권장',
      affectedCables: shieldedCables.slice(0, 20).map(c => c.id),
      affectedNodes: [],
      recommendation: '차폐 접지 방법을 도면/시방서에 명시하고 현장 시공 시 확인하세요.',
    });

    return results;
  },
});

// ─── 추가 규칙 (CR16~CR30) ─────────────────────────────────

// CR16: 케이블 식별 표시
RULES.push({
  id: 'CR16',
  category: '케이블 포설',
  name: '케이블 식별 표시',
  description: '모든 케이블에 고유 식별 번호(name)가 부여되어 있는지 확인',
  reference: 'IEC 60092-352 Sec.9.1',
  classSociety: 'COMMON',
  severity: 'minor',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const noName = data.cables.filter(c => !c.name || c.name.trim() === '');
    const dupNames = new Map<string, CableData[]>();
    for (const c of data.cables) {
      if (!c.name) continue;
      if (!dupNames.has(c.name)) dupNames.set(c.name, []);
      dupNames.get(c.name)!.push(c);
    }
    const duplicates = Array.from(dupNames.entries()).filter(([, v]) => v.length > 1);

    if (noName.length > 0) {
      results.push({
        ruleId: 'CR16', ruleName: '케이블 식별 표시', category: '케이블 포설',
        reference: 'IEC 60092-352 Sec.9.1',
        severity: 'minor', status: 'fail',
        message: `${noName.length}개 케이블에 식별 번호(name) 없음`,
        details: noName.slice(0, 10).map(c => c.id).join(', '),
        affectedCables: noName.map(c => c.id), affectedNodes: [],
        recommendation: '모든 케이블에 고유 식별 번호를 부여하세요.',
      });
    }

    if (duplicates.length > 0) {
      results.push({
        ruleId: 'CR16', ruleName: '케이블 식별 표시', category: '케이블 포설',
        reference: 'IEC 60092-352 Sec.9.1',
        severity: 'minor', status: 'fail',
        message: `${duplicates.length}개 케이블 이름이 중복됨`,
        details: duplicates.slice(0, 10).map(([name, cables]) =>
          `"${name}" × ${cables.length}회`
        ).join(', '),
        affectedCables: duplicates.flatMap(([, cables]) => cables.map(c => c.id)),
        affectedNodes: [],
        recommendation: '케이블 식별 번호가 중복되지 않도록 수정하세요.',
      });
    }

    if (noName.length === 0 && duplicates.length === 0) {
      results.push({
        ruleId: 'CR16', ruleName: '케이블 식별 표시', category: '케이블 포설',
        reference: 'IEC 60092-352 Sec.9.1',
        severity: 'minor', status: 'pass',
        message: '모든 케이블에 고유 식별 번호가 부여되어 있습니다.',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR17: 경로 미지정 케이블
RULES.push({
  id: 'CR17',
  category: '케이블 포설',
  name: '경로 미지정 케이블',
  description: '경로(path)가 지정되지 않은 케이블 확인',
  reference: 'General',
  classSociety: 'COMMON',
  severity: 'minor',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const noPath = data.cables.filter(c => {
      const p = c.calculatedPath ?? c.path ?? '';
      return p.trim() === '';
    });

    if (noPath.length > 0) {
      results.push({
        ruleId: 'CR17', ruleName: '경로 미지정 케이블', category: '케이블 포설',
        reference: 'General',
        severity: 'minor', status: 'fail',
        message: `${noPath.length}개 케이블에 경로가 지정되지 않음`,
        details: noPath.slice(0, 15).map(c => c.name ?? c.id).join(', '),
        affectedCables: noPath.map(c => c.id), affectedNodes: [],
        recommendation: '모든 케이블에 포설 경로를 지정하세요.',
      });
    } else {
      results.push({
        ruleId: 'CR17', ruleName: '경로 미지정 케이블', category: '케이블 포설',
        reference: 'General',
        severity: 'minor', status: 'pass',
        message: '모든 케이블에 경로가 지정되어 있습니다.',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR18: From/To 노드 미지정
RULES.push({
  id: 'CR18',
  category: '케이블 포설',
  name: 'From/To 노드 미지정',
  description: 'fromNode 또는 toNode가 미지정된 케이블 확인',
  reference: 'General',
  classSociety: 'COMMON',
  severity: 'minor',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const missing = data.cables.filter(c => !c.fromNode || !c.toNode);

    if (missing.length > 0) {
      results.push({
        ruleId: 'CR18', ruleName: 'From/To 노드 미지정', category: '케이블 포설',
        reference: 'General',
        severity: 'minor', status: 'fail',
        message: `${missing.length}개 케이블에 From 또는 To 노드가 미지정`,
        details: missing.slice(0, 15).map(c =>
          `${c.name ?? c.id}: from=${c.fromNode ?? 'N/A'}, to=${c.toNode ?? 'N/A'}`
        ).join('; '),
        affectedCables: missing.map(c => c.id), affectedNodes: [],
        recommendation: '모든 케이블에 From/To 노드를 지정하세요.',
      });
    } else {
      results.push({
        ruleId: 'CR18', ruleName: 'From/To 노드 미지정', category: '케이블 포설',
        reference: 'General',
        severity: 'minor', status: 'pass',
        message: '모든 케이블에 From/To 노드가 지정되어 있습니다.',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR19: 케이블 타입 미등록
RULES.push({
  id: 'CR19',
  category: '케이블 선정',
  name: '케이블 타입 미등록',
  description: '케이블 타입이 CableTypeDB에 등록되지 않은 케이블 확인',
  reference: 'General',
  classSociety: 'COMMON',
  severity: 'minor',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    if (data.cableTypeDB.length === 0) {
      results.push({
        ruleId: 'CR19', ruleName: '케이블 타입 미등록', category: '케이블 선정',
        reference: 'General',
        severity: 'advisory', status: 'not_applicable',
        message: '케이블 타입 DB가 비어 있습니다.',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '케이블 타입 DB를 업로드하세요.',
      });
      return results;
    }

    const typeSet = new Set(data.cableTypeDB.map(t => t.cableType));
    const unregistered = data.cables.filter(c => c.type && !typeSet.has(c.type));

    if (unregistered.length > 0) {
      const missingTypes = [...new Set(unregistered.map(c => c.type))];
      results.push({
        ruleId: 'CR19', ruleName: '케이블 타입 미등록', category: '케이블 선정',
        reference: 'General',
        severity: 'minor', status: 'fail',
        message: `${unregistered.length}개 케이블의 타입이 DB에 미등록 (${missingTypes.length}종)`,
        details: `미등록 타입: ${missingTypes.slice(0, 15).join(', ')}`,
        affectedCables: unregistered.slice(0, 30).map(c => c.id), affectedNodes: [],
        recommendation: '해당 케이블 타입을 CableType DB에 등록하세요.',
      });
    } else {
      results.push({
        ruleId: 'CR19', ruleName: '케이블 타입 미등록', category: '케이블 선정',
        reference: 'General',
        severity: 'minor', status: 'pass',
        message: '모든 케이블 타입이 DB에 등록되어 있습니다.',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR20: 케이블 외경(OD) 누락
RULES.push({
  id: 'CR20',
  category: '케이블 선정',
  name: '케이블 외경(OD) 누락',
  description: 'OD 값이 0이거나 누락된 케이블 확인',
  reference: 'General',
  classSociety: 'COMMON',
  severity: 'minor',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const noOD = data.cables.filter(c => getOD(c, data.cableTypeDB) <= 0);

    if (noOD.length > 0) {
      results.push({
        ruleId: 'CR20', ruleName: '케이블 외경(OD) 누락', category: '케이블 선정',
        reference: 'General',
        severity: 'minor', status: 'fail',
        message: `${noOD.length}개 케이블에 OD 값 없음`,
        details: noOD.slice(0, 15).map(c => `${c.name ?? c.id}(type=${c.type})`).join(', '),
        affectedCables: noOD.map(c => c.id), affectedNodes: [],
        recommendation: '케이블 OD를 입력하거나 CableType DB에 등록하세요.',
      });
    } else {
      results.push({
        ruleId: 'CR20', ruleName: '케이블 외경(OD) 누락', category: '케이블 선정',
        reference: 'General',
        severity: 'minor', status: 'pass',
        message: '모든 케이블에 OD 값이 존재합니다.',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR21: 여객선 추가 분리 요구
RULES.push({
  id: 'CR21',
  category: '분리 요구사항',
  name: '여객선 추가 분리 요구',
  description: '여객선(passenger)은 주요 수직 구역(MVZ) 간 케이블 분리 필요',
  reference: 'SOLAS Ch.II-2 Reg.9.3',
  classSociety: 'COMMON',
  severity: 'critical',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    if (data.options.vesselType !== 'passenger') {
      results.push({
        ruleId: 'CR21', ruleName: '여객선 추가 분리 요구', category: '분리 요구사항',
        reference: 'SOLAS Ch.II-2 Reg.9.3',
        severity: 'critical', status: 'not_applicable',
        message: `선종이 ${data.options.vesselType}이므로 여객선 추가 분리 규정 미적용`,
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
      return results;
    }

    results.push({
      ruleId: 'CR21', ruleName: '여객선 추가 분리 요구', category: '분리 요구사항',
      reference: 'SOLAS Ch.II-2 Reg.9.3',
      severity: 'critical', status: 'warning',
      message: '여객선: 주요 수직 구역(MVZ) 간 케이블 경로 분리 여부를 수동 확인하세요.',
      details: 'SOLAS에 따라 여객선의 주요 수직 방화 구역(MVZ) 간에는 최소한의 케이블만 관통해야 하며, 관통 부위는 A-60 방화 처리 필수.',
      affectedCables: [], affectedNodes: [],
      recommendation: 'MVZ 경계 관통 케이블 목록을 작성하고 선급 승인을 받으세요.',
    });
    return results;
  },
});

// CR22: 탱커 카고 구역 제한
RULES.push({
  id: 'CR22',
  category: '환경',
  name: '탱커 카고 구역 제한',
  description: '탱커의 카고 구역 내 전기 케이블 설치 제한 확인',
  reference: 'IEC 60092-502, SOLAS Ch.II-1 Reg.45',
  classSociety: 'COMMON',
  severity: 'critical',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    if (data.options.vesselType !== 'tanker') {
      results.push({
        ruleId: 'CR22', ruleName: '탱커 카고 구역 제한', category: '환경',
        reference: 'IEC 60092-502, SOLAS Ch.II-1 Reg.45',
        severity: 'critical', status: 'not_applicable',
        message: `선종이 ${data.options.vesselType}이므로 탱커 카고 구역 규정 미적용`,
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
      return results;
    }

    const cargoAreaCables = data.cables.filter(c => {
      const combined = `${c.fromNode ?? ''} ${c.toNode ?? ''} ${c.path ?? ''}`.toUpperCase();
      return /CARGO\s*TANK|C\.?T\.|COT|SLOP/i.test(combined);
    });

    if (cargoAreaCables.length > 0) {
      results.push({
        ruleId: 'CR22', ruleName: '탱커 카고 구역 제한', category: '환경',
        reference: 'IEC 60092-502, SOLAS Ch.II-1 Reg.45',
        severity: 'critical', status: 'warning',
        message: `카고 탱크 구역 관련 케이블 ${cargoAreaCables.length}개 — 방폭 적합성 확인 필요`,
        details: cargoAreaCables.slice(0, 10).map(c => c.name ?? c.id).join(', '),
        affectedCables: cargoAreaCables.map(c => c.id), affectedNodes: [],
        recommendation: '카고 탱크 구역 내 전기 케이블은 본질안전(IS) 또는 방폭 인증 케이블만 허용됩니다.',
      });
    } else {
      results.push({
        ruleId: 'CR22', ruleName: '탱커 카고 구역 제한', category: '환경',
        reference: 'IEC 60092-502, SOLAS Ch.II-1 Reg.45',
        severity: 'critical', status: 'pass',
        message: '카고 탱크 구역 관련 케이블이 식별되지 않음',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR23: 케이블 길이 이상치
RULES.push({
  id: 'CR23',
  category: '케이블 포설',
  name: '케이블 길이 이상치',
  description: '비정상적으로 긴 케이블(200m 이상) 확인',
  reference: 'General',
  classSociety: 'COMMON',
  severity: 'advisory',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const longCables = data.cables.filter(c => {
      const len = c.calculatedLength ?? c.length ?? 0;
      return len > 200;
    }).sort((a, b) => ((b.calculatedLength ?? b.length ?? 0) - (a.calculatedLength ?? a.length ?? 0)));

    if (longCables.length > 0) {
      results.push({
        ruleId: 'CR23', ruleName: '케이블 길이 이상치', category: '케이블 포설',
        reference: 'General',
        severity: 'advisory', status: 'warning',
        message: `200m 이상 장거리 케이블 ${longCables.length}개 — 전압강하 및 경로 최적화 검토`,
        details: longCables.slice(0, 10).map(c =>
          `${c.name}: ${(c.calculatedLength ?? c.length ?? 0).toFixed(0)}m`
        ).join(', '),
        affectedCables: longCables.map(c => c.id), affectedNodes: [],
        recommendation: '장거리 케이블은 전압강하 계산을 수행하고, 경로 단축 가능 여부를 검토하세요.',
      });
    } else {
      results.push({
        ruleId: 'CR23', ruleName: '케이블 길이 이상치', category: '케이블 포설',
        reference: 'General',
        severity: 'advisory', status: 'pass',
        message: '200m 이상 장거리 케이블 없음',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR24: 고전압(HV) 케이블 특별 요구
RULES.push({
  id: 'CR24',
  category: '케이블 선정',
  name: '고전압(HV) 케이블 특별 요구',
  description: '고전압 케이블에 대한 추가 안전 요구사항 확인',
  reference: 'IEC 60092-353, DNV Pt.4 Ch.8 Sec.4',
  classSociety: 'COMMON',
  severity: 'critical',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const hvCables = data.cables.filter(c => estimateVoltageLevel(c) === 'HV');

    if (hvCables.length === 0) {
      results.push({
        ruleId: 'CR24', ruleName: '고전압(HV) 케이블 특별 요구', category: '케이블 선정',
        reference: 'IEC 60092-353, DNV Pt.4 Ch.8 Sec.4',
        severity: 'critical', status: 'not_applicable',
        message: '고전압 케이블이 식별되지 않음',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
      return results;
    }

    results.push({
      ruleId: 'CR24', ruleName: '고전압(HV) 케이블 특별 요구', category: '케이블 선정',
      reference: 'IEC 60092-353, DNV Pt.4 Ch.8 Sec.4',
      severity: 'critical', status: 'warning',
      message: `고전압 케이블 ${hvCables.length}개 — 별도 포설, 차폐, 접지 확인 필요`,
      details: hvCables.slice(0, 10).map(c => c.name ?? c.id).join(', ') +
               '. HV 케이블은 별도 트레이, 금속 차폐, 양쪽 접지, 종단 처리가 필수입니다.',
      affectedCables: hvCables.map(c => c.id), affectedNodes: [],
      recommendation: 'IEC 60092-353에 따라 HV 케이블의 종단 처리, 차폐 접지, 절연 시험을 확인하세요.',
    });
    return results;
  },
});

// CR25: 이중화 케이블 경로 독립성
RULES.push({
  id: 'CR25',
  category: '분리 요구사항',
  name: '이중화 케이블 경로 독립성',
  description: '이중화(redundant) 시스템의 케이블이 동일 경로를 공유하는지 확인',
  reference: 'SOLAS Ch.II-1 Reg.29, DNV Pt.4 Ch.8 Sec.5',
  classSociety: 'COMMON',
  severity: 'critical',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    // 이중화 패턴: 이름에 A/B, No.1/No.2, #1/#2 등
    const redundantPairs: [CableData, CableData][] = [];
    const cableMap = new Map<string, CableData>();
    for (const c of data.cables) {
      if (c.name) cableMap.set(c.name, c);
    }

    for (const cable of data.cables) {
      if (!cable.name) continue;
      // "XXX-A" → "XXX-B" 패턴
      const pairName = cable.name.replace(/-A$/i, '-B')
                                  .replace(/No\.?1/i, 'No.2')
                                  .replace(/#1/i, '#2');
      if (pairName !== cable.name && cableMap.has(pairName)) {
        const pair = cableMap.get(pairName)!;
        // 중복 방지
        if (!redundantPairs.some(([a, b]) => (a.name === cable.name && b.name === pair.name) ||
                                              (a.name === pair.name && b.name === cable.name))) {
          redundantPairs.push([cable, pair]);
        }
      }
    }

    if (redundantPairs.length === 0) {
      results.push({
        ruleId: 'CR25', ruleName: '이중화 케이블 경로 독립성', category: '분리 요구사항',
        reference: 'SOLAS Ch.II-1 Reg.29, DNV Pt.4 Ch.8 Sec.5',
        severity: 'critical', status: 'not_applicable',
        message: '이중화 케이블 쌍이 식별되지 않음',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
      return results;
    }

    for (const [cableA, cableB] of redundantPairs) {
      const pathA = new Set(parsePath(cableA));
      const pathB = new Set(parsePath(cableB));
      const shared = [...pathA].filter(n => pathB.has(n));

      if (shared.length > 0) {
        results.push({
          ruleId: 'CR25', ruleName: '이중화 케이블 경로 독립성', category: '분리 요구사항',
          reference: 'SOLAS Ch.II-1 Reg.29, DNV Pt.4 Ch.8 Sec.5',
          severity: 'critical', status: 'fail',
          message: `이중화 쌍 ${cableA.name} / ${cableB.name}: ${shared.length}개 노드 경로 공유`,
          details: `공유 노드: ${shared.slice(0, 10).join(', ')}`,
          affectedCables: [cableA.id, cableB.id],
          affectedNodes: shared.slice(0, 10),
          recommendation: '이중화 케이블은 물리적으로 분리된 독립 경로를 사용해야 합니다.',
        });
      } else {
        results.push({
          ruleId: 'CR25', ruleName: '이중화 케이블 경로 독립성', category: '분리 요구사항',
          reference: 'SOLAS Ch.II-1 Reg.29, DNV Pt.4 Ch.8 Sec.5',
          severity: 'critical', status: 'pass',
          message: `이중화 쌍 ${cableA.name} / ${cableB.name}: 경로 독립 확인`,
          details: '', affectedCables: [cableA.id, cableB.id], affectedNodes: [],
          recommendation: '',
        });
      }
    }
    return results;
  },
});

// CR26: 노드 연결 무결성
RULES.push({
  id: 'CR26',
  category: '케이블 포설',
  name: '노드 연결 무결성',
  description: '케이블의 from/to 노드가 노드 목록에 존재하는지 확인',
  reference: 'General',
  classSociety: 'COMMON',
  severity: 'minor',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const nodeNames = new Set(data.nodes.map(n => n.name));
    const orphans: { cable: CableData; missing: string[] }[] = [];

    for (const cable of data.cables) {
      const missing: string[] = [];
      if (cable.fromNode && !nodeNames.has(cable.fromNode)) missing.push(`from=${cable.fromNode}`);
      if (cable.toNode && !nodeNames.has(cable.toNode)) missing.push(`to=${cable.toNode}`);
      if (missing.length > 0) orphans.push({ cable, missing });
    }

    if (orphans.length > 0) {
      results.push({
        ruleId: 'CR26', ruleName: '노드 연결 무결성', category: '케이블 포설',
        reference: 'General',
        severity: 'minor', status: 'fail',
        message: `${orphans.length}개 케이블이 존재하지 않는 노드를 참조`,
        details: orphans.slice(0, 15).map(o =>
          `${o.cable.name ?? o.cable.id}: ${o.missing.join(', ')}`
        ).join('; '),
        affectedCables: orphans.map(o => o.cable.id), affectedNodes: [],
        recommendation: '누락된 노드를 추가하거나 케이블의 from/to 노드를 수정하세요.',
      });
    } else {
      results.push({
        ruleId: 'CR26', ruleName: '노드 연결 무결성', category: '케이블 포설',
        reference: 'General',
        severity: 'minor', status: 'pass',
        message: '모든 케이블의 From/To 노드가 노드 목록에 존재합니다.',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR27: 케이블 타입 미지정
RULES.push({
  id: 'CR27',
  category: '케이블 선정',
  name: '케이블 타입 미지정',
  description: '타입(type)이 비어있는 케이블 확인',
  reference: 'General',
  classSociety: 'COMMON',
  severity: 'minor',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const noType = data.cables.filter(c => !c.type || c.type.trim() === '');

    if (noType.length > 0) {
      results.push({
        ruleId: 'CR27', ruleName: '케이블 타입 미지정', category: '케이블 선정',
        reference: 'General',
        severity: 'minor', status: 'fail',
        message: `${noType.length}개 케이블에 타입이 미지정`,
        details: noType.slice(0, 15).map(c => c.name ?? c.id).join(', '),
        affectedCables: noType.map(c => c.id), affectedNodes: [],
        recommendation: '모든 케이블에 타입을 지정하세요.',
      });
    } else {
      results.push({
        ruleId: 'CR27', ruleName: '케이블 타입 미지정', category: '케이블 선정',
        reference: 'General',
        severity: 'minor', status: 'pass',
        message: '모든 케이블에 타입이 지정되어 있습니다.',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR28: 해양/OSV 추가 요구
RULES.push({
  id: 'CR28',
  category: '환경',
  name: '해양/OSV 추가 요구',
  description: '해양 설비(offshore)의 케이블에 대한 추가 환경 요구사항',
  reference: 'DNV-OS-D201, IEC 61892',
  classSociety: 'COMMON',
  severity: 'major',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    if (data.options.vesselType !== 'offshore') {
      results.push({
        ruleId: 'CR28', ruleName: '해양/OSV 추가 요구', category: '환경',
        reference: 'DNV-OS-D201, IEC 61892',
        severity: 'major', status: 'not_applicable',
        message: `선종이 ${data.options.vesselType}이므로 해양 설비 규정 미적용`,
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
      return results;
    }

    results.push({
      ruleId: 'CR28', ruleName: '해양/OSV 추가 요구', category: '환경',
      reference: 'DNV-OS-D201, IEC 61892',
      severity: 'major', status: 'warning',
      message: '해양 설비: 외부 노출 케이블의 UV/염수 내성, 기계적 보호 확인 필요',
      details: '해양 설비 케이블은 UV 저항, 염수 내식성, 기계적 충격 보호 요구. DNV-OS-D201 참조.',
      affectedCables: [], affectedNodes: [],
      recommendation: '외부 노출 구간 케이블에 UV 내성 재질과 기계적 보호(금속 관, 아머) 적용을 확인하세요.',
    });
    return results;
  },
});

// CR29: 길이 0 또는 음수
RULES.push({
  id: 'CR29',
  category: '케이블 포설',
  name: '케이블 길이 유효성',
  description: '길이가 0 이하이거나 비정상적으로 짧은(1m 미만) 케이블 확인',
  reference: 'General',
  classSociety: 'COMMON',
  severity: 'minor',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const invalid = data.cables.filter(c => {
      const len = c.calculatedLength ?? c.length;
      return len !== undefined && len !== null && len <= 0;
    });
    const tooShort = data.cables.filter(c => {
      const len = c.calculatedLength ?? c.length;
      return len !== undefined && len !== null && len > 0 && len < 1;
    });

    if (invalid.length > 0) {
      results.push({
        ruleId: 'CR29', ruleName: '케이블 길이 유효성', category: '케이블 포설',
        reference: 'General',
        severity: 'minor', status: 'fail',
        message: `${invalid.length}개 케이블의 길이가 0 이하`,
        details: invalid.slice(0, 10).map(c =>
          `${c.name ?? c.id}: ${c.calculatedLength ?? c.length}m`
        ).join(', '),
        affectedCables: invalid.map(c => c.id), affectedNodes: [],
        recommendation: '케이블 길이를 재확인하세요.',
      });
    }

    if (tooShort.length > 0) {
      results.push({
        ruleId: 'CR29', ruleName: '케이블 길이 유효성', category: '케이블 포설',
        reference: 'General',
        severity: 'advisory', status: 'warning',
        message: `${tooShort.length}개 케이블의 길이가 1m 미만 — 데이터 오류 가능`,
        details: tooShort.slice(0, 10).map(c =>
          `${c.name ?? c.id}: ${(c.calculatedLength ?? c.length ?? 0).toFixed(2)}m`
        ).join(', '),
        affectedCables: tooShort.map(c => c.id), affectedNodes: [],
        recommendation: '매우 짧은 케이블이 의도된 것인지 확인하세요.',
      });
    }

    if (invalid.length === 0 && tooShort.length === 0) {
      results.push({
        ruleId: 'CR29', ruleName: '케이블 길이 유효성', category: '케이블 포설',
        reference: 'General',
        severity: 'minor', status: 'pass',
        message: '모든 케이블 길이가 유효합니다.',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR30: 전체 케이블 무게 추정
RULES.push({
  id: 'CR30',
  category: '케이블 포설',
  name: '전체 케이블 무게 추정',
  description: '프로젝트 전체 케이블 중량 산출 및 이상치 확인',
  reference: 'General',
  classSociety: 'COMMON',
  severity: 'advisory',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    let totalWeight = 0;
    let calculatedCount = 0;

    for (const cable of data.cables) {
      if (cable.cableWeight && cable.cableWeight > 0) {
        totalWeight += cable.cableWeight;
        calculatedCount++;
      } else {
        // 타입 DB에서 무게 가져오기
        const ct = data.cableTypeDB.find(t => t.cableType === cable.type);
        if (ct && ct.weight > 0) {
          const len = cable.calculatedLength ?? cable.length ?? 0;
          if (len > 0) {
            totalWeight += (ct.weight * len) / 1000; // kg/km → kg
            calculatedCount++;
          }
        }
      }
    }

    results.push({
      ruleId: 'CR30', ruleName: '전체 케이블 무게 추정', category: '케이블 포설',
      reference: 'General',
      severity: 'advisory', status: calculatedCount > 0 ? 'pass' : 'not_applicable',
      message: calculatedCount > 0
        ? `전체 케이블 추정 중량: ${(totalWeight / 1000).toFixed(1)}톤 (${calculatedCount}/${data.cables.length}개 산출)`
        : '무게 데이터 부족으로 전체 중량 산출 불가',
      details: calculatedCount > 0
        ? `계산 가능 케이블 ${calculatedCount}개, 미산출 ${data.cables.length - calculatedCount}개`
        : '',
      affectedCables: [], affectedNodes: [],
      recommendation: calculatedCount < data.cables.length
        ? '미산출 케이블의 타입 DB 무게 또는 길이 정보를 보완하세요.'
        : '',
    });
    return results;
  },
});

// ─── 규칙 적용 필터링 ───────────────────────────────────────

function isRuleApplicable(rule: ClassRule, society: ClassSociety): boolean {
  if (rule.classSociety === 'COMMON') return true;
  if (Array.isArray(rule.classSociety)) {
    return rule.classSociety.includes(society) || rule.classSociety.includes('COMMON');
  }
  return rule.classSociety === society;
}

// ─── 메인 함수 ──────────────────────────────────────────────

export function runClassRuleCheck(
  cables: CableData[],
  nodes: NodeData[],
  options: RuleCheckOptions,
  cableTypeDB?: CableTypeData[]
): ClassRuleReport {
  const data: RuleCheckData = {
    cables,
    nodes,
    cableTypeDB: cableTypeDB ?? [],
    options,
  };

  const applicableRules = RULES.filter(r => isRuleApplicable(r, options.classSociety));
  const allResults: RuleCheckResult[] = [];

  for (const rule of applicableRules) {
    try {
      const ruleResults = rule.check(data);
      allResults.push(...ruleResults);
    } catch (err) {
      allResults.push({
        ruleId: rule.id,
        ruleName: rule.name,
        category: rule.category,
        reference: rule.reference,
        severity: 'advisory',
        status: 'not_applicable',
        message: `규칙 실행 중 오류 발생: ${err instanceof Error ? err.message : String(err)}`,
        details: '',
        affectedCables: [],
        affectedNodes: [],
        recommendation: '데이터를 확인하고 다시 시도하세요.',
      });
    }
  }

  // 요약 계산
  const summary = {
    critical: allResults.filter(r => r.status === 'fail' && r.severity === 'critical').length,
    major: allResults.filter(r => r.status === 'fail' && r.severity === 'major').length,
    minor: allResults.filter(r => r.status === 'fail' && r.severity === 'minor').length,
    advisory: allResults.filter(r => r.status === 'warning' && r.severity === 'advisory').length,
    passed: allResults.filter(r => r.status === 'pass').length,
    notApplicable: allResults.filter(r => r.status === 'not_applicable').length,
    totalRules: allResults.length,
    complianceRate: 0,
  };

  const applicable = summary.totalRules - summary.notApplicable;
  summary.complianceRate = applicable > 0
    ? Math.round((summary.passed / applicable) * 10000) / 100
    : 100;

  // 카테고리별 요약
  const byCategory: ClassRuleReport['byCategory'] = {};
  for (const r of allResults) {
    if (!byCategory[r.category]) {
      byCategory[r.category] = { total: 0, passed: 0, failed: 0 };
    }
    byCategory[r.category].total++;
    if (r.status === 'pass') byCategory[r.category].passed++;
    if (r.status === 'fail' || r.status === 'warning') byCategory[r.category].failed++;
  }

  return {
    timestamp: new Date().toISOString(),
    classSociety: options.classSociety,
    vesselType: options.vesselType,
    totalCables: cables.length,
    totalNodes: nodes.length,
    results: allResults,
    summary,
    byCategory,
  };
}

// ─── 유틸리티 export ────────────────────────────────────────

export {
  estimateVoltageLevel,
  isEmergencyCircuit,
  isEngineRoom,
  isShieldedCable,
  isHazardousArea,
};

/** 기본 옵션 생성 헬퍼 */
export function createDefaultOptions(
  classSociety: ClassSociety = 'DNV',
  vesselType: RuleCheckOptions['vesselType'] = 'cargo'
): RuleCheckOptions {
  return {
    classSociety,
    vesselType,
    voltage: 440,
    frequency: 60,
  };
}

/** 전체 규칙 목록 조회 */
export function getAvailableRules(): Pick<ClassRule, 'id' | 'category' | 'name' | 'description' | 'reference' | 'classSociety' | 'severity'>[] {
  return RULES.map(({ id, category, name, description, reference, classSociety, severity }) => ({
    id, category, name, description, reference, classSociety, severity,
  }));
}
