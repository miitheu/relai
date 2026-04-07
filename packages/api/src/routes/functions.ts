import { Hono } from "hono";
import { sql } from "../db";
import { resolveAIConfig } from "../ai/resolve";
import type { FunctionContext } from "../functions/utils";

// Function handlers
import adminCreateUser from "../functions/admin-create-user";
import reportBug from "../functions/report-bug";
import campaignEmailDraft from "../functions/campaign-email-draft";
import meetingPrep from "../functions/meeting-prep";
import dailyBrief from "../functions/daily-brief";
import churnRisk from "../functions/churn-risk";
import campaignScoring from "../functions/campaign-scoring";
import detectDuplicates from "../functions/detect-duplicates";
import fundIntelligence from "../functions/fund-intelligence";
import accountDiscovery from "../functions/account-discovery";
import webEnrich from "../functions/web-enrich";
import autoEnrich from "../functions/auto-enrich";
import { gmailAuth, gmailSync } from "../functions/gmail";
import { resolveEntity, batchResolveEntities } from "../functions/entity-resolution";
import { secImportAccounts, secFreshnessCheck } from "../functions/sec-import";

type FunctionHandler = (ctx: FunctionContext) => Promise<{ data: any; error?: any } | { data: null; error: any }>;

const FUNCTION_HANDLERS: Record<string, FunctionHandler> = {
  "admin-create-user": adminCreateUser,
  "report-bug": reportBug,
  "campaign-email-draft": campaignEmailDraft,
  "meeting-prep": meetingPrep,
  "daily-brief": dailyBrief,
  "churn-risk": churnRisk,
  "campaign-scoring": campaignScoring,
  "detect-duplicates": detectDuplicates,
  "fund-intelligence": fundIntelligence,
  "account-discovery": accountDiscovery,
  "account-discovery-v2": accountDiscovery,
  "web-enrich": webEnrich,
  "auto-enrich": autoEnrich,
  "gmail-auth": gmailAuth,
  "gmail-sync": gmailSync,
  "resolve-entity": resolveEntity,
  "batch-resolve-entities": batchResolveEntities,
  "sec-import-accounts": secImportAccounts,
  "sec-freshness-check": secFreshnessCheck,
};

const functions = new Hono();

// POST /api/functions/:name
functions.post("/:name", async (c) => {
  const name = c.req.param("name");
  const userId = c.get("userId") as string;

  const handler = FUNCTION_HANDLERS[name];
  if (!handler) {
    return c.json({
      data: null,
      error: {
        message: `Function "${name}" is not available.`,
        code: "FUNCTION_NOT_FOUND",
      },
    });
  }

  try {
    const body = await c.req.json().catch(() => ({}));
    const aiConfig = await resolveAIConfig(userId);

    const ctx: FunctionContext = { sql, userId, body, aiConfig };
    const result = await handler(ctx);

    if (result.error) {
      return c.json(result, result.error.code === "FORBIDDEN" ? 403 : 400);
    }

    return c.json(result);
  } catch (e: unknown) {
    console.error(`[functions/${name}] Error:`, e instanceof Error ? e.message : e);
    return c.json({
      data: null,
      error: {
        message: "An internal error occurred. Please try again.",
        code: "INTERNAL_ERROR",
      },
    }, 500);
  }
});

export default functions;
