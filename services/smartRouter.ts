/**
 * Smart Router — 병목 우회 + 부하 분산 지능형 라우팅
 *
 * 기존 routing.ts(BFS 최단경로)를 대체하지 않고 독립 모듈로 작동.
 * 핵심: 노드별 케이블 부하(통과량)를 실시간 추적하면서
 * 병목 구간을 자동 우회하는 경로를 찾음.
 *
 * 알고리즘: 가중치 기반 Dijkstra + 동적 부하 패널티
 *   - 기본 가중치 = linkLength (물리적 거리)
 *   - 부하 패널티 = 해당 노드를 이미 통과하는 케이블 수에 비례
 *   - 결과: 약간 더 긴 경로지만 부하가 분산된 경로
 */

import type { CableData, NodeData } from '../types';

// ─── 타입 정의 ──────────────────────────────────────────────────

export interface SmartRouterOptions {
  /** 부하 분산 강도 (0 = 최단경로만, 1 = 강한 우회). 기본 0.5 */
  loadBalanceFactor: number;
  /** 노드당 최대 허용 케이블 수. 초과 시 강제 우회 시도. 기본 80 */
  maxCablesPerNode: number;
  /** 최대 우회 비율. 최단경로 대비 이 비율까지 우회 허용. 기본 1.5 (50% 더 긴 경로까지) */
  maxDetourRatio: number;
  /** 시스템별 분리 고려. true면 POWER/SIGNAL 혼재 노드에 패널티 부여 */
  systemSeparation: boolean;
  /** 배치 순서 최적화. true면 부하가 균등하도록 케이블 순서 자동 조정 */
  optimizeBatchOrder: boolean;
}

export interface SmartRouteResult {
  cable: CableData;
  path: string[] | null;
  pathLength: number;        // 노드 수 (hop count)
  physicalLength: number;    // 물리적 길이 (linkLength 합)
  shortestLength: number;    // 최단경로 물리적 길이
  detourRatio: number;       // physicalLength / shortestLength
  congestionScore: number;   // 경로의 평균 혼잡도 (0~1)
  alternativePaths?: string[][];  // 대안 경로 목록
}

export interface SmartRouterReport {
  timestamp: string;
  totalCables: number;
  routedCount: number;
  failedCount: number;
  results: SmartRouteResult[];

  // 부하 분산 통계
  loadBalance: {
    before: NodeLoadStats;   // 분산 전 (최단경로 기준)
    after: NodeLoadStats;    // 분산 후 (스마트 라우팅)
    improvement: number;     // 개선율 %
  };

  // 병목 노드 (상위 10개)
  bottlenecks: { nodeName: string; cableCount: number; capacity: number; utilization: number }[];

  // 우회 통계
  detourStats: {
    totalDetoured: number;          // 우회된 케이블 수
    avgDetourRatio: number;         // 평균 우회 비율
    maxDetourRatio: number;         // 최대 우회 비율
    totalExtraLength: number;       // 추가된 총 길이
  };
}

interface NodeLoadStats {
  maxLoad: number;
  avgLoad: number;
  stdDev: number;
  overloadedNodes: number;   // maxCablesPerNode 초과 노드 수
}

// ─── 그래프 구조 ──────────────────────────────────────────────────

interface WeightedEdge {
  to: string;
  baseWeight: number;    // 물리적 거리 (linkLength)
}

interface WeightedGraph {
  adjacency: Map<string, WeightedEdge[]>;
  nodeData: Map<string, NodeData>;
}

