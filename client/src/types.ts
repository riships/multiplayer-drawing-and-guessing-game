export type GameState = 'LOBBY' | 'SELECTING_WORD' | 'DRAWING' | 'ROUND_REVEAL' | 'GAME_OVER';

export interface RoomSettings {
  rounds: number;
  drawTime: number;
  wordPack: 'standard' | 'animals' | 'food' | 'technology' | 'custom';
  customWords?: string[];
}

export interface Player {
  id: string;
  socketId: string;
  name: string;
  avatar: string;
  score: number;
  isHost: boolean;
  hasGuessed: boolean;
  isDrawing: boolean;
  connected: boolean;
  disconnectedAt?: number;
}

export type StrokePoint = {
  x: number;
  y: number;
};

export interface StrokeAction {
  id: string;
  type: 'stroke' | 'fill' | 'clear';
  color?: string;
  size?: number;
  points?: StrokePoint[];
  point?: StrokePoint;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  senderId?: string;
  senderName: string;
  text: string;
  type: 'normal' | 'system' | 'correct' | 'close';
  timestamp: number;
}

export interface DrawingReplay {
  round: number;
  turn: number;
  word: string;
  drawerId: string;
  drawerName: string;
  actions: StrokeAction[];
}

export interface ClientRoomState {
  roomId: string;
  state: GameState;
  settings: RoomSettings;
  players: Player[];
  currentRound: number;
  totalRounds: number;
  currentDrawerId: string | null;
  timeLeft: number;
  wordMask: string | null;
  wordLength: number | null;
  wordOptions?: string[];
  secretWord?: string;
  replays?: DrawingReplay[];
}

export type DrawTool = 'pen' | 'eraser' | 'fill';
