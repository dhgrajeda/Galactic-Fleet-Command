# Galactic Fleet Command — Claude Instructions

## Project Summary

Backend service for a strategy platform: fleets move through a state machine, reserve scarce galaxy resources, and are deployed via an async command queue.

## Tech Stack

- **Runtime**: Node.js >=20, TypeScript (strict, CommonJS, ES2022 target)
- **Framework**: Express 4
- **Testing**: Jest + ts-jest + Supertest (tests in `tests/`, mirror `src/` structure)
- **Linting/Formatting**: ESLint + Prettier

## Key Scripts

```bash
npm run dev      # ts-node-dev with hot reload
npm test         # Jest
npm run lint     # ESLint
npm run lint:fix # ESLint --fix
npm run build    # tsc
```

## Architecture

```
src/
  app.ts                  # Express app factory (createApp)
  index.ts                # Entry point, starts server
  persistence/
    types.ts              # VersionedEntity, ConcurrencyError, NotFoundError, DuplicateIdError
    InMemoryRepository.ts # Generic Repository<T extends VersionedEntity> with optimistic locking
    fleetRepository.ts    # Fleet entity + FleetRepository type
    commandRepository.ts  # Command entity + CommandRepository type
    resourcePoolRepository.ts # ResourcePool entity + repository with getByType()
    context.ts            # PersistenceContext — wire all repos together; use in tests for isolation
    index.ts              # Re-exports
  domain/                 # (to build) Fleet state machine, resource reservation service, command handlers
  commands/               # (to build) Command queue, workers, command types
  cache/                  # (to build) LRU cache implementation
  routes/                 # (to build) Express route handlers
tests/
  health.test.ts
  persistence/context.test.ts
```

## Established Patterns

### Optimistic Locking
`InMemoryRepository.update(id, expectedVersion, updater)` — throws `ConcurrencyError` on version mismatch. All mutations go through this. ResourcePoolRepository implements the same pattern manually (allows getByType).

### PersistenceContext
Always use `createPersistenceContext()` to get repos. Pass context into services/handlers — never import singleton state. This makes tests fully isolated.

### Error Types
- `NotFoundError` — entity missing
- `ConcurrencyError` — version mismatch (retry logic should catch this)
- `DuplicateIdError` — create with existing id

## Domain Rules (from README)

**Fleet state machine:**
```
Docked → Preparing → Ready → Deployed → InBattle → Victorious | Destroyed
              ↘ FailedPreparation
```
- Only Docked fleets can be edited
- Ready requires successful resource reservation
- Deployed requires Ready
- Victorious/Destroyed are terminal (immutable)

**Resources**: FUEL, HYPERDRIVE_CORE, BATTLE_DROIDS — shared globally, must not over-allocate

**Commands**: PrepareFleetCommand, DeployFleetCommand — async, idempotent, retryable

## Constraints

- **NO off-the-shelf LRU** — implement O(1) LRU from scratch (doubly-linked list + HashMap)
- **NO real message queue** — simulate in-memory
- **In-memory persistence only** — no external DB

## Skills

- Use `/simplify` after completing a feature to review the code for quality and efficiency.
