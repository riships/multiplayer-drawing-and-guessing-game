import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';
import { Server, Socket } from 'socket.io';
import { registerSocketHandlers, initSocketIO } from '../sockets';
import { clearAllRooms } from '../services/room.service';

describe('Socket Engine Registration', () => {
  it('registerSocketHandlers attaches and invokes all real-time game listeners', () => {
    const registeredEvents: string[] = [];
    const mockSocket = new EventEmitter() as unknown as Socket;
    (mockSocket as unknown as { id: string }).id = 'test_socket_id';

    const originalOn = mockSocket.on.bind(mockSocket);
    mockSocket.on = (event: string, listener: (...args: unknown[]) => void) => {
      registeredEvents.push(event);
      return originalOn(event, listener);
    };

    const mockIo = {
      to: () => ({ emit: () => {} }),
      emit: () => {},
    } as unknown as Server;

    (mockSocket as unknown as { join: (r: string) => void }).join = () => {};
    (mockSocket as unknown as { leave: (r: string) => void }).leave = () => {};
    (mockSocket as unknown as { to: () => { emit: () => void } }).to = () => ({ emit: () => {} });

    registerSocketHandlers(mockIo, mockSocket);

    const expectedEvents = [
      'join_room',
      'update_settings',
      'leave_room',
      'start_game',
      'select_word',
      'draw_stroke',
      'draw_fill',
      'undo_stroke',
      'clear_canvas',
      'send_message',
      'disconnect',
    ];

    for (const evt of expectedEvents) {
      assert.ok(registeredEvents.includes(evt), `Expected event ${evt} to be registered`);
    }

    // Trigger each registered listener to ensure 100% function coverage
    mockSocket.emit('join_room', { playerId: 'p1', name: 'User', avatar: '#123' });
    mockSocket.emit('update_settings', { roomId: 'TEST', settings: {} });
    mockSocket.emit('start_game', { roomId: 'TEST' });
    mockSocket.emit('select_word', { roomId: 'TEST', word: 'apple' });
    mockSocket.emit('draw_stroke', { id: 's1', type: 'stroke', points: [], timestamp: Date.now() });
    mockSocket.emit('draw_fill', { id: 'f1', type: 'fill', point: { x: 0, y: 0 }, timestamp: Date.now() });
    mockSocket.emit('undo_stroke');
    mockSocket.emit('clear_canvas');
    mockSocket.emit('send_message', { text: 'guess' });
    mockSocket.emit('leave_room');
    mockSocket.emit('disconnect');

    clearAllRooms();
  });

  it('initSocketIO registers connection handler and invokes registerSocketHandlers', () => {
    const mockIoEmitter = new EventEmitter() as unknown as Server;
    initSocketIO(mockIoEmitter);

    const clientSocket = new EventEmitter() as unknown as Socket;
    (clientSocket as unknown as { id: string }).id = 'connected_client';
    (clientSocket as unknown as { join: () => void }).join = () => {};
    (clientSocket as unknown as { leave: () => void }).leave = () => {};

    let joinRoomRegistered = false;
    clientSocket.on('newListener', (event) => {
      if (event === 'join_room') joinRoomRegistered = true;
    });

    mockIoEmitter.emit('connection', clientSocket);
    assert.strictEqual(joinRoomRegistered, true);

    clearAllRooms();
  });
});
