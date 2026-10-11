import { CONFIG } from '../config';

interface PlayerRateBucket {
  chatTimestamps: number[];
  strokeTimestamps: number[];
}

const buckets = new Map<string, PlayerRateBucket>();

function getPlayerBucket(playerId: string): PlayerRateBucket {
  let bucket = buckets.get(playerId);
  if (!bucket) {
    bucket = { chatTimestamps: [], strokeTimestamps: [] };
    buckets.set(playerId, bucket);
  }
  return bucket;
}

/**
 * Functional validation: Enforces max 3 chat messages per 2 seconds, and max 100 chars
 */
export function canSendChatMessage(
  playerId: string,
  text: string,
): { allowed: boolean; reason?: string } {
  if (!text || text.trim().length === 0) {
    return { allowed: false, reason: 'Message cannot be empty.' };
  }
  if (text.length > CONFIG.RATE_LIMITS.MAX_CHAT_LENGTH) {
    return { allowed: false, reason: `Message exceeds maximum ${CONFIG.RATE_LIMITS.MAX_CHAT_LENGTH} characters.` };
  }

  const now = Date.now();
  const bucket = getPlayerBucket(playerId);

  // Filter timestamps within rate limit window
  bucket.chatTimestamps = bucket.chatTimestamps.filter(
    (t) => now - t < CONFIG.RATE_LIMITS.CHAT_WINDOW_MS,
  );

  if (bucket.chatTimestamps.length >= CONFIG.RATE_LIMITS.MAX_CHAT_PER_WINDOW) {
    return { allowed: false, reason: 'Slow down! Rate limit is 3 messages per 2 seconds.' };
  }

  bucket.chatTimestamps.push(now);
  return { allowed: true };
}

/**
 * Functional validation: Enforces max 60 stroke events per second, max 60 points per chunk
 */
export function canSendStroke(
  playerId: string,
  pointsCount = 1,
): { allowed: boolean; reason?: string } {
  if (pointsCount > CONFIG.RATE_LIMITS.MAX_POINTS_PER_CHUNK) {
    return { allowed: false, reason: 'Stroke chunk contains too many points.' };
  }

  const now = Date.now();
  const bucket = getPlayerBucket(playerId);

  // Filter timestamps within stroke window (1000 ms)
  bucket.strokeTimestamps = bucket.strokeTimestamps.filter(
    (t) => now - t < CONFIG.RATE_LIMITS.STROKE_WINDOW_MS,
  );

  if (bucket.strokeTimestamps.length >= CONFIG.RATE_LIMITS.MAX_STROKES_PER_SECOND) {
    return { allowed: false, reason: 'Stroke rate limit exceeded.' };
  }

  bucket.strokeTimestamps.push(now);
  return { allowed: true };
}

/**
 * Clears rate limiting bucket for disconnected or departed player
 */
export function clearPlayerRateLimit(playerId: string): void {
  buckets.delete(playerId);
}
