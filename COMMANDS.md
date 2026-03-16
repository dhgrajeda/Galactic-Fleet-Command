## API Usage

### Health

```bash
curl http://localhost:3000/health
# → 200  {"status":"ok"}
```

---

### Fleets

#### Create a fleet

```bash
curl -s -X POST http://localhost:3000/fleets \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"Red Squadron\", \"requiredResources\": {\"FUEL\": 100, \"HYPERDRIVE_CORE\": 2}}"
```

**Body fields:**

| Field | Type | Required |
|---|---|---|
| `name` | string | yes |
| `ships` | `{ id, name, class }[]` | no |
| `requiredResources` | `{ FUEL?, HYPERDRIVE_CORE?, BATTLE_DROIDS? }` | no |

#### Update a fleet (Docked only)

```bash
curl -s -X PATCH http://localhost:3000/fleets/<id> \
  -H "Content-Type: application/json" \
  -d "{\"version\": 1, \"name\": \"Blue Squadron\"}"
```

`version` is required for optimistic concurrency — use the value returned by the last read. Returns `409` on version conflict, `422` if the fleet is not Docked.

#### Get a fleet

```bash
curl -s http://localhost:3000/fleets/<id>
```

#### Get all fleets

```bash
curl -s http://localhost:3000/fleets
```

#### Get timeline

```bash
curl -s http://localhost:3000/fleets/<id>/timeline
```

Returns an array of events with `type`, `timestamp`, and optional `data`.

---

### Commands

#### Enqueue a command

```bash
curl -s -X POST http://localhost:3000/commands \
  -H "Content-Type: application/json" \
  -d "{\"type\": \"PrepareFleet\", \"payload\": {\"fleetId\": \"<id>\", \"requiredResources\": {\"FUEL\": 50}}}"
```

Returns `202` with the command in `Queued` state. The command is processed asynchronously; poll `GET /commands/:id` to check completion.

**Supported command types:**

| Type | Effect |
|---|---|
| `PrepareFleet` | Docked → Preparing → reserves resources → Ready (or FailedPreparation) |
| `DeployFleet` | Ready → Deployed (triggers matchmaking if another fleet is waiting) |
| `StartBattle` | Deployed → InBattle for both matched fleets (auto-enqueued by matchmaker) |
| `ResolveBattle` | InBattle → Victorious/Destroyed (auto-enqueued after StartBattle) |

#### Poll command status

```bash
curl -s http://localhost:3000/commands/<id>
```

#### List all commands

```bash
curl -s http://localhost:3000/commands
```

---

### Resources

#### Get resource availability

```bash
curl -s http://localhost:3000/resources
```

Returns availability for all resource types (FUEL, HYPERDRIVE_CORE, BATTLE_DROIDS) with `total`, `reserved`, and `available` fields.


### Full lifecycle example

```bash
# 1. Create two fleets
curl -s -X POST http://localhost:3000/fleets \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"Alpha\", \"requiredResources\": {\"FUEL\": 100}}"

curl -s -X POST http://localhost:3000/fleets \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"Beta\", \"requiredResources\": {\"FUEL\": 50}}"

# 2. Prepare both fleets (copy fleet IDs from responses)
curl -s -X POST http://localhost:3000/commands \
  -H "Content-Type: application/json" \
  -d "{\"type\": \"PrepareFleet\", \"payload\": {\"fleetId\": \"<alpha-id>\", \"requiredResources\": {\"FUEL\": 100}}}"

curl -s -X POST http://localhost:3000/commands \
  -H "Content-Type: application/json" \
  -d "{\"type\": \"PrepareFleet\", \"payload\": {\"fleetId\": \"<beta-id>\", \"requiredResources\": {\"FUEL\": 50}}}"

# 3. Deploy both (triggers matchmaking → battle → resolution automatically)
curl -s -X POST http://localhost:3000/commands \
  -H "Content-Type: application/json" \
  -d "{\"type\": \"DeployFleet\", \"payload\": {\"fleetId\": \"<alpha-id>\"}}"

curl -s -X POST http://localhost:3000/commands \
  -H "Content-Type: application/json" \
  -d "{\"type\": \"DeployFleet\", \"payload\": {\"fleetId\": \"<beta-id>\"}}"

# 4. Check fleets — one will be Victorious, the other Destroyed
curl -s http://localhost:3000/fleets/<alpha-id>
curl -s http://localhost:3000/fleets/<beta-id>
```