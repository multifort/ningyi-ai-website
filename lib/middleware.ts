import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractTokenFromHeader } from './auth';

// API 认证中间件
export async function requireAuth(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const token = extractTokenFromHeader(authHeader);
  
  if (!token) {
    return NextResponse.json(
      { error: '未授权访问，请先登录' },
      { status: 401 }
    );
  }
  
  const payload = await verifyToken(token);
  
  if (!payload) {
    return NextResponse.json(
      { error: 'Token 无效或已过期' },
      { status: 401 }
    );
  }
  
  // 将用户信息添加到请求上下文
  const requestWithUser = request.clone();
  (requestWithUser as any).user = payload;
  
  return { success: true, user: payload, request: requestWithUser };
}
