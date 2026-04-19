const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  user: process.env.POSTGRES_USER || 'nil_user',
  password: process.env.POSTGRES_PASSWORD || 'nil_password',
  database: process.env.POSTGRES_DB || 'next_in_line',
  max: 50,                 // increased pool size for high concurrency bursts
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // increased timeout
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
 * Execute a callback within a managed transaction.
 * Automatically retries on serialization failures (40001) and deadlocks (40P01).
 * 
 * @param {Function} callback - Async function receiving (client).
 * @param {Object} options - { maxRetries: 5, isolationLevel: 'SERIALIZABLE' }
 */
async function withTransaction(callback, options = {}) {
  const { maxRetries = 5, isolationLevel = 'SERIALIZABLE' } = options;
  let client = await pool.connect();
  let attempt = 0;

  while (true) {
    attempt++;
    try {
      if (isolationLevel) {
        await client.query(`BEGIN TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
      } else {
        await client.query('BEGIN');
      }

      const result = await callback(client);
      await client.query('COMMIT');
      return result;

    } catch (err) {
      await client.query('ROLLBACK');

      const isRetryable = err.code === '40001' || err.code === '40P01';
      if (isRetryable && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 100 + Math.random() * 100;
        if (process.env.NODE_ENV !== 'test') {
          console.warn(`🔄 Serialization conflict (attempt ${attempt}). Retrying in ${Math.round(delay)}ms...`);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Re-acquire client if the connection was terminated
        if (err.message && err.message.includes('terminated')) {
          client.release();
          client = await pool.connect();
        }
        continue;
      }

      client.release();
      throw err;
    }
  }
}

/**
 * Acquire a client from the pool for transactions.
 * Remember to call client.release() when done.
 */
async function getClient() {
  return pool.connect();
}

module.exports = { pool, connectDB, query, getClient, withTransaction };