function buildWeightedGraph(nodes: NodeData[]): WeightedGraph {
  const adjacency = new Map<string, WeightedEdge[]>();
  const nodeData = new Map<string, NodeData>();

  nodes.forEach(node => {
    nodeData.set(node.name, node);
    if (!adjacency.has(node.name)) adjacency.set(node.name, []);

    if (!node.relation) return;
    const neighbors = node.relation.split(',').map(s => s.trim()).filter(Boolean);

    neighbors.forEach(nb => {
      const nbNode = nodes.find(n => n.name === nb);
      // 거리: linkLength가 있으면 사용, 없으면 좌표 기반, 없으면 기본값 1
      let dist = node.linkLength || 1;
      if (node.x != null && node.z != null && nbNode?.x != null && nbNode?.z != null) {
        dist = Math.sqrt((node.x - nbNode.x) ** 2 + (node.z - nbNode.z) ** 2);
        // 스케일 보정 (mm → m 근사)
        if (dist > 100) dist /= 1000;
      }

      adjacency.get(node.name)!.push({ to: nb, baseWeight: Math.max(dist, 0.1) });

      // 양방향
      if (!adjacency.has(nb)) adjacency.set(nb, []);
      const existing = adjacency.get(nb)!.find(e => e.to === node.name);
      if (!existing) {
        adjacency.get(nb)!.push({ to: node.name, baseWeight: Math.max(dist, 0.1) });
      }
    });
  });

  return { adjacency, nodeData };
}

// ─── 노드 부하 추적기 ──────────────────────────────────────────────

class NodeLoadTracker {
  private loads: Map<string, number> = new Map();
  private systemLoads: Map<string, Set<string>> = new Map(); // nodeName → Set<system>

  getLoad(nodeName: string): number {
    return this.loads.get(nodeName) || 0;
  }

  getSystems(nodeName: string): Set<string> {
    return this.systemLoads.get(nodeName) || new Set();
  }

  addCableToPath(path: string[], system?: string): void {
    path.forEach(nodeName => {
      this.loads.set(nodeName, (this.loads.get(nodeName) || 0) + 1);
      if (system) {
        if (!this.systemLoads.has(nodeName)) this.systemLoads.set(nodeName, new Set());
        this.systemLoads.get(nodeName)!.add(system);
      }
    });
  }

  removeCableFromPath(path: string[]): void {
    path.forEach(nodeName => {
      const current = this.loads.get(nodeName) || 0;
      if (current > 0) this.loads.set(nodeName, current - 1);
    });
  }

  getStats(maxCapacity: number): NodeLoadStats {
    const values = Array.from(this.loads.values());
    if (values.length === 0) return { maxLoad: 0, avgLoad: 0, stdDev: 0, overloadedNodes: 0 };

    const max = Math.max(...values);
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
    const overloaded = values.filter(v => v > maxCapacity).length;

    return { maxLoad: max, avgLoad: avg, stdDev: Math.sqrt(variance), overloadedNodes: overloaded };
  }

  getTopLoaded(n: number): { nodeName: string; count: number }[] {
    return Array.from(this.loads.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([nodeName, count]) => ({ nodeName, count }));
  }

  clone(): NodeLoadTracker {
    const copy = new NodeLoadTracker();
    this.loads.forEach((v, k) => copy.loads.set(k, v));
    this.systemLoads.forEach((v, k) => copy.systemLoads.set(k, new Set(v)));
    return copy;
  }
}

// ─── 가중치 Dijkstra (부하 반영) ──────────────────────────────────

interface DijkstraResult {
  path: string[] | null;
  totalWeight: number;
}

