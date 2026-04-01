import React from 'react';

/**
 * 테이블 헤더 리사이즈 핸들
 * <th> 내부 마지막에 렌더링
 */
export function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <span
      onMouseDown={onMouseDown}
      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-400/50 active:bg-blue-400 transition-colors select-none z-10"
      style={{ touchAction: 'none' }}
    />
  );
}
