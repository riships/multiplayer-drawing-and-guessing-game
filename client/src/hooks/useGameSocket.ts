import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { ClientRoomState, ChatMessage, StrokeAction, RoomSettings, DrawingReplay } from '../types';

export function getOrCreatePlayerId(): string {
  try {
    localStorage.removeItem('pictionary_player_id');
  } catch {
    // Ignore storage errors
  }

  const urlParams = new URLSearchParams(window.location.search);
  const isForceNew =
    urlParams.get('new') === '1' ||
    urlParams.get('reset') === '1' ||
    urlParams.get('test') === '1';

  let id = sessionStorage.getItem('pictionary_player_id');
  if (!id || isForceNew) {
    id = 'p_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    sessionStorage.setItem('pictionary_player_id', id);
    if (isForceNew) {
      sessionStorage.removeItem('pictionary_room_id');
      sessionStorage.removeItem('pictionary_joined');
    }
  }
  return id;
}

export function useGameSocket() {
  const socketRef = useRef<Socket | null>(null);
  const currentTurnRef = useRef<string>('');
  const [connected, setConnected] = useState(false);
  const [roomState, setRoomState] = useState<ClientRoomState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [canvasHistory, setCanvasHistory] = useState<StrokeAction[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [rateLimitWarning, setRateLimitWarning] = useState<string | null>(null);
  const [roundReveal, setRoundReveal] = useState<{ word: string; scores: { id: string; name: string; score: number }[] } | null>(null);
  const [gameOverData, setGameOverData] = useState<{ podium: any[]; replays: DrawingReplay[] } | null>(null);

  const [playerId, setPlayerId] = useState<string>(getOrCreatePlayerId);

  useEffect(() => {
    // In dev, connect to port 3001, or custom VITE_SERVER_URL, or fallback to current origin
    const serverUrl =
      import.meta.env.VITE_SERVER_URL ||
      (import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin);
    const socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      console.log('Connected to Pictionary server:', socket.id);

      const urlParams = new URLSearchParams(window.location.search);
      const isForceNew =
        urlParams.get('new') === '1' ||
        urlParams.get('reset') === '1' ||
        urlParams.get('test') === '1';

      // Auto-reconnect ONLY if the user had actively joined in THIS window (e.g. F5 page refresh),
      // and NOT when opening a test or fresh link in a second window.
      const isJoined = sessionStorage.getItem('pictionary_joined') === '1';
      const savedRoom = sessionStorage.getItem('pictionary_room_id');
      const savedName = localStorage.getItem('pictionary_player_name');
      const savedAvatar = localStorage.getItem('pictionary_player_avatar') || '#2563eb';
      const currentPid = sessionStorage.getItem('pictionary_player_id');

      if (!isForceNew && isJoined && savedRoom && savedName && currentPid) {
        socket.emit('join_room', {
          roomId: savedRoom,
          playerId: currentPid,
          name: savedName,
          avatar: savedAvatar,
        });
      }
    });

    socket.on('disconnect', () => {
      setConnected(false);
      console.log('Disconnected from server');
    });

    socket.on('room_state', (state: ClientRoomState) => {
      const turnKey = `${state.currentRound}_${state.currentDrawerId || ''}`;
      // When moving to word selection, returning to lobby, or when turn advances, clear canvas history
      if (state.state === 'SELECTING_WORD' || state.state === 'LOBBY') {
        setCanvasHistory([]);
      } else if (state.state === 'DRAWING' && currentTurnRef.current !== turnKey) {
        setCanvasHistory([]);
      }
      currentTurnRef.current = turnKey;

      setRoomState(state);
      sessionStorage.setItem('pictionary_room_id', state.roomId);
      if (state.state !== 'ROUND_REVEAL') {
        setRoundReveal(null);
      }
    });

    socket.on('canvas_history', (history: StrokeAction[]) => {
      setCanvasHistory(history || []);
    });

    socket.on('draw_stroke', (stroke: StrokeAction) => {
      setCanvasHistory((prev) => [...prev, stroke]);
    });

    socket.on('draw_fill', (fillAction: StrokeAction) => {
      setCanvasHistory((prev) => [...prev, fillAction]);
    });

    socket.on('clear_canvas', () => {
      setCanvasHistory([]);
    });

    socket.on('chat_message', (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on('chat_rate_limited', (data: { reason?: string }) => {
      setRateLimitWarning(data.reason || 'You are sending messages too quickly.');
      setTimeout(() => setRateLimitWarning(null), 3000);
    });

    socket.on('guess_correct', (data: { scoreAwarded: number }) => {
      setToastMessage(`🎉 Correct! You scored +${data.scoreAwarded} points!`);
      setTimeout(() => setToastMessage(null), 3500);
    });

    socket.on('hint_update', (data: { mask: string }) => {
      setRoomState((prev) => (prev ? { ...prev, wordMask: data.mask } : null));
    });

    socket.on('round_reveal', (data: { word: string; scores: { id: string; name: string; score: number }[] }) => {
      setRoundReveal(data);
    });

    socket.on('game_over', (data: { podium: any[]; replays: DrawingReplay[] }) => {
      setGameOverData(data);
    });

    socket.on('session_info', (data: { playerId: string }) => {
      setPlayerId(data.playerId);
      sessionStorage.setItem('pictionary_player_id', data.playerId);
    });

    socket.on('error_message', (data: { message: string }) => {
      sessionStorage.removeItem('pictionary_joined');
      sessionStorage.removeItem('pictionary_room_id');
      alert(data.message);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const joinRoom = useCallback((roomId: string | undefined, name: string, avatar: string) => {
    if (!socketRef.current) return;
    sessionStorage.setItem('pictionary_joined', '1');
    if (roomId) {
      sessionStorage.setItem('pictionary_room_id', roomId);
    }
    socketRef.current.emit('join_room', {
      roomId,
      playerId,
      name,
      avatar,
    });
  }, [playerId]);

  const leaveRoom = useCallback(() => {
    sessionStorage.removeItem('pictionary_joined');
    sessionStorage.removeItem('pictionary_room_id');
    socketRef.current?.emit('leave_room');
    setRoomState(null);
  }, []);

  const updateSettings = useCallback((roomId: string, settings: Partial<RoomSettings>) => {
    socketRef.current?.emit('update_settings', { roomId, settings });
  }, []);

  const startGame = useCallback((roomId: string) => {
    socketRef.current?.emit('start_game', { roomId });
    setCanvasHistory([]);
  }, []);

  const returnToLobby = useCallback((roomId: string) => {
    socketRef.current?.emit('return_to_lobby', { roomId });
    setCanvasHistory([]);
    setGameOverData(null);
  }, []);

  const selectWord = useCallback((roomId: string, word: string) => {
    socketRef.current?.emit('select_word', { roomId, word });
    setCanvasHistory([]);
  }, []);

  const drawStroke = useCallback((stroke: StrokeAction) => {
    socketRef.current?.emit('draw_stroke', stroke);
    setCanvasHistory((prev) => [...prev, stroke]);
  }, []);

  const drawFill = useCallback((fillAction: StrokeAction) => {
    socketRef.current?.emit('draw_fill', fillAction);
    setCanvasHistory((prev) => [...prev, fillAction]);
  }, []);

  const undoStroke = useCallback(() => {
    socketRef.current?.emit('undo_stroke');
  }, []);

  const clearCanvas = useCallback(() => {
    socketRef.current?.emit('clear_canvas');
    setCanvasHistory([]);
  }, []);

  const sendMessage = useCallback((text: string) => {
    socketRef.current?.emit('send_message', { text });
  }, []);

  return {
    connected,
    playerId,
    roomState,
    messages,
    canvasHistory,
    toastMessage,
    rateLimitWarning,
    roundReveal,
    gameOverData,
    joinRoom,
    leaveRoom,
    updateSettings,
    startGame,
    returnToLobby,
    selectWord,
    drawStroke,
    drawFill,
    undoStroke,
    clearCanvas,
    sendMessage,
    setGameOverData,
  };
}
