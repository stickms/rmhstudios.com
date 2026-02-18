const { Pool, neonConfig } = require('@neondatabase/serverless');
const { WebSocket } = require('ws');
const dotenv = require('dotenv');

dotenv.config();
neonConfig.webSocketConstructor = WebSocket;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const sql = `
CREATE TABLE IF NOT EXISTS "EchoesPlayer" (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      TEXT NOT NULL UNIQUE,
    "bestTime"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalKills"  INTEGER NOT NULL DEFAULT 0,
    "totalXP"     INTEGER NOT NULL DEFAULT 0,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 1,
    "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "EchoesPlayer" ADD COLUMN IF NOT EXISTS "totalXP" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_echoes_best_time  ON "EchoesPlayer" ("bestTime" DESC);
CREATE INDEX IF NOT EXISTS idx_echoes_kills      ON "EchoesPlayer" ("totalKills" DESC);
CREATE INDEX IF NOT EXISTS idx_echoes_xp         ON "EchoesPlayer" ("totalXP" DESC);
`;

async function sync() {
  console.log('Connecting to database...');
  try {
    const client = await pool.connect();
    console.log('Connected. Running migrations...');
    await client.query(sql);
    console.log('Migration successful.');
    
    console.log('Inserting test row...');
    await client.query(`
      INSERT INTO "EchoesPlayer" (id, username, "bestTime", "totalKills", "totalXP", "gamesPlayed", "updatedAt")
      VALUES (gen_random_uuid(), 'SystemTest', 150.5, 20, 100, 1, NOW())
      ON CONFLICT (username) DO NOTHING
    `);

    const countRes = await client.query('SELECT COUNT(*) FROM "EchoesPlayer"');
    console.log('Current row count in EchoesPlayer:', countRes.rows[0].count);
    
    const topRes = await client.query('SELECT * FROM "EchoesPlayer" ORDER BY "bestTime" DESC LIMIT 5');
    console.log('Top rows:', JSON.stringify(topRes.rows, null, 2));

    client.release();
  } catch (err) {
    console.error('Operation failed:', err.message);
  } finally {
    pool.end();
  }
}

sync();
