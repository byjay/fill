/**
 * pathValidator.ts
 * ────────────────────────────────────────────────────────────
 * PATH VALIDATION service for the SCMS cable management system.
 * Checks for broken / invalid cable paths through a node network.
 *
 * Pure TypeScript — no external dependencies.
 */

import { CableData, NodeData } from '../types';

// ─── Graph Types ──────────────────────────────────────────────────────────────

export interface GraphNode {
  name: string;
  neighbors: Set<string>;
  nodeData: NodeData;
}

// ─── Issue / Stats / Summary Types ────────────────────────────────────────────

export interface PathIssue {
  cableName: string;
  cableFrom: string;
  cableTo: string;
  issueType:
    | 'missing_from_node'
    | 'missing_to_node'
    | 'broken_link'
    | 'disconnected_components'
    | 'missing_path_node'
    | 'no_path';
  description: string;
  severity: 'error' | 'warning';
  affectedNodes: string[];
}

export interface NodeStats {
  totalNodes: number;
  connectedComponents: number;
  isolatedNodes: string[];
  mostConnectedNodes: { name: string; connectionCount: number }[];
  orphanedNodes: string[];
}

export interface ValidationSummary {
  totalCables: number;
  validPaths: number;
  brokenPaths: number;
  issues: PathIssue[];
  stats: NodeStats;
}

// ─── 1. Graph Building ───────────────────────────────────────────────────────

/**
 * Build a bidirectional adjacency map from node relation strings.
 *
 * Each node's `relation` field is a comma-separated list of neighbor names,
 * e.g. "NODE_A, NODE_B".  Both directions are recorded so the graph is
 * always undirected.
 */
export function buildGraph(nodes: NodeData[]): Map<string, GraphNode> {
  const graph = new Map<string, GraphNode>();

  // First pass — create every node entry.
  for (const nd of nodes) {
    const trimmed = nd.name.trim();
    if (!trimmed) continue;
    graph.set(trimmed, {
      name: trimmed,
      neighbors: new Set<string>(),
      nodeData: nd,
    });
  }

  // Second pass — wire up relations (bidirectional).
  for (const nd of nodes) {
    const srcName = nd.name.trim();
    if (!srcName || !nd.relation) continue;

    const src = graph.get(srcName);
    if (!src) continue;

    const neighbors = nd.relation
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const nbr of neighbors) {
      src.neighbors.add(nbr);

      // Ensure the reverse edge exists even if the neighbor wasn't listed
      // as a separate node (defensive).
      const dst = graph.get(nbr);
      if (dst) {
        dst.neighbors.add(srcName);
      }
    }
  }

  return graph;
}

// ─── 2. Connected Components (BFS) ───────────────────────────────────────────

/**
 * Return every connected component as an array of node-name arrays.
 * Uses iterative BFS to avoid stack-overflow on large graphs.
 */
export function findConnectedComponents(
  graph: Map<string, GraphNode>,
): string[][] {
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const nodeName of graph.keys()) {
    if (visited.has(nodeName)) continue;

    const component: string[] = [];
    const queue: string[] = [nodeName];
    visited.add(nodeName);

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);

      const gn = graph.get(current);
      if (!gn) continue;

      for (const nbr of gn.neighbors) {
        if (!visited.has(nbr) && graph.has(nbr)) {
          visited.add(nbr);
          queue.push(nbr);
        }
      }
    }

    components.push(component);
  }

  return components;
}

// ─── Helper: parse a calculatedPath string ───────────────────────────────────

/**
 * Accepts both comma-separated ("N01,N02,N03") and arrow-separated
 * ("N01 → N02 → N03") formats.  Returns trimmed node names.
 */
