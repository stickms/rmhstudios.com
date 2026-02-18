const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  try {
    const client = await pool.connect();
    const res = await client.query('SELECT COUNT(*) FROM "EchoesPlayer"');
    console.log('Row count:', res.rows[0].count);
    const top = await client.query('SELECT * FROM "EchoesPlayer" LIMIT 5');
    console.log('Top rows:', JSON.stringify(top.rows, null, 2));
    client.release();
  } catch (err) {
    console.error('DB Error:', err.message);
  } finally {
    pool.end();
  }
}
check();
