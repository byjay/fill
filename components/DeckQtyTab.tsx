import React, { useMemo, useState } from 'react';
import { CableData, NodeData } from '../types';
import { Layers, BarChart3, Download, Filter, Map } from 'lucide-react';

interface Props {
  cables: CableData[];
  nodes: NodeData[];
}

// ── 색상 팔레트 (ThreeDViewTab과 통일) ──────────────────────────────
const DECK_PALETTE = [
  '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#ef4444',
  '#f97316', '#06b6d4', '#84cc16', '#ec4899', '#8b5cf6',
  '#14b8a6', '#f43f5e', '#0ea5e9', '#a3e635', '#fb923c',
];

function deckColor(deck: string): string {
  const hash = Array.from(deck).reduce((h, c) => h * 31 + c.charCodeAt(0), 0);
  return DECK_PALETTE[Math.abs(hash) % DECK_PALETTE.length];
}

// ── 집계 데이터 타입 ────────────────────────────────────────────────
interface DeckStat {
  deck: string;
  cableCount: number;
  totalLength: number;   // m
  totalWeight: number;   // kg
  systems: string[];
  cables: CableData[];
}

interface ZoneStat {
  zone: string;
  cableCount: number;
  totalLength: number;
  totalWeight: number;
  systems: string[];
  cables: CableData[];
}

interface SystemStat {
  system: string;
  cableCount: number;
  totalLength: number;
  totalWeight: number;
  decks: string[];
  cables: CableData[];
}

type GroupMode = 'deck' | 'zone' | 'system';

