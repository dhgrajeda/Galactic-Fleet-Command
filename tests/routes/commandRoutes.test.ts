import request from 'supertest';
import { createApp } from '../../src/app';
import { NoopLogger } from '../../src/logger';

describe('Command Routes', () => {
  it('POST /commands returns 202 with queued command', async () => {
    const app = createApp({ logger: new NoopLogger() });
    // Create a fleet first
    const fleet = await request(app).post('/fleets').send({ name: 'Alpha' });

    const res = await request(app).post('/commands').send({
      type: 'PrepareFleet',
      payload: { fleetId: fleet.body.id, requiredResources: { FUEL: 10 } },
    });

    expect(res.status).toBe(202);
    expect(res.body.type).toBe('PrepareFleet');
    expect(res.body.status).toBe('Queued');
    expect(res.body.id).toBeDefined();
  });

  it('POST /commands returns 400 when type is missing', async () => {
    const app = createApp({ logger: new NoopLogger() });
    const res = await request(app).post('/commands').send({ payload: {} });
    expect(res.status).toBe(400);
  });

  it('POST /commands returns 400 for invalid type', async () => {
    const app = createApp({ logger: new NoopLogger() });
    const res = await request(app).post('/commands').send({
      type: 'InvalidType',
      payload: {},
    });
    expect(res.status).toBe(400);
  });

  it('GET /commands returns array', async () => {
    const app = createApp({ logger: new NoopLogger() });
    const res = await request(app).get('/commands');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /commands/:id returns 404 for unknown id', async () => {
    const app = createApp({ logger: new NoopLogger() });
    const res = await request(app).get('/commands/nonexistent');
    expect(res.status).toBe(404);
  });

  it('GET /commands/:id returns the command', async () => {
    const app = createApp({ logger: new NoopLogger() });
    const fleet = await request(app).post('/fleets').send({ name: 'A' });
    const cmd = await request(app).post('/commands').send({
      type: 'PrepareFleet',
      payload: { fleetId: fleet.body.id },
    });

    const res = await request(app).get(`/commands/${cmd.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('PrepareFleet');
  });
});
