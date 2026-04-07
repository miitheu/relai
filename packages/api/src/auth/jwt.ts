import * as jose from "jose";

const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET || AUTH_SECRET.length < 32) {
  throw new Error(
    "AUTH_SECRET environment variable is required and must be at least 32 characters. " +
    "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
  );
}

const secret = new TextEncoder().encode(AUTH_SECRET);

const ACCESS_TOKEN_EXPIRY = "1h";
const REFRESH_TOKEN_EXPIRY = "30d";

export interface TokenPayload {
  sub: string; // user_id
  email: string;
  type: "access" | "refresh";
}

export async function signAccessToken(
  userId: string,
  email: string
): Promise<string> {
  return new jose.SignJWT({ sub: userId, email, type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(secret);
}

export async function signRefreshToken(
  userId: string,
  email: string
): Promise<string> {
  return new jose.SignJWT({ sub: userId, email, type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .sign(secret);
}

export async function verifyToken(
  token: string
): Promise<TokenPayload | null> {
  try {
    const { payload } = await jose.jwtVerify(token, secret);
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}
