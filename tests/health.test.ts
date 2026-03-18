import request from 'supertest';

import { createApp } from '../src/app';
import { NoopLogger } from '../src/logger';

describe('GET /health', () => {
  it('returns ok', async () => {
    const app = createApp({ logger: new NoopLogger() });

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
}
);

