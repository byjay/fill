import React, { useMemo, useState } from 'react';
import { CableData, NodeData } from '../types';
import {
  runFullValidation,
  ValidationSummary,
  PathIssue,
  buildGraph,
  findConnectedComponents,
} from '../services/pathValidator';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  Download,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  cables: CableData[];
  nodes: NodeData[];
}

// ─── Issue type Korean labels ────────────────────────────────────────────────

const ISSUE_TYPE_KR: Record<PathIssue['issueType'], string> = {
  missing_from_node: 'FROM 노드 누락',
  missing_to_node: 'TO 노드 누락',
  broken_link: '경로 단절',
  disconnected_components: '연결 끊김',
  missing_path_node: '경로 노드 누락',
  no_path: '미경로',
};

// ─── CSV Export Helper ───────────────────────────────────────────────────────

function exportCSV(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
) {
  const bom = '\uFEFF';
  const csvContent =
    bom +
    [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ─── Filter tabs type ────────────────────────────────────────────────────────

type FilterTab = 'all' | 'error' | 'warning';

// ─── Component ───────────────────────────────────────────────────────────────

export default function NodeCheckPanel({ cables, nodes }: Props) {
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [searchText, setSearchText] = useState('');
  const [expandedComps, setExpandedComps] = useState<Set<number>>(new Set());

  // ── Validation results ──────────────────────────────────────────────────────

  const summary: ValidationSummary = useMemo(
    () => runFullValidation(cables, nodes),
    [cables, nodes],
  );

  // ── Connected components (for visualisation section) ────────────────────────

  const components: string[][] = useMemo(() => {
    const graph = buildGraph(nodes);
    return findConnectedComponents(graph);
  }, [nodes]);

  // ── Filtered issues ─────────────────────────────────────────────────────────

  const filteredIssues = useMemo(() => {
    let list = summary.issues;

    if (filterTab === 'error') {
      list = list.filter((i) => i.severity === 'error');
    } else if (filterTab === 'warning') {
      list = list.filter((i) => i.severity === 'warning');
    }

    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter((i) => i.cableName.toLowerCase().includes(q));
    }

    return list;
  }, [summary.issues, filterTab, searchText]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const toggleComp = (idx: number) => {
    setExpandedComps((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleExportCSV = () => {
    const headers = ['심각도', '케이블명', 'FROM', 'TO', '이슈 타입', '설명', '관련 노드'];
    const rows = summary.issues.map((i) => [
      i.severity === 'error' ? '에러' : '경고',
      i.cableName,
      i.cableFrom,
      i.cableTo,
      ISSUE_TYPE_KR[i.issueType] ?? i.issueType,
      i.description,
      i.affectedNodes.join(', '),
    ]);
    exportCSV(`path_validation_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  // ── Severity icon helper ────────────────────────────────────────────────────

  const SeverityIcon = ({ severity }: { severity: 'error' | 'warning' }) =>
    severity === 'error' ? (
      <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
    ) : (
      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
    );

  // ── Issue counts ────────────────────────────────────────────────────────────

  const errorCount = summary.issues.filter((i) => i.severity === 'error').length;
  const warningCount = summary.issues.filter((i) => i.severity === 'warning').length;

  // ═══════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="flex flex-col gap-4 p-4 bg-gray-900 text-gray-100 h-full overflow-auto text-sm">
      {/* ─── 1. KPI Summary Bar ──────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        {/* Valid paths */}
        <div className="bg-gray-800 rounded-lg p-3 flex flex-col items-center">
          <CheckCircle2 className="w-6 h-6 text-emerald-400 mb-1" />
          <span className="text-2xl font-bold text-emerald-400">{summary.validPaths}</span>
          <span className="text-xs text-gray-400 mt-0.5">정상 경로</span>
        </div>

        {/* Broken paths */}
        <div className="bg-gray-800 rounded-lg p-3 flex flex-col items-center">
          <XCircle className="w-6 h-6 text-red-400 mb-1" />
          <span className="text-2xl font-bold text-red-400">{summary.brokenPaths}</span>
          <span className="text-xs text-gray-400 mt-0.5">문제 경로</span>
        </div>

        {/* Connected components */}
        <div className="bg-gray-800 rounded-lg p-3 flex flex-col items-center">
          <Info className="w-6 h-6 text-blue-400 mb-1" />
          <span className="text-2xl font-bold text-blue-400">
            {summary.stats.connectedComponents}
          </span>
          <span className="text-xs text-gray-400 mt-0.5">연결 그룹</span>
        </div>

        {/* Isolated nodes */}
        <div className="bg-gray-800 rounded-lg p-3 flex flex-col items-center">
          <AlertTriangle className="w-6 h-6 text-orange-400 mb-1" />
          <span className="text-2xl font-bold text-orange-400">
            {summary.stats.isolatedNodes.length}
          </span>
          <span className="text-xs text-gray-400 mt-0.5">고립 노드</span>
        </div>
      </div>

      {/* ─── 2. Filter Tabs + Search + Export ────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Tabs */}
        {([
          { key: 'all' as FilterTab, label: `전체 (${summary.issues.length})` },
          { key: 'error' as FilterTab, label: `에러 (${errorCount})` },
          { key: 'warning' as FilterTab, label: `경고 (${warningCount})` },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilterTab(tab.key)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              filterTab === tab.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="케이블명 검색..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded pl-7 pr-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 w-48"
          />
        </div>

        {/* Export CSV */}
        <button
          onClick={handleExportCSV}
          disabled={summary.issues.length === 0}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          CSV 내보내기
        </button>
      </div>

      {/* ─── 3. Issue List Table ──────────────────────────────────────────── */}
      {filteredIssues.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-6 flex flex-col items-center justify-center text-gray-500">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
          <span className="text-sm">
            {summary.issues.length === 0
              ? '모든 경로가 정상입니다.'
              : '필터 조건에 맞는 이슈가 없습니다.'}
          </span>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-750 text-gray-400 border-b border-gray-700">
                <th className="px-3 py-2 text-left w-8" />
                <th className="px-3 py-2 text-left">케이블명</th>
                <th className="px-3 py-2 text-left">이슈 타입</th>
                <th className="px-3 py-2 text-left">설명</th>
                <th className="px-3 py-2 text-left">관련 노드</th>
              </tr>
            </thead>
            <tbody>
              {filteredIssues.map((issue, idx) => (
                <tr
                  key={idx}
                  className={`border-b border-gray-700/50 hover:bg-gray-700/30 ${
                    idx % 2 === 0 ? 'bg-gray-900/30' : 'bg-gray-850/30'
                  }`}
                >
                  <td className="px-3 py-2">
                    <SeverityIcon severity={issue.severity} />
                  </td>
                  <td className="px-3 py-2 font-mono text-gray-200 whitespace-nowrap">
                    {issue.cableName}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        issue.severity === 'error'
                          ? 'bg-red-900/40 text-red-400'
                          : 'bg-amber-900/40 text-amber-400'
                      }`}
                    >
                      {ISSUE_TYPE_KR[issue.issueType] ?? issue.issueType}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-400 max-w-xs truncate" title={issue.description}>
                    {issue.description}
                  </td>
                  <td className="px-3 py-2 font-mono text-gray-400 text-[10px]">
                    {issue.affectedNodes.join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── 4. Connected Components Visualisation ───────────────────────── */}
      {components.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            연결 그룹 ({components.length})
          </h3>

          {components.map((comp, idx) => {
            const isMain = idx === 0;
            const isExpanded = expandedComps.has(idx);
            const colorClass = isMain
              ? 'border-emerald-600/40 bg-emerald-900/10'
              : 'border-orange-600/40 bg-orange-900/10';
            const badgeClass = isMain
              ? 'bg-emerald-900/50 text-emerald-400'
              : 'bg-orange-900/50 text-orange-400';

            return (
              <div
                key={idx}
                className={`border rounded-lg overflow-hidden ${colorClass}`}
              >
                <button
                  onClick={() => toggleComp(idx)}
                  className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badgeClass}`}>
                      {isMain ? 'MAIN' : `#${idx + 1}`}
                    </span>
                    <span className="text-xs text-gray-300">
                      {comp.length}개 노드
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                  )}
                </button>

                {isExpanded && (
                  <div className="px-3 pb-2 flex flex-wrap gap-1">
                    {comp.map((nodeName) => (
                      <span
                        key={nodeName}
                        className="inline-block bg-gray-800 text-gray-300 text-[10px] font-mono px-1.5 py-0.5 rounded"
                      >
                        {nodeName}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── 5. Isolated Nodes Section ───────────────────────────────────── */}
      {summary.stats.isolatedNodes.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            고립 노드 ({summary.stats.isolatedNodes.length})
          </h3>
          <div className="bg-gray-800 rounded-lg p-3 flex flex-wrap gap-1.5">
            {summary.stats.isolatedNodes.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1 bg-orange-900/30 text-orange-400 text-[10px] font-mono px-2 py-1 rounded"
              >
                <AlertTriangle className="w-3 h-3" />
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ─── Footer summary ──────────────────────────────────────────────── */}
      <div className="text-[10px] text-gray-600 text-right mt-auto pt-2 border-t border-gray-800">
        총 {summary.totalCables}건 케이블 · {summary.stats.totalNodes}개 노드 · {summary.issues.length}건 이슈
      </div>
    </div>
  );
}
