/**
 * Demo script: showcases a full battle between four fleets.
 *
 * Usage:
 *   npx ts-node scripts/demo-battle.ts
 */

import { createApp } from '../src/app';
import http from 'http';
import { NoopLogger } from '../src/logger';

const PORT = 0; // let OS pick a free port

const app = createApp({ logger: new NoopLogger() });

// ── helpers ──────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`\n${'─'.repeat(60)}\n${msg}\n${'─'.repeat(60)}`);
}

function printFleet(fleet: Record<string, unknown>) {
  console.log(`  ID:        ${fleet.id}`);
  console.log(`  Name:      ${fleet.name}`);
  console.log(`  State:     ${fleet.state}`);
  console.log(`  Reserved:  ${JSON.stringify(fleet.reservedResources)}`);
}

function printCommand(cmd: Record<string, unknown>) {
  console.log(`  ID:     ${cmd.id}`);
  console.log(`  Type:   ${cmd.type}`);
  console.log(`  Status: ${cmd.status}`);
}

function printTimeline(events: Array<{ type: string; timestamp: string }>) {
  for (const e of events) {
    const time = new Date(e.timestamp).toLocaleTimeString();
    console.log(`  [${time}] ${e.type}`);
  }
}

async function request(
  base: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const url = `${base}${path}`;
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return (await res.json()) as Record<string, unknown>;
}

