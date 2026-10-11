# Pictionary Live — Technical Design Notes

**Full Stack Assignment · Question 1**

This document describes how Pictionary Live synchronizes drawings between players, handles latency and reconnects, estimates server capacity, and packages the application for deployment.

The main goal is to keep drawing responsive for the person drawing while making sure the rest of the room sees the same canvas.

---

## 1. Canvas Synchronization and Stroke Streaming

### Architecture overview

Pictionary Live uses a **server-authoritative model with optimistic rendering on the drawing client**.

When the drawer moves the pointer, the client draws the stroke locally instead of waiting for a server response. It also sends the stroke points to the Express server over Socket.IO. The server validates each action, applies rate limits, stores it in the current round's history, and broadcasts it to the other players.

This approach keeps the drawing experience responsive while leaving the server responsible for the official canvas state.

```text
Active drawer
  ├─ Renders the stroke immediately
  └─ Sends normalized stroke points
             |
             v
       Express server
       - Validates events
       - Applies rate limits
       - Stores stroke history
             |
             v
       Broadcasts draw_stroke
             |
             v
       Other players
       - Receive stroke updates
       - Render the strokes
```

### Coordinate normalization and resolution independence

In a real-time collaborative canvas, participants operate across heterogeneous display environments with varying screen resolutions, aspect ratios, CSS viewport scales, and device pixel ratios (DPR). If the client streamed raw pixel coordinates, strokes would clip, drift, or appear distorted on devices with different geometry.

To achieve geometric invariance across all clients, the system applies **canonical coordinate projection**:

- **Dimensionless Canonical Space:** The drawing surface is modeled as a resolution-independent unit bounding space where every point exists as a normalized coordinate pair between `0.0` and `1.0`. Rather than recording physical pixel positions, each point represents an abstract ratio of the total canvas width and height.
- **Affine Ingress Mapping:** As the drawer moves the pointer, the client translates raw screen events into this unit space by computing their proportional offset relative to the canvas's active bounding rectangle.
- **Virtual Rasterization Plane:** When guesser clients receive stroke updates, they project the normalized ratios onto a fixed internal virtual drawing matrix (`1000 × 650`). The browser then scales this reference matrix to fit the user's local viewport using aspect-ratio-preserving CSS transforms.

This projection decouples input hardware geometry from display rasterization, guaranteeing that stroke trajectories, brush thickness, and relative spatial alignments remain identical across mobile viewports, tablets, and desktop displays.

### Stroke chunking and event format

Sending every pointer event separately can create unnecessary network traffic. Instead, the client groups points into small batches—typically every four points or around every `16 ms`, which is roughly 60 updates per second.

A stroke action can use this structure:

```typescript
interface StrokeAction {
  id: string;
  type: 'stroke' | 'fill' | 'clear';
  color?: string; // Hex color
  size?: number; // Brush radius
  points?: { x: number; y: number }[]; // Normalized coordinates
  point?: { x: number; y: number }; // Flood-fill seed point
  timestamp: number;
}
```

### Players who join during a round

A player who joins after drawing has started needs to see the existing canvas. The server keeps a `strokeHistory: StrokeAction[]` for the active turn and sends the history as `canvas_history` during the `join_room` handshake.

The new player's client replays those actions in order to reconstruct the current drawing. This means the drawer does not have to repeat the work for someone who joins late.

---

## 2. Latency, Ordering, and Smooth Rendering

### Render locally first

The drawer should see a line appear immediately, without waiting for a network round trip. The client therefore draws directly to the HTML5 Canvas 2D context using `requestAnimationFrame`, then emits the corresponding Socket.IO event.

The event is sent asynchronously. The drawer can continue drawing without waiting for the server to acknowledge every small batch.

### Keep actions in order

WebSocket traffic runs over TCP, which preserves packet order on an individual connection. Actions such as drawing, undo, and clear still need to be applied consistently across all players.

The server assigns a sequence index to each accepted action and records the client's timestamp. When an `undo` event arrives, the server removes the most recent action from `strokeHistory` and broadcasts the updated history—or an undo event with the relevant index—to the room.

Each client then clears its canvas and redraws the remaining actions. The design targets a redraw time below `5 ms`, though the actual time depends on the device and the amount of drawing history.

### Reduce visible jitter

Network timing and browser event scheduling can make incoming lines look uneven. Clients can connect points using rounded line caps and joins, then smooth the path with quadratic curves between successive points.

