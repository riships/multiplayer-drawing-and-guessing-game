import React, { useState, useEffect, useRef } from 'react';
import { ClientRoomState, RoomSettings } from '../../types';
import {
  Users,
  Settings,
  Play,
  Copy,
  Check,
  Crown,
  ExternalLink,
  PenTool,
  LogOut,
} from 'lucide-react';
import styles from './Lobby.module.css';

interface LobbyProps {
  roomState: ClientRoomState | null;
  myPlayerId: string;
  onJoinRoom: (roomId: string | undefined, name: string, avatar: string) => void;
  onLeaveRoom?: () => void;
  onUpdateSettings: (roomId: string, settings: Partial<RoomSettings>) => void;
  onStartGame: (roomId: string) => void;
}

const AVATAR_COLORS = [
  '#2563eb', '#7c3aed', '#db2777', '#ea580c',
  '#16a34a', '#0891b2', '#4f46e5', '#ca8a04',
];

export const Lobby: React.FC<LobbyProps> = ({
  roomState,
  myPlayerId,
  onJoinRoom,
  onLeaveRoom,
  onUpdateSettings,
  onStartGame,
}) => {
  const [name, setName] = useState('');
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);
  const [joinRoomCode, setJoinRoomCode] = useState('');
  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create');
  const [copied, setCopied] = useState(false);
  const lastActionTimeRef = useRef<number>(0);

  // Settings
  const [rounds, setRounds] = useState(3);
  const [drawTime, setDrawTime] = useState(60);
  const [wordPack, setWordPack] = useState<'standard' | 'animals' | 'food' | 'technology' | 'custom'>('standard');

  // Check URL query parameters for invite link: ?room=XYZ
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    const isTestWindow = params.get('test') === '1' || params.get('new') === '1';

    if (roomParam) {
      setJoinRoomCode(roomParam.toUpperCase());
      setActiveTab('join');
    }

    if (isTestWindow) {
      // In test window, assign a distinct name and avatar color
      setName('Player 2');
      setAvatarColor(AVATAR_COLORS[1]);
    } else {
      const savedName = localStorage.getItem('pictionary_player_name');
      if (savedName) setName(savedName);

      const savedColor = localStorage.getItem('pictionary_avatar_color');
      if (savedColor) setAvatarColor(savedColor);
    }
  }, []);

  // Sync settings when host enters existing room
  useEffect(() => {
    if (roomState?.settings) {
      setRounds(roomState.settings.rounds);
      setDrawTime(roomState.settings.drawTime);
      setWordPack(roomState.settings.wordPack);
    }
  }, [roomState?.settings]);

  const handleNameChange = (val: string) => {
    setName(val);
    localStorage.setItem('pictionary_player_name', val);
  };

  const handleColorChange = (col: string) => {
    setAvatarColor(col);
    localStorage.setItem('pictionary_avatar_color', col);
  };

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const now = Date.now();
    if (now - lastActionTimeRef.current < 400) return;
    lastActionTimeRef.current = now;

    localStorage.setItem('pictionary_player_name', name.trim());
    localStorage.setItem('pictionary_avatar_color', avatarColor);
    onJoinRoom(undefined, name.trim(), avatarColor);
  };

  const handleJoinExistingRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !joinRoomCode.trim()) return;
    const now = Date.now();
    if (now - lastActionTimeRef.current < 400) return;
    lastActionTimeRef.current = now;

    localStorage.setItem('pictionary_player_name', name.trim());
    localStorage.setItem('pictionary_avatar_color', avatarColor);
    onJoinRoom(joinRoomCode.trim().toUpperCase(), name.trim(), avatarColor);
  };

  const handleSaveSettings = () => {
    if (roomState) {
      onUpdateSettings(roomState.roomId, { rounds, drawTime, wordPack });
    }
  };

  const handleStartGame = (roomId: string) => {
    const now = Date.now();
    if (now - lastActionTimeRef.current < 600) return;
    lastActionTimeRef.current = now;
    onStartGame(roomId);
  };

  const handleCopyLink = () => {
    if (!roomState) return;
    const url = `${window.location.origin}/?room=${roomState.roomId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenSecondWindow = () => {
    if (!roomState) return;
    const url = `${window.location.origin}/?room=${roomState.roomId}&test=1`;
    window.open(url, '_blank', 'width=1100,height=800');
  };

  const initial = name.trim().charAt(0).toUpperCase() || 'P';
  const isHost = roomState?.players.find((p) => p.id === myPlayerId)?.isHost ?? false;

  // View A: Player Not in a Room yet -> Create or Join UI
  if (!roomState) {
    return (
      <div className={styles.entryContainer}>
        <div className={`panel ${styles.entryPanel}`}>
          {/* Header */}
          <div className={styles.entryHeader}>
            <PenTool size={20} color="var(--color-primary)" />
            <h1 className={styles.entryTitle}>Pictionary Live</h1>
          </div>
          <p className={styles.entrySubtitle}>
            Real-time multiplayer drawing and guessing
          </p>

          {/* Player Identity Setup */}
          <div className={styles.identitySection}>
            <label htmlFor="player-nickname" className={styles.sectionLabel}>
              Your Nickname
            </label>
            <div className={styles.nicknameRow}>
              <div className={styles.avatarCircle} style={{ background: avatarColor }}>
                {initial}
              </div>
              <input
                id="player-nickname"
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Enter your name"
                className={`form-input ${styles.nicknameInput}`}
              />
            </div>

            <label className={styles.sectionLabel}>Avatar Color</label>
            <div className={styles.colorPalette}>
              {AVATAR_COLORS.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => handleColorChange(col)}
                  aria-label={`Select avatar color ${col}`}
                  className={`${styles.colorBtn} ${avatarColor === col ? styles.colorBtnSelected : ''}`}
                  style={{
                    background: col,
                    border: avatarColor === col ? '2px solid #ffffff' : '1px solid var(--color-border)',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Tabs: Create vs Join */}
          <div className={styles.tabList}>
            <button
              type="button"
              onClick={() => setActiveTab('create')}
              className={`${styles.tabBtn} ${activeTab === 'create' ? styles.tabBtnActive : ''}`}
            >
              Create Room
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('join')}
              className={`${styles.tabBtn} ${activeTab === 'join' ? styles.tabBtnActive : ''}`}
            >
              Join Room
            </button>
          </div>

          {/* Tab 1: Create Room */}
          {activeTab === 'create' && (
            <form onSubmit={handleCreateRoom} className={styles.formContent}>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                Click below to create a new room. You can customize rounds and draw time in the lobby!
              </p>

              <button
                type="submit"
                disabled={!name.trim()}
                className={`btn btn-primary ${styles.primaryActionBtn}`}
              >
                Create Room & Enter Lobby
              </button>
            </form>
          )}

          {/* Tab 2: Join Existing Room */}
          {activeTab === 'join' && (
            <form onSubmit={handleJoinExistingRoom} className={styles.formContent}>
              <div>
                <label htmlFor="room-code-input" className={styles.fieldLabel}>
                  Room Code (6 characters):
                </label>
                <input
                  id="room-code-input"
                  type="text"
                  maxLength={6}
                  value={joinRoomCode}
                  onChange={(e) => setJoinRoomCode(e.target.value.toUpperCase())}
                  placeholder="e.g. A9B2X1"
                  className={`form-input ${styles.roomCodeInput}`}
                />
              </div>

              <button
                type="submit"
                disabled={!name.trim() || joinRoomCode.trim().length < 4}
                className={`btn btn-primary ${styles.primaryActionBtn}`}
              >
                Join Game Room
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // View B: Waiting Room / Lobby State
  const activePlayers = (roomState?.players || []).filter((p) => p.connected);

  return (
    <div className={styles.lobbyContainer}>
      <div className={`panel ${styles.lobbyPanel}`}>
        {/* Room Header */}
        <div className={styles.roomHeader}>
          <div>
            <div className={styles.roomLabel}>Room Lobby</div>
            <h2 className={styles.roomCodeTitle}>
              Room Code: {roomState.roomId}
            </h2>
          </div>

          <div className={styles.headerActions}>
            <button
              type="button"
              onClick={handleCopyLink}
              className="btn btn-secondary"
              aria-label="Copy room invite link"
            >
              {copied ? <Check size={15} color="var(--color-success)" /> : <Copy size={15} />}
              <span>{copied ? 'Link Copied' : 'Copy Room Link'}</span>
            </button>

            <button
              type="button"
              onClick={handleOpenSecondWindow}
              className="btn btn-secondary"
              title="Open test player in new window"
              aria-label="Test in second window"
            >
              <ExternalLink size={15} />
              <span>Test in 2nd Window</span>
            </button>

            {onLeaveRoom && (
              <button
                type="button"
                onClick={onLeaveRoom}
                className="btn btn-secondary"
                aria-label="Leave room"
                title="Leave this room"
              >
                <LogOut size={15} />
                <span>Leave</span>
              </button>
            )}
          </div>
        </div>

        {/* 2-Column Lobby Content */}
        <div className={`${styles.gridContent} ${isHost ? styles.gridTwoCols : styles.gridSingleCol}`}>
          {/* Players in Lobby */}
          <div className={styles.cardSection}>
            <div className={styles.cardHeaderTitle}>
              <Users size={16} color="var(--color-text-muted)" />
              <span>Players ({activePlayers.length})</span>
            </div>

            <div className={styles.playerListCol}>
              {activePlayers.map((p) => {
                const pInitial = p.name.trim().charAt(0).toUpperCase() || 'P';
                return (
                  <div
                    key={p.id}
                    className={`${styles.lobbyPlayerItem} ${p.id === myPlayerId ? styles.lobbyPlayerItemMe : ''}`}
                  >
                    <div className={styles.playerItemLeft}>
                      <div
                        className={styles.playerItemAvatar}
                        style={{ background: p.avatar && p.avatar.startsWith('#') ? p.avatar : 'var(--color-primary)' }}
                      >
                        {pInitial}
                      </div>
                      <span className={styles.playerItemName}>{p.name}</span>
                      {p.id === myPlayerId && (
                        <span className={styles.playerItemYou}>(You)</span>
                      )}
                    </div>
                    {p.isHost && (
                      <span className={`badge badge-warning ${styles.hostBadge}`}>
                        <Crown size={11} /> Host
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Host Configuration Panel */}
          {isHost ? (
            <div className={styles.cardSection}>
              <div className={styles.cardHeaderTitle}>
                <Settings size={16} color="var(--color-text-muted)" />
                <span>Host Game Settings</span>
              </div>

              <div className={styles.formContent}>
                <div>
                  <div className={styles.fieldLabelRow}>
                    <span>Number of rounds:</span>
                    <strong className={styles.fieldLabelValue}>{rounds}</strong>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={8}
                    value={rounds}
                    onChange={(e) => setRounds(Number(e.target.value))}
                    aria-label="Number of rounds"
                    className={styles.sliderInput}
                  />
                </div>

                <div>
                  <label htmlFor="draw-time-select" className={styles.fieldLabel}>
                    Draw time per turn:
                  </label>
                  <select
                    id="draw-time-select"
                    value={drawTime}
                    onChange={(e) => setDrawTime(Number(e.target.value))}
                    className={`form-input ${styles.fullWidthSelect}`}
                  >
                    <option value={30}>30 seconds (Fast)</option>
                    <option value={45}>45 seconds</option>
                    <option value={60}>60 seconds (Standard)</option>
                    <option value={80}>80 seconds</option>
                    <option value={100}>100 seconds (Relaxed)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="word-pack-select" className={styles.fieldLabel}>
                    Word list:
                  </label>
                  <select
                    id="word-pack-select"
                    value={wordPack}
                    onChange={(e) => setWordPack(e.target.value as any)}
                    className={`form-input ${styles.fullWidthSelect}`}
                  >
                    <option value="standard">Standard pack</option>
                    <option value="animals">Animals pack</option>
                    <option value="food">Food pack</option>
                    <option value="technology">Technology pack</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className={`btn btn-secondary ${styles.saveSettingsBtn}`}
                >
                  Save Settings
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.waitingCard}>
              <div className={styles.waitingIcon}>
                <Users size={32} />
              </div>
              <h3 className={styles.waitingTitle}>
                Waiting for host to start
              </h3>
              <p className={styles.waitingSubtitle}>
                Game settings: {roomState.settings.rounds} rounds, {roomState.settings.drawTime}s per turn.
              </p>
            </div>
          )}
        </div>

        {/* Start Game Action */}
        {isHost && (
          <div className={styles.startGameSection}>
            <button
              type="button"
              onClick={() => handleStartGame(roomState.roomId)}
              disabled={activePlayers.length < 2}
              className={`btn btn-primary ${styles.startGameBtn}`}
            >
              <Play size={16} />
              <span>
                {activePlayers.length < 2
                  ? 'Waiting for at least 2 players to start...'
                  : 'Start Game'}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
