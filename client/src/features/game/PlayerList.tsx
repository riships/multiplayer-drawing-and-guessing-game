import React from 'react';
import { Player } from '../../types';
import { Crown, Pencil, Check, WifiOff, Users } from 'lucide-react';
import styles from './PlayerList.module.css';

interface PlayerListProps {
  players: Player[];
  myPlayerId: string;
}

export const PlayerList: React.FC<PlayerListProps> = ({ players, myPlayerId }) => {
  const activePlayers = players.filter((p) => p.connected);
  const sorted = [...activePlayers].sort((a, b) => b.score - a.score);

  return (
    <div className={`panel ${styles.container}`}>
      <div className="panel-header">
        <div className={styles.headerTitle}>
          <Users size={16} color="var(--color-text-muted)" />
          <span>Scoreboard</span>
        </div>
        <span className={styles.playerCount}>
          {activePlayers.length} {activePlayers.length === 1 ? 'player' : 'players'}
        </span>
      </div>

      <div className={styles.list}>
        {sorted.map((p, idx) => {
          const isMe = p.id === myPlayerId;
          const initial = p.name.trim().charAt(0).toUpperCase() || 'P';

          return (
            <div
              key={p.id}
              className={`${styles.playerRow} ${isMe ? styles.playerRowMe : ''} ${!p.connected ? styles.playerRowDisconnected : ''}`}
            >
              {/* Left: Rank, Initial Avatar & Player Details */}
              <div className={styles.playerLeft}>
                <span className={`tabular-nums ${styles.rank} ${idx === 0 ? styles.rankLeader : ''}`}>
                  {idx + 1}
                </span>

                {/* Clean Initial Avatar */}
                <div className={`${styles.avatar} ${isMe ? styles.avatarMe : ''}`}>
                  {initial}
                </div>

                <div className={styles.playerDetails}>
                  <div className={styles.playerNameRow}>
                    <span>{p.name}</span>
                    {isMe && <span className={styles.youBadge}>(You)</span>}
                    {p.isHost && (
                      <span title="Host" className={styles.hostIcon}>
                        <Crown size={12} color="#d97706" />
                      </span>
                    )}
                  </div>

                  {/* Status indicators */}
                  <div className={styles.statusBadges}>
                    {p.isDrawing && (
                      <span className={`badge badge-warning ${styles.badgeSmall}`}>
                        <Pencil size={10} /> Drawing
                      </span>
                    )}
                    {p.hasGuessed && !p.isDrawing && (
                      <span className={`badge badge-success ${styles.badgeSmall}`}>
                        <Check size={10} /> Guessed
                      </span>
                    )}
                    {!p.connected && (
                      <span className={`badge badge-danger ${styles.badgeDisconnected}`}>
                        <WifiOff size={10} /> Disconnected
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Tabular Score */}
              <div className={`tabular-nums ${styles.scoreBadge}`}>
                {p.score}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
