
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

export interface CableTypeData {
  cableType: string;     // CABLE TYPE (예: D1, T1, CAT5 ...)
  od: number;            // O.D (mm)
  odHalf: number;        // O.D/2
  crossSection: number;  // 단면적 (mm²)
  weight: number;        // 무게 (kg/km)
  din: string;           // DIN 규격
  description: string;   // DESCRIPTION
  glandSize: string;     // GLAND SIZE
  terminalCore?: string; // terminal core
  terminalEa?: number;   // terminal Ea
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

// ─── Tray Fill 사전 계산 결과 ───────────────────────────────────────────────
export interface TrayFillNodeResult {
  cableCount: number;
  totalArea: number;       // mm² (케이블 단면적 합계)
  recommendedWidth: number; // 표준 트레이폭 (mm)
  fillRatio: number;       // fill 비율 (%)
}

export type TrayFillSummary = Record<string, TrayFillNodeResult>;

// ─── Admin 관련 타입 ────────────────────────────────────────────────────────

export interface UserPermissions {
  dashboard: boolean;
  cables: boolean;
  nodes: boolean;
  bom: boolean;
  routing: boolean;
  trayfill: boolean;
  view3d: boolean;
  analysis: boolean;
  history: boolean;
  project: boolean;
  cabletype: boolean;
  // 고급 메뉴
  interference: boolean;
  voltagedrop: boolean;
  classrule: boolean;
  bomAdv: boolean;
  drum: boolean;
  deckQty: boolean;
  bottleneck: boolean;
  kaveRouter: boolean;
  // 특별 권한
  canEdit: boolean;
  canExport: boolean;
  canDelete: boolean;
}

export const DEFAULT_PERMISSIONS: UserPermissions = {
  dashboard: true,
  cables: true,
  nodes: true,
  bom: true,
  routing: true,
  trayfill: true,
  view3d: true,
  analysis: true,
  history: true,
  project: true,
  cabletype: true,
  interference: false,
  voltagedrop: false,
  classrule: false,
  bomAdv: false,
  drum: false,
  deckQty: false,
  bottleneck: false,
  kaveRouter: false,
  canEdit: true,
  canExport: true,
  canDelete: false,
};

export const MENU_PERMISSIONS: Array<{
  id: keyof UserPermissions;
  label: string;
  group: '기본 메뉴' | '고급 메뉴' | '특별 권한';
}> = [
  // 기본 메뉴
  { id: 'dashboard',   label: 'Dashboard',     group: '기본 메뉴' },
  { id: 'cables',      label: 'Cable List',    group: '기본 메뉴' },
  { id: 'nodes',       label: 'Node Info',     group: '기본 메뉴' },
  { id: 'bom',         label: 'BOM',           group: '기본 메뉴' },
  { id: 'routing',     label: 'Routing',       group: '기본 메뉴' },
  { id: 'trayfill',    label: 'Tray Fill',     group: '기본 메뉴' },
  { id: 'view3d',      label: '3D View',       group: '기본 메뉴' },
  { id: 'analysis',    label: 'Analysis',      group: '기본 메뉴' },
  { id: 'history',     label: 'History',       group: '기본 메뉴' },
  { id: 'project',     label: 'Project',       group: '기본 메뉴' },
  { id: 'cabletype',   label: 'Cable Type',    group: '기본 메뉴' },
  // 고급 메뉴
  { id: 'interference', label: '간섭 검사',   group: '고급 메뉴' },
  { id: 'voltagedrop',  label: '전압강하',    group: '고급 메뉴' },
  { id: 'classrule',    label: '선급룰',      group: '고급 메뉴' },
  { id: 'bomAdv',       label: 'BOM 고급',    group: '고급 메뉴' },
  { id: 'drum',         label: '드럼 관리',   group: '고급 메뉴' },
  { id: 'deckQty',      label: '갑판 물량',   group: '고급 메뉴' },
  { id: 'bottleneck',   label: '병목 분석',   group: '고급 메뉴' },
  { id: 'kaveRouter',   label: '노드 에디터', group: '고급 메뉴' },
  // 특별 권한
  { id: 'canEdit',      label: '편집 가능',   group: '특별 권한' },
  { id: 'canExport',    label: '내보내기',     group: '특별 권한' },
  { id: 'canDelete',    label: '삭제 가능',   group: '특별 권한' },
];

export interface AdminUser {
  user_id: string;
  name: string;
  email: string;
  provider: string;
  status: 'active' | 'suspended';
  permissions: Partial<UserPermissions>;
  created_at: string;
  last_login?: string;
  last_seen?: string;
  project_count?: number;
}

export interface ApprovalRequest {
  id: string;
  user_id: string;
  name: string;
  email: string;
  company: string;
  phone: string;
  provider: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}
