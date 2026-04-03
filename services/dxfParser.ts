// ─────────────────────────────────────────────────────────────
// dxfParser.ts  –  Pure-TypeScript DXF parser (no dependencies)
// ─────────────────────────────────────────────────────────────

/* ── Type definitions ─────────────────────────────────────── */

export interface DXFPoint {
  x: number;
  y: number;
  z?: number;
}

export interface DXFLayer {
  name: string;
  color: number;
  visible: boolean;
  frozen: boolean;
  locked: boolean;
}

export interface DXFEntityBase {
  type: string;
  layer: string;
  color: number; // 256 = BYLAYER
  handle: string;
}

export interface DXFLine extends DXFEntityBase {
  type: 'LINE';
  start: DXFPoint;
  end: DXFPoint;
}

export interface DXFArc extends DXFEntityBase {
  type: 'ARC';
  center: DXFPoint;
  radius: number;
  startAngle: number;
  endAngle: number;
}

export interface DXFCircle extends DXFEntityBase {
  type: 'CIRCLE';
  center: DXFPoint;
  radius: number;
}

export interface DXFLWPolyline extends DXFEntityBase {
  type: 'LWPOLYLINE';
  points: DXFPoint[];
  closed: boolean;
}

export interface DXFText extends DXFEntityBase {
  type: 'TEXT' | 'MTEXT';
  position: DXFPoint;
  text: string;
  height: number;
  rotation: number;
}

