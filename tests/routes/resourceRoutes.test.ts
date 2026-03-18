import request from 'supertest';
import { createApp } from '../../src/app';
import { NoopLogger } from '../../src/logger';

describe('Resource Routes', () => {
  it('GET /resources returns all resource pools', async () => {
    const app = createApp({ logger: new NoopLogger() });
    const res = await request(app).get('/resources');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);

    const types = res.body.map((r: { resourceType: string }) => r.resourceType).sort();
    expect(types).toEqual(['BATTLE_DROIDS', 'FUEL', 'HYPERDRIVE_CORE']);
  });

  it('each resource has total, reserved, and available', async () => {
    const app = createApp({ logger: new NoopLogger() });
    const res = await request(app).get('/resources');

    for (const resource of res.body) {
      expect(resource.total).toBeDefined();
      expect(resource.reserved).toBeDefined();
      expect(resource.available).toBeDefined();
      expect(resource.available).toBe(resource.total - resource.reserved);
    }
  });
});
