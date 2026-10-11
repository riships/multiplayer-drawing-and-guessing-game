import React, { useRef, useEffect, useState, useCallback } from 'react';
import { DrawingReplay, StrokeAction } from '../../types';
import { performFloodFill } from '../../utils/floodFill';
import {
  Play,
  Pause,
  RotateCcw,
  SkipBack,
  SkipForward,
  X,
  Film,
} from 'lucide-react';
import styles from './ReplayViewer.module.css';

interface ReplayViewerProps {
  replays: DrawingReplay[];
  onClose: () => void;
}

export const ReplayViewer: React.FC<ReplayViewerProps> = ({ replays, onClose }) => {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const activeReplay = replays[selectedIdx] || null;
  const totalSteps = activeReplay ? activeReplay.actions.length : 0;

  const renderUpToStep = useCallback((actions: StrokeAction[], step: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    const slice = actions.slice(0, step);
    for (const action of slice) {
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
  }, []);

  useEffect(() => {
    if (activeReplay) {
      renderUpToStep(activeReplay.actions, currentStep);
    }
  }, [activeReplay, currentStep, renderUpToStep]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 1000;
    canvas.height = 650;
    if (activeReplay) {
      renderUpToStep(activeReplay.actions, currentStep);
    }
  }, [activeReplay, currentStep, renderUpToStep]);

  useEffect(() => {
    if (!isPlaying || !activeReplay) return;

    const intervalMs = Math.max(16, Math.floor(60 / speed));
    const timer = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= totalSteps) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, activeReplay, totalSteps, speed]);

  const handleSelectReplay = (idx: number) => {
    setSelectedIdx(idx);
    setCurrentStep(0);
    setIsPlaying(false);
  };

  const handleRestart = () => {
    setCurrentStep(0);
    setIsPlaying(true);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="replay-title"
      className={styles.overlay}
    >
      <div className={`panel ${styles.panel}`}>
        {/* Top Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <Film size={18} color="var(--color-primary)" />
            <h3 id="replay-title" className={styles.title}>
              Drawing Replay Studio
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close replay viewer"
            className={`btn btn-ghost ${styles.closeBtn}`}
          >
            <X size={18} />
          </button>
        </div>

        {/* Replay Tabs */}
        <div role="tablist" aria-label="Rounds" className={styles.tabsRow}>
          {replays.map((rep, idx) => (
            <button
              key={idx}
              type="button"
              role="tab"
              aria-selected={selectedIdx === idx}
              onClick={() => handleSelectReplay(idx)}
              className={`${selectedIdx === idx ? 'btn btn-primary' : 'btn btn-secondary'} ${styles.tabBtn}`}
            >
              Round {rep.round}: {rep.word.toUpperCase()} ({rep.drawerName})
            </button>
          ))}
        </div>

        {/* Canvas Display */}
        <div className={styles.canvasContainer}>
          <canvas
            ref={canvasRef}
            className={styles.canvasElement}
          />

          {activeReplay && (
            <div className={styles.wordOverlay}>
              <span>Word: <strong>{activeReplay.word.toUpperCase()}</strong></span>
              <span className={styles.overlayDivider}>•</span>
              <span className={styles.overlayDrawer}>Drawn by: {activeReplay.drawerName}</span>
            </div>
          )}
        </div>

        {/* Controls Footer */}
        <div className={styles.controlsFooter}>
          {/* Progress Slider */}
          <div className={styles.sliderRow}>
            <span className={`tabular-nums ${styles.stepCounter}`}>
              {currentStep} / {totalSteps}
            </span>
            <input
              type="range"
              min={0}
              max={totalSteps}
              value={currentStep}
              onChange={(e) => {
                setCurrentStep(Number(e.target.value));
                setIsPlaying(false);
              }}
              aria-label="Replay scrub bar"
              className={styles.sliderInput}
            />
          </div>

          {/* Action Buttons Toolbar */}
          <div className={styles.toolbarRow}>
            <div className={styles.buttonGroup}>
              <button
                type="button"
                onClick={() => setIsPlaying(!isPlaying)}
                className={`btn btn-primary ${styles.playBtn}`}
              >
                {isPlaying ? <Pause size={15} /> : <Play size={15} />}
                <span>{isPlaying ? 'Pause' : 'Play'}</span>
              </button>

              <button
                type="button"
                onClick={handleRestart}
                className={`btn btn-secondary ${styles.stepBtn}`}
                title="Restart replay"
                aria-label="Restart replay"
              >
                <RotateCcw size={15} />
              </button>

              <button
                type="button"
                onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
                className={`btn btn-secondary ${styles.stepBtn}`}
                title="Step backward"
                aria-label="Step backward"
              >
                <SkipBack size={15} />
              </button>

              <button
                type="button"
                onClick={() => setCurrentStep((s) => Math.min(totalSteps, s + 1))}
                className={`btn btn-secondary ${styles.stepBtn}`}
                title="Step forward"
                aria-label="Step forward"
              >
                <SkipForward size={15} />
              </button>
            </div>

            {/* Speed Selector */}
            <div className={styles.speedGroup}>
              <span className={styles.speedLabel}>Speed:</span>
              {[0.5, 1, 2, 4].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  className={`${speed === s ? 'btn btn-primary' : 'btn btn-secondary'} ${styles.speedBtn}`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
