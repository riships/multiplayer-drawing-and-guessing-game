import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, startServer, bootstrap } from '../server';

describe('Server Bootstrap & Lifecycle', () => {
  it('createServer initializes Express, HTTP, and Socket.IO instances', () => {
    const { app, httpServer, io } = createServer();
    assert.ok(app);
    assert.ok(httpServer);
    assert.ok(io);
    io.close();
  });

  it('startServer listens on an ephemeral port and closes cleanly', async () => {
    const server = startServer(0);
    assert.ok(server);
    assert.ok(server.io);

    await new Promise<void>((resolve) => server.once('listening', resolve));

    await new Promise<void>((resolve) => {
      server.io.close(() => {
        resolve();
      });
    });
  });

  it('bootstrap starts server when isMain is true and skips when false', async () => {
    // When isMain is false
    assert.strictEqual(bootstrap(false), undefined);

    // When isMain is true
    const server = bootstrap(true, 0);
    assert.ok(server);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    await new Promise<void>((resolve) => server.io.close(() => resolve()));
  });
});
