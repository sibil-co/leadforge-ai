import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export const query = (text, params) => pool.query(text, params);

export const initDatabase = async () => {
  const createUsersTable = `
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      company VARCHAR(255),
      api_keys JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `;

  const createLeadsTable = `
    CREATE TABLE IF NOT EXISTS leads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      price DECIMAL(12,2),
      city VARCHAR(255),
      source_url TEXT,
      source_type VARCHAR(50) DEFAULT 'group',
      status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'engaging', 'secured', 'dead')),
      facebook_id VARCHAR(255),
      metadata JSONB DEFAULT '{}',
      conversation_history JSONB DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `;

  const createScrapeJobsTable = `
    CREATE TABLE IF NOT EXISTS scrape_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      country VARCHAR(100),
      city VARCHAR(100),
      keywords TEXT[],
      apify_run_id VARCHAR(255),
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
      leads_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      completed_at TIMESTAMP
    );
  `;

  const createIndexes = `
    CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_scrape_jobs_user_id ON scrape_jobs(user_id);
  `;

  try {
    await pool.query(createUsersTable);
    await pool.query(createLeadsTable);
    await pool.query(createScrapeJobsTable);
    await pool.query(createIndexes);
    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

export default { pool, query, initDatabase };
