/**
 * Solver Web Worker — UI 스레드 차단 없이 물리 시뮬레이션 수행
 *
 * 메시지 프로토콜:
 *   요청: { type: 'solve', id, cables, numberOfTiers, maxHeightLimit, fillRatioLimit, fixedWidth? }
 *   응답: { type: 'result', id, systemResult, recommendedResult }
 */

import type { CableData, PlacedCable, Point, SingleTrayResult, SystemResult, MatrixCell } from '../types';

const MARGIN_X = 10;

const MIN_WIDTH = 100;
const MAX_WIDTH = 1000;
const WIDTH_STEP = 100;
const PHYSICAL_SIM_HEIGHT_LIMIT = 500;

// ── 물리 엔진 (solver.ts에서 이식) ──────────────────────────────

const dist = (p1: Point, p2: Point): number =>
  Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);

const checkCollision = (cables: PlacedCable[], x: number, y: number, r: number): boolean => {
  const EPSILON = 0.05;
  for (const c of cables) {
    if (dist({ x, y }, { x: c.x, y: c.y }) < (c.od / 2) + r - EPSILON) return true;
  }
  return false;
};

const isSupported = (placed: PlacedCable[], x: number, y: number, r: number): boolean => {
  if (y <= r + 1.0) return true;
  for (const c of placed) {
    if (c.y >= y) continue;
    const d = dist({ x, y }, { x: c.x, y: c.y });
    if (d <= (c.od / 2 + r) + 1.0 && Math.abs(c.x - x) < (c.od / 2 + r) * 0.9) return true;
  }
  return false;
};

const determineLayer = (y: number, r: number, placed: PlacedCable[], x: number): number => {
  if (y <= r + 2.0) return 1;
  const below = placed.filter(c => Math.abs(c.x - x) < (c.od / 2 + r) && c.y < y);
  if (below.length === 0) return 1;
  return Math.max(...below.map(c => c.layer)) + 1;
};

const findGravityPosition = (
  cable: CableData, placed: PlacedCable[], xMin: number, xMax: number,
): { point: Point; layer: number } | null => {
  const r = cable.od / 2;
  const candidates: Point[] = [{ x: xMin + r, y: r }];

  for (const c of placed) {
    candidates.push({ x: c.x + c.od / 2 + r + 0.1, y: r });
    for (let angle = 15; angle <= 165; angle += 15) {
      const rad = (angle * Math.PI) / 180;
      candidates.push({
        x: c.x + Math.cos(rad) * (c.od / 2 + r),
        y: c.y + Math.sin(rad) * (c.od / 2 + r),
      });
    }
  }

  const valid = candidates.filter(p =>
    p.x - r >= xMin - 0.5 && p.x + r <= xMax + 0.5 &&
    p.y + r <= PHYSICAL_SIM_HEIGHT_LIMIT &&
    !checkCollision(placed, p.x, p.y, r) &&
    isSupported(placed, p.x, p.y, r)
  );

  if (valid.length === 0) return null;
  valid.sort((a, b) => Math.abs(a.y - b.y) > 1.0 ? a.y - b.y : a.x - b.x);
  const best = valid[0];
  return { point: best, layer: determineLayer(best.y, r, placed, best.x) };
};

const customSortCables = (cables: CableData[]): CableData[] =>
  [...cables].sort((a, b) => {
    const s = (a.system || '').localeCompare(b.system || '');
    if (s !== 0) return s;
    if (b.od !== a.od) return b.od - a.od;
    return (a.fromNode || '').localeCompare(b.fromNode || '');
  });

function attemptFit(cables: CableData[], width: number) {
  const sorted = customSortCables(cables);
  const placed: PlacedCable[] = [];
  let maxStackHeight = 0;

  for (const cable of sorted) {
    const res = findGravityPosition(cable, placed, MARGIN_X, width - MARGIN_X);
    if (res) {
      placed.push({ ...cable, x: res.point.x, y: res.point.y, layer: res.layer });
      maxStackHeight = Math.max(maxStackHeight, res.point.y + cable.od / 2);
    } else {
      return { success: false, placed, maxStackHeight };
    }
  }
  return { success: true, placed, maxStackHeight };
}

// ── 공개 Solver 함수 ──────────────────────────────

