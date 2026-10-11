import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { logger } from '../utils/logger.util';

describe('Logger Utility', () => {
  it('calls info, warn, and error without throwing', () => {
    assert.doesNotThrow(() => logger.info('Test info message', { key: 'value' }));
    assert.doesNotThrow(() => logger.warn('Test warning message'));
    assert.doesNotThrow(() => logger.error('Test error message', new Error('test')));
  });

  it('handles debug logging in development and production modes', () => {
    const originalEnv = process.env.NODE_ENV;

    process.env.NODE_ENV = 'development';
    assert.doesNotThrow(() => logger.debug('Test debug dev message'));

    process.env.NODE_ENV = 'production';
    assert.doesNotThrow(() => logger.debug('Test debug prod message'));

    process.env.NODE_ENV = originalEnv;
  });
});
