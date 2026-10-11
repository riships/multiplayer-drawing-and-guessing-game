import React, { useState } from 'react';
import { ClientRoomState } from '../../types';
import { Clock, Copy, Check, Users, PenLine } from 'lucide-react';
import styles from './Header.module.css';

interface HeaderProps {
  roomState: ClientRoomState;
  myPlayerId: string;
}

export const Header: React.FC<HeaderProps> = ({ roomState, myPlayerId }) => {
  const [copied, setCopied] = useState(false);
  const isDrawer = roomState.currentDrawerId === myPlayerId;
  const currentDrawer = roomState.players.find((p) => p.id === roomState.currentDrawerId);

  const handleCopyLink = () => {
    const url = `${window.location.origin}/?room=${roomState.roomId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isUrgentTimer = roomState.timeLeft <= 10 && roomState.state === 'DRAWING';

  return (
    <header className={`panel ${styles.header}`}>
      {/* Left: Room Badge & Round Details */}
      <div className={styles.leftSection}>
        <button
          type="button"
          onClick={handleCopyLink}
          className={`btn btn-secondary ${styles.roomButton}`}
          aria-label={`Copy link for room ${roomState.roomId}`}
          title="Click to copy invite link"
        >
          {copied ? <Check size={14} color="var(--color-success)" /> : <Copy size={14} />}
          <span>Room: <strong>{roomState.roomId}</strong></span>
          {copied && <span className={styles.copiedText}>Copied</span>}
        </button>

        <div className={`badge badge-neutral ${styles.roundBadge}`}>
          <Users size={13} />
          <span>Round {roomState.currentRound} of {roomState.totalRounds}</span>
        </div>
      </div>

      {/* Center: Secret Word or Progressive Mask */}
      <div className={styles.centerSection}>
        {roomState.state === 'DRAWING' ? (
          <div>
            {isDrawer ? (
              <div className={styles.drawerBadge}>
                <PenLine size={15} color="var(--color-primary)" />
                <span className={styles.drawLabel}>Draw this:</span>
                <span className={styles.drawWord}>
                  {roomState.secretWord || roomState.wordMask}
                </span>
              </div>
            ) : (
              <div>
                <div className={styles.wordMask}>
                  {roomState.wordMask || (roomState.wordLength ? '_ '.repeat(roomState.wordLength) : '')}
                </div>
                <div className={styles.drawerHint}>
                  {currentDrawer?.name || 'Drawer'} is drawing ({roomState.wordLength || 0} letters)
                </div>
              </div>
            )}
          </div>
        ) : roomState.state === 'SELECTING_WORD' ? (
          <div className={styles.selectingState}>
            {isDrawer ? 'Select a word to draw below' : `${currentDrawer?.name || 'Drawer'} is selecting a word...`}
          </div>
        ) : roomState.state === 'ROUND_REVEAL' ? (
          <div className={styles.revealState}>
            The word was: <span className={styles.revealWord}>{roomState.secretWord}</span>
          </div>
        ) : (
          <div className={styles.defaultTitle}>Pictionary Live</div>
        )}
      </div>

      {/* Right: Tabular Countdown Timer */}
      <div className={styles.rightSection}>
        <div className={`badge tabular-nums ${isUrgentTimer ? 'badge-danger' : 'badge-neutral'} ${styles.timerBadge}`}>
          <Clock size={16} />
          <span>{roomState.timeLeft}s</span>
        </div>
      </div>
    </header>
  );
};
