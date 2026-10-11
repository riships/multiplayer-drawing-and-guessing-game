export function loadConfig(env: Record<string, string | undefined> = process.env) {
  return {
    PORT: env.PORT ? parseInt(env.PORT, 10) : 3001,
    CORS_ORIGIN: env.CORS_ORIGIN || '*',
    TIMERS: {
      WORD_SELECTION_SECONDS: 15,
      REVEAL_INTERMISSION_MS: 4000,
      DRAWER_DISCONNECT_GRACE_MS: 5000,
      PLAYER_RECONNECT_GRACE_MS: 30000,
    },
    RATE_LIMITS: {
      CHAT_WINDOW_MS: 2000,
      MAX_CHAT_PER_WINDOW: 3,
      MAX_CHAT_LENGTH: 100,
      STROKE_WINDOW_MS: 1000,
      MAX_STROKES_PER_SECOND: 60,
      MAX_POINTS_PER_CHUNK: 60,
    },
    DEFAULT_SETTINGS: {
      ROUNDS: 3,
      DRAW_TIME: 60,
      WORD_PACK: 'standard' as const,
    },
  };
}

export const CONFIG = loadConfig();
