import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { optionsResponse, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("gmail-sync");

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const MAX_MESSAGES_PER_SYNC = 50;

// Gmail search query: Primary category, sent or received by user, exclude automated senders
const GMAIL_QUERY = "category:primary (from:me OR to:me) -from:noreply -from:no-reply -from:notifications -from:mailer-daemon";

// Domains to always skip (services + internal domains added dynamically)
const BLOCKED_DOMAINS_BASE = new Set([
  "linkedin.com", "google.com", "github.com", "facebook.com", "twitter.com",
  "x.com", "instagram.com", "slack.com", "notion.so", "figma.com",
  "atlassian.com", "jira.com", "confluence.com", "trello.com",
  "zoom.us", "calendly.com", "docusign.com", "dropbox.com",
  "hubspot.com", "salesforce.com", "mailchimp.com", "sendgrid.net",
  "amazonses.com", "stripe.com", "paypal.com", "apple.com",
  "microsoft.com", "outlook.com", "teams.microsoft.com",
  "youtube.com", "spotify.com", "netflix.com",
]);

// Prefixes that indicate automated senders
const BLOCKED_PREFIXES = ["noreply", "no-reply", "notifications", "support", "info", "news", "newsletter", "updates", "mailer-daemon", "postmaster", "billing", "receipts", "orders"];

function isBlockedAddress(email: string, blockedDomains: Set<string>): boolean {
  if (!email) return true;
  const lower = email.toLowerCase();
  const [local, domain] = lower.split("@");
  if (!domain) return true;
  // Check domain blocklist (includes internal domains)
  for (const blocked of blockedDomains) {
    if (domain === blocked || domain.endsWith(`.${blocked}`)) return true;
  }
  // Check prefix blocklist
  for (const prefix of BLOCKED_PREFIXES) {
    if (local === prefix || local.startsWith(`${prefix}+`) || local.startsWith(`${prefix}.`)) return true;
  }
  return false;
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (data.error) return null;
  return { access_token: data.access_token, expires_in: data.expires_in };
}

function decodeBase64Url(str: string): string {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return new TextDecoder().decode(
      Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
    );
  } catch {
    return "";
  }
}

function extractEmailAddress(header: string): string {
  const match = header.match(/<([^>]+)>/);
  return (match ? match[1] : header).trim().toLowerCase();
}

function getHeader(headers: any[], name: string): string {
  const h = headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
  return h?.value || "";
}

