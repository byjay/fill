import React, { useState, useMemo } from 'react';
import { CableData, NodeData, CableTypeData } from '../types';
import { FileText, Layers, Download, Table2, Cpu, Info, Tag, Building2, Circle } from 'lucide-react';

interface Props {
  cables: CableData[];
  nodes: NodeData[];
  cableTypeDB?: CableTypeData[];
}

type ActiveBomTab = 'terminal' | 'tray' | 'procurement' | 'coaming' | 'tag' | 'gland';

// ─── Terminal BOM ─────────────────────────────────────────────────────────────
interface TerminalRow {
  conductorMm2: number;
  terminalCode: string;
  terminalName: string;
  terminalType: 'ferrule' | 'ring' | 'unknown';
  coreCount: number;          // 대표 코어수 (케이블타입 기준)
  cableCount: number;         // 해당 케이블 수
  quantity: number;           // 총 단자 수 = cable×core×2단
  cableTypes: string[];
  cableNames: string[];
}

// terminalCore 파싱 → { coreCount, conductorMm2 }
function parseCoreInfo(terminalCore: string): { coreCount: number; conductorMm2: number } | null {
  if (!terminalCore) return null;
  const tc = terminalCore.trim().toLowerCase();
  // "NxM" 형식 (예: "3x2.5", "2x1.5", "1x10")
  const xMatch = tc.match(/^(\d+)\s*x\s*([\d.]+)/);
  if (xMatch) {
    const coreCount = parseInt(xMatch[1], 10);
    const conductorMm2 = parseFloat(xMatch[2]);
    if (!isNaN(coreCount) && !isNaN(conductorMm2) && conductorMm2 >= 0.1 && conductorMm2 <= 400)
      return { coreCount, conductorMm2 };
  }
  // 숫자만 ("2.5", "1.5") → 단심으로 처리
  const numMatch = tc.match(/^[\d.]+$/);
  if (numMatch) {
    const conductorMm2 = parseFloat(tc);
    if (!isNaN(conductorMm2) && conductorMm2 >= 0.1 && conductorMm2 <= 400)
      return { coreCount: 1, conductorMm2 };
  }
  return null; // RJ45, CAT5, etc.
}

// 도체 단면적 → 단자 스펙 (IEC/JIS 해양 기준)
interface TerminalSpec {
  code: string;
  name: string;
  type: 'ferrule' | 'ring';
  color?: string;
}

function getTerminalSpec(mm2: number): TerminalSpec {
  // 페룰 단자 (Ferrule end sleeve) — 0.5 ~ 6mm²
  if (mm2 <= 0.5)  return { code: 'E0508',   name: '페룰 0.5mm² (L8)',  type: 'ferrule', color: '회색' };
  if (mm2 <= 0.75) return { code: 'E7508',   name: '페룰 0.75mm² (L8)', type: 'ferrule', color: '흰색' };
  if (mm2 <= 1.0)  return { code: 'E1008',   name: '페룰 1.0mm² (L8)',  type: 'ferrule', color: '흰색' };
  if (mm2 <= 1.5)  return { code: 'E1508',   name: '페룰 1.5mm² (L8)',  type: 'ferrule', color: '갈색' };
  if (mm2 <= 2.5)  return { code: 'E2508',   name: '페룰 2.5mm² (L8)',  type: 'ferrule', color: '청색' };
  if (mm2 <= 4.0)  return { code: 'E4009',   name: '페룰 4mm² (L12)',   type: 'ferrule', color: '회색' };
  if (mm2 <= 6.0)  return { code: 'E6012',   name: '페룰 6mm² (L12)',   type: 'ferrule', color: '황색' };
  // 링 단자 (Ring lug/압착 단자) — 10mm² 이상
  if (mm2 <= 10)   return { code: 'RL-10-M5',  name: '링단자 10mm² M5',   type: 'ring' };
  if (mm2 <= 16)   return { code: 'RL-16-M6',  name: '링단자 16mm² M6',   type: 'ring' };
  if (mm2 <= 25)   return { code: 'RL-25-M8',  name: '링단자 25mm² M8',   type: 'ring' };
  if (mm2 <= 35)   return { code: 'RL-35-M10', name: '링단자 35mm² M10',  type: 'ring' };
  if (mm2 <= 50)   return { code: 'RL-50-M12', name: '링단자 50mm² M12',  type: 'ring' };
  if (mm2 <= 70)   return { code: 'RL-70-M16', name: '링단자 70mm² M16',  type: 'ring' };
  return             { code: 'RL-95-M20',       name: `링단자 ${mm2}mm² M20`, type: 'ring' };
}

// ─── 케이블타입별 정확한 코어수 (사용자 제공 데이터) ─────────────────────────────
const CABLE_CORE_MAP: Record<string, number> = {
  MY4:8, DY4:2, MYS4:4, MY12:12, DY1:2, TY50:3, MY19:19, TY150:3,
  DY50:2, TY16:3, TY6:3, MY7:7, MYS19:19, TTYS1:2, SYS2:1, SY120:1,
  TY2:3, HTY120:3, TTYS2:4, MY27:27, DY2:2, HTY70:3, MY2:2, TY25:3,
  TY4:3, TY70:3, TY120:3, SY70:1, DY10:2, MC:1, DY6:2, MYS2:2,
  FTY2:3, FTTYS2:4, FMY12:12, TY10:3, TTYS14:28, MY33:33, TY1:3,
  TY95:3, MYS44:44, DY16:2, CAT6:8, FMY2:2, FDY2:2, MYS7:7,
  MYS27:27, MYS12:12, MYS33:33, TTYS10:20, MY44:44, FMY7:7,
  FMYS7:7, SY150:1, DY25:2, TY35:3, M4:4, D1:2, CAT6E:8,
};

function buildTerminalBOM(cables: CableData[], cableTypeDB: CableTypeData[]): TerminalRow[] {
  const typeMap = new Map<string, CableTypeData>();
  for (const ct of cableTypeDB) typeMap.set(ct.cableType.trim().toUpperCase(), ct);

  // terminalCode → 집계
  const termMap = new Map<string, {
    spec: TerminalSpec;
    conductorMm2: number;
    coreCount: number;
    cableTypes: Set<string>;
    cableNames: string[];
    cableCount: number;
    quantity: number;
  }>();

  for (const cable of cables) {
    const cableTypeKey = (cable.type || '').trim().toUpperCase();
    const ctData = typeMap.get(cableTypeKey);

    // 도체 단면적: terminalCore 파싱
    let conductorMm2: number | null = null;
    let parsedCoreCount: number | null = null;
    if (ctData?.terminalCore) {
      const info = parseCoreInfo(ctData.terminalCore);
      if (info) { conductorMm2 = info.conductorMm2; parsedCoreCount = info.coreCount; }
    }
    if (conductorMm2 === null) continue; // 도체 크기 불명 → 스킵

    // 코어수: 사용자 제공 맵 우선, 없으면 terminalCore 파싱값 사용
    const coreCount = CABLE_CORE_MAP[cable.type?.trim().toUpperCase() ?? '']
      ?? CABLE_CORE_MAP[cable.type ?? '']
      ?? parsedCoreCount
      ?? 1;

    const spec = getTerminalSpec(conductorMm2);
    const key = spec.code;

    if (!termMap.has(key)) {
      termMap.set(key, {
        spec, conductorMm2, coreCount,
        cableTypes: new Set(), cableNames: [],
        cableCount: 0, quantity: 0,
      });
    }
    const entry = termMap.get(key)!;
    entry.cableTypes.add(cable.type);
    entry.cableNames.push(cable.name);
    entry.cableCount += 1;
    entry.quantity += coreCount * 2; // FROM단 + TO단
  }

  return Array.from(termMap.entries())
    .map(([, v]) => ({
      conductorMm2: v.conductorMm2,
      terminalCode: v.spec.code,
      terminalName: v.spec.name,
      terminalType: v.spec.type,
      coreCount: v.coreCount,
      cableCount: v.cableCount,
      quantity: v.quantity,
      cableTypes: Array.from(v.cableTypes).sort(),
      cableNames: v.cableNames,
    }))
    .sort((a, b) => a.conductorMm2 - b.conductorMm2);
}

