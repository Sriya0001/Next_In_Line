const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  user: process.env.POSTGRES_USER || 'nil_user',
  password: process.env.POSTGRES_PASSWORD || 'nil_password',
  database: process.env.POSTGRES_DB || 'next_in_line',
  max: 20,                 // max pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error', err);
});

/**
 * Verifies the database connection is alive.
 */
async function connectDB() {
  const client = await pool.connect();
  await client.query('SELECT 1');
  client.release();
}

/**
 * Execute a query using the shared pool.
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 */
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development' && duration > 200) {
    console.warn(`⚠️  Slow query (${duration}ms):`, text);
  }
  return res;
}

/**
 * Acquire a client from the pool for transactions.
 * Remember to call client.release() when done.
 */
async function getClient() {
  return pool.connect();
}

module.exports = { pool, connectDB, query, getClient };
