/**
 * useExcelParser.ts
 * Excel 파일 파싱 로직 - Cable/Node 데이터 추출
 * App.tsx에서 분리된 독립 모듈
 */
import * as XLSX from 'xlsx';
import { CableData, NodeData } from '../types';

// ─── Column Name Maps ─────────────────────────────────────────────────────────
export const CABLE_COLUMNS = {
  name: ['CABLE_NAME', 'NAME', 'Cable Name'],
  type: ['CABLE_TYPE', 'TYPE', 'Type'],
  system: ['CABLE_SYSTEM', 'SYSTEM', 'System'],
  fromNode: ['FROM_NODE', 'From Node', 'FROM'],
  toNode: ['TO_NODE', 'To Node', 'TO'],
  fromRoom: ['FROM_ROOM', 'From Room'],
  toRoom: ['TO_ROOM', 'To Room'],
  fromEquip: ['FROM_EQUIP', 'From Equipment'],
  toEquip: ['TO_EQUIP', 'To Equipment'],
  fromRest: ['FROM_REST', 'FROM REST'],
  toRest: ['TO_REST', 'TO REST'],
  length: ['POR_LENGTH', 'LENGTH', 'Length', 'POR LENGTH'],
  path: ['CABLE_PATH', 'PATH', 'Path', 'CABLE PATH'],
  outDia: ['CABLE_OUTDIA', 'OUT_DIA', 'Diameter', 'OD', 'DIA', 'OUTER DIA', 'DIA_MM'],
  checkNode: ['CHECK_NODE', 'Check Node', 'Check', 'VIA'],
  wdPage: ['WD_PAGE', 'PAGE'],
  supplyDeck: ['SUPPLY_DECK', 'DECK'],
  porWeight: ['POR_WEIGHT', 'WEIGHT'],
  interference: ['INTERFERENCE'],
  remark: ['REMARK'],
  remark1: ['REMARK1'],
  remark2: ['REMARK2'],
  remark3: ['REMARK3'],
  revision: ['REVISION', 'REV'],
  cableWeight: ['CABLE_WEIGHT', 'CWT'],
};

export const NODE_COLUMNS = {
  name: ['NODE_RNAME', 'NODE_NAME', 'NAME', 'Node'],
  structure: ['STRUCTURE_NAME', 'STRUCTURE', 'Structure'],
  component: ['COMPONENT', 'Component'],
  type: ['NODE_TYPE', 'TYPE', 'Type'],
  relation: ['RELATION', 'Relation'],
  linkLength: ['LINK_LENGTH', 'Link Length'],
  areaSize: ['AREA_SIZE', 'Area Size', 'Area'],
  x: ['X_COORD', 'X', 'COORD_X', 'POS_X'],
  y: ['Y_COORD', 'Y', 'COORD_Y', 'POS_Y'],
  z: ['Z_COORD', 'Z', 'COORD_Z', 'POS_Z'],
  deck: ['DECK', 'DECK_NO', 'FLOOR'],
};

