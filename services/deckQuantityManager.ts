/**
 * deckQuantityManager.ts
 * 데크(Deck)별 / 구역별 케이블 물량 집계 및 관리 모듈
 * 조선소 생산설계 핵심 — 데크별 케이블 수량, 길이, 무게, 트레이, 관통(Penetration) 통계
 */

import type { CableData, NodeData, CableTypeData } from '../types';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface DeckQuantity {
  deck: string;

  // 케이블 통계
  cables: {
    total: number;
    bySystem: Record<string, number>;   // POWER: 120, CONT: 80, ...
    byType: Record<string, number>;     // MY4: 50, DY2: 30, ...
  };

  // 길이 통계
  lengths: {
    total_m: number;
    bySystem: Record<string, number>;
    byType: Record<string, number>;
    avgLength_m: number;
    maxLength_m: number;
    minLength_m: number;
  };

  // 무게 통계
  weight: {
    total_kg: number;
    bySystem: Record<string, number>;
  };

  // 트레이 통계
  tray: {
    nodeCount: number;
    totalTrayLength_m: number;
    maxFillRatio: number;
    avgFillRatio: number;
    overfilledNodes: string[];     // 과적 노드 목록
  };

  // 관통 (Penetration) 통계
  penetrations: {
    count: number;                 // 이 데크를 관통하는 케이블 수
    totalCrossSection_mm2: number; // 관통 총 단면적
    cableNames: string[];
  };

  // 노드 목록
  nodes: string[];
}

export interface ZoneQuantity {
  zone: string;              // 구역 코드 (FR100-FR120 등)
  decks: string[];
  cables: number;
  length_m: number;
  weight_kg: number;
}

export interface CrossDeckCable {
  cableName: string;
  fromDeck: string;
  toDeck: string;
  length_m: number;
  system: string;
  type: string;
}

export interface DeckProgress {
  deck: string;
  totalCables: number;
  routed: number;            // 경로 계산된 케이블
  routedPercent: number;
  unrouted: number;
}

export interface BlockQuantity {
  blockName: string;          // 블록명 (구조물 기준)
  decks: string[];
  cables: number;
  length_m: number;
  weight_kg: number;
  nodes: string[];
}

export interface PenetrationData {
  fromNode: string;
  toNode: string;
  fromDeck: string;
  toDeck: string;
  cables: { name: string; od: number; crossSection: number }[];
  totalCrossSection_mm2: number;
  recommendedPenetrationSize_mm: number;   // 관통부 권장 크기
}

export interface QuantityReport {
  timestamp: string;

  // 전체 요약
  summary: {
    totalDecks: number;
    totalCables: number;
    totalLength_m: number;
    totalWeight_kg: number;
    totalNodes: number;
  };

  // 데크별 상세
  byDeck: DeckQuantity[];

  // 데크간 연결 (다른 데크를 잇는 케이블)
  crossDeckCables: CrossDeckCable[];

  // 데크별 진도 (시공 관리용)
  progress: DeckProgress[];

