import { cookies } from 'next/headers';
import { jwtVerify, errors as joseErrors } from 'jose';

export async function getAuthenticatedUserId() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) return null;

  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required to verify the user session.');
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET), {
      algorithms: ['HS256'],
    }));
  } catch (error) {
    if (error instanceof joseErrors.JOSEError) return null;
    throw error;
  }

  return String(payload.username || payload.name || '').trim() || null;
}
