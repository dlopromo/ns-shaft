# realtime-room-sync

Private TypeScript library for small realtime game rooms. The core has no DOM, Canvas, game-loop, or Firebase dependency. Firebase Realtime Database support is exposed separately from `realtime-room-sync/firebase`.

## Install

From a sibling project:

```bash
npm install ../NS-SHAFT/packages/realtime-room-sync
```

From a private Git repository whose root is this package (extract or mirror this
folder first; npm does not install arbitrary Git subdirectories):

```json
{
  "dependencies": {
    "realtime-room-sync": "git+ssh://git@github.com/OWNER/realtime-room-sync.git#v0.1.0"
  }
}
```

The package is private and has no public npm release or license grant.

## Two-player lockstep

```ts
import { LockstepSync } from "realtime-room-sync";

const sync = new LockstepSync<{ left: boolean; right: boolean }, GameCheckpoint>({
  localPlayerId: 0,
  participants: [0, 1],
  inputDelayTicks: 3,
  neutralInput: () => ({ left: false, right: false })
});

await transport.publishInput(roomCode, round, sync.queueLocal(localInput));
transport.subscribeInputs(roomCode, round, (batch) => sync.receiveInputs(batch));

const inputs = sync.takeFrame(); // ReadonlyMap<PlayerId, Input> | null
if (inputs) simulation.step(inputs);
```

Call `observeRoundTrip(ms)` to adapt the input delay. A host can publish a checkpoint containing `tick`, `participantEpoch`, serialized state, and a deterministic hash. `applyCheckpoint()` resets buffered input to that authoritative point.

## Four-player room

```ts
import { RoomClient } from "realtime-room-sync";
import { FirebaseRealtimeTransport } from "realtime-room-sync/firebase";

const transport = new FirebaseRealtimeTransport({ database, namespace: "my-game" });
const room = new RoomClient({ transport, clientId: crypto.randomUUID(), roomCodeLength: 6 });

const handle = await room.createRoom({
  code: "482731",
  capacity: 4,
  name: "HOST",
  settings: { map: "tower", difficulty: "normal" }
});

await room.setReady(true);
await room.start(Date.now() + 5000); // host, at least two connected players required
await room.beginPlaying();
```

Room codes are numeric. Set `roomCodeLength` to any value from 4 through 8; the default is 4. Player IDs are stable slots from `0` to `capacity - 1`, and player `0` is always the host.

## Snapshot interpolation

```ts
import { SnapshotSync } from "realtime-room-sync";

const snapshots = new SnapshotSync<Transform>({
  localPlayerId: 2,
  round: 4,
  heartbeatMs: 1000,
  interpolate: (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
});

const outbound = snapshots.publish(localTransform, performance.now());
if (outbound) await transport.publishSnapshot(code, 4, outbound);

transport.subscribeSnapshots(code, 4, (snapshot) => snapshots.receive(snapshot));
const remote = snapshots.sample(remotePlayerId, performance.now(), 100);
```

Snapshots are tracked independently for each remote player. Self snapshots, old sequences, and snapshots from another round are rejected. Unchanged state still produces a heartbeat after `heartbeatMs` when the same state reference is supplied, or when a custom `equals` function reports equality.

## Firebase setup

```ts
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { FirebaseRealtimeTransport } from "realtime-room-sync/firebase";

const app = initializeApp(firebaseConfig);
await signInAnonymously(getAuth(app));
const transport = new FirebaseRealtimeTransport({
  database: getDatabase(app),
  namespace: "my-game"
});
```

`namespace` is required and isolates projects under:

```text
<namespace>/rooms/<roomCode>/
  meta
  players
  inputs
  snapshots
  checkpoints
```

Starter RTDB rules:

```json
{
  "rules": {
    "$namespace": {
      "rooms": {
        "$roomCode": {
          ".read": "auth != null && $roomCode.matches(/^[0-9]{4,8}$/)",
          ".write": "auth != null && $roomCode.matches(/^[0-9]{4,8}$/)"
        }
      }
    }
  }
}
```

These rules are suitable for trusted/private testing. A public game should validate ownership and state transitions in a trusted backend or callable function.

## Pause and reconnection

- A pause request changes the room to `paused`; only connected active players count toward pause-ready.
- The host sets `resumeAt` after every active player is pause-ready.
- A disconnected guest pauses an active round and may reclaim the same slot with its `RoomHandle` before the grace period ends.
- The host calls `removeExpiredPlayers(now, checkpoint)` after the grace period. This increments `participantEpoch`, publishes the new checkpoint, and resumes with the remaining participants after they complete the pause flow.
- If fewer than two players remain, the round enters `results`.
- Host departure deletes the room. `rematch()` increments the round and clears ready state.

Persist `RoomHandle` only for the duration of a reconnect attempt. It contains a resume token and should not be logged or shared.

## Custom transport

Implement `RealtimeRoomTransport<TSettings>` for another backend. Room creation and `transactRoom()` must be atomic. Channel subscriptions must preserve payloads for inputs, snapshots, and checkpoints; ordering and stale-message rejection remain the responsibility of `LockstepSync` and `SnapshotSync`.

## Development

```bash
npm ci
npm test
npm run build
npm run test:firebase
```
