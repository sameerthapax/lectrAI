export type AuthResult = {
  token: string;
  user: {
    id: string;
    email: string;
  };
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

function requireApiBaseUrl() {
  if (!API_BASE_URL) {
    throw new Error('Set EXPO_PUBLIC_API_BASE_URL to enable backend auth calls.');
  }

  return API_BASE_URL;
}

async function post<TResponse>(path: string, body: Record<string, string>) {
  const response = await fetch(`${requireApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message = 'Authentication failed. Please try again.';

    try {
      const data = (await response.json()) as { message?: string };
      if (data.message) {
        message = data.message;
      }
    } catch {
      // Keep default message if backend body is not JSON.
    }

    throw new Error(message);
  }

  return (await response.json()) as TResponse;
}

export function signInWithEmailAndPassword(email: string, password: string) {
  return post<AuthResult>('/auth/login', { email, password });
}

export function signUpWithEmailAndPassword(email: string, password: string) {
  return post<AuthResult>('/auth/sign-up', { email, password });
}

export function signInWithGoogle() {
  throw new Error('Google sign-in will be handled via backend OAuth endpoints.');
}
