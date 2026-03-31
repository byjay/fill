
export interface CableData {
  id: string;
  name: string;
  type: string;
  od: number;
  system?: string;
  fromNode?: string;
  toNode?: string;
  fromRoom?: string;
  toRoom?: string;
  fromEquip?: string;
  toEquip?: string;
  fromRest?: number;
  toRest?: number;
  length?: number;
  checkNode?: string;
  wdPage?: string;
  supplyDeck?: string;
  porWeight?: number;
  interference?: string;
  remark?: string;
  remark1?: string;
  remark2?: string;
  remark3?: string;
  revision?: string;
  cableWeight?: number;
  path?: string; // Original path string from user data
  calculatedPath?: string; // Parsed path for routing/logic
  calculatedLength?: number;
  color?: string;
}

export interface NodeData {
  name: string;
  structure?: string;
  component?: string;
  type?: string;
  relation?: string;
  linkLength?: number;
  areaSize?: number;
  connectedCables?: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface PlacedCable extends CableData {
  x: number;
  y: number;
  layer: number;
  displayIndex?: number;
}

export interface SingleTrayResult {
  tierIndex: number;
  width: number;
  cables: PlacedCable[];
  success: boolean;
  fillRatio: number;
  totalODSum: number;
  totalCableArea: number;
  maxStackHeight: number;
}

export interface SystemResult {
  systemWidth: number;
  tiers: SingleTrayResult[];
  success: boolean;
  maxHeightPerTier: number;
  optimizationMatrix?: MatrixCell[][];
}

export interface MatrixCell {
  tiers: number;
  width: number;
  area: number;
  fillRatio: number;
  success: boolean;
  isOptimal: boolean;
}

export const MARGIN_X = 10;
export const MAX_PILE_WIDTH = 200;
export const PILE_GAP = 10;
