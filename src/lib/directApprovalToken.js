import { createHash, createHmac, randomBytes } from 'node:crypto';
import { jwtVerify, errors as joseErrors } from 'jose';
import {
  getApproverForDirectApprovalToken,
  storeDirectApprovalToken,
} from './leaveDb';

const TOKEN_ISSUER = 'leave-management';
const TOKEN_AUDIENCE = 'direct-leave-approvals';

function getLegacySigningKey() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required for direct leave approvals.');
  }

  return createHmac('sha256', process.env.JWT_SECRET)
    .update('direct-leave-approvals')
    .digest();
}

function hashToken(token) {
  return createHash('sha256').update(token).digest();
}

async function verifyLegacyToken(token) {
  try {
    const { payload } = await jwtVerify(token, getLegacySigningKey(), {
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
      algorithms: ['HS256'],
    });

    const approverId = String(payload.sub || '').trim();
    if (!approverId || payload.purpose !== TOKEN_AUDIENCE || !payload.exp) {
      return null;
    }

    return approverId;
  } catch (error) {
    if (error instanceof joseErrors.JOSEError) return null;
    throw error;
  }
}

export async function createDirectApprovalToken(approverId, leaveRequest) {
  const normalizedApproverId = String(approverId || '').trim();
  if (!normalizedApproverId) {
    throw new Error('Approver ID is required for direct leave approvals.');
  }

  const token = randomBytes(64).toString('base64url');
  await storeDirectApprovalToken(normalizedApproverId, hashToken(token), leaveRequest);
  return token;
}

export async function verifyDirectApprovalToken(token) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) return null;

  if (/^[A-Za-z0-9_-]{86}$/.test(normalizedToken)) {
    const tokenBytes = Buffer.from(normalizedToken, 'base64url');
    if (tokenBytes.length === 64 && tokenBytes.toString('base64url') === normalizedToken) {
      return getApproverForDirectApprovalToken(hashToken(normalizedToken));
    }
  }

  return verifyLegacyToken(normalizedToken);
}
