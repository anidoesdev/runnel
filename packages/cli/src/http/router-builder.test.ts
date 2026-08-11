import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Delete, Get, Post, RestController } from './decorators.js';
import { buildRouterForController } from './router-builder.js';
import { NotFoundError } from './http-errors.js';
import { buildErrorMiddleware } from './error-middleware.js';
import type { Request, Response } from 'express';

@RestController('/widgets')
class WidgetsController {
  private widgets = new Map<string, { id: string; name: string }>([['1', { id: '1', name: 'Sprocket' }]]);

  @Get('/')
  list() {
    return [...this.widgets.values()];
  }

  @Get('/:id')
  getOne(req: Request) {
    const id = String(req.params.id);
    const widget = this.widgets.get(id);
    if (!widget) throw new NotFoundError(`Widget "${id}" not found`);
    return widget;
  }

  @Post('/')
  create(req: Request, res: Response) {
    const widget = { id: '2', name: String(req.body.name) };
    this.widgets.set(widget.id, widget);
    res.status(201).json(widget);
  }

  @Delete('/:id')
  remove(req: Request, res: Response) {
    this.widgets.delete(String(req.params.id));
    res.status(204).end();
  }

  // Two path segments so this can never collide with the single-segment `/:id` route
  // above, regardless of registration order.
  @Get('/special/boom')
  boom(): never {
    throw new Error('unexpected failure');
  }
}

function buildTestApp() {
  const app = express();
  app.use(express.json());
  const { basePath, router } = buildRouterForController(new WidgetsController());
  app.use(basePath, router);
  app.use(buildErrorMiddleware({ error: () => {} } as never));
  return app;
}

describe('decorator routing layer', () => {
  it('routes GET / to the list handler and auto-JSONs the return value', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/widgets/');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: '1', name: 'Sprocket' }]);
  });

  it('routes GET /:id with a route param', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/widgets/1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: '1', name: 'Sprocket' });
  });

  it('maps a thrown HttpError to its status code and message', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/widgets/missing');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Widget "missing" not found' });
  });

  it('lets a handler take full control of the response (status + body)', async () => {
    const app = buildTestApp();
    const res = await request(app).post('/widgets/').send({ name: 'Gizmo' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: '2', name: 'Gizmo' });
  });

  it('supports a 204 No Content response with no body', async () => {
    const app = buildTestApp();
    const res = await request(app).delete('/widgets/1');
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it('maps an unexpected thrown error to a 500', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/widgets/special/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});
