import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';

export const register = async (req, res) => {
  try {
    const { email, password, name, company } = req.body;
    
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    
    const result = await query(
      'INSERT INTO users (email, password_hash, name, company) VALUES ($1, $2, $3, $4) RETURNING id, email, name, company, created_at',
      [email, passwordHash, name, company]
    );

    const token = jwt.sign(
      { userId: result.rows[0].id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ user: result.rows[0], token });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

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
};

export const getMe = async (req, res) => {
  try {
    const result = await query(
      'SELECT id, email, name, company, api_keys, created_at FROM users WHERE id = $1',
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('GetMe error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
};

export const updateApiKeys = async (req, res) => {
  try {
    const { apifyToken, metaAccessToken, openAiKey, anthropicKey } = req.body;
    
    const apiKeys = {
      apifyToken: apifyToken || null,
      metaAccessToken: metaAccessToken || null,
      openAiKey: openAiKey || null,
      anthropicKey: anthropicKey || null
    };

    await query(
      'UPDATE users SET api_keys = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(apiKeys), req.userId]
    );

    res.json({ success: true, message: 'API keys updated' });
  } catch (error) {
    console.error('UpdateApiKeys error:', error);
    res.status(500).json({ error: 'Failed to update API keys' });
  }
};
