/**
 * 전압강하(Voltage Drop) 자동 계산 모듈
 * IEC 60364 / 선급 기준 준수
 * 기존 SCM 코드 수정 없이 독립 작동
 */

import type { CableData, CableTypeData } from '../types';

// ─── 도체 저항 테이블 (구리, 70°C 기준) ───────────────────────────

export interface ConductorSpec {
  crossSection: number;  // mm²
  resistance: number;    // Ω/km (70°C)
  reactance: number;     // Ω/km
  maxCurrent: number;    // A (허용전류)
}

export const CONDUCTOR_TABLE: Record<string, ConductorSpec> = {
  '1.5':  { crossSection: 1.5,   resistance: 14.5,    reactance: 0.115, maxCurrent: 18  },
  '2.5':  { crossSection: 2.5,   resistance: 8.71,    reactance: 0.110, maxCurrent: 25  },
  '4':    { crossSection: 4,     resistance: 5.45,    reactance: 0.107, maxCurrent: 34  },
  '6':    { crossSection: 6,     resistance: 3.63,    reactance: 0.100, maxCurrent: 43  },
  '10':   { crossSection: 10,    resistance: 2.18,    reactance: 0.094, maxCurrent: 60  },
  '16':   { crossSection: 16,    resistance: 1.36,    reactance: 0.088, maxCurrent: 80  },
  '25':   { crossSection: 25,    resistance: 0.868,   reactance: 0.084, maxCurrent: 101 },
  '35':   { crossSection: 35,    resistance: 0.625,   reactance: 0.081, maxCurrent: 126 },
  '50':   { crossSection: 50,    resistance: 0.463,   reactance: 0.079, maxCurrent: 153 },
  '70':   { crossSection: 70,    resistance: 0.321,   reactance: 0.075, maxCurrent: 196 },
  '95':   { crossSection: 95,    resistance: 0.232,   reactance: 0.073, maxCurrent: 238 },
  '120':  { crossSection: 120,   resistance: 0.183,   reactance: 0.071, maxCurrent: 276 },
  '150':  { crossSection: 150,   resistance: 0.149,   reactance: 0.070, maxCurrent: 319 },
  '185':  { crossSection: 185,   resistance: 0.119,   reactance: 0.068, maxCurrent: 364 },
  '240':  { crossSection: 240,   resistance: 0.0907,  reactance: 0.066, maxCurrent: 430 },
  '300':  { crossSection: 300,   resistance: 0.0734,  reactance: 0.065, maxCurrent: 497 },
  '400':  { crossSection: 400,   resistance: 0.0559,  reactance: 0.063, maxCurrent: 586 },
};

// 정렬된 단면적 목록 (추천 기능용)
const SORTED_CROSS_SECTIONS = Object.values(CONDUCTOR_TABLE)
  .map((s) => s.crossSection)
  .sort((a, b) => a - b);

// ─── 기본 상수 ───────────────────────────────────────────────────

const DEFAULT_VOLTAGE = 440;        // V (선박 삼상 기준)
const DEFAULT_POWER_FACTOR = 0.8;   // cosφ
const DEFAULT_TEMPERATURE = 70;     // °C
const DEFAULT_MAX_DROP_PERCENT = 6; // 선급 일반 기준 %

// ─── 인터페이스 정의 ─────────────────────────────────────────────

export interface VoltageDropInput {
  cable: CableData;
  voltage: number;          // 정격전압 V (기본 440)
  current?: number;         // 부하전류 A (없으면 허용전류 사용)
  powerFactor?: number;     // 역률 (기본 0.8)
  temperature?: number;     // 도체 온도 °C (기본 70)
}

export interface VoltageDropResult {
  cableName: string;
  cableType: string;
  length_m: number;
  crossSection_mm2: number;
  phase: '1phase' | '3phase';
  voltage_V: number;
  current_A: number;
  resistance_ohm_km: number;
  reactance_ohm_km: number;
  voltageDrop_V: number;
  voltageDrop_percent: number;
  maxAllowed_percent: number;
  status: 'pass' | 'warning' | 'fail';
  message: string;
}