function extractBody(payload: any): { text: string; html: string } {
  let text = "";
  let html = "";

  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    if (payload.mimeType === "text/html") html = decoded;
    else text = decoded;
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data && !text) {
        text = decodeBase64Url(part.body.data);
      }
      if (part.mimeType === "text/html" && part.body?.data && !html) {
        html = decodeBase64Url(part.body.data);
      }
      if (part.parts) {
        const nested = extractBody(part);
        if (!text && nested.text) text = nested.text;
        if (!html && nested.html) html = nested.html;
      }
    }
  }

  return { text, html };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const reqBody = await req.json().catch(() => ({}));
    const dryRun = reqBody?.dry_run === true;
    const fullRescan = reqBody?.full_rescan === true;

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Require authentication
    const auth = await verifyAuth(req);
    if (!auth?.userId) {
      return errorResponse("Unauthorized", 401);
    }
    const userId = auth.userId;

    // Load Gmail config for this user only
    const { data: config } = await (sb.from("integration_configs") as any)
      .select("*")
      .eq("integration_type", "email")
      .eq("is_active", true)
      .eq("created_by", userId)
      .limit(1)
      .single();

    if (!config?.config_json) {
      return errorResponse("Gmail not connected", 400);
    }

    let { access_token, refresh_token, token_expiry, email_address, last_history_id } = config.config_json;

    // Build dynamic blocked domains list: base + internal + user-configured
    const BLOCKED_DOMAINS = new Set(BLOCKED_DOMAINS_BASE);
    // Add user-configured blocked domains
    const userBlockedDomains: string[] = config.config_json.blocked_domains || [];
    for (const d of userBlockedDomains) BLOCKED_DOMAINS.add(d.toLowerCase());
    // Add the user's own email domain as internal
    if (email_address) {
      const userDomain = email_address.split("@")[1]?.toLowerCase();
      if (userDomain) BLOCKED_DOMAINS.add(userDomain);
    }
    // Add all team member email domains as internal (from auth profiles)
    const { data: profiles } = await sb.from("profiles").select("email");
    if (profiles) {
      for (const p of profiles) {
        const d = p.email?.split("@")[1]?.toLowerCase();
        if (d) BLOCKED_DOMAINS.add(d);
      }
    }
    // Add domains from all connected Gmail accounts in the org
    const { data: allGmailConfigs } = await (sb.from("integration_configs") as any)
      .select("config_json")
      .eq("integration_type", "email")
      .eq("is_active", true);
    if (allGmailConfigs) {
      for (const c of allGmailConfigs) {
        const d = c.config_json?.email_address?.split("@")[1]?.toLowerCase();
        if (d) BLOCKED_DOMAINS.add(d);
      }
    }
    log.info(`Blocked domains: ${BLOCKED_DOMAINS.size} (${userBlockedDomains.length} user-configured)`);

    // Refresh token if expired
    if (new Date(token_expiry) <= new Date()) {
      const refreshed = await refreshAccessToken(refresh_token);
      if (!refreshed) return errorResponse("Failed to refresh Gmail token. Please reconnect.", 401);
      access_token = refreshed.access_token;
      token_expiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      await (sb.from("integration_configs") as any)
        .update({ config_json: { ...config.config_json, access_token, token_expiry } })
        .eq("id", config.id);
    }

    const headers = { Authorization: `Bearer ${access_token}` };

    // Load contact email → client_id mapping + domain → client suggestions
    const { data: contacts } = await sb.from("contacts").select("id, client_id, email, clients(name)").neq("email", "");
    const contactMap = new Map<string, { contact_id: string; client_id: string }>();
    const domainClientMap = new Map<string, { client_id: string; client_name: string }>();
    for (const c of (contacts || [])) {
      if (c.email) {
        contactMap.set(c.email.toLowerCase(), { contact_id: c.id, client_id: c.client_id });
        const domain = c.email.split("@")[1]?.toLowerCase();
        if (domain && !domainClientMap.has(domain)) {
          domainClientMap.set(domain, { client_id: c.client_id, client_name: (c as any).clients?.name || "Unknown" });
        }
      }
    }

    // Fetch recent messages
    let messageIds: string[] = [];

    if (last_history_id && !fullRescan) {
      // Incremental sync via history
      const historyRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${last_history_id}&historyTypes=messageAdded&maxResults=${MAX_MESSAGES_PER_SYNC}`,
        { headers }
      );
      const historyData = await historyRes.json();
      if (historyData.history) {
        for (const h of historyData.history) {
          for (const added of (h.messagesAdded || [])) {
            messageIds.push(added.message.id);
          }
        }
      }
      if (historyData.historyId) {
        last_history_id = historyData.historyId;
      }
    } else {
      // Initial sync — fetch last N messages (filtered to Primary, sent/received only)
      const q = encodeURIComponent(GMAIL_QUERY);
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${MAX_MESSAGES_PER_SYNC}&q=${q}`,
        { headers }
      );
      const listData = await listRes.json();
      messageIds = (listData.messages || []).map((m: any) => m.id);
    }

    const totalFromGmail = messageIds.length;
    log.info(`Gmail returned ${totalFromGmail} message IDs`);

    // De-duplicate against already synced (skip for dry run to show full picture)
    if (messageIds.length > 0 && !dryRun) {
      const { data: existing } = await (sb.from("emails") as any)
        .select("gmail_message_id")
        .in("gmail_message_id", messageIds);
      const existingIds = new Set((existing || []).map((e: any) => e.gmail_message_id));
      messageIds = messageIds.filter((id) => !existingIds.has(id));
    }

    log.info(`Processing ${messageIds.length} messages (${totalFromGmail} from Gmail)${dryRun ? " (DRY RUN)" : ""}${fullRescan ? " (FULL RESCAN)" : ""}`);

    let synced = 0;
    let matched = 0;
    let blocked = 0;
    const unmatchedAddresses = new Map<string, { count: number; subjects: string[] }>();
    const matchedAddresses = new Map<string, number>();

    for (const msgId of messageIds.slice(0, MAX_MESSAGES_PER_SYNC)) {
      try {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
          { headers }
        );
        const msg = await msgRes.json();
        if (!msg.payload) continue;

        const msgHeaders = msg.payload.headers || [];
        const from = getHeader(msgHeaders, "From");
        const to = getHeader(msgHeaders, "To");
        const cc = getHeader(msgHeaders, "Cc");
        const subject = getHeader(msgHeaders, "Subject");
        const date = getHeader(msgHeaders, "Date");

        // Skip emails where user is only CC'd (not direct sender or recipient)
        const fromAddr = extractEmailAddress(from);
        const toAddrs = to.split(",").map(extractEmailAddress).filter(Boolean);
        const isFromMe = fromAddr === email_address?.toLowerCase();
        const isDirectRecipient = toAddrs.some(a => a === email_address?.toLowerCase());
        if (!isFromMe && !isDirectRecipient) {
          blocked++;
          continue;
        }

        const allAddresses = [fromAddr, ...toAddrs];

        // Filter out blocked addresses
        const externalAddrs = allAddresses.filter(a => a && a !== email_address?.toLowerCase());
        const nonBlockedAddrs = externalAddrs.filter(a => !isBlockedAddress(a, BLOCKED_DOMAINS));
        if (nonBlockedAddrs.length === 0) {
          blocked++;
          continue;
        }

        // Determine direction
        const isOutbound = fromAddr === email_address?.toLowerCase();

        // Match to contact
        let contactMatch: { contact_id: string; client_id: string } | null = null;
        for (const addr of nonBlockedAddrs) {
          const match = contactMap.get(addr);
          if (match) { contactMatch = match; matchedAddresses.set(addr, (matchedAddresses.get(addr) || 0) + 1); break; }
        }

        if (!contactMatch) {
          // Track unmatched addresses for diagnostics
          for (const addr of nonBlockedAddrs) {
            const existing = unmatchedAddresses.get(addr);
            if (existing) { existing.count++; existing.subjects.push(subject?.slice(0, 60) || ""); }
            else unmatchedAddresses.set(addr, { count: 1, subjects: [subject?.slice(0, 60) || ""] });
          }
          continue;
        }
        matched++;

        if (dryRun) continue; // Don't insert in dry run mode

        const { text, html } = extractBody(msg.payload);

        // Find active opportunity for this contact's client
        const { data: activeOpps } = await sb
          .from("opportunities")
          .select("id")
          .eq("client_id", contactMatch.client_id)
          .not("stage", "in", '("Closed Won","Closed Lost")')
          .order("created_at", { ascending: false })
          .limit(1);

        const oppId = activeOpps?.[0]?.id || null;

        const emailDate = date ? new Date(date).toISOString() : new Date().toISOString();
        await (sb.from("emails") as any).insert({
          gmail_message_id: msgId,
          gmail_thread_id: msg.threadId,
          sync_source: "gmail",
          client_id: contactMatch.client_id,
          contact_id: contactMatch.contact_id,
          opportunity_id: oppId,
          subject: subject || "(no subject)",
          from_address: fromAddr,
          to_addresses: toAddrs,
          body_text: text.slice(0, 50000),
          body_html: html.slice(0, 100000),
          direction: isOutbound ? "outbound" : "inbound",
          visibility: "private",
          email_date: emailDate,
          summary: text.slice(0, 500),
          created_by: userId,
        });
        synced++;

        // Update last_activity_at on opportunity and contact
        if (oppId) {
          await sb.from("opportunities").update({ last_activity_at: emailDate }).eq("id", oppId).lt("last_activity_at", emailDate);
        }
        await sb.from("contacts").update({ last_interaction_date: emailDate.split('T')[0] }).eq("id", contactMatch.contact_id);
      } catch (err: any) {
        log.error(`Failed to process message ${msgId}: ${err.message}`);
      }
    }

    // Update last_history_id and last_sync_at
    // Get current historyId for next incremental sync
    const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers });
    const profile = await profileRes.json();

    await (sb.from("integration_configs") as any)
      .update({
        config_json: { ...config.config_json, access_token, token_expiry, last_history_id: profile.historyId },
        last_sync_at: new Date().toISOString(),
      })
      .eq("id", config.id);

    // Log sync operation (ignore errors if sync_log table doesn't exist)
    try {
      await (sb.from("sync_log") as any).insert({
        integration_id: config.id,
        sync_type: last_history_id ? "incremental" : "full",
        status: "completed",
        records_processed: messageIds.length,
        records_created: synced,
        records_updated: 0,
      });
    } catch { /* ignore */ }

    // Build diagnostics with domain-based account suggestions
    const unmatchedList = Array.from(unmatchedAddresses.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 50)
      .map(([addr, info]) => {
        const domain = addr.split("@")[1]?.toLowerCase();
        const suggestion = domain ? domainClientMap.get(domain) : null;
        return {
          address: addr,
          email_count: info.count,
          sample_subjects: info.subjects.slice(0, 2),
          suggested_client_id: suggestion?.client_id || null,
          suggested_client_name: suggestion?.client_name || null,
        };
      });
    const matchedList = Array.from(matchedAddresses.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([addr, count]) => ({ address: addr, email_count: count }));

    return jsonResponse({
      synced,
      matched,
      blocked,
      total_processed: messageIds.length,
      total_from_gmail: totalFromGmail,
      skipped_no_contact: messageIds.length - matched - blocked,
      dry_run: dryRun,
      crm_contacts_with_email: contactMap.size,
      matched_addresses: matchedList,
      unmatched_addresses: unmatchedList,
    });
  } catch (e: any) {
    log.error("gmail-sync error", { error: e.message, stack: e.stack });
    return errorResponse(e.message || "Sync failed", 500);
  }
});
