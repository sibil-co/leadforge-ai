import jwt from 'jsonwebtoken';
import { query, initDatabase } from './db.js';

const getUserId = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    return decoded.userId;
  } catch {
    return null;
  }
};

export default async function handler(req, res) {
  try {
    await initDatabase();
  } catch (e) {
    console.error('DB init error:', e);
  }
  
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { status, city, search, page = 1, limit = 20, id } = req.query;
  const method = req.method;

  try {
    if (method === 'GET' && id) {
      const result = await query(
        'SELECT * FROM leads WHERE id = $1 AND user_id = $2',
        [id, userId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Lead not found' });
      }
      return res.json(result.rows[0]);
    }

    if (method === 'GET') {
      let whereClause = 'WHERE user_id = $1';
      const params = [userId];
      let paramIndex = 2;

      if (status) {
        whereClause += ` AND status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      if (city) {
        whereClause += ` AND city ILIKE $${paramIndex}`;
        params.push(`%${city}%`);
        paramIndex++;
      }

      if (search) {
        whereClause += ` AND (name ILIKE $${paramIndex} OR city ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      const offset = (parseInt(page) - 1) * parseInt(limit);
      params.push(parseInt(limit), offset);

      const result = await query(
        `SELECT * FROM leads ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        params
      );

      const countResult = await query(
        `SELECT COUNT(*) FROM leads ${whereClause}`,
        params.slice(0, 2)
      );

      return res.json({
        leads: result.rows,
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        totalPages: Math.ceil(countResult.rows[0].count / limit)
      });
    }

    res.status(404).json({ error: 'Not found' });
  } catch (error) {
    console.error('Leads API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