function dijkstraWithLoad(
  graph: WeightedGraph,
  start: string,
  end: string,
  loadTracker: NodeLoadTracker,
  options: SmartRouterOptions,
  cableSystem?: string,
): DijkstraResult {
  if (start === end) return { path: [start], totalWeight: 0 };
  if (!graph.adjacency.has(start) || !graph.adjacency.has(end)) {
    return { path: null, totalWeight: Infinity };
  }

  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const visited = new Set<string>();

  // 간단한 우선순위 큐 (배열 기반)
  const pq: { node: string; priority: number }[] = [];

  dist.set(start, 0);
  pq.push({ node: start, priority: 0 });

  while (pq.length > 0) {
    // 최소 priority 추출
    pq.sort((a, b) => a.priority - b.priority);
    const { node: current } = pq.shift()!;

    if (visited.has(current)) continue;
    visited.add(current);

    if (current === end) break;

    const edges = graph.adjacency.get(current) || [];
    for (const edge of edges) {
      if (visited.has(edge.to)) continue;

      // 가중치 계산: 기본 거리 + 부하 패널티
      let weight = edge.baseWeight;

      // 부하 패널티: 이미 많은 케이블이 통과하는 노드에 추가 비용
      const load = loadTracker.getLoad(edge.to);
      const loadPenalty = load * options.loadBalanceFactor * edge.baseWeight * 0.1;
      weight += loadPenalty;

      // 용량 초과 패널티: maxCablesPerNode 초과 시 매우 큰 패널티
      if (load >= options.maxCablesPerNode) {
        weight += edge.baseWeight * 10; // 10배 패널티
      }

      // 시스템 분리 패널티: POWER 케이블인데 SIGNAL만 있는 노드 (또는 반대)
      if (options.systemSeparation && cableSystem) {
        const existingSystems = loadTracker.getSystems(edge.to);
        if (existingSystems.size > 0) {
          const cableCategory = categorizeSystem(cableSystem);
          const hasConflict = Array.from(existingSystems).some(s =>
            categorizeSystem(s) !== cableCategory && categorizeSystem(s) !== 'SPECIAL'
          );
          if (hasConflict) {
            weight += edge.baseWeight * 2; // 혼재 시 2배 패널티
          }
        }
      }

      const newDist = (dist.get(current) ?? Infinity) + weight;
      if (newDist < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, newDist);
        prev.set(edge.to, current);
        pq.push({ node: edge.to, priority: newDist });
      }
    }
  }

  // 경로 복원
  if (!prev.has(end) && start !== end) {
    return { path: null, totalWeight: Infinity };
  }

  const path: string[] = [];
  let curr: string | undefined = end;
  while (curr) {
    path.unshift(curr);
    curr = prev.get(curr);
  }

  return { path, totalWeight: dist.get(end) ?? Infinity };
}

function categorizeSystem(system: string): 'POWER' | 'SIGNAL' | 'SPECIAL' {
  const s = (system || '').toUpperCase();
  if (s === 'POWER' || s === 'LTG') return 'POWER';
  if (s === 'FIRE') return 'SPECIAL';
  return 'SIGNAL';
}

// ─── 물리적 경로 길이 계산 ──────────────────────────────────────────

function calculatePhysicalLength(path: string[], graph: WeightedGraph): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const edges = graph.adjacency.get(path[i]) || [];
    const edge = edges.find(e => e.to === path[i + 1]);
    total += edge?.baseWeight || 1;
  }
  return total;
}

// ─── 대안 경로 생성 (K-shortest paths, 간단 버전) ──────────────────

function findAlternativePaths(
  graph: WeightedGraph,
  start: string,
  end: string,
  mainPath: string[],
  loadTracker: NodeLoadTracker,
  options: SmartRouterOptions,
  k: number = 3,
): string[][] {
  const alternatives: string[][] = [];
  const tempTracker = loadTracker.clone();

  // 메인 경로의 중간 노드를 하나씩 차단하여 우회 경로 탐색
  for (let i = 1; i < mainPath.length - 1 && alternatives.length < k; i++) {
    const blockedNode = mainPath[i];

    // 임시로 해당 노드에 극단적 부하 추가
    for (let j = 0; j < 1000; j++) {
      tempTracker.addCableToPath([blockedNode]);
    }

    const result = dijkstraWithLoad(graph, start, end, tempTracker, options);

    if (result.path && result.path.join(',') !== mainPath.join(',')) {
      // 최단경로 대비 너무 길지 않은지 확인
      const altLength = calculatePhysicalLength(result.path, graph);
      const mainLength = calculatePhysicalLength(mainPath, graph);
      if (mainLength > 0 && altLength / mainLength <= options.maxDetourRatio) {
        alternatives.push(result.path);
      }
    }

    // 복원
    for (let j = 0; j < 1000; j++) {
      tempTracker.removeCableFromPath([blockedNode]);
    }
  }

  return alternatives;
}

// ─── BFS 최단경로 (비교용) ──────────────────────────────────────────

