import { auth } from "@clerk/nextjs/server";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

export async function readJson<T>(request: Request) {
  try {
    return await request.json() as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

export function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, `${field} is required`);
  return value.trim();
}

export function requireName(value: unknown) {
  const name = requireString(value, "name");
  if (name.length > 80) throw new HttpError(400, "name must be 80 characters or fewer");
  return name;
}

export async function requireUserId() {
  const { userId } = await auth();
  if (!userId) throw new HttpError(401, "Authentication required");
  return userId;
}

export function publicOrigin(request: Request) {
  return (process.env.PUBLIC_WEB_URL || new URL(request.url).origin).replace(/\/$/, "");
}

export async function routeParam(params: Promise<Record<string, string>>, name: string) {
  return requireString((await params)[name], name);
}

type RouteContext = { params: Promise<Record<string, string>> };

export function handle(handler: (request: Request, context: RouteContext) => Promise<Response>) {
  return async (request: Request, context: RouteContext) => {
    try {
      return await handler(request, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`${request.method} ${new URL(request.url).pathname} failed: ${message}`);
      return json({ error: message }, error instanceof HttpError ? error.status : 500);
    }
  };
}
