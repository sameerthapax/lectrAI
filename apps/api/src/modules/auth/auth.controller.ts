import type { Request, Response } from 'express';
import {
  loginWithEmail,
  logoutAuthSession,
  parseLoginInput,
  parseLogoutInput,
  parseRefreshInput,
  parseSignUpInput,
  refreshAuthSession,
  signUpWithEmail,
} from './auth.service.js';

export async function postSignUp(request: Request, response: Response) {
  const input = parseSignUpInput(request.body);
  const result = await signUpWithEmail(input);

  response.status(201).json({
    ...result,
  });
}

export async function postLogin(request: Request, response: Response) {
  const input = parseLoginInput(request.body);
  const result = await loginWithEmail(input);

  response.status(200).json(result);
}

export async function postRefresh(request: Request, response: Response) {
  const input = parseRefreshInput(request.body);
  const result = await refreshAuthSession(input);

  response.status(200).json(result);
}

export async function postLogout(request: Request, response: Response) {
  if (!request.accessToken) {
    throw new Error('Authenticated access token missing from request context.');
  }

  const input = parseLogoutInput(request.body);
  const result = await logoutAuthSession(request.accessToken, input);

  response.status(200).json(result);
}