function bfsShortestPath(graph: WeightedGraph, start: string, end: string): string[] | null {
  if (start === end) return [start];
  if (!graph.adjacency.has(start) || !graph.adjacency.has(end)) return null;

  const queue = [start];
  const visited = new Set([start]);
  const parent = new Map<string, string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === end) {
      const path: string[] = [];
      let c: string | undefined = end;
      while (c) { path.unshift(c); c = parent.get(c); }
      return path;
    }
    for (const edge of graph.adjacency.get(current) || []) {
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        parent.set(edge.to, current);
        queue.push(edge.to);
      }
    }
  }
  return null;
}

// ─── 메인 함수: 스마트 라우팅 ──────────────────────────────────────

export const DEFAULT_OPTIONS: SmartRouterOptions = {
  loadBalanceFactor: 0.5,
  maxCablesPerNode: 80,
  maxDetourRatio: 1.5,
  systemSeparation: true,
  optimizeBatchOrder: true,
};

export function smartRoute(
  cables: CableData[],
  nodes: NodeData[],
  options: Partial<SmartRouterOptions> = {},
): SmartRouterReport {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const graph = buildWeightedGraph(nodes);

  // 배치 순서 최적화: 긴 케이블부터 라우팅 (더 나은 분산)
  const sortedCables = opts.optimizeBatchOrder
    ? [...cables].sort((a, b) => {
        // 1순위: 길이 내림차순 (긴 케이블 먼저 — 선택지가 줄기 전에)
        const lenA = a.calculatedLength || a.length || 0;
        const lenB = b.calculatedLength || b.length || 0;
        if (lenB !== lenA) return lenB - lenA;
        // 2순위: 시스템별 그룹핑 (같은 시스템끼리)
        return (a.system || '').localeCompare(b.system || '');
      })
    : [...cables];

  const loadTracker = new NodeLoadTracker();
  const beforeTracker = new NodeLoadTracker(); // BFS 최단경로 부하 (비교용)
  const results: SmartRouteResult[] = [];
  let routedCount = 0;
  let failedCount = 0;

  // 1단계: 모든 케이블에 대해 스마트 경로 계산
  for (const cable of sortedCables) {
    if (!cable.fromNode || !cable.toNode) {
      results.push({
        cable, path: null, pathLength: 0, physicalLength: 0,
        shortestLength: 0, detourRatio: 1, congestionScore: 0,
      });
      failedCount++;
      continue;
    }

    // checkNode 처리
    let fullPath: string[] | null = null;

    if (cable.checkNode) {
      const checks = cable.checkNode.split(',').map(s => s.trim()).filter(Boolean);
      const segments: string[][] = [];
      let currentStart = cable.fromNode;
      let valid = true;

      for (const check of checks) {
        const seg = dijkstraWithLoad(graph, currentStart, check, loadTracker, opts, cable.system);
        if (seg.path) {
          segments.push(seg.path);
          currentStart = check;
        } else { valid = false; break; }
      }

      if (valid) {
        const finalSeg = dijkstraWithLoad(graph, currentStart, cable.toNode, loadTracker, opts, cable.system);
        if (finalSeg.path) {
          segments.push(finalSeg.path);
          // 세그먼트 병합 (중복 노드 제거)
          fullPath = segments[0];
          for (let i = 1; i < segments.length; i++) {
            fullPath = [...fullPath, ...segments[i].slice(1)];
          }
        }
      }
    } else {
      const result = dijkstraWithLoad(graph, cable.fromNode, cable.toNode, loadTracker, opts, cable.system);
      fullPath = result.path;
    }

    // BFS 최단경로 (비교용)
    const shortestPath = bfsShortestPath(graph, cable.fromNode, cable.toNode);
    const shortestLength = shortestPath ? calculatePhysicalLength(shortestPath, graph) : 0;

    if (shortestPath) {
      beforeTracker.addCableToPath(shortestPath, cable.system);
    }

    if (fullPath) {
      const physLength = calculatePhysicalLength(fullPath, graph);
      loadTracker.addCableToPath(fullPath, cable.system);

      // 혼잡도 점수 계산
      const pathLoads = fullPath.map(n => loadTracker.getLoad(n));
      const maxLoad = Math.max(...pathLoads);
      const congestion = Math.min(maxLoad / opts.maxCablesPerNode, 1);

      results.push({
        cable,
        path: fullPath,
        pathLength: fullPath.length,
        physicalLength: physLength,
        shortestLength,
        detourRatio: shortestLength > 0 ? physLength / shortestLength : 1,
        congestionScore: congestion,
      });
      routedCount++;
    } else {
      results.push({
        cable, path: null, pathLength: 0, physicalLength: 0,
        shortestLength, detourRatio: 1, congestionScore: 0,
      });
      failedCount++;
    }
  }

  // 2단계: 통계 계산
  const afterStats = loadTracker.getStats(opts.maxCablesPerNode);
  const beforeStats = beforeTracker.getStats(opts.maxCablesPerNode);

  // 개선율: 표준편차 감소율
  const improvement = beforeStats.stdDev > 0
    ? ((beforeStats.stdDev - afterStats.stdDev) / beforeStats.stdDev) * 100
    : 0;

  // 병목 노드
  const topLoaded = loadTracker.getTopLoaded(10);
  const bottlenecks = topLoaded.map(({ nodeName, count }) => ({
    nodeName,
    cableCount: count,
    capacity: opts.maxCablesPerNode,
    utilization: count / opts.maxCablesPerNode,
  }));

  // 우회 통계
  const detoured = results.filter(r => r.detourRatio > 1.01);
  const detourStats = {
    totalDetoured: detoured.length,
    avgDetourRatio: detoured.length > 0
      ? detoured.reduce((s, r) => s + r.detourRatio, 0) / detoured.length : 1,
    maxDetourRatio: detoured.length > 0
      ? Math.max(...detoured.map(r => r.detourRatio)) : 1,
    totalExtraLength: detoured.reduce((s, r) => s + (r.physicalLength - r.shortestLength), 0),
  };

  return {
    timestamp: new Date().toISOString(),
    totalCables: cables.length,
    routedCount,
    failedCount,
    results,
    loadBalance: { before: beforeStats, after: afterStats, improvement },
    bottlenecks,
    detourStats,
  };
}

