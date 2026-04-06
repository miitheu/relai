import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { optionsResponse, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const GOOGLE_REDIRECT_URI = Deno.env.get("GOOGLE_REDIRECT_URI") || "";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const auth = await verifyAuth(req);
    if (!auth) return errorResponse("Unauthorized", 401);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const { mode } = body;

    // ── Get OAuth consent URL ──
    if (mode === "get_auth_url") {
      if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI) {
        return errorResponse("Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI.", 500);
      }
      // Generate cryptographic random state to prevent CSRF
      const stateBytes = new Uint8Array(32);
      crypto.getRandomValues(stateBytes);
      const csrfState = Array.from(stateBytes, b => b.toString(16).padStart(2, "0")).join("");

      // Store CSRF state in user metadata via auth.updateUser (no table constraint issues)
      await sb.auth.admin.updateUserById(auth.userId, {
        user_metadata: { gmail_oauth_state: csrfState },
      });

      const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: GOOGLE_REDIRECT_URI,
        response_type: "code",
        scope: SCOPES.join(" "),
        access_type: "offline",
        prompt: "consent",
        state: csrfState,
      });
      return jsonResponse({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
    }

    // ── Exchange auth code for tokens ──
    if (mode === "exchange_code") {
      const { code, state } = body;
      if (!code) return errorResponse("Missing auth code", 400);

      // Validate CSRF state from user metadata
      if (state) {
        const { data: { user: authUser } } = await sb.auth.admin.getUserById(auth.userId);
        const storedState = authUser?.user_metadata?.gmail_oauth_state;
        if (!storedState || storedState !== state) {
          return errorResponse("Invalid OAuth state — possible CSRF attack", 403);
        }
        // Clean up state from metadata
        await sb.auth.admin.updateUserById(auth.userId, {
          user_metadata: { gmail_oauth_state: null },
        });
      }

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: GOOGLE_REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      });

      const tokenData = await tokenRes.json();
      if (tokenData.error) {
        return errorResponse(`Google OAuth error: ${tokenData.error_description || tokenData.error}`, 400);
      }

      // Get user's email address
      const profileRes = await fetch("https://www.googleapis.com/gmail/v1/users/me/profile", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const profile = await profileRes.json();

      // Store in integration_configs
      const configPayload = {
        name: `Gmail - ${profile.emailAddress}`,
        integration_type: "email",
        config_json: {
          provider: "gmail",
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expiry: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
          email_address: profile.emailAddress,
          last_history_id: profile.historyId || null,
          sync_enabled: true,
        },
        is_active: true,
        created_by: auth.userId,
      };

      // Upsert: if user already has a gmail config, update it
      const { data: existing } = await (sb.from("integration_configs") as any)
        .select("id")
        .eq("created_by", auth.userId)
        .eq("integration_type", "email")
        .single();

      if (existing) {
        await (sb.from("integration_configs") as any)
          .update({ ...configPayload, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await (sb.from("integration_configs") as any).insert(configPayload);
      }

      return jsonResponse({ email_address: profile.emailAddress, connected: true });
    }

    // ── Disconnect Gmail ──
    if (mode === "disconnect") {
      await (sb.from("integration_configs") as any)
        .delete()
        .eq("created_by", auth.userId)
        .eq("integration_type", "email");

      return jsonResponse({ connected: false });
    }

    // ── Get connection status ──
    if (mode === "status") {
      const { data } = await (sb.from("integration_configs") as any)
        .select("config_json, is_active, last_sync_at")
        .eq("created_by", auth.userId)
        .eq("integration_type", "email")
        .single();

      if (!data) return jsonResponse({ connected: false });

      return jsonResponse({
        connected: true,
        email_address: data.config_json?.email_address,
        sync_enabled: data.config_json?.sync_enabled,
        last_sync_at: data.last_sync_at,
        is_active: data.is_active,
      });
    }

    return errorResponse("Invalid mode", 400);
  } catch (e: any) {
    return errorResponse(e.message || "Internal error", 500);
  }
});