  // 비교 데이터 (블록별)
  byBlock: BlockQuantity[];
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

/** 조선소 표준 데크 코드 */
export const DECK_NAMES: Record<string, string> = {
  'TW': 'Tween Deck',
  'SF': 'Second Floor / Safety Deck',
  'PR': 'Promenade Deck',
  'PA': 'Poop Deck / Aft',
  'UD': 'Upper Deck',
  'WH': 'Wheelhouse',
  'FP': 'Forecastle / Fore Peak',
  'AP': 'Aft Peak',
  'ER': 'Engine Room',
  'BD': 'Bridge Deck',
  'MD': 'Main Deck',
  'TD': 'Tank Top / Double Bottom',
  'FD': 'Freeboard Deck',
};

/** 과적 기준 Fill Ratio (%) */
const OVERFILL_THRESHOLD = 0.45; // 45%

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * 노드에서 데크 코드 추출.
 * node.deck 필드가 있으면 그대로 사용, 없으면 이름 앞 2글자로 추정.
 */
function extractDeck(node: NodeData): string {
  if (node.deck) return node.deck;
  // 노드 이름 패턴: TW181A → TW, SF99S → SF, PR130 → PR
  const match = node.name.match(/^([A-Z]{2})/);
  return match ? match[1] : 'UNKNOWN';
}

/** 경로 문자열 → 노드 이름 배열 */
function parsePath(path: string): string[] {
  return path.split(/[,→>]/).map(n => n.trim()).filter(Boolean);
}

/** 케이블 경로에서 통과하는 데크 목록 계산 */
function mapCableToDeck(cable: CableData, nodeMap: Map<string, NodeData>): string[] {
  const path = cable.calculatedPath || cable.path || '';
  if (!path) return [];
  const nodeNames = parsePath(path);
  const decks = new Set<string>();
  nodeNames.forEach(name => {
    const node = nodeMap.get(name);
    if (node) decks.add(extractDeck(node));
  });
  return Array.from(decks);
}

/** 케이블 경로를 따라 연속 노드 쌍 중 데크가 바뀌는 지점 찾기 */
function findDeckTransitions(
  cable: CableData,
  nodeMap: Map<string, NodeData>
): { fromNode: string; toNode: string; fromDeck: string; toDeck: string }[] {
  const path = cable.calculatedPath || cable.path || '';
  if (!path) return [];
  const nodeNames = parsePath(path);
  const transitions: { fromNode: string; toNode: string; fromDeck: string; toDeck: string }[] = [];

  for (let i = 0; i < nodeNames.length - 1; i++) {
    const nodeA = nodeMap.get(nodeNames[i]);
    const nodeB = nodeMap.get(nodeNames[i + 1]);
    if (!nodeA || !nodeB) continue;
    const deckA = extractDeck(nodeA);
    const deckB = extractDeck(nodeB);
    if (deckA !== deckB) {
      transitions.push({
        fromNode: nodeNames[i],
        toNode: nodeNames[i + 1],
        fromDeck: deckA,
        toDeck: deckB,
      });
    }
  }
  return transitions;
}

/** 케이블 유효 길이 (m) — calculatedLength > length > 0 */
function getCableLength(cable: CableData): number {
  return cable.calculatedLength ?? cable.length ?? 0;
}

/** 케이블 단면적 (mm²) — od 기반 원형 가정 */
function getCrossSectionFromOD(od: number): number {
  return Math.PI * (od / 2) ** 2;
}

/** 관통부 권장 크기 (mm) — 총 단면적 기반, 여유 1.5배 후 원 지름 환산 */
function recommendPenetrationSize(totalCrossSection_mm2: number): number {
  const areaWithMargin = totalCrossSection_mm2 * 1.5;
  const diameter = 2 * Math.sqrt(areaWithMargin / Math.PI);
  return Math.ceil(diameter);
}

/** Record에 값 누적 */
function accum(rec: Record<string, number>, key: string, value: number): void {
  rec[key] = (rec[key] || 0) + value;
}

/** 노드 목록에서 트레이 총 길이 추정 (연결 기반) */
function estimateTrayLength(deckNodes: NodeData[]): number {
  let total = 0;
  for (const node of deckNodes) {
    if (node.connections) {
      for (const conn of node.connections) {
        total += conn.length;
      }
    }
    if (node.linkLength) {
      total += node.linkLength;
    }
  }
  // 양방향 중복 제거용 / 2 (connections가 양방향이면)
  return total / 2 || total;
}

// ─────────────────────────────────────────────────────────────
// Cable Type DB helpers
// ─────────────────────────────────────────────────────────────

function buildCableTypeMap(cableTypeDB?: CableTypeData[]): Map<string, CableTypeData> {
  const map = new Map<string, CableTypeData>();
  if (!cableTypeDB) return map;
  for (const ct of cableTypeDB) {
    map.set(ct.cableType, ct);
  }
  return map;
}

function getWeightPerKm(
  cable: CableData,
  cableTypeMap: Map<string, CableTypeData>,
  weightPerKmByType?: Record<string, number>
): number {
  // 우선순위: 옵션 맵 → cableTypeDB → cable.cableWeight → 0
  if (weightPerKmByType && weightPerKmByType[cable.type] !== undefined) {
    return weightPerKmByType[cable.type];
  }
  const ct = cableTypeMap.get(cable.type);
  if (ct) return ct.weight; // kg/km
  return cable.cableWeight ?? 0;
}

function getCrossSection(
  cable: CableData,
  cableTypeMap: Map<string, CableTypeData>
): number {
  const ct = cableTypeMap.get(cable.type);
  if (ct) return ct.crossSection;
  return getCrossSectionFromOD(cable.od);
}

// ─────────────────────────────────────────────────────────────
// Penetration Calculation
// ─────────────────────────────────────────────────────────────

function calculatePenetrations(
  cables: CableData[],
  nodeMap: Map<string, NodeData>,
  cableTypeMap: Map<string, CableTypeData>
): PenetrationData[] {
  // 관통 지점 키: "fromNode→toNode" (정렬해서 중복 방지)
  const penMap = new Map<string, PenetrationData>();

  for (const cable of cables) {
    const transitions = findDeckTransitions(cable, nodeMap);
    for (const t of transitions) {
      const key = [t.fromNode, t.toNode].sort().join('→');
      const cs = getCrossSection(cable, cableTypeMap);

      if (!penMap.has(key)) {
        penMap.set(key, {
          fromNode: t.fromNode,
          toNode: t.toNode,
          fromDeck: t.fromDeck,
          toDeck: t.toDeck,
          cables: [],
          totalCrossSection_mm2: 0,
          recommendedPenetrationSize_mm: 0,
        });
      }

      const pen = penMap.get(key)!;
      pen.cables.push({ name: cable.name, od: cable.od, crossSection: cs });
      pen.totalCrossSection_mm2 += cs;
    }
  }

  // 권장 크기 계산
  for (const pen of penMap.values()) {
    pen.recommendedPenetrationSize_mm = recommendPenetrationSize(pen.totalCrossSection_mm2);
  }

  return Array.from(penMap.values());
}

// ─────────────────────────────────────────────────────────────
// Main: calculateDeckQuantities
// ─────────────────────────────────────────────────────────────

export function calculateDeckQuantities(
  cables: CableData[],
  nodes: NodeData[],
  options?: {
    cableTypeDB?: CableTypeData[];
    weightPerKmByType?: Record<string, number>;
    includePenetrations?: boolean;
    includeProgress?: boolean;
  }
): QuantityReport {
  const cableTypeMap = buildCableTypeMap(options?.cableTypeDB);
  const nodeMap = new Map<string, NodeData>();
  for (const node of nodes) nodeMap.set(node.name, node);

  // ── 1. 노드를 데크별로 그룹화 ──
  const deckNodeMap = new Map<string, NodeData[]>();
  for (const node of nodes) {
    const deck = extractDeck(node);
    if (!deckNodeMap.has(deck)) deckNodeMap.set(deck, []);
    deckNodeMap.get(deck)!.push(node);
  }

  // ── 2. 케이블 → 데크 매핑 ──
  const cableDeckMap = new Map<string, string[]>(); // cableName → decks
  for (const cable of cables) {
    cableDeckMap.set(cable.name, mapCableToDeck(cable, nodeMap));
  }

  // ── 3. 데크별 통계 빌드 ──
  const deckQuantities = new Map<string, DeckQuantity>();

  // 초기화: 모든 데크
  for (const deck of deckNodeMap.keys()) {
    const deckNodes = deckNodeMap.get(deck)!;
    deckQuantities.set(deck, {
      deck,
      cables: { total: 0, bySystem: {}, byType: {} },
      lengths: { total_m: 0, bySystem: {}, byType: {}, avgLength_m: 0, maxLength_m: 0, minLength_m: Infinity },
      weight: { total_kg: 0, bySystem: {} },
      tray: {
        nodeCount: deckNodes.length,
        totalTrayLength_m: estimateTrayLength(deckNodes),
        maxFillRatio: 0,
        avgFillRatio: 0,
        overfilledNodes: [],
      },
      penetrations: { count: 0, totalCrossSection_mm2: 0, cableNames: [] },
      nodes: deckNodes.map(n => n.name),
    });
  }

  // 케이블 순회 — 각 케이블이 속한 모든 데크에 집계
  for (const cable of cables) {
    const decks = cableDeckMap.get(cable.name) || [];
    const len = getCableLength(cable);
    const system = cable.system || 'UNKNOWN';
    const type = cable.type || 'UNKNOWN';
    const wPerKm = getWeightPerKm(cable, cableTypeMap, options?.weightPerKmByType);
    const weight = (len / 1000) * wPerKm; // kg

    // 다중 데크인 경우 길이/무게를 데크 수로 균등 분배
    const deckCount = decks.length || 1;
    const lenPerDeck = len / deckCount;
    const weightPerDeck = weight / deckCount;

    for (const deck of decks) {
      if (!deckQuantities.has(deck)) {
        // 노드는 없지만 케이블 경로에 등장한 데크 (edge case)
        deckQuantities.set(deck, {
          deck,
          cables: { total: 0, bySystem: {}, byType: {} },
          lengths: { total_m: 0, bySystem: {}, byType: {}, avgLength_m: 0, maxLength_m: 0, minLength_m: Infinity },
          weight: { total_kg: 0, bySystem: {} },
          tray: { nodeCount: 0, totalTrayLength_m: 0, maxFillRatio: 0, avgFillRatio: 0, overfilledNodes: [] },
          penetrations: { count: 0, totalCrossSection_mm2: 0, cableNames: [] },
          nodes: [],
        });
      }

      const dq = deckQuantities.get(deck)!;
      dq.cables.total += 1;
      accum(dq.cables.bySystem, system, 1);
      accum(dq.cables.byType, type, 1);

      dq.lengths.total_m += lenPerDeck;
      accum(dq.lengths.bySystem, system, lenPerDeck);
      accum(dq.lengths.byType, type, lenPerDeck);
      if (len > dq.lengths.maxLength_m) dq.lengths.maxLength_m = len;
      if (len > 0 && len < dq.lengths.minLength_m) dq.lengths.minLength_m = len;

      dq.weight.total_kg += weightPerDeck;
      accum(dq.weight.bySystem, system, weightPerDeck);
    }
  }

  // 평균 길이 계산 & minLength 보정
  for (const dq of deckQuantities.values()) {
    dq.lengths.avgLength_m = dq.cables.total > 0 ? dq.lengths.total_m / dq.cables.total : 0;
    if (dq.lengths.minLength_m === Infinity) dq.lengths.minLength_m = 0;
  }

  // ── 4. 트레이 Fill Ratio 계산 (노드별 케이블 수 기반) ──
  // 각 노드를 통과하는 케이블 OD 합산 → fill ratio 추정
  const nodeCableArea = new Map<string, number>(); // nodeName → 총 단면적
  const nodeCableCount = new Map<string, number>();

  for (const cable of cables) {
    const path = cable.calculatedPath || cable.path || '';
    if (!path) continue;
    const nodeNames = parsePath(path);
    const cs = getCrossSection(cable, cableTypeMap);
    for (const nn of nodeNames) {
      nodeCableArea.set(nn, (nodeCableArea.get(nn) || 0) + cs);
      nodeCableCount.set(nn, (nodeCableCount.get(nn) || 0) + 1);
    }
  }

  for (const dq of deckQuantities.values()) {
    let maxFill = 0;
    let sumFill = 0;
    let fillCount = 0;

    for (const nn of dq.nodes) {
      const node = nodeMap.get(nn);
      if (!node || !node.areaSize) continue;
      const area = nodeCableArea.get(nn) || 0;
      const ratio = node.areaSize > 0 ? area / node.areaSize : 0;
      if (ratio > maxFill) maxFill = ratio;
      sumFill += ratio;
      fillCount++;
      if (ratio > OVERFILL_THRESHOLD) {
        dq.tray.overfilledNodes.push(nn);
      }
    }

    dq.tray.maxFillRatio = maxFill;
    dq.tray.avgFillRatio = fillCount > 0 ? sumFill / fillCount : 0;
  }

  // ── 5. 관통 (Penetration) ──
  const allPenetrations = (options?.includePenetrations !== false)
    ? calculatePenetrations(cables, nodeMap, cableTypeMap)
    : [];

  // 관통을 데크별로 할당
  for (const pen of allPenetrations) {
    for (const deckCode of [pen.fromDeck, pen.toDeck]) {
      const dq = deckQuantities.get(deckCode);
      if (!dq) continue;
      const cableNamesInPen = pen.cables.map(c => c.name);
      dq.penetrations.count += pen.cables.length;
      dq.penetrations.totalCrossSection_mm2 += pen.totalCrossSection_mm2;
      dq.penetrations.cableNames.push(...cableNamesInPen);
    }
  }
  // 중복 제거
  for (const dq of deckQuantities.values()) {
    dq.penetrations.cableNames = [...new Set(dq.penetrations.cableNames)];
  }

  // ── 6. Cross-Deck Cables ──
  const crossDeckCables: CrossDeckCable[] = [];
  for (const cable of cables) {
    const decks = cableDeckMap.get(cable.name) || [];
    if (decks.length >= 2) {
      crossDeckCables.push({
        cableName: cable.name,
        fromDeck: decks[0],
        toDeck: decks[decks.length - 1],
        length_m: getCableLength(cable),
        system: cable.system || 'UNKNOWN',
        type: cable.type || 'UNKNOWN',
      });
    }
  }

  // ── 7. Progress ──
  const progress: DeckProgress[] = [];
  if (options?.includeProgress !== false) {
    for (const dq of deckQuantities.values()) {
      let routed = 0;
      let total = 0;
      for (const cable of cables) {
        const decks = cableDeckMap.get(cable.name) || [];
        if (!decks.includes(dq.deck)) continue;
        total++;
        if (cable.calculatedPath) routed++;
      }
      progress.push({
        deck: dq.deck,
        totalCables: total,
        routed,
        routedPercent: total > 0 ? Math.round((routed / total) * 10000) / 100 : 0,
        unrouted: total - routed,
      });
    }
  }

  // ── 8. Block Quantity (블록 = 데크 그룹, structure 기반) ──
  const blockMap = new Map<string, { decks: Set<string>; cables: Set<string>; length: number; weight: number; nodes: Set<string> }>();
  for (const node of nodes) {
    const block = node.structure || 'UNKNOWN';
    if (!blockMap.has(block)) {
      blockMap.set(block, { decks: new Set(), cables: new Set(), length: 0, weight: 0, nodes: new Set() });
    }
    const b = blockMap.get(block)!;
    b.decks.add(extractDeck(node));
    b.nodes.add(node.name);
  }
  // 케이블을 블록에 매핑 (fromNode/toNode의 블록)
  for (const cable of cables) {
    const path = cable.calculatedPath || cable.path || '';
    const nodeNames = path ? parsePath(path) : [];
    const blocks = new Set<string>();
    for (const nn of nodeNames) {
      const node = nodeMap.get(nn);
      if (node) blocks.add(node.structure || 'UNKNOWN');
    }
    const len = getCableLength(cable);
    const wPerKm = getWeightPerKm(cable, cableTypeMap, options?.weightPerKmByType);
    const w = (len / 1000) * wPerKm;
    const blockCount = blocks.size || 1;

    for (const block of blocks) {
      if (!blockMap.has(block)) {
        blockMap.set(block, { decks: new Set(), cables: new Set(), length: 0, weight: 0, nodes: new Set() });
      }
      const b = blockMap.get(block)!;
      b.cables.add(cable.name);
      b.length += len / blockCount;
      b.weight += w / blockCount;
    }
  }

  const byBlock: BlockQuantity[] = Array.from(blockMap.entries()).map(([blockName, b]) => ({
    blockName,
    decks: Array.from(b.decks),
    cables: b.cables.size,
    length_m: Math.round(b.length * 100) / 100,
    weight_kg: Math.round(b.weight * 100) / 100,
    nodes: Array.from(b.nodes),
  }));

  // ── 9. Summary ──
  const byDeck = Array.from(deckQuantities.values());
  const totalLength = byDeck.reduce((s, d) => s + d.lengths.total_m, 0);
  const totalWeight = byDeck.reduce((s, d) => s + d.weight.total_kg, 0);

  return {
    timestamp: new Date().toISOString(),
    summary: {
      totalDecks: byDeck.length,
      totalCables: cables.length,
      totalLength_m: Math.round(totalLength * 100) / 100,
      totalWeight_kg: Math.round(totalWeight * 100) / 100,
      totalNodes: nodes.length,
    },
    byDeck,
    crossDeckCables,
    progress,
    byBlock,
  };
}

// ─────────────────────────────────────────────────────────────
// getDeckComparisonMatrix
// ─────────────────────────────────────────────────────────────

/**
 * 데크간 비교 매트릭스: [fromDeck][toDeck] = 연결 케이블 수
 */
export function getDeckComparisonMatrix(report: QuantityReport): {
  decks: string[];
  matrix: number[][];
} {
  const deckSet = new Set<string>();
  for (const cc of report.crossDeckCables) {
    deckSet.add(cc.fromDeck);
    deckSet.add(cc.toDeck);
  }
  const decks = Array.from(deckSet).sort();
  const idx = new Map<string, number>();
  decks.forEach((d, i) => idx.set(d, i));

  const n = decks.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (const cc of report.crossDeckCables) {
    const fi = idx.get(cc.fromDeck);
    const ti = idx.get(cc.toDeck);
    if (fi !== undefined && ti !== undefined) {
      matrix[fi][ti]++;
      matrix[ti][fi]++; // 양방향
    }
  }

  return { decks, matrix };
}

// ─────────────────────────────────────────────────────────────
// getDeckTraySummary
// ─────────────────────────────────────────────────────────────

/**
 * 데크별 트레이 요약 — 노드별 케이블 수, 점유율, 권장 폭
 */
export function getDeckTraySummary(
  deck: string,
  cables: CableData[],
  nodes: NodeData[],
  cableTypeDB?: CableTypeData[]
): {
  nodes: { name: string; cableCount: number; fillRatio: number; recommendedWidth: number }[];
  totalTrayLength_m: number;
} {
  const cableTypeMap = buildCableTypeMap(cableTypeDB);
  const nodeMap = new Map<string, NodeData>();
  for (const n of nodes) nodeMap.set(n.name, n);

  // 대상 데크의 노드만 필터
  const deckNodes = nodes.filter(n => extractDeck(n) === deck);

  // 노드별 케이블 OD 합산
  const nodeStats = new Map<string, { count: number; totalArea: number; totalOD: number }>();
  for (const n of deckNodes) {
    nodeStats.set(n.name, { count: 0, totalArea: 0, totalOD: 0 });
  }

  for (const cable of cables) {
    const path = cable.calculatedPath || cable.path || '';
    if (!path) continue;
    const pathNodes = parsePath(path);
    const cs = getCrossSection(cable, cableTypeMap);
    for (const nn of pathNodes) {
      const stat = nodeStats.get(nn);
      if (stat) {
        stat.count++;
        stat.totalArea += cs;
        stat.totalOD += cable.od;
      }
    }
  }

  const result: { name: string; cableCount: number; fillRatio: number; recommendedWidth: number }[] = [];

  for (const n of deckNodes) {
    const stat = nodeStats.get(n.name);
    if (!stat) continue;
    const fillRatio = n.areaSize && n.areaSize > 0 ? stat.totalArea / n.areaSize : 0;
    // 권장 폭: OD 합 + 여유 20%
    const recommendedWidth = Math.ceil(stat.totalOD * 1.2);
    result.push({
      name: n.name,
      cableCount: stat.count,
      fillRatio: Math.round(fillRatio * 10000) / 10000,
      recommendedWidth,
    });
  }

  // 정렬: 케이블 많은 순
  result.sort((a, b) => b.cableCount - a.cableCount);

  return {
    nodes: result,
    totalTrayLength_m: estimateTrayLength(deckNodes),
  };
}
