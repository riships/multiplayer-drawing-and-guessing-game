import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, clearAllRooms, destroyRoom } from '../services/room.service';
import {
  startGame,
  startWordSelection,
  selectWord,
  handleGuess,
  recordStroke,
  undoStroke,
  clearCanvas,
  endTurn,
  handleDrawerDisconnect,
  triggerGameOver,
  getClientState,
  clearRoomTimers,
  returnToLobby,
  GameCallbacks,
} from '../services/game.service';
import { RoomData, StrokeAction } from '../types/game.types';
import { CONFIG } from '../config';

describe('Game Service (Authoritative State Machine)', () => {
  beforeEach(() => {
    clearAllRooms();
  });

  afterEach(() => {
    clearAllRooms();
  });

  const createDummyCallbacks = (): { callbacks: GameCallbacks; calls: Record<string, number> } => {
    const calls: Record<string, number> = {
      stateUpdate: 0,
      roundReveal: 0,
      gameOver: 0,
      hintUpdate: 0,
    };
    return {
      calls,
      callbacks: {
        onStateUpdate: () => {
          calls.stateUpdate++;
        },
        onRoundReveal: () => {
          calls.roundReveal++;
        },
        onGameOver: () => {
          calls.gameOver++;
        },
        onHintUpdate: () => {
          calls.hintUpdate++;
        },
      },
    };
  };

  it('startGame validates room existence, host authority, and player count', () => {
    const { callbacks } = createDummyCallbacks();

    // 1. Missing room
    assert.strictEqual(startGame('MISSING', 'host1', callbacks).success, false);

    // 2. Non-host attempt
    const room = createRoom({ id: 'h1', socketId: 's1', name: 'Host', avatar: '#111' }, 'START1');
    room.players.set('guest1', {
      id: 'guest1',
      socketId: 'sg1',
      name: 'Guest',
      avatar: '#222',
      score: 0,
      isHost: false,
      hasGuessed: false,
      isDrawing: false,
      connected: true,
    });
    const guestStart = startGame('START1', 'guest1', callbacks);
    assert.strictEqual(guestStart.success, false);
    assert.match(guestStart.error || '', /Only the host/);

    // 3. Solo player cannot start
    room.players.delete('guest1');
    const soloStart = startGame('START1', 'h1', callbacks);
    assert.strictEqual(soloStart.success, false);
    assert.match(soloStart.error || '', /at least 2/);

    clearRoomTimers(room);
  });

  it('startGame successfully resets match scores and begins word selection', () => {
    const { callbacks } = createDummyCallbacks();
    const room = createRoom({ id: 'h1', socketId: 's1', name: 'Host', avatar: '#111' }, 'START2');
    room.players.set('g1', {
      id: 'g1',
      socketId: 'sg1',
      name: 'Guest',
      avatar: '#222',
      score: 999,
      isHost: false,
      hasGuessed: true,
      isDrawing: true,
      connected: true,
    });
    room.drawerTurnOrder.push('g1');

    const result = startGame('START2', 'h1', callbacks);
    assert.strictEqual(result.success, true);
    assert.strictEqual(room.currentRound, 1);
    assert.strictEqual(room.state, 'SELECTING_WORD');
    assert.strictEqual(room.players.get('g1')?.score, 0);
    assert.strictEqual(room.players.get('g1')?.hasGuessed, false);
    assert.strictEqual(room.players.get('h1')?.isDrawing, true);
    assert.strictEqual(room.wordOptions.length, 3);

    clearRoomTimers(room);
  });

  it('startWordSelection reverts to LOBBY if all players disconnect', () => {
    const { callbacks, calls } = createDummyCallbacks();
    const room = createRoom({ id: 'h1', socketId: 's1', name: 'Host', avatar: '#111' }, 'NOCONN');
    room.players.get('h1')!.connected = false;

    startWordSelection(room, callbacks);
    assert.strictEqual(room.state, 'LOBBY');
    assert.ok(calls.stateUpdate > 0);

    clearRoomTimers(room);
  });

  it('startWordSelection advances rounds and triggers game over when rounds exceeded', () => {
    const { callbacks, calls } = createDummyCallbacks();
    const room = createRoom({ id: 'h1', socketId: 's1', name: 'Host', avatar: '#111' }, 'ROUNDS');
    room.totalRounds = 1;
    room.currentRound = 1;
    room.currentDrawerIndex = 1; // triggers round advancement

    startWordSelection(room, callbacks);
    assert.strictEqual(room.state, 'GAME_OVER');
    assert.ok(calls.gameOver > 0);

    clearRoomTimers(room);
  });

  it('selectWord authorizes drawer and sets turn timer with progressive hint callbacks', () => {
    const { callbacks } = createDummyCallbacks();
    const room = createRoom({ id: 'd1', socketId: 's1', name: 'Drawer', avatar: '#111' }, 'DRAW1');
    room.players.set('g1', {
      id: 'g1',
      socketId: 'sg1',
      name: 'Guesser',
      avatar: '#222',
      score: 0,
      isHost: false,
      hasGuessed: false,
      isDrawing: false,
      connected: true,
    });
    room.drawerTurnOrder.push('g1');

    startGame('DRAW1', 'd1', callbacks);

    // Non-drawer or wrong state cannot select word
    assert.strictEqual(selectWord(room, 'g1', 'banana', callbacks), false);

    // Valid drawer selection
    assert.strictEqual(selectWord(room, 'd1', 'banana', callbacks), true);
    assert.strictEqual(room.state, 'DRAWING');
    assert.strictEqual(room.secretWord, 'banana');
    assert.strictEqual(room.turnTimeLeft, room.settings.drawTime);

    clearRoomTimers(room);
  });

  it('handleGuess handles state validations, ignored guesses, close guesses, and scores', () => {
    const { callbacks, calls } = createDummyCallbacks();
    const room = createRoom({ id: 'd1', socketId: 's1', name: 'Drawer', avatar: '#111' }, 'GUESS1');
    room.players.set('g1', {
      id: 'g1',
      socketId: 'sg1',
      name: 'Guesser 1',
      avatar: '#222',
      score: 0,
      isHost: false,
      hasGuessed: false,
      isDrawing: false,
      connected: true,
    });
    room.players.set('g2', {
      id: 'g2',
      socketId: 'sg2',
      name: 'Guesser 2',
      avatar: '#333',
      score: 0,
      isHost: false,
      hasGuessed: false,
      isDrawing: false,
      connected: true,
    });
    room.drawerTurnOrder.push('g1', 'g2');

    // Guessing in LOBBY state returns normal
    assert.strictEqual(handleGuess(room, 'g1', 'guitar', callbacks).status, 'normal');

    startGame('GUESS1', 'd1', callbacks);
    selectWord(room, 'd1', 'guitar', callbacks);

    // Drawer guess is ignored
    assert.strictEqual(handleGuess(room, 'd1', 'guitar', callbacks).status, 'ignored');

    // Missing player guess is ignored
    assert.strictEqual(handleGuess(room, 'ghost', 'guitar', callbacks).status, 'ignored');

    // Wrong guess
    assert.strictEqual(handleGuess(room, 'g1', 'piano', callbacks).status, 'normal');

    // Close guess (near-miss)
    assert.strictEqual(handleGuess(room, 'g1', 'guitat', callbacks).status, 'close');

    // First guesser correctly guesses -> timeLeft reduced to 10s if > 10
    room.turnTimeLeft = 45;
    const g1Correct = handleGuess(room, 'g1', 'guitar', callbacks);
    assert.strictEqual(g1Correct.status, 'correct');
    assert.ok(g1Correct.scoreAwarded && g1Correct.scoreAwarded >= 150);
    assert.strictEqual(room.players.get('g1')?.hasGuessed, true);
    assert.strictEqual(room.players.get('d1')?.score, 75); // drawer bonus
    assert.strictEqual(room.turnTimeLeft, 10);
    assert.strictEqual(room.state, 'DRAWING');

    // Guessing again when already guessed is ignored
    assert.strictEqual(handleGuess(room, 'g1', 'guitar', callbacks).status, 'ignored');

    // Second guesser correctly guesses -> all guessers guessed -> triggers endTurn (ROUND_REVEAL)
    const g2Correct = handleGuess(room, 'g2', 'guitar', callbacks);
    assert.strictEqual(g2Correct.status, 'correct');
    assert.strictEqual(room.state, 'ROUND_REVEAL');
    assert.ok(calls.roundReveal > 0);

    clearRoomTimers(room);
  });

  it('recordStroke, undoStroke, and clearCanvas enforce state and drawer permissions', () => {
    const { callbacks } = createDummyCallbacks();
    const room = createRoom({ id: 'd1', socketId: 's1', name: 'Drawer', avatar: '#111' }, 'CANVAS1');
    room.players.set('g1', {
      id: 'g1',
      socketId: 'sg1',
      name: 'Guesser',
      avatar: '#222',
      score: 0,
      isHost: false,
      hasGuessed: false,
      isDrawing: false,
      connected: true,
    });
    room.drawerTurnOrder.push('g1');

    const sampleStroke: StrokeAction = {
      id: 'st_1',
      type: 'stroke',
      points: [{ x: 0.1, y: 0.2 }],
      timestamp: Date.now(),
    };

    // Before game starts (LOBBY), stroke recording and undo do nothing
    recordStroke(room, sampleStroke);
    assert.strictEqual(room.strokeHistory.length, 0);
    assert.strictEqual(undoStroke(room, 'd1'), false);
    assert.strictEqual(clearCanvas(room, 'd1'), false);

    startGame('CANVAS1', 'd1', callbacks);
    selectWord(room, 'd1', 'pyramid', callbacks);

    // Active drawer can record strokes
    recordStroke(room, sampleStroke);
    assert.strictEqual(room.strokeHistory.length, 1);

    // Non-drawer cannot undo or clear
    assert.strictEqual(undoStroke(room, 'g1'), false);
    assert.strictEqual(clearCanvas(room, 'g1'), false);

    // Active drawer can undo stroke
    assert.strictEqual(undoStroke(room, 'd1'), true);
    assert.strictEqual(room.strokeHistory.length, 0);
    assert.strictEqual(undoStroke(room, 'd1'), false); // empty history returns false

    // Record and clear
    recordStroke(room, sampleStroke);
    assert.strictEqual(clearCanvas(room, 'd1'), true);
    assert.strictEqual(room.strokeHistory.length, 0);

    clearRoomTimers(room);
  });

  it('endTurn records replay and schedules reveal intermission', () => {
    const { callbacks, calls } = createDummyCallbacks();
    const room = createRoom({ id: 'd1', socketId: 's1', name: 'Drawer', avatar: '#111' }, 'REPLAY1');
    room.players.set('g1', {
      id: 'g1',
      socketId: 'sg1',
      name: 'Guesser',
      avatar: '#222',
      score: 0,
      isHost: false,
      hasGuessed: false,
      isDrawing: false,
      connected: true,
    });
    room.drawerTurnOrder.push('g1');

    startGame('REPLAY1', 'd1', callbacks);
    selectWord(room, 'd1', 'spaceship', callbacks);

    recordStroke(room, {
      id: 'strk',
      type: 'stroke',
      points: [{ x: 0.5, y: 0.5 }],
      timestamp: Date.now(),
    });

    endTurn(room, callbacks);
    assert.strictEqual(room.state, 'ROUND_REVEAL');
    assert.strictEqual(room.replays.length, 1);
    assert.strictEqual(room.replays[0].word, 'spaceship');
    assert.strictEqual(room.replays[0].actions.length, 1);
    assert.ok(calls.roundReveal > 0);

    clearRoomTimers(room);
  });

  it('handleDrawerDisconnect triggers recovery grace timer mid-turn', () => {
    const { callbacks } = createDummyCallbacks();
    const room = createRoom({ id: 'd1', socketId: 's1', name: 'Drawer', avatar: '#111' }, 'DC1');
    room.players.set('g1', {
      id: 'g1',
      socketId: 'sg1',
      name: 'Guesser',
      avatar: '#222',
      score: 0,
      isHost: false,
      hasGuessed: false,
      isDrawing: false,
      connected: true,
    });
    room.drawerTurnOrder.push('g1');

    startGame('DC1', 'd1', callbacks);
    selectWord(room, 'd1', 'island', callbacks);

    // Disconnecting a non-drawer does not trigger drawer recovery
    handleDrawerDisconnect(room, 'g1', callbacks);
    assert.strictEqual(room.graceTimer, null);

    // Disconnecting the active drawer triggers recovery
    handleDrawerDisconnect(room, 'd1', callbacks);
    assert.strictEqual(room.turnTimeLeft, 5);
    assert.ok(room.graceTimer !== null);

    clearRoomTimers(room);
  });

  it('triggerGameOver cleans all timers and transitions to GAME_OVER', () => {
    let gameOverFired = false;
    const room = createRoom({ id: 'h1', socketId: 's1', name: 'Host', avatar: '#111' }, 'OVER1');
    room.roundTimer = setInterval(() => {}, 1000);
    room.graceTimer = setTimeout(() => {}, 1000);
    room.intermissionTimer = setTimeout(() => {}, 1000);

    triggerGameOver(room, () => {
      gameOverFired = true;
    });

    assert.strictEqual(room.state, 'GAME_OVER');
    assert.strictEqual(gameOverFired, true);
    assert.strictEqual(room.roundTimer, null);
    assert.strictEqual(room.graceTimer, null);
    assert.strictEqual(room.intermissionTimer, null);
  });

  it('getClientState authoritatively redacts secret word from guessers', () => {
    const { callbacks } = createDummyCallbacks();
    const room = createRoom({ id: 'd1', socketId: 's1', name: 'Drawer', avatar: '#111' }, 'AUTH1');
    room.players.set('g1', {
      id: 'g1',
      socketId: 'sg1',
      name: 'Guesser',
      avatar: '#222',
      score: 0,
      isHost: false,
      hasGuessed: false,
      isDrawing: false,
      connected: true,
    });
    room.drawerTurnOrder.push('g1');

    startGame('AUTH1', 'd1', callbacks);

    // During SELECTING_WORD, only drawer sees wordOptions
    const drawerSelectState = getClientState(room, 'd1');
    assert.strictEqual(drawerSelectState.wordOptions?.length, 3);
    const guesserSelectState = getClientState(room, 'g1');
    assert.strictEqual(guesserSelectState.wordOptions, undefined);

    // During DRAWING, only drawer sees secretWord; guesser sees mask
    selectWord(room, 'd1', 'castle', callbacks);
    const drawerDrawState = getClientState(room, 'd1');
    assert.strictEqual(drawerDrawState.secretWord, 'castle');
    const guesserDrawState = getClientState(room, 'g1');
    assert.strictEqual(guesserDrawState.secretWord, undefined);
    assert.strictEqual(guesserDrawState.wordLength, 6);
    assert.strictEqual(guesserDrawState.wordMask, '_ _ _ _ _ _');

    // During ROUND_REVEAL, all players see secretWord
    room.state = 'ROUND_REVEAL';
    const guesserRevealState = getClientState(room, 'g1');
    assert.strictEqual(guesserRevealState.secretWord, 'castle');

    // During GAME_OVER, all players see replays
    room.state = 'GAME_OVER';
    room.replays = [
      {
        round: 1,
        turn: 1,
        word: 'castle',
        drawerId: 'd1',
        drawerName: 'Drawer',
        actions: [],
      },
    ];
    const gameOverState = getClientState(room, 'g1');
    assert.strictEqual(gameOverState.replays?.length, 1);

    clearRoomTimers(room);
  });

  it('startWordSelection auto-selects word when selection timer expires', (t, done) => {
    const { callbacks } = createDummyCallbacks();
    const room = createRoom({ id: 'd1', socketId: 's1', name: 'Drawer', avatar: '#111' }, 'AUTOWORD');
    room.players.set('g1', {
      id: 'g1',
      socketId: 'sg1',
      name: 'Guesser',
      avatar: '#222',
      score: 0,
      isHost: false,
      hasGuessed: false,
      isDrawing: false,
      connected: true,
    });
    room.drawerTurnOrder.push('g1');

    startGame('AUTOWORD', 'd1', callbacks);
    room.turnTimeLeft = 1; // 1 second left

    setTimeout(() => {
      assert.strictEqual(room.state, 'DRAWING');
      assert.ok(room.secretWord);
      clearRoomTimers(room);
      done();
    }, 1100);
  });

  it('selectWord countdown timer triggers hint reveal and ends turn when time expires', (t, done) => {
    const { callbacks, calls } = createDummyCallbacks();
    const room = createRoom({ id: 'd1', socketId: 's1', name: 'Drawer', avatar: '#111' }, 'TIMER1');
    room.settings.drawTime = 2;
    room.players.set('g1', {
      id: 'g1',
      socketId: 'sg1',
      name: 'Guesser',
      avatar: '#222',
      score: 0,
      isHost: false,
      hasGuessed: false,
      isDrawing: false,
      connected: true,
    });
    room.drawerTurnOrder.push('g1');

    startGame('TIMER1', 'd1', callbacks);
    selectWord(room, 'd1', 'elephant', callbacks);
    room.turnTimeLeft = 1; // 1 second left

    setTimeout(() => {
      assert.strictEqual(room.state, 'ROUND_REVEAL');
      clearRoomTimers(room);
      done();
    }, 1100);
  });

  it('handleDrawerDisconnect executes recovery when grace timer expires', (t, done) => {
    const { callbacks } = createDummyCallbacks();
    const room = createRoom({ id: 'd1', socketId: 's1', name: 'Drawer', avatar: '#111' }, 'DC_GRACE');
    room.players.set('g1', {
      id: 'g1',
      socketId: 'sg1',
      name: 'Guesser',
      avatar: '#222',
      score: 0,
      isHost: false,
      hasGuessed: false,
      isDrawing: false,
      connected: true,
    });
    room.drawerTurnOrder.push('g1');

    startGame('DC_GRACE', 'd1', callbacks);
    selectWord(room, 'd1', 'ladder', callbacks);

    const origGrace = CONFIG.TIMERS.DRAWER_DISCONNECT_GRACE_MS;
    CONFIG.TIMERS.DRAWER_DISCONNECT_GRACE_MS = 50;

    handleDrawerDisconnect(room, 'd1', callbacks);

    setTimeout(() => {
      CONFIG.TIMERS.DRAWER_DISCONNECT_GRACE_MS = origGrace;
      assert.strictEqual(room.currentDrawerIndex, 1);
      clearRoomTimers(room);
      done();
    }, 100);
  });

  it('endTurn advances drawer index and starts new word selection when intermission expires', (t, done) => {
    const { callbacks } = createDummyCallbacks();
    const room = createRoom({ id: 'd1', socketId: 's1', name: 'Drawer', avatar: '#111' }, 'INTER_EXPIRE');
    room.players.set('g1', {
      id: 'g1',
      socketId: 'sg1',
      name: 'Guesser',
      avatar: '#222',
      score: 0,
      isHost: false,
      hasGuessed: false,
      isDrawing: false,
      connected: true,
    });
    room.drawerTurnOrder.push('g1');

    startGame('INTER_EXPIRE', 'd1', callbacks);
    selectWord(room, 'd1', 'apple', callbacks);

    const origIntermission = CONFIG.TIMERS.REVEAL_INTERMISSION_MS;
    CONFIG.TIMERS.REVEAL_INTERMISSION_MS = 50;

    endTurn(room, callbacks);

    setTimeout(() => {
      CONFIG.TIMERS.REVEAL_INTERMISSION_MS = origIntermission;
      assert.strictEqual(room.currentDrawerIndex, 1);
      assert.strictEqual(room.state, 'SELECTING_WORD');
      clearRoomTimers(room);
      done();
    }, 100);
  });

  it('returnToLobby validates host authority and resets match state back to LOBBY', () => {
    const { callbacks } = createDummyCallbacks();
    const room = createRoom({ id: 'h1', socketId: 's1', name: 'Host', avatar: '#111' }, 'RET_LOBBY');
    room.players.set('g1', {
      id: 'g1',
      socketId: 's2',
      name: 'Guest',
      avatar: '#222',
      score: 300,
      isHost: false,
      hasGuessed: true,
      isDrawing: false,
      connected: true,
    });
    room.drawerTurnOrder.push('g1');

    startGame('RET_LOBBY', 'h1', callbacks);
    selectWord(room, 'h1', 'guitar', callbacks);

    // Non-host cannot return to lobby
    const nonHostRes = returnToLobby('RET_LOBBY', 'g1', callbacks);
    assert.strictEqual(nonHostRes.success, false);
    assert.strictEqual(room.state, 'DRAWING');

    // Host successfully returns to lobby
    const hostRes = returnToLobby('RET_LOBBY', 'h1', callbacks);
    assert.strictEqual(hostRes.success, true);
    assert.strictEqual(room.state, 'LOBBY');
    assert.strictEqual(room.currentRound, 1);
    assert.strictEqual(room.strokeHistory.length, 0);
    assert.strictEqual(room.players.get('g1')!.score, 0);

    clearRoomTimers(room);
  });
});
