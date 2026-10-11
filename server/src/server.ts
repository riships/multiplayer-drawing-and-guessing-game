import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createApp } from './app';
import { CONFIG } from './config';
import { initSocketIO } from './sockets';
import { logger } from './utils/logger.util';

export function createServer() {
  const app = createApp();
  const httpServer = http.createServer(app);

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: CONFIG.CORS_ORIGIN,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Attach functional socket controllers
  initSocketIO(io);

  return { app, httpServer, io };
}

export function startServer(port: number = CONFIG.PORT): http.Server & { io: SocketIOServer } {
  const { httpServer, io } = createServer();

  httpServer.listen(port, () => {
    logger.info(`🎨 Pictionary Live Express Server is running on http://localhost:${port}`);
    logger.info(`🔌 Socket.IO engine attached and listening for real-time multiplayer events.`);
  });

  const serverWithIo = httpServer as http.Server & { io: SocketIOServer };
  serverWithIo.io = io;
  return serverWithIo;
}

export function bootstrap(
  isMain = require.main === module,
  port: number = CONFIG.PORT,
): (http.Server & { io: SocketIOServer }) | undefined {
  if (isMain) {
    return startServer(port);
  }
  return undefined;
}

// Auto-start server when executed as main entry
bootstrap();
