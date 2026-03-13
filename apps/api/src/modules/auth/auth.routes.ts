import { Router } from 'express';
import { authenticateWithSupabase } from '../../middleware/supabase-auth.js';
import { postLogin, postLogout, postRefresh, postSignUp } from './auth.controller.js';

const authRouter = Router();

authRouter.post('/sign-up', (request, response, next) => {
  void postSignUp(request, response).catch(next);
});

authRouter.post('/login', (request, response, next) => {
  void postLogin(request, response).catch(next);
});

authRouter.post('/refresh', (request, response, next) => {
  void postRefresh(request, response).catch(next);
});

authRouter.post('/logout', authenticateWithSupabase, (request, response, next) => {
  void postLogout(request, response).catch(next);
});

export { authRouter };
