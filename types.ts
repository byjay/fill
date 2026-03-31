
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
  path?: string;
  calculatedPath?: string;
  calculatedLength?: number;
  color?: string;
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
  // 3D coordinates
  x?: number;
  y?: number;
  z?: number;
  deck?: string;
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  action: 'file_upload' | 'path_calculation' | 'cable_edit' | 'manual_save' | 'data_clear';
  description: string;
  cableCount?: number;
  nodeCount?: number;
}

export interface Project {
  id: string;
  name: string;       // 호선명
  vesselNo: string;   // 호선번호
  userId: string;     // 소유자 ID (email 또는 provider:name)
  createdAt: string;
  updatedAt: string;
  cables: CableData[];
  nodes: NodeData[];
  history: HistoryEntry[];
}

export interface UserInfo {
  id: string;         // email 또는 provider_uniqueid
  name: string;
  email: string;
  provider: string;   // 'google' | 'kakao' | 'naver' | 'demo'
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