This helps the drawing look continuous, although it does not remove the underlying network delay.

---

## 3. Server Restarts and Recovery

### What happens in the current setup?

In the current single-instance design, room data, player scores, turn information, and active strokes live in the Node.js process's memory, using a structure such as `Map<string, RoomData>`.

If the process stops unexpectedly:

1. Active WebSocket connections drop.
2. Socket.IO clients attempt to reconnect, with up to 20 attempts and backoff between attempts.
3. The server's in-memory state is lost. Players may need to re-enter the lobby or recreate the room.

This is a reasonable starting point for a single-instance implementation, but it does not preserve an active game through a process crash.

### A production recovery approach

For better recovery, room state could be stored in Redis instead of relying only on process memory.

One possible structure is:

- **Room metadata and scores:** Redis hashes such as `room:<id>`.
- **Stroke history:** Redis lists or streams such as `room:<id>:strokes`.
- **Temporary disconnect state:** keys with a 30-second expiry, for example `room:<id>:disconnect:<playerId>`.

When a server instance restarts or another instance takes over, it can load the saved room state from Redis. A reconnecting client can send its persistent `playerId` from `localStorage`, allowing the server to restore the player's session, score, current turn, and canvas history.

This is a proposed production design. The Redis persistence and recovery behavior would still need to be implemented and tested.

---

## 4. Estimating Capacity and Measuring Performance

Capacity depends on more than RAM or network bandwidth. It also depends on how frequently players draw, the size of each update, and how much work the server performs when broadcasting an event.

The figures below come from the original design notes. They should be treated as estimates and reported test results, not as universal guarantees.

### Assumptions for one room

For this model, each room has eight players: one drawer and seven guessers.

| Measure | Working assumption |
|---|---:|
| Stroke updates | About 15–25 packets per second |
| Average packet size | About 250 bytes |
| Recipients per stroke update | 7 players |
| Estimated room ingress | About 5 KB/s |
| Estimated room egress | About 35 KB/s |
| Chat and system-event traffic | About 2 KB/s |
| **Estimated total egress per room** | **About 40 KB/s (0.32 Mbps)** |

Using roughly 20 stroke packets per second, the incoming stroke traffic is about `5 KB/s`. Sending those updates to seven other players results in about `35 KB/s` of outgoing stroke traffic, before chat and system events are included.

### What might limit a server?

The original model uses a reference machine with four vCPUs and 8 GB RAM.

**Memory**

- Estimated socket overhead: `10 KB` per connected socket.
- Estimated room state and stroke history: `150 KB` per room, based on around 500 strokes per round.
- Eight sockets plus room state: approximately `230 KB` per room.

Under these assumptions, memory alone could hold many thousands of mostly idle rooms. That does not mean the same server can support that many active rooms smoothly.

**Network**

Assuming a 1 Gbps network interface and using 70% of its capacity as a practical target:

\[
\frac{1000\text{ Mbps} \times 0.70}{0.32\text{ Mbps per room}}
\approx 2{,}187 \text{ rooms}
\]

This is a theoretical bandwidth estimate, not a measured production limit.

**CPU and event-loop work**

The Node.js process parses events, updates room state, and sends updates to other players. The original estimate assumes a processing rate of roughly 40,000 packets per second before event-loop delay exceeds 20 ms.

At about 140 outbound packet deliveries per room per second (`20 updates × 7 recipients`), that gives an estimate of around 285 active rooms per core, or around 1,140 rooms across four cores if the work scales evenly.

Actual results depend on the application, hardware, message sizes, and traffic patterns.

### Load-test method

The project notes describe a multiplayer stress runner at `server/scripts/stress-test.ts`, launched with `npm run test:stress`.

Example command:

```bash
npm run test:stress -- --rooms 10 --players 4 --duration 10 --draw-hz 30
```

The test uses `socket.io-client` to create real Socket.IO connections. A host client streams normalized drawing points at 30 Hz, while other clients receive updates and periodically send chat guesses.

The original notes report these results:

- **Transit latency:** With five concurrent rooms and 15 sockets at a 30 Hz drawing rate, median latency was reported as 1 ms, p95 as 2 ms, and p99 as 4 ms, with no packet errors.
- **Throughput:** More than 205 events per second for the tested small room cluster.
- **Event-loop latency:** Below 15 ms up to 850 active rooms in the reported test; above 80 ms at 1,200 rooms on a single core.
- **Memory:** About 1.2 GB at 800 active rooms.
- **WebSocket drops:** No packet loss was reported below 1,000 active rooms.