export interface VoltageDropReport {
  timestamp: string;
  totalCables: number;
  calculatedCount: number;
  skippedCount: number;      // 길이 정보 없어서 스킵
  results: VoltageDropResult[];
  summary: {
    passed: number;
    warnings: number;
    failed: number;
    maxDrop: VoltageDropResult | null;
    avgDrop_percent: number;
  };
}

// ─── 케이블 타입에서 단면적/코어 추출 ───────────────────────────

export interface ParsedCableSpec {
  crossSection: number;
  cores: number;
  phase: '1phase' | '3phase';
}

/**
 * 케이블 타입 문자열에서 단면적(mm²)과 코어 수를 추출한다.
 *
 * 지원 패턴:
 *  - "CV 2.5SQ 3C"  → { crossSection: 2.5, cores: 3, phase: '3phase' }
 *  - "XLPE 16SQ 2C" → { crossSection: 16, cores: 2, phase: '1phase' }
 *  - "MY4", "DY2"   → CableTypeData 에서 매칭 후 crossSection 사용
 *
 * 매칭 실패 시 기본값: 2.5mm², 3core, 3phase
 */
export function parseCableSpec(
  cableType: string,
  cableTypeDB?: CableTypeData[],
): ParsedCableSpec {
  let crossSection = 2.5;  // 기본값
  let cores = 3;            // 기본값

  if (!cableType) {
    return { crossSection, cores, phase: cores >= 3 ? '3phase' : '1phase' };
  }

  const upper = cableType.toUpperCase();

  // 1. "숫자SQ" 패턴으로 단면적 추출 (예: 2.5SQ, 16SQ)
  const sqMatch = upper.match(/([\d.]+)\s*SQ/);
  if (sqMatch) {
    crossSection = parseFloat(sqMatch[1]);
  }

  // 2. "숫자C" 패턴으로 코어 수 추출 (예: 3C, 2C, 4C)
  const coreMatch = upper.match(/(\d+)\s*C(?:\b|$)/);
  if (coreMatch) {
    cores = parseInt(coreMatch[1], 10);
  }

  // 3. SQ 패턴이 없으면 CableTypeData DB에서 매칭 시도
  if (!sqMatch && cableTypeDB && cableTypeDB.length > 0) {
    const found = cableTypeDB.find(
      (ct) => ct.cableType.toUpperCase() === upper,
    );
    if (found && found.crossSection > 0) {
      crossSection = found.crossSection;
    }
  }

  // 4. SQ 패턴도 없고 DB 매칭도 안 되면, 타입 문자열에서 숫자 추출 시도
  //    예: "MY4" → 4mm² 는 아니지만, 매칭 안 됨을 인정하고 기본값 유지
  //    (잘못된 매칭 방지)

  const phase: '1phase' | '3phase' = cores >= 3 ? '3phase' : '1phase';
  return { crossSection, cores, phase };
}

// ─── 온도 보정 계수 ─────────────────────────────────────────────

/**
 * 도체 온도에 따른 저항 보정 계수 (기준: 70°C).
 * R(T) = R(70) × [1 + α × (T - 70)]
 * 구리 α ≈ 0.00393 /°C (20°C 기준에서 환산)
 */
function temperatureCorrectionFactor(tempC: number): number {
  const alpha = 0.00393;
  // 테이블이 70°C 기준이므로, 20°C 기준 alpha를 70°C 기준으로 변환
  // R(T) / R(70) = (1 + α×(T-20)) / (1 + α×(70-20))
  const numerator = 1 + alpha * (tempC - 20);
  const denominator = 1 + alpha * (70 - 20);
  return numerator / denominator;
}

// ─── 도체 사양 조회 ─────────────────────────────────────────────

/**
 * 단면적(mm²)에 대응하는 도체 사양을 조회한다.
 * 정확한 키가 없으면 가장 가까운 큰 값으로 매칭한다.
 */
function getConductorSpec(crossSection: number): ConductorSpec | null {
  // 정확한 키 매칭
  const key = String(crossSection);
  if (CONDUCTOR_TABLE[key]) {
    return CONDUCTOR_TABLE[key];
  }

  // 가장 가까운 큰 값 매칭
  for (const size of SORTED_CROSS_SECTIONS) {
    if (size >= crossSection) {
      return CONDUCTOR_TABLE[String(size)];
    }
  }

  // 가장 큰 값 반환
  const maxKey = String(SORTED_CROSS_SECTIONS[SORTED_CROSS_SECTIONS.length - 1]);
  return CONDUCTOR_TABLE[maxKey] ?? null;
}

