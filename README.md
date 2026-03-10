# Galactic Fleet Command

## Context

You are building the backend for **Galactic Fleet Command**, a strategy platform where factions assemble fleets, reserve scarce resources, and deploy fleets on missions across the galaxy.

This take-home is intentionally large. You may use AI coding assistants freely (Copilot, ChatGPT, Cursor, etc.). We are evaluating your system design and engineering judgment as much as the final code.

## Tech Constraints

Build a backend service using:

- **Tech stack of choice**
  - **Node.js + TypeScript** plumbing provided in repo - if choosing different tech stack just rebuild existing infrastructure or start from scratch
- **In-memory persistence** (no external databases required)
- **REST APIs**
- **Automated tests**

You may use any libraries you like, **except**:

- **Do not use** an off-the-shelf LRU implementation (you must implement it)
- **Do not use** a real message queue (simulate in-memory)

## What You're Building

You will build a service with these major parts:

- **Fleet domain + state machine**
- **Resource reservation** with concurrency safety
- **Command processing system** (queue + workers)
- **LRU cache** used by your read path
- **Event emission** for state changes (in-memory is fine)

The service should feel like a foundation you'd be comfortable running in production with real infrastructure swapped in later.

## Domain Model

### Fleet Lifecycle

A **Fleet** moves through states:

```
Docked → Preparing → Ready → Deployed → InBattle → (Victorious | Destroyed)
                ↘ FailedPreparation
```

### Rules / Invariants

- Only **Docked** fleets can be edited (add/remove ships, change loadout).
- A fleet cannot become **Ready** unless required resources are successfully reserved.
- A fleet cannot become **Deployed** unless it is **Ready**.
- Once a fleet is **Victorious** or **Destroyed**, it is immutable.
- State transitions must be validated and produce clear errors when invalid.

### Resources

The galaxy has limited shared resources:

- **FUEL**
- **HYPERDRIVE_CORE**
- **BATTLE_DROIDS**

Example: only 100 **HYPERDRIVE_CORE** exist globally.

Multiple fleets may attempt to reserve resources concurrently. Your system must **prevent over-allocation**.

## Required APIs (REST)

At minimum, implement:

### Fleets

- **POST /fleets** — create a fleet
- **PATCH /fleets/:id** — modify a fleet (Docked only)
- **GET /fleets/:id** — fetch a fleet (read model is fine)
- **GET /fleets/:id/timeline** — show fleet history (events or transitions)

### Commands

Command processing is central to this assignment. Implement:

- **POST /commands** — enqueue a command
- **GET /commands/:id** — get command status/result

### Health/observability

- **GET /health**

## Command Processing System (Core Requirement)

Your service must include an **in-memory Command Queue** and **Command Workers**.

**Why commands?**  
Fleet operations like reserving resources and deploying fleets represent "workflow steps" and are a good way to test distributed-system thinking without needing real infrastructure.

### Required command types

Implement at least these commands:

**PrepareFleetCommand**

- transitions **Docked → Preparing**
- reserves required resources
- if successful → transitions to **Ready**
- if fails → transitions to **FailedPreparation**

**DeployFleetCommand**

- transitions **Ready → Deployed**

(You may add more commands if you want, but these two are required.)

### Command processing requirements

- Commands are created via **POST /commands**
- Commands are processed **asynchronously** by one or more in-memory workers
- Each command has a lifecycle/status: **Queued | Processing | Succeeded | Failed**
- Each command attempt must be recorded with:
  - attempt count
  - timestamps
  - error (if any)

### Idempotency

Commands must be **idempotent**. If the same command is processed twice (e.g., due to retry), it must not double-apply side effects (double reserve, double transition, etc.).

Include an **idempotency strategy** (your choice), and document it in README.

## Concurrency & Data Integrity (Must-Have)

Resource reservation must be **concurrency safe**. We will look for a deliberate strategy such as:

- optimistic locking (versions)
- pessimistic locking (mutex per resource)
- atomic compare-and-set simulation
- transactional boundary abstraction

**Important:** We will run a test where two commands attempt to reserve overlapping resources concurrently, and we expect **no over-allocation**.

## LRU Cache (Algorithmic Requirement)

Implement an **O(1) LRU cache from scratch** (no libraries).

Use it to cache at least one read path, e.g.:

- **GET /fleets/:id** read model
- resource availability reads

Include unit tests proving:

- eviction order
- O(1) behavior assumption (structural)
- updates move entries to most-recently-used

## Events / Timeline

Every fleet state transition must **emit an event** (in-memory is fine). **GET /fleets/:id/timeline** should return the ordered timeline of these events.

Examples:

- FleetCreated
- FleetPrepared
- ResourcesReserved
- FleetDeployRequested
- FleetDeployed
- FleetPreparationFailed

We care less about the exact naming than correctness and clarity.

## Tests

Include automated tests for:

- fleet state machine (valid + invalid transitions)
- resource reservation concurrency behavior
- command retries
- LRU cache

At least one **integration-style test** is expected.

## Deliverables

Provide:

- **Source code** (Git repo)
- **README.md** explaining:
  - architecture (high-level)
  - domain model decisions
  - concurrency strategy
  - idempotency strategy
  - what would change in production (Azure Service Bus, Cosmos/SQL, etc.)

- **Instructions to run locally**

## Time Expectations

This assignment is intentionally large as we are looking for candidates to build this project using AI coding assistants. Scope thoughtfully. Prioritize **correctness**, **clarity**, and **architectural integrity**.

## Evaluation Criteria (What We'll Look For)

- Clean architecture and separation of concerns
- Domain modeling and state machine correctness
- Concurrency safety and data integrity
- Idempotent command processing with retries
- Test quality and coverage of tricky behaviors
- Production-minded observability and error handling
- Extend README describing tradeoffs and next steps

