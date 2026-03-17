import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export const query = (text, params) => pool.query(text, params);

export const initDatabase = async () => {
  await pool.query('SELECT 1');
  await pool.query(`ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS properties_count INTEGER DEFAULT 0`);
};

export default { pool, query, initDatabase };