async function waitForCommand(base: string, cmdId: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < 30; i++) {
    const cmd = await request(base, 'GET', `/commands/${cmdId}`);
    if (cmd.status === 'Succeeded' || cmd.status === 'Failed') return cmd;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Command ${cmdId} did not complete in time`);
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : PORT;
  const base = `http://localhost:${port}`;
  console.log(`\nServer started on port ${port}\n`);

  try {
    // ── Check resources ──────────────────────────────────────────────────
    log('RESOURCE AVAILABILITY');
    const resources = (await request(base, 'GET', '/resources')) as unknown as Array<Record<string, unknown>>;
    for (const r of resources) {
      console.log(`  ${r.resourceType}: ${r.available} / ${r.total} available`);
    }

    // ── Create fleets ────────────────────────────────────────────────────
    log('CREATING FOUR FLEETS');

    const fleets = [];
    const fleetConfigs = [
      { name: 'Alpha Squadron',   resources: { FUEL: 200, BATTLE_DROIDS: 100, HYPERDRIVE_CORE: 2 } },
      { name: 'Beta Wing',        resources: { FUEL: 1000, BATTLE_DROIDS: 50 } },
      { name: 'Gamma Armada',     resources: { FUEL: 300, BATTLE_DROIDS: 150, HYPERDRIVE_CORE: 3 } },
      { name: 'Delta Patrol',     resources: { FUEL: 50,  BATTLE_DROIDS: 20 } },
    ];

    for (const cfg of fleetConfigs) {
      const fleet = await request(base, 'POST', '/fleets', {
        name: cfg.name,
        ships: [
          { id: `${cfg.name}-s1`, name: 'Cruiser', class: 'Capital' },
          { id: `${cfg.name}-s2`, name: 'Fighter', class: 'Fighter' },
        ],
        requiredResources: cfg.resources,
      });
      fleets.push(fleet);
      console.log(`\n  Created: ${fleet.name} (${fleet.id})`);
      console.log(`  Required resources: ${JSON.stringify(cfg.resources)}`);
    }

    // ── Prepare fleets ───────────────────────────────────────────────────
    log('PREPARING ALL FLEETS (reserving resources)');

    for (const fleet of fleets) {
      const cmd = await request(base, 'POST', '/commands', {
        type: 'PrepareFleet',
        payload: {
          fleetId: fleet.id,
          requiredResources: fleetConfigs[fleets.indexOf(fleet)].resources,
        },
      });
      const result = await waitForCommand(base, cmd.id as string);
      const updated = await request(base, 'GET', `/fleets/${fleet.id}`);

      console.log(`\n  ${fleet.name}:`);
      console.log(`    Command: ${result.status}`);
      console.log(`    State:   ${updated.state}`);
      console.log(`    Reserved: ${JSON.stringify(updated.reservedResources)}`);
    }

    // ── Check resources after reservation ────────────────────────────────
    log('RESOURCE AVAILABILITY AFTER PREPARATION');
    const resourcesAfter = (await request(base, 'GET', '/resources')) as unknown as Array<Record<string, unknown>>;
    for (const r of resourcesAfter) {
      console.log(`  ${r.resourceType}: ${r.available} / ${r.total} available (${r.reserved} reserved)`);
    }

    // ── Deploy fleets ────────────────────────────────────────────────────
    log('DEPLOYING ALL READY FLEETS');

    for (const fleet of fleets) {
      const current = await request(base, 'GET', `/fleets/${fleet.id}`);
      if (current.state !== 'Ready') {
        console.log(`\n  ${fleet.name}: Skipping (state: ${current.state})`);
        continue;
      }

      const cmd = await request(base, 'POST', '/commands', {
        type: 'DeployFleet',
        payload: { fleetId: fleet.id },
      });
      const result = await waitForCommand(base, cmd.id as string);
      console.log(`\n  ${fleet.name}: Deploy command ${result.status}`);
    }

    // ── Wait for matchmaking + battles to resolve ────────────────────────
    log('WAITING FOR MATCHMAKING & BATTLE RESOLUTION...');
    await new Promise((r) => setTimeout(r, 2000));

    // ── Show battle results ─────────────────────────────────────────────
    log('BATTLE RESULTS');
    const battles = (await request(base, 'GET', '/battles')) as unknown as Array<Record<string, unknown>>;

    if (battles.length === 0) {
      console.log('  No battles occurred.');
    }

    for (const battle of battles) {
      const fleetA = battle.fleetA as Record<string, unknown> | null;
      const fleetB = battle.fleetB as Record<string, unknown> | null;

      console.log(`\n  Battle: ${battle.id}`);
      console.log(`  Status: ${battle.status}`);
      console.log(`  ┌──────────────────────────────────────────────┐`);
      console.log(`  │  ${String(fleetA?.name ?? '???').padEnd(20)} vs ${String(fleetB?.name ?? '???').padStart(20)}  │`);
      console.log(`  └──────────────────────────────────────────────┘`);

      if (battle.winnerName) {
        console.log(`  🏆 Winner: ${battle.winnerName}`);
        console.log(`  💀 Loser:  ${battle.loserName}`);
      }

      if (fleetA?.reservedResources || fleetB?.reservedResources) {
        console.log(`\n  Resource comparison:`);
        const resA = (fleetA?.reservedResources ?? {}) as Record<string, number>;
        const resB = (fleetB?.reservedResources ?? {}) as Record<string, number>;
        const allKeys = new Set([...Object.keys(resA), ...Object.keys(resB)]);
        for (const key of allKeys) {
          const valA = resA[key] ?? 0;
          const valB = resB[key] ?? 0;
          const indicator = valA > valB ? '◀' : valA < valB ? '▶' : '=';
          console.log(`    ${key.padEnd(18)} ${String(valA).padStart(5)}  ${indicator}  ${String(valB).padStart(5)}`);
        }
      }
    }

    // ── Show final fleet states ──────────────────────────────────────────
    log('FINAL FLEET STATES');

    for (const fleet of fleets) {
      const final = await request(base, 'GET', `/fleets/${fleet.id}`);
      console.log(`\n  ${fleet.name}:`);
      printFleet(final);
    }

    // ── Show timelines ───────────────────────────────────────────────────
    log('FLEET TIMELINES');

    for (const fleet of fleets) {
      const timeline = (await request(base, 'GET', `/fleets/${fleet.id}/timeline`)) as unknown as Array<{ type: string; timestamp: string }>;
      console.log(`\n  ${fleet.name}:`);
      printTimeline(timeline);
    }

    // ── Show all commands ────────────────────────────────────────────────
    log('ALL COMMANDS PROCESSED');
    const allCmds = (await request(base, 'GET', '/commands')) as unknown as Array<Record<string, unknown>>;
    console.log(`  Total: ${allCmds.length} commands\n`);
    for (const cmd of allCmds) {
      console.log(`  [${cmd.status}] ${cmd.type}`);
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log('  DEMO COMPLETE');
    console.log(`${'═'.repeat(60)}\n`);
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