function parsePath(raw: string): string[] {
  // Normalise arrow variants (→, ->, ➜ etc.) to comma, then split.
  const normalised = raw.replace(/\s*[→➜➝⟶]\s*/g, ',').replace(/\s*->\s*/g, ',');
  return normalised
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// ─── 3. Path Validation ─────────────────────────────────────────────────────

/**
 * Validate every cable's path against the node graph.
 *
 * Checks performed (in order for each cable):
 *  1. missing_from_node   — fromNode not in the graph
 *  2. missing_to_node     — toNode not in the graph
 *  3. no_path             — cable has from/to but no calculatedPath
 *  4. missing_path_node   — a node inside calculatedPath doesn't exist
 *  5. broken_link         — consecutive nodes in the path are not neighbors
 *  6. disconnected_components — from and to live in separate components
 */
export function validatePaths(
  cables: CableData[],
  nodes: NodeData[],
): PathIssue[] {
  const graph = buildGraph(nodes);
  const components = findConnectedComponents(graph);

  // Build a quick lookup:  nodeName → component index
  const nodeToComponent = new Map<string, number>();
  components.forEach((comp, idx) => {
    for (const n of comp) {
      nodeToComponent.set(n, idx);
    }
  });

  const issues: PathIssue[] = [];

  for (const cable of cables) {
    const cableName = cable.name || '(unnamed)';
    const from = cable.fromNode?.trim() || '';
    const to = cable.toNode?.trim() || '';

    // 1. missing_from_node
    if (from && !graph.has(from)) {
      issues.push({
        cableName,
        cableFrom: from,
        cableTo: to,
        issueType: 'missing_from_node',
        description: `Cable "${cableName}": fromNode "${from}" does not exist in the node list.`,
        severity: 'error',
        affectedNodes: [from],
      });
    }

    // 2. missing_to_node
    if (to && !graph.has(to)) {
      issues.push({
        cableName,
        cableFrom: from,
        cableTo: to,
        issueType: 'missing_to_node',
        description: `Cable "${cableName}": toNode "${to}" does not exist in the node list.`,
        severity: 'error',
        affectedNodes: [to],
      });
    }

    // Determine which path string to validate
    const pathStr = cable.calculatedPath || cable.path || '';

    // 3. no_path
    if (from && to && !pathStr) {
      issues.push({
        cableName,
        cableFrom: from,
        cableTo: to,
        issueType: 'no_path',
        description: `Cable "${cableName}": has fromNode and toNode but no calculated path.`,
        severity: 'warning',
        affectedNodes: [from, to],
      });
    }

    // If a path string exists, validate its internals
    if (pathStr) {
      const pathNodes = parsePath(pathStr);

      // 4. missing_path_node
      const missingInPath: string[] = [];
      for (const pn of pathNodes) {
        if (!graph.has(pn)) {
          missingInPath.push(pn);
        }
      }
      if (missingInPath.length > 0) {
        issues.push({
          cableName,
          cableFrom: from,
          cableTo: to,
          issueType: 'missing_path_node',
          description: `Cable "${cableName}": path references non-existent node(s): ${missingInPath.join(', ')}.`,
          severity: 'error',
          affectedNodes: missingInPath,
        });
      }

      // 5. broken_link — check each consecutive pair
      for (let i = 0; i < pathNodes.length - 1; i++) {
        const a = pathNodes[i];
        const b = pathNodes[i + 1];
        const gnA = graph.get(a);
        if (!gnA || !gnA.neighbors.has(b)) {
          issues.push({
            cableName,
            cableFrom: from,
            cableTo: to,
            issueType: 'broken_link',
            description: `Cable "${cableName}": no relation between consecutive path nodes "${a}" and "${b}".`,
            severity: 'error',
            affectedNodes: [a, b],
          });
        }
      }
    }

    // 6. disconnected_components
    if (from && to && graph.has(from) && graph.has(to)) {
      const compFrom = nodeToComponent.get(from);
      const compTo = nodeToComponent.get(to);
      if (compFrom !== undefined && compTo !== undefined && compFrom !== compTo) {
        issues.push({
          cableName,
          cableFrom: from,
          cableTo: to,
          issueType: 'disconnected_components',
          description: `Cable "${cableName}": fromNode "${from}" and toNode "${to}" are in different connected components (no possible path).`,
          severity: 'error',
          affectedNodes: [from, to],
        });
      }
    }
  }

  return issues;
}

// ─── 4. Node Statistics ─────────────────────────────────────────────────────

/**
 * Compute statistics about the node network relative to the cable list.
 */
export function analyzeNodes(
  cables: CableData[],
  nodes: NodeData[],
): NodeStats {
  const graph = buildGraph(nodes);
  const components = findConnectedComponents(graph);

  // Isolated nodes — zero neighbors
  const isolatedNodes: string[] = [];
  for (const [name, gn] of graph) {
    if (gn.neighbors.size === 0) {
      isolatedNodes.push(name);
    }
  }

  // Most connected — sort descending by neighbor count, take top 10
  const sorted = Array.from(graph.values())
    .map((gn) => ({ name: gn.name, connectionCount: gn.neighbors.size }))
    .sort((a, b) => b.connectionCount - a.connectionCount);
  const mostConnectedNodes = sorted.slice(0, 10);

  // Orphaned nodes — nodes that are never referenced as fromNode, toNode,
  // or anywhere inside a cable's calculatedPath / path / checkNode.
  const referencedByAnyCable = new Set<string>();
  for (const cable of cables) {
    if (cable.fromNode) referencedByAnyCable.add(cable.fromNode.trim());
    if (cable.toNode) referencedByAnyCable.add(cable.toNode.trim());
    if (cable.checkNode) {
      cable.checkNode
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((n) => referencedByAnyCable.add(n));
    }
    const pathStr = cable.calculatedPath || cable.path || '';
    if (pathStr) {
      parsePath(pathStr).forEach((n) => referencedByAnyCable.add(n));
    }
  }

  const orphanedNodes: string[] = [];
  for (const name of graph.keys()) {
    if (!referencedByAnyCable.has(name)) {
      orphanedNodes.push(name);
    }
  }

  return {
    totalNodes: graph.size,
    connectedComponents: components.length,
    isolatedNodes,
    mostConnectedNodes,
    orphanedNodes,
  };
}

// ─── 5. Full Validation Summary ──────────────────────────────────────────────

/**
 * Run the complete validation pipeline and return a single summary object.
 */
export function runFullValidation(
  cables: CableData[],
  nodes: NodeData[],
): ValidationSummary {
  const issues = validatePaths(cables, nodes);
  const stats = analyzeNodes(cables, nodes);

  // A cable is "broken" if it has at least one issue with severity 'error'.
  const brokenCableNames = new Set<string>();
  for (const issue of issues) {
    if (issue.severity === 'error') {
      brokenCableNames.add(issue.cableName);
    }
  }

  return {
    totalCables: cables.length,
    validPaths: cables.length - brokenCableNames.size,
    brokenPaths: brokenCableNames.size,
    issues,
    stats,
  };
}
