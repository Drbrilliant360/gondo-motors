import { html } from '../lib.mjs';

// Password pages that sit beside login/signup: forgot, reset (from the emailed link) and the forced first-login change.
const PAGES = {
  forgot: {
    path: 'forgot-password.html', title: 'Forgot your password?', button: 'Send reset link', busy: 'Sending…',
    note: 'Enter the email you registered with and we’ll send you a link to choose a new password.',
    fields: ['email'], foot: 'Remembered it? <a href="login.html">Log in</a>',
  },
  reset: {
    path: 'reset-password.html', title: 'Choose a new password', button: 'Save new password', busy: 'Saving…',
    note: 'Pick a password you don’t use anywhere else.',
    fields: ['password'], foot: 'Link expired? <a href="forgot-password.html">Request a new one</a>',
  },
  'change-password': {
    path: 'change-password.html', title: 'Change your password', button: 'Update password', busy: 'Updating…',
    note: 'For your security, please replace the password you were given before continuing.',
    fields: ['current', 'password'], foot: '',
  },
};
const pw = (id, name, label, autocomplete, strong) => `<div class="field"><label for="${id}">${label} <span class="req" aria-hidden="true">*</span></label>
    <div class="pw"><input class="input" id="${id}" name="${name}" type="password" required ${strong ? 'minlength="8"' : ''} autocomplete="${autocomplete}" placeholder="${strong ? 'At least 8 characters' : 'Your current password'}"><button class="pw-toggle" type="button" aria-label="Show password" aria-pressed="false"><i class="fa-solid fa-eye"></i></button></div>
    ${strong ? '<div class="strength" data-strength aria-hidden="true"><i></i><i></i><i></i></div><p class="hint" data-strength-text>Use 8+ characters with letters and numbers. Add symbols for a stronger password.</p>' : ''}
  </div>`;
const FIELD = {
  email: '<div class="field"><label for="a-email">Email address <span class="req" aria-hidden="true">*</span></label><input class="input" id="a-email" name="email" type="email" inputmode="email" required autocomplete="email" placeholder="name@example.com"></div>',
  current: pw('a-current', 'current', 'Current password', 'current-password', false),
  password: pw('a-pass', 'password', 'New password', 'new-password', true),
};

export function passwordPage(kind) {
  const p = PAGES[kind];
  const body = html`<div class="auth-wrap"><form class="form-card auth-card" data-auth-form="${kind}" novalidate>
  ${kind === 'change-password' ? '' : '<a class="back-link" href="login.html" style="margin-bottom:-4px"><i class="fa-solid fa-arrow-left"></i> Back to log in</a>'}
  <h1>${p.title}</h1>
  <p class="form-note">${p.note}</p>
  <div class="form-summary" role="alert" hidden></div>
  <div class="form-banner success" role="status" data-auth-done hidden></div>
  ${p.fields.map((f) => FIELD[f])}
  <button class="btn btn-primary btn-lg" type="submit" data-busy="${p.busy}">${p.button}</button>
  ${p.foot ? `<p class="foot">${p.foot}</p>` : ''}
</form></div>`;
  return { path: p.path, title: p.title.replace('?', ''), description: 'Gondo Motors account password.', page: kind, body };
}
