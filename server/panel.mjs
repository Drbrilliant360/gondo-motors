// Helpers shared by every admin and account page: shell rendering, sidebar counts, activity log.
import { one } from './db.mjs';
import { csrfToken } from './security.mjs';
import { panelShell } from '../src/templates/panel/shell.mjs';

async function counts(user) {
  if (user.role === 'admin') {
    const r = await one(`SELECT (SELECT count(*) FROM orders WHERE status = 'pending') AS "pendingOrders",
                                (SELECT count(*) FROM enquiries WHERE status = 'new') AS "newEnquiries"`);
    return r;
  }
  return one('SELECT (SELECT count(*) FROM cart_items WHERE user_id = $1) AS cart', [user.id]);
}

export async function renderPanel(req, res, { active, title, body, scripts = [], status = 200 }) {
  res.status(status).set('Cache-Control', 'no-store').send(panelShell({
    role: req.user.role, active, title, user: req.user, csrf: csrfToken(req), counts: await counts(req.user), scripts, body,
  }));
}

// Every admin change that matters is written here with who did it and when.
export const logActivity = (db, req, action, entityType, entityId, summary, meta = {}) =>
  db.query('INSERT INTO activity_log (actor_id, actor_name, action, entity_type, entity_id, summary, meta, ip) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [req.user.id, req.user.name, action, entityType, entityId, summary, JSON.stringify(meta), req.ip || null]);
