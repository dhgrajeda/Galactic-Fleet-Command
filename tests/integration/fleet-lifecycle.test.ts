import request from 'supertest';
import { createApp } from '../../src/app';
import { NoopLogger } from '../../src/logger';

describe('Fleet Lifecycle Integration', () => {
  it('full lifecycle: create → prepare → deploy → battle → resolution', async () => {
    const app = createApp({ logger: new NoopLogger() });

    // Create two fleets
    const fleetA = await request(app).post('/fleets').send({
      name: 'Alpha Squadron',
      requiredResources: { FUEL: 100, BATTLE_DROIDS: 50 },
    });
    expect(fleetA.status).toBe(201);

    const fleetB = await request(app).post('/fleets').send({
      name: 'Beta Squadron',
      requiredResources: { FUEL: 50, BATTLE_DROIDS: 20 },
    });
    expect(fleetB.status).toBe(201);

    // Prepare both fleets
    const prepA = await request(app).post('/commands').send({
      type: 'PrepareFleet',
      payload: { fleetId: fleetA.body.id, requiredResources: { FUEL: 100, BATTLE_DROIDS: 50 } },
    });
    expect(prepA.status).toBe(202);

    // Wait for command processing
    await new Promise((r) => setTimeout(r, 200));

    // Verify fleet A is Ready
    const fleetAReady = await request(app).get(`/fleets/${fleetA.body.id}`);
    expect(fleetAReady.body.state).toBe('Ready');

    const prepB = await request(app).post('/commands').send({
      type: 'PrepareFleet',
      payload: { fleetId: fleetB.body.id, requiredResources: { FUEL: 50, BATTLE_DROIDS: 20 } },
    });
    expect(prepB.status).toBe(202);

    await new Promise((r) => setTimeout(r, 200));

    // Deploy both fleets
    const deployA = await request(app).post('/commands').send({
      type: 'DeployFleet',
      payload: { fleetId: fleetA.body.id },
    });
    expect(deployA.status).toBe(202);

    await new Promise((r) => setTimeout(r, 200));

    const deployB = await request(app).post('/commands').send({
      type: 'DeployFleet',
      payload: { fleetId: fleetB.body.id },
    });
    expect(deployB.status).toBe(202);

    // Wait for deploy + matchmaking + battle start + resolution
    await new Promise((r) => setTimeout(r, 1000));

    // Both fleets should be in terminal state
    const finalA = await request(app).get(`/fleets/${fleetA.body.id}`);
    const finalB = await request(app).get(`/fleets/${fleetB.body.id}`);

    const states = [finalA.body.state, finalB.body.state].sort();
    expect(states).toEqual(['Destroyed', 'Victorious']);

    // Resources should have been reserved
    const resources = await request(app).get('/resources');
    const fuel = resources.body.find((r: { resourceType: string }) => r.resourceType === 'FUEL');
    expect(fuel.reserved).toBe(150); // 100 + 50
  });

  it('preparation fails when resources are insufficient', async () => {
    const app = createApp({ logger: new NoopLogger() });

    const fleet = await request(app).post('/fleets').send({ name: 'Greedy Fleet' });

    await request(app).post('/commands').send({
      type: 'PrepareFleet',
      payload: { fleetId: fleet.body.id, requiredResources: { FUEL: 99999 } },
    });

    await new Promise((r) => setTimeout(r, 200));

    const result = await request(app).get(`/fleets/${fleet.body.id}`);
    expect(result.body.state).toBe('FailedPreparation');
  });

  it('fleet timeline records all events', async () => {
    const app = createApp({ logger: new NoopLogger() });

    const fleet = await request(app).post('/fleets').send({ name: 'Timeline Fleet' });

    await request(app).post('/commands').send({
      type: 'PrepareFleet',
      payload: { fleetId: fleet.body.id, requiredResources: { FUEL: 10 } },
    });

    await new Promise((r) => setTimeout(r, 200));

    const timeline = await request(app).get(`/fleets/${fleet.body.id}/timeline`);
    expect(timeline.status).toBe(200);

    const types = timeline.body.map((e: { type: string }) => e.type);
    expect(types).toContain('FleetCreated');
    expect(types).toContain('FleetPreparationStarted');
    expect(types).toContain('FleetReady');
  });
});
