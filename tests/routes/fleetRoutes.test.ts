import request from 'supertest';
import { createApp } from '../../src/app';
import { NoopLogger } from '../../src/logger';

const app = createApp({ logger: new NoopLogger() });

describe('Fleet Routes', () => {
  describe('POST /fleets', () => {
    it('creates a fleet and returns 201', async () => {
      const res = await request(app)
        .post('/fleets')
        .send({ name: 'Alpha Squadron' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Alpha Squadron');
      expect(res.body.state).toBe('Docked');
      expect(res.body.id).toBeDefined();
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app).post('/fleets').send({});
      expect(res.status).toBe(400);
    });

    it('accepts ships and requiredResources', async () => {
      const res = await request(app).post('/fleets').send({
        name: 'Beta',
        ships: [{ id: 's1', name: 'X-Wing', class: 'Fighter' }],
        requiredResources: { FUEL: 50 },
      });

      expect(res.status).toBe(201);
      expect(res.body.ships).toHaveLength(1);
      expect(res.body.requiredResources).toEqual({ FUEL: 50 });
    });
  });

  describe('GET /fleets/:id', () => {
    it('returns the fleet', async () => {
      const create = await request(app).post('/fleets').send({ name: 'Gamma' });
      const res = await request(app).get(`/fleets/${create.body.id}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Gamma');
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app).get('/fleets/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /fleets/:id/timeline', () => {
    it('returns the fleet timeline', async () => {
      const create = await request(app).post('/fleets').send({ name: 'Delta' });
      const res = await request(app).get(`/fleets/${create.body.id}/timeline`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].type).toBe('FleetCreated');
    });
  });

  describe('PATCH /fleets/:id', () => {
    it('updates the fleet name', async () => {
      const create = await request(app).post('/fleets').send({ name: 'Old' });
      const res = await request(app)
        .patch(`/fleets/${create.body.id}`)
        .send({ version: create.body.version, name: 'New' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('New');
    });

    it('returns 400 when version is missing', async () => {
      const create = await request(app).post('/fleets').send({ name: 'A' });
      const res = await request(app)
        .patch(`/fleets/${create.body.id}`)
        .send({ name: 'B' });
      expect(res.status).toBe(400);
    });

    it('returns 409 on version conflict', async () => {
      const create = await request(app).post('/fleets').send({ name: 'A' });
      // Update once
      await request(app)
        .patch(`/fleets/${create.body.id}`)
        .send({ version: create.body.version, name: 'B' });
      // Try with stale version
      const res = await request(app)
        .patch(`/fleets/${create.body.id}`)
        .send({ version: create.body.version, name: 'C' });
      expect(res.status).toBe(409);
    });
  });

  describe('GET /fleets', () => {
    it('returns an array', async () => {
      const freshApp = createApp({ logger: new NoopLogger() });
      const res = await request(freshApp).get('/fleets');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
