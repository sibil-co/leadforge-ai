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
  await pool.query(`ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS group_urls TEXT[]`);
  await pool.query(`ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS results_limit INTEGER DEFAULT 20`);
  await pool.query(`ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS posts_count INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_analyzed BOOLEAN DEFAULT false`);
  // Mark all existing leads as analyzed so they continue to show in Properties/Leads pages
  await pool.query(`UPDATE leads SET is_analyzed = true WHERE is_analyzed IS NULL OR is_analyzed = false AND metadata->>'ai_listing_direction' IS NOT NULL`);
};

export default { pool, query, initDatabase };
