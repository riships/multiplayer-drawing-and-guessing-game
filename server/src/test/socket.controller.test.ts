import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Server, Socket } from 'socket.io';
import {
  broadcastRoomState,
  broadcastSystemMessage,
  onRoundReveal,
  onGameOver,
  onHintUpdate,
  onJoinRoom,
  onUpdateSettings,
  onLeaveRoom,
  onStartGame,
  onSelectWord,
  onDrawStroke,
  onDrawFill,
  onUndoStroke,
  onClearCanvas,
  onSendMessage,
  onSocketDisconnect,
  getCallbacks,
} from '../controllers/socket.controller';
import { createRoom, clearAllRooms, getRoom } from '../services/room.service';
import { clearRoomTimers } from '../services/game.service';
import { StrokeAction } from '../types/game.types';
import { CONFIG } from '../config';

// Mock Socket.IO harness
function createMockHarness() {
  const emittedEvents: { target?: string; event: string; data?: unknown }[] = [];

  const mockIo = {
    to: (target: string) => ({
      emit: (event: string, data?: unknown) => {
        emittedEvents.push({ target, event, data });
      },
    }),
    emit: (event: string, data?: unknown) => {
      emittedEvents.push({ event, data });
    },
  } as unknown as Server;

  const createMockSocket = (id: string) => {
    const socketEmits: { event: string; data?: unknown }[] = [];
    const joinedRooms: string[] = [];
    const leftRooms: string[] = [];

    const socket = {
      id,
      join: (room: string) => {
        joinedRooms.push(room);
      },
      leave: (room: string) => {
        leftRooms.push(room);
      },
      emit: (event: string, data?: unknown) => {
        socketEmits.push({ event, data });
      },
      to: (target: string) => ({
        emit: (event: string, data?: unknown) => {
          emittedEvents.push({ target, event, data });
        },
      }),
    } as unknown as Socket;

    return { socket, socketEmits, joinedRooms, leftRooms };
  };

  return { mockIo, createMockSocket, emittedEvents };
}

