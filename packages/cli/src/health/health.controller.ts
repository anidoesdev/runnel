import { Get, RestController } from '../http/decorators.js';
import type { DataSource } from 'typeorm';
import type { Response } from 'express';

@RestController('/healthz')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get('/')
  live() {
    return { status: 'ok' };
  }

  @Get('/readiness')
  readiness(_req: unknown, res: Response) {
    if (!this.dataSource.isInitialized) {
      res.status(503).json({ status: 'not ready', reason: 'database not initialized' });
      return;
    }
    res.status(200).json({ status: 'ok' });
  }
}
