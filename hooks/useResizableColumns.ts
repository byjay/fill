import { useState, useCallback } from 'react';

/**
 * 테이블 컬럼 드래그 리사이즈 훅
 * 헤더 우측 핸들을 드래그하면 컬럼 폭 조절
 */
export function useResizableColumns(initialWidths: number[]) {
  const [widths, setWidths] = useState<number[]>(initialWidths);

  const startResize = useCallback((colIndex: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = widths[colIndex];

    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      setWidths(prev => {
        const next = [...prev];
        next[colIndex] = Math.max(40, startWidth + delta);
        return next;
      });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [widths]);

  return { widths, setWidths, startResize };
}
