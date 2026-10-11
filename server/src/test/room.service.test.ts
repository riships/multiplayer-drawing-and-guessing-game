import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateRoomCode,
  createRoom,
  getRoom,
  getPlayerBySocket,
  joinRoom,
  handleDisconnect,
  removePlayerPermanently,
  updateSettings,
  destroyRoom,
  clearAllRooms,
} from '../services/room.service';
import { CONFIG } from '../config';

describe('Room Lifecycle & Session Management', () => {
  beforeEach(() => {
    clearAllRooms();
  });

  afterEach(() => {
    clearAllRooms();
  });

  it('generateRoomCode generates a valid 6-char room code', () => {
    const code = generateRoomCode();
    assert.strictEqual(code.length, 6);
    assert.match(code, /^[A-Z2-9]+$/);
  });

  it('createRoom creates room with default or custom code and default host fields', () => {
    // Custom code
    const room1 = createRoom(
      { id: 'h1', socketId: 's1', name: 'Alice', avatar: '#ff0000' },
      'CUSTOM1',
    );
    assert.strictEqual(room1.id, 'CUSTOM1');
    assert.strictEqual(room1.players.size, 1);
    assert.strictEqual(room1.state, 'LOBBY');

    // Generated code and default avatar
    const room2 = createRoom({ id: 'h2', socketId: 's2', name: 'Bob', avatar: '' });
    assert.ok(room2.id);
    const host2 = room2.players.get('h2');
    assert.strictEqual(host2?.avatar, '#2563eb');
  });

  it('getRoom retrieves room case-insensitively and returns undefined if missing', () => {
    createRoom({ id: 'h1', socketId: 's1', name: 'Host', avatar: '#123' }, 'ROOM99');
    assert.ok(getRoom('room99'));
    assert.ok(getRoom('ROOM99'));
    assert.strictEqual(getRoom('NONEXIST'), undefined);
  });

  it('getPlayerBySocket handles valid, missing, or broken mappings', () => {
    assert.strictEqual(getPlayerBySocket('nonexistent_sock'), undefined);

    const room = createRoom({ id: 'h1', socketId: 's1', name: 'Host', avatar: '#123' }, 'LOOKUP');
    const lookup = getPlayerBySocket('s1');
    assert.ok(lookup);
    assert.strictEqual(lookup?.player.id, 'h1');
    assert.strictEqual(lookup?.room.id, 'LOOKUP');

    // Delete player from room to test missing player branch
    room.players.delete('h1');
    assert.strictEqual(getPlayerBySocket('s1'), undefined);

    // Recreate and delete room to test missing room branch
    createRoom({ id: 'h2', socketId: 's2', name: 'Host2', avatar: '#123' }, 'LOOKUP2');
    destroyRoom('LOOKUP2');
    assert.strictEqual(getPlayerBySocket('s2'), undefined);
  });

  it('joinRoom handles error for non-existent room', () => {
    const result = joinRoom('UNKNOWN_ROOM', {
      id: 'p1',
      socketId: 's1',
      name: 'Player',
      avatar: '#fff',
    });
    assert.ok('error' in result);
    if ('error' in result) {
      assert.match(result.error, /Room not found/);
    }
  });

  it('joinRoom creates new player with defaults when joining room', () => {
    createRoom({ id: 'h1', socketId: 's1', name: 'Host', avatar: '#123' }, 'ROOM10');

    // Join with custom name and avatar
    const res1 = joinRoom('ROOM10', { id: 'p2', socketId: 's2', name: 'Player2', avatar: '#abc' });
    assert.ok(!('error' in res1));
    if (!('error' in res1)) {
      assert.strictEqual(res1.player.name, 'Player2');
      assert.strictEqual(res1.player.isHost, false);
      assert.strictEqual(res1.isReconnected, false);
    }

    // Join with empty name and empty avatar
    const res2 = joinRoom('ROOM10', { id: 'p3', socketId: 's3', name: '', avatar: '' });
    assert.ok(!('error' in res2));
    if (!('error' in res2)) {
      assert.match(res2.player.name, /Player 3/);
      assert.strictEqual(res2.player.avatar, '#2563eb');
    }
  });

  it('joinRoom allows dropped player to reconnect retaining score via ID and name fallback', () => {
    const room = createRoom({ id: 'h1', socketId: 's1', name: 'Host', avatar: '#123' }, 'RECON');
    joinRoom('RECON', { id: 'p2', socketId: 's2', name: 'Bob', avatar: '#abc' });
    const p2 = room.players.get('p2')!;
    p2.score = 500;
    p2.connected = false;

    // 1. Reconnect via persistent ID
    const recon1 = joinRoom('RECON', {
      id: 'p2',
      socketId: 's2_new',
      name: 'Bob Updated',
      avatar: '#def',
    });
    assert.ok(!('error' in recon1));
    if (!('error' in recon1)) {
      assert.strictEqual(recon1.isReconnected, true);
      assert.strictEqual(recon1.player.score, 500);
      assert.strictEqual(recon1.player.name, 'Bob Updated');
      assert.strictEqual(recon1.player.avatar, '#def');
    }

    // 2. Disconnect and reconnect via name fallback with different temporary ID
    p2.connected = false;
    const recon2 = joinRoom('RECON', {
      id: 'temp_random_id',
      socketId: 's2_third',
      name: 'bob updated', // case-insensitive match
      avatar: '#000',
    });
    assert.ok(!('error' in recon2));
    if (!('error' in recon2)) {
      assert.strictEqual(recon2.isReconnected, true);
      assert.strictEqual(recon2.player.id, 'p2');
      assert.strictEqual(recon2.player.score, 500);
    }
  });

  it('joinRoom treats active player on a new socket as a distinct guest', () => {
    createRoom({ id: 'h1', socketId: 's1', name: 'Host', avatar: '#123' }, 'DUAL');
    // Try to join with same ID 'h1' on different socket 's_other' while h1 is still actively connected
    const res = joinRoom('DUAL', {
      id: 'h1',
      socketId: 's_other',
      name: 'Host Window 2',
      avatar: '#456',
    });
    assert.ok(!('error' in res));
    if (!('error' in res)) {
      assert.strictEqual(res.isReconnected, false);
      assert.notStrictEqual(res.player.id, 'h1');
      assert.strictEqual(res.player.socketId, 's_other');
    }
  });

  it('handleDisconnect removes immediately in LOBBY state', () => {
    createRoom({ id: 'h1', socketId: 's1', name: 'Host', avatar: '#123' }, 'DISC_LOBBY');
    joinRoom('DISC_LOBBY', { id: 'p2', socketId: 's2', name: 'Guest', avatar: '#456' });

    let graceExpiredFired = false;
    const result = handleDisconnect('s2', () => {
      graceExpiredFired = true;
    });

    assert.ok(result);
    assert.strictEqual(result?.player.id, 'p2');
    const room = getRoom('DISC_LOBBY');
    assert.strictEqual(room?.players.has('p2'), false);
    assert.strictEqual(graceExpiredFired, false);
  });

  it('handleDisconnect handles invalid sockets or deleted rooms cleanly', () => {
    assert.strictEqual(handleDisconnect('invalid_sock', () => {}), undefined);

    const room = createRoom({ id: 'h1', socketId: 's_err', name: 'Host', avatar: '#123' }, 'DISC_ERR');
    room.players.delete('h1');
    assert.strictEqual(handleDisconnect('s_err', () => {}), undefined);

    destroyRoom('DISC_ERR');
    assert.strictEqual(handleDisconnect('s_err', () => {}), undefined);
  });

  it('handleDisconnect sets grace timer during active game and fires callback upon expiry', (t, done) => {
    const origGrace = CONFIG.TIMERS.PLAYER_RECONNECT_GRACE_MS;
    CONFIG.TIMERS.PLAYER_RECONNECT_GRACE_MS = 50;

    const room = createRoom({ id: 'h1', socketId: 's1', name: 'Host', avatar: '#123' }, 'DISC_GAME');
    joinRoom('DISC_GAME', { id: 'p2', socketId: 's2', name: 'Guest', avatar: '#456' });
    room.state = 'DRAWING';

    handleDisconnect('s2', (roomId, playerId) => {
      CONFIG.TIMERS.PLAYER_RECONNECT_GRACE_MS = origGrace;
      assert.strictEqual(roomId, 'DISC_GAME');
      assert.strictEqual(playerId, 'p2');
      done();
    });
  });

  it('removePlayerPermanently removes guest without re-electing host', () => {
    createRoom({ id: 'h1', socketId: 's1', name: 'Host', avatar: '#123' }, 'GUEST_REM');
    joinRoom('GUEST_REM', { id: 'p2', socketId: 's2', name: 'Guest', avatar: '#456' });
    removePlayerPermanently('GUEST_REM', 'p2');
    const room = getRoom('GUEST_REM');
    assert.strictEqual(room?.players.has('p2'), false);
    assert.strictEqual(room?.players.get('h1')?.isHost, true);
  });

  it('removePlayerPermanently promotes next player and cleans up empty room', () => {
    createRoom({ id: 'h1', socketId: 's1', name: 'Host', avatar: '#123' }, 'PROMO');
    joinRoom('PROMO', { id: 'p2', socketId: 's2', name: 'Player2', avatar: '#456' });

    // Remove host
    removePlayerPermanently('PROMO', 'h1');
    const room = getRoom('PROMO');
    assert.ok(room);
    const p2 = room?.players.get('p2');
    assert.strictEqual(p2?.isHost, true);

    // Non-existent player or room removal does nothing
    removePlayerPermanently('NONEXIST', 'p1');
    removePlayerPermanently('PROMO', 'nonexistent_p');

    // Remove last player -> room is destroyed
    removePlayerPermanently('PROMO', 'p2');
    assert.strictEqual(getRoom('PROMO'), undefined);
  });

  it('updateSettings enforces host authorization and LOBBY state', () => {
    const room = createRoom({ id: 'h1', socketId: 's1', name: 'Host', avatar: '#123' }, 'SETTINGS');
    joinRoom('SETTINGS', { id: 'p2', socketId: 's2', name: 'Guest', avatar: '#456' });

    // Host update in LOBBY -> success
    assert.strictEqual(updateSettings('SETTINGS', 'h1', { rounds: 4, drawTime: 45 }), true);
    assert.strictEqual(room.settings.rounds, 4);
    assert.strictEqual(room.settings.drawTime, 45);

    // Guest update -> fails
    assert.strictEqual(updateSettings('SETTINGS', 'p2', { rounds: 5 }), false);

    // Non-existent room or player -> fails
    assert.strictEqual(updateSettings('MISSING', 'h1', { rounds: 5 }), false);
    assert.strictEqual(updateSettings('SETTINGS', 'ghost_id', { rounds: 5 }), false);

    // When game state is DRAWING -> updateSettings fails
    room.state = 'DRAWING';
    assert.strictEqual(updateSettings('SETTINGS', 'h1', { rounds: 5 }), false);
  });

  it('destroyRoom cleans timers and removes room', () => {
    const room = createRoom({ id: 'h1', socketId: 's1', name: 'Host', avatar: '#123' }, 'DESTROY_ME');
    room.roundTimer = setInterval(() => {}, 1000);
    room.graceTimer = setTimeout(() => {}, 1000);
    room.intermissionTimer = setTimeout(() => {}, 1000);

    destroyRoom('DESTROY_ME');
    assert.strictEqual(getRoom('DESTROY_ME'), undefined);

    // Calling destroy on already destroyed room is safe
    assert.doesNotThrow(() => destroyRoom('DESTROY_ME'));
  });

  it('cleans active disconnect timeouts on reconnect, removal, and room destruction', () => {
    const room = createRoom({ id: 'h1', socketId: 's1', name: 'Host', avatar: '#123' }, 'TIMEOUT_CLEAN');
    joinRoom('TIMEOUT_CLEAN', { id: 'p2', socketId: 's2', name: 'Player2', avatar: '#456' });
    joinRoom('TIMEOUT_CLEAN', { id: 'p3', socketId: 's3', name: 'Player3', avatar: '#789' });
    room.state = 'DRAWING';

    // 1. Disconnect p2 and reconnect -> cleans timeout in joinRoom
    handleDisconnect('s2', () => {});
    const recon = joinRoom('TIMEOUT_CLEAN', { id: 'p2', socketId: 's2_new', name: 'Player2', avatar: '#456' });
    assert.ok(!('error' in recon));

    // 2. Disconnect p3 and remove permanently -> cleans timeout in removePlayerPermanently
    handleDisconnect('s3', () => {});
    removePlayerPermanently('TIMEOUT_CLEAN', 'p3');

    // 3. Disconnect p2 and destroy room -> cleans timeout in destroyRoom
    handleDisconnect('s2_new', () => {});
    destroyRoom('TIMEOUT_CLEAN');
    assert.strictEqual(getRoom('TIMEOUT_CLEAN'), undefined);
  });
});
