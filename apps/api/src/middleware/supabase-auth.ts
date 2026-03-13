import type { NextFunction, Request, Response } from 'express';
import { getSupabaseAdminClient } from '@lectrai/db';
import { HttpError } from '../lib/http-error.js';

function getBearerToken(request: Request): string {
  const authorizationHeader = request.header('authorization');

  if (!authorizationHeader) {
    throw new HttpError(401, 'Missing Authorization header.');
  }

  const [scheme, token] = authorizationHeader.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new HttpError(401, 'Authorization header must use Bearer token format.');
  }

  return token;
}

export async function authenticateWithSupabase(
  request: Request,
  _response: Response,
  next: NextFunction
) {
  try {
    const token = getBearerToken(request);
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      throw new HttpError(401, 'Invalid or expired access token.', error?.message);
    }

    request.accessToken = token;
    request.authUser = data.user;
    next();
  } catch (error) {
    next(error);
  }
}
