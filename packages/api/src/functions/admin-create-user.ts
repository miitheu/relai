import type { FunctionContext } from "./utils";
import { createUser } from "../auth/users";

export default async function adminCreateUser({ sql, userId, body }: FunctionContext) {
  // Check admin role
  const roleRows = await sql`
    SELECT role FROM user_roles WHERE user_id = ${userId} AND role = 'admin' LIMIT 1
  `;
  if (roleRows.length === 0) {
    return { data: null, error: { message: "Forbidden: admin role required", code: "FORBIDDEN" } };
  }

  const { action } = body;

  if (action === "create_user") {
    const { email, password, full_name, team, role } = body;
    if (!email || !password || !full_name) {
      return { data: null, error: { message: "email, password, and full_name are required" } };
    }

    try {
      const result = await createUser(email, password, { full_name });

      const newUserId = result.user.id;

      if (team) {
        await sql`UPDATE profiles SET team = ${team} WHERE user_id = ${newUserId}`;
      }
      if (role && role !== "sales_rep") {
        await sql`UPDATE user_roles SET role = ${role} WHERE user_id = ${newUserId}`;
      }

      // Audit log
      await sql`
        INSERT INTO admin_audit_log (action, entity_type, entity_id, details, performed_by)
        VALUES ('user_created', 'user', ${newUserId}, ${JSON.stringify({ email, full_name, team, role: role || "sales_rep" })}::jsonb, ${userId})
      `;

      return { data: { user: result.user } };
    } catch (e: unknown) {
      return { data: null, error: { message: e instanceof Error ? e.message : "User creation failed" } };
    }
  }

  if (action === "toggle_user_status") {
    const { user_id, is_active } = body;
    if (!user_id) {
      return { data: null, error: { message: "user_id is required" } };
    }

    await sql`UPDATE profiles SET is_active = ${!!is_active} WHERE user_id = ${user_id}`;

    await sql`
      INSERT INTO admin_audit_log (action, entity_type, entity_id, details, performed_by)
      VALUES (${is_active ? "user_activated" : "user_deactivated"}, 'user', ${user_id}, ${JSON.stringify({ is_active: !!is_active })}::jsonb, ${userId})
    `;

    return { data: { success: true } };
  }

  return { data: null, error: { message: "Unknown action" } };
}
