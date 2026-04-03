import { useState, useMemo, useCallback } from 'react';
import { NodeData } from '../types';

export type EditorMode = 'select' | 'place' | 'connect';
export type AxisLock = 'none' | 'x' | 'y' | 'z';
export type ViewMode = 'plan' | 'section' | 'elevation' | 'iso';

interface UseNodeEditorOptions {
  nodes: NodeData[];
  onNodeEdit: (nodeName: string, updated: Partial<NodeData>) => void;
  onNodesUpdate: (newNodes: NodeData[], description?: string) => void;
}

export function useNodeEditor({ nodes, onNodeEdit, onNodesUpdate }: UseNodeEditorOptions) {
  const [mode, setMode] = useState<EditorMode>('select');
  const [axisLock, setAxisLock] = useState<AxisLock>('none');
  const [viewMode, setViewMode] = useState<ViewMode>('plan');
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [activeDeck, setActiveDeck] = useState<string>('all');
  const [newNodeName, setNewNodeName] = useState('');
  const [nodeCounter, setNodeCounter] = useState(1);

  // 사용 가능한 Deck 목록
  const availableDecks = useMemo(() => {
    const decks = new Set<string>();
    nodes.forEach(n => { if (n.deck) decks.add(n.deck); });
    return ['all', ...Array.from(decks).sort()];
  }, [nodes]);

  // 노드 맵 (이름 → NodeData)
  const nodeMap = useMemo(() => {
    const map = new Map<string, NodeData>();
    nodes.forEach(n => map.set(n.name, n));
    return map;
  }, [nodes]);

  // 연결 엣지 (중복 제거)
  const edges = useMemo(() => {
    const edgeSet = new Set<string>();
    const result: [string, string][] = [];
    nodes.forEach(node => {
      if (!node.relation) return;
      const neighbors = node.relation.split(',').map(s => s.trim()).filter(Boolean);
      neighbors.forEach(nb => {
        const key = [node.name, nb].sort().join('|');
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          result.push([node.name, nb]);
        }
      });
    });
    return result;
  }, [nodes]);

  // 필터된 노드 (Deck 필터)
  const visibleNodes = useMemo(() => {
    if (activeDeck === 'all') return nodes;
    return nodes.filter(n => n.deck === activeDeck);
  }, [nodes, activeDeck]);

  // ── 포인트 배치 ──────────────────────────
  const placeNode = useCallback((x: number, z: number) => {
    const name = newNodeName.trim() || `N_${String(nodeCounter).padStart(3, '0')}`;
    // 이름 중복 검사
    if (nodeMap.has(name)) {
      const suffix = `_${Date.now() % 1000}`;
      const uniqueName = name + suffix;
      const newNode: NodeData = {
        name: uniqueName,
        deck: activeDeck !== 'all' ? activeDeck : undefined,
        x, y: 0, z,
      };
      onNodesUpdate([...nodes, newNode], `노드 배치: ${uniqueName}`);
      setSelectedNodes(new Set([uniqueName]));
      setNodeCounter(prev => prev + 1);
      setNewNodeName('');
      return;
    }
    const newNode: NodeData = {
      name,
      deck: activeDeck !== 'all' ? activeDeck : undefined,
      x, y: 0, z,
    };
    onNodesUpdate([...nodes, newNode], `노드 배치: ${name}`);
    setSelectedNodes(new Set([name]));
    setNodeCounter(prev => prev + 1);
    setNewNodeName('');
  }, [newNodeName, nodeCounter, activeDeck, nodes, nodeMap, onNodesUpdate]);

  // ── 노드 이동 ──────────────────────────
  const moveNode = useCallback((name: string, x: number, z: number) => {
    onNodeEdit(name, { x, z });
  }, [onNodeEdit]);

  // ── 노드 연결 ──────────────────────────
  const connectNodes = useCallback((fromName: string, toName: string) => {
    if (fromName === toName) return;
    const fromNode = nodeMap.get(fromName);
    const toNode = nodeMap.get(toName);
    if (!fromNode || !toNode) return;

    // 기존 relation에 추가 (중복 방지)
    const addRelation = (existing: string | undefined, target: string): string => {
      const parts = existing ? existing.split(',').map(s => s.trim()).filter(Boolean) : [];
      if (parts.includes(target)) return existing || '';
      parts.push(target);
      return parts.join(', ');
    };

    const newNodes = nodes.map(n => {
      if (n.name === fromName) return { ...n, relation: addRelation(n.relation, toName) };
      if (n.name === toName) return { ...n, relation: addRelation(n.relation, fromName) };
      return n;
    });
    onNodesUpdate(newNodes, `노드 연결: ${fromName} ↔ ${toName}`);
    setConnectingFrom(null);
  }, [nodes, nodeMap, onNodesUpdate]);

  // ── 연결 해제 ──────────────────────────
  const disconnectNodes = useCallback((fromName: string, toName: string) => {
    const removeRelation = (existing: string | undefined, target: string): string => {
      if (!existing) return '';
      return existing.split(',').map(s => s.trim()).filter(s => s && s !== target).join(', ');
    };
    const newNodes = nodes.map(n => {
      if (n.name === fromName) return { ...n, relation: removeRelation(n.relation, toName) };
      if (n.name === toName) return { ...n, relation: removeRelation(n.relation, fromName) };
      return n;
    });
    onNodesUpdate(newNodes, `연결 해제: ${fromName} ↔ ${toName}`);
  }, [nodes, onNodesUpdate]);

  // ── 선택 노드 삭제 ──────────────────────
  const deleteSelected = useCallback(() => {
    if (selectedNodes.size === 0) return;
    // 삭제 대상 목록
    const toDelete = selectedNodes;
    // relation에서도 제거
    const newNodes = nodes
      .filter(n => !toDelete.has(n.name))
      .map(n => {
        if (!n.relation) return n;
        const cleaned = n.relation.split(',').map(s => s.trim()).filter(s => s && !toDelete.has(s)).join(', ');
        return { ...n, relation: cleaned || undefined };
      });
    onNodesUpdate(newNodes, `노드 ${toDelete.size}개 삭제`);
    setSelectedNodes(new Set());
  }, [selectedNodes, nodes, onNodesUpdate]);

  // ── 선택 노드 복사 ──────────────────────
  const copySelected = useCallback(() => {
    if (selectedNodes.size === 0) return;
    const copies: NodeData[] = [];
    const nameMapping = new Map<string, string>();
    selectedNodes.forEach(name => {
      const orig = nodeMap.get(name);
      if (!orig) return;
      const copyName = `${name}_copy`;
      nameMapping.set(name, copyName);
      copies.push({
        ...orig,
        name: copyName,
        x: (orig.x ?? 0) + 2000,
        z: (orig.z ?? 0) + 2000,
        relation: undefined, // 복사 시 연결 초기화
      });
    });
    onNodesUpdate([...nodes, ...copies], `노드 ${copies.length}개 복사`);
    setSelectedNodes(new Set(copies.map(c => c.name)));
  }, [selectedNodes, nodes, nodeMap, onNodesUpdate]);

  // ── 이름 변경 ──────────────────────────
  const renameNode = useCallback((oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName) return;
    if (nodeMap.has(newName)) return; // 중복 방지
    const newNodes = nodes.map(n => {
      let updated = { ...n };
      // 이름 변경
      if (n.name === oldName) updated.name = newName;
      // relation에서 참조 변경
      if (n.relation) {
        updated.relation = n.relation.split(',').map(s => {
          const t = s.trim();
          return t === oldName ? newName : t;
        }).join(', ');
      }
      return updated;
    });
    onNodesUpdate(newNodes, `이름 변경: ${oldName} → ${newName}`);
    // 선택 업데이트
    if (selectedNodes.has(oldName)) {
      const newSel = new Set(selectedNodes);
      newSel.delete(oldName);
      newSel.add(newName);
      setSelectedNodes(newSel);
    }
  }, [nodes, nodeMap, selectedNodes, onNodesUpdate]);

  // ── 노드 클릭 핸들러 (모드별) ──────────
  const handleNodeClick = useCallback((name: string, shiftKey = false) => {
    if (mode === 'select') {
      if (shiftKey) {
        setSelectedNodes(prev => {
          const next = new Set(prev);
          if (next.has(name)) next.delete(name); else next.add(name);
          return next;
        });
      } else {
        setSelectedNodes(new Set([name]));
      }
    } else if (mode === 'connect') {
      if (!connectingFrom) {
        setConnectingFrom(name);
      } else {
        connectNodes(connectingFrom, name);
      }
    }
  }, [mode, connectingFrom, connectNodes]);

  // ── 캔버스 클릭 핸들러 (빈 영역) ──────────
  const handleCanvasClick = useCallback((x: number, z: number) => {
    if (mode === 'place') {
      placeNode(x, z);
    } else if (mode === 'select') {
      setSelectedNodes(new Set());
    } else if (mode === 'connect') {
      setConnectingFrom(null);
    }
  }, [mode, placeNode]);

  // 첫 번째 선택 노드
  const selectedNodeData = useMemo(() => {
    const firstName = Array.from(selectedNodes)[0];
    return firstName ? nodeMap.get(firstName) ?? null : null;
  }, [selectedNodes, nodeMap]);

  return {
    // state
    mode, setMode,
    axisLock, setAxisLock,
    viewMode, setViewMode,
    selectedNodes, setSelectedNodes,
    connectingFrom, setConnectingFrom,
    activeDeck, setActiveDeck,
    newNodeName, setNewNodeName,
    // derived
    availableDecks,
    nodeMap,
    edges,
    visibleNodes,
    selectedNodeData,
    // actions
    placeNode,
    moveNode,
    connectNodes,
    disconnectNodes,
    deleteSelected,
    copySelected,
    renameNode,
    handleNodeClick,
    handleCanvasClick,
  };
}
