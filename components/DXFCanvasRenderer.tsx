import React, { useRef, useEffect } from 'react';
import { ParsedDXF, DXFEntity, DXFLine, DXFArc, DXFCircle, DXFLWPolyline, DXFText } from '../services/dxfParser';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */
interface DXFCanvasRendererProps {
  dxf: ParsedDXF | null;
  viewBox: { x: number; y: number; w: number; h: number };
  width: number;
  height: number;
  visibleLayers: Set<string>;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  ACI 색상 테이블 (DXF 표준 색상)                                      */
/* ------------------------------------------------------------------ */
const ACI_COLORS: Record<number, string> = {
  1: '#FF0000',
  2: '#FFFF00',
  3: '#00FF00',
  4: '#00FFFF',
  5: '#0000FF',
  6: '#FF00FF',
  7: '#FFFFFF',
  8: '#808080',
  9: '#C0C0C0',
  10: '#FF0000',
  11: '#FF7F7F',
  12: '#CC0000',
};

function aciToHex(color: number, layerColor?: number): string {
  if (color === 256 && layerColor) return ACI_COLORS[Math.abs(layerColor)] || '#FFFFFF';
  if (color === 0) return '#FFFFFF'; // BYBLOCK
  return ACI_COLORS[color] || '#FFFFFF';
}

/* ------------------------------------------------------------------ */
/*  좌표 변환 (World → Screen)                                         */
/*  DXF Y축 ↑  /  Canvas Y축 ↓                                        */
/* ------------------------------------------------------------------ */
function worldToScreen(
  wx: number,
  wy: number,
  viewBox: { x: number; y: number; w: number; h: number },
  canvasWidth: number,
  canvasHeight: number,
) {
  const sx = ((wx - viewBox.x) / viewBox.w) * canvasWidth;
  const sy = canvasHeight - ((wy - viewBox.y) / viewBox.h) * canvasHeight;
  return { sx, sy };
}

/* ------------------------------------------------------------------ */
/*  뷰포트 컬링 — 엔티티 bbox 가 viewBox 와 겹치는지 판정               */
/* ------------------------------------------------------------------ */
function entityOverlapsView(
  entity: DXFEntity,
  vb: { x: number; y: number; w: number; h: number },
): boolean {
  const vx2 = vb.x + vb.w;
  const vy2 = vb.y + vb.h;

  switch (entity.type) {
    case 'LINE': {
      const e = entity as DXFLine;
      const minX = Math.min(e.startX, e.endX);
      const maxX = Math.max(e.startX, e.endX);
      const minY = Math.min(e.startY, e.endY);
      const maxY = Math.max(e.startY, e.endY);
      return maxX >= vb.x && minX <= vx2 && maxY >= vb.y && minY <= vy2;
    }
    case 'CIRCLE': {
      const e = entity as DXFCircle;
      return (
        e.centerX + e.radius >= vb.x &&
        e.centerX - e.radius <= vx2 &&
        e.centerY + e.radius >= vb.y &&
        e.centerY - e.radius <= vy2
      );
    }
    case 'ARC': {
      const e = entity as DXFArc;
      return (
        e.centerX + e.radius >= vb.x &&
        e.centerX - e.radius <= vx2 &&
        e.centerY + e.radius >= vb.y &&
        e.centerY - e.radius <= vy2
      );
    }
    case 'LWPOLYLINE': {
      const e = entity as DXFLWPolyline;
      if (e.vertices.length === 0) return false;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const v of e.vertices) {
        if (v.x < minX) minX = v.x;
        if (v.x > maxX) maxX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.y > maxY) maxY = v.y;
      }
      return maxX >= vb.x && minX <= vx2 && maxY >= vb.y && minY <= vy2;
    }
    case 'TEXT':
    case 'MTEXT': {
      const e = entity as DXFText;
      return e.x >= vb.x && e.x <= vx2 && e.y >= vb.y && e.y <= vy2;
    }
    default:
      return true; // 알 수 없는 타입은 그려본다
  }
}

