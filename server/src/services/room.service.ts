import { CONFIG } from '../config';
import { Player, RoomSettings, RoomData } from '../types/game.types';
import { logger } from '../utils/logger.util';

// Module-level in-memory stores
const rooms = new Map<string, RoomData>();
const socketToPlayerMap = new Map<string, { roomId: string; playerId: string }>();
const disconnectTimeouts = new Map<string, NodeJS.Timeout>();

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms.has(code));
  return code;
}

export function createRoom(
  hostPlayer: { id: string; socketId: string; name: string; avatar: string },
  customCode?: string,
): RoomData {
  const roomId = customCode ? customCode.toUpperCase() : generateRoomCode();
  const settings: RoomSettings = {
    rounds: CONFIG.DEFAULT_SETTINGS.ROUNDS,
    drawTime: CONFIG.DEFAULT_SETTINGS.DRAW_TIME,
    wordPack: CONFIG.DEFAULT_SETTINGS.WORD_PACK,
    customWords: [],
  };

  const host: Player = {
    id: hostPlayer.id,
    socketId: hostPlayer.socketId,
    name: hostPlayer.name,
    avatar: hostPlayer.avatar || '#2563eb',
    score: 0,
    isHost: true,
    hasGuessed: false,
    isDrawing: false,
    connected: true,
  };

  const room: RoomData = {
    id: roomId,
    settings,
    state: 'LOBBY',
    players: new Map([[host.id, host]]),
    currentRound: 1,
    totalRounds: settings.rounds,
    currentDrawerIndex: 0,
    currentDrawerId: null,
    drawerTurnOrder: [host.id],
    secretWord: null,
    wordOptions: [],
    revealedIndices: new Set<number>(),
    turnTimeLeft: settings.drawTime,
    roundTimer: null,
    graceTimer: null,
    intermissionTimer: null,
    strokeHistory: [],
    replays: [],
    turnStartTime: 0,
  };

  rooms.set(roomId, room);
  socketToPlayerMap.set(hostPlayer.socketId, { roomId, playerId: host.id });
  logger.info(`Room created: ${roomId} by ${host.name} (${host.id})`);
  return room;
}

export function getRoom(roomId: string): RoomData | undefined {
  return rooms.get(roomId.toUpperCase());
}

export function getPlayerBySocket(socketId: string): { room: RoomData; player: Player } | undefined {
  const mapping = socketToPlayerMap.get(socketId);
  if (!mapping) return undefined;
  const room = rooms.get(mapping.roomId);
  if (!room) return undefined;
  const player = room.players.get(mapping.playerId);
  if (!player) return undefined;
  return { room, player };
}

export function joinRoom(
  roomId: string,
  playerInfo: { id: string; socketId: string; name: string; avatar: string },
): { room: RoomData; player: Player; isReconnected: boolean } | { error: string } {
  const code = roomId.toUpperCase();
  const room = rooms.get(code);
  if (!room) {
    return { error: 'Room not found. Check the code and try again.' };
  }

  // 1. Check if player is reconnecting with persistent ID
  let targetPlayer = room.players.get(playerInfo.id);

  // 2. Fallback: check disconnected player with matching name
  if (!targetPlayer) {
    targetPlayer = Array.from(room.players.values()).find(
      (p) => !p.connected && p.name.trim().toLowerCase() === playerInfo.name.trim().toLowerCase(),
    );
  }

  if (targetPlayer) {
    // If player is actively connected on another socket, treat as fresh guest
    if (targetPlayer.connected && targetPlayer.socketId && targetPlayer.socketId !== playerInfo.socketId) {
      const freshId = 'p_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      const newGuestPlayer: Player = {
        id: freshId,
        socketId: playerInfo.socketId,
        name: playerInfo.name || `Player ${room.players.size + 1}`,
        avatar: playerInfo.avatar || '#2563eb',
        score: 0,
        isHost: false,
        hasGuessed: false,
        isDrawing: false,
        connected: true,
      };
      room.players.set(newGuestPlayer.id, newGuestPlayer);
      if (!room.drawerTurnOrder.includes(newGuestPlayer.id)) {
        room.drawerTurnOrder.push(newGuestPlayer.id);
      }
      socketToPlayerMap.set(playerInfo.socketId, { roomId: code, playerId: newGuestPlayer.id });
      logger.info(`Player ${newGuestPlayer.name} joined room ${code} as new guest (distinct window).`);
      return { room, player: newGuestPlayer, isReconnected: false };
    }

    // Reconnection within grace window
    const timeoutKey = `${code}:${targetPlayer.id}`;
    const timeout = disconnectTimeouts.get(timeoutKey);
    if (timeout) {
      clearTimeout(timeout);
      disconnectTimeouts.delete(timeoutKey);
    }

    if (targetPlayer.socketId && targetPlayer.socketId !== playerInfo.socketId) {
      socketToPlayerMap.delete(targetPlayer.socketId);
    }

    targetPlayer.socketId = playerInfo.socketId;
    targetPlayer.connected = true;
    targetPlayer.disconnectedAt = undefined;
    if (playerInfo.name) targetPlayer.name = playerInfo.name;
    if (playerInfo.avatar) targetPlayer.avatar = playerInfo.avatar;

    socketToPlayerMap.set(playerInfo.socketId, { roomId: code, playerId: targetPlayer.id });
    logger.info(`Player ${targetPlayer.name} reconnected to room ${code} (score preserved: ${targetPlayer.score})`);
    return { room, player: targetPlayer, isReconnected: true };
  }

  // Fresh player join
  const isFirstPlayer = room.players.size === 0;
  const newPlayer: Player = {
    id: playerInfo.id,
    socketId: playerInfo.socketId,
    name: playerInfo.name || `Player ${room.players.size + 1}`,
    avatar: playerInfo.avatar || '#2563eb',
    score: 0,
    isHost: isFirstPlayer,
    hasGuessed: false,
    isDrawing: false,
    connected: true,
  };

  room.players.set(newPlayer.id, newPlayer);
  if (!room.drawerTurnOrder.includes(newPlayer.id)) {
    room.drawerTurnOrder.push(newPlayer.id);
  }
  socketToPlayerMap.set(playerInfo.socketId, { roomId: code, playerId: newPlayer.id });
  logger.info(`Player ${newPlayer.name} joined room ${code}`);
  return { room, player: newPlayer, isReconnected: false };
}

