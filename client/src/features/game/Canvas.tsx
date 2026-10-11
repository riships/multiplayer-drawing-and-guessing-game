import React, { useRef, useEffect, useState, useCallback } from 'react';
import { StrokeAction, StrokePoint, DrawTool } from '../../types';
import { performFloodFill } from '../../utils/floodFill';
import {
  Pen,
  Eraser,
  PaintBucket,
  Undo2,
  Trash2,
  Eye,
} from 'lucide-react';
import styles from './Canvas.module.css';

interface CanvasProps {
  isDrawer: boolean;
  drawerName?: string;
  canvasHistory: StrokeAction[];
  onDrawStroke: (stroke: StrokeAction) => void;
  onDrawFill: (fillAction: StrokeAction) => void;
  onUndo: () => void;
  onClear: () => void;
}

const PALETTE = [
  '#000000', '#ffffff', '#475569', '#94a3b8',
  '#dc2626', '#ea580c', '#d97706', '#ca8a04',
  '#16a34a', '#059669', '#0891b2', '#2563eb',
  '#4f46e5', '#7c3aed', '#9333ea', '#db2777',
  '#78350f', '#fef08a',
];

const BRUSH_SIZES = [
  { size: 3, label: 'Fine' },
  { size: 6, label: 'Medium' },
  { size: 12, label: 'Thick' },
  { size: 20, label: 'Heavy' },
  { size: 32, label: 'Broad' },
];

