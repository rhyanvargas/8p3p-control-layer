import { timingSafeEqual } from 'crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  SESSION_COOKIE_NAME,
  buildSetCookieAttributes,
  signSession,
} from './session-cookie.js';
import { clearFailures, recordFailure } from './login-rate-limiter.js';

const ERROR_BLOCK =
  /\{\{#if error\}\}[\s\S]*?\{\{\/if\}\}/;

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Decision Panel — Access</title>
  <style>
    /* 8P3P brand tokens inline — no external CSS dependency */
    body { font-family: Inter, system-ui, sans-serif; background: #ffffff; color: #111111; margin: 0; }
    .topbar { background: #000000; padding: 16px 24px; }
    .topbar h1 { color: #ffffff; font-size: 18px; margin: 0; font-weight: 600; }
    .container { max-width: 400px; margin: 80px auto; padding: 0 24px; }
    .card { border: 1px solid #e5e1dc; border-radius: 8px; padding: 32px; }
    h2 { font-size: 20px; margin: 0 0 8px; }
    p { color: #6b7280; font-size: 14px; margin: 0 0 24px; }
    label { display: block; font-size: 14px; font-weight: 500; margin-bottom: 6px; }
    input[type="password"] {
      width: 100%; padding: 10px 12px; border: 1px solid #e5e1dc;
      border-radius: 6px; font-size: 14px; box-sizing: border-box;
    }
    input:focus { outline: 2px solid #111111; outline-offset: 1px; }
    button {
      width: 100%; padding: 10px; margin-top: 16px; background: #111111;
      color: #ffffff; border: none; border-radius: 6px; font-size: 14px;
      font-weight: 500; cursor: pointer;
    }
    button:hover { background: #333333; }
    .error { color: #dc2626; font-size: 13px; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="topbar"><h1>8P3P</h1></div>
  <div class="container">
    <div class="card">
      <h2>Decision Panel</h2>
      <p>Enter the access code provided by your school's IT administrator.</p>
      <form method="POST" action="/dashboard/login">
        <label for="passphrase">Access Code</label>
        <input type="password" id="passphrase" name="passphrase"
               required autocomplete="off" aria-describedby="error-msg">
        {{#if error}}<p class="error" id="error-msg" role="alert">{{error}}</p>{{/if}}
        <button type="submit">Continue</button>
      </form>
    </div>
  </div>
</body>
</html>`;

function isGateEnabled(): boolean {
  const code = process.env.DASHBOARD_ACCESS_CODE?.trim() ?? '';
  return code.length > 0;
}

function assertDashboardAuthConfig(): void {
  if (!isGateEnabled()) {
    return;
  }
  const secret = process.env.COOKIE_SECRET ?? '';
  if (!secret || secret.length < 32) {
    throw new Error(
      'DASHBOARD_ACCESS_CODE is set but COOKIE_SECRET is missing or shorter than 32 characters. Generate with: openssl rand -hex 32'
    );
  }
}

function renderLoginHtml(errorMessage?: string): string {
  const errorHtml =
    errorMessage !== undefined && errorMessage !== ''
      ? `<p class="error" id="error-msg" role="alert">${escapeHtml(errorMessage)}</p>`
      : '';
  return LOGIN_HTML.replace(ERROR_BLOCK, errorHtml);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function passphrasesMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

function getClientIp(request: FastifyRequest): string {
  return request.ip;
}

export function registerDashboardLoginRoutes(fastify: FastifyInstance): void {
  assertDashboardAuthConfig();

  fastify.get('/dashboard/login', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isGateEnabled()) {
      return reply.status(404).send('Not Found');
    }
    const showError = request.query && typeof request.query === 'object' && 'error' in request.query;
    const errorParam = showError ? String((request.query as Record<string, unknown>).error ?? '') : '';
    const html =
      errorParam === '1' || errorParam === 'true'
        ? renderLoginHtml('Invalid access code')
        : renderLoginHtml();
    return reply.type('text/html; charset=utf-8').send(html);
  });

  fastify.post('/dashboard/login', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isGateEnabled()) {
      return reply.status(404).send('Not Found');
    }

    const expected = process.env.DASHBOARD_ACCESS_CODE?.trim() ?? '';
    const ip = getClientIp(request);
    const body = request.body as Record<string, unknown> | undefined;
    const rawPass = body?.passphrase;
    const provided = typeof rawPass === 'string' ? rawPass : '';

    if (!passphrasesMatch(provided, expected)) {
      const { blocked, retryAfterSeconds } = recordFailure(ip);
      if (blocked) {
        if (retryAfterSeconds !== undefined) {
          void reply.header('Retry-After', String(retryAfterSeconds));
        }
        return reply
          .status(429)
          .type('text/html; charset=utf-8')
          .send('<!DOCTYPE html><html><body><p>Too many attempts. Try again later.</p></body></html>');
      }
      return reply
        .status(200)
        .type('text/html; charset=utf-8')
        .send(renderLoginHtml('Invalid access code'));
    }

    clearFailures(ip);
    const cookieSecret = process.env.COOKIE_SECRET ?? '';
    const ttlHours = Number(process.env.DASHBOARD_SESSION_TTL_HOURS ?? 8);
    const ttlHoursSafe = Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : 8;
    const maxAgeSeconds = Math.floor(ttlHoursSafe * 3600);
    const signed = signSession(cookieSecret, maxAgeSeconds);
    const secure = process.env.NODE_ENV === 'production';
    void reply.setCookie(
      SESSION_COOKIE_NAME,
      signed,
      buildSetCookieAttributes({ maxAgeSeconds, secure }),
    );
    return reply.redirect('/dashboard', 302);
  });

  fastify.get('/dashboard/logout', async (_request: FastifyRequest, reply: FastifyReply) => {
    void reply.clearCookie(SESSION_COOKIE_NAME, { path: '/dashboard' });
    // When the gate is disabled (local dev), /dashboard/login returns 404, so
    // redirect to the SPA root instead of the login form to avoid a confusing
    // 302 → 404 chain on logout.
    if (!isGateEnabled()) {
      return reply.redirect('/dashboard/', 302);
    }
    return reply.redirect('/dashboard/login', 302);
  });
}
