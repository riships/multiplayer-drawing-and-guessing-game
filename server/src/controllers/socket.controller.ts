import { Server, Socket } from 'socket.io';
import {
  createRoom,
  joinRoom,
  getPlayerBySocket,
  updateSettings,
  removePlayerPermanently,
  handleDisconnect as handlePlayerDisconnect,
  getRoom,
} from '../services/room.service';
import {
  startGame,
  returnToLobby,
  selectWord,
  recordStroke,
  undoStroke,
  clearCanvas,
  handleGuess,
  handleDrawerDisconnect,
  getClientState,
  GameCallbacks,
} from '../services/game.service';
import {
  canSendChatMessage,
  canSendStroke,
  clearPlayerRateLimit,
} from '../utils/rate-limit.util';
import { StrokeAction, RoomSettings, ChatMessage, RoomData } from '../types/game.types';
import { logger } from '../utils/logger.util';

export function broadcastRoomState(io: Server, room: RoomData): void {
  for (const player of room.players.values()) {
    if (player.connected && player.socketId) {
      const state = getClientState(room, player.id);
      io.to(player.socketId).emit('room_state', state);
    }
  }
}

export function broadcastSystemMessage(io: Server, roomId: string, text: string): void {
  const msg: ChatMessage = {
    id: `sys_${Date.now()}_${Math.random()}`,
    senderName: 'SYSTEM',
    text,
    type: 'system',
    timestamp: Date.now(),
  };
  io.to(roomId).emit('chat_message', msg);
}

export function onRoundReveal(io: Server, room: RoomData, secretWord: string): void {
  io.to(room.id).emit('round_reveal', {
    word: secretWord,
    scores: Array.from(room.players.values()).map((p) => ({ id: p.id, name: p.name, score: p.score })),
  });
  broadcastRoomState(io, room);
}

export function onGameOver(io: Server, room: RoomData): void {
  broadcastRoomState(io, room);
  io.to(room.id).emit('game_over', {
    podium: Array.from(room.players.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 3),
    replays: room.replays,
  });
}

export function onHintUpdate(io: Server, room: RoomData, mask: string): void {
  for (const player of room.players.values()) {
    if (player.connected && player.id !== room.currentDrawerId) {
      io.to(player.socketId).emit('hint_update', { mask });
    }
  }
}

export function getCallbacks(io: Server): GameCallbacks {
  return {
    onStateUpdate: (r) => {
      broadcastRoomState(io, r);
      if (r.strokeHistory.length === 0 && (r.state === 'SELECTING_WORD' || r.state === 'DRAWING' || r.state === 'LOBBY')) {
        io.to(r.id).emit('clear_canvas');
        io.to(r.id).emit('canvas_history', []);
      }
    },
    onRoundReveal: (r, word) => onRoundReveal(io, r, word),
    onGameOver: (r) => onGameOver(io, r),
    onHintUpdate: (r, mask) => onHintUpdate(io, r, mask),
  };
}

export function onJoinRoom(
  io: Server,
  socket: Socket,
  payload: { roomId?: string; playerId: string; name: string; avatar: string },
): void {
  let room: RoomData;
  let isReconnected = false;
  let activePlayerId = payload.playerId;

  if (!payload.roomId || payload.roomId.trim() === '' || payload.roomId === 'NEW') {
    room = createRoom({
      id: payload.playerId,
      socketId: socket.id,
      name: payload.name || 'Host',
      avatar: payload.avatar || '#2563eb',
    });
  } else {
    const result = joinRoom(payload.roomId, {
      id: payload.playerId,
      socketId: socket.id,
      name: payload.name,
      avatar: payload.avatar,
    });

    if ('error' in result) {
      socket.emit('error_message', { message: result.error });
      return;
    }

    room = result.room;
    activePlayerId = result.player.id;
    isReconnected = result.isReconnected;
  }

  socket.join(room.id);
  socket.emit('session_info', { playerId: activePlayerId });

  // Send room snapshot and stroke history to new/reconnecting client
  const clientState = getClientState(room, activePlayerId);
  socket.emit('room_state', clientState);
  socket.emit('canvas_history', room.strokeHistory);

  // Broadcast updated room state to all players
  broadcastRoomState(io, room);

  const message = isReconnected
    ? `${payload.name} reconnected with score preserved!`
    : `${payload.name} joined the room.`;
  broadcastSystemMessage(io, room.id, message);
}

export function onUpdateSettings(
  io: Server,
  socket: Socket,
  payload: { roomId: string; settings: Partial<RoomSettings> },
): void {
  const info = getPlayerBySocket(socket.id);
  if (!info) return;

  const updated = updateSettings(payload.roomId, info.player.id, payload.settings);
  if (updated) {
    broadcastRoomState(io, info.room);
    broadcastSystemMessage(io, info.room.id, `Room settings updated by host.`);
  }
}

export function onLeaveRoom(io: Server, socket: Socket): void {
  const info = getPlayerBySocket(socket.id);
  if (!info) return;

  const { room, player } = info;
  socket.leave(room.id);
  removePlayerPermanently(room.id, player.id);
  clearPlayerRateLimit(player.id);
  broadcastRoomState(io, room);
  broadcastSystemMessage(io, room.id, `${player.name} left the room.`);
}

