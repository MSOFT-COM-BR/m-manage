import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'mmanage-dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'mmanage-refresh-secret-change-in-production';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

export interface JwtPayload {
    sub: string;
    email: string;
    roles: string[];
    tokenVersion: number;
}

export function signAccessToken(payload: JwtPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as any);
}

export function signRefreshToken(payload: Pick<JwtPayload, 'sub' | 'tokenVersion'>): string {
    return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN } as any);
}

export function verifyAccessToken(token: string): JwtPayload {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): Pick<JwtPayload, 'sub' | 'tokenVersion'> {
    return jwt.verify(token, JWT_REFRESH_SECRET) as any;
}
