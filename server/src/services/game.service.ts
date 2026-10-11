import { CONFIG } from '../config';
import { StrokeAction, DrawingReplay, ClientRoomState, RoomData } from '../types/game.types';
import { getRoom } from './room.service';
import {
  getRandomWords,
  generateMask,
  getRevealedIndices,
  isWordExact,
  isWordClose,
} from '../utils/word.util';
import { logger } from '../utils/logger.util';

export interface GameCallbacks {
  onStateUpdate: (room: RoomData) => void;
  onRoundReveal: (room: RoomData, secretWord: string) => void;
  onGameOver: (room: RoomData) => void;
  onHintUpdate: (room: RoomData, mask: string) => void;
}

export function startGame(
  roomId: string,
  hostId: string,
  callbacks: GameCallbacks,
): { success: boolean; error?: string } {
  const room = getRoom(roomId);
  if (!room) return { success: false, error: 'Room not found.' };

  const host = room.players.get(hostId);
  if (!host || !host.isHost) return { success: false, error: 'Only the host can start the game.' };

  const connectedPlayers = Array.from(room.players.values()).filter((p) => p.connected);
  if (connectedPlayers.length < 2) {
    return { success: false, error: 'Need at least 2 connected players to start.' };
  }

  room.currentRound = 1;
  room.totalRounds = room.settings.rounds;
  room.currentDrawerIndex = 0;
  room.replays = [];

  // Reset scores
  for (const player of room.players.values()) {
    player.score = 0;
    player.hasGuessed = false;
    player.isDrawing = false;
  }

  startWordSelection(room, callbacks);
  return { success: true };
}

export function startWordSelection(room: RoomData, callbacks: GameCallbacks): void {
  if (room.roundTimer) clearInterval(room.roundTimer);
  if (room.graceTimer) clearTimeout(room.graceTimer);
  if (room.intermissionTimer) clearTimeout(room.intermissionTimer);

  // Filter connected candidates
  const eligibleIds = room.drawerTurnOrder.filter((id) => {
    const p = room.players.get(id);
    return p && p.connected;
  });

  if (eligibleIds.length === 0) {
    room.state = 'LOBBY';
    callbacks.onStateUpdate(room);
    return;
  }

  // Pick drawer
  if (room.currentDrawerIndex >= eligibleIds.length) {
    room.currentDrawerIndex = 0;
    room.currentRound++;
    if (room.currentRound > room.totalRounds) {
      triggerGameOver(room, callbacks.onGameOver);
      return;
    }
  }

  const drawerId = eligibleIds[room.currentDrawerIndex];
  room.currentDrawerId = drawerId;
  room.state = 'SELECTING_WORD';
  room.strokeHistory = [];
  room.secretWord = null;
  room.revealedIndices.clear();

  // Reset player turn states
  for (const player of room.players.values()) {
    player.isDrawing = player.id === drawerId;
    player.hasGuessed = false;
  }

  // 3 word options
  room.wordOptions = getRandomWords(room.settings.wordPack, room.settings.customWords);
  room.turnTimeLeft = CONFIG.TIMERS.WORD_SELECTION_SECONDS;
  callbacks.onStateUpdate(room);

  // Auto-select countdown
  room.roundTimer = setInterval(() => {
    room.turnTimeLeft--;
    if (room.turnTimeLeft <= 0) {
      if (room.roundTimer) clearInterval(room.roundTimer);
      const autoWord = room.wordOptions[0] || 'apple';
      selectWord(room, drawerId, autoWord, callbacks);
    }
  }, 1000);
}

