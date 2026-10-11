import { Server, Socket } from 'socket.io';
import {
  onJoinRoom,
  onUpdateSettings,
  onLeaveRoom,
  onStartGame,
  onReturnToLobby,
  onSelectWord,
  onDrawStroke,
  onDrawFill,
  onUndoStroke,
  onClearCanvas,
  onSendMessage,
  onSocketDisconnect,
} from '../controllers/socket.controller';
import { logger } from '../utils/logger.util';

export function registerSocketHandlers(io: Server, socket: Socket): void {
  socket.on('join_room', (payload) => onJoinRoom(io, socket, payload));
  socket.on('update_settings', (payload) => onUpdateSettings(io, socket, payload));
  socket.on('leave_room', () => onLeaveRoom(io, socket));
  socket.on('start_game', (payload) => onStartGame(io, socket, payload));
  socket.on('return_to_lobby', (payload) => onReturnToLobby(io, socket, payload));
  socket.on('select_word', (payload) => onSelectWord(io, socket, payload));
  socket.on('draw_stroke', (stroke) => onDrawStroke(io, socket, stroke));
  socket.on('draw_fill', (fillAction) => onDrawFill(io, socket, fillAction));
  socket.on('undo_stroke', () => onUndoStroke(io, socket));
  socket.on('clear_canvas', () => onClearCanvas(io, socket));
  socket.on('send_message', (payload) => onSendMessage(io, socket, payload));
  socket.on('disconnect', () => onSocketDisconnect(io, socket));
}

export function initSocketIO(io: Server): void {
  io.on('connection', (socket: Socket) => {
    logger.info(`Client connected: ${socket.id}`);
    registerSocketHandlers(io, socket);
  });
}