export interface DXFInsert extends DXFEntityBase {
  type: 'INSERT';
  position: DXFPoint;
  blockName: string;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

export interface DXFPointEntity extends DXFEntityBase {
  type: 'POINT';
  position: DXFPoint;
}

export type DXFEntity =
  | DXFLine
  | DXFArc
  | DXFCircle
  | DXFLWPolyline
  | DXFText
  | DXFInsert
  | DXFPointEntity;

export interface ParsedDXF {
  header: {
    insunits: number;
    extmin?: DXFPoint;
    extmax?: DXFPoint;
  };
  layers: Map<string, DXFLayer>;
  entities: DXFEntity[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/* ── Tokenizer ────────────────────────────────────────────── */

type Token = [number, string];

function tokenize(text: string): Token[] {
  const lines = text.split(/\r?\n/);
  const tokens: Token[] = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    const value = lines[i + 1].trim();
    if (!isNaN(code)) tokens.push([code, value]);
  }
  return tokens;
}

/* ── Section splitter ─────────────────────────────────────── */

interface Sections {
  HEADER: Token[];
  TABLES: Token[];
  ENTITIES: Token[];
}

function splitSections(tokens: Token[]): Sections {
  const sections: Sections = { HEADER: [], TABLES: [], ENTITIES: [] };
  let current: Token[] | null = null;

  for (let i = 0; i < tokens.length; i++) {
    const [code, value] = tokens[i];
    const upper = value.toUpperCase();

    if (code === 0 && upper === 'SECTION') {
      // next token is section name (code 2)
      if (i + 1 < tokens.length && tokens[i + 1][0] === 2) {
        const name = tokens[i + 1][1].toUpperCase() as keyof Sections;
        current = sections[name] ?? null;
        i++; // skip the name token
      }
      continue;
    }

    if (code === 0 && upper === 'ENDSEC') {
      current = null;
      continue;
    }

    if (current) current.push([code, value]);
  }

  return sections;
}

/* ── Header parser ────────────────────────────────────────── */

function parseHeader(tokens: Token[]): ParsedDXF['header'] {
  const header: ParsedDXF['header'] = { insunits: 0 };
  let variable = '';

  for (let i = 0; i < tokens.length; i++) {
    const [code, value] = tokens[i];

    if (code === 9) {
      variable = value.toUpperCase();
      continue;
    }

    switch (variable) {
      case '$INSUNITS':
        if (code === 70) header.insunits = parseInt(value, 10);
        break;
      case '$EXTMIN':
        if (!header.extmin) header.extmin = { x: 0, y: 0, z: 0 };
        if (code === 10) header.extmin.x = parseFloat(value);
        if (code === 20) header.extmin.y = parseFloat(value);
        if (code === 30) header.extmin.z = parseFloat(value);
        break;
      case '$EXTMAX':
        if (!header.extmax) header.extmax = { x: 0, y: 0, z: 0 };
        if (code === 10) header.extmax.x = parseFloat(value);
        if (code === 20) header.extmax.y = parseFloat(value);
        if (code === 30) header.extmax.z = parseFloat(value);
        break;
    }
  }

  return header;
}

/* ── Layer parser ─────────────────────────────────────────── */

function parseLayers(tokens: Token[]): Map<string, DXFLayer> {
  const layers = new Map<string, DXFLayer>();
  let inLayerTable = false;
  let current: DXFLayer | null = null;

  for (let i = 0; i < tokens.length; i++) {
    const [code, value] = tokens[i];
    const upper = value.toUpperCase();

    // Detect LAYER table start
    if (code === 0 && upper === 'TABLE') {
      if (i + 1 < tokens.length && tokens[i + 1][0] === 2 && tokens[i + 1][1].toUpperCase() === 'LAYER') {
        inLayerTable = true;
        i++;
        continue;
      }
    }

    if (code === 0 && upper === 'ENDTAB') {
      if (inLayerTable) {
        if (current) layers.set(current.name, current);
        inLayerTable = false;
        current = null;
      }
      continue;
    }

    if (!inLayerTable) continue;

    if (code === 0 && upper === 'LAYER') {
      if (current) layers.set(current.name, current);
      current = { name: '', color: 7, visible: true, frozen: false, locked: false };
      continue;
    }

    if (!current) continue;

    switch (code) {
      case 2:
        current.name = value;
        break;
      case 62: {
        const c = parseInt(value, 10);
        if (c < 0) {
          current.visible = false;
          current.color = Math.abs(c);
        } else {
          current.color = c;
        }
        break;
      }
      case 70: {
        const flags = parseInt(value, 10);
        current.frozen = (flags & 1) !== 0;
        current.locked = (flags & 4) !== 0;
        break;
      }
    }
  }

  if (current && inLayerTable) layers.set(current.name, current);
  return layers;
}

/* ── Entity group splitter ────────────────────────────────── */

/** Split entity tokens into per-entity groups, each starting with code 0. */
function splitEntityGroups(tokens: Token[]): Token[][] {
  const groups: Token[][] = [];
  let cur: Token[] = [];

  for (const t of tokens) {
    if (t[0] === 0) {
      if (cur.length) groups.push(cur);
      cur = [t];
    } else {
      cur.push(t);
    }
  }
  if (cur.length) groups.push(cur);
  return groups;
}

/* ── Individual entity parsers ────────────────────────────── */

function readBase(group: Token[]): { layer: string; color: number; handle: string } {
  let layer = '0';
  let color = 256;
  let handle = '';
  for (const [code, value] of group) {
    if (code === 8) layer = value;
    if (code === 62) color = parseInt(value, 10);
    if (code === 5) handle = value;
  }
  return { layer, color, handle };
}

function parseLine(group: Token[]): DXFLine {
  const base = readBase(group);
  const start: DXFPoint = { x: 0, y: 0 };
  const end: DXFPoint = { x: 0, y: 0 };

  for (const [code, value] of group) {
    switch (code) {
      case 10: start.x = parseFloat(value); break;
      case 20: start.y = parseFloat(value); break;
      case 30: start.z = parseFloat(value); break;
      case 11: end.x = parseFloat(value); break;
      case 21: end.y = parseFloat(value); break;
      case 31: end.z = parseFloat(value); break;
    }
  }

  return { type: 'LINE', ...base, start, end };
}

function parseArc(group: Token[]): DXFArc {
  const base = readBase(group);
  const center: DXFPoint = { x: 0, y: 0 };
  let radius = 0;
  let startAngle = 0;
  let endAngle = 360;

  for (const [code, value] of group) {
    switch (code) {
      case 10: center.x = parseFloat(value); break;
      case 20: center.y = parseFloat(value); break;
      case 30: center.z = parseFloat(value); break;
      case 40: radius = parseFloat(value); break;
      case 50: startAngle = parseFloat(value); break;
      case 51: endAngle = parseFloat(value); break;
    }
  }

  return { type: 'ARC', ...base, center, radius, startAngle, endAngle };
}

function parseCircle(group: Token[]): DXFCircle {
  const base = readBase(group);
  const center: DXFPoint = { x: 0, y: 0 };
  let radius = 0;

  for (const [code, value] of group) {
    switch (code) {
      case 10: center.x = parseFloat(value); break;
      case 20: center.y = parseFloat(value); break;
      case 30: center.z = parseFloat(value); break;
      case 40: radius = parseFloat(value); break;
    }
  }

  return { type: 'CIRCLE', ...base, center, radius };
}

function parseLWPolyline(group: Token[]): DXFLWPolyline {
  const base = readBase(group);
  const points: DXFPoint[] = [];
  let closed = false;
  let currentPt: DXFPoint | null = null;

  for (const [code, value] of group) {
    switch (code) {
      case 10:
        // Each code-10 starts a new vertex
        if (currentPt) points.push(currentPt);
        currentPt = { x: parseFloat(value), y: 0 };
        break;
      case 20:
        if (currentPt) currentPt.y = parseFloat(value);
        break;
      case 30:
        if (currentPt) currentPt.z = parseFloat(value);
        break;
      case 70:
        closed = (parseInt(value, 10) & 1) !== 0;
        break;
    }
  }
  if (currentPt) points.push(currentPt);

  return { type: 'LWPOLYLINE', ...base, points, closed };
}

function parseText(group: Token[], mtext: boolean): DXFText {
  const base = readBase(group);
  const position: DXFPoint = { x: 0, y: 0 };
  let text = '';
  let height = 0;
  let rotation = 0;

  for (const [code, value] of group) {
    switch (code) {
      case 10: position.x = parseFloat(value); break;
      case 20: position.y = parseFloat(value); break;
      case 30: position.z = parseFloat(value); break;
      case 40: height = parseFloat(value); break;
      case 1: text = value; break;
      case 50: rotation = parseFloat(value); break;
    }
  }

  return { type: mtext ? 'MTEXT' : 'TEXT', ...base, position, text, height, rotation };
}

function parseInsert(group: Token[]): DXFInsert {
  const base = readBase(group);
  const position: DXFPoint = { x: 0, y: 0 };
  let blockName = '';
  let scaleX = 1;
  let scaleY = 1;
  let rotation = 0;

  for (const [code, value] of group) {
    switch (code) {
      case 10: position.x = parseFloat(value); break;
      case 20: position.y = parseFloat(value); break;
      case 30: position.z = parseFloat(value); break;
      case 2: blockName = value; break;
      case 41: scaleX = parseFloat(value); break;
      case 42: scaleY = parseFloat(value); break;
      case 50: rotation = parseFloat(value); break;
    }
  }

  return { type: 'INSERT', ...base, position, blockName, scaleX, scaleY, rotation };
}

function parsePoint(group: Token[]): DXFPointEntity {
  const base = readBase(group);
  const position: DXFPoint = { x: 0, y: 0 };

  for (const [code, value] of group) {
    switch (code) {
      case 10: position.x = parseFloat(value); break;
      case 20: position.y = parseFloat(value); break;
      case 30: position.z = parseFloat(value); break;
    }
  }

  return { type: 'POINT', ...base, position };
}

/* ── Entity dispatcher ────────────────────────────────────── */

function parseEntities(tokens: Token[]): DXFEntity[] {
  const groups = splitEntityGroups(tokens);
  const entities: DXFEntity[] = [];

  for (const group of groups) {
    if (group.length === 0) continue;
    const entityType = group[0][1].toUpperCase();

    switch (entityType) {
      case 'LINE':       entities.push(parseLine(group)); break;
      case 'ARC':        entities.push(parseArc(group)); break;
      case 'CIRCLE':     entities.push(parseCircle(group)); break;
      case 'LWPOLYLINE': entities.push(parseLWPolyline(group)); break;
      case 'TEXT':        entities.push(parseText(group, false)); break;
      case 'MTEXT':       entities.push(parseText(group, true)); break;
      case 'INSERT':      entities.push(parseInsert(group)); break;
      case 'POINT':       entities.push(parsePoint(group)); break;
      // unknown entity types are silently skipped
    }
  }

  return entities;
}

/* ── Bounds calculator ────────────────────────────────────── */

function computeBounds(entities: DXFEntity[]): ParsedDXF['bounds'] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const track = (p: DXFPoint) => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  };

