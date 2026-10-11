import { io, Socket } from 'socket.io-client';

interface StressTestOptions {
  url: string;
  roomsCount: number;
  playersPerRoom: number;
  durationSeconds: number;
  drawingHz: number;
}

interface LatencyRecord {
  rttMs: number;
  timestamp: number;
}

interface TestMetrics {
  totalSent: number;
  totalReceived: number;
  strokeEventsSent: number;
  strokeEventsReceived: number;
  chatEventsSent: number;
  chatEventsReceived: number;
  errorsCount: number;
  latencies: number[];
}

function parseCommandLineArgs(): StressTestOptions {
  const args = process.argv.slice(2);
  const options: StressTestOptions = {
    url: 'http://localhost:3001',
    roomsCount: 5,
    playersPerRoom: 4,
    durationSeconds: 10,
    drawingHz: 30,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--url' && args[i + 1]) {
      options.url = args[++i];
    } else if (arg === '--rooms' && args[i + 1]) {
      options.roomsCount = parseInt(args[++i], 10);
    } else if (arg === '--players' && args[i + 1]) {
      options.playersPerRoom = parseInt(args[++i], 10);
    } else if (arg === '--duration' && args[i + 1]) {
      options.durationSeconds = parseInt(args[++i], 10);
    } else if (arg === '--draw-hz' && args[i + 1]) {
      options.drawingHz = parseInt(args[++i], 10);
    }
  }

  return options;
}

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    Math.floor((percentile / 100) * sorted.length),
    sorted.length - 1,
  );
  return sorted[index];
}

