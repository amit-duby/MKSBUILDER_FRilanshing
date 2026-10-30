const page = (title, body) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { margin: 0; font-family: Georgia, serif; background: #f4f1ea; color: #1f1a14; }
    main { max-width: 420px; margin: 48px auto; padding: 28px; background: #fff; border: 1px solid #e4dccb; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    p { color: #5c5348; line-height: 1.4; }
    label { display: block; margin: 16px 0 6px; font-size: 14px; }
    input { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #cfc4b0; }
    button { margin-top: 18px; padding: 10px 16px; border: 0; background: #8a5a2b; color: #fff; cursor: pointer; }
    [data-message] { min-height: 1.4em; }
    a { color: #8a5a2b; }
  </style>
</head>
<body>
  <main>
    ${body}
    <p data-message></p>
  </main>
  <script src="/password-pages.js"></script>
</body>
</html>`;

function forgotPage(_req, res) {
  res.type('html').send(page(
    'Forgot password',
    `<h1>Forgot password</h1>
     <p>Enter the email on your account. We will send a reset link.</p>
     <form id="forgot-form">
       <label for="email">Email</label>
       <input id="email" name="email" type="email" required autocomplete="username">
       <button type="submit">Send reset link</button>
     </form>
     <p><a href="/password/reset">I already have a reset link</a></p>`
  ));
}

function resetPage(_req, res) {
  res.type('html').send(page(
    'Reset password',
    `<h1>Reset password</h1>
     <p>Choose a new password. The link from your email expires in 15 minutes.</p>
     <form id="reset-form">
       <label for="password">New password</label>
       <input id="password" name="password" type="password" required minlength="8" autocomplete="new-password">
       <label for="confirmPassword">Confirm password</label>
       <input id="confirmPassword" name="confirmPassword" type="password" required minlength="8" autocomplete="new-password">
       <button type="submit">Update password</button>
     </form>
     <p><a href="/forgot-password">Request a new link</a></p>`
  ));
}

function script(_req, res) {
  res.type('application/javascript').send(`
    const message = document.querySelector('[data-message]');

    async function postJson(path, body) {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      message.textContent = payload.message || 'Request failed';
      return response.ok;
    }

    const forgotForm = document.querySelector('#forgot-form');
    if (forgotForm) {
      forgotForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        message.textContent = 'Sending the reset link...';
        await postJson('/api/v1/auth/forgot-password', {
          email: new FormData(forgotForm).get('email'),
        });
      });
    }

    const resetForm = document.querySelector('#reset-form');
    if (resetForm) {
      const pathToken = (location.pathname.match(/^\\/password\\/reset\\/([a-f0-9]{64})$/i) || [])[1] || '';
      const params = new URLSearchParams(location.search);
      let token = pathToken || params.get('token') || sessionStorage.getItem('mksResetToken') || '';
      if (pathToken || params.get('token')) {
        sessionStorage.setItem('mksResetToken', token);
        history.replaceState(null, '', '/password/reset');
      }

      resetForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!token) {
          message.textContent = 'Open the reset link from your email.';
          return;
        }
        const data = new FormData(resetForm);
        message.textContent = 'Updating your password...';
        const ok = await postJson('/api/v1/auth/reset-password/' + encodeURIComponent(token), {
          password: data.get('password'),
          confirmPassword: data.get('confirmPassword'),
        });
        if (ok) {
          sessionStorage.removeItem('mksResetToken');
          token = '';
          resetForm.reset();
        }
      });
    }
  `);
}

module.exports = { forgotPage, resetPage, script };