// ─── Tray BOM ─────────────────────────────────────────────────────────────────
interface TrayRow {
  segment: string;
  trayWidth: number;
  estimatedLength: number;
  quantity: number;
}

function buildTrayBOM(cables: CableData[], nodes: NodeData[]): TrayRow[] {
  const nodeMap = new Map<string, NodeData>();
  for (const n of nodes) {
    nodeMap.set(n.name, n);
  }

  // Collect unique path segments and their tray widths
  const segmentMap = new Map<string, { trayWidth: number; count: number; length: number }>();

  for (const cable of cables) {
    const pathStr = cable.calculatedPath ?? cable.path ?? '';
    if (!pathStr) continue;

    // Split by '->' or '/'
    const parts = pathStr.split(/->|\//g).map((s) => s.trim()).filter(Boolean);

    for (let i = 0; i < parts.length - 1; i++) {
      const a = parts[i];
      const b = parts[i + 1];
      const segKey = [a, b].sort().join(' <-> ');

      const nodeA = nodeMap.get(a);
      const nodeB = nodeMap.get(b);

      // traySize from the first node that has it, fallback 150
      const trayWidth = nodeA?.traySize ?? nodeB?.traySize ?? 150;

      // Estimate length: use linkLength from either node, fallback 5m
      const segLength = nodeA?.linkLength ?? nodeB?.linkLength ?? 5;

      if (!segmentMap.has(segKey)) {
        segmentMap.set(segKey, { trayWidth, count: 0, length: segLength });
      }
      segmentMap.get(segKey)!.count += 1;
    }
  }

  // Group by trayWidth for the BOM rows
  const widthMap = new Map<number, { segments: string[]; totalLength: number; count: number }>();

  for (const [seg, v] of segmentMap.entries()) {
    if (!widthMap.has(v.trayWidth)) {
      widthMap.set(v.trayWidth, { segments: [], totalLength: 0, count: 0 });
    }
    const entry = widthMap.get(v.trayWidth)!;
    entry.segments.push(seg);
    entry.totalLength += v.length;
    entry.count += 1;
  }

  const rows: TrayRow[] = Array.from(widthMap.entries()).map(([trayWidth, v]) => ({
    segment: v.segments.join(', '),
    trayWidth,
    estimatedLength: Math.round(v.totalLength * 10) / 10,
    quantity: v.count,
  }));

  return rows.sort((a, b) => a.trayWidth - b.trayWidth);
}

// ─── Procurement BOM ──────────────────────────────────────────────────────────
interface ProcurementRow {
  cableType: string;
  totalLength: number;
  spare: number;
  orderQty: number;
  unitWeight: number; // kg/km
  totalWeight: number; // kg
}

const SPARE_FACTOR = 0.05;

function buildProcurementBOM(cables: CableData[], cableTypeDB: CableTypeData[]): ProcurementRow[] {
  const typeMap = new Map<string, CableTypeData>();
  for (const ct of cableTypeDB) {
    typeMap.set(ct.cableType, ct);
  }

  const typeGroup = new Map<string, { totalLength: number; unitWeight: number }>();

  for (const cable of cables) {
    const len = cable.calculatedLength ?? cable.length ?? 0;
    const ctData = typeMap.get(cable.type);
    const unitWeight = ctData?.weight ?? 0;

    if (!typeGroup.has(cable.type)) {
      typeGroup.set(cable.type, { totalLength: 0, unitWeight });
    }
    typeGroup.get(cable.type)!.totalLength += len;
  }

  return Array.from(typeGroup.entries())
    .map(([cableType, v]) => {
      const spare = Math.round(v.totalLength * SPARE_FACTOR * 10) / 10;
      const orderQty = Math.round((v.totalLength + spare) * 10) / 10;
      const totalWeight = Math.round((orderQty / 1000) * v.unitWeight * 10) / 10;
      return {
        cableType,
        totalLength: Math.round(v.totalLength * 10) / 10,
        spare,
        orderQty,
        unitWeight: v.unitWeight,
        totalWeight,
      };
    })
    .sort((a, b) => a.cableType.localeCompare(b.cableType));
}

// ─── Cable Gland BOM ──────────────────────────────────────────────────────────
interface GlandSpec {
  type: string;
  packId: number;
  d: number;   // 내경 (mm)
  l: number;   // 길이 (mm)
}

const GLAND_SPECS: GlandSpec[] = [
  {type:'10A',packId:7,d:22,l:39},{type:'10B',packId:8,d:22,l:39},
  {type:'15A',packId:9,d:28,l:42},{type:'15B',packId:10,d:28,l:42},{type:'15C',packId:11,d:28,l:42},
  {type:'20A',packId:12,d:34,l:46},{type:'20B',packId:13,d:34,l:46},{type:'20C',packId:15,d:34,l:46},
  {type:'25A',packId:16,d:42,l:53},{type:'25B',packId:18,d:42,l:53},{type:'25C',packId:20,d:42,l:53},
  {type:'30A',packId:22,d:50,l:57},{type:'30B',packId:24,d:50,l:57},{type:'30C',packId:26,d:50,l:57},
  {type:'35A',packId:28,d:56,l:61},{type:'35B',packId:30,d:56,l:61},
  {type:'40A',packId:32,d:56,l:61},{type:'40B',packId:34,d:56,l:61},
  {type:'45A',packId:36,d:70,l:71},{type:'45B',packId:38,d:70,l:71},{type:'45C',packId:40,d:70,l:71},
  {type:'50A',packId:42,d:70,l:71},{type:'50B',packId:44,d:70,l:71},
  {type:'55A',packId:46,d:86,l:83},{type:'55B',packId:48,d:86,l:83},{type:'55C',packId:50,d:86,l:83},
  {type:'60A',packId:52,d:86,l:83},{type:'60B',packId:54,d:86,l:83},{type:'60C',packId:57,d:86,l:83},
  {type:'65A',packId:58,d:100,l:103},{type:'65B',packId:60,d:100,l:103},
  {type:'70A',packId:62,d:100,l:103},{type:'70B',packId:64,d:100,l:103},{type:'70C',packId:66,d:100,l:103},
  {type:'75A',packId:66,d:100,l:103},{type:'75B',packId:68,d:100,l:103},{type:'75C',packId:71,d:100,l:103},
  {type:'80A',packId:72,d:110,l:104},{type:'80B',packId:74,d:110,l:104},
  {type:'85A',packId:76,d:110,l:104},{type:'85B',packId:78,d:110,l:104},
  {type:'90A',packId:80,d:130,l:108},{type:'90B',packId:82,d:130,l:108},
  {type:'95A',packId:84,d:130,l:108},{type:'95B',packId:86,d:130,l:108},
  {type:'100A',packId:88,d:22,l:39},{type:'100B',packId:93,d:22,l:39},
];

// Unique D values sorted for OD matching
const GLAND_D_VALUES = [...new Set(GLAND_SPECS.map(g => g.d))].sort((a, b) => a - b);

// OD → 가장 가까운 큰 D → 해당 D의 첫번째 gland type
function findGlandByOD(od: number): GlandSpec | null {
  for (const d of GLAND_D_VALUES) {
    if (d >= od) {
      return GLAND_SPECS.find(g => g.d === d) || null;
    }
  }
  // OD가 최대 D보다 크면 최대 D gland 반환
  return GLAND_SPECS.find(g => g.d === GLAND_D_VALUES[GLAND_D_VALUES.length - 1]) || null;
}

// glandSize 문자열 → GlandSpec 매칭
function findGlandByType(glandSize: string): GlandSpec | null {
  if (!glandSize) return null;
  const gs = glandSize.trim().toUpperCase();
  return GLAND_SPECS.find(g => g.type === gs) || null;
}

interface GlandEquipRow {
  equipment: string;
  glandType: string;
  d: number;
  l: number;
  packId: number;
  quantity: number;
  cables: string[];
}

function buildGlandBOM(cables: CableData[], cableTypeDB: CableTypeData[]): GlandEquipRow[] {
  const typeMap = new Map<string, CableTypeData>();
  for (const ct of cableTypeDB) typeMap.set(ct.cableType.trim().toUpperCase(), ct);

  // 장비 → gland type → 집계
  const equipMap = new Map<string, Map<string, { spec: GlandSpec; cables: string[] }>>();

  const addEntry = (equip: string, spec: GlandSpec, cableName: string) => {
    if (!equip) return;
    if (!equipMap.has(equip)) equipMap.set(equip, new Map());
    const gMap = equipMap.get(equip)!;
    if (!gMap.has(spec.type)) gMap.set(spec.type, { spec, cables: [] });
    gMap.get(spec.type)!.cables.push(cableName);
  };

  for (const cable of cables) {
    const ctKey = (cable.type || '').trim().toUpperCase();
    const ctData = typeMap.get(ctKey);

    // 1차: cableTypeDB의 glandSize로 매칭
    let spec = ctData?.glandSize ? findGlandByType(ctData.glandSize) : null;
    // 2차: OD로 자동 매칭
    if (!spec && cable.od > 0) spec = findGlandByOD(cable.od);
    if (!spec) continue;

    // FROM 장비
    const fromEquip = cable.fromEquip || cable.fromNode || '';
    // TO 장비
    const toEquip = cable.toEquip || cable.toNode || '';

    addEntry(fromEquip, spec, cable.name);
    addEntry(toEquip, spec, cable.name);
  }

  const rows: GlandEquipRow[] = [];
  for (const [equip, gMap] of equipMap) {
    for (const [gType, entry] of gMap) {
      rows.push({
        equipment: equip,
        glandType: gType,
        d: entry.spec.d,
        l: entry.spec.l,
        packId: entry.spec.packId,
        quantity: entry.cables.length,
        cables: entry.cables,
      });
    }
  }
  return rows.sort((a, b) => a.equipment.localeCompare(b.equipment) || a.glandType.localeCompare(b.glandType));
}

// ─── CSV Export Helper ─────────────────────────────────────────────────────────
function exportCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const bom = '\uFEFF'; // UTF-8 BOM for Korean characters in Excel
  const csvContent =
    bom +
    [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ─── Coaming BOM ──────────────────────────────────────────────────────────────
interface CoamingEntry {
  name: string;
  perUnitAreaMm2: number;   // 개구부 단면적 (mm²)
  er: number;               // E/R 수량
  ch: number;               // C/H 수량
  acc: number;              // ACC 수량
  depth: number;            // 깊이 (mm), 기본 144
}

const INITIAL_COAMING_DATA: CoamingEntry[] = [
  { name: 'CBP-100A', perUnitAreaMm2: 7850,   er: 10, ch: 0, acc: 0,  depth: 144 },
  { name: 'CBC-4',    perUnitAreaMm2: 49396,  er: 6,  ch: 0, acc: 0,  depth: 144 },
  { name: 'CBC-5',    perUnitAreaMm2: 59996,  er: 5,  ch: 0, acc: 0,  depth: 144 },
  { name: 'CBC-6',    perUnitAreaMm2: 70596,  er: 2,  ch: 0, acc: 0,  depth: 144 },
  { name: 'CBC-7',    perUnitAreaMm2: 81196,  er: 3,  ch: 4, acc: 40, depth: 144 },
  { name: 'CBC-25',   perUnitAreaMm2: 133576, er: 4,  ch: 0, acc: 0,  depth: 144 },
  { name: 'CBC-27',   perUnitAreaMm2: 180776, er: 1,  ch: 0, acc: 0,  depth: 144 },
  { name: 'CBC-28',   perUnitAreaMm2: 204376, er: 10, ch: 0, acc: 0,  depth: 144 },
  { name: 'CBC-37',   perUnitAreaMm2: 257376, er: 1,  ch: 0, acc: 0,  depth: 144 },
  { name: 'CBC-39',   perUnitAreaMm2: 324576, er: 1,  ch: 0, acc: 0,  depth: 144 },
];

interface CoamingCalcRow {
  name: string;
  perUnitAreaMm2: number;
  er: number; ch: number; acc: number;
  compoundQty: number;       // E/R + C/H 합계
  volumeDm3: number;         // 총 부피 (dm³)
  compoundWeightKg: number;  // 컴파운드 중량 (Kg)
  sets: number;              // 세트 수 (ceiling)
  powderKg: number;          // POWDER 60%
  hardnerKg: number;         // HARDNER 40%
  manganaQty: number;        // ACC 수량
  manganaWeightKg: number;   // ACC 중량 (0.84 Kg each)
}

function calcCoamingRows(entries: CoamingEntry[], cableFillPct: number): CoamingCalcRow[] {
  return entries.map(e => {
    const compoundQty = e.er + e.ch;
    const volumeMm3 = e.perUnitAreaMm2 * e.depth * compoundQty;
    const volumeDm3 = volumeMm3 / 1_000_000;
    const compoundWeightKg = volumeDm3 * (1 - cableFillPct / 100) * 2.0;
    const sets = Math.ceil(compoundWeightKg / 12.5);
    const powderKg = sets * 7.5;
    const hardnerKg = sets * 5.0;
    const manganaQty = e.acc;
    const manganaWeightKg = manganaQty * 0.84;
    return {
      name: e.name,
      perUnitAreaMm2: e.perUnitAreaMm2,
      er: e.er, ch: e.ch, acc: e.acc,
      compoundQty,
      volumeDm3: Math.round(volumeDm3 * 100) / 100,
      compoundWeightKg: Math.round(compoundWeightKg * 100) / 100,
      sets,
      powderKg,
      hardnerKg,
      manganaQty,
      manganaWeightKg: Math.round(manganaWeightKg * 100) / 100,
    };
  });
}

// ─── Cable Name Tag BOM ───────────────────────────────────────────────────────
interface TagRow {
  no: number;
  cableName: string;
  cableType: string;
  from: string;
  to: string;
  checkNodes: string[];
  coamingNodes: string[];   // CTYPE('C') 노드만
  baseTagCount: number;     // 항상 2 (FROM + TO)
  coamingTagCount: number;  // CTYPE 노드 수
  totalTagCount: number;    // base + (옵션 ON이면 coaming 포함)
}

function buildTagBOM(
  cables: CableData[],
  nodes: NodeData[],
  includeCoamingTag: boolean
): TagRow[] {
  const coamingNodeSet = new Set(
    nodes.filter(n => (n.type || '').toUpperCase() === 'C').map(n => n.name)
  );

  return cables.map((cable, idx) => {
    const checkNodeStr = cable.checkNode || '';
    const checkNodes = checkNodeStr
      .split(/[\s,/;]+|->/)
      .map(s => s.trim())
      .filter(Boolean);
    const coamingNodes = checkNodes.filter(n => coamingNodeSet.has(n));

    const baseTagCount = 2;
    const coamingTagCount = coamingNodes.length;
    const totalTagCount = baseTagCount + (includeCoamingTag ? coamingTagCount : 0);

    const from = cable.fromEquip || cable.fromNode || cable.fromRoom || '';
    const to   = cable.toEquip   || cable.toNode   || cable.toRoom   || '';

    return {
      no: idx + 1,
      cableName: cable.name,
      cableType: cable.type || '',
      from,
      to,
      checkNodes,
      coamingNodes,
      baseTagCount,
      coamingTagCount,
      totalTagCount,
    };
  });
}

// ─── Component ────────────────────────────────────────────────────────────────
const BomAdvTab: React.FC<Props> = ({ cables, nodes, cableTypeDB = [] }) => {
  const [activeTab, setActiveTab] = useState<ActiveBomTab>('terminal');

  // ── Coaming state
  const [coamingEntries, setCoamingEntries] = useState<CoamingEntry[]>(INITIAL_COAMING_DATA);
  const [cableFillPct, setCableFillPct] = useState<number>(35);
  // ── Tag state
  const [includeCoamingTag, setIncludeCoamingTag] = useState<boolean>(false);

  const terminalRows = useMemo(() => buildTerminalBOM(cables, cableTypeDB), [cables, cableTypeDB]);
  const trayRows = useMemo(() => buildTrayBOM(cables, nodes), [cables, nodes]);
  const procRows = useMemo(() => buildProcurementBOM(cables, cableTypeDB), [cables, cableTypeDB]);
  const coamingRows = useMemo(() => calcCoamingRows(coamingEntries, cableFillPct), [coamingEntries, cableFillPct]);
  const tagRows = useMemo(() => buildTagBOM(cables, nodes, includeCoamingTag), [cables, nodes, includeCoamingTag]);
  const glandRows = useMemo(() => buildGlandBOM(cables, cableTypeDB), [cables, cableTypeDB]);

  // KPIs
  const totalTerminals = useMemo(() => terminalRows.reduce((s, r) => s + r.quantity, 0), [terminalRows]);
  const totalFerrule = useMemo(() => terminalRows.filter(r => r.terminalType === 'ferrule').reduce((s, r) => s + r.quantity, 0), [terminalRows]);
  const totalRing = useMemo(() => terminalRows.filter(r => r.terminalType === 'ring').reduce((s, r) => s + r.quantity, 0), [terminalRows]);
  const totalTrayLength = useMemo(
    () => Math.round(trayRows.reduce((s, r) => s + r.estimatedLength, 0) * 10) / 10,
    [trayRows]
  );
  const totalWeight = useMemo(
    () => Math.round(procRows.reduce((s, r) => s + r.totalWeight, 0) * 10) / 10,
    [procRows]
  );
  const totalOrderQty = useMemo(
    () => Math.round(procRows.reduce((s, r) => s + r.orderQty, 0) * 10) / 10,
    [procRows]
  );

  const handleExportTerminal = () => {
    exportCSV(
      'terminal_bom.csv',
      ['도체(mm²)','단자코드','단자명','단자종류','코어수','케이블수','총수량(EA)','케이블타입','케이블목록'],
      terminalRows.map((r) => [
        r.conductorMm2, r.terminalCode, r.terminalName,
        r.terminalType === 'ferrule' ? '페룰' : '링단자',
        r.coreCount, r.cableCount, r.quantity,
        r.cableTypes.join(';'), r.cableNames.slice(0,10).join(';'),
      ])
    );
  };

  const handleExportTray = () => {
    exportCSV(
      'tray_bom.csv',
      ['경로세그먼트', '트레이폭(mm)', '추정길이(m)', '수량'],
      trayRows.map((r) => [r.segment, r.trayWidth, r.estimatedLength, r.quantity])
    );
  };

  const handleExportProc = () => {
    exportCSV(
      'procurement_bom.csv',
      ['케이블타입', '총길이(m)', '여유(5%)', '발주수량(m)', '단위중량(kg/km)', '총중량(kg)'],
      procRows.map((r) => [
        r.cableType,
        r.totalLength,
        r.spare,
        r.orderQty,
        r.unitWeight,
        r.totalWeight,
      ])
    );
  };

  const handleExportCoaming = () => {
    exportCSV(
      'coaming_bom.csv',
      ['코밍타입','단면적(mm²)','깊이(mm)','E/R','C/H','ACC','COMPOUND수','부피(dm³)','컴파운드중량(Kg)','세트수','POWDER(Kg)','HARDNER(Kg)','MANGANA수량','MANGANA중량(Kg)'],
      coamingRows.map(r => [
        r.name, r.perUnitAreaMm2, 144,
        r.er, r.ch, r.acc,
        r.compoundQty, r.volumeDm3, r.compoundWeightKg,
        r.sets, r.powderKg, r.hardnerKg,
        r.manganaQty, r.manganaWeightKg,
      ])
    );
  };

  const handleExportTag = () => {
    exportCSV(
      'cable_nametag_bom.csv',
      ['No','케이블명','타입','FROM','TO','MCT&코밍노드','코밍노드수','기본태그','추가태그','합계태그'],
      tagRows.map(r => [
        r.no, r.cableName, r.cableType, r.from, r.to,
        r.checkNodes.join(';'),
        r.coamingTagCount,
        r.baseTagCount,
        includeCoamingTag ? r.coamingTagCount : 0,
        r.totalTagCount,
      ])
    );
  };

  const handleExportGland = () => {
    exportCSV(
      'cable_gland_bom.csv',
      ['장비명','그랜드타입','D(mm)','L(mm)','Pack ID','수량(EA)','케이블목록'],
      glandRows.map(r => [
        r.equipment, r.glandType, r.d, r.l, r.packId,
        r.quantity, r.cables.slice(0, 10).join(';'),
      ])
    );
  };

  // ── Coaming helpers
  const updateCoamingEntry = (idx: number, field: keyof CoamingEntry, value: number) => {
    setCoamingEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  };

  const tabConfig: { key: ActiveBomTab; label: string; icon: React.ReactNode }[] = [
    { key: 'terminal',    label: '터미널 BOM', icon: <Cpu size={14} /> },
    { key: 'tray',        label: '트레이 BOM', icon: <Layers size={14} /> },
    { key: 'procurement', label: '발주 BOM',   icon: <FileText size={14} /> },
    { key: 'coaming',     label: '코밍 BOM',   icon: <Building2 size={14} /> },
    { key: 'tag',         label: '네임태그 BOM', icon: <Tag size={14} /> },
    { key: 'gland',       label: '그랜드 BOM',   icon: <Circle size={14} /> },
  ];

  // ── Coaming KPIs
  const totalSets       = coamingRows.reduce((s, r) => s + r.sets, 0);
  const totalPowderKg   = coamingRows.reduce((s, r) => s + r.powderKg, 0);
  const totalHardnerKg  = coamingRows.reduce((s, r) => s + r.hardnerKg, 0);
  const totalManganaQty = coamingRows.reduce((s, r) => s + r.manganaQty, 0);
  const totalManganaKg  = Math.round(coamingRows.reduce((s, r) => s + r.manganaWeightKg, 0) * 100) / 100;
  // ── Tag KPIs
  const totalTagCount   = tagRows.reduce((s, r) => s + r.totalTagCount, 0);
  const totalCoamingTags = tagRows.reduce((s, r) => s + r.coamingTagCount, 0);
  // ── Gland KPIs
  const totalGlands     = glandRows.reduce((s, r) => s + r.quantity, 0);
  const uniqueGlandTypes = new Set(glandRows.map(r => r.glandType)).size;
  const uniqueEquipments = new Set(glandRows.map(r => r.equipment)).size;

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100 p-4 gap-4 overflow-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Table2 size={20} className="text-blue-400" />
        <h2 className="text-lg font-semibold text-white">BOM 분석</h2>
        <span className="text-xs text-gray-400 ml-1">Bill of Materials</span>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 bg-gray-800 rounded-lg p-1 w-fit">
        {tabConfig.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === t.key
                ? 'bg-blue-600 text-white shadow'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* ── 터미널 BOM ─────────────────────────────────────────────── */}
      {activeTab === 'terminal' && (
        <div className="flex flex-col gap-4">
          {/* KPI */}
          <div className="flex gap-3 flex-wrap">
            <div className="bg-gray-800 rounded-lg px-5 py-3 flex flex-col items-center min-w-[130px]">
              <span className="text-2xl font-bold text-blue-400">{totalTerminals.toLocaleString()}</span>
              <span className="text-xs text-gray-400 mt-0.5">총 단자 수 (EA)</span>
            </div>
            <div className="bg-gray-800 rounded-lg px-5 py-3 flex flex-col items-center min-w-[130px]">
              <span className="text-2xl font-bold text-emerald-400">{totalFerrule.toLocaleString()}</span>
              <span className="text-xs text-gray-400 mt-0.5">페룰 단자 (EA)</span>
            </div>
            <div className="bg-gray-800 rounded-lg px-5 py-3 flex flex-col items-center min-w-[130px]">
              <span className="text-2xl font-bold text-orange-400">{totalRing.toLocaleString()}</span>
              <span className="text-xs text-gray-400 mt-0.5">링 단자 (EA)</span>
            </div>
            <div className="bg-gray-800 rounded-lg px-5 py-3 flex flex-col items-center min-w-[130px]">
              <span className="text-2xl font-bold text-cyan-400">{terminalRows.length}</span>
              <span className="text-xs text-gray-400 mt-0.5">단자 규격 수</span>
            </div>
          </div>

          {/* Info */}
          <div className="flex items-center gap-2 text-xs text-blue-300 bg-blue-900/20 border border-blue-800/40 rounded px-3 py-2">
            <Info size={12} />
            수량 기준: 케이블 1개 × 코어수 × 2단 (FROM端 + TO端) &nbsp;|&nbsp;
            IEC 60228 / JIS C3410 도체 단면적 기준
          </div>

          {/* Export Button */}
          <div className="flex justify-end">
            <button
              onClick={handleExportTerminal}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded text-sm transition-colors"
            >
              <Download size={14} />
              CSV 내보내기
            </button>
          </div>

          {/* Table */}
          {terminalRows.length === 0 ? (
            <div className="text-gray-500 text-sm text-center py-10">
              케이블타입 DB에 Terminal Core 정보가 없습니다. Cable Type 탭에서 TERMINAL CORE를 확인하세요.
            </div>
          ) : (
            <div className="overflow-auto rounded-lg border border-gray-700">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-800 text-gray-300 text-left">
                    <th className="px-3 py-2 border-b border-gray-700 text-right whitespace-nowrap">도체 (mm²)</th>
                    <th className="px-3 py-2 border-b border-gray-700 whitespace-nowrap">단자 코드</th>
                    <th className="px-3 py-2 border-b border-gray-700 whitespace-nowrap">단자 명칭</th>
                    <th className="px-3 py-2 border-b border-gray-700 whitespace-nowrap">종류</th>
                    <th className="px-3 py-2 border-b border-gray-700 text-right whitespace-nowrap">코어수</th>
                    <th className="px-3 py-2 border-b border-gray-700 text-right whitespace-nowrap">케이블 수</th>
                    <th className="px-3 py-2 border-b border-gray-700 text-right whitespace-nowrap font-bold text-blue-300">수량 (EA)</th>
                    <th className="px-3 py-2 border-b border-gray-700">케이블타입</th>
                    <th className="px-3 py-2 border-b border-gray-700">케이블목록</th>
                  </tr>
                </thead>
                <tbody>
                  {terminalRows.map((row, idx) => (
                    <tr
                      key={row.terminalCode}
                      className={`${idx % 2 === 0 ? 'bg-gray-900' : 'bg-gray-850'} hover:bg-gray-700 transition-colors`}
                    >
                      <td className="px-3 py-2 border-b border-gray-800 text-right font-mono text-yellow-300 whitespace-nowrap">
                        {row.conductorMm2}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-800 font-mono text-blue-300 whitespace-nowrap font-bold">
                        {row.terminalCode}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-800 text-gray-200 whitespace-nowrap">
                        {row.terminalName}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-800 whitespace-nowrap">
                        {row.terminalType === 'ferrule' ? (
                          <span className="px-2 py-0.5 rounded text-xs bg-emerald-900/60 text-emerald-300 border border-emerald-700">페룰</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-xs bg-orange-900/60 text-orange-300 border border-orange-700">링단자</span>
                        )}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-800 text-right text-gray-300 font-mono">
                        {row.coreCount}C
                      </td>
                      <td className="px-3 py-2 border-b border-gray-800 text-right text-gray-400">
                        {row.cableCount}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-800 text-right font-bold text-blue-300 text-base">
                        {row.quantity.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-800 text-gray-400 text-xs">
                        {row.cableTypes.slice(0, 6).join(', ')}
                        {row.cableTypes.length > 6 && <span className="text-gray-600"> +{row.cableTypes.length - 6}</span>}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-800 text-gray-500 text-xs max-w-xs truncate">
                        {row.cableNames.slice(0, 4).join(', ')}
                        {row.cableNames.length > 4 && <span className="text-gray-600"> +{row.cableNames.length - 4}개</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-800 font-semibold text-white">
                    <td className="px-3 py-2 border-t border-gray-600" colSpan={6}>합계</td>
                    <td className="px-3 py-2 border-t border-gray-600 text-right text-blue-300 text-base font-bold">
                      {totalTerminals.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 border-t border-gray-600" colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Legend */}
          <div className="text-xs text-gray-500 flex flex-wrap gap-x-6 gap-y-1">
            <span className="text-emerald-400">페룰 단자</span>: 0.5~6mm² — IEC 60228 / WAGO E-series (L8/L12)
            <span className="text-orange-400 ml-2">링 단자</span>: 10mm²↑ — JIS B 2203 압착 링단자 (M5~M20)
          </div>
        </div>
      )}

      {/* ── 트레이 BOM ─────────────────────────────────────────────── */}
      {activeTab === 'tray' && (
        <div className="flex flex-col gap-4">
          {/* KPI */}
          <div className="flex gap-3">
            <div className="bg-gray-800 rounded-lg px-5 py-3 flex flex-col items-center min-w-[140px]">
              <span className="text-2xl font-bold text-emerald-400">{totalTrayLength}</span>
              <span className="text-xs text-gray-400 mt-0.5">총 트레이 길이 (m)</span>
            </div>
            <div className="bg-gray-800 rounded-lg px-5 py-3 flex flex-col items-center min-w-[120px]">
              <span className="text-2xl font-bold text-cyan-400">{trayRows.length}</span>
              <span className="text-xs text-gray-400 mt-0.5">트레이 규격 수</span>
            </div>
          </div>

          {/* Export Button */}
          <div className="flex justify-end">
            <button
              onClick={handleExportTray}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded text-sm transition-colors"
            >
              <Download size={14} />
              CSV 내보내기
            </button>
          </div>

          {/* Table */}
          {trayRows.length === 0 ? (
            <div className="text-gray-500 text-sm text-center py-10">
              경로(PATH) 데이터가 없습니다. 케이블 경로를 먼저 계산하세요.
            </div>
          ) : (
            <div className="overflow-auto rounded-lg border border-gray-700">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-800 text-gray-300 text-left">
                    <th className="px-3 py-2 border-b border-gray-700">경로 세그먼트</th>
                    <th className="px-3 py-2 border-b border-gray-700 text-right whitespace-nowrap">트레이폭 (mm)</th>
                    <th className="px-3 py-2 border-b border-gray-700 text-right whitespace-nowrap">추정길이 (m)</th>
                    <th className="px-3 py-2 border-b border-gray-700 text-right whitespace-nowrap">세그먼트 수</th>
                  </tr>
                </thead>
                <tbody>
                  {trayRows.map((row, idx) => (
                    <tr
                      key={`${row.trayWidth}-${idx}`}
                      className={`${idx % 2 === 0 ? 'bg-gray-900' : 'bg-gray-850'} hover:bg-gray-700 transition-colors`}
                    >
                      <td className="px-3 py-2 border-b border-gray-800 text-gray-300 text-xs max-w-xs">
                        <div className="truncate" title={row.segment}>
                          {row.segment}
                        </div>
                      </td>
                      <td className="px-3 py-2 border-b border-gray-800 text-right text-yellow-300 font-mono">
                        {row.trayWidth}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-800 text-right text-emerald-400 font-semibold">
                        {row.estimatedLength}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-800 text-right text-gray-400">
                        {row.quantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-800 font-semibold text-white">
                    <td className="px-3 py-2 border-t border-gray-600">합계</td>
                    <td className="px-3 py-2 border-t border-gray-600" />
                    <td className="px-3 py-2 border-t border-gray-600 text-right text-emerald-400">
                      {totalTrayLength}
                    </td>
                    <td className="px-3 py-2 border-t border-gray-600 text-right text-gray-400">
                      {trayRows.reduce((s, r) => s + r.quantity, 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Note */}
          <p className="text-xs text-gray-500">
            * 추정길이는 노드 linkLength 또는 기본값 5m 기준입니다. 실제 설계 도면과 대조 검증이 필요합니다.
          </p>
        </div>
      )}

      {/* ── 발주 BOM ───────────────────────────────────────────────── */}
      {activeTab === 'procurement' && (
        <div className="flex flex-col gap-4">
          {/* KPI */}
          <div className="flex gap-3 flex-wrap">
            <div className="bg-gray-800 rounded-lg px-5 py-3 flex flex-col items-center min-w-[140px]">
              <span className="text-2xl font-bold text-orange-400">{totalOrderQty}</span>
              <span className="text-xs text-gray-400 mt-0.5">총 발주 길이 (m)</span>
            </div>
            <div className="bg-gray-800 rounded-lg px-5 py-3 flex flex-col items-center min-w-[140px]">
              <span className="text-2xl font-bold text-rose-400">{totalWeight}</span>
              <span className="text-xs text-gray-400 mt-0.5">총 케이블 중량 (kg)</span>
            </div>
            <div className="bg-gray-800 rounded-lg px-5 py-3 flex flex-col items-center min-w-[120px]">
              <span className="text-2xl font-bold text-cyan-400">{procRows.length}</span>
              <span className="text-xs text-gray-400 mt-0.5">케이블 타입 수</span>
            </div>
          </div>

          {/* Export Button */}
          <div className="flex justify-end">
            <button
              onClick={handleExportProc}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded text-sm transition-colors"
            >
              <Download size={14} />
              CSV 내보내기
            </button>
          </div>

          {/* Table */}
          {procRows.length === 0 ? (
            <div className="text-gray-500 text-sm text-center py-10">
              케이블 데이터가 없습니다.
            </div>
          ) : (
            <div className="overflow-auto rounded-lg border border-gray-700">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-800 text-gray-300 text-left">
                    <th className="px-3 py-2 border-b border-gray-700 whitespace-nowrap">케이블타입</th>
                    <th className="px-3 py-2 border-b border-gray-700 text-right whitespace-nowrap">총길이 (m)</th>
                    <th className="px-3 py-2 border-b border-gray-700 text-right whitespace-nowrap">여유 5% (m)</th>
                    <th className="px-3 py-2 border-b border-gray-700 text-right whitespace-nowrap">발주수량 (m)</th>
                    <th className="px-3 py-2 border-b border-gray-700 text-right whitespace-nowrap">단위중량 (kg/km)</th>
                    <th className="px-3 py-2 border-b border-gray-700 text-right whitespace-nowrap">총중량 (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {procRows.map((row, idx) => (
                    <tr
                      key={row.cableType}
                      className={`${idx % 2 === 0 ? 'bg-gray-900' : 'bg-gray-850'} hover:bg-gray-700 transition-colors`}
                    >
                      <td className="px-3 py-2 border-b border-gray-800 font-mono text-blue-300 whitespace-nowrap">
                        {row.cableType}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-800 text-right text-gray-300">
                        {row.totalLength.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-800 text-right text-gray-400">
                        {row.spare.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-800 text-right font-semibold text-orange-300">
                        {row.orderQty.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-800 text-right text-gray-400">
                        {row.unitWeight}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-800 text-right text-rose-400 font-semibold">
                        {row.totalWeight.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-800 font-semibold text-white">
                    <td className="px-3 py-2 border-t border-gray-600">합계</td>
                    <td className="px-3 py-2 border-t border-gray-600 text-right text-gray-300">
                      {procRows.reduce((s, r) => s + r.totalLength, 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 border-t border-gray-600 text-right text-gray-400">
                      {procRows.reduce((s, r) => s + r.spare, 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 border-t border-gray-600 text-right text-orange-300">
                      {totalOrderQty.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 border-t border-gray-600" />
                    <td className="px-3 py-2 border-t border-gray-600 text-right text-rose-400">
                      {totalWeight.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Print Summary */}
          <div className="bg-gray-800 rounded-lg p-4 mt-2 print:block">
            <h3 className="text-sm font-semibold text-gray-300 mb-2">발주 요약 (Print Summary)</h3>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
              <div>
                케이블 타입 수: <span className="text-white font-semibold">{procRows.length}종</span>
              </div>
              <div>
                총 발주 길이: <span className="text-orange-300 font-semibold">{totalOrderQty.toLocaleString()} m</span>
              </div>
              <div>
                여유율: <span className="text-white font-semibold">5%</span>
              </div>
              <div>
                총 케이블 중량: <span className="text-rose-400 font-semibold">{totalWeight.toLocaleString()} kg</span>
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-500">
            * calculatedLength 우선, 없으면 length 사용. 단위중량은 케이블타입 DB 기준 (kg/km).
          </p>
        </div>
      )}

      {/* ── 코밍 BOM ───────────────────────────────────────────────── */}
      {activeTab === 'coaming' && (
        <div className="flex flex-col gap-4">
          {/* 옵션 */}
          <div className="flex flex-wrap items-center gap-4 bg-gray-800 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400 whitespace-nowrap">케이블 충전율 (%):</label>
              <input
                type="number"
                min={0} max={100} step={5}
                value={cableFillPct}
                onChange={e => setCableFillPct(Math.min(100, Math.max(0, Number(e.target.value))))}
                className="w-20 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white text-right"
              />
              <span className="text-xs text-gray-500">컴파운드 충진 = {100 - cableFillPct}%</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-amber-300 bg-amber-900/20 border border-amber-800/40 rounded px-2 py-1">
              <Info size={11} />
              밀도 2.0 Kg/dm³ · 1세트 = 12.5 Kg (POWDER 7.5 + HARDNER 5.0) · MANGANA 0.84 Kg/EA
            </div>
          </div>

          {/* KPI */}
          <div className="flex gap-3 flex-wrap">
            <div className="bg-gray-800 rounded-lg px-5 py-3 flex flex-col items-center min-w-[120px]">
              <span className="text-2xl font-bold text-blue-400">{totalSets}</span>
              <span className="text-xs text-gray-400 mt-0.5">COMPOUND 세트</span>
            </div>
            <div className="bg-gray-800 rounded-lg px-5 py-3 flex flex-col items-center min-w-[130px]">
              <span className="text-2xl font-bold text-emerald-400">{totalPowderKg.toLocaleString()}</span>
              <span className="text-xs text-gray-400 mt-0.5">POWDER (Kg)</span>
            </div>
            <div className="bg-gray-800 rounded-lg px-5 py-3 flex flex-col items-center min-w-[130px]">
              <span className="text-2xl font-bold text-orange-400">{totalHardnerKg.toLocaleString()}</span>
              <span className="text-xs text-gray-400 mt-0.5">HARDNER (Kg)</span>
            </div>
            <div className="bg-gray-800 rounded-lg px-5 py-3 flex flex-col items-center min-w-[120px]">
              <span className="text-2xl font-bold text-cyan-400">{totalManganaQty}</span>
              <span className="text-xs text-gray-400 mt-0.5">MANGANA (EA)</span>
            </div>
            <div className="bg-gray-800 rounded-lg px-5 py-3 flex flex-col items-center min-w-[130px]">
              <span className="text-2xl font-bold text-pink-400">{totalManganaKg}</span>
              <span className="text-xs text-gray-400 mt-0.5">MANGANA (Kg)</span>
            </div>
          </div>

          {/* Export */}
          <div className="flex justify-end">
            <button
              onClick={handleExportCoaming}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded text-sm transition-colors"
            >
              <Download size={14} />
              CSV 내보내기
            </button>
          </div>

          {/* Editable Table */}
          <div className="overflow-auto rounded-lg border border-gray-700">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-800 text-gray-300 text-left">
                  <th className="px-3 py-2 border-b border-gray-700 whitespace-nowrap">코밍 타입</th>
                  <th className="px-3 py-2 border-b border-gray-700 text-right whitespace-nowrap">단면적 (mm²)</th>
                  <th className="px-3 py-2 border-b border-gray-700 text-right whitespace-nowrap">깊이 (mm)</th>
                  <th className="px-3 py-2 border-b border-gray-700 text-center whitespace-nowrap text-blue-300">E/R</th>
                  <th className="px-3 py-2 border-b border-gray-700 text-center whitespace-nowrap text-purple-300">C/H</th>
                  <th className="px-3 py-2 border-b border-gray-700 text-center whitespace-nowrap text-yellow-300">ACC</th>
                  <th className="px-3 py-2 border-b border-gray-700 text-right whitespace-nowrap">부피 (dm³)</th>
                  <th className="px-3 py-2 border-b border-gray-700 text-right whitespace-nowrap">컴파운드 (Kg)</th>
                  <th className="px-3 py-2 border-b border-gray-700 text-right font-bold text-emerald-300 whitespace-nowrap">POWDER (Kg)</th>
                  <th className="px-3 py-2 border-b border-gray-700 text-right font-bold text-orange-300 whitespace-nowrap">HARDNER (Kg)</th>
                  <th className="px-3 py-2 border-b border-gray-700 text-right font-bold text-cyan-300 whitespace-nowrap">MANGANA (EA)</th>
                  <th className="px-3 py-2 border-b border-gray-700 text-right font-bold text-pink-300 whitespace-nowrap">MANGANA (Kg)</th>
                </tr>
              </thead>
              <tbody>
                {coamingRows.map((row, idx) => (
                  <tr key={row.name} className={`${idx % 2 === 0 ? 'bg-gray-900' : 'bg-gray-850'} hover:bg-gray-700 transition-colors`}>
                    <td className="px-3 py-2 border-b border-gray-800 font-mono text-blue-300 font-bold whitespace-nowrap">
                      {row.name}
                    </td>
                    <td className="px-3 py-2 border-b border-gray-800 text-right text-gray-400 font-mono">
                      {row.perUnitAreaMm2.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 border-b border-gray-800 text-right text-gray-400">144</td>
                    <td className="px-3 py-1.5 border-b border-gray-800 text-center">
                      <input
                        type="number" min={0} step={1}
                        value={row.er}
                        onChange={e => updateCoamingEntry(idx, 'er', Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-16 bg-blue-900/40 border border-blue-700/50 rounded px-1 py-0.5 text-sm text-blue-200 text-center"
                      />
                    </td>
                    <td className="px-3 py-1.5 border-b border-gray-800 text-center">
                      <input
                        type="number" min={0} step={1}
                        value={row.ch}
                        onChange={e => updateCoamingEntry(idx, 'ch', Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-16 bg-purple-900/40 border border-purple-700/50 rounded px-1 py-0.5 text-sm text-purple-200 text-center"
                      />
                    </td>
                    <td className="px-3 py-1.5 border-b border-gray-800 text-center">
                      <input
                        type="number" min={0} step={1}
                        value={row.acc}
                        onChange={e => updateCoamingEntry(idx, 'acc', Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-16 bg-yellow-900/40 border border-yellow-700/50 rounded px-1 py-0.5 text-sm text-yellow-200 text-center"
                      />
                    </td>
                    <td className="px-3 py-2 border-b border-gray-800 text-right text-gray-300 font-mono">
                      {row.volumeDm3}
                    </td>
                    <td className="px-3 py-2 border-b border-gray-800 text-right text-gray-300 font-mono">
                      {row.compoundWeightKg}
                    </td>
                    <td className="px-3 py-2 border-b border-gray-800 text-right text-emerald-300 font-semibold">
                      {row.powderKg}
                    </td>
                    <td className="px-3 py-2 border-b border-gray-800 text-right text-orange-300 font-semibold">
                      {row.hardnerKg}
                    </td>
                    <td className="px-3 py-2 border-b border-gray-800 text-right text-cyan-300 font-semibold">
                      {row.manganaQty}
                    </td>
                    <td className="px-3 py-2 border-b border-gray-800 text-right text-pink-300 font-semibold">
                      {row.manganaWeightKg}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-800 font-semibold text-white">
                  <td className="px-3 py-2 border-t border-gray-600" colSpan={7}>합계</td>
                  <td className="px-3 py-2 border-t border-gray-600 text-right text-gray-300">
                    {Math.round(coamingRows.reduce((s,r) => s+r.compoundWeightKg,0)*10)/10} Kg
                  </td>
                  <td className="px-3 py-2 border-t border-gray-600 text-right text-emerald-300">
                    {totalPowderKg} Kg
                  </td>
                  <td className="px-3 py-2 border-t border-gray-600 text-right text-orange-300">
                    {totalHardnerKg} Kg
                  </td>
                  <td className="px-3 py-2 border-t border-gray-600 text-right text-cyan-300">
                    {totalManganaQty} EA
                  </td>
                  <td className="px-3 py-2 border-t border-gray-600 text-right text-pink-300">
                    {totalManganaKg} Kg
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* 범례 */}
          <div className="text-xs text-gray-500 flex flex-wrap gap-x-6 gap-y-1">
            <span className="text-blue-300">E/R</span>: Engine Room &nbsp;|&nbsp;
            <span className="text-purple-300">C/H</span>: Cargo Hold (COMPOUND 적용) &nbsp;|&nbsp;
            <span className="text-yellow-300">ACC</span>: Accessories (MANGANA 적용, 100×100mm 박스)
          </div>
        </div>
      )}

      {/* ── 네임태그 BOM ─────────────────────────────────────────────── */}
      {activeTab === 'tag' && (
        <div className="flex flex-col gap-4">
          {/* 옵션 */}
          <div className="flex flex-wrap items-center gap-4 bg-gray-800 rounded-lg px-4 py-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                onClick={() => setIncludeCoamingTag(v => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  includeCoamingTag ? 'bg-blue-600' : 'bg-gray-600'
                }`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  includeCoamingTag ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </div>
              <span className="text-sm text-gray-200">CTYPE 코밍 태그 포함</span>
            </label>
            <div className="flex items-center gap-1 text-xs text-blue-300 bg-blue-900/20 border border-blue-800/40 rounded px-2 py-1">
              <Info size={11} />
              기본 2개 (FROM·TO) + 코밍 통과 시 추가 &nbsp;|&nbsp; CTYPE(type=C) 노드 기준
            </div>
          </div>

          {/* KPI */}
          <div className="flex gap-3 flex-wrap">
            <div className="bg-gray-800 rounded-lg px-5 py-3 flex flex-col items-center min-w-[130px]">
              <span className="text-2xl font-bold text-blue-400">{totalTagCount.toLocaleString()}</span>
              <span className="text-xs text-gray-400 mt-0.5">총 태그 수 (EA)</span>
            </div>
            <div className="bg-gray-800 rounded-lg px-5 py-3 flex flex-col items-center min-w-[130px]">
              <span className="text-2xl font-bold text-emerald-400">{tagRows.length.toLocaleString()}</span>
              <span className="text-xs text-gray-400 mt-0.5">케이블 수</span>
            </div>
            {includeCoamingTag && (
              <div className="bg-gray-800 rounded-lg px-5 py-3 flex flex-col items-center min-w-[130px]">
                <span className="text-2xl font-bold text-orange-400">{totalCoamingTags.toLocaleString()}</span>
                <span className="text-xs text-gray-400 mt-0.5">코밍 추가 태그 (EA)</span>
              </div>
            )}
            <div className="bg-gray-800 rounded-lg px-5 py-3 flex flex-col items-center min-w-[130px]">
              <span className="text-2xl font-bold text-cyan-400">{(tagRows.length * 2).toLocaleString()}</span>
              <span className="text-xs text-gray-400 mt-0.5">기본 태그 (EA)</span>
            </div>
          </div>

          {/* Export */}
          <div className="flex justify-end">
            <button
              onClick={handleExportTag}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded text-sm transition-colors"
            >
              <Download size={14} />
              CSV 내보내기
            </button>
          </div>

          {/* Table */}
          {tagRows.length === 0 ? (
            <div className="text-gray-500 text-sm text-center py-10">케이블 데이터가 없습니다.</div>
          ) : (
            <div className="overflow-auto rounded-lg border border-gray-700">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-800 text-gray-300 text-left">
                    <th className="px-3 py-2 border-b border-gray-700 text-right whitespace-nowrap">No</th>
                    <th className="px-3 py-2 border-b border-gray-700 whitespace-nowrap">케이블명</th>
                    <th className="px-3 py-2 border-b border-gray-700 whitespace-nowrap">타입</th>
                    <th className="px-3 py-2 border-b border-gray-700 whitespace-nowrap">FROM</th>
                    <th className="px-3 py-2 border-b border-gray-700 whitespace-nowrap">TO</th>
                    <th className="px-3 py-2 border-b border-gray-700 whitespace-nowrap">MCT &amp; 코밍 노드</th>
                    {includeCoamingTag && (
                      <th className="px-3 py-2 border-b border-gray-700 text-right whitespace-nowrap text-orange-300">코밍 추가</th>
                    )}
                    <th className="px-3 py-2 border-b border-gray-700 text-right font-bold text-blue-300 whitespace-nowrap">태그 합계</th>
                  </tr>
                </thead>
                <tbody>
                  {tagRows.map((row, idx) => (
                    <tr key={row.cableName + row.no} className={`${idx % 2 === 0 ? 'bg-gray-900' : 'bg-gray-850'} hover:bg-gray-700 transition-colors`}>
                      <td className="px-3 py-2 border-b border-gray-800 text-right text-gray-500 text-xs">{row.no}</td>
                      <td className="px-3 py-2 border-b border-gray-800 font-mono text-blue-300 whitespace-nowrap text-xs">
                        {row.cableName}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-800 text-gray-400 whitespace-nowrap text-xs">
                        {row.cableType}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-800 text-gray-300 whitespace-nowrap text-xs">
                        {row.from || <span className="text-gray-600">-</span>}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-800 text-gray-300 whitespace-nowrap text-xs">
                        {row.to || <span className="text-gray-600">-</span>}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-800 text-xs max-w-xs">
                        {row.checkNodes.length === 0 ? (
                          <span className="text-gray-600">-</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {row.checkNodes.map(n => (
                              <span
                                key={n}
                                className={`px-1.5 py-0.5 rounded text-xs ${
                                  row.coamingNodes.includes(n)
                                    ? 'bg-orange-900/60 text-orange-300 border border-orange-700'
                                    : 'bg-gray-700 text-gray-400'
                                }`}
                              >
                                {n}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      {includeCoamingTag && (
                        <td className="px-3 py-2 border-b border-gray-800 text-right text-orange-400 font-mono">
                          {row.coamingTagCount > 0 ? `+${row.coamingTagCount}` : '-'}
                        </td>
                      )}
                      <td className="px-3 py-2 border-b border-gray-800 text-right font-bold text-blue-300 text-base">
                        {row.totalTagCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-800 font-semibold text-white">
                    <td className="px-3 py-2 border-t border-gray-600" colSpan={6}>합계</td>
                    {includeCoamingTag && (
                      <td className="px-3 py-2 border-t border-gray-600 text-right text-orange-300">
                        +{totalCoamingTags}
                      </td>
                    )}
                    <td className="px-3 py-2 border-t border-gray-600 text-right text-blue-300 text-base">
                      {totalTagCount.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <p className="text-xs text-gray-500">
            * 기본 2개: FROM端·TO端 각 1개. CTYPE 코밍 추가 시 케이블이 통과하는 코밍(type=C) 노드 수만큼 추가.
          </p>
        </div>
      )}

      {/* ── 그랜드 BOM ─────────────────────────────────────────────── */}
      {activeTab === 'gland' && (
        <div className="flex flex-col gap-4">
          {/* KPI */}
          <div className="flex gap-3 flex-wrap">
            <div className="bg-gray-800 rounded-lg px-5 py-3 flex flex-col items-center min-w-[130px]">
              <span className="text-2xl font-bold text-blue-400">{totalGlands.toLocaleString()}</span>
              <span className="text-xs text-gray-400 mt-0.5">총 그랜드 수 (EA)</span>
            </div>
            <div className="bg-gray-800 rounded-lg px-5 py-3 flex flex-col items-center min-w-[130px]">
              <span className="text-2xl font-bold text-emerald-400">{uniqueGlandTypes}</span>
              <span className="text-xs text-gray-400 mt-0.5">그랜드 규격 수</span>
            </div>
            <div className="bg-gray-800 rounded-lg px-5 py-3 flex flex-col items-center min-w-[130px]">
              <span className="text-2xl font-bold text-orange-400">{uniqueEquipments}</span>
              <span className="text-xs text-gray-400 mt-0.5">장비 수</span>
            </div>
          </div>

          {/* Info */}
          <div className="flex items-center gap-2 text-xs text-blue-300 bg-blue-900/20 border border-blue-800/40 rounded px-3 py-2">
            <Info size={12} />
            JIS Standard OSCG Type &nbsp;|&nbsp; Cable OD → D ≥ OD 최소 매칭 &nbsp;|&nbsp;
            장비당 FROM·TO 양단 각 1EA
          </div>

          {/* Export */}
          <div className="flex justify-end">
            <button
              onClick={handleExportGland}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded text-sm transition-colors"
            >
              <Download size={14} />
              CSV 내보내기
            </button>
          </div>

          {/* Table */}
          {glandRows.length === 0 ? (
            <div className="text-gray-500 text-sm text-center py-10">
              케이블 데이터 또는 케이블타입 DB가 없습니다.
            </div>
          ) : (
            <div className="overflow-auto rounded-lg border border-gray-700">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-800 text-gray-300 text-left">
                    <th className="px-3 py-2 border-b border-gray-700 whitespace-nowrap">장비명</th>
                    <th className="px-3 py-2 border-b border-gray-700 whitespace-nowrap">그랜드 타입</th>
                    <th className="px-3 py-2 border-b border-gray-700 text-right whitespace-nowrap">D (mm)</th>
                    <th className="px-3 py-2 border-b border-gray-700 text-right whitespace-nowrap">L (mm)</th>
                    <th className="px-3 py-2 border-b border-gray-700 text-right whitespace-nowrap">Pack ID</th>
                    <th className="px-3 py-2 border-b border-gray-700 text-right font-bold text-blue-300 whitespace-nowrap">수량 (EA)</th>
                    <th className="px-3 py-2 border-b border-gray-700">케이블 목록</th>
                  </tr>
                </thead>
                <tbody>
                  {glandRows.map((row, idx) => (
                    <tr key={`${row.equipment}-${row.glandType}-${idx}`}
                        className={`${idx % 2 === 0 ? 'bg-gray-900' : 'bg-gray-850'} hover:bg-gray-700 transition-colors`}>
                      <td className="px-3 py-2 border-b border-gray-800 text-gray-200 whitespace-nowrap text-xs font-bold">
                        {row.equipment}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-800 font-mono text-blue-300 whitespace-nowrap font-bold">
                        {row.glandType}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-800 text-right text-yellow-300 font-mono">
                        {row.d}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-800 text-right text-gray-400 font-mono">
                        {row.l}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-800 text-right text-gray-500 font-mono">
                        {row.packId}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-800 text-right font-bold text-blue-300 text-base">
                        {row.quantity.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-800 text-gray-500 text-xs max-w-xs truncate">
                        {row.cables.slice(0, 5).join(', ')}
                        {row.cables.length > 5 && <span className="text-gray-600"> +{row.cables.length - 5}개</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-800 font-semibold text-white">
                    <td className="px-3 py-2 border-t border-gray-600">합계</td>
                    <td className="px-3 py-2 border-t border-gray-600 text-gray-400">{uniqueGlandTypes}종</td>
                    <td className="px-3 py-2 border-t border-gray-600" colSpan={3}></td>
                    <td className="px-3 py-2 border-t border-gray-600 text-right text-blue-300 text-base font-bold">
                      {totalGlands.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 border-t border-gray-600"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Gland 규격표 참조 */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h4 className="text-xs font-bold text-gray-300 mb-2 uppercase">JIS Cable Gland D 규격 (OSCG Type)</h4>
            <div className="flex flex-wrap gap-2 text-xs">
              {[22, 28, 34, 42, 50, 56, 70, 86, 100, 110, 130].map(d => {
                const types = GLAND_SPECS.filter(g => g.d === d).map(g => g.type);
                return (
                  <div key={d} className="bg-gray-700 rounded px-2 py-1.5 flex flex-col items-center min-w-[60px]">
                    <span className="text-yellow-300 font-bold font-mono">D{d}</span>
                    <span className="text-gray-400 text-[9px] mt-0.5">{types[0]}~{types[types.length-1]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BomAdvTab;
