/**
 * BOM (Bill of Materials) 자동 생성 강화 모듈
 * 케이블 타입별 / 시스템별 / 데크별 BOM + 글랜드 + 트레이 + 발주 수량 산출
 */

import type { CableData, NodeData, CableTypeData } from '../types';

// ─── BOM Entry Types ────────────────────────────────────────────────

export interface BOMEntry {
  cableType: string;
  cableCode: string;
  description: string;
  count: number;
  totalLength_m: number;
  avgLength_m: number;
  minLength_m: number;
  maxLength_m: number;
  weight_kg_km: number;
  totalWeight_kg: number;
  unitPrice?: number;
  totalPrice?: number;
  odMM: number;
  crossSection?: number;
  system: string;
}

export interface BOMByDeck {
  deck: string;
  entries: BOMEntry[];
  totalCables: number;
  totalLength_m: number;
  totalWeight_kg: number;
}

export interface BOMBySystem {
  system: string;
  entries: BOMEntry[];
  totalCables: number;
  totalLength_m: number;
}

export interface TrayBOM {
  nodeName: string;
  recommendedWidth_mm: number;
  cableCount: number;
  fillRatio_percent: number;
  totalCrossSection_mm2: number;
}

export interface GlandBOMEntry {
  glandSize: string;
  cableODRange: string;
  count: number;
  cableTypes: string[];
}

export interface ProcurementEntry {
  itemCode: string;
  description: string;
  unit: string;
  quantity: number;
  margin_percent: number;
  orderQuantity: number;
}

export interface BOMReport {
  timestamp: string;
  projectName?: string;
  vesselNo?: string;

  summary: {
    totalCables: number;
    totalLength_m: number;
    totalWeight_kg: number;
    totalCost?: number;
    uniqueTypes: number;
    uniqueSystems: number;
  };

  byType: BOMEntry[];
  bySystem: BOMBySystem[];
  byDeck: BOMByDeck[];
  trayBOM: TrayBOM[];
  glandBOM: GlandBOMEntry[];
  procurement: ProcurementEntry[];
}

// ─── Constants ──────────────────────────────────────────────────────

const GLAND_SIZE_TABLE = [
  { minOD: 3, maxOD: 6.5, size: 'M12', thread: 'M12x1.5' },
  { minOD: 4, maxOD: 8, size: 'M16', thread: 'M16x1.5' },
  { minOD: 5, maxOD: 10, size: 'M20', thread: 'M20x1.5' },
  { minOD: 8, maxOD: 14, size: 'M25', thread: 'M25x1.5' },
  { minOD: 11, maxOD: 18, size: 'M32', thread: 'M32x1.5' },
  { minOD: 15, maxOD: 22, size: 'M40', thread: 'M40x1.5' },
  { minOD: 18, maxOD: 25, size: 'M50', thread: 'M50x1.5' },
  { minOD: 22, maxOD: 32, size: 'M63', thread: 'M63x1.5' },
  { minOD: 28, maxOD: 38, size: 'M75', thread: 'M75x1.5' },
] as const;

const STANDARD_TRAY_WIDTHS = [100, 150, 200, 300, 400, 500, 600, 800, 1000];

const DEFAULT_DRUM_LENGTHS = [100, 200, 500, 1000];

// ─── Helpers ────────────────────────────────────────────────────────

function cableLength(c: CableData): number {
  return c.calculatedLength ?? c.length ?? 0;
}

function cableCrossSection(c: CableData, typeDB?: CableTypeData[]): number {
  if (typeDB) {
    const entry = typeDB.find(t => t.cableType === c.type);
    if (entry) return entry.crossSection;
  }
  const r = (c.od || 0) / 2;
  return Math.PI * r * r;
}

function cableWeightPerKm(c: CableData, typeDB?: CableTypeData[]): number {
  if (typeDB) {
    const entry = typeDB.find(t => t.cableType === c.type);
    if (entry) return entry.weight;
  }
  return c.porWeight ? (c.porWeight / Math.max(cableLength(c), 1)) * 1000 : 0;
}

function cableDescription(c: CableData, typeDB?: CableTypeData[]): string {
  if (typeDB) {
    const entry = typeDB.find(t => t.cableType === c.type);
    if (entry?.description) return entry.description;
  }
  return c.type || '';
}

function lookupGlandSize(od: number): { size: string; range: string } | null {
  for (const g of GLAND_SIZE_TABLE) {
    if (od >= g.minOD && od <= g.maxOD) {
      return { size: g.size, range: `${g.minOD}-${g.maxOD}mm` };
    }
  }
  return null;
}

