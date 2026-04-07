import type { FunctionContext } from "./utils";
import crypto from "crypto";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "";
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

const MAX_MESSAGES_PER_SYNC = 50;
const GMAIL_QUERY = "category:primary (from:me OR to:me) -from:noreply -from:no-reply -from:notifications -from:mailer-daemon";

const BLOCKED_DOMAINS_BASE = new Set([
  "linkedin.com", "google.com", "github.com", "facebook.com", "twitter.com",
  "x.com", "slack.com", "notion.so", "zoom.us", "calendly.com",
  "stripe.com", "paypal.com", "apple.com", "microsoft.com", "outlook.com",
]);
const BLOCKED_PREFIXES = ["noreply", "no-reply", "notifications", "support", "info", "news", "newsletter", "updates", "mailer-daemon", "postmaster", "billing", "receipts", "orders"];

function isBlockedAddress(email: string, blockedDomains: Set<string>): boolean {
  if (!email) return true;
  const lower = email.toLowerCase();
  const [local, domain] = lower.split("@");
  if (!domain) return true;
  for (const blocked of blockedDomains) if (domain === blocked || domain.endsWith(`.${blocked}`)) return true;
  for (const prefix of BLOCKED_PREFIXES) if (local === prefix || local.startsWith(`${prefix}+`) || local.startsWith(`${prefix}.`)) return true;
  return false;
}

function extractEmailAddress(header: string): string {
  const match = header.match(/<([^>]+)>/);
  return (match ? match[1] : header).trim().toLowerCase();
}

function getHeader(headers: any[], name: string): string {
  const h = headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
  return h?.value || "";
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, grant_type: "refresh_token" }),
  });
  const data = await res.json();
  return data.error ? null : { access_token: data.access_token, expires_in: data.expires_in };
}

