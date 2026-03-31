import { CableData, PlacedCable, Point, SingleTrayResult, SystemResult, MatrixCell, MARGIN_X, MAX_PILE_WIDTH, PILE_GAP } from '../types';

const MIN_WIDTH = 100;
const MAX_WIDTH = 1000;
const WIDTH_STEP = 100; // 100mm 단위
const PHYSICAL_SIM_HEIGHT_LIMIT = 500; // Simulation allows stacking up to 500mm regardless of user setting (Soft Limit)

const dist = (p1: Point, p2: Point): number => {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
};

const checkCollision = (cables: PlacedCable[], x: number, y: number, r: number): boolean => {
  const EPSILON = 0.05; 
  for (const c of cables) {
    const d = dist({ x, y }, { x: c.x, y: c.y });
    const minDist = (c.od / 2) + r - EPSILON;
    if (d < minDist) return true;
  }
  return false;
};

const isSupported = (placed: PlacedCable[], x: number, y: number, r: number): boolean => {
  if (y <= r + 1.0) return true; // Floor
  for (const c of placed) {
      if (c.y >= y) continue;
      const d = dist({x, y}, {x: c.x, y: c.y});
      if (d <= (c.od/2 + r) + 1.0) { 
          if (Math.abs(c.x - x) < (c.od/2 + r) * 0.9) return true;
      }
  }
  return false;
};

const determineLayer = (y: number, r: number, placed: PlacedCable[], x: number): number => {
    if (y <= r + 2.0) return 1;
    const below = placed.filter(c => Math.abs(c.x - x) < (c.od/2 + r) && c.y < y);
    if (below.length === 0) return 1; 
    return Math.max(...below.map(c => c.layer)) + 1;
};

// 중력 기반 위치 찾기 (높이 제한을 엄격하게 적용하지 않고 물리적으로 가능한 위치 탐색)
const findGravityPosition = (
  cable: CableData,
  placed: PlacedCable[],
  xMin: number,
  xMax: number
): { point: Point, layer: number } | null => {
  const r = cable.od / 2;
  const candidates: Point[] = [];

  candidates.push({ x: xMin + r, y: r });
  
  for (const c of placed) {
      candidates.push({ x: c.x + c.od/2 + r + 0.1, y: r }); 
      for (let angle = 15; angle <= 165; angle += 15) {
          const rad = (angle * Math.PI) / 180;
          const tx = c.x + Math.cos(rad) * (c.od/2 + r);
          const ty = c.y + Math.sin(rad) * (c.od/2 + r);
          candidates.push({ x: tx, y: ty });
      }
  }

  const validCandidates = candidates.filter(p => {
      if (p.x - r < xMin - 0.5 || p.x + r > xMax + 0.5) return false;
      if (p.y + r > PHYSICAL_SIM_HEIGHT_LIMIT) return false; // Hard physical limit (500mm)
      if (checkCollision(placed, p.x, p.y, r)) return false; 
      if (!isSupported(placed, p.x, p.y, r)) return false; 
      return true;
  });

  if (validCandidates.length === 0) return null;

  validCandidates.sort((a, b) => {
      const yDiff = a.y - b.y;
      if (Math.abs(yDiff) > 1.0) return yDiff; 
      return a.x - b.x; 
  });

  const best = validCandidates[0];
  const layer = determineLayer(best.y, r, placed, best.x);
  
  return { point: best, layer };
};

// Custom Sort Function: System -> OD (Desc) -> From Node
const customSortCables = (cables: CableData[]): CableData[] => {
    return [...cables].sort((a, b) => {
        // 1. System (Ascending)
        const sysA = a.system || '';
        const sysB = b.system || '';
        if (sysA !== sysB) return sysA.localeCompare(sysB);

        // 2. OD (Descending) - Large cables first is generally better for packing, 
        // but it also groups visually by size.
        if (b.od !== a.od) return b.od - a.od;

        // 3. From Node (Ascending)
        const nodeA = a.fromNode || '';
        const nodeB = b.fromNode || '';
        return nodeA.localeCompare(nodeB);
    });
};

function attemptFit(cables: CableData[], width: number): { success: boolean, placed: PlacedCable[], maxStackHeight: number } {
  // Use custom sort before packing
  const sorted = customSortCables(cables);
  let placed: PlacedCable[] = [];
  let maxStackHeight = 0;
  
  for (const cable of sorted) {
      const res = findGravityPosition(cable, placed, MARGIN_X, width - MARGIN_X);
      if (res) {
          placed.push({ ...cable, x: res.point.x, y: res.point.y, layer: res.layer });
          maxStackHeight = Math.max(maxStackHeight, res.point.y + cable.od/2);
      } else {
          return { success: false, placed, maxStackHeight };
      }
  }
  return { success: true, placed, maxStackHeight };
}

// ---- Public Solvers ----

