import React, { useState, useMemo, useCallback } from 'react';
import { CableData, NodeData, CableTypeData } from '../types';
import { Zap, AlertTriangle, CheckCircle, Download, Settings, RefreshCw, Thermometer } from 'lucide-react';

interface Props {
  cables: CableData[];
  nodes: NodeData[];
  cableTypeDB?: CableTypeData[];
}

interface CableCurrentMap {
  [cableId: string]: number;
}

interface VoltageDropResult {
  id: string;
  name: string;
  type: string;
  lengthM: number;
  conductorMm2: number | null;
  currentA: number;
  allowableCurrentA: number | null;
  voltageDropV: number;
  voltageDropPct: number;
  passVoltageDrop: boolean;
  passAllowableCurrent: boolean;
  pass: boolean;
}

const COPPER_RESISTIVITY = 0.0175; // Ω·mm²/m

// ─────────────────────────────────────────────────────────────────────────────
// IEC 60092 / JIS C3410-2010 허용전류표 — 45°C 기준
// ─────────────────────────────────────────────────────────────────────────────

// 100% 조건: 단독 포설 / 공기 중
const IEC_ALLOWABLE_100PCT: Array<{ mm2: number; A: number }> = [
  { mm2: 0.5,  A: 12  },
  { mm2: 0.75, A: 15  },
  { mm2: 1.0,  A: 18  },
  { mm2: 1.5,  A: 22  },
  { mm2: 2.5,  A: 30  },
  { mm2: 4,    A: 40  },
  { mm2: 6,    A: 51  },
  { mm2: 10,   A: 70  },
  { mm2: 16,   A: 93  },
  { mm2: 25,   A: 122 },
  { mm2: 35,   A: 150 },
  { mm2: 50,   A: 182 },
  { mm2: 70,   A: 228 },
  { mm2: 95,   A: 275 },
  { mm2: 120,  A: 316 },
  { mm2: 150,  A: 357 },
  { mm2: 185,  A: 405 },
  { mm2: 240,  A: 473 },
  { mm2: 300,  A: 535 },
];

// 85% 조건: 전선관/트레이 묶음 포설 (OD < 30mm)
const IEC_ALLOWABLE_85PCT: Array<{ mm2: number; A: number }> = IEC_ALLOWABLE_100PCT.map(
  row => ({ mm2: row.mm2, A: Math.round(row.A * 0.85) })
);

/**
 * 전선 단면적 mm²에 대한 허용전류 조회 (보간 없이, 가장 가까운 표준 사이즈 사용)
 */
function getAllowableCurrent(conductorMm2: number, factor: '100' | '85'): number | null {
  if (!conductorMm2 || conductorMm2 <= 0) return null;
  const table = factor === '100' ? IEC_ALLOWABLE_100PCT : IEC_ALLOWABLE_85PCT;
  // 정확히 일치하는 값 우선
  const exact = table.find(r => Math.abs(r.mm2 - conductorMm2) < 0.001);
  if (exact) return exact.A;
  // 해당 단면적보다 크거나 같은 표준 사이즈 중 가장 작은 것 (안전측)
  const upper = table.find(r => r.mm2 >= conductorMm2);
  if (upper) return upper.A;
  // 범위 초과: 가장 큰 값
  return table[table.length - 1].A;
}

/**
 * terminalCore 문자열에서 도체 단면적(mm²)을 파싱
 * 예) "1x1.5" → 1.5,  "2.5" → 2.5,  "3x2.5" → 2.5,  "RJ45" → null
 */
function parseConductorMm2(terminalCore: string): number | null {
  if (!terminalCore) return null;
  const tc = terminalCore.trim();
  // 'x'로 구분 시 마지막 파트가 도체 단면적 (예: "3x2.5" → "2.5")
  const parts = tc.toLowerCase().split('x');
  const sizeStr = parts[parts.length - 1].trim();
  const match = sizeStr.match(/^[\d.]+/);
  if (!match) return null;
  const val = parseFloat(match[0]);
  // 유효 범위 체크 (0.1 ~ 400 mm²)
  if (isNaN(val) || val < 0.1 || val > 400) return null;
  return val;
}

function calcVoltageDrop3Phase(rho: number, L: number, I: number, A: number): number {
  return (Math.sqrt(3) * rho * L * I) / A;
}

function calcVoltageDropDC(rho: number, L: number, I: number, A: number): number {
  return (2 * rho * L * I) / A;
}