// ── Gmail Auth handler ──
export async function gmailAuth(ctx: FunctionContext) {
  const { sql, userId, body } = ctx;
  const { mode } = body;

  if (mode === "get_auth_url") {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI) {
      return { data: null, error: { message: "Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI." } };
    }
    const csrfState = crypto.randomBytes(32).toString("hex");
    // Store CSRF state
    await sql`UPDATE app_users SET raw_user_meta_data = raw_user_meta_data || ${JSON.stringify({ gmail_oauth_state: csrfState })}::jsonb WHERE id = ${userId}`;
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID, redirect_uri: GOOGLE_REDIRECT_URI, response_type: "code",
      scope: SCOPES.join(" "), access_type: "offline", prompt: "consent", state: csrfState,
    });
    return { data: { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` } };
  }

  if (mode === "exchange_code") {
    const { code, state } = body;
    if (!code) return { data: null, error: { message: "Missing auth code" } };

    if (state) {
      const users = await sql`SELECT raw_user_meta_data FROM app_users WHERE id = ${userId} LIMIT 1`;
      const storedState = users[0]?.raw_user_meta_data?.gmail_oauth_state;
      if (!storedState || storedState !== state) return { data: null, error: { message: "Invalid OAuth state" } };
      await sql`UPDATE app_users SET raw_user_meta_data = raw_user_meta_data - 'gmail_oauth_state' WHERE id = ${userId}`;
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: GOOGLE_REDIRECT_URI, grant_type: "authorization_code" }),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.error) return { data: null, error: { message: `Google OAuth error: ${tokenData.error_description || tokenData.error}` } };

    const profileRes = await fetch("https://www.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    const profile = await profileRes.json();

    const configPayload = {
      name: `Gmail - ${profile.emailAddress}`, integration_type: "email",
      config_json: JSON.stringify({ provider: "gmail", access_token: tokenData.access_token, refresh_token: tokenData.refresh_token, token_expiry: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(), email_address: profile.emailAddress, last_history_id: profile.historyId || null, sync_enabled: true }),
      is_active: true, created_by: userId,
    };

    const existing = await sql`SELECT id FROM integration_configs WHERE created_by = ${userId} AND integration_type = 'email' LIMIT 1`;
    if (existing.length > 0) {
      await sql`UPDATE integration_configs SET name = ${configPayload.name}, config_json = ${configPayload.config_json}::jsonb, is_active = true, updated_at = now() WHERE id = ${existing[0].id}`;
    } else {
      await sql`INSERT INTO integration_configs (name, integration_type, config_json, is_active, created_by) VALUES (${configPayload.name}, ${configPayload.integration_type}, ${configPayload.config_json}::jsonb, true, ${userId})`;
    }

    return { data: { email_address: profile.emailAddress, connected: true } };
  }

  if (mode === "disconnect") {
    await sql`DELETE FROM integration_configs WHERE created_by = ${userId} AND integration_type = 'email'`;
    return { data: { connected: false } };
  }

  if (mode === "status") {
    const rows = await sql`SELECT config_json, is_active, last_sync_at FROM integration_configs WHERE created_by = ${userId} AND integration_type = 'email' LIMIT 1`;
    if (rows.length === 0) return { data: { connected: false } };
    const data = rows[0];
    return { data: { connected: true, email_address: data.config_json?.email_address, sync_enabled: data.config_json?.sync_enabled, last_sync_at: data.last_sync_at, is_active: data.is_active } };
  }

  return { data: null, error: { message: "Invalid mode" } };
}

// ── Gmail Sync handler ──
export async function gmailSync(ctx: FunctionContext) {
  const { sql, userId, body } = ctx;
  const dryRun = body?.dry_run === true;
  const fullRescan = body?.full_rescan === true;

  const configRows = await sql`SELECT * FROM integration_configs WHERE integration_type = 'email' AND is_active = true AND created_by = ${userId} LIMIT 1`;
  if (configRows.length === 0 || !configRows[0].config_json) return { data: null, error: { message: "Gmail not connected" } };
  const config = configRows[0];

  let { access_token, refresh_token, token_expiry, email_address, last_history_id } = config.config_json;

  // Build blocked domains
  const BLOCKED_DOMAINS = new Set(BLOCKED_DOMAINS_BASE);
  const userBlockedDomains: string[] = config.config_json.blocked_domains || [];
  for (const d of userBlockedDomains) BLOCKED_DOMAINS.add(d.toLowerCase());
  if (email_address) { const ud = email_address.split("@")[1]?.toLowerCase(); if (ud) BLOCKED_DOMAINS.add(ud); }
  const profiles = await sql`SELECT email FROM profiles`;
  for (const p of profiles) { const d = p.email?.split("@")[1]?.toLowerCase(); if (d) BLOCKED_DOMAINS.add(d); }

  // Refresh token if expired
  if (new Date(token_expiry) <= new Date()) {
    const refreshed = await refreshAccessToken(refresh_token);
    if (!refreshed) return { data: null, error: { message: "Failed to refresh Gmail token. Please reconnect." } };
    access_token = refreshed.access_token;
    token_expiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    await sql`UPDATE integration_configs SET config_json = config_json || ${JSON.stringify({ access_token, token_expiry })}::jsonb WHERE id = ${config.id}`;
  }

  const headers = { Authorization: `Bearer ${access_token}` };

  // Contact mapping
  const contacts = await sql`SELECT id, client_id, email FROM contacts WHERE email IS NOT NULL AND email != ''`;
  const contactMap = new Map<string, { contact_id: string; client_id: string }>();
  for (const c of contacts) if (c.email) contactMap.set(c.email.toLowerCase(), { contact_id: c.id, client_id: c.client_id });

  // Fetch messages
  let messageIds: string[] = [];
  if (last_history_id && !fullRescan) {
    const historyRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${last_history_id}&historyTypes=messageAdded&maxResults=${MAX_MESSAGES_PER_SYNC}`, { headers });
    const historyData = await historyRes.json();
    if (historyData.history) for (const h of historyData.history) for (const added of (h.messagesAdded || [])) messageIds.push(added.message.id);
    if (historyData.historyId) last_history_id = historyData.historyId;
  } else {
    const q = encodeURIComponent(GMAIL_QUERY);
    const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${MAX_MESSAGES_PER_SYNC}&q=${q}`, { headers });
    const listData = await listRes.json();
    messageIds = (listData.messages || []).map((m: any) => m.id);
  }

  const totalFromGmail = messageIds.length;

  // Dedup
  if (messageIds.length > 0 && !dryRun) {
    const existing = await sql`SELECT gmail_message_id FROM emails WHERE gmail_message_id = ANY(${messageIds})`;
    const existingIds = new Set(existing.map((e: any) => e.gmail_message_id));
    messageIds = messageIds.filter(id => !existingIds.has(id));
  }

  let synced = 0, matched = 0, blocked = 0;

  for (const msgId of messageIds.slice(0, MAX_MESSAGES_PER_SYNC)) {
    try {
      const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`, { headers });
      const msg = await msgRes.json();
      if (!msg.payload) continue;

      const msgHeaders = msg.payload.headers || [];
      const from = getHeader(msgHeaders, "From");
      const to = getHeader(msgHeaders, "To");
      const subject = getHeader(msgHeaders, "Subject");
      const date = getHeader(msgHeaders, "Date");

      const fromAddr = extractEmailAddress(from);
      const toAddrs = to.split(",").map(extractEmailAddress).filter(Boolean);
      const isFromMe = fromAddr === email_address?.toLowerCase();
      const isDirectRecipient = toAddrs.some((a: string) => a === email_address?.toLowerCase());
      if (!isFromMe && !isDirectRecipient) { blocked++; continue; }

      const externalAddrs = [fromAddr, ...toAddrs].filter(a => a && a !== email_address?.toLowerCase());
      const nonBlockedAddrs = externalAddrs.filter(a => !isBlockedAddress(a, BLOCKED_DOMAINS));
      if (nonBlockedAddrs.length === 0) { blocked++; continue; }

      let contactMatch: { contact_id: string; client_id: string } | null = null;
      for (const addr of nonBlockedAddrs) { const m = contactMap.get(addr); if (m) { contactMatch = m; break; } }
      if (!contactMatch) continue;
      matched++;

      if (dryRun) continue;

      const emailDate = date ? new Date(date).toISOString() : new Date().toISOString();
      await sql`
        INSERT INTO emails (gmail_message_id, gmail_thread_id, sync_source, client_id, contact_id, subject, from_address, to_addresses, direction, visibility, email_date, created_by)
        VALUES (${msgId}, ${msg.threadId}, 'gmail', ${contactMatch.client_id}, ${contactMatch.contact_id}, ${subject || "(no subject)"}, ${fromAddr}, ${JSON.stringify(toAddrs)}::jsonb, ${isFromMe ? "outbound" : "inbound"}, 'private', ${emailDate}, ${userId})
      `;
      synced++;
    } catch {}
  }

  // Update history ID
  const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers });
  const profile = await profileRes.json();
  await sql`UPDATE integration_configs SET config_json = config_json || ${JSON.stringify({ access_token, token_expiry, last_history_id: profile.historyId })}::jsonb, last_sync_at = now() WHERE id = ${config.id}`;

  return { data: { synced, matched, blocked, total_processed: messageIds.length, total_from_gmail: totalFromGmail, dry_run: dryRun, crm_contacts_with_email: contactMap.size } };
}
