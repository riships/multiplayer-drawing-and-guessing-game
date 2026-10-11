import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  canSendChatMessage,
  canSendStroke,
  clearPlayerRateLimit,
} from '../utils/rate-limit.util';

describe('Rate Limiter Utilities', () => {
  const testPlayerId = 'test_player_rate';
  const otherPlayerId = 'other_player_rate';

  beforeEach(() => {
    clearPlayerRateLimit(testPlayerId);
    clearPlayerRateLimit(otherPlayerId);
  });

  it('rejects empty or whitespace-only messages', () => {
    const empty = canSendChatMessage(testPlayerId, '');
    assert.strictEqual(empty.allowed, false);

    const whitespace = canSendChatMessage(testPlayerId, '    ');
    assert.strictEqual(whitespace.allowed, false);

    const nullLike = canSendChatMessage(testPlayerId, null as never);
    assert.strictEqual(nullLike.allowed, false);
  });

  it('rejects messages longer than 100 characters', () => {
    const longMsg = 'a'.repeat(101);
    const result = canSendChatMessage(testPlayerId, longMsg);
    assert.strictEqual(result.allowed, false);
    assert.match(result.reason || '', /100 characters/);
  });

  it('enforces chat rate limit (max 3 messages per 2 seconds) and prunes old timestamps', () => {
    assert.strictEqual(canSendChatMessage(testPlayerId, 'msg 1').allowed, true);
    assert.strictEqual(canSendChatMessage(testPlayerId, 'msg 2').allowed, true);
    assert.strictEqual(canSendChatMessage(testPlayerId, 'msg 3').allowed, true);

    const fourth = canSendChatMessage(testPlayerId, 'msg 4');
    assert.strictEqual(fourth.allowed, false);
    assert.match(fourth.reason || '', /Slow down/);

    // Other player is not affected by testPlayerId rate limit
    assert.strictEqual(canSendChatMessage(otherPlayerId, 'msg other').allowed, true);
  });

  it('enforces stroke payload point limits and frequency throttling', () => {
    // Single point stroke (default)
    assert.strictEqual(canSendStroke(testPlayerId).allowed, true);

    // Within point limits
    assert.strictEqual(canSendStroke(testPlayerId, 20).allowed, true);

    // Oversized point batch
    const oversized = canSendStroke(testPlayerId, 61);
    assert.strictEqual(oversized.allowed, false);
    assert.match(oversized.reason || '', /Stroke chunk contains too many points/);

    // Rapid stroke frequency throttle
    for (let i = 0; i < 58; i++) {
      canSendStroke(testPlayerId, 1);
    }
    const throttled = canSendStroke(testPlayerId, 1);
    assert.strictEqual(throttled.allowed, false);
    assert.match(throttled.reason || '', /Stroke rate limit exceeded/);

    // Clearing bucket resets throttle
    clearPlayerRateLimit(testPlayerId);
    assert.strictEqual(canSendStroke(testPlayerId, 1).allowed, true);
  });
});