/**
 * 기존 routeCables와 동일한 인터페이스로 스마트 라우팅 적용
 * 드롭인 교체 가능
 */
export function smartRouteCables(
  cables: CableData[],
  nodes: NodeData[],
  options?: Partial<SmartRouterOptions>,
): CableData[] {
  const report = smartRoute(cables, nodes, options);

  // 결과를 원본 케이블 순서대로 매핑
  const resultMap = new Map<string, SmartRouteResult>();
  report.results.forEach(r => resultMap.set(r.cable.id, r));

  return cables.map(cable => {
    const result = resultMap.get(cable.id);
    if (!result || !result.path) return cable;

    return {
      ...cable,
      calculatedPath: result.path.join(','),
      calculatedLength: result.physicalLength +
        (cable.fromRest || 0) + (cable.toRest || 0),
    };
  });
}

/**
 * 병목 분석만 수행 (라우팅 변경 없이 현재 경로의 부하 분석)
 */
export function analyzeBottlenecks(
  cables: CableData[],
  nodes: NodeData[],
  maxCapacity = 80,
): {
  bottlenecks: { nodeName: string; cableCount: number; cables: string[]; utilization: number }[];
  overloaded: number;
  totalNodes: number;
  stats: NodeLoadStats;
} {
  const tracker = new NodeLoadTracker();
  const nodeCables = new Map<string, string[]>();

  cables.forEach(cable => {
    const path = cable.calculatedPath || cable.path || '';
    if (!path) return;
    const pathNodes = path.split(/[,→>]/).map(s => s.trim()).filter(Boolean);
    tracker.addCableToPath(pathNodes, cable.system);
    pathNodes.forEach(n => {
      if (!nodeCables.has(n)) nodeCables.set(n, []);
      nodeCables.get(n)!.push(cable.name);
    });
  });

  const stats = tracker.getStats(maxCapacity);
  const topLoaded = tracker.getTopLoaded(20);

  return {
    bottlenecks: topLoaded.map(({ nodeName, count }) => ({
      nodeName,
      cableCount: count,
      cables: nodeCables.get(nodeName) || [],
      utilization: count / maxCapacity,
    })),
    overloaded: stats.overloadedNodes,
    totalNodes: nodes.length,
    stats,
  };
}