export function onStartGame(io: Server, socket: Socket, payload: { roomId: string }): void {
  const info = getPlayerBySocket(socket.id);
  if (!info) return;

  const result = startGame(payload.roomId, info.player.id, getCallbacks(io));
  if (!result.success) {
    socket.emit('error_message', { message: result.error });
  }
}

export function onReturnToLobby(io: Server, socket: Socket, payload: { roomId: string }): void {
  const info = getPlayerBySocket(socket.id);
  if (!info) return;

  const result = returnToLobby(payload.roomId, info.player.id, getCallbacks(io));
  if (result.success) {
    io.to(info.room.id).emit('clear_canvas');
    io.to(info.room.id).emit('canvas_history', []);
    broadcastSystemMessage(io, info.room.id, 'Host returned the room to the lobby.');
  }
}

export function onSelectWord(
  io: Server,
  socket: Socket,
  payload: { roomId: string; word: string },
): void {
  const info = getPlayerBySocket(socket.id);
  if (!info) return;

  const success = selectWord(info.room, info.player.id, payload.word, getCallbacks(io));
  if (success) {
    io.to(info.room.id).emit('clear_canvas');
    io.to(info.room.id).emit('canvas_history', []);
  }
}

export function onDrawStroke(io: Server, socket: Socket, stroke: StrokeAction): void {
  const info = getPlayerBySocket(socket.id);
  if (!info) return;

  const { room, player } = info;
  if (room.state !== 'DRAWING' || room.currentDrawerId !== player.id) {
    return;
  }

  const rateCheck = canSendStroke(player.id, stroke.points?.length || 1);
  if (!rateCheck.allowed) return;

  recordStroke(room, stroke);
  socket.to(room.id).emit('draw_stroke', stroke);
}

export function onDrawFill(io: Server, socket: Socket, fillAction: StrokeAction): void {
  const info = getPlayerBySocket(socket.id);
  if (!info) return;

  const { room, player } = info;
  if (room.state !== 'DRAWING' || room.currentDrawerId !== player.id) {
    return;
  }

  recordStroke(room, fillAction);
  socket.to(room.id).emit('draw_fill', fillAction);
}

export function onUndoStroke(io: Server, socket: Socket): void {
  const info = getPlayerBySocket(socket.id);
  if (!info) return;

  const success = undoStroke(info.room, info.player.id);
  if (success) {
    io.to(info.room.id).emit('canvas_history', info.room.strokeHistory);
  }
}

export function onClearCanvas(io: Server, socket: Socket): void {
  const info = getPlayerBySocket(socket.id);
  if (!info) return;

  const success = clearCanvas(info.room, info.player.id);
  if (success) {
    io.to(info.room.id).emit('clear_canvas');
    io.to(info.room.id).emit('canvas_history', []);
  }
}

export function onSendMessage(io: Server, socket: Socket, payload: { text: string }): void {
  const info = getPlayerBySocket(socket.id);
  if (!info) return;

  const { room, player } = info;

  const rateCheck = canSendChatMessage(player.id, payload.text);
  if (!rateCheck.allowed) {
    socket.emit('chat_rate_limited', { reason: rateCheck.reason });
    return;
  }

  const trimmedText = (payload.text || '').trim();

  const guessResult = handleGuess(room, player.id, trimmedText, getCallbacks(io));

  if (guessResult.status === 'correct') {
    socket.emit('guess_correct', { scoreAwarded: guessResult.scoreAwarded });
    const correctMsg: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random()}`,
      senderName: 'SYSTEM',
      text: `🎉 ${player.name} guessed the word! (+${guessResult.scoreAwarded} pts)`,
      type: 'correct',
      timestamp: Date.now(),
    };
    io.to(room.id).emit('chat_message', correctMsg);
    return;
  }

  if (guessResult.status === 'close') {
    const closeMsg: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random()}`,
      senderName: 'SYSTEM',
      text: `💡 "${trimmedText}" is close!`,
      type: 'close',
      timestamp: Date.now(),
    };
    socket.emit('chat_message', closeMsg);
    return;
  }

  if (guessResult.status === 'ignored') {
    const maskedMsg: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random()}`,
      senderId: player.id,
      senderName: player.name,
      text: trimmedText,
      type: 'normal',
      timestamp: Date.now(),
    };
    for (const p of room.players.values()) {
      if ((p.hasGuessed || p.isDrawing) && p.connected) {
        io.to(p.socketId).emit('chat_message', maskedMsg);
      }
    }
    return;
  }

  const chatMsg: ChatMessage = {
    id: `msg_${Date.now()}_${Math.random()}`,
    senderId: player.id,
    senderName: player.name,
    text: trimmedText,
    type: 'normal',
    timestamp: Date.now(),
  };
  io.to(room.id).emit('chat_message', chatMsg);
}

export function onSocketDisconnect(io: Server, socket: Socket): void {
  logger.info(`Client disconnected: ${socket.id}`);
  const disconnected = handlePlayerDisconnect(socket.id, (roomId, playerId) => {
    clearPlayerRateLimit(playerId);
    const room = getRoom(roomId);
    if (room) {
      broadcastRoomState(io, room);
      broadcastSystemMessage(io, roomId, `A player has left the game.`);
    }
  });

  if (disconnected) {
    const { room, player } = disconnected;
    broadcastRoomState(io, room);
    broadcastSystemMessage(io, room.id, `${player.name} disconnected (30s to rejoin).`);

    if (player.id === room.currentDrawerId) {
      handleDrawerDisconnect(room, player.id, getCallbacks(io));
    }
  }
}
