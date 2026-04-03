/**
 * drumManager.ts — 케이블 드럼 관리 + 절단 최적화 모듈
 *
 * 1D Bin-Packing (FFD / BFD) 알고리즘으로 케이블을 드럼에 최적 배치하여
 * 자재 낭비를 최소화하고 비용을 절감한다.
 */

import type { CableData, CableTypeData } from '../types';

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export interface CableDrum {
  id: string;
  cableType: string;
  drumLength_m: number;
  usedLength_m: number;
  remainingLength_m: number;
  allocatedCables: DrumAllocation[];
  status: 'new' | 'in_use' | 'empty' | 'partial';
  drumNo: string;
}

export interface DrumAllocation {
  cableName: string;
  length_m: number;
  cuttingOrder: number;
}

export interface DrumOptimizationResult {
  drums: CableDrum[];
  totalDrums: number;
  totalWaste_m: number;
  wastePercent: number;
  totalCost?: number;
  savingsVsNaive?: number;
}

export interface DrumReport {
  timestamp: string;
  byType: DrumTypeReport[];
  summary: {
    totalDrums: number;
    totalLength_m: number;
    totalUsed_m: number;
    totalWaste_m: number;
    wastePercent: number;
    drumCounts: Record<string, number>;
  };
}

export interface DrumTypeReport {
  cableType: string;
  cables: { name: string; length_m: number }[];
  totalLength_m: number;
  optimization: DrumOptimizationResult;
}

export interface DrumLabel {
  drumNo: string;
  cableType: string;
  drumLength_m: number;
  cuttingList: {
    cableName: string;
    length_m: number;
    cumulativeLength_m: number;
  }[];
  remainingAfterCut_m: number;
}

// ────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────

const STANDARD_DRUM_LENGTHS = [100, 200, 300, 500, 1000, 2000];

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

let _drumSeq = 0;

function nextDrumId(): string {
  _drumSeq += 1;
  return `drum-${_drumSeq}`;
}

function nextDrumNo(index: number): string {
  return `D-${String(index).padStart(3, '0')}`;
}

/**
 * 총 길이에 가장 적합한 표준 드럼 사이즈를 선택한다.
 * - 해당 길이의 80 % 이상을 활용할 수 있는 최소 드럼을 우선 선택
 * - 없으면 가장 가까운 상위 표준 드럼
 * - 그래도 없으면 최대 드럼 반환
 */
function selectDrumSize(
  requiredLength: number,
  availableDrums: number[],
  maxDrumLength: number,
): number {
  const sorted = [...availableDrums].filter((d) => d <= maxDrumLength).sort((a, b) => a - b);
  if (sorted.length === 0) return maxDrumLength;

  // 80 % 이상 활용 가능한 최소 드럼
  for (const drum of sorted) {
    if (drum >= requiredLength && requiredLength / drum >= 0.8) {
      return drum;
    }
  }

  // 가장 가까운 상위 드럼
  for (const drum of sorted) {
    if (drum >= requiredLength) return drum;
  }

  // 어떤 드럼보다 크면 최대 드럼 반환
  return sorted[sorted.length - 1];
}

function makeDrum(
  cableType: string,
  drumLength: number,
  drumIndex: number,
): CableDrum {
  return {
    id: nextDrumId(),
    cableType,
    drumLength_m: drumLength,
    usedLength_m: 0,
    remainingLength_m: drumLength,
    allocatedCables: [],
    status: 'new',
    drumNo: nextDrumNo(drumIndex),
  };
}

function updateDrumStatus(drum: CableDrum): void {
  if (drum.allocatedCables.length === 0) {
    drum.status = 'new';
  } else if (drum.remainingLength_m <= 0.01) {
    drum.status = 'empty';
  } else if (drum.usedLength_m > 0) {
    drum.status = drum.remainingLength_m < drum.drumLength_m * 0.05 ? 'in_use' : 'partial';
  }
}

// ────────────────────────────────────────────────────────────────
// Core Algorithms
// ────────────────────────────────────────────────────────────────

/**
 * First Fit Decreasing (FFD)
 * 길이 내림차순 정렬 후, 잔량이 충분한 첫 번째 드럼에 배치.
 */