// ─── 허용 기준 판정 ─────────────────────────────────────────────

function getMaxAllowedPercent(voltage: number): number {
  // 선박 440V → 6%, 380V(삼상) → 5%, 220V(단상) → 5%
  if (voltage >= 400) return 6;   // 선박/조선 기준
  if (voltage >= 300) return 5;   // IEC 삼상
  return 5;                       // IEC 단상
}

function judgeStatus(
  dropPercent: number,
  maxAllowed: number,
): { status: 'pass' | 'warning' | 'fail'; message: string } {
  if (dropPercent <= maxAllowed * 0.8) {
    return { status: 'pass', message: `전압강하 ${dropPercent.toFixed(2)}% — 적합` };
  }
  if (dropPercent <= maxAllowed) {
    return {
      status: 'warning',
      message: `전압강하 ${dropPercent.toFixed(2)}% — 허용 범위 내 (주의: ${maxAllowed}%의 80% 초과)`,
    };
  }
  return {
    status: 'fail',
    message: `전압강하 ${dropPercent.toFixed(2)}% — 허용 기준 ${maxAllowed}% 초과!`,
  };
}

// ─── 케이블 길이 결정 ───────────────────────────────────────────

/**
 * CableData에서 유효한 길이(m)를 추출한다.
 * 우선순위: calculatedLength → length → 0
 */
function getCableLength(cable: CableData): number {
  if (cable.calculatedLength != null && cable.calculatedLength > 0) {
    return cable.calculatedLength;
  }
  if (cable.length != null && cable.length > 0) {
    return cable.length;
  }
  return 0;
}

// ─── 단일 케이블 전압강하 계산 ──────────────────────────────────

export function calculateVoltageDrop(
  input: VoltageDropInput,
  cableTypeDB?: CableTypeData[],
): VoltageDropResult {
  const { cable } = input;
  const voltage = input.voltage || DEFAULT_VOLTAGE;
  const powerFactor = input.powerFactor ?? DEFAULT_POWER_FACTOR;
  const temperature = input.temperature ?? DEFAULT_TEMPERATURE;

  // 케이블 사양 파싱
  const spec = parseCableSpec(cable.type, cableTypeDB);
  const conductor = getConductorSpec(spec.crossSection);

  // 도체 사양이 없으면 2.5mm² 기본값 사용
  const R = conductor?.resistance ?? 8.71;
  const X = conductor?.reactance ?? 0.110;
  const maxCurrent = conductor?.maxCurrent ?? 25;
  const actualCrossSection = conductor?.crossSection ?? spec.crossSection;

  // 온도 보정
  const tempFactor = temperatureCorrectionFactor(temperature);
  const correctedR = R * tempFactor;

  // 전류 결정
  const current = input.current ?? maxCurrent;

  // 길이(m)
  const length = getCableLength(cable);

  // cosφ, sinφ
  const cosPhi = powerFactor;
  const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);

  // 전압강하 계산
  //   단상: Vd = 2 × I × L × (R×cosφ + X×sinφ) / 1000
  //   삼상: Vd = √3 × I × L × (R×cosφ + X×sinφ) / 1000
  const factor = spec.phase === '1phase' ? 2 : Math.sqrt(3);
  const voltageDrop = factor * current * length * (correctedR * cosPhi + X * sinPhi) / 1000;

  // 전압강하율
  const voltageDropPercent = voltage > 0 ? (voltageDrop / voltage) * 100 : 0;

  // 허용 기준 판정
  const maxAllowed = getMaxAllowedPercent(voltage);
  const { status, message } = judgeStatus(voltageDropPercent, maxAllowed);

  return {
    cableName: cable.name,
    cableType: cable.type,
    length_m: length,
    crossSection_mm2: actualCrossSection,
    phase: spec.phase,
    voltage_V: voltage,
    current_A: current,
    resistance_ohm_km: correctedR,
    reactance_ohm_km: X,
    voltageDrop_V: Math.round(voltageDrop * 1000) / 1000,
    voltageDrop_percent: Math.round(voltageDropPercent * 100) / 100,
    maxAllowed_percent: maxAllowed,
    status,
    message,
  };
}

