import { sql } from "../db";
import { hashPassword, verifyPassword } from "./password";
import { signAccessToken, signRefreshToken } from "./jwt";
import crypto from "crypto";

interface AuthResult {
  user: { id: string; email: string; created_at: string; raw_user_meta_data: Record<string, unknown> };
  session: { access_token: string; refresh_token: string; expires_at: number };
}

export async function createUser(
  email: string,
  password: string,
  metadata: Record<string, unknown> = {}
): Promise<AuthResult> {
  const passwordHash = await hashPassword(password);
  const id = crypto.randomUUID();

  await sql`
    INSERT INTO app_users (id, email, password_hash, email_confirmed_at, raw_user_meta_data)
    VALUES (${id}, ${email}, ${passwordHash}, now(), ${JSON.stringify(metadata)}::jsonb)
  `;

  // Create profile + role (mirrors Supabase handle_new_user trigger)
  await sql`
    INSERT INTO profiles (user_id, email, full_name, org_id)
    VALUES (${id}, ${email}, ${metadata.full_name ?? ''}, ${(metadata.org_id as string) ?? null})
  `;
  await sql`
    INSERT INTO user_roles (user_id, role)
    VALUES (${id}, 'sales_rep')
  `;

  return issueSession(id, email, metadata);
}

export async function authenticateUser(
  email: string,
  password: string
): Promise<AuthResult | null> {
  const rows = await sql`
    SELECT id, email, password_hash, raw_user_meta_data, created_at
    FROM app_users WHERE email = ${email} LIMIT 1
  `;
  if (rows.length === 0) return null;

  const user = rows[0];
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return null;

  return issueSession(user.id, user.email, user.raw_user_meta_data ?? {});
}

export async function refreshSession(
  refreshToken: string
): Promise<AuthResult | null> {
  const rows = await sql`
    SELECT s.user_id, u.email, u.raw_user_meta_data, u.created_at
    FROM app_sessions s JOIN app_users u ON u.id = s.user_id
    WHERE s.refresh_token = ${refreshToken} AND s.expires_at > now()
    LIMIT 1
  `;
  if (rows.length === 0) return null;

  // Rotate refresh token
  await sql`DELETE FROM app_sessions WHERE refresh_token = ${refreshToken}`;

  const user = rows[0];
  return issueSession(user.user_id, user.email, user.raw_user_meta_data ?? {});
}

export async function revokeSession(refreshToken: string): Promise<void> {
  await sql`DELETE FROM app_sessions WHERE refresh_token = ${refreshToken}`;
}

export async function getUserById(
  userId: string
): Promise<{ id: string; email: string; created_at: string; raw_user_meta_data: Record<string, unknown> } | null> {
  const rows = await sql`
    SELECT id, email, created_at, raw_user_meta_data FROM app_users WHERE id = ${userId} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function updateUserPassword(
  userId: string,
  newPassword: string
): Promise<void> {
  const hash = await hashPassword(newPassword);
  await sql`UPDATE app_users SET password_hash = ${hash}, updated_at = now() WHERE id = ${userId}`;
}

async function issueSession(
  userId: string,
  email: string,
  metadata: Record<string, unknown>
): Promise<AuthResult> {
  const accessToken = await signAccessToken(userId, email);
  const refreshToken = await signRefreshToken(userId, email);
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;

  // Store refresh token
  await sql`
    INSERT INTO app_sessions (user_id, refresh_token, expires_at)
    VALUES (${userId}, ${refreshToken}, now() + interval '30 days')
  `;

  return {
    user: { id: userId, email, created_at: new Date().toISOString(), raw_user_meta_data: metadata },
    session: { access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt },
  };
}
