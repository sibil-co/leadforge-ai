import jwt from 'jsonwebtoken';
import { query, initDatabase } from '../../src/config/database.js';

const getUserId = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.userId;
  } catch {
    return null;
  }
};

export default async function handler(req, res) {
  await initDatabase();

  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.query;
  const { message, newStatus } = req.body || {};

  if (!id) {
    return res.status(400).json({ error: 'Lead ID required' });
  }

  try {
    const leadResult = await query(
      'SELECT * FROM leads WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (leadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const lead = leadResult.rows[0];
    const conversationHistory = lead.conversation_history || [];

    if (message) {
      const manualMessageEntry = {
        role: 'manual',
        content: message,
        timestamp: new Date().toISOString()
      };

      const updatedHistory = [...conversationHistory, manualMessageEntry];

      await query(
        'UPDATE leads SET conversation_history = $1 WHERE id = $2',
        [JSON.stringify(updatedHistory), id]
      );
    }

    if (newStatus && ['new', 'engaging', 'secured', 'dead'].includes(newStatus)) {
      await query(
        'UPDATE leads SET status = $1, updated_at = NOW() WHERE id = $2',
        [newStatus, id]
      );
    }

    res.json({ success: true, message: 'Intervention applied' });
  } catch (error) {
    console.error('ManualIntervention error:', error);
    res.status(500).json({ error: 'Failed to apply intervention' });
  }
}
