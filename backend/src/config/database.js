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
      status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'engaging', 'secured', 'dead', 'unfiltered')),
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
      actor_id VARCHAR(255),
      apify_run_id VARCHAR(255),
      stage VARCHAR(20) DEFAULT 'groups' CHECK (stage IN ('groups', 'posts', 'comments', 'completed', 'failed')),
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'partial', 'cancelled')),
      groups_found INTEGER DEFAULT 0,
      posts_scraped INTEGER DEFAULT 0,
      comments_analyzed INTEGER DEFAULT 0,
      leads_count INTEGER DEFAULT 0,
      retry_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      completed_at TIMESTAMP
    );
  `;

  const createScrapedGroupsTable = `
    CREATE TABLE IF NOT EXISTS scraped_groups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id UUID REFERENCES scrape_jobs(id) ON DELETE CASCADE,
      group_id VARCHAR(255),
      group_name VARCHAR(255),
      group_url TEXT,
      member_count INTEGER,
      posts_count INTEGER,
      scrape_status VARCHAR(20) DEFAULT 'pending' CHECK (scrape_status IN ('pending', 'scraping', 'posts_scraped', 'comments_scraped', 'failed')),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `;

  const createScrapedPostsTable = `
    CREATE TABLE IF NOT EXISTS scraped_posts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id UUID REFERENCES scrape_jobs(id) ON DELETE CASCADE,
      group_id UUID REFERENCES scraped_groups(id),
      post_id VARCHAR(255),
      post_url TEXT,
      text TEXT,
      images JSONB DEFAULT '[]',
      price DECIMAL(12,2),
      area DECIMAL(10,2),
      city VARCHAR(255),
      location TEXT,
      created_at TIMESTAMP,
      likes_count INTEGER DEFAULT 0,
      comments_count INTEGER DEFAULT 0,
      keywords_matched TEXT[] DEFAULT '{}',
      scrape_status VARCHAR(20) DEFAULT 'pending' CHECK (scrape_status IN ('pending', 'scraping', 'comments_scraped', 'failed')),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `;

  const createLeadsTable = `
    CREATE TABLE IF NOT EXISTS leads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      price DECIMAL(12,2),
      area DECIMAL(10,2),
      city VARCHAR(255),
      source_url TEXT,
      status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'engaging', 'secured', 'dead', 'unfiltered')),
      post_id UUID REFERENCES scraped_posts(id),
      is_from_comment BOOLEAN DEFAULT false,
      comment_id VARCHAR(255),
      comment_text TEXT,
      metadata JSONB DEFAULT '{}',
      conversation_history JSONB DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `;

  const createIndexes = `
    CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_post_id ON leads(post_id);
    CREATE INDEX IF NOT EXISTS idx_scrape_jobs_user_id ON scrape_jobs(user_id);
    CREATE INDEX IF NOT EXISTS idx_scraped_groups_job_id ON scraped_groups(job_id);
    CREATE INDEX IF NOT EXISTS idx_scraped_posts_job_id ON scraped_posts(job_id);
    CREATE INDEX IF NOT EXISTS idx_scraped_posts_group_id ON scraped_posts(group_id);
  `;

  try {
    await pool.query(createUsersTable);
    await pool.query(createLeadsTable);
    await pool.query(createScrapeJobsTable);
    await pool.query(createScrapedGroupsTable);
    await pool.query(createScrapedPostsTable);
    await pool.query(createIndexes);
    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

export default { pool, query, initDatabase };
