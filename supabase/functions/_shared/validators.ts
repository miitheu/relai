import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ─── Fund Intelligence ──────────────────────────────────────
export const FundIntelligenceInput = z.object({
  client_id: z.string().uuid(),
  client_name: z.string().min(1).max(500),
  run_reason: z.enum(["manual", "scheduled", "freshness"]).optional(),
});

// ─── Campaign Scoring ───────────────────────────────────────
export const CampaignScoringInput = z.object({
  campaign_id: z.string().uuid(),
  rescore: z.boolean().optional(),
});

// ─── Campaign Email Draft ───────────────────────────────────
export const CampaignEmailDraftInput = z.object({
  campaign_id: z.string().uuid(),
  target_id: z.string().uuid().optional(),
  mode: z.enum(["framework", "individual"]).optional(),
});

// ─── Daily Brief ────────────────────────────────────────────
export const DailyBriefInput = z.object({
  // user_id now comes from auth, so minimal body
  date: z.string().optional(),
});

// ─── Account Discovery ──────────────────────────────────────
export const AccountDiscoveryInput = z.object({
  client_id: z.string().uuid(),
});

// ─── Merge Accounts ─────────────────────────────────────────
export const MergeAccountsInput = z.object({
  primary_id: z.string().uuid(),
  secondary_id: z.string().uuid(),
});

// ─── Resolve Entity ─────────────────────────────────────────
export const ResolveEntityInput = z.object({
  client_id: z.string().uuid(),
  action: z.enum(["resolve", "confirm", "reject", "search"]).optional(),
  search_term: z.string().max(500).optional(),
  selected_cik: z.string().max(50).optional(),
  selected_name: z.string().max(500).optional(),
});

// ─── Batch Resolve Entities ─────────────────────────────────
export const BatchResolveEntitiesInput = z.object({
  client_ids: z.array(z.string().uuid()).optional(),
  mode: z.enum(["all", "unresolved", "specific"]).optional(),
});

// ─── Detect Duplicates ──────────────────────────────────────
export const DetectDuplicatesInput = z.object({
  threshold: z.number().min(0).max(1).optional(),
});

// ─── Compute Fund Exposure ──────────────────────────────────
export const ComputeFundExposureInput = z.object({
  client_id: z.string().uuid(),
  run_id: z.string().uuid().optional(),
});

// ─── Expand ETF Holdings ────────────────────────────────────
export const ExpandEtfHoldingsInput = z.object({
  client_id: z.string().uuid(),
  filing_id: z.string().uuid().optional(),
});

// ─── SEC Freshness Check ────────────────────────────────────
export const SecFreshnessCheckInput = z.object({
  client_id: z.string().uuid(),
});

// ─── SEC Import Accounts ────────────────────────────────────
export const SecImportAccountsInput = z.object({
  action: z.enum(["discover", "search", "import"]),
  client_id: z.string().uuid().optional(),
  search_term: z.string().max(500).optional(),
  cik: z.string().max(50).optional(),
  company_name: z.string().max(500).optional(),
});

// ─── Admin Create User ──────────────────────────────────────
export const AdminCreateUserInput = z.object({
  action: z.enum(["create_user", "toggle_user_status", "update_user_role", "update_user_team"]),
  email: z.string().email().optional(),
  password: z.string().min(8).max(128).optional(),
  full_name: z.string().min(1).max(200).optional(),
  team: z.string().max(100).optional(),
  role: z.enum(["admin", "sales_manager", "sales_rep", "viewer"]).optional(),
  user_id: z.string().uuid().optional(),
  is_active: z.boolean().optional(),
});

// ─── Helper to validate input ───────────────────────────────
export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): { data: T; error: null } | { data: null; error: string } {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return { data: null, error: `Validation failed: ${issues}` };
  }
  return { data: result.data, error: null };
}
