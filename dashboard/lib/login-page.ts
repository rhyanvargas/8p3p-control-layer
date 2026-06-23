const ERROR_BLOCK =
  /\{\{#if error\}\}[\s\S]*?\{\{\/if\}\}/;

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Decision Panel — Access</title>
  <style>
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
      <form method="POST" action="/login">
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderLoginHtml(errorMessage?: string): string {
  const errorHtml =
    errorMessage !== undefined && errorMessage !== ''
      ? `<p class="error" id="error-msg" role="alert">${escapeHtml(errorMessage)}</p>`
      : '';
  return LOGIN_HTML.replace(ERROR_BLOCK, errorHtml);
}

export const RATE_LIMIT_HTML =
  '<!DOCTYPE html><html><body><p>Too many attempts. Try again later.</p></body></html>';
