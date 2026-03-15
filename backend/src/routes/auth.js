import { Router } from 'express';
import { register, login, getMe, updateApiKeys } from '../controllers/authController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', authMiddleware, getMe);
router.put('/api-keys', authMiddleware, updateApiKeys);

export default router;
