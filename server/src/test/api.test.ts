import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { AddressInfo } from 'net';
import { createApp } from '../app';

describe('Express HTTP API & Routing', () => {
  const app = createApp();

  it('express app instance is initialized with routes', () => {
    assert.ok(app);
    assert.strictEqual(typeof app.listen, 'function');
  });

  it('serves GET /health with 200 OK and valid JSON uptime', async () => {
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      assert.strictEqual(res.status, 200);
      const data = await res.json() as { status: string; uptime: number; timestamp: string };
      assert.strictEqual(data.status, 'ok');
      assert.strictEqual(typeof data.uptime, 'number');
      assert.ok(data.timestamp);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('serves GET /api/status with 200 OK and service metadata', async () => {
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/status`);
      assert.strictEqual(res.status, 200);
      const data = await res.json() as { service: string; status: string; version: string; uptime: number };
      assert.strictEqual(data.service, 'pictionary-live-server');
      assert.strictEqual(data.status, 'online');
      assert.strictEqual(data.version, '1.0.0');
      assert.strictEqual(typeof data.uptime, 'number');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
