import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { optionsResponse, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";
import { sanitizeForPrompt } from "../_shared/sanitize.ts";

const logger = createLogger("campaign-email-draft");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return optionsResponse();
  }

  try {
    const auth = await verifyAuth(req).catch(() => null);

    const body = await req.json();
    const { mode } = body;

    // ── Suggested Next Action mode ──
    if (mode === 'suggested_action') {
      const ctx = body.context || {};
      const systemContent = "You are an expert institutional sales strategist at Relai, an alternative data vendor. Provide specific, actionable advice. Be direct and concise.";
      const prompt = `Analyze this account and suggest the single most impactful next action the sales rep should take.

ACCOUNT: ${sanitizeForPrompt(ctx.account) || 'Unknown'}

ACTIVE OPPORTUNITIES (${(ctx.active_opps || []).length}):
${(ctx.active_opps || []).map((o: any) => `- ${o.name} | Stage: ${o.stage} | Value: $${o.value} | Expected close: ${o.expected_close || 'N/A'} | Last activity: ${o.last_activity || 'N/A'}`).join('\n') || 'None'}

ACTIVE TRIALS (${(ctx.trials || []).length}):
${(ctx.trials || []).map((t: any) => `- ${t.dataset || 'Unknown'} | Ends: ${t.end_date || 'N/A'} | Status: ${t.status || 'N/A'}`).join('\n') || 'None'}

UPCOMING RENEWALS (${(ctx.renewals || []).length}):
${(ctx.renewals || []).map((r: any) => `- ${r.dataset || 'Unknown'} | Date: ${r.date} | Value: $${r.value}`).join('\n') || 'None'}

RESEARCH SIGNALS:
${(ctx.signals || []).map((s: any) => `- ${s.topic} (strength: ${s.strength})`).join('\n') || 'None available'}

KEY CONTACTS (${ctx.contact_count || 0} total):
${(ctx.key_contacts || []).map((c: any) => `- ${c.name}, ${c.title || 'N/A'} (influence: ${c.influence || 'Unknown'})`).join('\n') || 'None'}

Based on all this context, suggest ONE clear, specific next action. Include:
1. What to do (be specific — e.g. "Schedule a check-in call with [contact name]" not "follow up")
2. Why this is the priority right now
3. A brief talking point or angle to use

Keep your response to 3-5 sentences. No JSON, just plain text.`;

      const { callAI } = await import("../_shared/ai.ts");
      const aiData = await callAI(
        (await import("https://esm.sh/@supabase/supabase-js@2")).createClient(
          Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        ),
        {
          model: "claude-sonnet-4-20250514",
          messages: [
            { role: "system", content: systemContent },
            { role: "user", content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 500,
          userId: auth?.userId,
          functionName: "campaign-email-draft",
        },
      );
      const suggestion = aiData.choices?.[0]?.message?.content?.trim() || "No suggestion generated.";

      return jsonResponse({ suggestion });
    }

    // ── Opportunity email draft mode ──
    if (mode === 'opportunity_email') {
      const {
        opportunity_name, stage, trigger,
        client_name: oppClientName, client_type: oppClientType,
        dataset_name, products,
        days_in_stage, days_since_activity,
        strategy_summary, suggested_messaging, recommended_approach: oppApproach,
        fit_score: oppFitScore, evidence_summary: oppEvidence,
        best_contact_name, best_contact_title,
        user_context,
        dataset_id,
        dataset_description, dataset_coverage, dataset_use_cases,
        dataset_live_stats,
      } = body;

      // Fetch matching sample emails for this product
      const sb = (await import("https://esm.sh/@supabase/supabase-js@2")).createClient(
        Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      let sampleContext = "";
      if (dataset_id) {
        const { data: samples } = await (sb.from("email_templates") as any)
          .select("subject, body")
          .eq("category", "sample_email")
          .eq("is_active", true)
          .contains("dataset_ids", JSON.stringify([dataset_id]))
          .limit(3);
        if (samples && samples.length > 0) {
          sampleContext = `\nSAMPLE EMAILS (use as style reference — adapt for this specific opportunity, do NOT copy verbatim):\n${samples.map((s: any, i: number) => `--- Sample ${i + 1} ---\nSubject: ${sanitizeForPrompt(s.subject, 100)}\nBody: ${sanitizeForPrompt(s.body, 500)}\n--- End ---`).join("\n")}\n`;
        }
      }
      // Fallback: if no product-specific samples, try any active samples
      if (!sampleContext) {
        const { data: fallbackSamples } = await (sb.from("email_templates") as any)
          .select("subject, body")
          .eq("category", "sample_email")
          .eq("is_active", true)
          .limit(2);
        if (fallbackSamples && fallbackSamples.length > 0) {
          sampleContext = `\nSAMPLE EMAILS (use as style reference — adapt for this specific opportunity, do NOT copy verbatim):\n${fallbackSamples.map((s: any, i: number) => `--- Sample ${i + 1} ---\nSubject: ${sanitizeForPrompt(s.subject, 100)}\nBody: ${sanitizeForPrompt(s.body, 500)}\n--- End ---`).join("\n")}\n`;
        }
      }

      const stagePrompts: Record<string, string> = {
        'Lead': `Write a cold/warm outreach email introducing Relai's data products. Reference any intelligence about their strategy or portfolio. Explain why our data is relevant to them. Request an introductory call.`,
        'Initial Discussion': `Write a follow-up email after an initial conversation. Summarize Relai's value proposition for this client. Propose scheduling a product demo. Reference their strategy or interests.`,
        'Demo Scheduled': `Write a pre-demo agenda email. List what will be demonstrated. Ask about their priorities and who else should attend. Keep it brief and focused.`,
        'Trial': `Write a trial kickoff email. Cover logistics, what to expect during the trial, success criteria, and the check-in schedule. Be welcoming and supportive.`,
        'Evaluation': `Write a check-in email during their evaluation period. Ask for feedback on the data. Offer support and resources. Create subtle urgency without being pushy.`,
        'Commercial Discussion': `Write a business case email. Frame the ROI of Relai data. Reference any trial results or evidence of value. Provide pricing context and next steps.`,
        'Contract Sent': `Write a gentle follow-up nudge. Address any outstanding concerns. Reference key benefits discussed. Mention any relevant timeline or deadline.`,
      };

      const staleOverride = trigger === 'stale'
        ? `Write a re-engagement email. It's been ${days_since_activity || 'several'} days since last contact. Reference any new developments at Relai or in their sector. Give them a compelling reason to re-engage. Don't be apologetic.`
        : null;

      const stageInstruction = staleOverride || stagePrompts[stage] || stagePrompts['Lead'];

      const oppSystemContent = "You are an expert institutional sales copywriter at Relai, an alternative data vendor. Return only valid JSON. No markdown fences.";
      const oppPrompt = `${stageInstruction}

OPPORTUNITY: ${sanitizeForPrompt(opportunity_name)}
STAGE: ${stage} (${days_in_stage || 0} days in stage)
TRIGGER: ${trigger}

CLIENT:
- Company: ${sanitizeForPrompt(oppClientName)} (${sanitizeForPrompt(oppClientType) || 'Unknown'})
- Product focus: ${sanitizeForPrompt(dataset_name) || (products || []).map((p: string) => sanitizeForPrompt(p)).join(', ') || 'General'}
${best_contact_name ? `- Contact: ${sanitizeForPrompt(best_contact_name)}, ${sanitizeForPrompt(best_contact_title) || ''}` : ''}

${dataset_description || dataset_coverage || dataset_use_cases ? `PRODUCT: "${sanitizeForPrompt(dataset_name)}" DETAILS (use specific numbers and facts from this section — this is the ONLY product you should discuss):
${dataset_description ? `- Description: ${sanitizeForPrompt(dataset_description, 500)}` : ''}
${dataset_coverage ? `- Coverage: ${sanitizeForPrompt(dataset_coverage, 300)}` : ''}
${dataset_use_cases ? `- Use cases: ${sanitizeForPrompt(dataset_use_cases, 300)}` : ''}
${dataset_live_stats ? `- Live stats (USE THESE SPECIFIC NUMBERS in your email): ${JSON.stringify(dataset_live_stats)}` : ''}
IMPORTANT: Refer to this product ONLY as "${sanitizeForPrompt(dataset_name)}". Do NOT use names of other Relai products or confuse this with other datasets.` : ''}

${strategy_summary ? `INTELLIGENCE:\n- Strategy: ${sanitizeForPrompt(strategy_summary, 300)}` : ''}
${suggested_messaging ? `- Messaging angle: ${sanitizeForPrompt(suggested_messaging, 200)}` : ''}
${oppApproach ? `- Recommended approach: ${sanitizeForPrompt(oppApproach, 200)}` : ''}
${oppFitScore ? `- Product fit: ${oppFitScore}/100` : ''}
${oppEvidence ? `- Evidence: ${sanitizeForPrompt(oppEvidence, 200)}` : ''}

${user_context ? `ADDITIONAL CONTEXT FROM REP (HIGHEST PRIORITY — incorporate all points from this section, including any reference template structure and talking points):\n${sanitizeForPrompt(user_context, 1500)}` : ''}
${sampleContext}
RULES:
1. Subject line: concise, specific, no clickbait.
2. Body: 3-4 short paragraphs. Professional but not stiff.
3. DO NOT fabricate facts. Only use information provided.
4. DO NOT use generic phrases like "I hope this email finds you well".
5. Keep under 200 words.
6. Sign off as a Relai sales representative.
7. IMPORTANT: Focus ONLY on the specific product listed under "Product focus" above. Do NOT mention other products or data feeds that are not part of this opportunity.

Generate TWO variants of the email with different tones:
- Variant A: "Warm & consultative" — relationship-focused, empathetic, asks questions
- Variant B: "Concise & direct" — shorter, to-the-point, action-oriented

Return JSON: {"variants": [{"tone": "Warm & consultative", "subject": "...", "body": "..."}, {"tone": "Concise & direct", "subject": "...", "body": "..."}]}`;

      const { callAI: callOppAI } = await import("../_shared/ai.ts");
      const oppAiData = await callOppAI(
        sb || (await import("https://esm.sh/@supabase/supabase-js@2")).createClient(
          Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        ),
        {
          model: "claude-sonnet-4-20250514",
          messages: [
            { role: "system", content: oppSystemContent },
            { role: "user", content: oppPrompt },
          ],
          temperature: 0.6,
          max_tokens: 1000,
          userId: auth?.userId,
          functionName: "campaign-email-draft",
        },
      );
      let oppContent = oppAiData.choices?.[0]?.message?.content || "";
      oppContent = oppContent.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

      let parsed: any;
      try {
        parsed = JSON.parse(oppContent);
      } catch {
        parsed = {
          subject: `${oppClientName} — ${opportunity_name}`,
          body: oppContent,
        };
      }

      // Support both formats: {variants: [...]} or {subject, body}
      if (parsed.variants && Array.isArray(parsed.variants)) {
        return jsonResponse({ variants: parsed.variants });
      }
      // Fallback: single result → wrap as two variants
      return jsonResponse({
        variants: [
          { tone: "Warm & consultative", subject: parsed.subject, body: parsed.body },
        ],
      });
    }

    // ── Email draft / messaging framework mode ──
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
      systemContent = "You are an expert institutional sales strategist. Generate a structured messaging framework. Return only valid JSON with the specified fields. No markdown.";
      prompt = `Create a campaign-level messaging framework for Relai, an alternative data vendor.

CAMPAIGN:
- Name: ${sanitizeForPrompt(campaign_name)}
- Objective: ${sanitizeForPrompt(campaign_focus?.replace(/_/g, ' '))}
- Brief: ${sanitizeForPrompt(campaign_description) || 'N/A'}
- Products: ${sanitizeForPrompt(evidence_of_fit) || 'All products'}
- Target types: ${sanitizeForPrompt(why_now) || 'All types'}
- Geography: ${sanitizeForPrompt(evidence_summary) || 'Global'}

Generate a complete messaging framework with:
1. A compelling value proposition (1-2 sentences)
2. 4 talk tracks (Opening Hook, Value Bridge, Evidence & Proof Points, Call to Action) — each with a title and detailed content paragraph
3. 3 objection-response pairs specific to this campaign objective
4. Tone guidance

Return JSON: {"subject": "value proposition summary", "body": "Full framework text with sections clearly separated by double newlines. Format: TALK TRACKS section, then OBJECTION HANDLING section, then TONE section."}
No markdown fences.`;
    } else {
      systemContent = "You are an expert institutional sales copywriter. Return only valid JSON with 'subject' and 'body' fields. No markdown.";
      prompt = `You are a senior institutional sales professional at Relai, an alternative data vendor. Write a professional outreach email.

CONTEXT:
- Campaign: ${sanitizeForPrompt(campaign_name)} (${sanitizeForPrompt(campaign_focus?.replace(/_/g, ' '))})
- Campaign brief: ${sanitizeForPrompt(campaign_description) || 'N/A'}
- Recipient's company: ${sanitizeForPrompt(client_name)} (${sanitizeForPrompt(client_type) || 'Unknown type'})
- Recipient's role: ${sanitizeForPrompt(best_persona) || 'Senior data buyer'}
- Fit score: ${fit_score}/100
- Coverage overlap: ${coverage_overlap || 0}%

INTELLIGENCE (use this to personalize — DO NOT fabricate details):
- Message angle: ${sanitizeForPrompt(message_angle) || 'N/A'}
- Evidence of fit: ${sanitizeForPrompt(evidence_of_fit) || 'N/A'}
- Product relevance: ${sanitizeForPrompt(product_relevance) || 'N/A'}
- Why now: ${sanitizeForPrompt(why_now) || 'N/A'}
- Evidence summary: ${sanitizeForPrompt(evidence_summary) || 'N/A'}
- Relevant sectors: ${(sector_relevance || []).join(', ') || 'N/A'}
- Supporting portfolio companies: ${(supporting_companies || []).map((c: any) => typeof c === 'string' ? c : c.name).join(', ') || 'N/A'}
- Recommended approach: ${sanitizeForPrompt(recommended_approach) || 'N/A'}

RULES:
1. Subject line: concise, specific, no clickbait. Reference the company or a relevant theme.
2. Body: 3-4 short paragraphs. Professional but not stiff.
3. Opening: Reference something specific about their business or portfolio (from intelligence above).
4. Value prop: Explain what Relai data would help them do, grounded in the evidence above.
5. CTA: Suggest a specific next step (brief call, demo, trial).
6. Sign off professionally.
7. DO NOT make up facts. Only use information provided above.
8. DO NOT use generic phrases like "I hope this email finds you well" or "I wanted to reach out".
9. Keep it under 200 words.

Return JSON with two fields: "subject" (string) and "body" (string). No markdown fences.`;
    }

    const { callAI: callAI2 } = await import("../_shared/ai.ts");
    const aiData2 = await callAI2(
      (await import("https://esm.sh/@supabase/supabase-js@2")).createClient(
        Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      ),
      {
        model: "claude-sonnet-4-20250514",
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: prompt },
        ],
        temperature: 0.6,
        max_tokens: 2000,
        userId: auth?.userId,
        functionName: "campaign-email-draft",
      },
    );
    let content = aiData2.choices?.[0]?.message?.content || "";
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let result: { subject: string; body: string };
    try {
      result = JSON.parse(content);
    } catch {
      result = {
        subject: `${client_name} — ${message_angle || campaign_name}`,
        body: content,
      };
    }

    return jsonResponse(result);
  } catch (e: any) {
    logger.error("campaign-email-draft error", { error: e.message, stack: e.stack });
    return errorResponse("An internal error occurred", 400);
  }
});
