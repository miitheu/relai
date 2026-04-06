import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { optionsResponse, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";

const logger = createLogger("daily-brief");

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const auth = await verifyAuth(req);
    if (!auth) {
      return errorResponse("Unauthorized", 401);
    }

    const user_id = auth.userId;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Gather context
    const now = new Date();
    const sevenDaysOut = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

    // Active opportunities
    const { data: opps } = await sb.from('opportunities')
      .select('id, name, stage, value, probability, expected_close, last_activity_at, updated_at, clients(name)')
      .not('stage', 'in', '("Closed Won","Closed Lost","Inactive","On Hold")')
      .order('value', { ascending: false })
      .limit(20);

    // Stale opportunities (no activity 14+ days)
    const staleOpps = (opps || []).filter(o => {
      const lastDate = o.last_activity_at || o.updated_at;
      return lastDate && (now.getTime() - new Date(lastDate).getTime()) > 14 * 86400000;
    });

    // Upcoming renewals (30 days)
    const { data: renewals } = await sb.from('renewals')
      .select('id, value, renewal_date, status, client_id, opportunity_id, clients(name), datasets(name)')
      .in('status', ['Upcoming', 'Negotiation'])
      .lte('renewal_date', sevenDaysOut)
      .gte('renewal_date', now.toISOString().split('T')[0])
      .limit(10);

    // Trials ending soon
    const { data: trials } = await sb.from('deliveries')
      .select('id, trial_end_date, client_id, opportunity_id, clients(name), datasets(name)')
      .eq('delivery_type', 'Trial')
      .gte('trial_end_date', now.toISOString().split('T')[0])
      .lte('trial_end_date', sevenDaysOut)
      .limit(10);

    // Recent intelligence runs
    const { data: recentIntel } = await sb.from('fund_intelligence_runs')
      .select('id, client_id, filing_type, run_status, created_at, clients(name)')
      .eq('run_status', 'completed')
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(5);

    // Overdue tasks
    const { data: overdueTasks } = await sb.from('tasks')
      .select('id, title, due_date, priority, clients(name)')
      .eq('user_id', user_id)
      .neq('status', 'done')
      .lt('due_date', now.toISOString().split('T')[0])
      .limit(10);

    // Upcoming tasks (next 3 days)
    const threeDaysOut = new Date(now.getTime() + 3 * 86400000).toISOString().split('T')[0];
    const { data: upcomingTasks } = await sb.from('tasks')
      .select('id, title, due_date, priority, clients(name)')
      .eq('user_id', user_id)
      .neq('status', 'done')
      .gte('due_date', now.toISOString().split('T')[0])
      .lte('due_date', threeDaysOut)
      .limit(10);

    // Campaign targets not yet contacted
    const { data: uncontacted } = await sb.from('campaign_targets')
      .select('id, fit_score, status, clients(name), campaigns(name)')
      .eq('status', 'not_started')
      .order('fit_score', { ascending: false })
      .limit(5);

    const context = {
      date: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
      pipeline_count: (opps || []).length,
      pipeline_value: (opps || []).reduce((s, o) => s + Number(o.value) * (o.probability / 100), 0),
      stale_deals: staleOpps.map(o => ({ name: o.name, client: (o as any).clients?.name, value: o.value, stage: o.stage })),
      urgent_renewals: (renewals || []).map(r => ({ client: (r as any).clients?.name, dataset: (r as any).datasets?.name, value: r.value, date: r.renewal_date })),
      trials_ending: (trials || []).map(t => ({ client: (t as any).clients?.name, dataset: (t as any).datasets?.name, end_date: t.trial_end_date })),
      recent_intelligence: (recentIntel || []).map(r => ({ client: (r as any).clients?.name, type: r.filing_type })),
      overdue_tasks: (overdueTasks || []).map(t => ({ title: t.title, client: (t as any).clients?.name, due: t.due_date, priority: t.priority })),
      upcoming_tasks: (upcomingTasks || []).map(t => ({ title: t.title, client: (t as any).clients?.name, due: t.due_date })),
      uncontacted_targets: (uncontacted || []).map(t => ({ client: (t as any).clients?.name, campaign: (t as any).campaigns?.name, score: t.fit_score })),
    };

    const prompt = `You are a sales operations AI assistant for an alternative data sales team. Generate a concise, actionable daily brief for today (${context.date}).

DATA:
${JSON.stringify(context, null, 2)}

INSTRUCTIONS:
- Lead with the 1-3 most important things to focus on today
- Be specific: name accounts, values, dates
- Group into sections: 🔥 Urgent, 📋 Today's Actions, 📊 Pipeline Snapshot, 💡 Opportunities
- Keep it under 300 words
- Use markdown formatting
- If there are overdue tasks, highlight them first
- If high-score campaign targets haven't been contacted, flag them
- End with one motivational insight about the pipeline`;

    const { callAI } = await import("../_shared/ai.ts");
    const aiData = await callAI(sb, {
      model: "claude-sonnet-4-20250514",
      messages: [
        { role: "system", content: "You are a concise sales operations assistant. Output markdown." },
        { role: "user", content: prompt },
      ],
      max_tokens: 2000,
      userId: user_id,
      functionName: "daily-brief",
    });
    const brief = aiData.choices?.[0]?.message?.content || "Unable to generate brief.";

    // Also generate notifications for critical items
    const notifications: any[] = [];
    for (const task of (overdueTasks || [])) {
      notifications.push({
        user_id,
        title: `Overdue: ${task.title}`,
        message: `Task was due ${task.due_date}${(task as any).clients?.name ? ` for ${(task as any).clients.name}` : ''}`,
        notification_type: 'task_overdue',
        severity: 'urgent',
        link: task.clients ? `/clients/${task.clients}` : '/',
      });
    }
    for (const t of (trials || [])) {
      const trialLink = (t as any).opportunity_id
        ? `/pipeline/${(t as any).opportunity_id}`
        : (t as any).client_id
        ? `/clients/${(t as any).client_id}`
        : '/';
      notifications.push({
        user_id,
        title: `Trial ending: ${(t as any).clients?.name}`,
        message: `${(t as any).datasets?.name} trial ends ${t.trial_end_date}`,
        notification_type: 'trial_ending',
        severity: 'warning',
        link: trialLink,
      });
    }
    for (const r of (renewals || [])) {
      const renewalLink = (r as any).opportunity_id
        ? `/pipeline/${(r as any).opportunity_id}`
        : (r as any).client_id
        ? `/clients/${(r as any).client_id}`
        : '/';
      notifications.push({
        user_id,
        title: `Renewal due: ${(r as any).clients?.name}`,
        message: `${(r as any).datasets?.name} renewal ${r.renewal_date} — $${Number(r.value).toLocaleString()}`,
        notification_type: 'renewal_due',
        severity: 'warning',
        link: renewalLink,
      });
    }

    // Deduplicate: only insert if no existing notification with same title today
    if (notifications.length > 0) {
      const todayStart = now.toISOString().split('T')[0];
      const { data: existing } = await sb.from('notifications')
        .select('title')
        .eq('user_id', user_id)
        .gte('created_at', todayStart);
      const existingTitles = new Set((existing || []).map(e => e.title));
      const newNotifs = notifications.filter(n => !existingTitles.has(n.title));
      if (newNotifs.length > 0) {
        await sb.from('notifications').insert(newNotifs);
      }
    }

    logger.info("Daily brief generated", { user_id });

    return jsonResponse({ brief, context });
  } catch (e) {
    logger.error("Daily brief failed", { error: e instanceof Error ? e.message : "Unknown error" });
    return errorResponse("An internal error occurred", 500);
  }
});