const VoltageDropTab: React.FC<Props> = ({ cables, nodes, cableTypeDB = [] }) => {
  const [systemVoltageV, setSystemVoltageV] = useState<number>(440);
  const [allowedDropPct, setAllowedDropPct] = useState<number>(3);
  const [defaultCurrentA, setDefaultCurrentA] = useState<number>(10);
  const [powerSystem, setPowerSystem] = useState<'AC3' | 'DC'>('AC3');
  const [derating, setDerating] = useState<'100' | '85'>('85');
  const [perCableCurrents, setPerCableCurrents] = useState<CableCurrentMap>({});

  // cable type → conductorMm2 조회
  const getConductorSection = useCallback(
    (cableType: string): number | null => {
      if (!cableTypeDB || cableTypeDB.length === 0) return null;
      const matched = cableTypeDB.find(
        (ct) => ct.cableType.trim().toUpperCase() === cableType.trim().toUpperCase()
      );
      if (!matched) return null;
      // terminalCore에서 도체 단면적 파싱 (우선)
      if (matched.terminalCore) {
        const parsed = parseConductorMm2(matched.terminalCore);
        if (parsed !== null) return parsed;
      }
      return null;
    },
    [cableTypeDB]
  );

  const results: VoltageDropResult[] = useMemo(() => {
    const rawResults: VoltageDropResult[] = cables.map((cable) => {
      const L = cable.calculatedLength ?? cable.length ?? 0;
      const conductorMm2 = getConductorSection(cable.type);
      const I = perCableCurrents[cable.id] ?? defaultCurrentA;
      const allowableCurrentA = conductorMm2 ? getAllowableCurrent(conductorMm2, derating) : null;

      let voltageDropV = 0;
      if (conductorMm2 && conductorMm2 > 0 && L > 0) {
        voltageDropV =
          powerSystem === 'AC3'
            ? calcVoltageDrop3Phase(COPPER_RESISTIVITY, L, I, conductorMm2)
            : calcVoltageDropDC(COPPER_RESISTIVITY, L, I, conductorMm2);
      }

      const voltageDropPct =
        systemVoltageV > 0 ? (voltageDropV / systemVoltageV) * 100 : 0;

      const passVoltageDrop = conductorMm2 !== null && voltageDropPct <= allowedDropPct;
      const passAllowableCurrent =
        allowableCurrentA === null || I <= allowableCurrentA;
      const pass = conductorMm2 !== null && passVoltageDrop && passAllowableCurrent;

      return {
        id: cable.id,
        name: cable.name,
        type: cable.type,
        lengthM: L,
        conductorMm2,
        currentA: I,
        allowableCurrentA,
        voltageDropV,
        voltageDropPct,
        passVoltageDrop,
        passAllowableCurrent,
        pass,
      };
    });

    // Sort by 전압강하율 descending
    return rawResults.sort((a, b) => b.voltageDropPct - a.voltageDropPct);
  }, [cables, getConductorSection, perCableCurrents, defaultCurrentA, systemVoltageV, allowedDropPct, powerSystem, derating]);

  const kpiTotalCables = results.length;
  const kpiPassCount = results.filter((r) => r.pass).length;
  const kpiFailCount = results.filter((r) => !r.pass && r.conductorMm2 !== null).length;
  const kpiMaxDropPct = results.length > 0 ? Math.max(...results.map((r) => r.voltageDropPct)) : 0;
  const kpiOverCurrentCount = results.filter(r => r.allowableCurrentA !== null && r.currentA > r.allowableCurrentA).length;

  const handleCurrentChange = useCallback((cableId: string, value: string) => {
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed >= 0) {
      setPerCableCurrents((prev) => ({ ...prev, [cableId]: parsed }));
    } else if (value === '') {
      setPerCableCurrents((prev) => {
        const next = { ...prev };
        delete next[cableId];
        return next;
      });
    }
  }, []);

  const handleResetCurrents = useCallback(() => {
    setPerCableCurrents({});
  }, []);

  const handleExportCSV = useCallback(() => {
    const header = [
      '케이블명',
      '타입',
      '길이(m)',
      '도체단면적(mm²)',
      '전류(A)',
      '허용전류Iz(A)',
      '전압강하(V)',
      '전압강하율(%)',
      '판정',
    ].join(',');

    const rows = results.map((r) =>
      [
        `"${r.name}"`,
        `"${r.type}"`,
        r.lengthM.toFixed(2),
        r.conductorMm2 !== null ? r.conductorMm2.toFixed(2) : 'N/A',
        r.currentA.toFixed(1),
        r.allowableCurrentA !== null ? r.allowableCurrentA.toFixed(0) : 'N/A',
        r.voltageDropV.toFixed(3),
        r.voltageDropPct.toFixed(3),
        r.pass ? 'PASS' : 'FAIL',
      ].join(',')
    );

    const csvContent = [header, ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `voltage_drop_IEC60092_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [results]);

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 bg-gray-800 border-b border-gray-700 shrink-0">
        <Zap className="text-yellow-400" size={20} />
        <h2 className="text-base font-semibold text-gray-100">전압강하 분석</h2>
        <span className="text-xs text-gray-400 ml-1">IEC 60092 / JIS C3410-2010</span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={handleResetCurrents}
            title="전류 개별 설정 초기화"
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-xs text-gray-200 transition"
          >
            <RefreshCw size={13} />
            초기화
          </button>
          <button
            onClick={handleExportCSV}
            title="CSV 내보내기"
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-blue-700 hover:bg-blue-600 text-xs text-white transition"
          >
            <Download size={13} />
            CSV 내보내기
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      <div className="px-5 py-3 bg-gray-850 border-b border-gray-700 shrink-0" style={{ background: '#1a2233' }}>
        <div className="flex flex-wrap items-end gap-5">
          <div className="flex items-center gap-2">
            <Settings size={14} className="text-gray-400" />
            <span className="text-xs font-medium text-gray-400">시스템 설정</span>
          </div>

          {/* 시스템전압 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">시스템전압 (V)</label>
            <input
              type="number"
              min={1}
              value={systemVoltageV}
              onChange={(e) => setSystemVoltageV(parseFloat(e.target.value) || 440)}
              className="w-24 px-2 py-1 rounded bg-gray-700 border border-gray-600 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* 허용강하율 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">허용강하율 (%)</label>
            <input
              type="number"
              min={0.1}
              max={100}
              step={0.1}
              value={allowedDropPct}
              onChange={(e) => setAllowedDropPct(parseFloat(e.target.value) || 3)}
              className="w-24 px-2 py-1 rounded bg-gray-700 border border-gray-600 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* 전류기본값 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">전류기본값 (A)</label>
            <input
              type="number"
              min={0.1}
              step={0.5}
              value={defaultCurrentA}
              onChange={(e) => setDefaultCurrentA(parseFloat(e.target.value) || 10)}
              className="w-24 px-2 py-1 rounded bg-gray-700 border border-gray-600 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* 전력계통 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">전력계통</label>
            <div className="flex rounded overflow-hidden border border-gray-600">
              <button
                onClick={() => setPowerSystem('AC3')}
                className={`px-3 py-1 text-xs font-medium transition ${
                  powerSystem === 'AC3'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                3상 AC
              </button>
              <button
                onClick={() => setPowerSystem('DC')}
                className={`px-3 py-1 text-xs font-medium transition ${
                  powerSystem === 'DC'
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                DC
              </button>
            </div>
          </div>

          {/* 허용전류 보정계수 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400 flex items-center gap-1">
              <Thermometer size={11} />
              허용전류 (45°C)
            </label>
            <div className="flex rounded overflow-hidden border border-gray-600">
              <button
                onClick={() => setDerating('100')}
                title="단독 포설 / 공기 중 (100%)"
                className={`px-3 py-1 text-xs font-medium transition ${
                  derating === '100'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                100%
              </button>
              <button
                onClick={() => setDerating('85')}
                title="트레이/묶음 포설, OD &lt; 30mm (85%)"
                className={`px-3 py-1 text-xs font-medium transition ${
                  derating === '85'
                    ? 'bg-amber-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                85%
              </button>
            </div>
          </div>

          {/* Formula display */}
          <div className="ml-auto text-xs text-gray-500 italic">
            {powerSystem === 'AC3' ? (
              <span>ΔV = √3 × ρ × L × I / A &nbsp;|&nbsp; ρ = 0.0175 Ω·mm²/m</span>
            ) : (
              <span>ΔV = 2 × ρ × L × I / A &nbsp;|&nbsp; ρ = 0.0175 Ω·mm²/m</span>
            )}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-3 px-5 py-3 shrink-0">
        <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
          <div className="text-xs text-gray-400 mb-1">총 케이블</div>
          <div className="text-2xl font-bold text-gray-100">{kpiTotalCables}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 border border-green-800">
          <div className="flex items-center gap-1 text-xs text-green-400 mb-1">
            <CheckCircle size={11} />
            PASS
          </div>
          <div className="text-2xl font-bold text-green-400">{kpiPassCount}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 border border-red-800">
          <div className="flex items-center gap-1 text-xs text-red-400 mb-1">
            <AlertTriangle size={11} />
            FAIL
          </div>
          <div className="text-2xl font-bold text-red-400">{kpiFailCount}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 border border-yellow-800">
          <div className="flex items-center gap-1 text-xs text-yellow-400 mb-1">
            <Zap size={11} />
            최대강하율
          </div>
          <div className="text-2xl font-bold text-yellow-400">
            {kpiMaxDropPct.toFixed(2)}%
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 border border-orange-800">
          <div className="flex items-center gap-1 text-xs text-orange-400 mb-1">
            <Thermometer size={11} />
            과전류 케이블
          </div>
          <div className="text-2xl font-bold text-orange-400">{kpiOverCurrentCount}</div>
        </div>
      </div>

      {/* Warning: no cableTypeDB */}
      {cableTypeDB.length === 0 && (
        <div className="mx-5 mb-2 flex items-center gap-2 px-3 py-2 rounded bg-yellow-900/40 border border-yellow-700 text-yellow-300 text-xs shrink-0">
          <AlertTriangle size={14} />
          케이블 타입 DB가 없습니다. 도체 단면적 값을 조회할 수 없어 전압강하를 계산할 수 없습니다.
        </div>
      )}

      {/* Derating info */}
      <div className="mx-5 mb-2 flex items-center gap-2 px-3 py-1.5 rounded bg-blue-900/20 border border-blue-800/40 text-blue-300 text-xs shrink-0">
        <Thermometer size={12} />
        허용전류 기준: IEC 60092 / JIS C3410-2010 &nbsp;|&nbsp; 45°C &nbsp;|&nbsp;
        {derating === '100' ? (
          <span className="text-emerald-300 font-medium">100% — 단독 포설 (공기 중)</span>
        ) : (
          <span className="text-amber-300 font-medium">85% — 트레이/묶음 포설 (OD &lt; 30mm)</span>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-5 pb-5">
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-500">
            <Zap size={36} className="mb-3 opacity-30" />
            <p className="text-sm">케이블 데이터가 없습니다.</p>
          </div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-gray-800">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-300 border-b border-gray-700 whitespace-nowrap">
                  케이블명
                </th>
                <th className="px-3 py-2 text-left font-semibold text-gray-300 border-b border-gray-700 whitespace-nowrap">
                  타입
                </th>
                <th className="px-3 py-2 text-right font-semibold text-gray-300 border-b border-gray-700 whitespace-nowrap">
                  길이 (m)
                </th>
                <th className="px-3 py-2 text-right font-semibold text-gray-300 border-b border-gray-700 whitespace-nowrap">
                  도체 (mm²)
                </th>
                <th className="px-3 py-2 text-right font-semibold text-gray-300 border-b border-gray-700 whitespace-nowrap">
                  전류 I (A)
                </th>
                <th className="px-3 py-2 text-right font-semibold text-gray-300 border-b border-gray-700 whitespace-nowrap">
                  허용 Iz (A)
                </th>
                <th className="px-3 py-2 text-right font-semibold text-gray-300 border-b border-gray-700 whitespace-nowrap">
                  전압강하 (V)
                </th>
                <th className="px-3 py-2 text-right font-semibold text-gray-300 border-b border-gray-700 whitespace-nowrap">
                  강하율 (%)
                </th>
                <th className="px-3 py-2 text-center font-semibold text-gray-300 border-b border-gray-700 whitespace-nowrap">
                  판정
                </th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, idx) => {
                const isOverCurrent = r.allowableCurrentA !== null && r.currentA > r.allowableCurrentA;
                const rowBg = !r.pass
                  ? 'bg-red-950/40 hover:bg-red-950/70'
                  : isOverCurrent
                  ? 'bg-orange-950/30 hover:bg-orange-950/50'
                  : idx % 2 === 0
                  ? 'bg-gray-900 hover:bg-gray-800'
                  : 'hover:bg-gray-800';
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-gray-800 transition-colors ${rowBg}`}
                    style={idx % 2 !== 0 && r.pass && !isOverCurrent ? { background: '#1e2535' } : undefined}
                  >
                    {/* 케이블명 */}
                    <td className={`px-3 py-2 font-medium ${!r.pass ? 'text-red-300' : 'text-gray-100'}`}>
                      {r.name}
                    </td>

                    {/* 타입 */}
                    <td className="px-3 py-2 text-gray-400">{r.type}</td>

                    {/* 길이 */}
                    <td className="px-3 py-2 text-right text-gray-300">
                      {r.lengthM > 0 ? r.lengthM.toFixed(1) : <span className="text-gray-600">—</span>}
                    </td>

                    {/* 도체단면적 */}
                    <td className="px-3 py-2 text-right">
                      {r.conductorMm2 !== null ? (
                        <span className="text-blue-300 font-mono">{r.conductorMm2}</span>
                      ) : (
                        <span className="text-yellow-600">N/A</span>
                      )}
                    </td>

                    {/* 전류 (editable per cable) */}
                    <td className={`px-3 py-2 text-right ${isOverCurrent ? 'text-orange-400' : ''}`}>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={perCableCurrents[r.id] ?? defaultCurrentA}
                        onChange={(e) => handleCurrentChange(r.id, e.target.value)}
                        className={`w-16 text-right px-1 py-0.5 rounded border text-xs focus:outline-none focus:border-blue-500 ${
                          isOverCurrent
                            ? 'bg-orange-900/50 border-orange-600 text-orange-300'
                            : 'bg-gray-700 border-gray-600 text-gray-100'
                        }`}
                      />
                    </td>

                    {/* 허용전류 Iz */}
                    <td className="px-3 py-2 text-right">
                      {r.allowableCurrentA !== null ? (
                        <span className={`font-mono ${isOverCurrent ? 'text-orange-400 font-semibold' : 'text-emerald-400'}`}>
                          {r.allowableCurrentA}
                          {isOverCurrent && (
                            <span className="ml-1 text-orange-500">!</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>

                    {/* 전압강하 V */}
                    <td className={`px-3 py-2 text-right font-mono ${!r.passVoltageDrop && r.conductorMm2 !== null ? 'text-red-400' : 'text-gray-300'}`}>
                      {r.conductorMm2 !== null && r.lengthM > 0
                        ? r.voltageDropV.toFixed(3)
                        : <span className="text-gray-600">—</span>}
                    </td>

                    {/* 전압강하율 % */}
                    <td className={`px-3 py-2 text-right font-mono font-semibold ${
                      !r.passVoltageDrop && r.conductorMm2 !== null
                        ? 'text-red-400'
                        : 'text-green-400'
                    }`}>
                      {r.conductorMm2 !== null && r.lengthM > 0 ? (
                        <>
                          {r.voltageDropPct.toFixed(3)}
                          <span className="font-normal text-gray-500 ml-0.5">%</span>
                        </>
                      ) : (
                        <span className="text-gray-600 font-normal">—</span>
                      )}
                    </td>

                    {/* 판정 */}
                    <td className="px-3 py-2 text-center">
                      {r.conductorMm2 === null || r.lengthM === 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-gray-500 bg-gray-700 text-xs">
                          N/A
                        </span>
                      ) : r.pass ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-green-300 bg-green-900/50 text-xs font-semibold">
                          <CheckCircle size={10} />
                          PASS
                        </span>
                      ) : isOverCurrent && r.passVoltageDrop ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-orange-300 bg-orange-900/60 text-xs font-semibold">
                          <AlertTriangle size={10} />
                          과전류
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-red-300 bg-red-900/60 text-xs font-semibold">
                          <AlertTriangle size={10} />
                          FAIL
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer info */}
      <div className="px-5 py-2 border-t border-gray-700 bg-gray-800 text-xs text-gray-500 shrink-0 flex flex-wrap gap-x-6 gap-y-1">
        <span>
          기준: IEC 60092 / JIS C3410-2010 &nbsp;|&nbsp;
          {powerSystem === 'AC3' ? '3상 AC: ΔV = √3·ρ·L·I/A' : 'DC: ΔV = 2·ρ·L·I/A'}
        </span>
        <span>ρ(Cu) = 0.0175 Ω·mm²/m &nbsp;|&nbsp; 45°C</span>
        <span>
          허용전류 {derating}%
          {derating === '85' ? ' (트레이/묶음)' : ' (단독/공기 중)'}
        </span>
        <span>시스템전압 {systemVoltageV} V &nbsp;|&nbsp; 허용강하 {allowedDropPct}%</span>
        <span className="ml-auto">전압강하율 내림차순 정렬</span>
      </div>
    </div>
  );
};

export default VoltageDropTab;