function firstFitDecreasing(
  cables: { name: string; length_m: number }[],
  drumLengths: number[],
  maxDrumLength: number,
): CableDrum[] {
  const sorted = [...cables].sort((a, b) => b.length_m - a.length_m);
  const drums: CableDrum[] = [];
  let drumIdx = 1;

  for (const cable of sorted) {
    let placed = false;

    for (const drum of drums) {
      if (drum.remainingLength_m >= cable.length_m) {
        drum.allocatedCables.push({
          cableName: cable.name,
          length_m: cable.length_m,
          cuttingOrder: drum.allocatedCables.length + 1,
        });
        drum.usedLength_m += cable.length_m;
        drum.remainingLength_m -= cable.length_m;
        updateDrumStatus(drum);
        placed = true;
        break;
      }
    }

    if (!placed) {
      const size = selectDrumSize(cable.length_m, drumLengths, maxDrumLength);
      const newDrum = makeDrum(
        cables[0] ? '' : '', // type set later by caller
        size,
        drumIdx++,
      );
      newDrum.allocatedCables.push({
        cableName: cable.name,
        length_m: cable.length_m,
        cuttingOrder: 1,
      });
      newDrum.usedLength_m = cable.length_m;
      newDrum.remainingLength_m = size - cable.length_m;
      updateDrumStatus(newDrum);
      drums.push(newDrum);
    }
  }

  return drums;
}

/**
 * Best Fit Decreasing (BFD)
 * 길이 내림차순 정렬 후, 잔량-길이 차이가 가장 작은(=가장 딱 맞는) 드럼에 배치.
 */
function bestFitDecreasing(
  cables: { name: string; length_m: number }[],
  drumLengths: number[],
  maxDrumLength: number,
): CableDrum[] {
  const sorted = [...cables].sort((a, b) => b.length_m - a.length_m);
  const drums: CableDrum[] = [];
  let drumIdx = 1;

  for (const cable of sorted) {
    let bestIdx = -1;
    let bestRemainder = Infinity;

    for (let i = 0; i < drums.length; i++) {
      const rem = drums[i].remainingLength_m - cable.length_m;
      if (rem >= 0 && rem < bestRemainder) {
        bestRemainder = rem;
        bestIdx = i;
      }
    }

    if (bestIdx !== -1) {
      const drum = drums[bestIdx];
      drum.allocatedCables.push({
        cableName: cable.name,
        length_m: cable.length_m,
        cuttingOrder: drum.allocatedCables.length + 1,
      });
      drum.usedLength_m += cable.length_m;
      drum.remainingLength_m -= cable.length_m;
      updateDrumStatus(drum);
    } else {
      const size = selectDrumSize(cable.length_m, drumLengths, maxDrumLength);
      const newDrum = makeDrum('', size, drumIdx++);
      newDrum.allocatedCables.push({
        cableName: cable.name,
        length_m: cable.length_m,
        cuttingOrder: 1,
      });
      newDrum.usedLength_m = cable.length_m;
      newDrum.remainingLength_m = size - cable.length_m;
      updateDrumStatus(newDrum);
      drums.push(newDrum);
    }
  }

  return drums;
}

// ────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────

/**
 * 단일 케이블 타입에 대한 드럼 최적화
 */
export function optimizeSingleType(
  cables: { name: string; length_m: number }[],
  drumLengths: number[],
  algorithm: 'ffd' | 'bfd' = 'bfd',
): DrumOptimizationResult {
  if (cables.length === 0) {
    return { drums: [], totalDrums: 0, totalWaste_m: 0, wastePercent: 0 };
  }

  const maxDrum = Math.max(...drumLengths);
  const pack = algorithm === 'ffd' ? firstFitDecreasing : bestFitDecreasing;
  const drums = pack(cables, drumLengths, maxDrum);

  const totalUsed = drums.reduce((s, d) => s + d.usedLength_m, 0);
  const totalCapacity = drums.reduce((s, d) => s + d.drumLength_m, 0);
  const totalWaste = totalCapacity - totalUsed;

  return {
    drums,
    totalDrums: drums.length,
    totalWaste_m: Math.round(totalWaste * 100) / 100,
    wastePercent: totalCapacity > 0
      ? Math.round((totalWaste / totalCapacity) * 10000) / 100
      : 0,
  };
}

/**
 * 전체 케이블 데이터를 타입별로 분류하고 드럼 최적화를 수행한다.
 */