function recommendTrayWidth(totalCrossSection: number, fillTarget = 0.4): number {
  const requiredWidth = totalCrossSection / fillTarget;
  for (const w of STANDARD_TRAY_WIDTHS) {
    if (w >= requiredWidth) return w;
  }
  return STANDARD_TRAY_WIDTHS[STANDARD_TRAY_WIDTHS.length - 1];
}

/** 드럼 단위 올림: 가장 작은 드럼 길이의 배수로 올림 */
function roundUpToDrum(length: number, drumLengths: number[]): number {
  const sorted = [...drumLengths].sort((a, b) => a - b);
  // 가장 효율적인 드럼 조합 — 단순화: 가장 작은 드럼 단위로 올림
  const unit = sorted[0] || 100;
  return Math.ceil(length / unit) * unit;
}

function parsePathNodes(cable: CableData): string[] {
  const raw = cable.calculatedPath || cable.path || '';
  if (!raw) return [];
  return raw.split(/[→\->,;\s]+/).map(s => s.trim()).filter(Boolean);
}

// ─── Core Aggregation ───────────────────────────────────────────────

interface CableGroup {
  type: string;
  system: string;
  cables: CableData[];
}

function groupCables(cables: CableData[]): CableGroup[] {
  const map = new Map<string, CableData[]>();
  for (const c of cables) {
    const key = `${c.type || 'N/A'}||${c.system || 'N/A'}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }
  const groups: CableGroup[] = [];
  for (const [key, list] of map) {
    const [type, system] = key.split('||');
    groups.push({ type, system, cables: list });
  }
  return groups;
}

function buildBOMEntry(group: CableGroup, typeDB?: CableTypeData[]): BOMEntry {
  const lengths = group.cables.map(cableLength);
  const totalLen = lengths.reduce((a, b) => a + b, 0);
  const wPerKm = cableWeightPerKm(group.cables[0], typeDB);
  const od = group.cables[0].od || 0;
  const cs = cableCrossSection(group.cables[0], typeDB);
  const desc = cableDescription(group.cables[0], typeDB);

  return {
    cableType: group.type,
    cableCode: group.type,
    description: desc,
    count: group.cables.length,
    totalLength_m: totalLen,
    avgLength_m: group.cables.length > 0 ? totalLen / group.cables.length : 0,
    minLength_m: lengths.length > 0 ? Math.min(...lengths) : 0,
    maxLength_m: lengths.length > 0 ? Math.max(...lengths) : 0,
    weight_kg_km: wPerKm,
    totalWeight_kg: (totalLen / 1000) * wPerKm,
    odMM: od,
    crossSection: cs,
    system: group.system,
  };
}

// ─── byType ─────────────────────────────────────────────────────────

function buildByType(cables: CableData[], typeDB?: CableTypeData[]): BOMEntry[] {
  // 타입별로만 그룹핑 (시스템 무관)
  const map = new Map<string, CableData[]>();
  for (const c of cables) {
    const t = c.type || 'N/A';
    if (!map.has(t)) map.set(t, []);
    map.get(t)!.push(c);
  }
  const entries: BOMEntry[] = [];
  for (const [type, list] of map) {
    const systems = Array.from(new Set(list.map(c => c.system || 'N/A')));
    const group: CableGroup = { type, system: systems.join(', '), cables: list };
    entries.push(buildBOMEntry(group, typeDB));
  }
  return entries.sort((a, b) => a.cableType.localeCompare(b.cableType));
}

// ─── bySystem ───────────────────────────────────────────────────────

function buildBySystem(cables: CableData[], typeDB?: CableTypeData[]): BOMBySystem[] {
  const sysMap = new Map<string, CableData[]>();
  for (const c of cables) {
    const s = c.system || 'N/A';
    if (!sysMap.has(s)) sysMap.set(s, []);
    sysMap.get(s)!.push(c);
  }

  const result: BOMBySystem[] = [];
  for (const [system, list] of sysMap) {
    const groups = groupCables(list);
    const entries = groups.map(g => buildBOMEntry(g, typeDB));
    result.push({
      system,
      entries,
      totalCables: list.length,
      totalLength_m: entries.reduce((s, e) => s + e.totalLength_m, 0),
    });
  }
  return result.sort((a, b) => a.system.localeCompare(b.system));
}

// ─── byDeck ─────────────────────────────────────────────────────────

function buildByDeck(
  cables: CableData[],
  nodes: NodeData[],
  typeDB?: CableTypeData[],
): BOMByDeck[] {
  const nodeMap = new Map<string, NodeData>();
  for (const n of nodes) nodeMap.set(n.name, n);

  // deck -> cable set (중복 방지용 id)
  const deckCables = new Map<string, Set<string>>();
  // deck -> cable data ref
  const deckCableList = new Map<string, CableData[]>();

  for (const c of cables) {
    const pathNodes = parsePathNodes(c);
    const visitedDecks = new Set<string>();

    for (const nodeName of pathNodes) {
      const nd = nodeMap.get(nodeName);
      const deck = nd?.deck || 'Unknown';
      visitedDecks.add(deck);
    }

    // 시작/끝 노드에서도 데크 파악
    if (c.fromNode) {
      const nd = nodeMap.get(c.fromNode);
      if (nd?.deck) visitedDecks.add(nd.deck);
    }
    if (c.toNode) {
      const nd = nodeMap.get(c.toNode);
      if (nd?.deck) visitedDecks.add(nd.deck);
    }

    if (visitedDecks.size === 0) visitedDecks.add('Unknown');

    for (const deck of visitedDecks) {
      if (!deckCables.has(deck)) {
        deckCables.set(deck, new Set());
        deckCableList.set(deck, []);
      }
      if (!deckCables.get(deck)!.has(c.id)) {
        deckCables.get(deck)!.add(c.id);
        deckCableList.get(deck)!.push(c);
      }
    }
  }

  const result: BOMByDeck[] = [];
  for (const [deck, list] of deckCableList) {
    const groups = groupCables(list);
    const entries = groups.map(g => buildBOMEntry(g, typeDB));
    const totalLen = entries.reduce((s, e) => s + e.totalLength_m, 0);
    const totalWgt = entries.reduce((s, e) => s + e.totalWeight_kg, 0);
    result.push({
      deck,
      entries,
      totalCables: list.length,
      totalLength_m: totalLen,
      totalWeight_kg: totalWgt,
    });
  }

  return result.sort((a, b) => a.deck.localeCompare(b.deck));
}

// ─── Tray BOM ───────────────────────────────────────────────────────

function buildTrayBOM(
  cables: CableData[],
  nodes: NodeData[],
  typeDB?: CableTypeData[],
): TrayBOM[] {
  // 노드별 통과 케이블 집계
  const nodeTraffic = new Map<string, CableData[]>();

  for (const c of cables) {
    const pathNodes = parsePathNodes(c);
    for (const nodeName of pathNodes) {
      if (!nodeTraffic.has(nodeName)) nodeTraffic.set(nodeName, []);
      nodeTraffic.get(nodeName)!.push(c);
    }
  }

  const result: TrayBOM[] = [];
  for (const [nodeName, cList] of nodeTraffic) {
    const totalCS = cList.reduce((sum, c) => sum + cableCrossSection(c, typeDB), 0);
    const recWidth = recommendTrayWidth(totalCS);
    const trayArea = recWidth * 1; // 단면적 기준 (높이 1mm 가정, fillRatio로 보정)
    const fillRatio = trayArea > 0 ? (totalCS / trayArea) * 100 : 0;

    result.push({
      nodeName,
      recommendedWidth_mm: recWidth,
      cableCount: cList.length,
      fillRatio_percent: Math.round(fillRatio * 10) / 10,
      totalCrossSection_mm2: Math.round(totalCS * 100) / 100,
    });
  }

  return result.sort((a, b) => a.nodeName.localeCompare(b.nodeName));
}

// ─── Gland BOM ──────────────────────────────────────────────────────

function buildGlandBOM(cables: CableData[]): GlandBOMEntry[] {
  // 각 케이블 양 끝에 글랜드 2개
  const glandMap = new Map<string, { count: number; range: string; types: Set<string> }>();

  for (const c of cables) {
    const od = c.od || 0;
    if (od <= 0) continue;

    const gland = lookupGlandSize(od);
    if (!gland) continue;

    if (!glandMap.has(gland.size)) {
      glandMap.set(gland.size, { count: 0, range: gland.range, types: new Set() });
    }
    const entry = glandMap.get(gland.size)!;
    entry.count += 2; // 양 끝
    entry.types.add(c.type || 'N/A');
  }

  const result: GlandBOMEntry[] = [];
  for (const [size, data] of glandMap) {
    result.push({
      glandSize: size,
      cableODRange: data.range,
      count: data.count,
      cableTypes: Array.from(data.types).sort(),
    });
  }

  return result.sort((a, b) => a.glandSize.localeCompare(b.glandSize));
}

// ─── Procurement ────────────────────────────────────────────────────

function buildProcurement(
  byType: BOMEntry[],
  glandBOM: GlandBOMEntry[],
  trayBOM: TrayBOM[],
  marginPercent: number,
  drumLengths: number[],
): ProcurementEntry[] {
  const entries: ProcurementEntry[] = [];

  // 1. 케이블 발주
  for (const bom of byType) {
    const rawQty = bom.totalLength_m * (1 + marginPercent / 100);
    const orderQty = roundUpToDrum(rawQty, drumLengths);
    entries.push({
      itemCode: `CBL-${bom.cableType}`,
      description: `${bom.cableType} (${bom.description})`,
      unit: 'm',
      quantity: Math.round(bom.totalLength_m * 100) / 100,
      margin_percent: marginPercent,
      orderQuantity: orderQty,
    });
  }

  // 2. 글랜드 발주
  const glandMargin = 5; // 글랜드 여유 5%
  for (const g of glandBOM) {
    const orderQty = Math.ceil(g.count * (1 + glandMargin / 100));
    entries.push({
      itemCode: `GLD-${g.glandSize}`,
      description: `Cable Gland ${g.glandSize} (${g.cableODRange})`,
      unit: 'ea',
      quantity: g.count,
      margin_percent: glandMargin,
      orderQuantity: orderQty,
    });
  }

  // 3. 트레이 발주 (노드간 구간별 → 여기서는 폭별 집계)
  const trayWidthMap = new Map<number, number>(); // width -> count
  for (const t of trayBOM) {
    const w = t.recommendedWidth_mm;
    trayWidthMap.set(w, (trayWidthMap.get(w) || 0) + 1);
  }
  for (const [width, count] of trayWidthMap) {
    const orderQty = Math.ceil(count * (1 + marginPercent / 100));
    entries.push({
      itemCode: `TRAY-${width}`,
      description: `Cable Tray ${width}mm width`,
      unit: 'ea',
      quantity: count,
      margin_percent: marginPercent,
      orderQuantity: orderQty,
    });
  }

  return entries;
}

// ─── Main Function ──────────────────────────────────────────────────

export function generateBOM(
  cables: CableData[],
  nodes: NodeData[],
  options?: {
    cableTypeDB?: CableTypeData[];
    marginPercent?: number;
    includeGlands?: boolean;
    includeTray?: boolean;
    drumLengths?: number[];
  },
): BOMReport {
  const typeDB = options?.cableTypeDB;
  const marginPercent = options?.marginPercent ?? 10;
  const includeGlands = options?.includeGlands ?? true;
  const includeTray = options?.includeTray ?? true;
  const drumLengths = options?.drumLengths ?? DEFAULT_DRUM_LENGTHS;

  // 메인 BOM (타입별)
  const byType = buildByType(cables, typeDB);

  // 시스템별
  const bySystem = buildBySystem(cables, typeDB);

  // 데크별
  const byDeck = buildByDeck(cables, nodes, typeDB);

  // 트레이 BOM
  const trayBOM = includeTray ? buildTrayBOM(cables, nodes, typeDB) : [];

  // 글랜드 BOM
  const glandBOM = includeGlands ? buildGlandBOM(cables) : [];

  // 발주 수량
  const procurement = buildProcurement(byType, glandBOM, trayBOM, marginPercent, drumLengths);

  // 전체 요약
  const totalLength = byType.reduce((s, e) => s + e.totalLength_m, 0);
  const totalWeight = byType.reduce((s, e) => s + e.totalWeight_kg, 0);
  const totalCost = byType.reduce((s, e) => s + (e.totalPrice ?? 0), 0);
  const uniqueTypes = new Set(cables.map(c => c.type).filter(Boolean)).size;
  const uniqueSystems = new Set(cables.map(c => c.system).filter(Boolean)).size;

  return {
    timestamp: new Date().toISOString(),
    summary: {
      totalCables: cables.length,
      totalLength_m: Math.round(totalLength * 100) / 100,
      totalWeight_kg: Math.round(totalWeight * 100) / 100,
      totalCost: totalCost > 0 ? Math.round(totalCost * 100) / 100 : undefined,
      uniqueTypes,
      uniqueSystems,
    },
    byType,
    bySystem,
    byDeck,
    trayBOM,
    glandBOM,
    procurement,
  };
}
