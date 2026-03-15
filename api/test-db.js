import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const query = (text, params) => pool.query(text, params);

const initDatabase = async () => {
  // Tables already created, just connect
  await pool.query('SELECT 1');
};

export default async function handler(req, res) {
  try {
    await initDatabase();
    res.json({ success: true, message: 'DB works' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
}
