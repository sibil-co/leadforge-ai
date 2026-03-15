import { query } from '../config/database.js';

export const getLeads = async (req, res) => {
  try {
    const { status, city, search, page = 1, limit = 20 } = req.query;
    const userId = req.userId;

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

    const offset = (page - 1) * limit;
    params.push(limit, offset);

    const result = await query(
      `SELECT * FROM leads ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM leads ${whereClause}`,
      params.slice(0, -2)
    );

    res.json({
      leads: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(countResult.rows[0].count / limit)
    });
  } catch (error) {
    console.error('GetLeads error:', error);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
};

export const getLead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const result = await query(
      'SELECT * FROM leads WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('GetLead error:', error);
    res.status(500).json({ error: 'Failed to fetch lead' });
  }
};

export const updateLead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const { status, name, price, city, metadata } = req.body;

    const updates = [];
    const params = [id, userId];
    let paramIndex = 3;

    if (status) {
      updates.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }
    if (name) {
      updates.push(`name = $${paramIndex}`);
      params.push(name);
      paramIndex++;
    }
    if (price !== undefined) {
      updates.push(`price = $${paramIndex}`);
      params.push(price);
      paramIndex++;
    }
    if (city) {
      updates.push(`city = $${paramIndex}`);
      params.push(city);
      paramIndex++;
    }
    if (metadata) {
      updates.push(`metadata = $${paramIndex}`);
      params.push(JSON.stringify(metadata));
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = NOW()');

    const result = await query(
      `UPDATE leads SET ${updates.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('UpdateLead error:', error);
    res.status(500).json({ error: 'Failed to update lead' });
  }
};

export const deleteLead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const result = await query(
      'DELETE FROM leads WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    res.json({ success: true, message: 'Lead deleted' });
  } catch (error) {
    console.error('DeleteLead error:', error);
    res.status(500).json({ error: 'Failed to delete lead' });
  }
};

export const getLeadStats = async (req, res) => {
  try {
    const userId = req.userId;

    const result = await query(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'new' THEN 1 END) as new_count,
        COUNT(CASE WHEN status = 'engaging' THEN 1 END) as engaging_count,
        COUNT(CASE WHEN status = 'secured' THEN 1 END) as secured_count,
        COUNT(CASE WHEN status = 'dead' THEN 1 END) as dead_count
      FROM leads WHERE user_id = $1`,
      [userId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('GetLeadStats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
};
