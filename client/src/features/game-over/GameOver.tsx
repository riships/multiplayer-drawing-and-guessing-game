import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Player, DrawingReplay } from '../../types';
import { Trophy, Film, RotateCcw, Home, LogOut } from 'lucide-react';
import styles from './GameOver.module.css';

interface GameOverProps {
  podium: Player[];
  replays: DrawingReplay[];
  isHost: boolean;
  onOpenReplay: () => void;
  onPlayAgain: () => void;
  onReturnToLobby: () => void;
  onExit: () => void;
}

export const GameOver: React.FC<GameOverProps> = ({
  podium,
  replays,
  isHost,
  onOpenReplay,
  onPlayAgain,
  onReturnToLobby,
  onExit,
}) => {
  useEffect(() => {
    confetti({
      particleCount: 100,
      spread: 60,
      origin: { y: 0.6 },
    });
  }, []);

  const first = podium[0];
  const second = podium[1];
  const third = podium[2];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-over-title"
      className={styles.overlay}
    >
      <div className={`panel ${styles.panel}`}>
        <div className={styles.topBadge}>
          <Trophy size={20} />
          <span className={styles.subtitle}>Match Completed</span>
        </div>

        <h1 id="game-over-title" className={styles.title}>
          Final Standings
        </h1>

        {/* Podium Layout */}
        <div className={styles.podiumContainer}>
          {/* 2nd Place */}
          {second && (
            <div className={`${styles.podiumColumn} ${styles.podiumColSecond}`}>
              <div className={styles.avatarNormal}>
                {second.name.charAt(0).toUpperCase()}
              </div>
              <div className={styles.nameNormal}>
                {second.name}
              </div>
              <div className={`tabular-nums ${styles.scoreNormal}`}>
                {second.score} pts
              </div>
              <div className={styles.podiumBarSecond}>
                2nd
              </div>
            </div>
          )}

          {/* 1st Place */}
          {first && (
            <div className={`${styles.podiumColumn} ${styles.podiumColFirst}`}>
              <div className={styles.avatarWinner}>
                {first.name.charAt(0).toUpperCase()}
              </div>
              <div className={styles.nameWinner}>
                {first.name}
              </div>
              <div className={`tabular-nums ${styles.scoreWinner}`}>
                {first.score} pts
              </div>
              <div className={styles.podiumBarFirst}>
                1st
              </div>
            </div>
          )}

          {/* 3rd Place */}
          {third && (
            <div className={`${styles.podiumColumn} ${styles.podiumColThird}`}>
              <div className={styles.avatarNormal}>
                {third.name.charAt(0).toUpperCase()}
              </div>
              <div className={styles.nameNormal}>
                {third.name}
              </div>
              <div className={`tabular-nums ${styles.scoreNormal}`}>
                {third.score} pts
              </div>
              <div className={styles.podiumBarThird}>
                3rd
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className={styles.actionsGroup}>
          {replays && replays.length > 0 && (
            <button
              type="button"
              onClick={onOpenReplay}
              className={`btn btn-secondary ${styles.replayBtn}`}
            >
              <Film size={16} />
              <span>Watch Replays ({replays.length})</span>
            </button>
          )}

          {isHost && (
            <>
              <button
                type="button"
                onClick={onPlayAgain}
                className={`btn btn-primary ${styles.playAgainBtn}`}
              >
                <RotateCcw size={16} />
                <span>Play Again</span>
              </button>

              <button
                type="button"
                onClick={onReturnToLobby}
                className={`btn btn-secondary ${styles.lobbyBtn}`}
                title="Finish match and return all players to lobby"
              >
                <Home size={16} />
                <span>Return to Lobby</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onExit}
            className={`btn ${styles.exitBtn}`}
            title="Exit match and return to main screen"
          >
            <LogOut size={16} />
            <span>Exit Game</span>
          </button>
        </div>

        {!isHost && (
          <p className={styles.guestNote}>
            Waiting for host to start a new match or return to lobby...
          </p>
        )}
      </div>
    </div>
  );
};
