import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, initDatabase } from '../../db.js';

export default async function handler(req, res) {
  await initDatabase();

  const { email, password } = req.body;

  try {
    const result = await query(
      'SELECT id, email, password_hash, name, company, api_keys FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const { password_hash, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
}