export function selectWord(
  room: RoomData,
  drawerId: string,
  word: string,
  callbacks: GameCallbacks,
): boolean {
  if (room.state !== 'SELECTING_WORD' || room.currentDrawerId !== drawerId) {
    return false;
  }

  if (room.roundTimer) clearInterval(room.roundTimer);

  room.secretWord = word.toLowerCase().trim();
  room.state = 'DRAWING';
  room.turnTimeLeft = room.settings.drawTime;
  room.turnStartTime = Date.now();
  room.revealedIndices.clear();
  room.strokeHistory = [];

  callbacks.onStateUpdate(room);

  // Drawing countdown timer
  room.roundTimer = setInterval(() => {
    room.turnTimeLeft--;

    // Progressive hints reveal
    const elapsed = room.settings.drawTime - room.turnTimeLeft;
    const progress = elapsed / room.settings.drawTime;
    const previousCount = room.revealedIndices.size;
    const newRevealed = getRevealedIndices(room.secretWord!, progress);

    if (newRevealed.size > previousCount) {
      room.revealedIndices = newRevealed;
      const mask = generateMask(room.secretWord!, room.revealedIndices);
      callbacks.onHintUpdate(room, mask);
    }

    if (room.turnTimeLeft <= 0) {
      endTurn(room, callbacks);
    }
  }, 1000);

  return true;
}

export function handleGuess(
  room: RoomData,
  playerId: string,
  guessText: string,
  callbacks: GameCallbacks,
): { status: 'correct' | 'close' | 'normal' | 'ignored'; scoreAwarded?: number } {
  if (room.state !== 'DRAWING' || !room.secretWord) {
    return { status: 'normal' };
  }

  const player = room.players.get(playerId);
  if (!player || player.isDrawing || player.hasGuessed) {
    return { status: 'ignored' };
  }

  // Exact match
  if (isWordExact(guessText, room.secretWord)) {
    player.hasGuessed = true;
    const timeRatio = Math.max(0, room.turnTimeLeft / room.settings.drawTime);
    const scoreAwarded = Math.round(150 + timeRatio * 350); // 150 to 500 points
    player.score += scoreAwarded;

    // Drawer bonus points
    if (room.currentDrawerId) {
      const drawer = room.players.get(room.currentDrawerId);
      if (drawer) {
        drawer.score += 75;
      }
    }

    // Check if all non-drawing players have guessed
    const guessers = Array.from(room.players.values()).filter((p) => p.connected && !p.isDrawing);
    const allGuessed = guessers.every((p) => p.hasGuessed);

    if (allGuessed) {
      endTurn(room, callbacks);
    } else {
      if (room.turnTimeLeft > 10) {
        room.turnTimeLeft = 10;
      }
      callbacks.onStateUpdate(room);
    }

    return { status: 'correct', scoreAwarded };
  }

  // Near-miss check
  if (isWordClose(guessText, room.secretWord)) {
    return { status: 'close' };
  }

  return { status: 'normal' };
}

export function recordStroke(room: RoomData, stroke: StrokeAction): void {
  if (room.state === 'DRAWING') {
    room.strokeHistory.push(stroke);
  }
}

export function undoStroke(room: RoomData, drawerId: string): boolean {
  if (room.state !== 'DRAWING' || room.currentDrawerId !== drawerId) {
    return false;
  }
  if (room.strokeHistory.length > 0) {
    room.strokeHistory.pop();
    return true;
  }
  return false;
}

export function clearCanvas(room: RoomData, drawerId: string): boolean {
  if (room.state !== 'DRAWING' || room.currentDrawerId !== drawerId) {
    return false;
  }
  room.strokeHistory = [];
  return true;
}

export function endTurn(room: RoomData, callbacks: GameCallbacks): void {
  if (room.roundTimer) clearInterval(room.roundTimer);
  if (room.graceTimer) clearTimeout(room.graceTimer);
  if (room.intermissionTimer) clearTimeout(room.intermissionTimer);

  const secret = room.secretWord || '';
  const drawer = room.currentDrawerId ? room.players.get(room.currentDrawerId) : null;

  // Save replay
  if (secret && room.strokeHistory.length > 0) {
    const replay: DrawingReplay = {
      round: room.currentRound,
      turn: room.currentDrawerIndex + 1,
      word: secret,
      drawerId: room.currentDrawerId || '',
      drawerName: drawer?.name || 'Unknown',
      actions: [...room.strokeHistory],
    };
    room.replays.push(replay);
  }

  room.state = 'ROUND_REVEAL';
  callbacks.onRoundReveal(room, secret);

  // Reveal intermission before next word
  room.intermissionTimer = setTimeout(() => {
    room.currentDrawerIndex++;
    startWordSelection(room, callbacks);
  }, CONFIG.TIMERS.REVEAL_INTERMISSION_MS);
}

