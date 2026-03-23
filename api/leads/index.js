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
    console.error('DB init error:', e.message);
  }
  
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { status, city, direction, source, ownerOnly, page = 1, limit = 20 } = req.query;
  const method = req.method;

  try {
    if (method === 'GET') {
      let sql = 'SELECT * FROM leads WHERE user_id = $1';
      const params = [userId];
      let paramIndex = 2;

      if (status) {
        sql += ` AND status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      if (city) {
        sql += ` AND city ILIKE $${paramIndex}`;
        params.push(`%${city}%`);
        paramIndex++;
      }

      if (direction) {
        sql += ` AND metadata->>'ai_listing_direction' = $${paramIndex}`;
        params.push(direction);
        paramIndex++;
      }

      if (source) {
        sql += ` AND metadata->>'source' = $${paramIndex}`;
        params.push(source);
        paramIndex++;
      }

      if (ownerOnly === 'true') {
        sql += ` AND (metadata->>'ai_is_from_owner')::boolean = true`;
      }

      sql += ' ORDER BY created_at DESC';

      const offset = (parseInt(page) - 1) * parseInt(limit);
      sql += ` LIMIT ${parseInt(limit)} OFFSET ${offset}`;

      const result = await query(sql, params);

      let countSql = 'SELECT COUNT(*) FROM leads WHERE user_id = $1';
      const countParams = [userId];
      let countParamIndex = 2;

      if (status) {
        countSql += ` AND status = $${countParamIndex}`;
        countParams.push(status);
        countParamIndex++;
      }

      if (city) {
        countSql += ` AND city ILIKE $${countParamIndex}`;
        countParams.push(`%${city}%`);
        countParamIndex++;
      }

      if (direction) {
        countSql += ` AND metadata->>'ai_listing_direction' = $${countParamIndex}`;
        countParams.push(direction);
        countParamIndex++;
      }

      if (source) {
        countSql += ` AND metadata->>'source' = $${countParamIndex}`;
        countParams.push(source);
      }

      if (ownerOnly === 'true') {
        countSql += ` AND (metadata->>'ai_is_from_owner')::boolean = true`;
      }

      const countResult = await query(countSql, countParams);

      return res.json({
        leads: result.rows,
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        totalPages: Math.ceil(countResult.rows[0].count / limit)
      });
    }

    res.status(404).json({ error: 'Method not found' });
  } catch (error) {
    console.error('Leads API error:', error.message);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
