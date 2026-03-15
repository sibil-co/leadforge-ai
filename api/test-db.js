import { query, initDatabase } from '../../db.js';

export default async function handler(req, res) {
  try {
    await initDatabase();
    res.json({ success: true, message: 'DB works' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
}