export const solveSingleTier = (
  cables: CableData[], 
  tierIndex: number,
  maxHeightLimit: number,
  targetFillRatioPercent: number,
  fixedWidth?: number
): SingleTrayResult => {
  const totalArea = cables.reduce((acc, c) => acc + Math.PI * Math.pow(c.od/2, 2), 0);
  const totalODSum = cables.reduce((a,c) => a + c.od, 0);

  if (cables.length === 0) {
      return { tierIndex, width: 100, cables: [], success: true, fillRatio: 0, totalODSum: 0, totalCableArea: 0, maxStackHeight: 0 };
  }

  // 1. 고정 폭 시뮬레이션
  if (fixedWidth) {
      const res = attemptFit(cables, fixedWidth);
      const fill = (totalArea / (fixedWidth * maxHeightLimit)) * 100;
      return {
          tierIndex, width: fixedWidth, cables: res.placed, 
          success: res.success, fillRatio: fill, totalODSum, totalCableArea: totalArea, maxStackHeight: res.maxStackHeight
      };
  }

  // 2. 자동 최적화
  const minTheoreticalWidth = (totalArea * 100) / (maxHeightLimit * targetFillRatioPercent);
  const startWidth = Math.max(MIN_WIDTH, Math.ceil(minTheoreticalWidth / WIDTH_STEP) * WIDTH_STEP);

  for (let w = startWidth; w <= MAX_WIDTH; w += WIDTH_STEP) {
      const trayArea = w * maxHeightLimit;
      const fill = (totalArea / trayArea) * 100;
      
      const res = attemptFit(cables, w);
      
      if (res.success) {
          return {
              tierIndex, width: w, cables: res.placed, success: true, 
              fillRatio: fill, totalODSum, totalCableArea: totalArea, maxStackHeight: res.maxStackHeight
          };
      }
  }

  // 실패 시 최대 폭
  const failRes = attemptFit(cables, MAX_WIDTH);
  return {
      tierIndex, width: MAX_WIDTH, cables: failRes.placed, 
      success: failRes.success && failRes.placed.length === cables.length, 
      fillRatio: (totalArea / (MAX_WIDTH * maxHeightLimit)) * 100,
      totalODSum, totalCableArea: totalArea, maxStackHeight: failRes.maxStackHeight
  };
};

export const calculateOptimizationMatrix = (
    allCables: CableData[],
    maxHeight: number,
    targetFill: number
): MatrixCell[][] => {
    const widths = [200, 300, 400, 500, 600, 700, 800, 900];
    const tierCounts = [1, 2, 3, 4, 5, 6];
    const matrix: MatrixCell[][] = [];

    const totalCableArea = allCables.reduce((acc, c) => acc + Math.PI * Math.pow(c.od/2, 2), 0);

    // Prepare sorted buckets for matrix calculation to be consistent
    const sortedAll = customSortCables(allCables);

    for (const t of tierCounts) {
        const row: MatrixCell[] = [];
        const tierBuckets: CableData[][] = Array.from({ length: t }, () => []);
        
        // Distribution strategy: Round Robin
        sortedAll.forEach((c, i) => tierBuckets[i % t].push(c));
        
        // Find worst case tier to check validity
        const worstTierCables = tierBuckets.reduce((prev, curr) => 
            curr.reduce((a,c) => a + c.od, 0) > prev.reduce((a,c) => a + c.od, 0) ? curr : prev
        );

        for (const w of widths) {
            const area = w * maxHeight * t;
            const systemFill = (totalCableArea / area) * 100;

            const res = attemptFit(worstTierCables, w);
            
            const isOptimal = systemFill <= targetFill && res.success;

            row.push({
                tiers: t,
                width: w,
                area: area,
                fillRatio: systemFill,
                success: res.success,
                isOptimal
            });
        }
        matrix.push(row);
    }
    return matrix;
};

export const solveSystem = (
  allCables: CableData[],
  numberOfTiers: number,
  maxHeightLimit: number,
  targetFillRatioPercent: number
): SystemResult => {
  const tierBuckets: CableData[][] = Array.from({ length: numberOfTiers }, () => []);
  const sorted = customSortCables(allCables); // Apply Custom Sort
  sorted.forEach((c, i) => tierBuckets[i % numberOfTiers].push(c));

  const tierResults = tierBuckets.map((bucket, idx) => solveSingleTier(bucket, idx, maxHeightLimit, targetFillRatioPercent));
  const maxTrayWidth = Math.max(...tierResults.map(r => r.width));

  const finalTierResults = tierBuckets.map((bucket, idx) => solveSingleTier(bucket, idx, maxHeightLimit, targetFillRatioPercent, maxTrayWidth));
  const matrix = calculateOptimizationMatrix(allCables, maxHeightLimit, targetFillRatioPercent);

  return { 
      systemWidth: maxTrayWidth, 
      tiers: finalTierResults, 
      success: finalTierResults.every(r => r.success), 
      maxHeightPerTier: maxHeightLimit,
      optimizationMatrix: matrix
  };
};

export const solveSystemAtWidth = (
  allCables: CableData[],
  numberOfTiers: number,
  width: number,
  maxHeightLimit: number,
  targetFillRatioPercent: number
): SystemResult => {
  const tierBuckets: CableData[][] = Array.from({ length: numberOfTiers }, () => []);
  const sorted = customSortCables(allCables); // Apply Custom Sort
  sorted.forEach((c, i) => tierBuckets[i % numberOfTiers].push(c));

  const finalTierResults = tierBuckets.map((bucket, idx) => solveSingleTier(bucket, idx, maxHeightLimit, targetFillRatioPercent, width));
  const matrix = calculateOptimizationMatrix(allCables, maxHeightLimit, targetFillRatioPercent);

  return { 
      systemWidth: width, 
      tiers: finalTierResults, 
      success: finalTierResults.every(r => r.success), 
      maxHeightPerTier: maxHeightLimit,
      optimizationMatrix: matrix
  };
};