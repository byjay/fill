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

// ─── 추가 규칙 (CR31~CR60): DNV/LR/KR/IEC/SOLAS 상세 규정 ──

// ---------- Category: Cable Sizing ----------

// CR31: DNV 전력 케이블 최소 단면적 (기관실)
RULES.push({
  id: 'CR31',
  category: 'Cable Sizing',
  name: 'DNV 기관실 전력 케이블 최소 2.5mm²',
  description: 'DNV Pt.4 Ch.8 Sec.3: 기관실 내 전력 케이블은 진동/고온 환경을 고려하여 최소 2.5mm² 이상이어야 한다.',
  reference: 'DNV Rules Pt.4 Ch.8 Sec.3.4',
  classSociety: 'DNV',
  severity: 'major',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const violations: CableData[] = [];

    for (const cable of data.cables) {
      if (!isPowerCable(cable)) continue;
      const fromN = findNode(cable.fromNode, data.nodes);
      const toN = findNode(cable.toNode, data.nodes);
      const pathNodes = parsePath(cable);
      const passesER = (fromN && isEngineRoom(fromN)) || (toN && isEngineRoom(toN)) ||
        pathNodes.some(nd => { const n = findNode(nd, data.nodes); return n ? isEngineRoom(n) : false; });
      if (!passesER) continue;

      const cs = getCrossSection(cable, data.cableTypeDB);
      if (cs !== null && cs < 2.5) {
        violations.push(cable);
      }
    }

    if (violations.length > 0) {
      for (const cable of violations.slice(0, 10)) {
        const cs = getCrossSection(cable, data.cableTypeDB);
        results.push({
          ruleId: 'CR31', ruleName: 'DNV 기관실 전력 케이블 최소 2.5mm²', category: 'Cable Sizing',
          reference: 'DNV Rules Pt.4 Ch.8 Sec.3.4',
          severity: 'major', status: 'fail',
          message: `${cable.name}: 기관실 전력 케이블 단면적 ${cs}mm² < 최소 2.5mm²`,
          details: `타입=${cable.type}, 단면적=${cs}mm²`,
          affectedCables: [cable.id], affectedNodes: [],
          recommendation: '기관실 내 전력 케이블은 진동 환경을 고려하여 최소 2.5mm² 이상을 사용하세요.',
        });
      }
    } else {
      results.push({
        ruleId: 'CR31', ruleName: 'DNV 기관실 전력 케이블 최소 2.5mm²', category: 'Cable Sizing',
        reference: 'DNV Rules Pt.4 Ch.8 Sec.3.4',
        severity: 'major', status: 'pass',
        message: '기관실 전력 케이블 최소 단면적 기준 충족',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR32: KR 조명 케이블 전압강하 4% 한도
RULES.push({
  id: 'CR32',
  category: 'Cable Sizing',
  name: 'KR 조명 케이블 전압강하 4% 한도',
  description: 'KR 규칙에 따라 조명 회로의 전압강하는 4%를 초과할 수 없다 (일반 선급 6%보다 엄격).',
  reference: 'KR Rules Part 6 Ch.2 Sec.5',
  classSociety: 'KR',
  severity: 'major',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const lightCables = data.cables.filter(c => estimateCableUsage(c) === 'lighting');

    for (const cable of lightCables) {
      const cs = getCrossSection(cable, data.cableTypeDB);
      const len = cable.calculatedLength ?? cable.length ?? 0;
      if (cs && cs > 0 && len > 30) {
        const ratio = len / cs;
        if (ratio > 25) { // KR은 4%로 더 엄격 → L/S 기준 25
          results.push({
            ruleId: 'CR32', ruleName: 'KR 조명 케이블 전압강하 4% 한도', category: 'Cable Sizing',
            reference: 'KR Rules Part 6 Ch.2 Sec.5',
            severity: 'major', status: 'warning',
            message: `${cable.name}: 조명 케이블 L/S비율(${ratio.toFixed(1)})이 높아 KR 4% 한도 초과 우려`,
            details: `길이=${len}m, 단면적=${cs}mm², L/S=${ratio.toFixed(1)}`,
            affectedCables: [cable.id], affectedNodes: [],
            recommendation: 'KR 규칙은 조명 회로 전압강하를 4%로 제한합니다. 단면적 증가를 검토하세요.',
          });
        }
      }
    }

    if (results.length === 0) {
      results.push({
        ruleId: 'CR32', ruleName: 'KR 조명 케이블 전압강하 4% 한도', category: 'Cable Sizing',
        reference: 'KR Rules Part 6 Ch.2 Sec.5',
        severity: 'major', status: 'pass',
        message: '조명 케이블 전압강하 KR 기준(4%) 충족',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR33: LR 도체 온도 등급 적합성
RULES.push({
  id: 'CR33',
  category: 'Cable Sizing',
  name: 'LR 도체 온도 등급 적합성',
  description: 'LR Rules Part 6 Ch.2: 케이블 도체 온도 등급이 주변 환경 온도에 적합한지 확인. 기관실은 최소 85°C, 갑판 노출부 75°C 이상.',
  reference: 'LR Rules Part 6 Ch.2 Sec.3',
  classSociety: 'LR',
  severity: 'major',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const erCables: CableData[] = [];

    for (const cable of data.cables) {
      const fromN = findNode(cable.fromNode, data.nodes);
      const toN = findNode(cable.toNode, data.nodes);
      const passesER = (fromN && isEngineRoom(fromN)) || (toN && isEngineRoom(toN));
      if (passesER) erCables.push(cable);
    }

    const nonRated = erCables.filter(c => {
      const typeStr = `${c.type ?? ''}`.toUpperCase();
      return !/85|90|105|110|EPR|XLPE|SILICONE|HT/i.test(typeStr);
    });

    if (nonRated.length > 0) {
      results.push({
        ruleId: 'CR33', ruleName: 'LR 도체 온도 등급 적합성', category: 'Cable Sizing',
        reference: 'LR Rules Part 6 Ch.2 Sec.3',
        severity: 'major', status: 'warning',
        message: `기관실 케이블 ${nonRated.length}개에서 85°C 이상 온도 등급 미확인`,
        details: nonRated.slice(0, 10).map(c => `${c.name}(${c.type})`).join(', '),
        affectedCables: nonRated.slice(0, 20).map(c => c.id), affectedNodes: [],
        recommendation: 'LR 규정상 기관실 케이블은 최소 85°C 절연 등급 케이블을 사용하세요.',
      });
    } else {
      results.push({
        ruleId: 'CR33', ruleName: 'LR 도체 온도 등급 적합성', category: 'Cable Sizing',
        reference: 'LR Rules Part 6 Ch.2 Sec.3',
        severity: 'major', status: erCables.length > 0 ? 'pass' : 'not_applicable',
        message: erCables.length > 0 ? '기관실 케이블 온도 등급 확인 완료' : '기관실 케이블 미식별',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// ---------- Category: Voltage Drop ----------

// CR34: IEC 60092 전압강하 상세 기준
RULES.push({
  id: 'CR34',
  category: 'Voltage Drop',
  name: 'IEC 60092 전압강하 기준 (동력 6%, 조명 3%)',
  description: 'IEC 60092-352: 선박 전기 설비에서 동력 회로 전압강하 6%, 조명 회로 3%를 초과할 수 없다.',
  reference: 'IEC 60092-352 Sec.5',
  classSociety: 'COMMON',
  severity: 'major',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const checked: { cable: CableData; usage: string; ratio: number; maxDrop: number }[] = [];

    for (const cable of data.cables) {
      const cs = getCrossSection(cable, data.cableTypeDB);
      const len = cable.calculatedLength ?? cable.length ?? 0;
      if (!cs || cs <= 0 || len <= 10) continue;

      const usage = estimateCableUsage(cable);
      const maxDrop = usage === 'lighting' ? 3 : 6;
      const ratio = len / cs;
      // 440V 기준 근사: lighting은 L/S > 18, power는 L/S > 35
      const threshold = usage === 'lighting' ? 18 : 35;

      if (ratio > threshold) {
        checked.push({ cable, usage, ratio, maxDrop });
      }
    }

    if (checked.length > 0) {
      for (const { cable, usage, ratio, maxDrop } of checked.slice(0, 10)) {
        results.push({
          ruleId: 'CR34', ruleName: 'IEC 60092 전압강하 기준', category: 'Voltage Drop',
          reference: 'IEC 60092-352 Sec.5',
          severity: 'major', status: 'warning',
          message: `${cable.name}(${usage}): L/S=${ratio.toFixed(1)} → ${maxDrop}% 초과 가능성`,
          details: `용도=${usage}, 허용전압강하=${maxDrop}%, 길이=${cable.calculatedLength ?? cable.length}m`,
          affectedCables: [cable.id], affectedNodes: [],
          recommendation: `${usage === 'lighting' ? '조명' : '동력'} 회로 전압강하 ${maxDrop}% 이내 확인. 단면적 증가 또는 경로 단축 검토.`,
        });
      }
    } else {
      results.push({
        ruleId: 'CR34', ruleName: 'IEC 60092 전압강하 기준', category: 'Voltage Drop',
        reference: 'IEC 60092-352 Sec.5',
        severity: 'major', status: 'pass',
        message: '전압강하 기준 내 (조명 3%, 동력 6%)',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR35: SOLAS 비상 조명 회로 전압강하
RULES.push({
  id: 'CR35',
  category: 'Voltage Drop',
  name: 'SOLAS 비상 조명 전압강하 제한',
  description: 'SOLAS Ch.II-1: 비상 조명 회로의 전압강하는 5%를 초과할 수 없다.',
  reference: 'SOLAS Ch.II-1 Reg.42, IEC 60092-201',
  classSociety: 'COMMON',
  severity: 'critical',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const emergLightCables = data.cables.filter(c =>
      isEmergencyCircuit(c) && estimateCableUsage(c) === 'lighting'
    );

    if (emergLightCables.length === 0) {
      results.push({
        ruleId: 'CR35', ruleName: 'SOLAS 비상 조명 전압강하 제한', category: 'Voltage Drop',
        reference: 'SOLAS Ch.II-1 Reg.42, IEC 60092-201',
        severity: 'critical', status: 'not_applicable',
        message: '비상 조명 케이블 미식별',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
      return results;
    }

    for (const cable of emergLightCables) {
      const cs = getCrossSection(cable, data.cableTypeDB);
      const len = cable.calculatedLength ?? cable.length ?? 0;
      if (cs && cs > 0 && len > 20) {
        const ratio = len / cs;
        if (ratio > 30) {
          results.push({
            ruleId: 'CR35', ruleName: 'SOLAS 비상 조명 전압강하 제한', category: 'Voltage Drop',
            reference: 'SOLAS Ch.II-1 Reg.42, IEC 60092-201',
            severity: 'critical', status: 'warning',
            message: `${cable.name}: 비상 조명 케이블 L/S=${ratio.toFixed(1)} — 전압강하 5% 초과 우려`,
            details: `길이=${len}m, 단면적=${cs}mm²`,
            affectedCables: [cable.id], affectedNodes: [],
            recommendation: '비상 조명 회로는 전압강하 5% 이내로 유지해야 합니다. 단면적 증가를 검토하세요.',
          });
        }
      }
    }

    if (results.length === 0) {
      results.push({
        ruleId: 'CR35', ruleName: 'SOLAS 비상 조명 전압강하 제한', category: 'Voltage Drop',
        reference: 'SOLAS Ch.II-1 Reg.42, IEC 60092-201',
        severity: 'critical', status: 'pass',
        message: `비상 조명 케이블 ${emergLightCables.length}개 전압강하 기준 양호`,
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// ---------- Category: Cable Routing ----------

// CR36: DNV 케이블 경로 빌지/탱크탑 회피
RULES.push({
  id: 'CR36',
  category: 'Cable Routing',
  name: 'DNV 빌지/탱크탑 회피',
  description: 'DNV Pt.4 Ch.8: 케이블은 빌지, 탱크탑 하부를 통과하지 않아야 한다. 불가피한 경우 방수 보호 조치 필수.',
  reference: 'DNV Rules Pt.4 Ch.8 Sec.9.2',
  classSociety: 'DNV',
  severity: 'major',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const bilgeCables: CableData[] = [];

    for (const cable of data.cables) {
      const pathNodes = parsePath(cable);
      const combined = `${cable.fromNode ?? ''} ${cable.toNode ?? ''} ${pathNodes.join(' ')}`.toUpperCase();
      if (/BILGE|TANK\s*TOP|DOUBLE\s*BOTTOM|D\.?B/i.test(combined)) {
        bilgeCables.push(cable);
      }
    }

    if (bilgeCables.length > 0) {
      results.push({
        ruleId: 'CR36', ruleName: 'DNV 빌지/탱크탑 회피', category: 'Cable Routing',
        reference: 'DNV Rules Pt.4 Ch.8 Sec.9.2',
        severity: 'major', status: 'warning',
        message: `${bilgeCables.length}개 케이블이 빌지/탱크탑 구역을 통과 — 방수 보호 확인 필요`,
        details: bilgeCables.slice(0, 10).map(c => c.name ?? c.id).join(', '),
        affectedCables: bilgeCables.map(c => c.id), affectedNodes: [],
        recommendation: '빌지 및 탱크탑 하부 통과 케이블은 수밀 보호(conduit, 방수 재질)를 적용하세요.',
      });
    } else {
      results.push({
        ruleId: 'CR36', ruleName: 'DNV 빌지/탱크탑 회피', category: 'Cable Routing',
        reference: 'DNV Rules Pt.4 Ch.8 Sec.9.2',
        severity: 'major', status: 'pass',
        message: '빌지/탱크탑 통과 케이블 없음',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR37: SOLAS 조타실 케이블 경로 이중화
RULES.push({
  id: 'CR37',
  category: 'Cable Routing',
  name: 'SOLAS 조타실 필수 서비스 이중화 경로',
  description: 'SOLAS Ch.II-1 Reg.29.5: 조타기, 항해 장비 등 필수 서비스 케이블은 이중화 경로를 확보해야 한다.',
  reference: 'SOLAS Ch.II-1 Reg.29.5',
  classSociety: 'COMMON',
  severity: 'critical',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const steeringCables = data.cables.filter(c => {
      const combined = `${c.system ?? ''} ${c.name ?? ''} ${c.fromEquip ?? ''} ${c.toEquip ?? ''}`.toUpperCase();
      return /STEER|RUDDER|HELM|AUTOPILOT/i.test(combined);
    });

    if (steeringCables.length === 0) {
      results.push({
        ruleId: 'CR37', ruleName: 'SOLAS 조타실 필수 서비스 이중화 경로', category: 'Cable Routing',
        reference: 'SOLAS Ch.II-1 Reg.29.5',
        severity: 'critical', status: 'not_applicable',
        message: '조타기 관련 케이블 미식별',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '조타기 케이블에 STEER/RUDDER 시스템 코드를 부여하세요.',
      });
      return results;
    }

    // 조타기 케이블이 1개뿐이면 이중화 미확보
    if (steeringCables.length < 2) {
      results.push({
        ruleId: 'CR37', ruleName: 'SOLAS 조타실 필수 서비스 이중화 경로', category: 'Cable Routing',
        reference: 'SOLAS Ch.II-1 Reg.29.5',
        severity: 'critical', status: 'warning',
        message: `조타기 케이블 ${steeringCables.length}개만 식별 — 이중화 경로 미확보 우려`,
        details: steeringCables.map(c => c.name).join(', '),
        affectedCables: steeringCables.map(c => c.id), affectedNodes: [],
        recommendation: 'SOLAS 요구에 따라 조타기 전원 공급은 최소 2계통 독립 경로를 확보하세요.',
      });
    } else {
      results.push({
        ruleId: 'CR37', ruleName: 'SOLAS 조타실 필수 서비스 이중화 경로', category: 'Cable Routing',
        reference: 'SOLAS Ch.II-1 Reg.29.5',
        severity: 'critical', status: 'pass',
        message: `조타기 케이블 ${steeringCables.length}개 식별 — 이중화 확인`,
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR38: IEC 60092 수평 트레이 지지 간격
RULES.push({
  id: 'CR38',
  category: 'Cable Routing',
  name: 'IEC 수평 트레이 지지 간격 확인',
  description: 'IEC 60092-352 Sec.9.5: 수평 케이블 트레이의 지지 간격은 최대 1.5m(일반), 1.0m(기관실)이어야 한다.',
  reference: 'IEC 60092-352 Sec.9.5',
  classSociety: 'COMMON',
  severity: 'minor',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    // linkLength가 있는 노드에서 간격 추정
    const longSpans = data.nodes.filter(n => {
      const span = n.linkLength ?? 0;
      const isER = isEngineRoom(n);
      return span > (isER ? 1.0 : 1.5);
    });

    if (longSpans.length > 0) {
      results.push({
        ruleId: 'CR38', ruleName: 'IEC 수평 트레이 지지 간격 확인', category: 'Cable Routing',
        reference: 'IEC 60092-352 Sec.9.5',
        severity: 'minor', status: 'warning',
        message: `${longSpans.length}개 노드 구간의 지지 간격이 기준 초과 (일반 1.5m, 기관실 1.0m)`,
        details: longSpans.slice(0, 10).map(n =>
          `${n.name}: ${n.linkLength?.toFixed(2)}m${isEngineRoom(n) ? '(기관실)' : ''}`
        ).join('; '),
        affectedCables: [], affectedNodes: longSpans.map(n => n.name),
        recommendation: '수평 트레이 지지 간격을 기준 이내로 조정하세요 (일반 1.5m, 기관실 1.0m).',
      });
    } else {
      results.push({
        ruleId: 'CR38', ruleName: 'IEC 수평 트레이 지지 간격 확인', category: 'Cable Routing',
        reference: 'IEC 60092-352 Sec.9.5',
        severity: 'minor', status: 'pass',
        message: '수평 트레이 지지 간격 기준 충족',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// ---------- Category: Fire Safety ----------

// CR39: IEC 60332 난연 시험 요구
RULES.push({
  id: 'CR39',
  category: 'Fire Safety',
  name: 'IEC 60332-3 번들 난연 시험',
  description: 'IEC 60332-3: 트레이 내 다수 케이블 번들은 수직 연소 시험(번들 난연 시험)을 통과해야 한다.',
  reference: 'IEC 60332-3, DNV Pt.4 Ch.8 Sec.2',
  classSociety: 'COMMON',
  severity: 'critical',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    // 번들 난연 미확인 케이블 탐색
    const nonFlameRetardant: CableData[] = [];
    for (const cable of data.cables) {
      const typeStr = `${cable.type ?? ''} ${cable.remark ?? ''}`.toUpperCase();
      if (!/FR|FLAME|HF|LSZH|LSOH|SHF|LOW\s*SMOKE|FRNC|NHFR/i.test(typeStr)) {
        nonFlameRetardant.push(cable);
      }
    }

    if (nonFlameRetardant.length > 0) {
      results.push({
        ruleId: 'CR39', ruleName: 'IEC 60332-3 번들 난연 시험', category: 'Fire Safety',
        reference: 'IEC 60332-3, DNV Pt.4 Ch.8 Sec.2',
        severity: 'critical', status: 'warning',
        message: `${nonFlameRetardant.length}개 케이블에서 난연(FR) 등급 표시 미확인`,
        details: `선박용 케이블은 IEC 60332-3 번들 난연 시험을 통과해야 합니다. ` +
                 nonFlameRetardant.slice(0, 10).map(c => `${c.name}(${c.type})`).join(', '),
        affectedCables: nonFlameRetardant.slice(0, 30).map(c => c.id), affectedNodes: [],
        recommendation: '모든 선박용 케이블은 IEC 60332-3 번들 난연 시험 합격 케이블을 사용하세요.',
      });
    } else {
      results.push({
        ruleId: 'CR39', ruleName: 'IEC 60332-3 번들 난연 시험', category: 'Fire Safety',
        reference: 'IEC 60332-3, DNV Pt.4 Ch.8 Sec.2',
        severity: 'critical', status: 'pass',
        message: '모든 케이블에 난연 등급 확인됨',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR40: SOLAS 저독성/저연 케이블 요구
RULES.push({
  id: 'CR40',
  category: 'Fire Safety',
  name: 'SOLAS 저독성/저연 케이블 요구',
  description: 'SOLAS Ch.II-2: 거주 구역 및 제어실 내 케이블은 저연/무할로겐(LSZH) 재질을 사용해야 한다.',
  reference: 'SOLAS Ch.II-2 Reg.5, IEC 60092-360',
  classSociety: 'COMMON',
  severity: 'major',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const accommodationCables: CableData[] = [];

    for (const cable of data.cables) {
      const fromN = findNode(cable.fromNode, data.nodes);
      const toN = findNode(cable.toNode, data.nodes);
      const combined = `${fromN?.deck ?? ''} ${fromN?.name ?? ''} ${toN?.deck ?? ''} ${toN?.name ?? ''}`.toUpperCase();
      if (/ACCOM|CABIN|MESS|GALLEY|WHEEL|BRIDGE|CONTROL\s*ROOM|NAV/i.test(combined)) {
        accommodationCables.push(cable);
      }
    }

    if (accommodationCables.length === 0) {
      results.push({
        ruleId: 'CR40', ruleName: 'SOLAS 저독성/저연 케이블 요구', category: 'Fire Safety',
        reference: 'SOLAS Ch.II-2 Reg.5, IEC 60092-360',
        severity: 'major', status: 'not_applicable',
        message: '거주 구역/제어실 케이블 미식별',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '거주 구역 노드에 ACCOM/CABIN 등의 정보를 부여하세요.',
      });
      return results;
    }

    const nonLSZH = accommodationCables.filter(c => {
      const typeStr = `${c.type ?? ''} ${c.remark ?? ''}`.toUpperCase();
      return !/LSZH|LSOH|HF|LOW\s*SMOKE|HFFR|SHF|NHFR/i.test(typeStr);
    });

    if (nonLSZH.length > 0) {
      results.push({
        ruleId: 'CR40', ruleName: 'SOLAS 저독성/저연 케이블 요구', category: 'Fire Safety',
        reference: 'SOLAS Ch.II-2 Reg.5, IEC 60092-360',
        severity: 'major', status: 'warning',
        message: `거주 구역 케이블 ${nonLSZH.length}개에서 LSZH 표시 미확인`,
        details: nonLSZH.slice(0, 10).map(c => `${c.name}(${c.type})`).join(', '),
        affectedCables: nonLSZH.slice(0, 20).map(c => c.id), affectedNodes: [],
        recommendation: '거주 구역/제어실 케이블은 LSZH(Low Smoke Zero Halogen) 재질을 사용하세요.',
      });
    } else {
      results.push({
        ruleId: 'CR40', ruleName: 'SOLAS 저독성/저연 케이블 요구', category: 'Fire Safety',
        reference: 'SOLAS Ch.II-2 Reg.5, IEC 60092-360',
        severity: 'major', status: 'pass',
        message: `거주 구역 케이블 ${accommodationCables.length}개 LSZH 확인`,
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR41: IEC 60331 내화 시험 (비상 서비스)
RULES.push({
  id: 'CR41',
  category: 'Fire Safety',
  name: 'IEC 60331 내화 시험 (비상 서비스 케이블)',
  description: 'IEC 60331: 비상 발전기, 비상 조명, 소방 펌프 등 비상 서비스 케이블은 화재 시 30분 이상 기능 유지 가능한 내화 케이블이어야 한다.',
  reference: 'IEC 60331, DNV Pt.4 Ch.8 Sec.2.5',
  classSociety: 'COMMON',
  severity: 'critical',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const emergCables = data.cables.filter(c => {
      const combined = `${c.system ?? ''} ${c.name ?? ''} ${c.fromEquip ?? ''} ${c.toEquip ?? ''}`.toUpperCase();
      return /EMERG|E\/G|EM\s*GEN|FIRE\s*PUMP|BILGE\s*PUMP|LIFE\s*BOAT|G\.?A\.|GENERAL\s*ALARM|SPRINKLER/i.test(combined);
    });

    if (emergCables.length === 0) {
      results.push({
        ruleId: 'CR41', ruleName: 'IEC 60331 내화 시험', category: 'Fire Safety',
        reference: 'IEC 60331, DNV Pt.4 Ch.8 Sec.2.5',
        severity: 'critical', status: 'not_applicable',
        message: '비상 서비스 케이블 미식별',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
      return results;
    }

    const nonFireResist = emergCables.filter(c => {
      const typeStr = `${c.type ?? ''} ${c.remark ?? ''}`.toUpperCase();
      return !/FR\b|FIRE\s*RES|FE\d|CI\b|SHF.*FR|MICC|MINERAL/i.test(typeStr);
    });

    if (nonFireResist.length > 0) {
      results.push({
        ruleId: 'CR41', ruleName: 'IEC 60331 내화 시험', category: 'Fire Safety',
        reference: 'IEC 60331, DNV Pt.4 Ch.8 Sec.2.5',
        severity: 'critical', status: 'warning',
        message: `비상 서비스 케이블 ${nonFireResist.length}개에서 IEC 60331 내화 등급 미확인`,
        details: nonFireResist.slice(0, 10).map(c => `${c.name}(${c.type})`).join(', '),
        affectedCables: nonFireResist.slice(0, 20).map(c => c.id), affectedNodes: [],
        recommendation: '비상 서비스 케이블은 IEC 60331 내화 시험(30분 이상 기능 유지) 합격 케이블을 사용하세요.',
      });
    } else {
      results.push({
        ruleId: 'CR41', ruleName: 'IEC 60331 내화 시험', category: 'Fire Safety',
        reference: 'IEC 60331, DNV Pt.4 Ch.8 Sec.2.5',
        severity: 'critical', status: 'pass',
        message: `비상 서비스 케이블 ${emergCables.length}개 내화 등급 확인`,
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR42: DNV 방화 구획 관통 양측 실링
RULES.push({
  id: 'CR42',
  category: 'Fire Safety',
  name: 'DNV 방화 구획 관통 양측 실링',
  description: 'DNV Pt.4 Ch.8 Sec.9: A급 방화 구획 관통 시 양면 모두 방화 실링(fire stop)이 필요하며, MCT는 IMO 형식 승인 제품을 사용해야 한다.',
  reference: 'DNV Rules Pt.4 Ch.8 Sec.9.4',
  classSociety: 'DNV',
  severity: 'critical',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const crossDeckCables: CableData[] = [];

    for (const cable of data.cables) {
      const decks = new Set<string>();
      const fromN = findNode(cable.fromNode, data.nodes);
      const toN = findNode(cable.toNode, data.nodes);
      if (fromN?.deck) decks.add(fromN.deck);
      if (toN?.deck) decks.add(toN.deck);
      const pathNodes = parsePath(cable);
      for (const nd of pathNodes) {
        const node = findNode(nd, data.nodes);
        if (node?.deck) decks.add(node.deck);
      }
      if (decks.size > 1) crossDeckCables.push(cable);
    }

    if (crossDeckCables.length > 0) {
      results.push({
        ruleId: 'CR42', ruleName: 'DNV 방화 구획 관통 양측 실링', category: 'Fire Safety',
        reference: 'DNV Rules Pt.4 Ch.8 Sec.9.4',
        severity: 'critical', status: 'warning',
        message: `${crossDeckCables.length}개 케이블이 구획 관통 — DNV 양면 방화 실링(MCT) 확인 필요`,
        details: '관통부 양면에 IMO 형식 승인 MCT(Multi-Cable Transit)를 설치해야 합니다.',
        affectedCables: crossDeckCables.slice(0, 30).map(c => c.id), affectedNodes: [],
        recommendation: 'A급 방화 구획 관통부에 IMO 형식 승인 MCT를 양면 설치하세요.',
      });
    } else {
      results.push({
        ruleId: 'CR42', ruleName: 'DNV 방화 구획 관통 양측 실링', category: 'Fire Safety',
        reference: 'DNV Rules Pt.4 Ch.8 Sec.9.4',
        severity: 'critical', status: 'not_applicable',
        message: '데크 관통 케이블 미식별',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// ---------- Category: Grounding ----------

// CR43: IEC 60092 선체 접지 시스템
RULES.push({
  id: 'CR43',
  category: 'Grounding',
  name: 'IEC 60092 선체 접지 시스템',
  description: 'IEC 60092-202: 선박의 접지 시스템은 선체 귀선(hull return) 방식을 사용하지 않아야 하며, 별도 접지 도체를 사용해야 한다.',
  reference: 'IEC 60092-202 Sec.8, SOLAS Ch.II-1 Reg.45',
  classSociety: 'COMMON',
  severity: 'critical',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    // 접지선/어스 관련 케이블 확인
    const earthCables = data.cables.filter(c => {
      const combined = `${c.system ?? ''} ${c.name ?? ''} ${c.type ?? ''}`.toUpperCase();
      return /EARTH|GND|GROUND|PE\b|PROT.*EARTH/i.test(combined);
    });

    results.push({
      ruleId: 'CR43', ruleName: 'IEC 60092 선체 접지 시스템', category: 'Grounding',
      reference: 'IEC 60092-202 Sec.8, SOLAS Ch.II-1 Reg.45',
      severity: 'advisory', status: earthCables.length > 0 ? 'pass' : 'warning',
      message: earthCables.length > 0
        ? `접지 관련 케이블 ${earthCables.length}개 식별됨`
        : '접지 도체(earth/ground) 케이블이 식별되지 않음 — 별도 접지 시스템 확인 필요',
      details: 'IEC 60092-202에 따라 선체 귀선(hull return) 방식은 사용 금지이며, 별도 보호 접지 도체를 사용해야 합니다.',
      affectedCables: earthCables.slice(0, 10).map(c => c.id), affectedNodes: [],
      recommendation: earthCables.length > 0 ? '' : '접지 시스템 설계 도면을 확인하세요.',
    });
    return results;
  },
});

// CR44: DNV 고전압 케이블 차폐 접지
RULES.push({
  id: 'CR44',
  category: 'Grounding',
  name: 'DNV 고전압 케이블 차폐 양측 접지',
  description: 'DNV Pt.4 Ch.8 Sec.4: 고전압(1kV 이상) 케이블의 금속 차폐는 반드시 양쪽 끝에서 접지해야 한다.',
  reference: 'DNV Rules Pt.4 Ch.8 Sec.4.3',
  classSociety: 'DNV',
  severity: 'critical',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const hvCables = data.cables.filter(c => estimateVoltageLevel(c) === 'HV');

    if (hvCables.length === 0) {
      results.push({
        ruleId: 'CR44', ruleName: 'DNV 고전압 케이블 차폐 양측 접지', category: 'Grounding',
        reference: 'DNV Rules Pt.4 Ch.8 Sec.4.3',
        severity: 'critical', status: 'not_applicable',
        message: '고전압 케이블 미식별',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
      return results;
    }

    const hvUnshielded = hvCables.filter(c => !isShieldedCable(c.type));

    if (hvUnshielded.length > 0) {
      results.push({
        ruleId: 'CR44', ruleName: 'DNV 고전압 케이블 차폐 양측 접지', category: 'Grounding',
        reference: 'DNV Rules Pt.4 Ch.8 Sec.4.3',
        severity: 'critical', status: 'fail',
        message: `고전압 케이블 ${hvUnshielded.length}개에 차폐(shield) 표시 없음 — 금속 차폐 필수`,
        details: hvUnshielded.slice(0, 10).map(c => `${c.name}(${c.type})`).join(', '),
        affectedCables: hvUnshielded.map(c => c.id), affectedNodes: [],
        recommendation: '고전압 케이블은 금속 차폐가 필수이며, 양쪽 끝 접지해야 합니다.',
      });
    } else {
      results.push({
        ruleId: 'CR44', ruleName: 'DNV 고전압 케이블 차폐 양측 접지', category: 'Grounding',
        reference: 'DNV Rules Pt.4 Ch.8 Sec.4.3',
        severity: 'critical', status: 'pass',
        message: `고전압 케이블 ${hvCables.length}개 차폐 확인`,
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '양쪽 끝 접지 시공을 현장에서 확인하세요.',
      });
    }
    return results;
  },
});

// CR45: KR 지락 보호 시스템
RULES.push({
  id: 'CR45',
  category: 'Grounding',
  name: 'KR 지락 보호 시스템',
  description: 'KR Rules: 절연 감시 장치(IRM) 또는 지락 보호 시스템이 설치되어야 하며, 비접지 배전 계통에서는 지락 경보가 필수이다.',
  reference: 'KR Rules Part 6 Ch.2 Sec.8',
  classSociety: 'KR',
  severity: 'major',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    // IRM / earth fault 관련 케이블 확인
    const irmCables = data.cables.filter(c => {
      const combined = `${c.system ?? ''} ${c.name ?? ''} ${c.fromEquip ?? ''} ${c.toEquip ?? ''}`.toUpperCase();
      return /IRM|INSUL.*MONIT|EARTH.*FAULT|GROUND.*FAULT|GFP|EFD/i.test(combined);
    });

    results.push({
      ruleId: 'CR45', ruleName: 'KR 지락 보호 시스템', category: 'Grounding',
      reference: 'KR Rules Part 6 Ch.2 Sec.8',
      severity: 'major', status: irmCables.length > 0 ? 'pass' : 'warning',
      message: irmCables.length > 0
        ? `절연 감시(IRM)/지락 보호 관련 케이블 ${irmCables.length}개 식별`
        : '절연 감시(IRM) 또는 지락 보호 관련 케이블 미식별',
      details: 'KR 규정상 비접지 계통에서 절연 감시 장치(IRM) 및 지락 경보 시스템이 필수입니다.',
      affectedCables: irmCables.slice(0, 10).map(c => c.id), affectedNodes: [],
      recommendation: irmCables.length > 0 ? '' : '절연 감시 장치(IRM) 설치를 확인하세요.',
    });
    return results;
  },
});

// ---------- Category: Environmental ----------

// CR46: IEC 60092 습윤 구역 케이블 보호
RULES.push({
  id: 'CR46',
  category: 'Environmental',
  name: 'IEC 60092 습윤 구역 케이블 보호',
  description: 'IEC 60092-352: 갑판, 세탁실, 주방 등 습윤 구역의 케이블은 IP67 이상의 방수 보호 또는 방수형 케이블을 사용해야 한다.',
  reference: 'IEC 60092-352 Sec.6.3',
  classSociety: 'COMMON',
  severity: 'major',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const wetAreaCables: CableData[] = [];

    for (const cable of data.cables) {
      const fromN = findNode(cable.fromNode, data.nodes);
      const toN = findNode(cable.toNode, data.nodes);
      const combined = `${fromN?.name ?? ''} ${fromN?.deck ?? ''} ${toN?.name ?? ''} ${toN?.deck ?? ''} ${cable.fromNode ?? ''} ${cable.toNode ?? ''}`.toUpperCase();
      if (/DECK|WEATHER|OPEN|LAUNDRY|GALLEY|WASH|BATH|WET|EXPOSED|OUTDOOR/i.test(combined)) {
        wetAreaCables.push(cable);
      }
    }

    if (wetAreaCables.length > 0) {
      results.push({
        ruleId: 'CR46', ruleName: 'IEC 60092 습윤 구역 케이블 보호', category: 'Environmental',
        reference: 'IEC 60092-352 Sec.6.3',
        severity: 'major', status: 'warning',
        message: `습윤/노출 구역 케이블 ${wetAreaCables.length}개 — 방수 보호 확인 필요`,
        details: wetAreaCables.slice(0, 10).map(c => c.name ?? c.id).join(', '),
        affectedCables: wetAreaCables.slice(0, 20).map(c => c.id), affectedNodes: [],
        recommendation: '습윤/노출 구역 케이블은 방수형 케이블 또는 IP67 이상 방수 보호를 적용하세요.',
      });
    } else {
      results.push({
        ruleId: 'CR46', ruleName: 'IEC 60092 습윤 구역 케이블 보호', category: 'Environmental',
        reference: 'IEC 60092-352 Sec.6.3',
        severity: 'major', status: 'not_applicable',
        message: '습윤/노출 구역 케이블 미식별',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR47: DNV 해수 침수 구역 케이블 내식성
RULES.push({
  id: 'CR47',
  category: 'Environmental',
  name: 'DNV 해수 침수 구역 내식성',
  description: 'DNV Pt.4 Ch.8: 해수에 노출될 가능성이 있는 구역의 케이블은 내식성(부식 방지) 외피를 사용해야 한다.',
  reference: 'DNV Rules Pt.4 Ch.8 Sec.2.3',
  classSociety: 'DNV',
  severity: 'major',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const seaAreaCables: CableData[] = [];

    for (const cable of data.cables) {
      const pathStr = `${cable.fromNode ?? ''} ${cable.toNode ?? ''} ${cable.path ?? ''}`.toUpperCase();
      if (/SEA\s*CHEST|VOID|CHAIN\s*LOCK|FORE\s*PEAK|AFT\s*PEAK|BALLAST|BOW\s*THRUST|STERN\s*TUBE/i.test(pathStr)) {
        seaAreaCables.push(cable);
      }
    }

    if (seaAreaCables.length > 0) {
      results.push({
        ruleId: 'CR47', ruleName: 'DNV 해수 침수 구역 내식성', category: 'Environmental',
        reference: 'DNV Rules Pt.4 Ch.8 Sec.2.3',
        severity: 'major', status: 'warning',
        message: `해수 침수 가능 구역 케이블 ${seaAreaCables.length}개 — 내식성 외피 확인 필요`,
        details: seaAreaCables.slice(0, 10).map(c => c.name ?? c.id).join(', '),
        affectedCables: seaAreaCables.slice(0, 20).map(c => c.id), affectedNodes: [],
        recommendation: '해수 침수 가능 구역 케이블은 내식성 외피(내해수성 재질)를 적용하세요.',
      });
    } else {
      results.push({
        ruleId: 'CR47', ruleName: 'DNV 해수 침수 구역 내식성', category: 'Environmental',
        reference: 'DNV Rules Pt.4 Ch.8 Sec.2.3',
        severity: 'major', status: 'not_applicable',
        message: '해수 침수 구역 케이블 미식별',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// ---------- Category: Installation ----------

// CR48: IEC 60092 케이블 굴곡 반경 (차폐 케이블)
RULES.push({
  id: 'CR48',
  category: 'Installation',
  name: 'IEC 차폐 케이블 최소 굴곡 반경 8D',
  description: 'IEC 60092-352: 차폐(shielded) 케이블의 최소 굴곡 반경은 외경의 8배 이상이어야 한다. 비차폐 케이블은 6배.',
  reference: 'IEC 60092-352 Sec.9.3',
  classSociety: 'COMMON',
  severity: 'minor',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const shieldedLarge: { cable: CableData; od: number; minBend: number }[] = [];

    for (const cable of data.cables) {
      if (!isShieldedCable(cable.type)) continue;
      const od = getOD(cable, data.cableTypeDB);
      if (od > 20) {
        shieldedLarge.push({ cable, od, minBend: od * 8 });
      }
    }

    if (shieldedLarge.length > 0) {
      results.push({
        ruleId: 'CR48', ruleName: 'IEC 차폐 케이블 최소 굴곡 반경 8D', category: 'Installation',
        reference: 'IEC 60092-352 Sec.9.3',
        severity: 'minor', status: 'warning',
        message: `OD 20mm 이상 차폐 케이블 ${shieldedLarge.length}개 — 최소 굴곡 반경 8×OD 확인 필요`,
        details: shieldedLarge.slice(0, 10).map(s =>
          `${s.cable.name}: OD=${s.od}mm → 최소 굴곡반경=${s.minBend}mm`
        ).join('; '),
        affectedCables: shieldedLarge.map(s => s.cable.id), affectedNodes: [],
        recommendation: '차폐 케이블은 8×OD 이상의 굴곡 반경을 유지하세요.',
      });
    } else {
      results.push({
        ruleId: 'CR48', ruleName: 'IEC 차폐 케이블 최소 굴곡 반경 8D', category: 'Installation',
        reference: 'IEC 60092-352 Sec.9.3',
        severity: 'minor', status: 'pass',
        message: '대형 차폐 케이블 없음 또는 기준 충족',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR49: DNV 케이블 관통부(penetration) 실링
RULES.push({
  id: 'CR49',
  category: 'Installation',
  name: 'DNV 수밀/풍우밀 관통부 실링',
  description: 'DNV Pt.4 Ch.8 Sec.9: 수밀 격벽 및 풍우밀 격벽의 케이블 관통부는 해당 등급의 수밀/풍우밀 실링이 필요하다.',
  reference: 'DNV Rules Pt.4 Ch.8 Sec.9.3',
  classSociety: 'DNV',
  severity: 'critical',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const crossBulkheadCables: CableData[] = [];

    for (const cable of data.cables) {
      const fromN = findNode(cable.fromNode, data.nodes);
      const toN = findNode(cable.toNode, data.nodes);
      // 구조가 다른 노드 사이를 지나는 케이블 → 격벽 관통 가능성
      if (fromN?.structure && toN?.structure && fromN.structure !== toN.structure) {
        crossBulkheadCables.push(cable);
      }
    }

    if (crossBulkheadCables.length > 0) {
      results.push({
        ruleId: 'CR49', ruleName: 'DNV 수밀/풍우밀 관통부 실링', category: 'Installation',
        reference: 'DNV Rules Pt.4 Ch.8 Sec.9.3',
        severity: 'critical', status: 'warning',
        message: `${crossBulkheadCables.length}개 케이블이 서로 다른 구조물 간 통과 — 관통부 실링 확인 필요`,
        details: crossBulkheadCables.slice(0, 10).map(c =>
          `${c.name}: ${findNode(c.fromNode, data.nodes)?.structure} → ${findNode(c.toNode, data.nodes)?.structure}`
        ).join('; '),
        affectedCables: crossBulkheadCables.slice(0, 30).map(c => c.id), affectedNodes: [],
        recommendation: '수밀/풍우밀 격벽 관통 케이블에는 해당 등급의 관통 실링(cable gland, stuffing tube)을 설치하세요.',
      });
    } else {
      results.push({
        ruleId: 'CR49', ruleName: 'DNV 수밀/풍우밀 관통부 실링', category: 'Installation',
        reference: 'DNV Rules Pt.4 Ch.8 Sec.9.3',
        severity: 'critical', status: 'not_applicable',
        message: '격벽 관통 케이블 미식별 (structure 데이터 부족 가능)',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '노드에 structure 정보를 입력하면 관통부를 자동 감지할 수 있습니다.',
      });
    }
    return results;
  },
});

// CR50: LR 케이블 글랜드 사이즈 적합성
RULES.push({
  id: 'CR50',
  category: 'Installation',
  name: 'LR 케이블 글랜드 사이즈 적합성',
  description: 'LR Rules: 케이블 글랜드(cable gland) 사이즈가 케이블 OD에 적합한지 확인.',
  reference: 'LR Rules Part 6 Ch.2 Sec.6',
  classSociety: 'LR',
  severity: 'minor',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const noGland: CableData[] = [];
    const mismatch: { cable: CableData; od: number; gland: string }[] = [];

    for (const cable of data.cables) {
      const ct = data.cableTypeDB.find(t => t.cableType === cable.type);
      if (!ct) continue;
      const od = getOD(cable, data.cableTypeDB);
      if (!ct.glandSize || ct.glandSize.trim() === '') {
        noGland.push(cable);
      } else {
        // 글랜드 사이즈에서 숫자 추출하여 OD와 비교
        const glandNum = parseFloat(ct.glandSize.replace(/[^0-9.]/g, ''));
        if (!isNaN(glandNum) && od > 0 && (od < glandNum * 0.6 || od > glandNum * 1.1)) {
          mismatch.push({ cable, od, gland: ct.glandSize });
        }
      }
    }

    if (mismatch.length > 0) {
      results.push({
        ruleId: 'CR50', ruleName: 'LR 케이블 글랜드 사이즈 적합성', category: 'Installation',
        reference: 'LR Rules Part 6 Ch.2 Sec.6',
        severity: 'minor', status: 'warning',
        message: `${mismatch.length}개 케이블의 글랜드 사이즈가 OD와 불일치`,
        details: mismatch.slice(0, 10).map(m =>
          `${m.cable.name}: OD=${m.od}mm, 글랜드=${m.gland}`
        ).join('; '),
        affectedCables: mismatch.map(m => m.cable.id), affectedNodes: [],
        recommendation: '케이블 OD에 맞는 글랜드 사이즈를 선정하세요.',
      });
    }

    if (mismatch.length === 0) {
      results.push({
        ruleId: 'CR50', ruleName: 'LR 케이블 글랜드 사이즈 적합성', category: 'Installation',
        reference: 'LR Rules Part 6 Ch.2 Sec.6',
        severity: 'minor', status: data.cableTypeDB.length > 0 ? 'pass' : 'not_applicable',
        message: data.cableTypeDB.length > 0 ? '글랜드 사이즈 적합성 확인' : 'CableType DB 없음',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// ---------- Category: EMC ----------

// CR51: IEC 60092 EMC 차폐 요구
RULES.push({
  id: 'CR51',
  category: 'EMC',
  name: 'IEC 60092 EMC 차폐 요구',
  description: 'IEC 60092-504: 민감한 전자 장비(항해, 통신, 제어) 연결 케이블은 차폐(shielded) 케이블을 사용해야 한다.',
  reference: 'IEC 60092-504, DNV Pt.4 Ch.8 Sec.10',
  classSociety: 'COMMON',
  severity: 'major',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const sensitiveCables = data.cables.filter(c => {
      const combined = `${c.system ?? ''} ${c.name ?? ''} ${c.fromEquip ?? ''} ${c.toEquip ?? ''}`.toUpperCase();
      return /NAV|GPS|RADAR|ECDIS|AIS|VDR|GYRO|ECHO|COMM|RADIO|SATCOM|GMDSS|VHF|UHF/i.test(combined);
    });

    if (sensitiveCables.length === 0) {
      results.push({
        ruleId: 'CR51', ruleName: 'IEC 60092 EMC 차폐 요구', category: 'EMC',
        reference: 'IEC 60092-504, DNV Pt.4 Ch.8 Sec.10',
        severity: 'major', status: 'not_applicable',
        message: '민감 전자장비 케이블 미식별',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
      return results;
    }

    const unshielded = sensitiveCables.filter(c => !isShieldedCable(c.type));

    if (unshielded.length > 0) {
      results.push({
        ruleId: 'CR51', ruleName: 'IEC 60092 EMC 차폐 요구', category: 'EMC',
        reference: 'IEC 60092-504, DNV Pt.4 Ch.8 Sec.10',
        severity: 'major', status: 'warning',
        message: `민감 장비 케이블 ${unshielded.length}개에 차폐 표시 없음`,
        details: unshielded.slice(0, 10).map(c => `${c.name}(${c.type})`).join(', '),
        affectedCables: unshielded.slice(0, 20).map(c => c.id), affectedNodes: [],
        recommendation: '항해, 통신, 제어 장비 연결 케이블은 차폐(shielded) 케이블을 사용하세요.',
      });
    } else {
      results.push({
        ruleId: 'CR51', ruleName: 'IEC 60092 EMC 차폐 요구', category: 'EMC',
        reference: 'IEC 60092-504, DNV Pt.4 Ch.8 Sec.10',
        severity: 'major', status: 'pass',
        message: `민감 장비 케이블 ${sensitiveCables.length}개 차폐 확인`,
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR52: DNV EMC 전력-신호 케이블 최소 이격 거리
RULES.push({
  id: 'CR52',
  category: 'EMC',
  name: 'DNV 전력-신호 케이블 이격 거리',
  description: 'DNV Pt.4 Ch.8 Sec.10: 비차폐 전력 케이블과 신호/통신 케이블은 최소 200mm 이격하거나 격벽으로 분리해야 한다.',
  reference: 'DNV Rules Pt.4 Ch.8 Sec.10.3',
  classSociety: 'DNV',
  severity: 'major',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    // 동일 노드를 공유하는 비차폐 전력 + 신호 케이블 탐색
    const nodeMap = new Map<string, { unshieldedPower: CableData[]; signal: CableData[] }>();

    for (const cable of data.cables) {
      const pathNodes = parsePath(cable);
      const power = isPowerCable(cable) && !isShieldedCable(cable.type);
      const signal = isControlOrCommCable(cable);
      if (!power && !signal) continue;

      for (const nd of pathNodes) {
        if (!nodeMap.has(nd)) nodeMap.set(nd, { unshieldedPower: [], signal: [] });
        const entry = nodeMap.get(nd)!;
        if (power) entry.unshieldedPower.push(cable);
        if (signal) entry.signal.push(cable);
      }
    }

    const violationNodes = Array.from(nodeMap.entries())
      .filter(([, v]) => v.unshieldedPower.length > 0 && v.signal.length > 0);

    if (violationNodes.length > 0) {
      for (const [nodeName, { unshieldedPower, signal }] of violationNodes.slice(0, 10)) {
        results.push({
          ruleId: 'CR52', ruleName: 'DNV 전력-신호 케이블 이격 거리', category: 'EMC',
          reference: 'DNV Rules Pt.4 Ch.8 Sec.10.3',
          severity: 'major', status: 'warning',
          message: `노드 ${nodeName}: 비차폐 전력(${unshieldedPower.length}개)과 신호(${signal.length}개) 케이블이 200mm 이격 미확인`,
          details: `전력: ${unshieldedPower.slice(0, 3).map(c => c.name).join(', ')}; 신호: ${signal.slice(0, 3).map(c => c.name).join(', ')}`,
          affectedCables: [...unshieldedPower.slice(0, 5), ...signal.slice(0, 5)].map(c => c.id),
          affectedNodes: [nodeName],
          recommendation: '비차폐 전력과 신호 케이블은 200mm 이상 이격하거나 금속 격벽으로 분리하세요.',
        });
      }
    } else {
      results.push({
        ruleId: 'CR52', ruleName: 'DNV 전력-신호 케이블 이격 거리', category: 'EMC',
        reference: 'DNV Rules Pt.4 Ch.8 Sec.10.3',
        severity: 'major', status: 'pass',
        message: '비차폐 전력-신호 케이블 혼재 노드 없음',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR53: IEC 전자기 적합성 주파수 변환기(VFD) 케이블
RULES.push({
  id: 'CR53',
  category: 'EMC',
  name: 'IEC VFD/인버터 출력 케이블 차폐',
  description: 'IEC 60092-504: VFD(Variable Frequency Drive)/인버터 출력 케이블은 360° 차폐(braided shield)를 사용하고 양쪽 접지해야 한다.',
  reference: 'IEC 60092-504 Sec.7, IEC 61800-3',
  classSociety: 'COMMON',
  severity: 'major',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const vfdCables = data.cables.filter(c => {
      const combined = `${c.system ?? ''} ${c.name ?? ''} ${c.fromEquip ?? ''} ${c.toEquip ?? ''}`.toUpperCase();
      return /VFD|INVERTER|INV\b|FREQ.*CONV|DRIVE|AFE|PWM/i.test(combined);
    });

    if (vfdCables.length === 0) {
      results.push({
        ruleId: 'CR53', ruleName: 'IEC VFD/인버터 출력 케이블 차폐', category: 'EMC',
        reference: 'IEC 60092-504 Sec.7, IEC 61800-3',
        severity: 'major', status: 'not_applicable',
        message: 'VFD/인버터 관련 케이블 미식별',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
      return results;
    }

    const unshielded = vfdCables.filter(c => !isShieldedCable(c.type));

    if (unshielded.length > 0) {
      results.push({
        ruleId: 'CR53', ruleName: 'IEC VFD/인버터 출력 케이블 차폐', category: 'EMC',
        reference: 'IEC 60092-504 Sec.7, IEC 61800-3',
        severity: 'major', status: 'warning',
        message: `VFD/인버터 케이블 ${unshielded.length}개에 차폐 표시 없음`,
        details: unshielded.slice(0, 10).map(c => `${c.name}(${c.type})`).join(', '),
        affectedCables: unshielded.map(c => c.id), affectedNodes: [],
        recommendation: 'VFD 출력 케이블은 360° braided shield 차폐 케이블을 사용하고 양쪽 접지하세요.',
      });
    } else {
      results.push({
        ruleId: 'CR53', ruleName: 'IEC VFD/인버터 출력 케이블 차폐', category: 'EMC',
        reference: 'IEC 60092-504 Sec.7, IEC 61800-3',
        severity: 'major', status: 'pass',
        message: `VFD/인버터 케이블 ${vfdCables.length}개 차폐 확인`,
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// ---------- Category: Redundancy ----------

// CR54: SOLAS 필수 서비스 전원 이중화
RULES.push({
  id: 'CR54',
  category: 'Redundancy',
  name: 'SOLAS 필수 서비스 전원 이중화',
  description: 'SOLAS Ch.II-1 Reg.42: 조타기, 항해 장비, 소방 펌프 등 필수 서비스에는 주 배전반과 비상 배전반에서 각각 독립된 전원 공급이 필요하다.',
  reference: 'SOLAS Ch.II-1 Reg.42',
  classSociety: 'COMMON',
  severity: 'critical',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const essentialSystems = ['STEER', 'FIRE PUMP', 'BILGE', 'NAV', 'COMM', 'EMERG'];

    for (const sys of essentialSystems) {
      const sysCables = data.cables.filter(c => {
        const combined = `${c.system ?? ''} ${c.name ?? ''} ${c.fromEquip ?? ''} ${c.toEquip ?? ''}`.toUpperCase();
        return combined.includes(sys);
      });

      if (sysCables.length === 0) continue;

      // 이 시스템에 MSB와 ESB 양쪽에서 전원이 공급되는지 확인
      const fromMSB = sysCables.some(c => {
        const combined = `${c.fromEquip ?? ''} ${c.fromNode ?? ''}`.toUpperCase();
        return /MSB|MAIN\s*SW|M\.?S\.?B/i.test(combined);
      });
      const fromESB = sysCables.some(c => {
        const combined = `${c.fromEquip ?? ''} ${c.fromNode ?? ''}`.toUpperCase();
        return /ESB|EMERG|E\.?S\.?B/i.test(combined);
      });

      if (!fromMSB && !fromESB) continue; // 판별 불가

      if (fromMSB && !fromESB) {
        results.push({
          ruleId: 'CR54', ruleName: 'SOLAS 필수 서비스 전원 이중화', category: 'Redundancy',
          reference: 'SOLAS Ch.II-1 Reg.42',
          severity: 'critical', status: 'warning',
          message: `필수 서비스 '${sys}': MSB 전원만 확인, ESB 비상 전원 미식별`,
          details: `${sys} 관련 케이블 ${sysCables.length}개`,
          affectedCables: sysCables.slice(0, 10).map(c => c.id), affectedNodes: [],
          recommendation: `${sys} 시스템에 ESB(비상 배전반)에서의 독립 전원 공급을 확인하세요.`,
        });
      }
    }

    if (results.length === 0) {
      results.push({
        ruleId: 'CR54', ruleName: 'SOLAS 필수 서비스 전원 이중화', category: 'Redundancy',
        reference: 'SOLAS Ch.II-1 Reg.42',
        severity: 'critical', status: 'not_applicable',
        message: '필수 서비스 전원 이중화 자동 판별 불가 (데이터 부족)',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '필수 서비스 시스템별 MSB/ESB 전원 이중화를 수동 확인하세요.',
      });
    }
    return results;
  },
});

// CR55: DNV DP 선박 이중화 경로 (Dynamic Positioning)
RULES.push({
  id: 'CR55',
  category: 'Redundancy',
  name: 'DNV DP 선박 이중화 경로',
  description: 'DNV Pt.4 Ch.8: DP(Dynamic Positioning) 선박에서 DP 시스템 케이블은 물리적으로 완전 분리된 이중화 경로를 사용해야 한다.',
  reference: 'DNV Rules Pt.4 Ch.8 Sec.5.4, IMO MSC/Circ.645',
  classSociety: 'DNV',
  severity: 'critical',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const dpCables = data.cables.filter(c => {
      const combined = `${c.system ?? ''} ${c.name ?? ''} ${c.fromEquip ?? ''} ${c.toEquip ?? ''}`.toUpperCase();
      return /DP\b|DYN.*POS|THRUSTER|AZIMUTH|POSITION.*REF|HPR|DGPS/i.test(combined);
    });

    if (dpCables.length === 0) {
      results.push({
        ruleId: 'CR55', ruleName: 'DNV DP 선박 이중화 경로', category: 'Redundancy',
        reference: 'DNV Rules Pt.4 Ch.8 Sec.5.4, IMO MSC/Circ.645',
        severity: 'critical', status: 'not_applicable',
        message: 'DP 시스템 케이블 미식별',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
      return results;
    }

    results.push({
      ruleId: 'CR55', ruleName: 'DNV DP 선박 이중화 경로', category: 'Redundancy',
      reference: 'DNV Rules Pt.4 Ch.8 Sec.5.4, IMO MSC/Circ.645',
      severity: 'critical', status: 'warning',
      message: `DP 시스템 케이블 ${dpCables.length}개 식별 — A/B 시스템 간 물리적 경로 분리 확인 필요`,
      details: dpCables.slice(0, 10).map(c => c.name ?? c.id).join(', '),
      affectedCables: dpCables.map(c => c.id), affectedNodes: [],
      recommendation: 'DP 시스템 A/B 이중화 케이블은 서로 다른 방화 구역을 통과하는 물리적으로 독립된 경로를 사용하세요.',
    });
    return results;
  },
});

// CR56: SOLAS 비상 발전기 케이블 독립성
RULES.push({
  id: 'CR56',
  category: 'Redundancy',
  name: 'SOLAS 비상 발전기 케이블 독립성',
  description: 'SOLAS Ch.II-1 Reg.44: 비상 발전기에서 비상 배전반까지의 케이블은 주 기관실을 관통하지 않아야 한다.',
  reference: 'SOLAS Ch.II-1 Reg.44',
  classSociety: 'COMMON',
  severity: 'critical',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const egCables = data.cables.filter(c => {
      const combined = `${c.system ?? ''} ${c.name ?? ''} ${c.fromEquip ?? ''} ${c.toEquip ?? ''}`.toUpperCase();
      return /E\/G|EMERG.*GEN|EM\s*GEN|EMERG.*DIESEL/i.test(combined);
    });

    if (egCables.length === 0) {
      results.push({
        ruleId: 'CR56', ruleName: 'SOLAS 비상 발전기 케이블 독립성', category: 'Redundancy',
        reference: 'SOLAS Ch.II-1 Reg.44',
        severity: 'critical', status: 'not_applicable',
        message: '비상 발전기 케이블 미식별',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '비상 발전기 케이블에 E/G 또는 EMERG GEN 시스템 코드를 부여하세요.',
      });
      return results;
    }

    for (const cable of egCables) {
      const pathNodes = parsePath(cable);
      const erNodes = pathNodes.filter(nd => {
        const node = findNode(nd, data.nodes);
        return node ? isEngineRoom(node) : false;
      });

      if (erNodes.length > 0) {
        results.push({
          ruleId: 'CR56', ruleName: 'SOLAS 비상 발전기 케이블 독립성', category: 'Redundancy',
          reference: 'SOLAS Ch.II-1 Reg.44',
          severity: 'critical', status: 'fail',
          message: `${cable.name}: 비상 발전기 케이블이 기관실(${erNodes.join(', ')})을 통과`,
          details: `경로: ${pathNodes.join(' → ')}`,
          affectedCables: [cable.id], affectedNodes: erNodes,
          recommendation: '비상 발전기 → ESB 케이블은 기관실을 통과하지 않는 경로를 사용해야 합니다.',
        });
      } else {
        results.push({
          ruleId: 'CR56', ruleName: 'SOLAS 비상 발전기 케이블 독립성', category: 'Redundancy',
          reference: 'SOLAS Ch.II-1 Reg.44',
          severity: 'critical', status: 'pass',
          message: `${cable.name}: 비상 발전기 케이블 기관실 비통과 확인`,
          details: '', affectedCables: [cable.id], affectedNodes: [],
          recommendation: '',
        });
      }
    }
    return results;
  },
});

// ---------- Category: Marking ----------

// CR57: IEC 케이블 식별 마킹 체계
RULES.push({
  id: 'CR57',
  category: 'Marking',
  name: 'IEC 케이블 식별 마킹 체계',
  description: 'IEC 60092-352 Sec.9.1: 모든 케이블은 양쪽 끝단에서 고유 식별 번호를 마킹해야 하며, 시스템 코드를 포함해야 한다.',
  reference: 'IEC 60092-352 Sec.9.1',
  classSociety: 'COMMON',
  severity: 'minor',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const noSystem = data.cables.filter(c => !c.system || c.system.trim() === '');

    if (noSystem.length > 0) {
      results.push({
        ruleId: 'CR57', ruleName: 'IEC 케이블 식별 마킹 체계', category: 'Marking',
        reference: 'IEC 60092-352 Sec.9.1',
        severity: 'minor', status: 'warning',
        message: `${noSystem.length}개 케이블에 시스템 코드(system) 미지정`,
        details: noSystem.slice(0, 15).map(c => c.name ?? c.id).join(', '),
        affectedCables: noSystem.slice(0, 30).map(c => c.id), affectedNodes: [],
        recommendation: '모든 케이블에 시스템 코드(POWER, CTRL, COMM 등)를 부여하세요.',
      });
    } else {
      results.push({
        ruleId: 'CR57', ruleName: 'IEC 케이블 식별 마킹 체계', category: 'Marking',
        reference: 'IEC 60092-352 Sec.9.1',
        severity: 'minor', status: 'pass',
        message: '모든 케이블에 시스템 코드가 부여되어 있습니다.',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR58: KR 케이블 Tag Number 표준
RULES.push({
  id: 'CR58',
  category: 'Marking',
  name: 'KR 케이블 Tag Number 표준',
  description: 'KR Rules: 케이블 Tag Number는 시스템-일련번호 형태를 따라야 하며, 도면과 현장이 일치해야 한다.',
  reference: 'KR Rules Part 6 Ch.2 Sec.9',
  classSociety: 'KR',
  severity: 'minor',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    // Tag Number 패턴 검증: 최소 영문+숫자 포함
    const badTag = data.cables.filter(c => {
      if (!c.name) return true;
      // 최소한 영문과 숫자가 포함되어야 함
      return !/[A-Za-z]/.test(c.name) || !/[0-9]/.test(c.name);
    });

    if (badTag.length > 0) {
      results.push({
        ruleId: 'CR58', ruleName: 'KR 케이블 Tag Number 표준', category: 'Marking',
        reference: 'KR Rules Part 6 Ch.2 Sec.9',
        severity: 'minor', status: 'warning',
        message: `${badTag.length}개 케이블의 Tag Number가 영문+숫자 조합이 아님`,
        details: badTag.slice(0, 15).map(c => `"${c.name ?? '(없음)'}"`).join(', '),
        affectedCables: badTag.map(c => c.id), affectedNodes: [],
        recommendation: '케이블 Tag Number는 시스템코드+일련번호 형식(예: PWR-001, CTRL-123)을 사용하세요.',
      });
    } else {
      results.push({
        ruleId: 'CR58', ruleName: 'KR 케이블 Tag Number 표준', category: 'Marking',
        reference: 'KR Rules Part 6 Ch.2 Sec.9',
        severity: 'minor', status: 'pass',
        message: '모든 케이블 Tag Number가 표준 형식을 따릅니다.',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR59: DNV 케이블 도면 번호(WD Page) 기재
RULES.push({
  id: 'CR59',
  category: 'Marking',
  name: 'DNV 케이블 도면 번호(WD Page) 기재',
  description: 'DNV Pt.4 Ch.8: 각 케이블은 배선 도면(Wiring Diagram) 번호가 기재되어야 한다.',
  reference: 'DNV Rules Pt.4 Ch.8 Sec.1.3',
  classSociety: 'DNV',
  severity: 'minor',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    const noWD = data.cables.filter(c => !c.wdPage || c.wdPage.trim() === '');

    if (noWD.length > 0 && noWD.length < data.cables.length) {
      results.push({
        ruleId: 'CR59', ruleName: 'DNV 케이블 도면 번호(WD Page) 기재', category: 'Marking',
        reference: 'DNV Rules Pt.4 Ch.8 Sec.1.3',
        severity: 'minor', status: 'warning',
        message: `${noWD.length}개 케이블에 도면 번호(WD Page) 미기재`,
        details: noWD.slice(0, 15).map(c => c.name ?? c.id).join(', '),
        affectedCables: noWD.slice(0, 30).map(c => c.id), affectedNodes: [],
        recommendation: '모든 케이블에 해당 배선 도면(WD) 번호를 기재하세요.',
      });
    } else if (noWD.length === 0) {
      results.push({
        ruleId: 'CR59', ruleName: 'DNV 케이블 도면 번호(WD Page) 기재', category: 'Marking',
        reference: 'DNV Rules Pt.4 Ch.8 Sec.1.3',
        severity: 'minor', status: 'pass',
        message: '모든 케이블에 도면 번호가 기재되어 있습니다.',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    } else {
      results.push({
        ruleId: 'CR59', ruleName: 'DNV 케이블 도면 번호(WD Page) 기재', category: 'Marking',
        reference: 'DNV Rules Pt.4 Ch.8 Sec.1.3',
        severity: 'minor', status: 'not_applicable',
        message: '도면 번호 데이터가 전혀 없음 (WD Page 필드 미사용)',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
    return results;
  },
});

// CR60: LR 케이블 색상 코드 일관성
RULES.push({
  id: 'CR60',
  category: 'Marking',
  name: 'LR 케이블 색상 코드 일관성',
  description: 'LR Rules Part 6 Ch.2: 동일 시스템의 케이블은 일관된 색상 코드를 사용해야 한다.',
  reference: 'LR Rules Part 6 Ch.2 Sec.9',
  classSociety: 'LR',
  severity: 'minor',
  check: (data) => {
    const results: RuleCheckResult[] = [];
    // 시스템별 색상 일관성 확인
    const sysColorMap = new Map<string, Set<string>>();

    for (const cable of data.cables) {
      if (!cable.system || !cable.color) continue;
      if (!sysColorMap.has(cable.system)) sysColorMap.set(cable.system, new Set());
      sysColorMap.get(cable.system)!.add(cable.color);
    }

    const inconsistent = Array.from(sysColorMap.entries())
      .filter(([, colors]) => colors.size > 3); // 동일 시스템에 3종 이상 색상이면 경고

    if (inconsistent.length > 0) {
      results.push({
        ruleId: 'CR60', ruleName: 'LR 케이블 색상 코드 일관성', category: 'Marking',
        reference: 'LR Rules Part 6 Ch.2 Sec.9',
        severity: 'minor', status: 'warning',
        message: `${inconsistent.length}개 시스템에서 케이블 색상 코드 불일치`,
        details: inconsistent.slice(0, 10).map(([sys, colors]) =>
          `${sys}: ${[...colors].join(', ')}`
        ).join('; '),
        affectedCables: [], affectedNodes: [],
        recommendation: '동일 시스템의 케이블은 일관된 색상 코드를 사용하세요.',
      });
    } else {
      results.push({
        ruleId: 'CR60', ruleName: 'LR 케이블 색상 코드 일관성', category: 'Marking',
        reference: 'LR Rules Part 6 Ch.2 Sec.9',
        severity: 'minor', status: data.cables.some(c => c.color) ? 'pass' : 'not_applicable',
        message: data.cables.some(c => c.color)
          ? '시스템별 케이블 색상 코드 일관성 확인'
          : '케이블 색상 데이터 없음',
        details: '', affectedCables: [], affectedNodes: [],
        recommendation: '',
      });
    }
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
