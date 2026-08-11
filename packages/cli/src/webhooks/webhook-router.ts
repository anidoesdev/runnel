import { Router } from 'express';
import type { ActiveWorkflowManager } from '../active-workflows/active-workflow-manager.js';
import type { IDataObject } from '@n8n-clone/workflow';

/**
 * Mounted at /webhook — dispatches any HTTP method/path to whichever active workflow's
 * webhook node registered it. Built as a plain Router (not a decorator @RestController)
 * because the set of valid paths is dynamic (workflows activate/deactivate at runtime), not
 * a fixed list known at startup; `router.use` (rather than a wildcard route pattern) matches
 * every method and every sub-path under the mount point, and `req.path` here is already
 * relative to it.
 */
export function buildWebhookRouter(activeWorkflowManager: ActiveWorkflowManager): Router {
  const router = Router();

  router.use((req, res, next) => {
    activeWorkflowManager
      .handleWebhookRequest(req.method, req.path, {
        headers: req.headers as IDataObject,
        body: req.body as unknown,
        query: req.query as IDataObject,
      })
      .then((result) => {
        if (!result) {
          res.status(404).json({ message: `No registered webhook for ${req.method} ${req.path}` });
          return;
        }
        res.status(result.status);
        if (result.body === undefined) {
          res.end();
        } else {
          res.json(result.body);
        }
      })
      .catch(next);
  });

  return router;
}
