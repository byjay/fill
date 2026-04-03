/**
 * DrumManagerPanel — 드럼 관리 UI
 * - 자동 최적화 (마운트 즉시)
 * - 드럼 번호별 케이블 상세 뷰
 * - 확정 시 케이블 리스트에 드럼 번호 반영
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import type { CableData, CableTypeData } from '../types';
import { optimizeDrums } from '../services/drumManager';
import type { DrumReport, CableDrum } from '../services/drumManager';
import {
  Play, Settings, Download, ChevronDown, ChevronRight,
  Package, Scissors, CheckCircle, AlertCircle, X, Printer,
} from 'lucide-react';

interface Props {
  cables: CableData[];
  cableTypeDB?: CableTypeData[];
  onConfirmDrumAssignment?: (assignments: Record<string, string>) => void;
}

type GroupMode = 'type' | 'deck';

interface DrumSettings {
  defaultDrumLength: number;
  groupMode: GroupMode;
  algorithm: 'ffd' | 'bfd';
  marginPercent: number;
}

const DEFAULT_SETTINGS: DrumSettings = {
  defaultDrumLength: 500,
  groupMode: 'type',
  algorithm: 'bfd',
  marginPercent: 5,
};

export default function DrumManagerPanel({ cables, cableTypeDB, onConfirmDrumAssignment }: Props) {
  const [settings, setSettings] = useState<DrumSettings>(() => {
    try {
      const saved = localStorage.getItem('scms_drum_settings2');
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch { return DEFAULT_SETTINGS; }
  });
  const [showSettings, setShowSettings] = useState(false);
  const [report, setReport] = useState<DrumReport | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [selectedDrum, setSelectedDrum] = useState<CableDrum | null>(null);
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const saveSettings = useCallback((s: DrumSettings) => {
    setSettings(s);
    try { localStorage.setItem('scms_drum_settings2', JSON.stringify(s)); } catch {}
  }, []);

  // ── 최적화 실행 ──────────────────────────────────────────────────
  const runOptimize = useCallback((cfg: DrumSettings = settings) => {
    if (cables.length === 0) return;
    setCalculating(true);
    setConfirmed(false);
    setSelectedDrum(null);
    setTimeout(() => {
      const drumLengths = [100, 200, 300, 500, 1000, 2000].filter(l =>
        l <= Math.max(cfg.defaultDrumLength * 4, 2000)
      );
      if (!drumLengths.includes(cfg.defaultDrumLength)) {
        drumLengths.push(cfg.defaultDrumLength);
        drumLengths.sort((a, b) => a - b);
      }
      const result = optimizeDrums(cables, {
        algorithm: cfg.algorithm,
        standardDrumLengths: drumLengths,
        marginPercent: cfg.marginPercent,
        cableTypeDB,
        maxDrumLength: Math.max(...drumLengths),
      });
      setReport(result);
      setCalculating(false);
      // 첫 타입 자동 펼침
      if (result.byType.length > 0) setExpandedType(result.byType[0].cableType);
    }, 80);
  }, [cables, settings, cableTypeDB]);

  // 마운트 시 자동 최적화
  useEffect(() => {
    if (cables.length > 0) {
      runOptimize(settings);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 확정 처리 ────────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    if (!report || !onConfirmDrumAssignment) return;
    const assignments: Record<string, string> = {};
    report.byType.forEach(tr => {
      tr.optimization.drums.forEach(drum => {
        drum.allocatedCables.forEach(alloc => {
          assignments[alloc.cableName] = drum.drumNo;
        });
      });
    });
    onConfirmDrumAssignment(assignments);
    setConfirmed(true);
  }, [report, onConfirmDrumAssignment]);

  // ── 엑셀 내보내기 ────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (!report) return;
    const rows: string[] = ['DRUM_NO,CABLE_TYPE,DRUM_SIZE_M,CABLE_NAME,CABLE_LENGTH_M,CUTTING_ORDER,USED_M,REMAINING_M'];
    report.byType.forEach(tr => {
      tr.optimization.drums.forEach(drum => {
        drum.allocatedCables.forEach(alloc => {
          rows.push([
            drum.drumNo, drum.cableType, drum.drumLength_m,
            alloc.cableName, alloc.length_m, alloc.cuttingOrder,
            drum.usedLength_m.toFixed(1), drum.remainingLength_m.toFixed(1),
          ].join(','));
        });
      });
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `drum_list_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }, [report]);

  // ── 요약 통계 ────────────────────────────────────────────────────
  const summary = report?.summary;
  const allDrums = useMemo(() =>
    report ? report.byType.flatMap(t => t.optimization.drums) : [],
    [report]
  );

  // 케이블명 → 드럼 번호 맵
  const cableTodrumMap = useMemo(() => {
    const map: Record<string, string> = {};
    allDrums.forEach(d => d.allocatedCables.forEach(a => { map[a.cableName] = d.drumNo; }));
    return map;
  }, [allDrums]);

  // ── 렌더 ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200 overflow-hidden">

      {/* ── 툴바 ── */}
      <div className="shrink-0 px-3 py-2 bg-slate-800 border-b border-slate-700 flex items-center gap-2 flex-wrap">
        <Package size={13} className="text-emerald-400 shrink-0" />
        <span className="text-xs font-bold text-white shrink-0">드럼 관리</span>

        <button onClick={() => runOptimize(settings)} disabled={calculating || cables.length === 0}
          className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-3 py-1 rounded text-[10px] font-bold transition-colors shrink-0">
          {calculating
            ? <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
            : <Scissors size={10} />}
          {calculating ? '계산 중...' : '재최적화'}
        </button>

        {report && onConfirmDrumAssignment && (
          <button onClick={handleConfirm}
            className={`flex items-center gap-1 px-3 py-1 rounded text-[10px] font-bold transition-colors shrink-0 ${
              confirmed
                ? 'bg-emerald-700 text-emerald-200 cursor-default'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}>
            <CheckCircle size={10} />
            {confirmed ? '✓ 케이블 목록 반영 완료' : '확정 → 케이블 목록에 드럼 번호 반영'}
          </button>
        )}

        {report && (
          <button onClick={handleExport}
            className="flex items-center gap-1 bg-slate-700 hover:bg-slate-600 text-white px-2 py-1 rounded text-[10px] font-bold transition-colors shrink-0">
            <Download size={10} /> CSV
          </button>
        )}

        <div className="flex-1" />

        {/* 그룹 기준 */}
        <div className="flex items-center gap-1 text-[9px] shrink-0">
          <span className="text-slate-500">기준:</span>
          {(['type','deck'] as GroupMode[]).map(m => (
            <button key={m}
              onClick={() => { const ns = { ...settings, groupMode: m }; saveSettings(ns); runOptimize(ns); }}
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors ${settings.groupMode === m ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white bg-slate-700'}`}>
              {m === 'type' ? '타입별' : '데크별'}
            </button>
          ))}
        </div>

        <button onClick={() => setShowSettings(v => !v)}
          className={`p-1 rounded transition-colors shrink-0 ${showSettings ? 'text-cyan-400 bg-cyan-900/30' : 'text-slate-500 hover:text-white'}`}>
          <Settings size={12} />
        </button>
      </div>

      {/* ── 설정 ── */}
      {showSettings && (
        <div className="shrink-0 px-3 py-2 bg-slate-800/50 border-b border-slate-700 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <label className="text-[8px] text-slate-500 font-bold uppercase">기본 조장(m)</label>
            <input type="number" value={settings.defaultDrumLength}
              onChange={e => saveSettings({ ...settings, defaultDrumLength: parseInt(e.target.value) || 500 })}
              className="w-16 px-1.5 py-0.5 bg-slate-700 border border-slate-600 rounded text-[10px] text-white text-center" />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[8px] text-slate-500 font-bold uppercase">여유율(%)</label>
            <input type="number" value={settings.marginPercent}
              onChange={e => saveSettings({ ...settings, marginPercent: parseInt(e.target.value) || 5 })}
              className="w-12 px-1.5 py-0.5 bg-slate-700 border border-slate-600 rounded text-[10px] text-white text-center" />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[8px] text-slate-500 font-bold uppercase">알고리즘</label>
            <select value={settings.algorithm}
              onChange={e => saveSettings({ ...settings, algorithm: e.target.value as 'ffd'|'bfd' })}
              className="px-1.5 py-0.5 bg-slate-700 border border-slate-600 rounded text-[10px] text-white">
              <option value="bfd">BFD (최적)</option>
              <option value="ffd">FFD (빠름)</option>
            </select>
          </div>
          <button onClick={() => runOptimize(settings)}
            className="px-2 py-0.5 bg-blue-600 text-white rounded text-[9px] font-bold">적용 & 재계산</button>
        </div>
      )}

      {/* ── 요약 KPI ── */}
      {summary && (
        <div className="shrink-0 grid grid-cols-5 gap-0 border-b border-slate-700 bg-slate-950">
          {[
            { label: '총 드럼', value: summary.totalDrums, color: 'text-white' },
            { label: '케이블', value: cables.length + '본', color: 'text-blue-400' },
            { label: '사용량', value: (summary.totalUsed_m/1000).toFixed(2)+'km', color: 'text-emerald-400' },
            { label: '낭비율', value: summary.wastePercent.toFixed(1)+'%', color: summary.wastePercent > 20 ? 'text-red-400' : 'text-amber-400' },
            { label: '낭비량', value: summary.totalWaste_m.toFixed(0)+'m', color: 'text-amber-400' },
          ].map(k => (
            <div key={k.label} className="px-3 py-1.5 border-r border-slate-800 last:border-0">
              <div className={`text-sm font-black ${k.color}`}>{k.value}</div>
              <div className="text-[8px] text-slate-600 uppercase font-bold">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── 메인 — 좌: 드럼 목록 / 우: 드럼 상세 ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── 좌: 타입별 드럼 목록 ── */}
        <div className="w-64 shrink-0 border-r border-slate-700 flex flex-col overflow-hidden bg-slate-900">
          {!report ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
              {calculating ? (
                <>
                  <span className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs font-bold text-blue-400">자동 최적화 중...</p>
                </>
              ) : (
                <>
                  <Package size={32} className="text-slate-700" />
                  <p className="text-xs">케이블 데이터 없음</p>
                </>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {report.byType.map(typeReport => (
                <div key={typeReport.cableType}>
                  {/* 타입 헤더 */}
                  <button
                    onClick={() => setExpandedType(expandedType === typeReport.cableType ? null : typeReport.cableType)}
                    className="w-full flex items-center justify-between px-2.5 py-2 bg-slate-800 border-b border-slate-700 hover:bg-slate-750 transition-colors sticky top-0 z-10">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {expandedType === typeReport.cableType
                        ? <ChevronDown size={10} className="text-slate-500 shrink-0" />
                        : <ChevronRight size={10} className="text-slate-500 shrink-0" />}
                      <span className="text-[10px] font-black text-white truncate">{typeReport.cableType}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[9px] text-emerald-400 font-bold">{typeReport.optimization.totalDrums}드럼</span>
                      <span className={`text-[8px] font-bold ${typeReport.optimization.wastePercent > 20 ? 'text-red-400' : 'text-amber-400'}`}>
                        {typeReport.optimization.wastePercent.toFixed(0)}%낭비
                      </span>
                    </div>
                  </button>

                  {/* 드럼 아이템 */}
                  {expandedType === typeReport.cableType && (
                    <div>
                      {typeReport.optimization.drums.map(drum => {
                        const usePct = drum.drumLength_m > 0 ? drum.usedLength_m / drum.drumLength_m * 100 : 0;
                        const isSelected = selectedDrum?.id === drum.id;
                        return (
                          <button key={drum.id}
                            onClick={() => setSelectedDrum(isSelected ? null : drum)}
                            className={`w-full flex flex-col px-3 py-1.5 border-b border-slate-800 transition-colors text-left ${
                              isSelected ? 'bg-blue-900/40 border-l-2 border-l-blue-400' : 'hover:bg-slate-800/60 border-l-2 border-l-transparent'
                            }`}>
                            <div className="flex items-center justify-between mb-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9px] font-black text-blue-300 font-mono">{drum.drumNo}</span>
                                <span className="text-[8px] text-slate-500">{drum.drumLength_m}m</span>
                              </div>
                              <span className="text-[8px] text-slate-500">{drum.allocatedCables.length}본</span>
                            </div>
                            {/* 사용률 바 */}
                            <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${usePct > 90 ? 'bg-emerald-500' : usePct > 60 ? 'bg-blue-500' : 'bg-amber-500'}`}
                                style={{ width: `${usePct}%` }}
                              />
                            </div>
                            <div className="flex justify-between mt-0.5">
                              <span className="text-[7px] text-slate-500">{drum.usedLength_m.toFixed(0)}m 사용</span>
                              <span className="text-[7px] text-slate-600">{usePct.toFixed(0)}%</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 우: 드럼 상세 / 케이블 목록 ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedDrum ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-3">
              {report ? (
                <>
                  <Package size={40} className="text-slate-700" />
                  <p className="text-sm font-bold text-slate-500">왼쪽에서 드럼을 선택하세요</p>
                  <p className="text-[10px] text-slate-700">총 {allDrums.length}개 드럼 · {cables.length}본 케이블</p>
                  {confirmed && (
                    <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold mt-2 bg-emerald-900/20 px-4 py-2 rounded-xl border border-emerald-700/30">
                      <CheckCircle size={14} /> 드럼 번호가 케이블 목록에 반영되었습니다
                    </div>
                  )}
                </>
              ) : (
                <>
                  <Scissors size={40} className="text-slate-700" />
                  <p className="text-sm font-bold text-slate-500">
                    {calculating ? '자동 최적화 계산 중...' : '최적화 결과 없음'}
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* 드럼 상세 헤더 */}
              <div className="shrink-0 px-4 py-3 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-black text-blue-300 font-mono">{selectedDrum.drumNo}</span>
                      <span className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded font-bold">{selectedDrum.cableType}</span>
                      <span className="text-[10px] text-slate-500">{selectedDrum.drumLength_m}m 드럼</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[9px] text-emerald-400">사용 {selectedDrum.usedLength_m.toFixed(1)}m</span>
                      <span className="text-[9px] text-amber-400">잔량 {selectedDrum.remainingLength_m.toFixed(1)}m</span>
                      <span className="text-[9px] text-blue-400">{selectedDrum.allocatedCables.length}본</span>
                    </div>
                  </div>
                  {/* 사용률 원형 뱃지 */}
                  <div className="relative w-12 h-12 shrink-0">
                    <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1e293b" strokeWidth="3" />
                      <circle cx="18" cy="18" r="15.9" fill="none"
                        stroke={selectedDrum.usedLength_m/selectedDrum.drumLength_m > 0.9 ? '#10b981' : selectedDrum.usedLength_m/selectedDrum.drumLength_m > 0.6 ? '#3b82f6' : '#f59e0b'}
                        strokeWidth="3"
                        strokeDasharray={`${(selectedDrum.usedLength_m/selectedDrum.drumLength_m)*100} 100`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[9px] font-black text-white">
                        {((selectedDrum.usedLength_m/selectedDrum.drumLength_m)*100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
                <button onClick={() => setSelectedDrum(null)} className="text-slate-500 hover:text-white p-1 rounded">
                  <X size={14} />
                </button>
              </div>

              {/* 케이블 목록 */}
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead className="bg-slate-950 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2 text-left text-[9px] font-bold text-slate-500 uppercase tracking-wider w-8">순서</th>
                      <th className="px-3 py-2 text-left text-[9px] font-bold text-slate-500 uppercase tracking-wider">케이블 명</th>
                      <th className="px-3 py-2 text-right text-[9px] font-bold text-slate-500 uppercase tracking-wider w-24">절단 길이</th>
                      <th className="px-3 py-2 text-right text-[9px] font-bold text-slate-500 uppercase tracking-wider w-28">누적 위치</th>
                      <th className="px-3 py-2 text-left text-[9px] font-bold text-slate-500 uppercase tracking-wider">시스템</th>
                      <th className="px-3 py-2 text-left text-[9px] font-bold text-slate-500 uppercase tracking-wider">FROM → TO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {(() => {
                      let cumulative = 0;
                      return selectedDrum.allocatedCables.map((alloc, i) => {
                        cumulative += alloc.length_m;
                        // 케이블 원본 데이터 찾기
                        const cable = cables.find(c => c.name === alloc.cableName);
                        return (
                          <tr key={alloc.cableName}
                            className={`transition-colors ${i % 2 === 0 ? 'bg-slate-900' : 'bg-slate-900/50'} hover:bg-blue-900/20`}>
                            <td className="px-3 py-2 text-slate-600 font-mono font-bold text-center">{alloc.cuttingOrder}</td>
                            <td className="px-3 py-2">
                              <div className="font-bold text-blue-300">{alloc.cableName}</div>
                              {cable?.type && <div className="text-[9px] text-slate-600">{cable.type}</div>}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className="font-mono text-emerald-400 font-bold">{alloc.length_m.toFixed(1)}m</span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className="font-mono text-amber-400">{cumulative.toFixed(1)}m</span>
                            </td>
                            <td className="px-3 py-2 text-slate-400">{cable?.system || '-'}</td>
                            <td className="px-3 py-2 text-slate-500">
                              <span className="text-emerald-600">{cable?.fromNode || ''}</span>
                              {cable?.toNode && <> → <span className="text-rose-600">{cable.toNode}</span></>}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                  <tfoot className="bg-slate-950 border-t border-slate-700 sticky bottom-0">
                    <tr>
                      <td colSpan={2} className="px-3 py-2 text-[9px] text-slate-500 font-bold">
                        합계 {selectedDrum.allocatedCables.length}본
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="text-[10px] font-black text-emerald-400">{selectedDrum.usedLength_m.toFixed(1)}m</span>
                      </td>
                      <td colSpan={3} className="px-3 py-2 text-right text-[9px] text-amber-400">
                        잔량: {selectedDrum.remainingLength_m.toFixed(1)}m
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
