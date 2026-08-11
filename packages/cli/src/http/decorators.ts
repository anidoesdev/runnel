import 'reflect-metadata';

/**
 * A thin decorator-based routing layer over Express so controllers stay declarative:
 *
 *   @RestController('/workflows')
 *   class WorkflowsController {
 *     @Get('/:id')
 *     async getOne(req: Request) { ... }
 *   }
 *
 * This is deliberately minimal — no param decorators, no dependency injection container.
 * Controllers receive the raw Express (req, res) and either return a value (auto-JSON'd) or
 * write to `res` themselves.
 */
const CONTROLLER_BASE_PATH = Symbol('controllerBasePath');
const ROUTES = Symbol('routes');

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface IRouteDefinition {
  method: HttpMethod;
  path: string;
  handlerName: string | symbol;
}

export function RestController(basePath: string): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(CONTROLLER_BASE_PATH, basePath, target);
  };
}

function createMethodDecorator(method: HttpMethod) {
  return (path = ''): MethodDecorator => {
    return (target, propertyKey) => {
      const existingRoutes: IRouteDefinition[] = Reflect.getMetadata(ROUTES, target.constructor) ?? [];
      existingRoutes.push({ method, path, handlerName: propertyKey });
      Reflect.defineMetadata(ROUTES, existingRoutes, target.constructor);
    };
  };
}

export const Get = createMethodDecorator('get');
export const Post = createMethodDecorator('post');
export const Put = createMethodDecorator('put');
export const Patch = createMethodDecorator('patch');
export const Delete = createMethodDecorator('delete');

export function getControllerBasePath(target: object): string {
  return (Reflect.getMetadata(CONTROLLER_BASE_PATH, target) as string | undefined) ?? '';
}

export function getControllerRoutes(target: object): IRouteDefinition[] {
  return (Reflect.getMetadata(ROUTES, target) as IRouteDefinition[] | undefined) ?? [];
}
