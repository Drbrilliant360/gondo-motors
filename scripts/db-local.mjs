// Local Postgres for development without Neon (PGlite, data kept in .pgdata/).
// Usage: npm run db:local   then set DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = +process.env.LOCAL_DB_PORT || 5433;
const db = await PGlite.create({ dataDir: join(root, '.pgdata'), extensions: { citext } });
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 20 });
await server.start();
console.log(`Local Postgres ready on postgres://postgres:postgres@127.0.0.1:${port}/postgres`);
const stop = async () => { await server.stop(); await db.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