  const trackCircularBounds = (cx: number, cy: number, r: number) => {
    if (cx - r < minX) minX = cx - r;
    if (cy - r < minY) minY = cy - r;
    if (cx + r > maxX) maxX = cx + r;
    if (cy + r > maxY) maxY = cy + r;
  };

  for (const e of entities) {
    switch (e.type) {
      case 'LINE':
        track(e.start);
        track(e.end);
        break;
      case 'ARC':
        // Conservative: use full circle bounds for arcs
        trackCircularBounds(e.center.x, e.center.y, e.radius);
        break;
      case 'CIRCLE':
        trackCircularBounds(e.center.x, e.center.y, e.radius);
        break;
      case 'LWPOLYLINE':
        for (const p of e.points) track(p);
        break;
      case 'TEXT':
      case 'MTEXT':
        track(e.position);
        break;
      case 'INSERT':
        track(e.position);
        break;
      case 'POINT':
        track(e.position);
        break;
    }
  }

  // If no entities, default to 0-bounds
  if (minX === Infinity) {
    minX = minY = maxX = maxY = 0;
  }

  return { minX, minY, maxX, maxY };
}

/* ── Main entry point ─────────────────────────────────────── */

export function parseDXF(text: string): ParsedDXF {
  // Strip BOM
  const clean = text.replace(/^\uFEFF/, '');

  const tokens = tokenize(clean);
  const sections = splitSections(tokens);

  const header = parseHeader(sections.HEADER);
  const layers = parseLayers(sections.TABLES);
  const entities = parseEntities(sections.ENTITIES);
  const bounds = computeBounds(entities);

  return { header, layers, entities, bounds };
}
