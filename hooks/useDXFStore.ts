/**
 * DXF 상태 관리 훅 — 세션 전용 (D1 저장 불필요)
 * 기존 SCM 코드 수정 없이 별도 모듈로 동작
 */
import { useState, useCallback, useMemo } from 'react';
import { parseDXF, ParsedDXF } from '../services/dxfParser';

// 단위 변환 테이블 (INSUNITS → mm)
const INSUNITS_TO_MM: Record<number, number> = {
  0: 1,       // unitless
  1: 25.4,    // inches
  2: 304.8,   // feet
  4: 1,       // mm
  5: 10,      // cm
  6: 1000,    // m
};

export function useDXFStore() {
  const [dxf, setDxf] = useState<ParsedDXF | null>(null);
  const [dxfFileName, setDxfFileName] = useState<string>('');
  const [visibleLayers, setVisibleLayers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 단위 변환 계수 (DXF 단위 → mm)
  const unitToMM = useMemo(() => {
    if (!dxf) return 1;
    return INSUNITS_TO_MM[dxf.header.insunits] ?? 1;
  }, [dxf]);

  // DXF 파일 로드
  const loadDXF = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const text = await file.text();
      const parsed = parseDXF(text);
      setDxf(parsed);
      setDxfFileName(file.name);
      // 모든 레이어 기본 표시
      const layers = new Set<string>();
      parsed.layers.forEach((_, name) => layers.add(name));
      // 엔티티에서도 레이어 수집 (레이어 테이블에 없는 경우 대비)
      parsed.entities.forEach(e => layers.add(e.layer));
      setVisibleLayers(layers);
    } catch (err: any) {
      setError(`DXF 파싱 실패: ${err?.message || '알 수 없는 오류'}`);
      setDxf(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // 레이어 토글
  const toggleLayer = useCallback((layerName: string) => {
    setVisibleLayers(prev => {
      const next = new Set(prev);
      if (next.has(layerName)) next.delete(layerName);
      else next.add(layerName);
      return next;
    });
  }, []);

  // 전체 레이어 ON/OFF
  const setAllLayersVisible = useCallback((visible: boolean) => {
    if (!dxf) return;
    if (visible) {
      const all = new Set<string>();
      dxf.layers.forEach((_, name) => all.add(name));
      dxf.entities.forEach(e => all.add(e.layer));
      setVisibleLayers(all);
    } else {
      setVisibleLayers(new Set());
    }
  }, [dxf]);

  // DXF 제거
  const clearDXF = useCallback(() => {
    setDxf(null);
    setDxfFileName('');
    setVisibleLayers(new Set());
    setError(null);
  }, []);

  // 레이어 목록 (정렬)
  const layerList = useMemo(() => {
    if (!dxf) return [];
    const names = new Set<string>();
    dxf.layers.forEach((_, name) => names.add(name));
    dxf.entities.forEach(e => names.add(e.layer));
    return Array.from(names).sort();
  }, [dxf]);

  return {
    dxf,
    dxfFileName,
    visibleLayers,
    loading,
    error,
    unitToMM,
    layerList,
    loadDXF,
    toggleLayer,
    setAllLayersVisible,
    clearDXF,
  };
}