async function runStressTest(options: StressTestOptions) {
  const { url, roomsCount, playersPerRoom, durationSeconds, drawingHz } = options;
  const totalClients = roomsCount * playersPerRoom;

  console.log('\n===============================================================');
  console.log('       PICTIONARY LIVE - REAL-TIME LOAD & STRESS TEST          ');
  console.log('===============================================================');
  console.log(` Target Server URL:      ${url}`);
  console.log(` Simulated Rooms:        ${roomsCount}`);
  console.log(` Players Per Room:       ${playersPerRoom}`);
  console.log(` Total Concurrent Sockets: ${totalClients}`);
  console.log(` Stroke Stream Rate:     ${drawingHz} Hz (per active room)`);
  console.log(` Test Duration:          ${durationSeconds} seconds`);
  console.log('---------------------------------------------------------------\n');

  const metrics: TestMetrics = {
    totalSent: 0,
    totalReceived: 0,
    strokeEventsSent: 0,
    strokeEventsReceived: 0,
    chatEventsSent: 0,
    chatEventsReceived: 0,
    errorsCount: 0,
    latencies: [],
  };

  const allSockets: Socket[] = [];
  const activeIntervals: NodeJS.Timeout[] = [];

  const startTime = Date.now();
  console.log(`[STRESS] Spawning ${roomsCount} virtual game rooms with ${totalClients} players...`);

  for (let r = 0; r < roomsCount; r++) {
    const roomIndex = r + 1;
    const hostId = `stress_h_${roomIndex}_${Date.now()}`;
    const hostSocket = io(url, {
      transports: ['websocket'],
      forceNew: true,
    });
    allSockets.push(hostSocket);

    let assignedRoomId = '';
    let isDrawing = false;
    const guestSockets: Socket[] = [];

    // Host room creation
    hostSocket.on('connect', () => {
      hostSocket.emit('join_room', {
        playerId: hostId,
        name: `Host_R${roomIndex}`,
        avatar: '#2563eb',
      });
      metrics.totalSent++;
    });

    hostSocket.on('room_state', (state: { roomId: string; state: string; wordOptions?: string[] }) => {
      metrics.totalReceived++;
      if (!assignedRoomId && state.roomId) {
        assignedRoomId = state.roomId;

        // Spawn guest players
        for (let g = 1; g < playersPerRoom; g++) {
          const guestIndex = g;
          const guestId = `stress_g_${roomIndex}_${guestIndex}_${Date.now()}`;
          const guestSocket = io(url, {
            transports: ['websocket'],
            forceNew: true,
          });
          allSockets.push(guestSocket);
          guestSockets.push(guestSocket);

          guestSocket.on('connect', () => {
            guestSocket.emit('join_room', {
              roomId: assignedRoomId,
              playerId: guestId,
              name: `Guesser_${roomIndex}_${guestIndex}`,
              avatar: '#10b981',
            });
            metrics.totalSent++;
          });

          guestSocket.on('draw_stroke', (stroke: { timestamp: number }) => {
            metrics.strokeEventsReceived++;
            metrics.totalReceived++;
            if (stroke.timestamp) {
              const rtt = Math.max(1, Date.now() - stroke.timestamp);
              metrics.latencies.push(rtt);
            }
          });

          guestSocket.on('chat_message', () => {
            metrics.chatEventsReceived++;
            metrics.totalReceived++;
          });

          guestSocket.on('connect_error', () => {
            metrics.errorsCount++;
          });
        }

        // Host starts game after 500ms lobby sync
        setTimeout(() => {
          hostSocket.emit('start_game', { roomId: assignedRoomId });
          metrics.totalSent++;
        }, 500);
      }

      // If drawer needs to select word
      if (state.state === 'SELECTING_WORD' && state.wordOptions && state.wordOptions.length > 0) {
        hostSocket.emit('select_word', {
          roomId: assignedRoomId,
          word: state.wordOptions[0],
        });
        metrics.totalSent++;
      }

      if (state.state === 'DRAWING' && !isDrawing) {
        isDrawing = true;

        // High-frequency stroke streaming loop (e.g. 30 Hz)
        const strokeIntervalMs = Math.max(16, Math.floor(1000 / drawingHz));
        let step = 0;

        const strokeTimer = setInterval(() => {
          if (!hostSocket.connected) return;
          step = (step + 1) % 100;
          const normX = Number((Math.sin(step / 10) * 0.4 + 0.5).toFixed(3));
          const normY = Number((Math.cos(step / 10) * 0.4 + 0.5).toFixed(3));

          const strokePayload = {
            id: `st_${roomIndex}_${Date.now()}_${step}`,
            type: 'stroke',
            color: '#2563eb',
            size: 4,
            points: [
              { x: normX, y: normY },
              { x: Number((normX + 0.01).toFixed(3)), y: Number((normY + 0.01).toFixed(3)) },
            ],
            timestamp: Date.now(),
          };

          hostSocket.emit('draw_stroke', strokePayload);
          metrics.strokeEventsSent++;
          metrics.totalSent++;
        }, strokeIntervalMs);

        activeIntervals.push(strokeTimer);

        // Guessers periodically submit guesses every 1.5 seconds
        for (const guest of guestSockets) {
          const guessWords = ['apple', 'castle', 'guitar', 'cat', 'tree', 'sun'];
          let guessIndex = 0;
          const chatTimer = setInterval(() => {
            if (!guest.connected) return;
            const word = guessWords[guessIndex % guessWords.length];
            guessIndex++;
            guest.emit('send_message', { text: word });
            metrics.chatEventsSent++;
            metrics.totalSent++;
          }, 1500);
          activeIntervals.push(chatTimer);
        }
      }
    });

    hostSocket.on('connect_error', () => {
      metrics.errorsCount++;
    });
  }

  // Live progress report
  const progressInterval = setInterval(() => {
    const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
    const percent = Math.min(100, Math.floor((elapsedSec / durationSeconds) * 100));
    process.stdout.write(
      `\r [PROGRESS] Running... ${percent}% (${elapsedSec}s/${durationSeconds}s) | Sent: ${metrics.totalSent} | Received: ${metrics.totalReceived} | Latency p50: ${calculatePercentile(metrics.latencies, 50)}ms`,
    );
  }, 1000);

  // Wait for test duration
  await new Promise((resolve) => setTimeout(resolve, durationSeconds * 1000));

  clearInterval(progressInterval);
  for (const interval of activeIntervals) {
    clearInterval(interval);
  }

  // Disconnect all sockets
  for (const sock of allSockets) {
    sock.disconnect();
  }

  const totalTimeSeconds = (Date.now() - startTime) / 1000;
  const throughput = Math.round(metrics.totalReceived / totalTimeSeconds);
  const minLatency = metrics.latencies.length > 0 ? Math.min(...metrics.latencies) : 0;
  const maxLatency = metrics.latencies.length > 0 ? Math.max(...metrics.latencies) : 0;
  const avgLatency =
    metrics.latencies.length > 0
      ? Math.round(metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length)
      : 0;
  const p50 = calculatePercentile(metrics.latencies, 50);
  const p95 = calculatePercentile(metrics.latencies, 95);
  const p99 = calculatePercentile(metrics.latencies, 99);

  console.log('\n\n===============================================================');
  console.log('                     STRESS TEST RESULTS                       ');
  console.log('===============================================================');
  console.log(` Concurrent Rooms:             ${roomsCount}`);
  console.log(` Concurrent Connected Sockets: ${allSockets.length}`);
  console.log(` Total Test Duration:          ${totalTimeSeconds.toFixed(2)} seconds`);
  console.log(` Total Events Emitted:         ${metrics.totalSent}`);
  console.log(` Total Events Dispatched:      ${metrics.totalReceived}`);
  console.log(` Total Stroke Chunks Sent:     ${metrics.strokeEventsSent}`);
  console.log(` Total Stroke Chunks Received: ${metrics.strokeEventsReceived}`);
  console.log(` Total Chat Guesses Sent:      ${metrics.chatEventsSent}`);
  console.log(` Event Loop Throughput:        ${throughput} events/sec`);
  console.log('---------------------------------------------------------------');
  console.log(' LATENCY BENCHMARKS (Round-Trip Transit Time):');
  console.log(`   Min Latency:                ${minLatency} ms`);
  console.log(`   Mean Latency:               ${avgLatency} ms`);
  console.log(`   p50 (Median) Latency:       ${p50} ms`);
  console.log(`   p95 Latency:                ${p95} ms`);
  console.log(`   p99 Latency:                ${p99} ms`);
  console.log(`   Max Latency:                ${maxLatency} ms`);
  console.log('---------------------------------------------------------------');
  console.log(` Connection / Packet Errors:   ${metrics.errorsCount}`);

  const passed = metrics.errorsCount === 0 && (metrics.latencies.length === 0 || p95 < 150);
  console.log(` System Health Evaluation:     ${passed ? 'PASS (HEALTHY / LOW LATENCY)' : 'WARNING / DEGRADED'}`);
  console.log('===============================================================\n');

  process.exit(passed ? 0 : 1);
}

const options = parseCommandLineArgs();
runStressTest(options).catch((err) => {
  console.error('[STRESS TEST ERROR]:', err);
  process.exit(1);
});
