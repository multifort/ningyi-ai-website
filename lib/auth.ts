import { SignJWT, jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'ningyi-ai-cms-secret-key-2024'
);

const EXPIRATION_TIME = '7d'; // Token 有效期 7 天

export interface TokenPayload {
  userId: number;
  username: string;
}

// 生成 JWT Token
export async function generateToken(payload: TokenPayload): Promise<string> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(EXPIRATION_TIME)
    .sign(SECRET);
  
  return token;
}

// 验证 JWT Token
export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return {
      userId: Number(payload.userId),
      username: String(payload.username),
    };
  } catch (error) {
    console.error('Token 验证失败:', error);
    return null;
  }
}

// 从请求头中提取 Token
export function extractTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}
