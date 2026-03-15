import { query, initDatabase } from './db.js';

export default async function handler(req, res) {
  try {
    await initDatabase();
    
    // Try a simple query
    const result = await query('SELECT 1 as test');
    
    res.json({ success: true, message: 'Database connected!', test: result.rows[0] });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
}
