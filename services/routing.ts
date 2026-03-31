
import { CableData, NodeData } from '../types';

interface GraphNode {
  name: string;
  neighbors: string[];
}

export const buildGraph = (nodes: NodeData[]): Record<string, GraphNode> => {
  const graph: Record<string, GraphNode> = {};
  nodes.forEach(node => {
    // relation: "NODE_A, NODE_B, NODE_C"
    const neighbors = node.relation 
      ? String(node.relation).split(',').map(s => s.trim()).filter(s => s) 
      : [];
    graph[node.name] = { name: node.name, neighbors };
  });
  return graph;
};

export const calculateShortestPath = (
  graph: Record<string, GraphNode>,
  start: string,
  end: string
): string[] | null => {
  if (start === end) return [start];
  if (!graph[start] || !graph[end]) return null;

  const queue: string[] = [start];
  const visited = new Set<string>();
  const parent: Record<string, string> = {};
  
  visited.add(start);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === end) {
      const path: string[] = [];
      let curr: string | undefined = end;
      while (curr) {
        path.unshift(curr);
        curr = parent[curr];
      }
      return path;
    }

    const neighbors = graph[current]?.neighbors || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        parent[neighbor] = current;
        queue.push(neighbor);
      }
    }
  }
  return null;
};

export const routeCables = (cables: CableData[], nodes: NodeData[]): CableData[] => {
  if (nodes.length === 0) return cables;

  const graph = buildGraph(nodes);
  
  return cables.map(cable => {
    if (!cable.fromNode || !cable.toNode) return cable;

    let path: string[] | null = null;

    // Check Node Logic (Checkpoint)
    if (cable.checkNode) {
        const checks = cable.checkNode.split(',').map(s => s.trim()).filter(s => s);
        if (checks.length > 0) {
            const fullPath: string[] = [];
            let currentStart = cable.fromNode;
            let valid = true;

            // From Start -> Check1 -> Check2 ... -> End
            for (const check of checks) {
                const seg = calculateShortestPath(graph, currentStart, check);
                if (seg) {
                    if (fullPath.length > 0) fullPath.pop(); // Remove duplicate junction
                    fullPath.push(...seg);
                    currentStart = check;
                } else {
                    valid = false;
                    break;
                }
            }
            
            if (valid) {
                const finalSeg = calculateShortestPath(graph, currentStart, cable.toNode);
                if (finalSeg) {
                    if (fullPath.length > 0) fullPath.pop();
                    fullPath.push(...finalSeg);
                    path = fullPath;
                }
            }
        } else {
            path = calculateShortestPath(graph, cable.fromNode, cable.toNode);
        }
    } else {
        path = calculateShortestPath(graph, cable.fromNode, cable.toNode);
    }

    return {
      ...cable,
      calculatedPath: path ? path.join(',') : undefined
    };
  });
};
