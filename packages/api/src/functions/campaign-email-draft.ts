import { callAI } from "../ai/provider";
import type { FunctionContext } from "./utils";
import { sanitizeForPrompt, stripCodeFences, safeParseJSON, AI_NOT_CONFIGURED_ERROR } from "./utils";

export default async function campaignEmailDraft(ctx: FunctionContext) {
  const { sql, body, aiConfig } = ctx;
  const { mode } = body;

  if (!aiConfig) return AI_NOT_CONFIGURED_ERROR;

  // ── Suggested Next Action mode ──
  if (mode === "suggested_action") {
    const c = body.context || {};
    const systemContent = "You are an expert institutional sales strategist at Relai, an alternative data vendor. Provide specific, actionable advice. Be direct and concise.";
    const prompt = `Analyze this account and suggest the single most impactful next action the sales rep should take.

ACCOUNT: ${sanitizeForPrompt(c.account) || "Unknown"}

ACTIVE OPPORTUNITIES (${(c.active_opps || []).length}):
${(c.active_opps || []).map((o: any) => `- ${o.name} | Stage: ${o.stage} | Value: $${o.value} | Expected close: ${o.expected_close || "N/A"} | Last activity: ${o.last_activity || "N/A"}`).join("\n") || "None"}

ACTIVE TRIALS (${(c.trials || []).length}):
${(c.trials || []).map((t: any) => `- ${t.dataset || "Unknown"} | Ends: ${t.end_date || "N/A"} | Status: ${t.status || "N/A"}`).join("\n") || "None"}

UPCOMING RENEWALS (${(c.renewals || []).length}):
${(c.renewals || []).map((r: any) => `- ${r.dataset || "Unknown"} | Date: ${r.date} | Value: $${r.value}`).join("\n") || "None"}

RESEARCH SIGNALS:
${(c.signals || []).map((s: any) => `- ${s.topic} (strength: ${s.strength})`).join("\n") || "None available"}

KEY CONTACTS (${c.contact_count || 0} total):
${(c.key_contacts || []).map((ct: any) => `- ${ct.name}, ${ct.title || "N/A"} (influence: ${ct.influence || "Unknown"})`).join("\n") || "None"}

Based on all this context, suggest ONE clear, specific next action. Include:
1. What to do (be specific)
2. Why this is the priority right now
3. A brief talking point or angle to use

Keep your response to 3-5 sentences. No JSON, just plain text.`;

    const aiData = await callAI(aiConfig, { system: systemContent, messages: [{ role: "user", content: prompt }], maxTokens: 500, temperature: 0.7 });
    return { data: { suggestion: aiData.content.trim() || "No suggestion generated." } };
  }

  // ── Opportunity email draft mode ──
  if (mode === "opportunity_email") {
    const {
      opportunity_name, stage, trigger, client_name: oppClientName, client_type: oppClientType,
      dataset_name, products, days_in_stage, days_since_activity,
      strategy_summary, suggested_messaging, recommended_approach: oppApproach,
      fit_score: oppFitScore, evidence_summary: oppEvidence,
      best_contact_name, best_contact_title, user_context,
      dataset_id, dataset_description, dataset_coverage, dataset_use_cases, dataset_live_stats,
    } = body;

    // Fetch sample emails
    let sampleContext = "";
    if (dataset_id) {
      const samples = await sql`
        SELECT subject, body FROM email_templates
        WHERE category = 'sample_email' AND is_active = true
        AND dataset_ids @> ${JSON.stringify([dataset_id])}::jsonb
        LIMIT 3
      `;
      if (samples.length > 0) {
        sampleContext = `\nSAMPLE EMAILS (use as style reference — adapt, do NOT copy verbatim):\n${samples.map((s: any, i: number) => `--- Sample ${i + 1} ---\nSubject: ${sanitizeForPrompt(s.subject, 100)}\nBody: ${sanitizeForPrompt(s.body, 500)}\n--- End ---`).join("\n")}\n`;
      }
    }
    if (!sampleContext) {
      const fallback = await sql`
        SELECT subject, body FROM email_templates WHERE category = 'sample_email' AND is_active = true LIMIT 2
      `;
      if (fallback.length > 0) {
        sampleContext = `\nSAMPLE EMAILS (use as style reference — adapt, do NOT copy verbatim):\n${fallback.map((s: any, i: number) => `--- Sample ${i + 1} ---\nSubject: ${sanitizeForPrompt(s.subject, 100)}\nBody: ${sanitizeForPrompt(s.body, 500)}\n--- End ---`).join("\n")}\n`;
      }
    }

    const stagePrompts: Record<string, string> = {
      Lead: "Write a cold/warm outreach email introducing Relai's data products. Reference intelligence about their strategy or portfolio. Explain why our data is relevant. Request an introductory call.",
      "Initial Discussion": "Write a follow-up email after an initial conversation. Summarize value proposition. Propose a product demo. Reference their strategy.",
      "Demo Scheduled": "Write a pre-demo agenda email. List what will be demonstrated. Ask about priorities and who else should attend.",
      Trial: "Write a trial kickoff email. Cover logistics, what to expect, success criteria, and check-in schedule.",
      Evaluation: "Write a check-in email during evaluation. Ask for feedback. Offer support. Create subtle urgency.",
      "Commercial Discussion": "Write a business case email. Frame ROI. Reference trial results or evidence of value. Provide pricing context.",
      "Contract Sent": "Write a gentle follow-up nudge. Address outstanding concerns. Reference key benefits. Mention timeline.",
    };

    const staleOverride = trigger === "stale"
      ? `Write a re-engagement email. It's been ${days_since_activity || "several"} days since last contact. Reference new developments. Give a compelling reason to re-engage.`
      : null;

    const stageInstruction = staleOverride || stagePrompts[stage] || stagePrompts.Lead;

    const oppPrompt = `${stageInstruction}

OPPORTUNITY: ${sanitizeForPrompt(opportunity_name)}
STAGE: ${stage} (${days_in_stage || 0} days in stage)
TRIGGER: ${trigger}

CLIENT:
- Company: ${sanitizeForPrompt(oppClientName)} (${sanitizeForPrompt(oppClientType) || "Unknown"})
- Product focus: ${sanitizeForPrompt(dataset_name) || (products || []).map((p: string) => sanitizeForPrompt(p)).join(", ") || "General"}
${best_contact_name ? `- Contact: ${sanitizeForPrompt(best_contact_name)}, ${sanitizeForPrompt(best_contact_title) || ""}` : ""}

${dataset_description || dataset_coverage || dataset_use_cases ? `PRODUCT: "${sanitizeForPrompt(dataset_name)}" DETAILS:
${dataset_description ? `- Description: ${sanitizeForPrompt(dataset_description, 500)}` : ""}
${dataset_coverage ? `- Coverage: ${sanitizeForPrompt(dataset_coverage, 300)}` : ""}
${dataset_use_cases ? `- Use cases: ${sanitizeForPrompt(dataset_use_cases, 300)}` : ""}
${dataset_live_stats ? `- Live stats: ${JSON.stringify(dataset_live_stats)}` : ""}
IMPORTANT: Refer to this product ONLY as "${sanitizeForPrompt(dataset_name)}".` : ""}

${strategy_summary ? `INTELLIGENCE:\n- Strategy: ${sanitizeForPrompt(strategy_summary, 300)}` : ""}
${suggested_messaging ? `- Messaging angle: ${sanitizeForPrompt(suggested_messaging, 200)}` : ""}
${oppApproach ? `- Recommended approach: ${sanitizeForPrompt(oppApproach, 200)}` : ""}
${oppFitScore ? `- Product fit: ${oppFitScore}/100` : ""}
${oppEvidence ? `- Evidence: ${sanitizeForPrompt(oppEvidence, 200)}` : ""}

${user_context ? `ADDITIONAL CONTEXT FROM REP (HIGHEST PRIORITY):\n${sanitizeForPrompt(user_context, 1500)}` : ""}
${sampleContext}
RULES:
1. Subject line: concise, specific, no clickbait.
2. Body: 3-4 short paragraphs. Professional but not stiff.
3. DO NOT fabricate facts.
4. DO NOT use generic phrases like "I hope this email finds you well".
5. Keep under 200 words.
6. Sign off as a Relai sales representative.
7. Focus ONLY on the specific product listed above.

Generate TWO variants:
- Variant A: "Warm & consultative"
- Variant B: "Concise & direct"

Return JSON: {"variants": [{"tone": "Warm & consultative", "subject": "...", "body": "..."}, {"tone": "Concise & direct", "subject": "...", "body": "..."}]}`;

    const aiData = await callAI(aiConfig, {
      system: "You are an expert institutional sales copywriter at Relai, an alternative data vendor. Return only valid JSON. No markdown fences.",
      messages: [{ role: "user", content: oppPrompt }],
      temperature: 0.6,
      maxTokens: 1000,
    });

    const parsed = safeParseJSON(aiData.content, { subject: `${oppClientName} — ${opportunity_name}`, body: aiData.content });
    if (parsed.variants && Array.isArray(parsed.variants)) {
      return { data: { variants: parsed.variants } };
    }
    return { data: { variants: [{ tone: "Warm & consultative", subject: parsed.subject, body: parsed.body }] } };
  }

  // ── Email draft / messaging framework mode (default) ──
  const {
    campaign_name, campaign_focus, campaign_description,
    client_name, client_type,
    fit_score, message_angle, evidence_of_fit, product_relevance,
    why_now, best_persona, recommended_approach,
    coverage_overlap, sector_relevance, supporting_companies, evidence_summary,
    generate_messaging_framework,
  } = body;

  let systemContent: string;
  let prompt: string;

  if (generate_messaging_framework) {
    systemContent = "You are an expert institutional sales strategist. Generate a structured messaging framework. Return only valid JSON. No markdown.";
    prompt = `Create a campaign-level messaging framework for Relai, an alternative data vendor.

CAMPAIGN:
- Name: ${sanitizeForPrompt(campaign_name)}
- Objective: ${sanitizeForPrompt(campaign_focus?.replace(/_/g, " "))}
- Brief: ${sanitizeForPrompt(campaign_description) || "N/A"}
- Products: ${sanitizeForPrompt(evidence_of_fit) || "All products"}
- Target types: ${sanitizeForPrompt(why_now) || "All types"}
- Geography: ${sanitizeForPrompt(evidence_summary) || "Global"}

Generate a complete messaging framework with:
1. A compelling value proposition (1-2 sentences)
2. 4 talk tracks (Opening Hook, Value Bridge, Evidence & Proof Points, Call to Action)
3. 3 objection-response pairs
4. Tone guidance

Return JSON: {"subject": "value proposition summary", "body": "Full framework text with sections separated by double newlines."}`;
  } else {
    systemContent = "You are an expert institutional sales copywriter. Return only valid JSON with 'subject' and 'body' fields. No markdown.";
    prompt = `You are a senior institutional sales professional at Relai, an alternative data vendor. Write a professional outreach email.

CONTEXT:
- Campaign: ${sanitizeForPrompt(campaign_name)} (${sanitizeForPrompt(campaign_focus?.replace(/_/g, " "))})
- Campaign brief: ${sanitizeForPrompt(campaign_description) || "N/A"}
- Recipient's company: ${sanitizeForPrompt(client_name)} (${sanitizeForPrompt(client_type) || "Unknown type"})
- Recipient's role: ${sanitizeForPrompt(best_persona) || "Senior data buyer"}
- Fit score: ${fit_score}/100
- Coverage overlap: ${coverage_overlap || 0}%

INTELLIGENCE:
- Message angle: ${sanitizeForPrompt(message_angle) || "N/A"}
- Evidence of fit: ${sanitizeForPrompt(evidence_of_fit) || "N/A"}
- Product relevance: ${sanitizeForPrompt(product_relevance) || "N/A"}
- Why now: ${sanitizeForPrompt(why_now) || "N/A"}
- Evidence summary: ${sanitizeForPrompt(evidence_summary) || "N/A"}
- Relevant sectors: ${(sector_relevance || []).join(", ") || "N/A"}
- Supporting companies: ${(supporting_companies || []).map((c: any) => typeof c === "string" ? c : c.name).join(", ") || "N/A"}
- Recommended approach: ${sanitizeForPrompt(recommended_approach) || "N/A"}

RULES:
1. Subject line: concise, specific, no clickbait.
2. Body: 3-4 short paragraphs. Professional but not stiff.
3. Reference something specific about their business.
4. Explain what Relai data would help them do.
5. Suggest a specific next step.
6. DO NOT make up facts.
7. DO NOT use generic phrases.
8. Keep under 200 words.

Return JSON: {"subject": "...", "body": "..."}`;
  }

  const aiData = await callAI(aiConfig, {
    system: systemContent,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.6,
    maxTokens: 2000,
  });

  const result = safeParseJSON(aiData.content, {
    subject: `${client_name} — ${message_angle || campaign_name}`,
    body: stripCodeFences(aiData.content),
  });

  return { data: result };
}
