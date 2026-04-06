import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AuthResult {
  userId: string;
  role?: string;
}

/**
 * Verify a caller's identity from the Authorization header.
 * Returns { userId } on success, null if unauthenticated.
 */
export async function verifyAuth(req: Request): Promise<AuthResult | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return null;

  return { userId: user.id };
}

/**
 * Verify the caller is an authenticated admin.
 * Returns { userId, role: 'admin' } on success, null if not admin.
 */
export async function verifyAdmin(req: Request): Promise<AuthResult | null> {
  const auth = await verifyAuth(req);
  if (!auth) return null;

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: roleData } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", auth.userId)
    .eq("role", "admin")
    .single();

  if (!roleData) return null;
  return { userId: auth.userId, role: "admin" };
}