describe('Socket Controller Event Handlers', () => {
  beforeEach(() => {
    clearAllRooms();
  });

  afterEach(() => {
    clearAllRooms();
  });

  it('broadcastRoomState, broadcastSystemMessage, onRoundReveal, onGameOver, onHintUpdate emit correct events', () => {
    const { mockIo, emittedEvents } = createMockHarness();
    const room = createRoom({ id: 'p1', socketId: 'sock1', name: 'Alice', avatar: '#123' }, 'BC01');
    room.players.set('p2', {
      id: 'p2',
      socketId: 'sock2',
      name: 'Bob',
      avatar: '#456',
      score: 100,
      isHost: false,
      hasGuessed: false,
      isDrawing: false,
      connected: true,
    });

    // broadcastRoomState
    broadcastRoomState(mockIo, room);
    const roomStateEmits = emittedEvents.filter((e) => e.event === 'room_state');
    assert.strictEqual(roomStateEmits.length, 2);

    // broadcastSystemMessage
    broadcastSystemMessage(mockIo, 'BC01', 'Test system notice');
    const sysMsg = emittedEvents.find((e) => e.event === 'chat_message' && (e.data as { text: string }).text === 'Test system notice');
    assert.ok(sysMsg);

    // onRoundReveal
    onRoundReveal(mockIo, room, 'diamond');
    const reveal = emittedEvents.find((e) => e.event === 'round_reveal');
    assert.ok(reveal);
    assert.strictEqual((reveal?.data as { word: string }).word, 'diamond');

    // onGameOver
    onGameOver(mockIo, room);
    const gameOver = emittedEvents.find((e) => e.event === 'game_over');
    assert.ok(gameOver);

    // onHintUpdate
    onHintUpdate(mockIo, room, '_ _ a _ _');
    const hint = emittedEvents.find((e) => e.event === 'hint_update');
    assert.ok(hint);

    // getCallbacks closures
    const callbacks = getCallbacks(mockIo);
    callbacks.onStateUpdate(room);
    callbacks.onRoundReveal(room, 'secret');
    callbacks.onGameOver(room);
    callbacks.onHintUpdate(room, '_ _ _');

    clearRoomTimers(room);
  });

  it('onJoinRoom creates room when roomId is empty and joins existing room', () => {
    const { mockIo, createMockSocket } = createMockHarness();

    // 1. Create room as host
    const hostSock = createMockSocket('host_sock');
    onJoinRoom(mockIo, hostSock.socket, {
      playerId: 'h_id',
      name: 'Host User',
      avatar: '#ff0',
    });

    assert.ok(hostSock.joinedRooms.length > 0);
    assert.ok(hostSock.socketEmits.some((e) => e.event === 'session_info'));
    assert.ok(hostSock.socketEmits.some((e) => e.event === 'room_state'));

    const createdRoomId = hostSock.joinedRooms[0];
    const room = getRoom(createdRoomId);
    assert.ok(room);

    // 2. Join room with valid code
    const guestSock = createMockSocket('guest_sock');
    onJoinRoom(mockIo, guestSock.socket, {
      roomId: createdRoomId,
      playerId: 'g_id',
      name: 'Guest User',
      avatar: '#0f0',
    });
    assert.strictEqual(guestSock.joinedRooms[0], createdRoomId);
    assert.ok(guestSock.socketEmits.some((e) => e.event === 'room_state'));

    // 3. Join with invalid code emits error_message
    const badSock = createMockSocket('bad_sock');
    onJoinRoom(mockIo, badSock.socket, {
      roomId: 'INVALID_CODE',
      playerId: 'bad_id',
      name: 'Bad',
      avatar: '#000',
    });
    assert.ok(badSock.socketEmits.some((e) => e.event === 'error_message'));

    clearRoomTimers(room!);
  });

  it('onUpdateSettings broadcasts state when host updates settings', () => {
    const { mockIo, createMockSocket, emittedEvents } = createMockHarness();
    const hostSock = createMockSocket('s_host');

    onJoinRoom(mockIo, hostSock.socket, { playerId: 'h1', name: 'Host', avatar: '#111' });
    const roomId = hostSock.joinedRooms[0];

    onUpdateSettings(mockIo, hostSock.socket, {
      roomId,
      settings: { rounds: 5, drawTime: 40 },
    });

    const room = getRoom(roomId);
    assert.strictEqual(room?.settings.rounds, 5);
    assert.ok(emittedEvents.some((e) => e.event === 'chat_message' && (e.data as { text: string }).text.includes('settings updated')));

    clearRoomTimers(room!);
  });

  it('onLeaveRoom removes player and notifies room', () => {
    const { mockIo, createMockSocket, emittedEvents } = createMockHarness();
    const hostSock = createMockSocket('s_host');
    const guestSock = createMockSocket('s_guest');

    onJoinRoom(mockIo, hostSock.socket, { playerId: 'h1', name: 'Host', avatar: '#111' });
    const roomId = hostSock.joinedRooms[0];
    onJoinRoom(mockIo, guestSock.socket, { roomId, playerId: 'g1', name: 'Guest', avatar: '#222' });

    onLeaveRoom(mockIo, guestSock.socket);
    assert.strictEqual(guestSock.leftRooms[0], roomId);
    assert.ok(emittedEvents.some((e) => e.event === 'chat_message' && (e.data as { text: string }).text.includes('left the room')));

    const room = getRoom(roomId);
    assert.strictEqual(room?.players.has('g1'), false);

    clearRoomTimers(room!);
  });

  it('onStartGame, onSelectWord, and game flow through socket controller', () => {
    const { mockIo, createMockSocket } = createMockHarness();
    const hostSock = createMockSocket('s_host');
    const guestSock = createMockSocket('s_guest');

    onJoinRoom(mockIo, hostSock.socket, { playerId: 'h1', name: 'Host', avatar: '#111' });
    const roomId = hostSock.joinedRooms[0];
    onJoinRoom(mockIo, guestSock.socket, { roomId, playerId: 'g1', name: 'Guest', avatar: '#222' });

    const room = getRoom(roomId)!;

    // Start game
    onStartGame(mockIo, hostSock.socket, { roomId });
    assert.strictEqual(room.state, 'SELECTING_WORD');

    // Select word
    onSelectWord(mockIo, hostSock.socket, { roomId, word: 'dolphin' });
    assert.strictEqual(room.state, 'DRAWING');
    assert.strictEqual(room.secretWord, 'dolphin');

    clearRoomTimers(room);
  });

  it('onDrawStroke, onDrawFill, onUndoStroke, onClearCanvas handle drawing interactions', () => {
    const { mockIo, createMockSocket, emittedEvents } = createMockHarness();
    const hostSock = createMockSocket('s_host');
    const guestSock = createMockSocket('s_guest');

    onJoinRoom(mockIo, hostSock.socket, { playerId: 'h1', name: 'Host', avatar: '#111' });
    const roomId = hostSock.joinedRooms[0];
    onJoinRoom(mockIo, guestSock.socket, { roomId, playerId: 'g1', name: 'Guest', avatar: '#222' });

    const room = getRoom(roomId)!;
    onStartGame(mockIo, hostSock.socket, { roomId });
    onSelectWord(mockIo, hostSock.socket, { roomId, word: 'guitar' });

    const stroke: StrokeAction = {
      id: 'st_1',
      type: 'stroke',
      points: [{ x: 0.1, y: 0.2 }],
      timestamp: Date.now(),
    };

    // Host (drawer) draws stroke
    onDrawStroke(mockIo, hostSock.socket, stroke);
    assert.strictEqual(room.strokeHistory.length, 1);
    assert.ok(emittedEvents.some((e) => e.event === 'draw_stroke'));

    // Drawer sends fill action
    const fill: StrokeAction = {
      id: 'fill_1',
      type: 'fill',
      point: { x: 0.5, y: 0.5 },
      color: '#ff0000',
      timestamp: Date.now(),
    };
    onDrawFill(mockIo, hostSock.socket, fill);
    assert.strictEqual(room.strokeHistory.length, 2);
    assert.ok(emittedEvents.some((e) => e.event === 'draw_fill'));

    // Drawer undos stroke
    onUndoStroke(mockIo, hostSock.socket);
    assert.strictEqual(room.strokeHistory.length, 1);

    // Drawer clears canvas
    onClearCanvas(mockIo, hostSock.socket);
    assert.strictEqual(room.strokeHistory.length, 0);

    clearRoomTimers(room);
  });

  it('onSendMessage handles chat rate limits, correct guesses, close guesses, and normal chat', () => {
    const { mockIo, createMockSocket, emittedEvents } = createMockHarness();
    const hostSock = createMockSocket('s_host');
    const guestSock = createMockSocket('s_guest');

    onJoinRoom(mockIo, hostSock.socket, { playerId: 'h1', name: 'Host', avatar: '#111' });
    const roomId = hostSock.joinedRooms[0];
    onJoinRoom(mockIo, guestSock.socket, { roomId, playerId: 'g1', name: 'Guest', avatar: '#222' });

    const room = getRoom(roomId)!;
    onStartGame(mockIo, hostSock.socket, { roomId });
    onSelectWord(mockIo, hostSock.socket, { roomId, word: 'telescope' });

    // 1. Normal chat from guesser
    onSendMessage(mockIo, guestSock.socket, { text: 'hello world' });
    assert.ok(emittedEvents.some((e) => e.event === 'chat_message' && (e.data as { text: string }).text === 'hello world'));

    // 2. Close guess ("telescopx")
    onSendMessage(mockIo, guestSock.socket, { text: 'telescopx' });
    assert.ok(guestSock.socketEmits.some((e) => e.event === 'chat_message' && (e.data as { type: string }).type === 'close'));

    // 3. Correct guess ("telescope")
    onSendMessage(mockIo, guestSock.socket, { text: 'telescope' });
    assert.ok(guestSock.socketEmits.some((e) => e.event === 'guess_correct'));
    assert.strictEqual(room.players.get('g1')?.hasGuessed, true);

    // 4. Rate limited empty message
    onSendMessage(mockIo, guestSock.socket, { text: '   ' });
    assert.ok(guestSock.socketEmits.some((e) => e.event === 'chat_rate_limited'));

    clearRoomTimers(room);
  });

  it('onSocketDisconnect handles active player disconnect and initiates drawer recovery', () => {
    const { mockIo, createMockSocket, emittedEvents } = createMockHarness();
    const hostSock = createMockSocket('s_host');
    const guestSock = createMockSocket('s_guest');

    onJoinRoom(mockIo, hostSock.socket, { playerId: 'h1', name: 'Host', avatar: '#111' });
    const roomId = hostSock.joinedRooms[0];
    onJoinRoom(mockIo, guestSock.socket, { roomId, playerId: 'g1', name: 'Guest', avatar: '#222' });

    const room = getRoom(roomId)!;
    onStartGame(mockIo, hostSock.socket, { roomId });
    onSelectWord(mockIo, hostSock.socket, { roomId, word: 'ladder' });

    // Host (drawer) disconnects
    onSocketDisconnect(mockIo, hostSock.socket);
    assert.strictEqual(room.players.get('h1')?.connected, false);
    assert.ok(emittedEvents.some((e) => e.event === 'chat_message' && (e.data as { text: string }).text.includes('disconnected')));
    assert.ok(room.graceTimer !== null);

    clearRoomTimers(room);
  });

  it('handlers gracefully ignore unknown sockets or invalid game states', () => {
    const { mockIo, createMockSocket } = createMockHarness();
    const unknownSock = createMockSocket('unknown_socket');

    assert.doesNotThrow(() => {
      onUpdateSettings(mockIo, unknownSock.socket, { roomId: 'ABC', settings: {} });
      onLeaveRoom(mockIo, unknownSock.socket);
      onStartGame(mockIo, unknownSock.socket, { roomId: 'ABC' });
      onSelectWord(mockIo, unknownSock.socket, { roomId: 'ABC', word: 'test' });
      onDrawStroke(mockIo, unknownSock.socket, { id: '1', type: 'stroke', timestamp: Date.now() });
      onDrawFill(mockIo, unknownSock.socket, { id: '2', type: 'fill', timestamp: Date.now() });
      onUndoStroke(mockIo, unknownSock.socket);
      onClearCanvas(mockIo, unknownSock.socket);
      onSendMessage(mockIo, unknownSock.socket, { text: 'test' });
    });
  });

  it('onStartGame emits error_message when game cannot start', () => {
    const { mockIo, createMockSocket } = createMockHarness();
    const soloSock = createMockSocket('solo_sock');

    onJoinRoom(mockIo, soloSock.socket, { playerId: 'solo', name: 'Solo', avatar: '#000' });
    const roomId = soloSock.joinedRooms[0];

    onStartGame(mockIo, soloSock.socket, { roomId });
    assert.ok(soloSock.socketEmits.some((e) => e.event === 'error_message'));

    const room = getRoom(roomId);
    if (room) clearRoomTimers(room);
  });

  it('onSendMessage broadcasts masked chat to guessed players when guess is ignored', () => {
    const { mockIo, createMockSocket, emittedEvents } = createMockHarness();
    const hostSock = createMockSocket('s_host');
    const guestSock = createMockSocket('s_guest');

    onJoinRoom(mockIo, hostSock.socket, { playerId: 'h1', name: 'Host', avatar: '#111' });
    const roomId = hostSock.joinedRooms[0];
    onJoinRoom(mockIo, guestSock.socket, { roomId, playerId: 'g1', name: 'Guest', avatar: '#222' });

    const room = getRoom(roomId)!;
    onStartGame(mockIo, hostSock.socket, { roomId });
    onSelectWord(mockIo, hostSock.socket, { roomId, word: 'telescope' });

    // Drawer sends a message (ignored guess, broadcast only to drawer/guessed)
    onSendMessage(mockIo, hostSock.socket, { text: 'drawer chatting' });
    assert.ok(emittedEvents.some((e) => e.event === 'chat_message' && (e.data as { text: string }).text === 'drawer chatting'));

    clearRoomTimers(room);
  });

  it('onSocketDisconnect invokes grace expiry callback when player reconnect expires', (t, done) => {
    const { mockIo, createMockSocket, emittedEvents } = createMockHarness();
    const hostSock = createMockSocket('s_host');
    const guestSock = createMockSocket('s_guest');

    onJoinRoom(mockIo, hostSock.socket, { playerId: 'h1', name: 'Host', avatar: '#111' });
    const roomId = hostSock.joinedRooms[0];
    onJoinRoom(mockIo, guestSock.socket, { roomId, playerId: 'g1', name: 'Guest', avatar: '#222' });

    const room = getRoom(roomId)!;
    onStartGame(mockIo, hostSock.socket, { roomId });
    onSelectWord(mockIo, hostSock.socket, { roomId, word: 'ladder' });

    const origGrace = CONFIG.TIMERS.PLAYER_RECONNECT_GRACE_MS;
    CONFIG.TIMERS.PLAYER_RECONNECT_GRACE_MS = 50;

    onSocketDisconnect(mockIo, guestSock.socket);

    setTimeout(() => {
      CONFIG.TIMERS.PLAYER_RECONNECT_GRACE_MS = origGrace;
      assert.ok(emittedEvents.some((e) => e.event === 'chat_message' && (e.data as { text: string }).text.includes('left the game')));
      clearRoomTimers(room);
      done();
    }, 100);
  });
});
