# Serverless WebRTC Architecture

Cross-platform multiplayer via a star-topology WebRTC data channel mesh with a Cloudflare Worker signaling relay. No game logic runs in the cloud.

## Overview

```
┌────────────────┐         WebSocket          ┌────────────────────┐
│  Mobile Host   │◄─────── signaling ────────►│  Cloudflare Worker │
│  (Expo/RN)     │                            │  (relay only)      │
└───────┬────────┘                            └────────────────────┘
        │
        │  RTCDataChannel (per guest)
        │
   ┌────┴────┬──────────┐
   ▼         ▼          ▼
 Guest 1  Guest 2   Guest N
```

## Architecture

### Star Topology
- **Host** holds one `RTCPeerConnection` per guest
- Guests connect **only** to the host
- Host runs the authoritative `HostGameEngine` instance
- All game events flow host↔guest over DataChannels
- The signaling Worker is silent after connection

### Cloudflare Worker (Signaling)
- **Relay only** — no game logic, no state persistence
- In-memory room registry with TTL cleanup (10 min)
- Handles: `create_room`, `join_room`, `leave_room`, `signal`, `ping`
- Documented Durable Objects path for production (see below)

### Shared Code (`shared/`)
- Platform-independent TypeScript: types, game engine, scoring, validation
- Consumed by mobile (Metro `watchFolders`), Worker (relative imports), and tests
- `HostGameEngine` — host-authoritative, processes commands, produces `Outbound[]` events
- `clientView` — pure reducer applied on all devices for local UI state
- `GameTransport` — interface swapable between SocketIO (web) and WebRTC (mobile)

### Word Deck
- 183KB JSON bundled in the mobile app (`mobile/assets/wordDatabase.json`)
- **Never transmitted** over the network
- Current card sent only to the describer via targeted messages

## Protocol

### Signaling Messages
```
Client → Worker: create_room, join_room, leave_room, signal (SDP/ICE), ping
Worker → Client: room_created, room_joined, room_full, peer_joined, peer_left, signal, error, pong
```

### Game Messages (over DataChannel)
```
Command (guest → host):   START_GAME, GUESS, SKIP, END_TURN, JOIN_TEAM, PLAY_AGAIN
Event (host → all/guest): ROUND_STARTED, GUESS_RESULT, NEXT_CARD, TURN_ENDED,
                          ROUND_ENDED, GAME_ENDED, SYNC_STATE, HOST_MIGRATED, SCORE_UPDATE
```

### Timer Sync
No per-second network ticks. The host broadcasts `ROUND_STARTED{startedAt, durationMs}` and each device computes `remainingMs` locally using a clock anchor captured at receipt.

### Max Room Size
8 players enforced at signaling, engine, and shared types.

## Development

### Prerequisites
- Node.js 24+
- Expo CLI (`npx expo`)
- Wrangler CLI (`npx wrangler`)
- A development build of the Expo app (not Expo Go — react-native-webrtc requires a dev build)

### Signaling Worker
```bash
cd cloudflare/signaling
npm install
npm run dev          # starts wrangler dev server on localhost:8787
```

### Mobile App
```bash
cd mobile
npm install
cp .env.example .env
npx expo run:android  # or run:ios — requires dev build
```

Environment variables:
- `EXPO_PUBLIC_SIGNALING_URL` — Worker URL (default: `http://localhost:8787`)
- `EXPO_PUBLIC_ICE_SERVERS` — JSON array of ICE servers

### Shared Tests
```bash
cd shared
npm install
npx vitest run        # 34 tests across scoring, rounds, validation, engine, networking
```

## Production Considerations

### Cloudflare Durable Objects
The MVP Worker uses an in-memory room registry. For production:
- Create a Durable Object per room for sticky state
- Room TTL managed by DO lifecycle (no sweep timer needed)
- Survives Worker restarts and edge scaling

### TURN Servers
Peer-to-peer connections behind symmetric NATs require TURN relay servers. Configure via `EXPO_PUBLIC_ICE_SERVERS`:
```json
[
  { "urls": "stun:stun.l.google.com:19302" },
  { "urls": "turn:your-turn-server:3478", "username": "user", "credential": "pass" }
]
```

### Host Migration
Protocol reserves `HOST_MIGRATED` event + `SYNC_STATE` snapshot. The host election uses deterministic lowest-player-ID logic. MVP detects disconnection and surfaces a banner; full automatic migration is future work.

## File Structure

```
shared/                    Platform-independent code
  types/                   PlayerId, Room, GameState types
  networking/              Wire protocol, events, GameTransport interface
  game/                    HostGameEngine, scoring, rounds, validation, clientView
  words/                   WordDeck class

cloudflare/signaling/      Worker signaling relay
  src/index.ts             HTTP + WebSocket upgrade handler
  src/signaling.ts         Message handlers (create/join/leave/signal)
  src/rooms.ts             In-memory room registry with TTL
  src/types.ts             Shared state maps

mobile/                    Expo React Native app
  services/signaling/      WebSocket signaling client
  services/webrtc/         PeerManager + WebRtcStarTransport
  hooks/                   useRoom, useWebRTC, useGameConnection, useTurnTimer
  screens/                 Entry, Lobby, Game, GameOver
  components/              Shared UI primitives
  lib/words.ts             Host deck loader
```
