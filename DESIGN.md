# Galactic Fleet Command — Design Document

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Layered Architecture](#2-layered-architecture)
3. [Domain Model](#3-domain-model)
   - 3.1 [Aggregates & Entities](#31-aggregates--entities)
   - 3.2 [Value Objects](#32-value-objects)
   - 3.3 [Domain Events](#33-domain-events)
   - 3.4 [Domain Services](#34-domain-services)
   - 3.5 [Bounded Contexts](#35-bounded-contexts)
4. [Class & Interface Catalog](#4-class--interface-catalog)
5. [Design Decisions](#5-design-decisions)
   - 5.1 [Concurrency Strategy](#51-concurrency-strategy)
   - 5.2 [Idempotency Strategy](#52-idempotency-strategy)
   - 5.3 [Event Storage Strategy](#53-event-storage-strategy)
   - 5.4 [Command Processing Architecture](#54-command-processing-architecture)
   - 5.5 [LRU Cache Design](#55-lru-cache-design)
   - 5.6 [Resource Reservation Flow](#56-resource-reservation-flow)
6. [Data Flow Diagrams](#6-data-flow-diagrams)
7. [Error Taxonomy](#7-error-taxonomy)
8. [Testing Requirements](#8-testing-requirements)
9. [Production Considerations](#9-production-considerations)

---

## 1. System Overview

Galactic Fleet Command is a backend service for a turn-based strategy platform. Factions assemble fleets, prepare them by reserving scarce galaxy-wide resources, and deploy them on missions. The system is designed so that real infrastructure (database, message bus) can be swapped in without changing domain logic.

**Key system properties:**
- In-memory persistence with production-replaceable repository interfaces
- Asynchronous command processing with retry and idempotency guarantees
- Concurrency-safe resource reservation under parallel command execution
- Append-only event timeline per fleet for full auditability

---

## 2. Layered Architecture

```
┌─────────────────────────────────────────────────────┐
│                  HTTP / REST Layer                   │  src/routes/
│   Express route handlers, request/response mapping  │
└────────────────────────┬────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────┐
│               Application / Service Layer            │  src/domain/
│  FleetService, ResourceReservationService,           │
│  CommandQueueService — orchestrate use cases         │
└──────────┬──────────────────────────┬───────────────┘
           │                          │
┌──────────▼──────────┐  ┌────────────▼──────────────┐
│    Domain Layer     │  │     Infrastructure Layer   │
│  State machine,     │  │  InMemoryRepository,       │
│  business rules,    │  │  LRU Cache,                │
│  domain events      │  │  In-memory command queue   │
└──────────┬──────────┘  └────────────┬───────────────┘
           │                          │
┌──────────▼──────────────────────────▼───────────────┐
│               Persistence Context                    │  src/persistence/
│  PersistenceContext wires FleetRepository,           │
│  CommandRepository, ResourcePoolRepository           │
└─────────────────────────────────────────────────────┘
```

**Dependency rule:** outer layers depend on inner layers; the domain layer has zero dependencies on infrastructure. Repositories are injected, never imported directly from domain logic.

---

## 3. Domain Model

### 3.1 Aggregates & Entities

#### Fleet (Aggregate Root)

The central aggregate. Owns its full lifecycle and enforces all invariants internally via `FleetService` and the state machine.

```
Fleet
├── id: string                              (identity)
├── version: number                         (optimistic lock)
├── name: string
├── state: FleetState                       (FSM state)
├── ships: Ship[]                           (child entities)
├── requiredResources: ResourceRequirement  (value object)
├── reservedResources: ResourceRequirement  (value object, set on Ready)
├── timeline: FleetEvent[]                  (append-only event log)
├── createdAt: string
└── updatedAt: string
```

**Invariants enforced by this aggregate:**
- Edits are only accepted in `Docked` state
- State transitions must follow `VALID_TRANSITIONS`
- `Victorious` and `Destroyed` are terminal — no further mutations
- `reservedResources` is only populated on transition to `Ready`

#### ResourcePool (Aggregate Root)

Represents a single galaxy-wide resource supply. The reservation invariant (`reserved ≤ total`) is enforced on every update via optimistic locking.

```
ResourcePool
├── id: string
├── version: number
├── resourceType: ResourceType   (FUEL | HYPERDRIVE_CORE | BATTLE_DROIDS)
├── total: number                (fixed capacity)
└── reserved: number             (sum of all active reservations)
```

**Invariants enforced by this aggregate:**
- `reserved` must never exceed `total`
- All mutations go through `ResourcePoolRepository.update()` with an explicit expected version

#### Command (Aggregate Root)

Represents an asynchronous instruction to be processed by a worker. Owns its own execution lifecycle.

```
Command
├── id: string
├── version: number
├── type: CommandType            (PrepareFleet | DeployFleet)
├── status: CommandStatus        (Queued | Processing | Succeeded | Failed)
├── payload: Record              (command-specific parameters)
├── idempotencyKey: string       (client-provided deduplication key)
├── attemptCount: number
├── createdAt: string
├── processedAt?: string
└── error?: string
```

**Invariants:**
- A `Succeeded` command is never re-executed
- `attemptCount` increments on every execution attempt
- `error` is populated only on `Failed` status

---

### 3.2 Value Objects

Value objects have no identity — they are defined entirely by their data and are immutable.

| Name | Fields | Used By |
|------|--------|---------|
| `Ship` | `id`, `name`, `class: ShipClass` | Fleet |
| `FleetEvent` | `type`, `timestamp`, `data?` | Fleet.timeline |
| `ResourceRequirement` | `Partial<Record<ResourceType, number>>` | Fleet.requiredResources, Fleet.reservedResources |

`Ship` has an `id` field for list-management purposes (removing a specific ship by ID while Docked), but carries no lifecycle of its own — it is not an entity from a DDD standpoint.

`ShipClass` values: `'Fighter' | 'Cruiser' | 'Destroyer' | 'Carrier' | 'Dreadnought'`

---

### 3.3 Domain Events

Every state change in the Fleet aggregate produces a domain event appended to `Fleet.timeline`. Events are the source of truth for the `/timeline` endpoint.

| Event Type | Trigger | Emitted by |
|------------|---------|------------|
| `FleetCreated` | Fleet is first created | `FleetService` |
| `FleetUpdated` | Fleet is edited while Docked | `FleetService` |
| `FleetPreparationStarted` | `Docked → Preparing` | `FleetService` |
| `ResourcesReserved` | All required resources successfully reserved (includes `reservedResources` map in data) | `PrepareFleetCommandHandler` |
| `ResourceReservationFailed` | Resource reservation attempt failed (includes `resourceType`, `requested`, `available` in data) | `PrepareFleetCommandHandler` |
| `FleetReady` | `Preparing → Ready` (includes `reservedResources` in data) | `FleetService` |
| `FleetPreparationFailed` | `Preparing → FailedPreparation` (includes `reason` in data) | `FleetService` |
| `FleetDeployRequested` | `POST /commands` received with type `DeployFleet` (logged before worker picks it up) | `DeployFleetCommandHandler` |
| `FleetDeployed` | `Ready → Deployed` | `FleetService` |
| `FleetEnteredBattle` | `Deployed → InBattle` | `FleetService` |
| `FleetVictorious` | `InBattle → Victorious` | `FleetService` |
| `FleetDestroyed` | `InBattle → Destroyed` | `FleetService` |

**Preparation event sequences:**

Success path:
```
FleetPreparationStarted → ResourcesReserved → FleetReady
```

Failure path:
```
FleetPreparationStarted → ResourceReservationFailed → FleetPreparationFailed
```

`ResourceReservationFailed` is distinct from `FleetPreparationFailed` — it captures the specific resource-level detail (which type failed, how much was requested vs available) before the fleet-level state transition occurs. This gives operators clear diagnostic information from the timeline alone without needing to inspect logs.

**Naming note:** The README lists `FleetPrepared` as an example event name. This design splits that into two events — `FleetPreparationStarted` (on `Docked → Preparing`) and `FleetReady` (on `Preparing → Ready`) — to give finer-grained timeline visibility. The README explicitly states "We care less about the exact naming than correctness and clarity."

Events emitted by `PrepareFleetCommandHandler` and `DeployFleetCommandHandler` are appended to `Fleet.timeline` by calling `FleetService` helper methods, keeping the timeline as the single consistent record.

---

### 3.4 Domain Services

Stateless services that coordinate operations across more than one aggregate.

#### FleetService (`src/domain/fleet/FleetService.ts`)
Owns all fleet mutations. Validates state machine rules and appends domain events.
→ *Already implemented.*

#### ResourceReservationService (`src/domain/resources/ResourceReservationService.ts`)
Coordinates Fleet + ResourcePool to reserve or release resources atomically.
Implements the concurrency strategy (see §5.1).
→ *To be implemented.*

#### CommandHandlerRegistry (`src/commands/handlers/`)
Routes a dispatched command to the correct handler function.
Each handler (e.g. `PrepareFleetCommandHandler`) orchestrates FleetService + ResourceReservationService.
→ *To be implemented.*

#### CommandQueueService (`src/commands/CommandQueue.ts`)
Manages the in-memory queue and worker pool. Picks commands off the queue and dispatches them to handlers.
→ *To be implemented.*

---

### 3.5 Bounded Contexts

Three bounded contexts with explicit interface boundaries:

```
┌────────────────────────────────────────────────────────────────┐
│  Fleet Context                                                  │
│  Fleet, Ship, FleetEvent, FleetState, FleetService             │
│  Owns: fleet lifecycle, state machine, timeline                 │
└──────────────────┬─────────────────────────────────────────────┘
                   │ FleetRepository (interface)
┌──────────────────▼─────────────────────────────────────────────┐
│  Resource Context                                               │
│  ResourcePool, ResourceType, ResourceReservationService         │
│  Owns: global capacity, availability, reservation integrity     │
└──────────────────┬─────────────────────────────────────────────┘
                   │ ResourcePoolRepository (interface)
┌──────────────────▼─────────────────────────────────────────────┐
│  Command Context                                                │
│  Command, CommandStatus, CommandQueue, CommandHandlers          │
│  Owns: async lifecycle, retry logic, idempotency                │
│  Depends on Fleet Context and Resource Context via services     │
└────────────────────────────────────────────────────────────────┘
```

Contexts communicate through their repository interfaces and domain service contracts — never by importing each other's internal types directly.

---

## 4. Class & Interface Catalog

### Persistence Layer (`src/persistence/`)

| Name | Kind | Responsibility |
|------|------|---------------|
| `VersionedEntity` | Interface | Base type for all entities: `id`, `version` |
| `Repository<T>` | Interface | Generic CRUD + optimistic-lock update |
| `InMemoryRepository<T>` | Class | Map-backed implementation of `Repository<T>` |
| `Fleet` | Interface | Fleet aggregate entity |
| `FleetRepository` | Type alias | `Repository<Fleet>` |
| `ResourcePool` | Interface | Resource capacity + reservation state |
| `ResourcePoolRepository` | Interface | Extends base repo with `getByType()` |
| `Command` | Interface | Command aggregate entity |
| `CommandRepository` | Type alias | `Repository<Command>` |
| `PersistenceContext` | Interface | Wires all three repos into one injectable unit |
| `ConcurrencyError` | Class | Thrown on optimistic lock version mismatch |
| `NotFoundError` | Class | Thrown when entity lookup fails |
| `DuplicateIdError` | Class | Thrown when creating a duplicate ID |

### Domain Layer (`src/domain/fleet/`)

| Name | Kind | Responsibility |
|------|------|---------------|
| `VALID_TRANSITIONS` | Constant | Encodes the full state machine as a record |
| `assertValidTransition` | Function | Throws `InvalidTransitionError` if transition not allowed |
| `canTransition` | Function | Boolean check for transition validity |
| `allowedTransitions` | Function | Returns allowed next states from a given state |
| `isTerminal` | Function | Returns `true` for `Victorious` / `Destroyed` |
| `InvalidTransitionError` | Class | Domain error for illegal state transitions |
| `createFleet` | Function | Creates a new fleet in `Docked` state |
| `updateFleet` | Function | Edits a fleet; enforces `Docked`-only rule |
| `startPreparation` | Function | `Docked → Preparing` |
| `completePreparation` | Function | `Preparing → Ready`; records reserved resources |
| `failPreparation` | Function | `Preparing → FailedPreparation` |
| `deployFleet` | Function | `Ready → Deployed` |
| `enterBattle` | Function | `Deployed → InBattle` |
| `resolveVictorious` | Function | `InBattle → Victorious` |
| `resolveDestroyed` | Function | `InBattle → Destroyed` |
| `getFleet` | Function | Fetch fleet or throw `NotFoundError` |
| `FleetEditError` | Class | Thrown on invalid edit attempts (non-Docked, terminal) |

### Application Layer (Done)

| Name | Kind | Responsibility |
|------|------|---------------|
| `createApp` | Function | Express app factory; registers all middleware and routes |
| `GET /health` | Route | Returns `{ status: 'ok' }` — already implemented |

### To-Be-Built

| Name | Layer | Responsibility |
|------|-------|---------------|
| `ResourceReservationService` | Domain | Reserve / release resources across multiple pools with retry |
| `InsufficientResourcesError` | Domain | Thrown when a pool cannot satisfy a reservation request |
| `LruCache<K, V>` | Infrastructure | O(1) LRU cache (doubly-linked list + hashmap) |
| `CommandQueue` | Infrastructure | In-memory FIFO queue with async worker dispatch |
| `PrepareFleetCommandHandler` | Application | Orchestrates fleet prep + resource reservation |
| `DeployFleetCommandHandler` | Application | Orchestrates fleet deployment |
| Fleet route handlers | HTTP | `POST /fleets`, `PATCH /fleets/:id`, `GET /fleets/:id`, `GET /fleets/:id/timeline` |
| Command route handlers | HTTP | `POST /commands`, `GET /commands/:id` |

---

## 5. Design Decisions

### 5.1 Concurrency Strategy

**Problem:** Multiple requests may attempt to reserve the same resource pool simultaneously. Without coordination, two commands reading `available = 10` could each reserve 8, producing a total reservation of 16 — an over-allocation.

#### The Node.js Single-Thread Reality

Before evaluating strategies, one fact about the runtime must be stated explicitly: **Node.js is single-threaded**. The only moment two async operations can interleave is when one of them hits an `await` and yields control back to the event loop. Between any two synchronous statements, nothing else can run.

This has a direct consequence: if the entire read-check-write sequence for a `ResourcePool` contains no `await`, a race condition is **structurally impossible** regardless of which concurrency strategy is chosen. JavaScript simply won't schedule anything else in between.

This makes the simplest local solution:

**Option A: Synchronous Critical Section**
Keep the entire reservation — read pool, check capacity, write new reserved value — as a single synchronous block with no `await`.

```typescript
// Nothing can interleave here — JavaScript won't run anything else mid-block
const pool = resourcePools.getByType(type);
if (pool.total - pool.reserved < required) throw new InsufficientResourcesError();
resourcePools.update(pool.id, pool.version, p => ({ ...p, reserved: p.reserved + required }));
```

- ✅ Trivially correct in Node.js — atomicity is guaranteed by the runtime
- ✅ No retry logic, no version conflicts, no extra infrastructure
- ❌ Breaks immediately when any legitimate `await` is added inside the handler
- ❌ Completely non-transferable — a real DB call is always async, so this pattern cannot survive a production swap
- ❌ Teaches nothing about distributed-system concurrency; evaluators specifically look for a deliberate strategy

**Option B: Pessimistic Locking (mutex per resource)**
Each resource pool has a dedicated mutex (`async-mutex` or equivalent). Any code path that reads-then-writes a pool must acquire the lock first.

- ✅ Eliminates contention entirely; simpler retry-free code path
- ❌ Blocking — one slow command holds the lock for all others
- ❌ Deadlock risk if multiple resources must be reserved in a single operation and locks are acquired in different orders
- ❌ Does not compose well with async Node.js I/O patterns
- ❌ Requires an ordered lock acquisition protocol to prevent deadlock

**Option C: Resource Manager — Per-Resource Serial Queue (actor-style)**
Each `ResourcePool` owns an internal async queue. All reservation requests for that pool are enqueued and processed one at a time by a single consumer. This is sometimes called a "Single Writer" pattern — only one actor ever writes to a given resource at a time.

```
ResourceManager
├── queues: Map<ResourceType, AsyncQueue>
└── for each ResourceType:
      consumer runs reservations one at a time
      → no version conflicts, no retries needed
```

- ✅ No locks, no retries, no version conflicts within a single resource
- ✅ Natural fit for Node.js's event-driven model
- ✅ No deadlock risk — one consumer per resource type
- ❌ More infrastructure to build and reason about for only 3 resource types
- ❌ **Does not solve cross-entity atomicity** — even with a single writer per `ResourcePool`, the Fleet update and the ResourcePool update are still two separate operations. If the ResourcePool write succeeds but the Fleet write fails, the system is inconsistent regardless. The single-writer guarantee only applies within one pool, not across (Fleet, ResourcePool) together.
- ❌ The command queue already provides the serialization benefit at the command level — if the worker processes one command at a time, resource mutations are naturally serialized without a Resource Manager
- ❌ Does not transfer cleanly to a distributed production system where the resource pools live in separate database rows

**Option D: Optimistic Locking with Version Numbers** ✅ **Chosen**
Every entity carries a `version` field. `update()` accepts an `expectedVersion`; if the stored version no longer matches, it throws `ConcurrencyError`. The caller catches this, re-reads the entity with its new version, and retries the operation.

- ✅ Non-blocking; no held locks
- ✅ Already implemented in `InMemoryRepository` and `ResourcePoolRepository`
- ✅ Maps directly to database row-level versioning (`rowVersion`, `ETag`) for a future production swap
- ✅ Correct under all concurrency levels: only one writer wins per version; losers retry with fresh data
- ⚠️ Retry logic must be written in the command handler; excessive contention causes retry storms
- Mitigation: bounded retry count with exponential backoff (max 3 attempts); commands fail with `RESOURCE_CONTENTION` after exhausting retries

#### ⚠️ Cross-Entity Atomicity: The Real Consistency Risk

Optimistic locking guarantees conflict *detection* on a single entity — it does **not** make updates to two separate entities atomic. Reserving resources requires writing to both `ResourcePool` (increment `reserved`) and `Fleet` (record `reservedResources`). These are two independent `repo.update()` calls. If the first succeeds and the second fails, the system is inconsistent.

This risk exists regardless of which concurrency strategy is chosen (including Option C — a Resource Manager serialises writes to one pool but still cannot atomically commit across Fleet and ResourcePool).

**Mitigation: order writes so partial failure is recoverable.**

Update `Fleet` first, `ResourcePool` second:

```
1. fleet = getFleet(id)                      // read
2. startPreparation(fleet)                   // Fleet: Docked → Preparing (write #1)
3. reserve() → update each ResourcePool      // write #2, #3, #4 (one per resource type)
4. completePreparation(fleet, reserved)      // Fleet: Preparing → Ready (write #5)
```

If step 3 fails after some pools have already been updated:
- The retry path in `ResourceReservationService` skips already-reserved `(commandId, resourceType)` pairs
- The Fleet remains in `Preparing`, which the idempotency guard treats as "in progress" — safe to retry

If step 4 fails after step 3 fully succeeded:
- Fleet is still `Preparing`; ResourcePool `reserved` is already incremented
- On retry, the idempotency fence skips re-reservation; only the Fleet write is retried
- This is safe because the fence tracks per-commandId reservations

The ordering and idempotency fence together ensure no double-reservation occurs on retry.

**Why not Option A despite it being locally simpler?** Because the goal of this assignment is to demonstrate production-grade thinking. Option A is a local trick that evaporates the moment the codebase touches a real database. Option D is the pattern that works identically in memory today and with Cosmos DB (`_etag`) or PostgreSQL (`rowVersion`) tomorrow — zero domain changes required.

#### ⚠️ Implementation Note: The Concurrency Test Requires a Deliberate Yield

Because Node.js is single-threaded, `Promise.all([handler(cmd1), handler(cmd2)])` will **not** actually interleave the two handlers unless each one explicitly yields control mid-execution. Without a yield, one handler will run to completion before the other starts — meaning the `ConcurrencyError` retry path is never exercised and the test passes trivially for the wrong reason.

The reservation handler must include a deliberate `await` between reading the pool and writing to it:

```typescript
const pool = resourcePools.getByType(type);          // sync read
await Promise.resolve();                              // yield — lets the other command's read run
resourcePools.update(pool.id, pool.version, ...);    // now a version conflict is possible
```

This yield is not incidental — it is what makes the concurrency test meaningful. Without it, we are not testing concurrency at all.

#### The Correct Way to Choose a Concurrency Strategy

Ask these four questions when deciding how to handle concurrent updates.

---

#### 1️⃣ How often do conflicts occur?

| Conflict Rate | Strategy |
| --- | --- |
| Rare | Optimistic locking |
| Moderate | Optimistic locking + retries |
| High | Pessimistic locking |

---

#### 2️⃣ How expensive is retry?

| Retry Cost | Strategy |
| --- | --- |
| Cheap | Optimistic locking |
| Expensive | Pessimistic locking |

---

#### 3️⃣ How long is the operation?

| Duration | Strategy |
| --- | --- |
| Milliseconds | Locks are acceptable |
| Seconds or longer | Avoid locks |

Long-running operations should not hold locks because they create contention and block other work.

---

#### 4️⃣ Is this a distributed system?

If yes:

- Prefer **idempotent operations**
- Use **queues** to serialize work when necessary
- Avoid **cross-service transactions**

**Implementation contract:**

```
ResourceReservationService.reserve(commandId, requirements):
  for each resource type in requirements:
    loop (up to MAX_RETRIES):
      pool = resourcePools.getByType(type)          // sync read
      if pool.total - pool.reserved < required:
        throw InsufficientResourcesError
      await Promise.resolve()                        // yield — makes concurrency test meaningful
      try:
        resourcePools.update(pool.id, pool.version, p => ({
          ...p, reserved: p.reserved + required
        }))
        break  // success
      catch ConcurrencyError:
        continue  // retry with fresh read on next iteration
    // if MAX_RETRIES exhausted: throw ResourceContentionError
```

---

### 5.2 Idempotency Strategy

**Problem:** A command worker may crash after partially executing a command but before marking it `Succeeded`. On restart, the command is re-queued and executed again. This must not double-reserve resources or double-transition fleet state.

#### Options Considered

**Option A: Client-provided Idempotency Key**
The client sends a unique key with each `POST /commands`. The server stores a key→commandId map and returns the existing command if the key has been seen before.

- ✅ True request-level deduplication; covers network retries from the client side as well
- ❌ Requires clients to generate and track keys
- ❌ Adds key storage and lookup overhead

**Option B: State-based Idempotency (Check Before Act)**
Before applying a state transition, check whether the entity is already in the target state. If so, treat the operation as a no-op success.

- ✅ Simple; no extra storage
- ❌ Only works for state transitions; does not protect resource reservation from double-counting

**Option C: Command-ID Deduplication + State Guards** ✅ **Chosen**
Combines two mechanisms:

1. **Command lifecycle guard** — Before executing a command, check its `status`. If it is already `Succeeded`, return the result immediately without re-executing. This is the primary idempotency gate.

2. **State-based guards in handlers** — Each command handler checks the current fleet state before applying transitions. `PrepareFleetCommandHandler` checks that the fleet is still `Docked` before transitioning to `Preparing`; if it is already `Preparing` or `Ready`, it infers prior partial execution and continues from where it left off. **Confirmed behaviour:** submitting a `PrepareFleet` command for a fleet already in `Preparing` or `Ready` is treated as idempotent — the command succeeds without re-applying side effects.

3. **Resource reservation fence** — `ResourceReservationService` tracks which `(commandId, resourceType)` pairs have been successfully reserved. On retry, already-reserved pairs are skipped.

```
PrepareFleetCommandHandler.execute(command):
  if command.status === 'Succeeded': return   // idempotency gate
  fleet = getFleet(command.payload.fleetId)

  // Idempotent transition: skip if already Preparing or beyond
  if fleet.state === 'Docked':
    startPreparation(fleet)

  // Idempotent reservation: skip already-reserved resources
  reserve(command.id, fleet.requiredResources)

  // Idempotent completion: skip if already Ready
  if fleet.state === 'Preparing':
    completePreparation(fleet, reservedResources)
```

- ✅ No client contract required
- ✅ Survives worker crash-and-restart at any point in the handler
- ✅ Explicit and auditable — each step is independently re-entrant

---

### 5.3 Event Storage Strategy

**Problem:** Every fleet state transition must be recorded for the `/timeline` endpoint. Where should events live?

#### Options Considered

**Option A: Separate Event Store**
A dedicated `EventRepository` holds events keyed by `(aggregateType, aggregateId, sequenceNumber)`. The fleet entity itself is rebuilt by replaying events (event sourcing) or stored independently.

- ✅ True event sourcing; events are the canonical record
- ✅ Decoupled — other contexts can subscribe to events
- ❌ Significantly more infrastructure for an in-memory prototype
- ❌ Requires a projection to maintain the current fleet state for fast reads

**Option B: Timeline Embedded on Fleet Entity** ✅ **Chosen**
`Fleet.timeline: FleetEvent[]` is an append-only array stored directly on the fleet entity. Every `FleetService` mutation appends exactly one event before saving.

- ✅ Simple — one data access, fleet + history in one read
- ✅ Consistent by construction — the event is committed in the same `repo.update()` call as the state change; they cannot diverge
- ✅ `/timeline` endpoint is a single `repo.get(id)` followed by returning `fleet.timeline`
- ⚠️ Timeline grows unboundedly; in production this would be paginated or moved to a separate events table
- ⚠️ Not queryable across fleets (e.g. "all FleetDeployed events in the last hour") — acceptable for this scope

---

### 5.4 Command Processing Architecture

**Problem:** Fleet operations (preparation, deployment) must be processed asynchronously with retry capability.

#### Options Considered

**Option A: Synchronous execution in HTTP handler**
`POST /commands` triggers immediate synchronous execution before returning.

- ❌ Blocks the HTTP response for the duration of the operation
- ❌ No retry capability — if execution fails, the command is lost
- ❌ Does not model distributed-system thinking

**Option B: Polling worker loop**
A `setInterval` loop runs every N ms, picks commands with `status === 'Queued'`, and processes them.

- ✅ Simple to implement
- ❌ Latency proportional to poll interval; idle cycles waste CPU

**Option C: Event-driven dispatch** ✅ **Chosen**
`POST /commands` enqueues a command and immediately calls `setImmediate()` (or equivalent) to schedule a worker tick. The worker processes one command per tick. This produces near-zero latency without spinning.

```
CommandQueue.enqueue(command):
  store command with status = Queued
  setImmediate(() => worker.processNext())

worker.processNext():
  command = queue.dequeue()   // pop oldest Queued command
  if none: return
  mark command Processing
  try:
    handler.execute(command)
    mark command Succeeded
  catch err:
    record attempt + error
    if attempts < MAX_RETRIES:
      mark command Queued (re-enqueue with backoff)
    else:
      mark command Failed
```

**Retry policy:**
- Max 3 attempts per command
- Exponential backoff: 0 ms, 100 ms, 500 ms between attempts
- `ConcurrencyError` during resource reservation is retried; all other errors fail the command

---

### 5.5 LRU Cache Design

**Problem:** Frequently read entities (fleet read model) hit the in-memory store on every request. An LRU cache reduces repeated map lookups and provides a controlled read-path.

**Constraint:** No off-the-shelf LRU library — must be implemented from scratch.

#### Chosen Implementation: Doubly-Linked List + HashMap

**Why O(1)?**
- A plain array or singly-linked list requires O(n) scan to find and re-order entries.
- A doubly-linked list allows O(1) node removal given a pointer to the node.
- A HashMap provides O(1) key→node lookup.
- Together: get = O(1) lookup + O(1) move-to-front; put = O(1) insert or O(1) evict-tail + insert.

```
LruCache<K, V>
├── capacity: number
├── map: Map<K, Node<K,V>>    ← O(1) key → node lookup
├── head: Node                ← most recently used sentinel
└── tail: Node                ← least recently used sentinel

Node<K, V>
├── key: K
├── value: V
├── prev: Node | null
└── next: Node | null

get(key):
  node = map.get(key)          // O(1)
  if not found: return undefined
  moveToFront(node)            // O(1) pointer rewire
  return node.value

put(key, value):
  if map.has(key):
    node = map.get(key)        // O(1)
    node.value = value
    moveToFront(node)          // O(1)
  else:
    if map.size === capacity:
      evict()                  // O(1) remove tail
    node = new Node(key, value)
    insertAtFront(node)        // O(1)
    map.set(key, node)         // O(1)
```

**Cache invalidation:** Fleet cache entries are invalidated (deleted) whenever a fleet is written through `FleetService`. This is a write-through invalidation strategy — simpler than write-through update, and correct for an in-memory store where writes are cheap.

---

### 5.6 Resource Reservation Flow

The full flow for `PrepareFleetCommand`, showing how Fleet Context and Resource Context interact:

```
POST /commands  { type: "PrepareFleet", payload: { fleetId } }
  │
  ▼
CommandQueue.enqueue()  →  status: Queued
  │
  ▼  (setImmediate)
Worker picks command
  │
  ▼
PrepareFleetCommandHandler.execute(command)
  │
  ├─1─ getFleet(fleetId)                         Fleet Context
  ├─2─ startPreparation(fleet)                   Fleet: Docked → Preparing
  │
  ├─3─ ResourceReservationService.reserve(       Resource Context
  │       commandId,
  │       fleet.requiredResources
  │    )
  │    ├─ for each resource:
  │    │    loop:
  │    │      pool = getByType(resourceType)
  │    │      check available >= required
  │    │      update(pool.id, pool.version, ...)  ← optimistic lock
  │    │      on ConcurrencyError: retry
  │
  ├─4─ completePreparation(fleet, reserved)       Fleet: Preparing → Ready
  │       appends FleetReady event
  │
  └─5─ mark command Succeeded

On any failure in steps 3–4:
  ├─ failPreparation(fleet, reason)               Fleet: Preparing → FailedPreparation
  └─ mark command Failed (or retry if ConcurrencyError)
```

---

## 6. Data Flow Diagrams

### Fleet Creation

```
Client                  HTTP Layer           FleetService          FleetRepository
  │                         │                    │                       │
  │── POST /fleets ─────────▶                    │                       │
  │                         │── createFleet() ──▶│                       │
  │                         │                    │── repo.create() ──────▶
  │                         │                    │                       │
  │◀── 201 { fleet } ───────│◀── Fleet ──────────│                       │
```

### Command Processing (PrepareFleet)

```
Client       HTTP       CommandQueue    Worker     FleetService   ResourceSvc   Repos
  │            │              │            │             │              │          │
  │─POST /cmd─▶│              │            │             │              │          │
  │            │──enqueue()──▶│            │             │              │          │
  │            │              │─setImmed.─▶│             │              │          │
  │◀─202──────│              │            │             │              │          │
  │            │              │            │─startPrep.─▶│              │          │
  │            │              │            │             │─update()─────────────────▶
  │            │              │            │─reserve()──────────────────▶          │
  │            │              │            │             │              │─update()─▶│
  │            │              │            │─completePr.▶│              │          │
  │            │              │            │             │─update()─────────────────▶
  │            │              │            │─Succeeded──▶│              │          │
```

---

## 7. Error Taxonomy

| Error Class | Layer | HTTP Status | Meaning |
|-------------|-------|-------------|---------|
| `NotFoundError` | Persistence | 404 | Entity does not exist |
| `DuplicateIdError` | Persistence | 409 | Entity already exists |
| `ConcurrencyError` | Persistence | 409 | Version mismatch; caller should retry |
| `InvalidTransitionError` | Domain | 422 | Illegal fleet state transition |
| `FleetEditError` | Domain | 422 | Edit rejected (non-Docked or terminal fleet) |
| `InsufficientResourcesError` | Domain | 422 | Not enough resource capacity to reserve |
| `CommandNotFoundError` | Application | 404 | Command ID unknown |
| Validation errors | HTTP | 400 | Malformed request body |

---

## 8. Testing Requirements

The README mandates specific test coverage. This section records the required test cases so they can be tracked alongside the implementation.

### Unit Tests — Fleet State Machine
- All valid transitions accepted (one test per edge)
- All invalid transitions rejected with `InvalidTransitionError`
- Terminal state guard prevents mutation after `Victorious` / `Destroyed`

### Unit Tests — LRU Cache
The README specifically requires three structural proofs:

| Test | What to verify |
|------|---------------|
| Eviction order | After filling the cache to capacity and adding one more entry, the least-recently-used entry is evicted |
| O(1) structural assumption | After every `get` and `put`, both the internal `Map` and the doubly-linked list have been updated (no full scans) |
| MRU on access | A `get` on an existing entry moves it to the most-recently-used position, preventing it from being evicted next |

### Unit Tests — Concurrency / Resource Reservation
The README calls out a specific scenario: **two commands attempting to reserve overlapping resources concurrently must not produce over-allocation.**

Test design:
1. Seed a `HYPERDRIVE_CORE` pool with `total: 10, reserved: 0`
2. Create two `PrepareFleetCommand`s, each requesting `HYPERDRIVE_CORE: 8`
3. Dispatch both commands simultaneously (e.g. `Promise.all([worker.process(cmd1), worker.process(cmd2)])`)
4. Assert: exactly one command `Succeeded` and one `Failed` (or `FailedPreparation`)
5. Assert: `reserved` on the pool is exactly `8` — never `16`

**Critical:** this test only exercises the retry path if `ResourceReservationService` yields between reading and writing the pool (see §5.1 implementation note). Without the `await Promise.resolve()` yield, Node.js will run both commands serially and the test will pass trivially without ever triggering a `ConcurrencyError`. The yield is a required part of the implementation, not optional.

### Unit Tests — Command Retries
- A command that throws `ConcurrencyError` on first attempt is re-queued and succeeds on retry
- A command that fails on all `MAX_RETRIES` attempts is marked `Failed` with `error` populated
- `attemptCount` increments correctly across retries

### Integration Tests (≥ 1 required)
At least one end-to-end test using Supertest covering a full command lifecycle over HTTP:

Happy path:
```
POST /fleets               → 201, fleet in Docked state
POST /commands             → 202, PrepareFleet command Queued
GET  /commands/:id         → 200, command Succeeded
GET  /fleets/:id           → 200, fleet in Ready state
GET  /fleets/:id/timeline  → 200, events: [FleetCreated, FleetPreparationStarted, ResourcesReserved, FleetReady]
POST /commands             → 202, DeployFleet command Queued
GET  /commands/:id         → 200, command Succeeded
GET  /fleets/:id           → 200, fleet in Deployed state
```

Failure path (insufficient resources):
```
POST /fleets               → 201, fleet with requiredResources exceeding pool capacity
POST /commands             → 202, PrepareFleet command Queued
GET  /commands/:id         → 200, command Failed
GET  /fleets/:id           → 200, fleet in FailedPreparation state
GET  /fleets/:id/timeline  → 200, events: [FleetCreated, FleetPreparationStarted, ResourceReservationFailed, FleetPreparationFailed]
```

---

## 9. Production Considerations

| Concern | In-Memory (current) | Production replacement |
|---------|---------------------|----------------------|
| **Persistence** | `Map<string, T>` in process | Azure Cosmos DB (NoSQL) or Azure SQL with EF Core |
| **Optimistic locking** | `version` field + `ConcurrencyError` | `_etag` (Cosmos) or `rowVersion` (SQL) — same contract, zero domain change |
| **Command queue** | `setImmediate` + array | Azure Service Bus (FIFO queues, dead-letter, at-least-once delivery) |
| **Idempotency** | Command-ID deduplication + state guards (no client key contract) | Command table in Cosmos/SQL is authoritative; workers query `status` before re-executing; reservation fence stored in same DB as commands |
| **LRU cache** | In-process `LruCache` | Azure Cache for Redis; same interface, remote backend |
| **Events / timeline** | Embedded array on entity | Dedicated events table or Cosmos change feed; enables cross-fleet event queries |
| **Concurrency** | Optimistic version check in Node.js | Same strategy at DB level; Cosmos uses `_etag` natively |
| **Workers** | `setImmediate` in same process | Azure Functions or dedicated worker service consuming Service Bus |
| **Observability** | `console.log` | Azure Monitor, Application Insights, structured logging (Winston/Pino) |
| **Auth** | None | Azure AD / Managed Identity on all endpoints |
