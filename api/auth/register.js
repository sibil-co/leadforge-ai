import jwt from 'jsonwebtoken';
import { query, initDatabase } from './db.js';

export default async function handler(req, res) {
  await initDatabase();

  const { email, password, name, company } = req.body;
  
  try {
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const passwordHash = password;
    
    const result = await query(
      'INSERT INTO users (email, password_hash, name, company) VALUES ($1, $2, $3, $4) RETURNING id, email, name, company, created_at',
      [email, passwordHash, name, company]
    );

    const token = jwt.sign(
      { userId: result.rows[0].id },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    res.status(201).json({ user: result.rows[0], token });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
}