export function handleDisconnect(
  socketId: string,
  onGraceExpired: (roomId: string, playerId: string) => void,
): { room: RoomData; player: Player } | undefined {
  const mapping = socketToPlayerMap.get(socketId);
  if (!mapping) return undefined;

  const { roomId, playerId } = mapping;
  socketToPlayerMap.delete(socketId);
  const room = rooms.get(roomId);
  if (!room) return undefined;

  const player = room.players.get(playerId);
  if (!player) return undefined;

  player.connected = false;
  player.disconnectedAt = Date.now();
  logger.info(`Player ${player.name} (${playerId}) dropped connection in ${roomId}.`);

  // In LOBBY state, remove immediately to prevent ghost players
  if (room.state === 'LOBBY') {
    removePlayerPermanently(roomId, playerId);
    return { room, player };
  }

  // Grace period for ongoing match
  const timeoutKey = `${roomId}:${playerId}`;
  const timeout = setTimeout(() => {
    disconnectTimeouts.delete(timeoutKey);
    removePlayerPermanently(roomId, playerId);
    onGraceExpired(roomId, playerId);
  }, CONFIG.TIMERS.PLAYER_RECONNECT_GRACE_MS);

  disconnectTimeouts.set(timeoutKey, timeout);
  return { room, player };
}

export function removePlayerPermanently(roomId: string, playerId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;

  const timeoutKey = `${roomId}:${playerId}`;
  const timeout = disconnectTimeouts.get(timeoutKey);
  if (timeout) {
    clearTimeout(timeout);
    disconnectTimeouts.delete(timeoutKey);
  }

  const player = room.players.get(playerId);
  if (!player) return;

  room.players.delete(playerId);
  room.drawerTurnOrder = room.drawerTurnOrder.filter((id) => id !== playerId);
  logger.info(`Grace period expired / player removed: ${player.name} from room ${roomId}`);

  // Re-elect host if departed player was host
  if (player.isHost) {
    const nextPlayer = Array.from(room.players.values()).find((p) => p.connected);
    if (nextPlayer) {
      nextPlayer.isHost = true;
      logger.info(`Promoted ${nextPlayer.name} to host in room ${roomId}`);
    }
  }

  // Clean empty room
  const connectedCount = Array.from(room.players.values()).filter((p) => p.connected).length;
  if (connectedCount === 0) {
    destroyRoom(roomId);
  }
}

export function updateSettings(
  roomId: string,
  hostPlayerId: string,
  newSettings: Partial<RoomSettings>,
): boolean {
  const room = rooms.get(roomId.toUpperCase());
  if (!room) return false;
  const player = room.players.get(hostPlayerId);
  if (!player || !player.isHost) return false;

  if (room.state !== 'LOBBY') return false;

  room.settings = { ...room.settings, ...newSettings };
  room.totalRounds = room.settings.rounds;
  return true;
}

export function destroyRoom(roomId: string): void {
  const room = rooms.get(roomId);
  if (room) {
    if (room.roundTimer) clearInterval(room.roundTimer);
    if (room.graceTimer) clearTimeout(room.graceTimer);
    if (room.intermissionTimer) clearTimeout(room.intermissionTimer);
    for (const [key, timeout] of disconnectTimeouts.entries()) {
      if (key.startsWith(`${roomId}:`)) {
        clearTimeout(timeout);
        disconnectTimeouts.delete(key);
      }
    }
    rooms.delete(roomId);
    logger.info(`Room ${roomId} destroyed.`);
  }
}

export function clearAllRooms(): void {
  for (const room of rooms.values()) {
    if (room.roundTimer) clearInterval(room.roundTimer);
    if (room.graceTimer) clearTimeout(room.graceTimer);
    if (room.intermissionTimer) clearTimeout(room.intermissionTimer);
  }
  for (const timeout of disconnectTimeouts.values()) {
    clearTimeout(timeout);
  }
  rooms.clear();
  socketToPlayerMap.clear();
  disconnectTimeouts.clear();
}