// ── CSV export ──────────────────────────────────────────────────────
function exportCSV(rows: object[], filename: string) {
  if (rows.length === 0) return;
  const keys = Object.keys(rows[0]);
  const header = keys.join(',');
  const body = rows.map(r =>
    keys.map(k => {
      const v = (r as Record<string, unknown>)[k];
      const s = v === undefined || v === null ? '' : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    }).join(',')
  ).join('\n');
  const blob = new Blob([`\uFEFF${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main Component ──────────────────────────────────────────────────
const DeckQtyTab: React.FC<Props> = ({ cables, nodes }) => {
  const [groupMode, setGroupMode] = useState<GroupMode>('deck');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [systemFilter, setSystemFilter] = useState('');

  // 노드 맵 (이름 → NodeData)
  const nodeMap = useMemo(() => {
    const m: Record<string, NodeData> = {};
    nodes.forEach(n => { m[n.name] = n; });
    return m;
  }, [nodes]);

  // 케이블의 deck 결정: supplyDeck 우선, 없으면 fromNode의 deck
  function resolveDeck(c: CableData): string {
    if (c.supplyDeck && c.supplyDeck.trim()) return c.supplyDeck.trim();
    if (c.fromNode) {
      const nd = nodeMap[c.fromNode];
      if (nd?.deck && nd.deck.trim()) return nd.deck.trim();
    }
    return '미지정';
  }

  // 케이블의 zone 결정: fromNode의 structure
  function resolveZone(c: CableData): string {
    if (c.fromNode) {
      const nd = nodeMap[c.fromNode];
      if (nd?.structure && nd.structure.trim()) return nd.structure.trim();
    }
    return '미지정';
  }

  // 필터된 케이블
  const filteredCables = useMemo(() => {
    const q = systemFilter.trim().toLowerCase();
    if (!q) return cables;
    return cables.filter(c => (c.system || '').toLowerCase().includes(q));
  }, [cables, systemFilter]);

  // ── 데크별 집계 ──────────────────────────────────────────────────
  const deckStats = useMemo((): DeckStat[] => {
    const map: Record<string, DeckStat> = {};
    filteredCables.forEach(c => {
      const dk = resolveDeck(c);
      if (!map[dk]) map[dk] = { deck: dk, cableCount: 0, totalLength: 0, totalWeight: 0, systems: [], cables: [] };
      const st = map[dk];
      st.cableCount += 1;
      st.totalLength += c.calculatedLength ?? c.length ?? 0;
      st.totalWeight += c.cableWeight ?? c.porWeight ?? 0;
      const sys = c.system?.trim();
      if (sys && !st.systems.includes(sys)) st.systems.push(sys);
      st.cables.push(c);
    });
    return Object.values(map).sort((a, b) => a.deck.localeCompare(b.deck));
  }, [filteredCables, nodeMap]);

  // ── 구역별(zone) 집계 ────────────────────────────────────────────
  const zoneStats = useMemo((): ZoneStat[] => {
    const map: Record<string, ZoneStat> = {};
    filteredCables.forEach(c => {
      const zk = resolveZone(c);
      if (!map[zk]) map[zk] = { zone: zk, cableCount: 0, totalLength: 0, totalWeight: 0, systems: [], cables: [] };
      const st = map[zk];
      st.cableCount += 1;
      st.totalLength += c.calculatedLength ?? c.length ?? 0;
      st.totalWeight += c.cableWeight ?? c.porWeight ?? 0;
      const sys = c.system?.trim();
      if (sys && !st.systems.includes(sys)) st.systems.push(sys);
      st.cables.push(c);
    });
    return Object.values(map).sort((a, b) => a.zone.localeCompare(b.zone));
  }, [filteredCables, nodeMap]);

  // ── 시스템별 집계 ────────────────────────────────────────────────
  const systemStats = useMemo((): SystemStat[] => {
    const map: Record<string, SystemStat> = {};
    filteredCables.forEach(c => {
      const sk = c.system?.trim() || '미지정';
      if (!map[sk]) map[sk] = { system: sk, cableCount: 0, totalLength: 0, totalWeight: 0, decks: [], cables: [] };
      const st = map[sk];
      st.cableCount += 1;
      st.totalLength += c.calculatedLength ?? c.length ?? 0;
      st.totalWeight += c.cableWeight ?? c.porWeight ?? 0;
      const dk = resolveDeck(c);
      if (!st.decks.includes(dk)) st.decks.push(dk);
      st.cables.push(c);
    });
    return Object.values(map).sort((a, b) => b.cableCount - a.cableCount);
  }, [filteredCables, nodeMap]);

  // ── KPI totals ───────────────────────────────────────────────────
  const totalCables = filteredCables.length;
  const totalLength = filteredCables.reduce((s, c) => s + (c.calculatedLength ?? c.length ?? 0), 0);
  const totalWeight = filteredCables.reduce((s, c) => s + (c.cableWeight ?? c.porWeight ?? 0), 0);
  const totalDecks = deckStats.length;

  // ── 현재 모드의 행 데이터 ────────────────────────────────────────
  interface RowBase { key: string; cableCount: number; totalLength: number; totalWeight: number; systems: string[]; cables: CableData[]; }
  const rows: RowBase[] = useMemo(() => {
    if (groupMode === 'deck') return deckStats.map(d => ({ key: d.deck, cableCount: d.cableCount, totalLength: d.totalLength, totalWeight: d.totalWeight, systems: d.systems, cables: d.cables }));
    if (groupMode === 'zone') return zoneStats.map(z => ({ key: z.zone, cableCount: z.cableCount, totalLength: z.totalLength, totalWeight: z.totalWeight, systems: z.systems, cables: z.cables }));
    return systemStats.map(s => ({ key: s.system, cableCount: s.cableCount, totalLength: s.totalLength, totalWeight: s.totalWeight, systems: [s.system], cables: s.cables }));
  }, [groupMode, deckStats, zoneStats, systemStats]);

  const maxCount = useMemo(() => Math.max(...rows.map(r => r.cableCount), 1), [rows]);

  // 선택된 행의 케이블 목록
  const selectedCables = useMemo(() => {
    if (!selectedKey) return [];
    const found = rows.find(r => r.key === selectedKey);
    return found ? found.cables : [];
  }, [selectedKey, rows]);

  // ── CSV export handler ───────────────────────────────────────────
  function handleExport() {
    if (groupMode === 'deck') {
      exportCSV(deckStats.map(d => ({
        데크: d.deck,
        케이블수: d.cableCount,
        '총길이(m)': d.totalLength.toFixed(1),
        '총중량(kg)': d.totalWeight.toFixed(1),
        주요시스템: d.systems.join('; '),
      })), 'deck_qty.csv');
    } else if (groupMode === 'zone') {
      exportCSV(zoneStats.map(z => ({
        구역: z.zone,
        케이블수: z.cableCount,
        '총길이(m)': z.totalLength.toFixed(1),
        '총중량(kg)': z.totalWeight.toFixed(1),
        주요시스템: z.systems.join('; '),
      })), 'zone_qty.csv');
    } else {
      exportCSV(systemStats.map(s => ({
        시스템: s.system,
        케이블수: s.cableCount,
        '총길이(m)': s.totalLength.toFixed(1),
        '총중량(kg)': s.totalWeight.toFixed(1),
        데크목록: s.decks.join('; '),
      })), 'system_qty.csv');
    }
  }

  // ── 컬럼 레이블 ─────────────────────────────────────────────────
  const colLabel = groupMode === 'deck' ? '데크' : groupMode === 'zone' ? '구역' : '시스템';
  const subLabel = groupMode === 'system' ? '데크 목록' : '주요시스템';

  return (
    <div className="flex flex-col h-full bg-gray-950 text-gray-100 p-4 gap-4">

      {/* ── KPI Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3 flex-shrink-0">
        <KpiCard icon={<Layers size={18} />} label="총 케이블" value={totalCables.toLocaleString()} color="text-blue-400" />
        <KpiCard icon={<BarChart3 size={18} />} label="총 길이(m)" value={totalLength.toFixed(1)} color="text-emerald-400" />
        <KpiCard icon={<Map size={18} />} label="총 중량(kg)" value={totalWeight.toFixed(1)} color="text-amber-400" />
        <KpiCard icon={<Filter size={18} />} label="데크 수" value={totalDecks.toString()} color="text-purple-400" />
      </div>

      {/* ── Toggle + Search + Export ──────────────────────────────── */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Toggle */}
        <div className="flex bg-gray-800 rounded-lg p-1 gap-1">
          {(['deck', 'zone', 'system'] as GroupMode[]).map(m => (
            <button
              key={m}
              onClick={() => { setGroupMode(m); setSelectedKey(null); }}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                groupMode === m
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
              }`}
            >
              {m === 'deck' ? '데크별' : m === 'zone' ? '구역별' : '시스템별'}
            </button>
          ))}
        </div>

        {/* System filter */}
        <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 flex-1 max-w-xs">
          <Filter size={14} className="text-gray-500" />
          <input
            className="bg-transparent text-xs text-gray-200 placeholder-gray-500 outline-none w-full"
            placeholder="시스템 검색 필터..."
            value={systemFilter}
            onChange={e => setSystemFilter(e.target.value)}
          />
          {systemFilter && (
            <button onClick={() => setSystemFilter('')} className="text-gray-500 hover:text-gray-300 text-xs">✕</button>
          )}
        </div>

        <div className="flex-1" />

        {/* Export */}
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs text-gray-300 transition-colors"
        >
          <Download size={14} />
          CSV 내보내기
        </button>
      </div>

      {/* ── Horizontal Bar Chart ──────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex-shrink-0">
        <div className="text-xs font-semibold text-gray-400 mb-3 flex items-center gap-2">
          <BarChart3 size={14} />
          {colLabel}별 케이블 수 분포
        </div>
        <div className="flex flex-col gap-2">
          {rows.slice(0, 15).map(row => {
            const pct = (row.cableCount / maxCount) * 100;
            const color = groupMode === 'deck' ? deckColor(row.key) : '#3b82f6';
            return (
              <div
                key={row.key}
                className="flex items-center gap-2 cursor-pointer group"
                onClick={() => setSelectedKey(selectedKey === row.key ? null : row.key)}
              >
                <span
                  className="text-xs text-gray-400 group-hover:text-gray-200 transition-colors"
                  style={{ minWidth: 80, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={row.key}
                >
                  {row.key}
                </span>
                <div className="flex-1 bg-gray-800 rounded-full h-4 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300 flex items-center justify-end pr-2"
                    style={{ width: `${pct}%`, backgroundColor: color, minWidth: pct > 0 ? 8 : 0 }}
                  />
                </div>
                <span className="text-xs text-gray-400 w-10 text-right">{row.cableCount}</span>
              </div>
            );
          })}
          {rows.length > 15 && (
            <div className="text-xs text-gray-600 text-center mt-1">... 외 {rows.length - 15}개</div>
          )}
        </div>
      </div>

      {/* ── Main split panel ─────────────────────────────────────── */}
      <div className="flex gap-3 flex-1 min-h-0">

        {/* Left: 집계 테이블 (40%) */}
        <div className="flex flex-col w-2/5 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-800 bg-gray-900 text-xs font-semibold text-gray-400 flex items-center gap-2 flex-shrink-0">
            <Layers size={13} />
            {colLabel}별 집계
            <span className="ml-auto text-gray-600">{rows.length}개</span>
          </div>
          <div className="overflow-auto flex-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-800/60 sticky top-0 z-10">
                  <th className="text-left px-3 py-2 text-gray-400 font-medium">{colLabel}</th>
                  <th className="text-right px-3 py-2 text-gray-400 font-medium">케이블수</th>
                  <th className="text-right px-3 py-2 text-gray-400 font-medium">총길이(m)</th>
                  <th className="text-right px-3 py-2 text-gray-400 font-medium">총중량(kg)</th>
                  <th className="text-left px-3 py-2 text-gray-400 font-medium">{subLabel}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-gray-600">데이터 없음</td>
                  </tr>
                )}
                {rows.map(row => {
                  const isSelected = selectedKey === row.key;
                  const color = groupMode === 'deck' ? deckColor(row.key) : undefined;
                  const subText = groupMode === 'system'
                    ? (row.cables.map(c => { const dk = resolveDeck(c); return dk; }).filter((v, i, a) => a.indexOf(v) === i).join(', '))
                    : row.systems.slice(0, 3).join(', ') + (row.systems.length > 3 ? ` +${row.systems.length - 3}` : '');
                  return (
                    <tr
                      key={row.key}
                      onClick={() => setSelectedKey(isSelected ? null : row.key)}
                      className={`cursor-pointer border-b border-gray-800/50 transition-colors ${
                        isSelected
                          ? 'bg-blue-900/40 text-white'
                          : 'hover:bg-gray-800/50 text-gray-300'
                      }`}
                    >
                      <td className="px-3 py-2 font-medium">
                        <div className="flex items-center gap-2">
                          {color && (
                            <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                          )}
                          <span className="truncate max-w-[80px]" title={row.key}>{row.key}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.cableCount.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.totalLength.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.totalWeight.toFixed(1)}</td>
                      <td className="px-3 py-2 text-gray-500 truncate max-w-[120px]" title={subText}>{subText || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: 케이블 목록 (60%) */}
        <div className="flex flex-col flex-1 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-800 bg-gray-900 text-xs font-semibold text-gray-400 flex items-center gap-2 flex-shrink-0">
            <Map size={13} />
            {selectedKey ? (
              <>
                <span className="text-blue-300">{selectedKey}</span>
                <span className="text-gray-600">케이블 목록</span>
                <span className="ml-auto text-gray-500">{selectedCables.length}개</span>
              </>
            ) : (
              <>
                <span className="text-gray-600">{colLabel}을 클릭하면 케이블 목록이 표시됩니다</span>
                <span className="ml-auto text-gray-600">{filteredCables.length}개 전체</span>
              </>
            )}
          </div>
          <div className="overflow-auto flex-1">
            {selectedKey === null ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-3">
                <Layers size={32} className="opacity-30" />
                <span className="text-sm">좌측 테이블에서 {colLabel}을 선택하세요</span>
              </div>
            ) : selectedCables.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-600 text-sm">
                케이블 없음
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-800/60 sticky top-0 z-10">
                    <th className="text-left px-3 py-2 text-gray-400 font-medium">케이블명</th>
                    <th className="text-left px-3 py-2 text-gray-400 font-medium">타입</th>
                    <th className="text-left px-3 py-2 text-gray-400 font-medium">시스템</th>
                    <th className="text-left px-3 py-2 text-gray-400 font-medium">FROM → TO</th>
                    <th className="text-right px-3 py-2 text-gray-400 font-medium">길이(m)</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedCables.map((c, idx) => {
                    const len = c.calculatedLength ?? c.length;
                    const from = c.fromNode || c.fromRoom || '-';
                    const to = c.toNode || c.toRoom || '-';
                    return (
                      <tr
                        key={c.id || idx}
                        className="border-b border-gray-800/40 hover:bg-gray-800/40 transition-colors text-gray-300"
                      >
                        <td className="px-3 py-1.5 font-medium text-gray-200 truncate max-w-[140px]" title={c.name}>{c.name}</td>
                        <td className="px-3 py-1.5 text-gray-400">{c.type || '-'}</td>
                        <td className="px-3 py-1.5">
                          {c.system ? (
                            <span className="bg-blue-900/50 text-blue-300 px-1.5 py-0.5 rounded text-[10px]">{c.system}</span>
                          ) : (
                            <span className="text-gray-600">-</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-gray-400 truncate max-w-[180px]" title={`${from} → ${to}`}>
                          <span className="text-gray-300">{from}</span>
                          <span className="text-gray-600 mx-1">→</span>
                          <span className="text-gray-300">{to}</span>
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-300">
                          {len !== undefined && len !== null ? len.toFixed(1) : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── KPI Card sub-component ───────────────────────────────────────────
interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}

const KpiCard: React.FC<KpiCardProps> = ({ icon, label, value, color }) => (
  <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center gap-3">
    <div className={`${color} opacity-80`}>{icon}</div>
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  </div>
);

export default DeckQtyTab;