These are the results stated in the existing notes. Before using them as production capacity claims, rerun the tests on the target hardware and document the conditions so the results can be reproduced.

### Possible next optimizations

If profiling shows that broadcasting is the bottleneck, consider using Redis Pub/Sub to distribute events across server instances and a compact binary format such as Protocol Buffers or MessagePack instead of JSON.

The original notes estimate that binary framing could reduce payload size by 60%, but that improvement should be measured using the application's actual event schema and traffic.

---

## 5. Docker Packaging and Deployment

The frontend and backend are packaged as separate Docker images. Multi-stage builds keep build tools out of the final runtime images and make deployments more consistent across development machines, cloud VMs, and other Docker hosts.

### Deployment layout

```text
Docker Compose
├── pictionary-client
│   ├── Nginx Alpine
│   ├── Serves the built React/Vite frontend
│   ├── Compresses and caches static assets
│   └── Proxies API and Socket.IO requests
│
└── pictionary-server
    ├── Node.js 22 Alpine
    ├── Express and Socket.IO
    ├── Authoritative game state
    ├── Listens on port 3001
    └── Includes a health check
```

The client container serves the production frontend on port 80. During development, the client may use port 5173. Nginx forwards `/socket.io/` and `/api/` requests to the backend over the internal Docker network, allowing the browser to use a single origin.

### Backend image

The backend Dockerfile is at `server/Dockerfile`.

- **Build stage:** Uses `node:22-alpine` to compile TypeScript into `/app/dist`.
- **Runtime stage:** Installs production dependencies with `npm ci --omit=dev`.
- **Runtime user:** Runs as the non-root `node` user.
- **Port:** Exposes port 3001.
- **Health check:** Runs `wget -q --spider http://127.0.0.1:3001/health`.

Room state remains in memory in this design. Containerization by itself does not make that state persistent across a restart.

### Frontend image

The frontend Dockerfile is at `client/Dockerfile`.

- **Build stage:** Uses `node:22-alpine` to create the Vite production bundle.
- **Runtime stage:** Uses `nginx:1.27-alpine` to serve the built files.
- **Reverse proxy:** Forwards `/socket.io/` and `/api/` to the backend on the internal Docker network.
- **Health check:** Runs `wget -q --spider http://127.0.0.1:80/`.

The original notes estimate compressed image sizes of about 21 MB for the Nginx frontend and 63 MB for the Node.js backend. Actual sizes depend on the final build and image layers.

### Deployment commands

Build the images and start the stack in the background:

```bash
docker compose up --build -d
```

The project also documents these npm scripts:

```bash
npm run docker:up
npm run docker:down
```

Check the running services:

```bash
docker compose ps
```

Follow the logs:

```bash
docker compose logs -f
```

Stop the stack without deleting persistent volumes:

```bash
docker compose down
```

Run these commands from the directory containing the Compose file. The service names, ports, and npm scripts should match the configuration checked into the repository.

---

## Summary

The current design makes drawing responsive by rendering strokes locally and sending normalized point batches to a server that controls the room's official state. Stored stroke history allows late joiners to reconstruct the canvas, while Redis is a possible next step for recovering room state after a restart and supporting multiple server instances.

Docker Compose packages the frontend and backend as separate services. The capacity estimates provide a starting point for planning, but the reported limits should be confirmed with repeatable tests on the hardware and configuration intended for production.

---

## 7. Sample Recordings & Verification Artifacts

End-to-end multi-client browser session recordings validating stroke streaming, coordination, turn progression, and canvas resets:

- 🎬 **[Primary Walkthrough Video Demo (`sample-recording.mp4`)](../sample-recording.mp4)**: Complete walkthrough demonstration recording showcasing 3-player multiplayer room creation, joining, word selection, drawing, chat guesses, hint reveal, and match completion.
- **[Multiplayer Stroke Streaming Demo (`docs/recordings/drawing_demo.webp`)](./recordings/drawing_demo.webp)**: Validates real-time continuous drawing, coordinate normalization, and hybrid throttling.
- **[Turn Progression & Canvas Clearing Demo (`docs/recordings/canvas_clear_and_turn_flow.webp`)](./recordings/canvas_clear_and_turn_flow.webp)**: Validates word selection, guess masking, round intermission, and the automatic canvas wipe on new turn start.
