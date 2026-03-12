# Galactic Fleet Command — Requirements

Derived from [`README.md`](./README.md).

**Status values:** `Open` · `In Progress` · `Done`
**Priority values:** `Must` · `Should` · `Could`

---

## 1. Tech Stack & Platform

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| TECH-001 | Service is implemented in Node.js + TypeScript | Must | Done |
| TECH-002 | All persistence is in-memory (no external databases) | Must | Done |
| TECH-003 | Service exposes a REST API | Must | In Progress |
| TECH-004 | Automated tests are included | Must | In Progress |
| TECH-005 | LRU cache must **not** use an off-the-shelf LRU library | Must | Open |
| TECH-006 | Command queue must **not** use a real message broker (simulated in-memory) | Must | Open |

---

## 2. Fleet Domain & State Machine

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FLEET-001 | Fleet entity has a `name`, `state`, `ships`, `requiredResources`, `reservedResources`, and a `timeline` | Must | Done |
| FLEET-002 | Fleet moves through states: `Docked → Preparing → Ready → Deployed → InBattle → (Victorious \| Destroyed)` | Must | Done |
| FLEET-003 | `Preparing` may also transition to `FailedPreparation` | Must | Done |
| FLEET-004 | Only `Docked` fleets may be edited (add/remove ships, change loadout) | Must | Done |
| FLEET-005 | A fleet cannot become `Ready` unless required resources are successfully reserved | Must | Done |
| FLEET-006 | A fleet cannot become `Deployed` unless it is `Ready` | Must | Done |
| FLEET-007 | `Victorious` and `Destroyed` are terminal states — fleet is immutable once reached | Must | Done |
| FLEET-008 | Invalid state transitions are rejected with a clear error | Must | Done |

---

## 3. Resources

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| RES-001 | Three shared resource types exist: `FUEL`, `HYPERDRIVE_CORE`, `BATTLE_DROIDS` | Must | Done |
| RES-002 | Each resource type has a global pool with a fixed total capacity | Must | Done |
| RES-003 | Reserving resources must never exceed the available quantity (no over-allocation) | Must | Open |
| RES-004 | Resource reservation is concurrency-safe (see CONC requirements) | Must | Open |
| RES-005 | Resources reserved by a fleet are tracked on the fleet entity | Must | Done |

---

## 4. REST API — Fleets

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| API-001 | `POST /fleets` — create a new fleet | Must | Open |
| API-002 | `PATCH /fleets/:id` — modify a fleet (Docked only) | Must | Open |
| API-003 | `GET /fleets/:id` — fetch a fleet read model | Must | Open |
| API-004 | `GET /fleets/:id/timeline` — return ordered list of fleet events | Must | Open |

---

## 5. REST API — Commands

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| API-005 | `POST /commands` — enqueue a new command | Must | Open |
| API-006 | `GET /commands/:id` — retrieve command status and result | Must | Open |

---

## 6. REST API — Health

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| API-007 | `GET /health` — returns service health status | Must | Done |

---

## 7. Command Processing System

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| CMD-001 | Service includes an in-memory command queue | Must | Open |
| CMD-002 | One or more in-memory workers process commands asynchronously | Must | Open |
| CMD-003 | Each command has a lifecycle status: `Queued \| Processing \| Succeeded \| Failed` | Must | Open |
| CMD-004 | Each command attempt records: attempt count, timestamps, and error (if any) | Must | Open |
| CMD-005 | `PrepareFleetCommand` transitions fleet `Docked → Preparing`, reserves resources, then transitions to `Ready` on success or `FailedPreparation` on failure | Must | Open |
| CMD-006 | `DeployFleetCommand` transitions fleet `Ready → Deployed` | Must | Open |

---

## 8. Idempotency

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| IDEM-001 | Commands are idempotent — reprocessing the same command does not double-apply side effects (no double-reservation, no double-transition) | Must | Open |
| IDEM-002 | An idempotency strategy is chosen and documented in `README.md` | Must | Open |

---

## 9. Concurrency & Data Integrity

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| CONC-001 | Resource reservation uses a deliberate concurrency strategy (optimistic locking, pessimistic locking, atomic CAS, or transactional boundary) | Must | Open |
| CONC-002 | A test exists where two commands attempt to reserve overlapping resources concurrently, with no over-allocation as the expected result | Must | Open |

---

## 10. LRU Cache

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| LRU-001 | LRU cache is implemented from scratch with O(1) get and put operations (doubly-linked list + hashmap) | Must | Open |
| LRU-002 | LRU cache is used on at least one read path (e.g. `GET /fleets/:id` or resource availability) | Must | Open |
| LRU-003 | Unit tests verify correct eviction order | Must | Open |
| LRU-004 | Unit tests verify O(1) structural assumption (e.g. list + map are both updated on every operation) | Must | Open |
| LRU-005 | Unit tests verify that accessed or updated entries are moved to most-recently-used position | Must | Open |

---

## 11. Events & Timeline

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| EVT-001 | Every fleet state transition emits a domain event | Must | Done |
| EVT-002 | `GET /fleets/:id/timeline` returns events in chronological order | Must | Open |
| EVT-003 | Events include at minimum: `FleetCreated`, a preparation-started event, a resources-reserved event, a deployed event, and a preparation-failed event | Should | Done |

---

## 12. Tests

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| TST-001 | Unit tests cover valid fleet state machine transitions | Must | Done |
| TST-002 | Unit tests cover invalid/rejected fleet state machine transitions | Must | Done |
| TST-003 | Unit tests cover resource reservation concurrency behavior (CONC-002) | Must | Open |
| TST-004 | Unit tests cover command retry behavior | Must | Open |
| TST-005 | Unit tests cover LRU cache eviction, O(1) structure, and MRU updates (LRU-003/004/005) | Must | Open |
| TST-006 | At least one integration-style test exists (e.g. full command lifecycle via HTTP) | Must | Open |

---

## 13. Deliverables

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| DEL-001 | Source code is in a Git repository | Must | Done |
| DEL-002 | `README.md` describes the high-level architecture | Must | Open |
| DEL-003 | `README.md` describes domain model decisions | Must | Open |
| DEL-004 | `README.md` describes the concurrency strategy | Must | Open |
| DEL-005 | `README.md` describes the idempotency strategy | Must | Open |
| DEL-006 | `README.md` describes what would change in a production deployment (e.g. Azure Service Bus, Cosmos DB / SQL) | Must | Open |
| DEL-007 | `README.md` includes instructions to run the service locally | Must | Open |

---

## Summary

| Category | Total | Done | In Progress | Open |
|----------|-------|------|-------------|------|
| Tech Stack | 6 | 2 | 1 | 3 |
| Fleet Domain | 8 | 8 | 0 | 0 |
| Resources | 5 | 3 | 0 | 2 |
| API — Fleets | 4 | 0 | 0 | 4 |
| API — Commands | 2 | 0 | 0 | 2 |
| API — Health | 1 | 1 | 0 | 0 |
| Command Processing | 6 | 0 | 0 | 6 |
| Idempotency | 2 | 0 | 0 | 2 |
| Concurrency | 2 | 0 | 0 | 2 |
| LRU Cache | 5 | 0 | 0 | 5 |
| Events & Timeline | 3 | 2 | 0 | 1 |
| Tests | 6 | 2 | 0 | 4 |
| Deliverables | 7 | 1 | 0 | 6 |
| **Total** | **57** | **19** | **1** | **37** |