export function optimizeDrums(
  cables: CableData[],
  options?: {
    algorithm?: 'ffd' | 'bfd';
    standardDrumLengths?: number[];
    marginPercent?: number;
    cableTypeDB?: CableTypeData[];
    maxDrumLength?: number;
    drumLengthByType?: Record<string, number>; // 타입별 조장길이
  },
): DrumReport {
  const algo = options?.algorithm ?? 'bfd';
  const drumLengths = options?.standardDrumLengths ?? STANDARD_DRUM_LENGTHS;
  const margin = options?.marginPercent ?? 5;
  const maxDrumLen = options?.maxDrumLength ?? 2000;

  // 시퀀스 리셋
  _drumSeq = 0;

  // OD 기반 드럼 사이즈 맵 (케이블타입 DB 참조)
  const odMap = new Map<string, number>();
  if (options?.cableTypeDB) {
    for (const ct of options.cableTypeDB) {
      odMap.set(ct.cableType.trim().toUpperCase(), ct.od);
    }
  }

  // 타입별 그룹핑 (1.TYPE → 2.SYSTEM → 3.FROM → 4.TO → 5.장비별)
  const grouped = new Map<string, { name: string; length_m: number; od: number }[]>();
  for (const c of cables) {
    const len = c.calculatedLength ?? c.length ?? 0;
    if (len <= 0) continue;

    const withMargin = len * (1 + margin / 100);
    // 그룹키: TYPE | SYSTEM | FROM | TO
    const sys = c.system || '';
    const from = c.fromEquip || c.fromNode || '';
    const to = c.toEquip || c.toNode || '';
    const key = `${c.type || 'UNKNOWN'}|${sys}|${from}|${to}`;
    const od = c.od || odMap.get((c.type || '').trim().toUpperCase()) || 0;

    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push({ name: c.name, length_m: Math.round(withMargin * 100) / 100, od });
  }

  // 타입별 최적화
  const byType: DrumTypeReport[] = [];
  let globalDrumIdx = 1;

  for (const [groupKey, typeCables] of grouped) {
    const cableType = groupKey.split('|')[0]; // TYPE만 추출
    // 타입별 조장길이: drumLengthByType 우선 → OD 기반 기본값
    const typeKey = cableType.trim().toUpperCase();
    const avgOd = typeCables.length > 0 ? typeCables.reduce((s, c) => s + c.od, 0) / typeCables.length : 0;
    const customDrumLen = options?.drumLengthByType?.[typeKey];
    const maxDrumForType = customDrumLen ?? (avgOd >= 30 ? 500 : 1000);
    const effectiveDrums = drumLengths.filter(d => d <= Math.min(maxDrumLen, maxDrumForType));
    // 커스텀 길이가 표준 목록에 없으면 추가
    if (maxDrumForType > 0 && !effectiveDrums.includes(maxDrumForType)) {
      effectiveDrums.push(maxDrumForType);
      effectiveDrums.sort((a, b) => a - b);
    }

    const result = optimizeSingleType(
      typeCables,
      effectiveDrums.length > 0 ? effectiveDrums : [maxDrumForType],
      algo,
    );

    // 드럼 번호 및 타입 재배정
    for (const drum of result.drums) {
      drum.cableType = cableType;
      drum.drumNo = nextDrumNo(globalDrumIdx++);
    }

    byType.push({
      cableType: groupKey, // TYPE|SYSTEM|FROM|TO 형태로 저장 → UI에서 분리 표시
      cables: typeCables,
      totalLength_m: Math.round(typeCables.reduce((s, c) => s + c.length_m, 0) * 100) / 100,
      optimization: result,
    });
  }

  // 전체 서머리
  const totalDrums = byType.reduce((s, t) => s + t.optimization.totalDrums, 0);
  const totalLength = byType.reduce((s, t) => s + t.totalLength_m, 0);
  const totalUsed = byType.reduce(
    (s, t) => s + t.optimization.drums.reduce((ds, d) => ds + d.usedLength_m, 0),
    0,
  );
  const totalCapacity = byType.reduce(
    (s, t) => s + t.optimization.drums.reduce((ds, d) => ds + d.drumLength_m, 0),
    0,
  );
  const totalWaste = totalCapacity - totalUsed;

  // 드럼 사이즈별 수량
  const drumCounts: Record<string, number> = {};
  for (const t of byType) {
    for (const d of t.optimization.drums) {
      const key = `${d.drumLength_m}m`;
      drumCounts[key] = (drumCounts[key] ?? 0) + 1;
    }
  }

  return {
    timestamp: new Date().toISOString(),
    byType,
    summary: {
      totalDrums,
      totalLength_m: Math.round(totalLength * 100) / 100,
      totalUsed_m: Math.round(totalUsed * 100) / 100,
      totalWaste_m: Math.round(totalWaste * 100) / 100,
      wastePercent: totalCapacity > 0
        ? Math.round((totalWaste / totalCapacity) * 10000) / 100
        : 0,
      drumCounts,
    },
  };
}

