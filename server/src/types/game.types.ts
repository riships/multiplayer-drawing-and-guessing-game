export type GameState = 'LOBBY' | 'SELECTING_WORD' | 'DRAWING' | 'ROUND_REVEAL' | 'GAME_OVER';

export interface RoomSettings {
  rounds: number;
  drawTime: number; // in seconds
  wordPack: 'standard' | 'animals' | 'food' | 'technology' | 'custom';
  customWords?: string[];
}

export interface Player {
  id: string; // Persistent UUID stored in client localStorage
  socketId: string;
  name: string;
  avatar: string; // Color or emoji avatar
  score: number;
  isHost: boolean;
  hasGuessed: boolean;
  isDrawing: boolean;
  connected: boolean;
  disconnectedAt?: number;
}

export type StrokePoint = {
  x: number; // Normalized 0.0 - 1.0
  y: number; // Normalized 0.0 - 1.0
};

export interface StrokeAction {
  id: string;
  type: 'stroke' | 'fill' | 'clear';
  color?: string;
  size?: number;
  points?: StrokePoint[];
  point?: StrokePoint; // For fill coordinates
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

export interface TurnSummary {
  word: string;
  drawerId: string;
  drawerName: string;
  guessers: { playerId: string; name: string; scoreAwarded: number }[];
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
  wordMask: string | null; // e.g. "_ _ a _ _" or null
  wordLength: number | null;
  wordOptions?: string[]; // ONLY sent to the active drawer
  secretWord?: string; // ONLY sent during ROUND_REVEAL or GAME_OVER
  replays?: DrawingReplay[];
}

export interface RoomData {
  id: string;
  settings: RoomSettings;
  state: GameState;
  players: Map<string, Player>; // Keyed by persistent playerId
  currentRound: number;
  totalRounds: number;
  currentDrawerIndex: number;
  currentDrawerId: string | null;
  drawerTurnOrder: string[]; // List of playerIds for turn rotation
  secretWord: string | null;
  wordOptions: string[];
  revealedIndices: Set<number>;
  turnTimeLeft: number;
  roundTimer: NodeJS.Timeout | null;
  graceTimer: NodeJS.Timeout | null;
  intermissionTimer: NodeJS.Timeout | null;
  strokeHistory: StrokeAction[];
  replays: DrawingReplay[];
  turnStartTime: number;
}
