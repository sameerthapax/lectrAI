import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { authenticateWithSupabase } from '../../middleware/supabase-auth.js';
import { postLogin, postLogout, postRefresh, postSignUp } from './auth.controller.js';

const authRouter = Router();

authRouter.post('/sign-up', asyncHandler(postSignUp));
authRouter.post('/login', asyncHandler(postLogin));
authRouter.post('/refresh', asyncHandler(postRefresh));
authRouter.post('/logout', authenticateWithSupabase, asyncHandler(postLogout));

export { authRouter };