// ─── Validation Result ────────────────────────────────────────────────────────
export interface ParseValidation {
  warnings: string[];
  errors: string[];
  foundColumns: string[];
  missingRequiredColumns: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function getColumnIndex(headers: string[], possibleNames: string[]): number {
  const lowerHeaders = headers.map(h => String(h || '').toLowerCase().trim());
  for (const name of possibleNames) {
    const idx = lowerHeaders.indexOf(name.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

export function safeParseFloat(value: unknown): number {
  const parsed = parseFloat(String(value || '').replace(/[^0-9.-]/g, ''));
  return isNaN(parsed) ? 0 : parsed;
}

// ─── Cable Sheet Parser ───────────────────────────────────────────────────────
export function parseCableSheet(rawData: unknown[][]): { cables: CableData[]; validation: ParseValidation } {
  const validation: ParseValidation = { warnings: [], errors: [], foundColumns: [], missingRequiredColumns: [] };

  if (rawData.length < 2) {
    validation.errors.push('데이터가 없거나 헤더만 있습니다 (최소 2행 필요)');
    return { cables: [], validation };
  }

  const headers = rawData[0] as string[];
  const indices: Record<string, number> = {};

  for (const key in CABLE_COLUMNS) {
    indices[key] = getColumnIndex(headers, CABLE_COLUMNS[key as keyof typeof CABLE_COLUMNS]);
    if (indices[key] >= 0) {
      validation.foundColumns.push(key);
    }
  }

  // 필수 컬럼 검증
  const requiredCols = ['name', 'type', 'fromNode', 'toNode'];
  for (const col of requiredCols) {
    if (indices[col] < 0) {
      validation.missingRequiredColumns.push(col);
      validation.warnings.push(`필수 컬럼 누락: ${col} (${CABLE_COLUMNS[col as keyof typeof CABLE_COLUMNS].join(', ')} 중 하나여야 함)`);
    }
  }

  if (indices.outDia < 0) {
    validation.warnings.push('OD(외경) 컬럼 없음 - 기본값 10mm 적용 (CABLE_OUTDIA, OUT_DIA, OD, DIA 중 하나 사용)');
  }

  const cables = rawData.slice(1).map((row, idx) => ({
    id: `c-${idx}`,
    name: indices.name >= 0 ? String((row as unknown[])[indices.name] || '') : '',
    type: indices.type >= 0 ? String((row as unknown[])[indices.type] || '') : '',
    system: indices.system >= 0 ? String((row as unknown[])[indices.system] || '') : '',
    fromNode: indices.fromNode >= 0 ? String((row as unknown[])[indices.fromNode] || '') : '',
    toNode: indices.toNode >= 0 ? String((row as unknown[])[indices.toNode] || '') : '',
    fromRoom: indices.fromRoom >= 0 ? String((row as unknown[])[indices.fromRoom] || '') : '',
    toRoom: indices.toRoom >= 0 ? String((row as unknown[])[indices.toRoom] || '') : '',
    fromEquip: indices.fromEquip >= 0 ? String((row as unknown[])[indices.fromEquip] || '') : '',
    toEquip: indices.toEquip >= 0 ? String((row as unknown[])[indices.toEquip] || '') : '',
    fromRest: indices.fromRest >= 0 ? safeParseFloat((row as unknown[])[indices.fromRest]) : 0,
    toRest: indices.toRest >= 0 ? safeParseFloat((row as unknown[])[indices.toRest]) : 0,
    length: indices.length >= 0 ? safeParseFloat((row as unknown[])[indices.length]) : 0,
    path: indices.path >= 0 ? String((row as unknown[])[indices.path] || '') : '',
    od: indices.outDia >= 0 ? safeParseFloat((row as unknown[])[indices.outDia]) || 10 : 10,
    checkNode: indices.checkNode >= 0 ? String((row as unknown[])[indices.checkNode] || '') : '',
    wdPage: indices.wdPage >= 0 ? String((row as unknown[])[indices.wdPage] || '') : '',
    supplyDeck: indices.supplyDeck >= 0 ? String((row as unknown[])[indices.supplyDeck] || '') : '',
    porWeight: indices.porWeight >= 0 ? safeParseFloat((row as unknown[])[indices.porWeight]) : 0,
    interference: indices.interference >= 0 ? String((row as unknown[])[indices.interference] || '') : '',
    remark: indices.remark >= 0 ? String((row as unknown[])[indices.remark] || '') : '',
    remark1: indices.remark1 >= 0 ? String((row as unknown[])[indices.remark1] || '') : '',
    remark2: indices.remark2 >= 0 ? String((row as unknown[])[indices.remark2] || '') : '',
    remark3: indices.remark3 >= 0 ? String((row as unknown[])[indices.remark3] || '') : '',
    revision: indices.revision >= 0 ? String((row as unknown[])[indices.revision] || '') : '',
    cableWeight: indices.cableWeight >= 0 ? safeParseFloat((row as unknown[])[indices.cableWeight]) : 0,
  })).filter(c => c.name);

  validation.foundColumns = Object.keys(indices).filter(k => indices[k] >= 0);
  return { cables, validation };
}

// ─── Node Sheet Parser ────────────────────────────────────────────────────────
export function parseNodeSheet(rawData: unknown[][]): { nodes: NodeData[]; validation: ParseValidation } {
  const validation: ParseValidation = { warnings: [], errors: [], foundColumns: [], missingRequiredColumns: [] };

  if (rawData.length < 2) {
    validation.errors.push('데이터가 없거나 헤더만 있습니다 (최소 2행 필요)');
    return { nodes: [], validation };
  }

  const headers = rawData[0] as string[];
  const indices: Record<string, number> = {};

  for (const key in NODE_COLUMNS) {
    indices[key] = getColumnIndex(headers, NODE_COLUMNS[key as keyof typeof NODE_COLUMNS]);
  }

  // 필수 컬럼 검증
  if (indices.name < 0) {
    validation.missingRequiredColumns.push('name');
    validation.errors.push(`NODE_NAME 컬럼 없음 (NODE_RNAME, NODE_NAME, NAME, Node 중 하나 필요)`);
  }

  if (indices.linkLength < 0) {
    validation.warnings.push('LINK_LENGTH 컬럼 없음 - 라우팅 거리 계산 불가 (길이=0 으로 처리)');
  }

  const parseCoord = (r: unknown[], idx: number): number | undefined => {
    if (idx < 0) return undefined;
    const v = r[idx];
    if (v === '' || v === null || v === undefined) return undefined;
    const parsed = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
    return isNaN(parsed) ? undefined : parsed;
  };

  const nodes = rawData.slice(1).map(row => {
    const r = row as unknown[];
    return {
      name: indices.name >= 0 ? String(r[indices.name] || '') : '',
      structure: indices.structure >= 0 ? String(r[indices.structure] || '') : '',
      component: indices.component >= 0 ? String(r[indices.component] || '') : '',
      type: indices.type >= 0 ? String(r[indices.type] || '') : '',
      relation: indices.relation >= 0 ? String(r[indices.relation] || '') : '',
      linkLength: indices.linkLength >= 0 ? safeParseFloat(r[indices.linkLength]) : 0,
      areaSize: indices.areaSize >= 0 ? safeParseFloat(r[indices.areaSize]) : 0,
      x: parseCoord(r, indices.x),
      y: parseCoord(r, indices.y),
      z: parseCoord(r, indices.z),
      deck: indices.deck >= 0 ? (String(r[indices.deck] || '') || undefined) : undefined,
    };
  }).filter(n => n.name);

  validation.foundColumns = Object.keys(indices).filter(k => indices[k] >= 0);
  return { nodes, validation };
}

// ─── File Reader Utility ──────────────────────────────────────────────────────
export function readExcelFile(file: File): Promise<unknown[][]> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][];
      resolve(rawData);
    };
    reader.readAsBinaryString(file);
  });
}

export function readExcelFileAllSheets(file: File): Promise<Record<string, unknown[][]>> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const result: Record<string, unknown[][]> = {};
      wb.SheetNames.forEach(name => {
        const ws = wb.Sheets[name];
        result[name] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][];
      });
      resolve(result);
    };
    reader.readAsBinaryString(file);
  });
}