function solveSingleTier(
  cables: CableData[], tierIndex: number, maxHeightLimit: number,
  targetFillRatioPercent: number, fixedWidth?: number,
): SingleTrayResult {
  const totalArea = cables.reduce((acc, c) => acc + Math.PI * (c.od / 2) ** 2, 0);
  const totalODSum = cables.reduce((a, c) => a + c.od, 0);

  if (cables.length === 0) {
    return { tierIndex, width: 100, cables: [], success: true, fillRatio: 0, totalODSum: 0, totalCableArea: 0, maxStackHeight: 0 };
  }

  if (fixedWidth) {
    const res = attemptFit(cables, fixedWidth);
    return {
      tierIndex, width: fixedWidth, cables: res.placed, success: res.success,
      fillRatio: (totalArea / (fixedWidth * maxHeightLimit)) * 100,
      totalODSum, totalCableArea: totalArea, maxStackHeight: res.maxStackHeight,
    };
  }

  const minTheoreticalWidth = (totalArea * 100) / (maxHeightLimit * targetFillRatioPercent);
  const startWidth = Math.max(MIN_WIDTH, Math.ceil(minTheoreticalWidth / WIDTH_STEP) * WIDTH_STEP);

  for (let w = startWidth; w <= MAX_WIDTH; w += WIDTH_STEP) {
    const res = attemptFit(cables, w);
    if (res.success) {
      return {
        tierIndex, width: w, cables: res.placed, success: true,
        fillRatio: (totalArea / (w * maxHeightLimit)) * 100,
        totalODSum, totalCableArea: totalArea, maxStackHeight: res.maxStackHeight,
      };
    }
  }

  const failRes = attemptFit(cables, MAX_WIDTH);
  return {
    tierIndex, width: MAX_WIDTH, cables: failRes.placed,
    success: failRes.success && failRes.placed.length === cables.length,
    fillRatio: (totalArea / (MAX_WIDTH * maxHeightLimit)) * 100,
    totalODSum, totalCableArea: totalArea, maxStackHeight: failRes.maxStackHeight,
  };
}

function calculateOptimizationMatrix(
  allCables: CableData[], maxHeight: number, targetFill: number,
): MatrixCell[][] {
  const widths = [200, 300, 400, 500, 600, 700, 800, 900];
  const tierCounts = [1, 2, 3, 4, 5, 6];
  const totalCableArea = allCables.reduce((acc, c) => acc + Math.PI * (c.od / 2) ** 2, 0);
  const sortedAll = customSortCables(allCables);
  const matrix: MatrixCell[][] = [];

  for (const t of tierCounts) {
    const row: MatrixCell[] = [];
    const tierBuckets: CableData[][] = Array.from({ length: t }, () => []);
    sortedAll.forEach((c, i) => tierBuckets[i % t].push(c));
    const worstTierCables = tierBuckets.reduce((prev, curr) =>
      curr.reduce((a, c) => a + c.od, 0) > prev.reduce((a, c) => a + c.od, 0) ? curr : prev
    );

    for (const w of widths) {
      const area = w * maxHeight * t;
      const systemFill = (totalCableArea / area) * 100;
      const res = attemptFit(worstTierCables, w);
      row.push({ tiers: t, width: w, area, fillRatio: systemFill, success: res.success, isOptimal: systemFill <= targetFill && res.success });
    }
    matrix.push(row);
  }
  return matrix;
}

function solveSystem(
  allCables: CableData[], numberOfTiers: number, maxHeightLimit: number, targetFillRatioPercent: number,
): SystemResult {
  const tierBuckets: CableData[][] = Array.from({ length: numberOfTiers }, () => []);
  const sorted = customSortCables(allCables);
  sorted.forEach((c, i) => tierBuckets[i % numberOfTiers].push(c));

  const tierResults = tierBuckets.map((b, i) => solveSingleTier(b, i, maxHeightLimit, targetFillRatioPercent));
  const maxTrayWidth = Math.max(...tierResults.map(r => r.width));
  const finalTierResults = tierBuckets.map((b, i) => solveSingleTier(b, i, maxHeightLimit, targetFillRatioPercent, maxTrayWidth));

  // 매트릭스는 지연 계산 — 별도 메시지로 요청
  return { systemWidth: maxTrayWidth, tiers: finalTierResults, success: finalTierResults.every(r => r.success), maxHeightPerTier: maxHeightLimit };
}

function solveSystemAtWidth(
  allCables: CableData[], numberOfTiers: number, width: number, maxHeightLimit: number, targetFillRatioPercent: number,
): SystemResult {
  const tierBuckets: CableData[][] = Array.from({ length: numberOfTiers }, () => []);
  const sorted = customSortCables(allCables);
  sorted.forEach((c, i) => tierBuckets[i % numberOfTiers].push(c));

  const finalTierResults = tierBuckets.map((b, i) => solveSingleTier(b, i, maxHeightLimit, targetFillRatioPercent, width));
  return { systemWidth: width, tiers: finalTierResults, success: finalTierResults.every(r => r.success), maxHeightPerTier: maxHeightLimit };
}

// ── Worker 메시지 핸들러 ──────────────────────────────

self.onmessage = (e: MessageEvent) => {
  const { type, id } = e.data;

  if (type === 'solve') {
    const { cables, numberOfTiers, maxHeightLimit, fillRatioLimit, fixedWidth } = e.data;

    const recommendedResult = solveSystem(cables, numberOfTiers, maxHeightLimit, fillRatioLimit);
    const systemResult = fixedWidth != null
      ? solveSystemAtWidth(cables, numberOfTiers, fixedWidth, maxHeightLimit, fillRatioLimit)
      : recommendedResult;

    // 1단계: 즉시 시뮬레이션 결과 전송 (UI가 바로 렌더링)
    self.postMessage({ type: 'result', id, systemResult, recommendedResult });

    // 2단계: 최적화 매트릭스 지연 계산 (백그라운드)
    const matrix = calculateOptimizationMatrix(cables, maxHeightLimit, fillRatioLimit);
    self.postMessage({ type: 'matrix', id, matrix });
  }
};
