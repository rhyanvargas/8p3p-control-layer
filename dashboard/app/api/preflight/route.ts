import { getServerEnv } from '@/lib/env';
import { getServerOrgId } from '@/lib/org-id';

const PREFLIGHT_BODY_LIMIT = 32_768;
const UPSTREAM_TIMEOUT_MS = 10_000;

export async function POST(request: Request): Promise<Response> {
  const env = getServerEnv();
  const orgId = getServerOrgId();

  if (!env.CONTROL_LAYER_ADMIN_API_KEY) {
    return Response.json({ disabled: true });
  }

  const rawBody = await request.text();
  if (rawBody.length > PREFLIGHT_BODY_LIMIT) {
    return Response.json({ error: 'payload_too_large' }, { status: 413 });
  }

  let body: { source_system?: string; payload?: unknown };
  try {
    body = JSON.parse(rawBody) as { source_system?: string; payload?: unknown };
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!body.source_system || body.payload === undefined) {
    return Response.json(
      { error: 'source_system and payload are both required.' },
      { status: 400 }
    );
  }

  const upstreamUrl = new URL('/v1/admin/ingestion/preflight', env.CONTROL_LAYER_API_BASE_URL);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  const upstreamBody: Record<string, unknown> = { payload: body.payload };
  if (orgId) {
    upstreamBody.org_id = orgId;
    upstreamBody.source_system = body.source_system;
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-admin-api-key': env.CONTROL_LAYER_ADMIN_API_KEY,
      },
      body: JSON.stringify(upstreamBody),
      signal: controller.signal,
      cache: 'no-store',
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { 'content-type': 'application/json' },
    });
  } catch {
    return Response.json({ error: 'preflight_upstream_unavailable' }, { status: 502 });
  } finally {
    clearTimeout(timeoutId);
  }
}