// ─── 전체 케이블 일괄 계산 ──────────────────────────────────────

export function calculateAllVoltageDrops(
  cables: CableData[],
  options?: {
    voltage?: number;
    powerFactor?: number;
    maxAllowedPercent?: number;
    cableTypeDB?: CableTypeData[];
  },
): VoltageDropReport {
  const voltage = options?.voltage ?? DEFAULT_VOLTAGE;
  const powerFactor = options?.powerFactor ?? DEFAULT_POWER_FACTOR;
  const cableTypeDB = options?.cableTypeDB;
  const customMaxAllowed = options?.maxAllowedPercent;

  const results: VoltageDropResult[] = [];
  let skippedCount = 0;

  for (const cable of cables) {
    const length = getCableLength(cable);

    // 길이가 0이면 계산 스킵
    if (length <= 0) {
      skippedCount++;
      continue;
    }

    const result = calculateVoltageDrop(
      { cable, voltage, powerFactor },
      cableTypeDB,
    );

    // 사용자 지정 허용 기준이 있으면 재판정
    if (customMaxAllowed != null) {
      const { status, message } = judgeStatus(result.voltageDrop_percent, customMaxAllowed);
      result.maxAllowed_percent = customMaxAllowed;
      result.status = status;
      result.message = message;
    }

    results.push(result);
  }

  // 요약 통계
  const passed = results.filter((r) => r.status === 'pass').length;
  const warnings = results.filter((r) => r.status === 'warning').length;
  const failed = results.filter((r) => r.status === 'fail').length;

  const maxDrop = results.length > 0
    ? results.reduce((max, r) => (r.voltageDrop_percent > max.voltageDrop_percent ? r : max))
    : null;

  const avgDrop = results.length > 0
    ? results.reduce((sum, r) => sum + r.voltageDrop_percent, 0) / results.length
    : 0;

  return {
    timestamp: new Date().toISOString(),
    totalCables: cables.length,
    calculatedCount: results.length,
    skippedCount,
    results,
    summary: {
      passed,
      warnings,
      failed,
      maxDrop,
      avgDrop_percent: Math.round(avgDrop * 100) / 100,
    },
  };
}

// ─── 적정 케이블 사이즈 추천 ────────────────────────────────────

/**
 * 주어진 조건에서 전압강하 기준을 만족하는 최소 케이블 사이즈를 추천한다.
 *
 * @param length_m      케이블 길이 (m)
 * @param current_A     부하 전류 (A)
 * @param voltage_V     정격 전압 (V)
 * @param maxDropPercent 허용 전압강하율 (%)
 * @param phase         단상/삼상
 * @param powerFactor   역률 (기본 0.8)
 * @returns 추천 단면적과 해당 전압강하율, 또는 모든 사이즈 초과 시 null
 */
export function recommendCableSize(
  length_m: number,
  current_A: number,
  voltage_V: number,
  maxDropPercent: number,
  phase: '1phase' | '3phase',
  powerFactor?: number,
): { crossSection: number; voltageDrop_percent: number } | null {
  const pf = powerFactor ?? DEFAULT_POWER_FACTOR;
  const cosPhi = pf;
  const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
  const factor = phase === '1phase' ? 2 : Math.sqrt(3);

  for (const size of SORTED_CROSS_SECTIONS) {
    const spec = CONDUCTOR_TABLE[String(size)];
    if (!spec) continue;

    // 허용전류 체크
    if (spec.maxCurrent < current_A) continue;

    // 전압강하 계산
    const vd = factor * current_A * length_m * (spec.resistance * cosPhi + spec.reactance * sinPhi) / 1000;
    const vdPercent = (vd / voltage_V) * 100;

    if (vdPercent <= maxDropPercent) {
      return {
        crossSection: spec.crossSection,
        voltageDrop_percent: Math.round(vdPercent * 100) / 100,
      };
    }
  }

  // 모든 사이즈에서 기준 초과
  return null;
}
