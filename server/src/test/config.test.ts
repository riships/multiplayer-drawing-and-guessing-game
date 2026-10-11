import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, CONFIG } from '../config';

describe('Configuration Module', () => {
  it('loads default values when env vars are missing', () => {
    const config = loadConfig({});
    assert.strictEqual(config.PORT, 3001);
    assert.strictEqual(config.CORS_ORIGIN, '*');
    assert.strictEqual(config.DEFAULT_SETTINGS.ROUNDS, 3);
  });

  it('loads custom values when env vars are provided', () => {
    const config = loadConfig({ PORT: '8080', CORS_ORIGIN: 'http://test.local' });
    assert.strictEqual(config.PORT, 8080);
    assert.strictEqual(config.CORS_ORIGIN, 'http://test.local');
  });

  it('exports singleton CONFIG instance', () => {
    assert.ok(CONFIG);
    assert.strictEqual(typeof CONFIG.PORT, 'number');
  });
});