export function handleDrawerDisconnect(
  room: RoomData,
  drawerId: string,
  callbacks: GameCallbacks,
): void {
  if (room.currentDrawerId !== drawerId || (room.state !== 'DRAWING' && room.state !== 'SELECTING_WORD')) {
    return;
  }

  logger.warn(`Drawer ${drawerId} disconnected mid-turn in ${room.id}. Initiating clean recovery.`);

  if (room.roundTimer) clearInterval(room.roundTimer);
  if (room.graceTimer) clearTimeout(room.graceTimer);
  if (room.intermissionTimer) clearTimeout(room.intermissionTimer);
  room.turnTimeLeft = 5;

  room.graceTimer = setTimeout(() => {
    logger.info(`Drawer did not return immediately in ${room.id}. Advancing turn.`);
    room.currentDrawerIndex++;
    startWordSelection(room, callbacks);
  }, CONFIG.TIMERS.DRAWER_DISCONNECT_GRACE_MS);
}

export function triggerGameOver(room: RoomData, onGameOver: (room: RoomData) => void): void {
  clearRoomTimers(room);

  room.state = 'GAME_OVER';
  onGameOver(room);
}

export function clearRoomTimers(room: RoomData): void {
  if (room.roundTimer) {
    clearInterval(room.roundTimer);
    room.roundTimer = null;
  }
  if (room.graceTimer) {
    clearTimeout(room.graceTimer);
    room.graceTimer = null;
  }
  if (room.intermissionTimer) {
    clearTimeout(room.intermissionTimer);
    room.intermissionTimer = null;
  }
}

export function returnToLobby(
  roomId: string,
  hostId: string,
  callbacks: GameCallbacks,
): { success: boolean; error?: string } {
  const room = getRoom(roomId);
  if (!room) return { success: false, error: 'Room not found.' };

  const host = room.players.get(hostId);
  if (!host || !host.isHost) return { success: false, error: 'Only the host can return to lobby.' };

  clearRoomTimers(room);
  room.state = 'LOBBY';
  room.currentRound = 1;
  room.currentDrawerIndex = 0;
  room.currentDrawerId = null;
  room.secretWord = null;
  room.revealedIndices.clear();
  room.strokeHistory = [];
  room.wordOptions = [];

  for (const player of room.players.values()) {
    player.score = 0;
    player.hasGuessed = false;
    player.isDrawing = false;
  }

  callbacks.onStateUpdate(room);
  return { success: true };
}

export function getClientState(room: RoomData, forPlayerId: string): ClientRoomState {
  const isCurrentDrawer = room.currentDrawerId === forPlayerId;
  const canSeeWord = isCurrentDrawer || room.state === 'ROUND_REVEAL' || room.state === 'GAME_OVER';

  let wordMask: string | null = null;
  let wordLength: number | null = null;

  if (room.secretWord) {
    wordLength = room.secretWord.length;
    if (canSeeWord) {
      wordMask = room.secretWord;
    } else {
      wordMask = generateMask(room.secretWord, room.revealedIndices);
    }
  }

  return {
    roomId: room.id,
    state: room.state,
    settings: room.settings,
    players: Array.from(room.players.values()).filter((p) => (room.state === 'LOBBY' ? p.connected : true)),
    currentRound: room.currentRound,
    totalRounds: room.totalRounds,
    currentDrawerId: room.currentDrawerId,
    timeLeft: room.turnTimeLeft,
    wordMask,
    wordLength,
    wordOptions: isCurrentDrawer && room.state === 'SELECTING_WORD' ? room.wordOptions : undefined,
    secretWord: canSeeWord ? room.secretWord || undefined : undefined,
    replays: room.state === 'GAME_OVER' ? room.replays : undefined,
  };
}