/**
 * Naive(1:1 매칭) 대비 최적화 절감량 계산
 */
export function calculateSavings(
  optimized: DrumReport,
  pricePerMeter?: Record<string, number>,
): { totalSaved_m: number; totalSavedCost?: number; percentImprovement: number } {
  // Naive: 각 케이블마다 개별 드럼 → 낭비 = drum - cable 합
  let naiveWaste = 0;

  const drumLengths = STANDARD_DRUM_LENGTHS;
  const maxDrum = Math.max(...drumLengths);

  for (const typeReport of optimized.byType) {
    for (const cable of typeReport.cables) {
      const drumSize = selectDrumSize(cable.length_m, drumLengths, maxDrum);
      naiveWaste += drumSize - cable.length_m;
    }
  }

  const optimizedWaste = optimized.summary.totalWaste_m;
  const saved = Math.round((naiveWaste - optimizedWaste) * 100) / 100;
  const pctImprovement = naiveWaste > 0
    ? Math.round((saved / naiveWaste) * 10000) / 100
    : 0;

  let totalSavedCost: number | undefined;
  if (pricePerMeter) {
    let naiveCost = 0;
    let optCost = 0;

    for (const typeReport of optimized.byType) {
      const price = pricePerMeter[typeReport.cableType] ?? 0;

      // naive cost: 개별 드럼 * 가격
      for (const cable of typeReport.cables) {
        const drumSize = selectDrumSize(cable.length_m, drumLengths, maxDrum);
        naiveCost += drumSize * price;
      }

      // optimized cost: 실제 드럼 * 가격
      for (const drum of typeReport.optimization.drums) {
        optCost += drum.drumLength_m * price;
      }
    }

    totalSavedCost = Math.round((naiveCost - optCost) * 100) / 100;
  }

  return { totalSaved_m: saved, totalSavedCost, percentImprovement: pctImprovement };
}

/**
 * 현장용 드럼 라벨 생성
 */
export function generateDrumLabels(drums: CableDrum[]): DrumLabel[] {
  return drums.map((drum) => {
    let cumulative = 0;
    const cuttingList = drum.allocatedCables.map((alloc) => {
      cumulative += alloc.length_m;
      return {
        cableName: alloc.cableName,
        length_m: alloc.length_m,
        cumulativeLength_m: Math.round(cumulative * 100) / 100,
      };
    });

    return {
      drumNo: drum.drumNo,
      cableType: drum.cableType,
      drumLength_m: drum.drumLength_m,
      cuttingList,
      remainingAfterCut_m: Math.round((drum.drumLength_m - cumulative) * 100) / 100,
    };
  });
}

/**
 * 드럼 현황 대시보드 데이터
 */
export function getDrumDashboard(report: DrumReport): {
  byType: {
    type: string;
    drums: number;
    used_m: number;
    waste_m: number;
    wastePercent: number;
  }[];
  topWaste: { drumNo: string; type: string; waste_m: number }[];
  utilizationChart: { drumNo: string; usedPercent: number }[];
} {
  // 타입별 집계
  const byType = report.byType.map((t) => {
    const used = t.optimization.drums.reduce((s, d) => s + d.usedLength_m, 0);
    const capacity = t.optimization.drums.reduce((s, d) => s + d.drumLength_m, 0);
    const waste = capacity - used;
    return {
      type: t.cableType,
      drums: t.optimization.totalDrums,
      used_m: Math.round(used * 100) / 100,
      waste_m: Math.round(waste * 100) / 100,
      wastePercent: capacity > 0 ? Math.round((waste / capacity) * 10000) / 100 : 0,
    };
  });

  // 모든 드럼을 플랫으로 펼침
  const allDrums = report.byType.flatMap((t) =>
    t.optimization.drums.map((d) => ({
      drumNo: d.drumNo,
      type: d.cableType,
      waste_m: Math.round(d.remainingLength_m * 100) / 100,
      usedPercent:
        d.drumLength_m > 0
          ? Math.round((d.usedLength_m / d.drumLength_m) * 10000) / 100
          : 0,
    })),
  );

  // 낭비 상위 5개
  const topWaste = [...allDrums]
    .sort((a, b) => b.waste_m - a.waste_m)
    .slice(0, 5)
    .map(({ drumNo, type, waste_m }) => ({ drumNo, type, waste_m }));

  // 활용률 차트
  const utilizationChart = allDrums.map(({ drumNo, usedPercent }) => ({
    drumNo,
    usedPercent,
  }));

  return { byType, topWaste, utilizationChart };
}