export const Canvas: React.FC<CanvasProps> = ({
  isDrawer,
  drawerName,
  canvasHistory,
  onDrawStroke,
  onDrawFill,
  onUndo,
  onClear,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<DrawTool>('pen');
  const [color, setColor] = useState<string>('#000000');
  const [brushSize, setBrushSize] = useState<number>(6);
  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<StrokePoint[]>([]);
  const lastEmitTimeRef = useRef<number>(0);
  const flushTimerRef = useRef<number | null>(null);

  // Helper to flush current batched stroke points to the server
  const flushBatch = useCallback(() => {
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    const pts = currentPointsRef.current;
    if (pts.length > 1) {
      const activeColor = tool === 'eraser' ? '#ffffff' : color;
      const activeSize = tool === 'eraser' ? brushSize * 2 : brushSize;

      onDrawStroke({
        id: 'str_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        type: 'stroke',
        points: [...pts],
        color: activeColor,
        size: activeSize,
        timestamp: Date.now(),
      });

      // Keep the final coordinate as the starting anchor for the next chunk to guarantee continuity
      const lastPoint = pts[pts.length - 1];
      currentPointsRef.current = [lastPoint];
      lastEmitTimeRef.current = Date.now();
    }
  }, [tool, color, brushSize, onDrawStroke]);

  // Clean up any pending throttle timers on unmount
  useEffect(() => {
    return () => {
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
      }
    };
  }, []);

  // Redraw complete history on canvas
  const redrawAll = useCallback(
    (history: StrokeAction[]) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;

      // Pure white paper background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);

      for (const action of history) {
        if (action.type === 'stroke' && action.points && action.points.length > 0) {
          ctx.strokeStyle = action.color || '#000000';
          ctx.lineWidth = (action.size || 6) * (w / 1000);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();

          const pts = action.points;
          ctx.moveTo(pts[0].x * w, pts[0].y * h);

          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x * w, pts[i].y * h);
          }
          ctx.stroke();
        } else if (action.type === 'fill' && action.point && action.color) {
          performFloodFill(
            ctx,
            Math.floor(action.point.x * w),
            Math.floor(action.point.y * h),
            action.color,
          );
        } else if (action.type === 'clear') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
        }
      }
    },
    [],
  );

  // When drawer status toggles, clear local drawing scratch state
  useEffect(() => {
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    currentPointsRef.current = [];
    isDrawingRef.current = false;
  }, [isDrawer]);

  // Synchronize internal canvas logical coordinates (1000x650 virtual resolution)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = 1000;
    canvas.height = 650;
    redrawAll(canvasHistory);
  }, []);

  // Sync canvas whenever history changes
  useEffect(() => {
    if (canvasHistory.length === 0) {
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      currentPointsRef.current = [];
      isDrawingRef.current = false;
    }
    redrawAll(canvasHistory);
  }, [canvasHistory, redrawAll]);

  // Handle pointer down (mouse/touch/stylus)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawer) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.setPointerCapture(e.pointerId);
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    if (tool === 'fill') {
      const fillAction: StrokeAction = {
        id: 'fill_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        type: 'fill',
        point: { x, y },
        color,
        timestamp: Date.now(),
      };
      onDrawFill(fillAction);

      const ctx = canvas.getContext('2d');
      if (ctx) {
        performFloodFill(
          ctx,
          Math.floor(x * canvas.width),
          Math.floor(y * canvas.height),
          color,
        );
      }
      return;
    }

    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    isDrawingRef.current = true;
    lastEmitTimeRef.current = Date.now();
    const activeColor = tool === 'eraser' ? '#ffffff' : color;
    const activeSize = tool === 'eraser' ? brushSize * 2 : brushSize;

    currentPointsRef.current = [{ x, y }];

    // Render initial point locally immediately
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.strokeStyle = activeColor;
      ctx.fillStyle = activeColor;
      ctx.lineWidth = activeSize * (canvas.width / 1000);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.arc(
        x * canvas.width,
        y * canvas.height,
        (activeSize / 2) * (canvas.width / 1000),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  };

  // Handle pointer move
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawer || !isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    const pts = currentPointsRef.current;
    const lastPoint = pts[pts.length - 1];

    // Spatial thinning: filter sub-pixel jitter (< ~2px in normalized space)
    if (lastPoint) {
      const dx = x - lastPoint.x;
      const dy = y - lastPoint.y;
      if (dx * dx + dy * dy < 0.000004) {
        return;
      }
    }

    pts.push({ x, y });

    // Streamline intermediate render
    const ctx = canvas.getContext('2d');
    if (ctx && lastPoint) {
      const activeColor = tool === 'eraser' ? '#ffffff' : color;
      const activeSize = tool === 'eraser' ? brushSize * 2 : brushSize;

      ctx.strokeStyle = activeColor;
      ctx.lineWidth = activeSize * (canvas.width / 1000);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(lastPoint.x * canvas.width, lastPoint.y * canvas.height);
      ctx.lineTo(x * canvas.width, y * canvas.height);
      ctx.stroke();
    }

    // Hybrid Throttling:
    // Flush if time elapsed >= 25ms (~40 Hz) or if buffer size >= 16 points
    const now = Date.now();
    const timeSinceLastEmit = now - lastEmitTimeRef.current;

    if (pts.length >= 16 || timeSinceLastEmit >= 25) {
      flushBatch();
    } else if (flushTimerRef.current === null) {
      // Schedule trailing flush so slow strokes stream smoothly in real time
      flushTimerRef.current = window.setTimeout(() => {
        flushBatch();
      }, Math.max(5, 25 - timeSinceLastEmit));
    }
  };

  // Handle pointer up
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawer || !isDrawingRef.current) return;
    isDrawingRef.current = false;

    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }

    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    const pts = currentPointsRef.current;
    if (pts.length > 0) {
      const activeColor = tool === 'eraser' ? '#ffffff' : color;
      const activeSize = tool === 'eraser' ? brushSize * 2 : brushSize;

      onDrawStroke({
        id: 'str_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        type: 'stroke',
        points: pts,
        color: activeColor,
        size: activeSize,
        timestamp: Date.now(),
      });
      currentPointsRef.current = [];
    }
  };

  // Keyboard shortcut: Ctrl+Z for Undo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isDrawer) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        onUndo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawer, onUndo]);

  return (
    <div className={`panel ${styles.container}`}>
      {/* Canvas Viewport */}
      <div
        className={`${styles.canvasWrapper} ${isDrawer ? styles.cursorDrawing : styles.cursorSpectating}`}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={styles.canvasElement}
        />

        {/* Spectator Indicator */}
        {!isDrawer && (
          <div className={styles.spectatorBanner}>
            <Eye size={14} />
            <span>Spectating {drawerName || 'Drawer'}</span>
          </div>
        )}
      </div>

      {/* Drawer Control Toolbar */}
      {isDrawer && (
        <div className={styles.toolbar}>
          {/* Main Drawing Tools */}
          <div role="group" aria-label="Drawing tools" className={styles.toolGroup}>
            <button
              type="button"
              onClick={() => setTool('pen')}
              aria-label="Pen tool"
              aria-pressed={tool === 'pen'}
              className={`btn ${styles.toolBtn} ${tool === 'pen' ? styles.toolBtnActive : ''}`}
            >
              <Pen size={16} />
            </button>
            <button
              type="button"
              onClick={() => setTool('eraser')}
              aria-label="Eraser tool"
              aria-pressed={tool === 'eraser'}
              className={`btn ${styles.toolBtn} ${tool === 'eraser' ? styles.toolBtnActive : ''}`}
            >
              <Eraser size={16} />
            </button>
            <button
              type="button"
              onClick={() => setTool('fill')}
              aria-label="Flood fill tool"
              aria-pressed={tool === 'fill'}
              className={`btn ${styles.toolBtn} ${tool === 'fill' ? styles.toolBtnActive : ''}`}
            >
              <PaintBucket size={16} />
            </button>
          </div>

          {/* Brush Sizes */}
          <div role="group" aria-label="Brush sizes" className={styles.brushGroup}>
            {BRUSH_SIZES.map(({ size, label }) => (
              <button
                key={size}
                type="button"
                onClick={() => setBrushSize(size)}
                aria-label={`${label} brush (${size}px)`}
                aria-pressed={brushSize === size}
                className={`${styles.brushBtn} ${brushSize === size ? styles.brushBtnActive : ''}`}
              >
                <div
                  style={{
                    width: `${Math.min(16, size / 2 + 3)}px`,
                    height: `${Math.min(16, size / 2 + 3)}px`,
                    borderRadius: 'var(--radius-full)',
                    background: brushSize === size ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  }}
                />
              </button>
            ))}
          </div>

          {/* Palette Colors */}
          <div role="group" aria-label="Color palette" className={styles.paletteGroup}>
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setColor(c);
                  if (tool === 'eraser') setTool('pen');
                }}
                aria-label={`Color ${c}`}
                aria-pressed={color === c && tool !== 'eraser'}
                className={`${styles.colorSwatch} ${color === c && tool !== 'eraser' ? styles.colorSwatchActive : ''}`}
                style={{ background: c }}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => {
                setColor(e.target.value);
                if (tool === 'eraser') setTool('pen');
              }}
              aria-label="Custom color picker"
              className={styles.customColorPicker}
            />
          </div>

          {/* Undo & Clear Canvas */}
          <div className={styles.actionsGroup}>
            <button
              type="button"
              onClick={onUndo}
              aria-label="Undo stroke (Ctrl+Z)"
              className={`btn btn-secondary ${styles.actionBtn}`}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 size={15} />
              <span>Undo</span>
            </button>
            <button
              type="button"
              onClick={onClear}
              aria-label="Clear canvas"
              className={`btn btn-danger ${styles.actionBtn}`}
              title="Clear canvas"
            >
              <Trash2 size={15} />
              <span>Clear</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
