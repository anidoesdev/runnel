import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { getControllerBasePath, getControllerRoutes } from './decorators.js';

export type ControllerHandler = (req: Request, res: Response) => unknown;

function wrapAsync(handler: ControllerHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(handler(req, res))
      .then((result) => {
        if (!res.headersSent && result !== undefined) {
          res.json(result);
        }
      })
      .catch(next);
  };
}

/** Turns a decorated controller instance into a mountable Express Router at its declared base path. */
export function buildRouterForController(controller: object): { basePath: string; router: Router } {
  const basePath = getControllerBasePath(controller.constructor);
  const routes = getControllerRoutes(controller.constructor);
  const router = Router();

  for (const route of routes) {
    const handler = (controller as Record<string | symbol, ControllerHandler>)[route.handlerName]!.bind(controller);
    router[route.method](route.path, wrapAsync(handler));
  }

  return { basePath, router };
}