/* ------------------------------------------------------------------ */
/*  엔티티별 렌더링                                                     */
/* ------------------------------------------------------------------ */
function renderEntity(
  ctx: CanvasRenderingContext2D,
  entity: DXFEntity,
  viewBox: { x: number; y: number; w: number; h: number },
  canvasWidth: number,
  canvasHeight: number,
  layerColors: Map<string, number>,
) {
  const layerColor = layerColors.get(entity.layer);
  const color = aciToHex(entity.color ?? 256, layerColor);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;

  const scaleX = canvasWidth / viewBox.w;
  const scaleY = canvasHeight / viewBox.h;
  const scale = Math.min(scaleX, scaleY);

  switch (entity.type) {
    /* ---------- LINE ---------- */
    case 'LINE': {
      const e = entity as DXFLine;
      const p1 = worldToScreen(e.startX, e.startY, viewBox, canvasWidth, canvasHeight);
      const p2 = worldToScreen(e.endX, e.endY, viewBox, canvasWidth, canvasHeight);
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.stroke();
      break;
    }

    /* ---------- ARC ---------- */
    case 'ARC': {
      const e = entity as DXFArc;
      const c = worldToScreen(e.centerX, e.centerY, viewBox, canvasWidth, canvasHeight);
      const r = e.radius * scale;
      // DXF 각도: degree, 반시계 / Canvas: radian, 기본 시계
      // Y 반전으로 부호 반전
      const startRad = -e.endAngle * (Math.PI / 180);
      const endRad = -e.startAngle * (Math.PI / 180);
      ctx.beginPath();
      ctx.arc(c.sx, c.sy, r, startRad, endRad, false);
      ctx.stroke();
      break;
    }

    /* ---------- CIRCLE ---------- */
    case 'CIRCLE': {
      const e = entity as DXFCircle;
      const c = worldToScreen(e.centerX, e.centerY, viewBox, canvasWidth, canvasHeight);
      const r = e.radius * scale;
      ctx.beginPath();
      ctx.arc(c.sx, c.sy, r, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }

    /* ---------- LWPOLYLINE ---------- */
    case 'LWPOLYLINE': {
      const e = entity as DXFLWPolyline;
      if (e.vertices.length === 0) break;
      const pts = e.vertices.map(v => worldToScreen(v.x, v.y, viewBox, canvasWidth, canvasHeight));
      ctx.beginPath();
      ctx.moveTo(pts[0].sx, pts[0].sy);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].sx, pts[i].sy);
      }
      if (e.closed) ctx.closePath();
      ctx.stroke();
      break;
    }

    /* ---------- TEXT / MTEXT ---------- */
    case 'TEXT':
    case 'MTEXT': {
      const e = entity as DXFText;
      const p = worldToScreen(e.x, e.y, viewBox, canvasWidth, canvasHeight);
      const fontSize = Math.max(e.height * scale, 1);
      ctx.font = `${fontSize}px monospace`;
      ctx.fillStyle = color;
      ctx.fillText(e.text, p.sx, p.sy);
      break;
    }

    default:
      break;
  }
}

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */
export default function DXFCanvasRenderer({
  dxf,
  viewBox,
  width,
  height,
  visibleLayers,
  className,
}: DXFCanvasRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!dxf || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Clear & background
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0f172a'; // slate-900
    ctx.fillRect(0, 0, width, height);

    // 레이어 색상 맵 구축
    const layerColors = new Map<string, number>();
    dxf.layers.forEach((layer, name) => layerColors.set(name, layer.color));

    // 엔티티 렌더링
    for (const entity of dxf.entities) {
      if (!visibleLayers.has(entity.layer)) continue;
      if (!entityOverlapsView(entity, viewBox)) continue;
      renderEntity(ctx, entity, viewBox, width, height, layerColors);
    }
  }, [dxf, viewBox, width, height, visibleLayers]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
    />
  );
}
