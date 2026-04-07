import { callAI } from "../ai/provider";
import type { FunctionContext } from "./utils";
import { AI_NOT_CONFIGURED_ERROR } from "./utils";

export default async function dailyBrief(ctx: FunctionContext) {
  const { sql, userId, aiConfig } = ctx;
  if (!aiConfig) return AI_NOT_CONFIGURED_ERROR;

  const now = new Date();
  const sevenDaysOut = new Date(now.getTime() + 7 * 86400000).toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
  const todayStr = now.toISOString().split("T")[0];
  const threeDaysOut = new Date(now.getTime() + 3 * 86400000).toISOString().split("T")[0];

  const [opps, renewals, trials, recentIntel, overdueTasks, upcomingTasks, uncontacted] = await Promise.all([
    sql`SELECT id, name, stage, value, probability, expected_close, last_activity_at, updated_at
        FROM opportunities
        WHERE stage NOT IN ('Closed Won','Closed Lost','Inactive','On Hold')
        ORDER BY value DESC LIMIT 20`,
    sql`SELECT id, value, renewal_date, status, client_id, opportunity_id
        FROM renewals
        WHERE status IN ('Upcoming','Negotiation') AND renewal_date >= ${todayStr} AND renewal_date <= ${sevenDaysOut}
        LIMIT 10`,
    sql`SELECT id, trial_end_date, client_id, opportunity_id
        FROM deliveries
        WHERE delivery_type = 'Trial' AND trial_end_date >= ${todayStr} AND trial_end_date <= ${sevenDaysOut}
        LIMIT 10`,
    sql`SELECT id, client_id, filing_type, run_status, created_at
        FROM fund_intelligence_runs
        WHERE run_status = 'completed' AND created_at >= ${thirtyDaysAgo}
        ORDER BY created_at DESC LIMIT 5`,
    sql`SELECT id, title, due_date, priority, client_id
        FROM tasks
        WHERE user_id = ${userId} AND status != 'done' AND due_date < ${todayStr}
        LIMIT 10`,
    sql`SELECT id, title, due_date, priority, client_id
        FROM tasks
        WHERE user_id = ${userId} AND status != 'done' AND due_date >= ${todayStr} AND due_date <= ${threeDaysOut}
        LIMIT 10`,
    sql`SELECT id, fit_score, status, client_id, campaign_id
        FROM campaign_targets
        WHERE status = 'not_started'
        ORDER BY fit_score DESC LIMIT 5`,
  ]);

  // Stale opportunities
  const staleOpps = opps.filter((o: any) => {
    const lastDate = o.last_activity_at || o.updated_at;
    return lastDate && (now.getTime() - new Date(lastDate).getTime()) > 14 * 86400000;
  });

  // Get client names for related entities
  const clientIds = new Set<string>();
  for (const arr of [opps, renewals, trials, overdueTasks, upcomingTasks, uncontacted]) {
    for (const item of arr) if (item.client_id) clientIds.add(item.client_id);
  }
  const clientNames: Record<string, string> = {};
  if (clientIds.size > 0) {
    const ids = Array.from(clientIds);
    const clients = await sql`SELECT id, name FROM clients WHERE id = ANY(${ids})`;
    for (const c of clients) clientNames[c.id] = c.name;
  }

  // Get campaign names
  const campaignIds = new Set<string>();
  for (const t of uncontacted) if (t.campaign_id) campaignIds.add(t.campaign_id);
  const campaignNames: Record<string, string> = {};
  if (campaignIds.size > 0) {
    const ids = Array.from(campaignIds);
    const campaigns = await sql`SELECT id, name FROM campaigns WHERE id = ANY(${ids})`;
    for (const c of campaigns) campaignNames[c.id] = c.name;
  }

  const context = {
    date: now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
    pipeline_count: opps.length,
    pipeline_value: opps.reduce((s: number, o: any) => s + Number(o.value) * (o.probability / 100), 0),
    stale_deals: staleOpps.map((o: any) => ({ name: o.name, client: clientNames[o.client_id], value: o.value, stage: o.stage })),
    urgent_renewals: renewals.map((r: any) => ({ client: clientNames[r.client_id], value: r.value, date: r.renewal_date })),
    trials_ending: trials.map((t: any) => ({ client: clientNames[t.client_id], end_date: t.trial_end_date })),
    recent_intelligence: recentIntel.map((r: any) => ({ client: clientNames[r.client_id], type: r.filing_type })),
    overdue_tasks: overdueTasks.map((t: any) => ({ title: t.title, client: clientNames[t.client_id], due: t.due_date, priority: t.priority })),
    upcoming_tasks: upcomingTasks.map((t: any) => ({ title: t.title, client: clientNames[t.client_id], due: t.due_date })),
    uncontacted_targets: uncontacted.map((t: any) => ({ client: clientNames[t.client_id], campaign: campaignNames[t.campaign_id], score: t.fit_score })),
  };

  const prompt = `You are a sales operations AI assistant for an alternative data sales team. Generate a concise, actionable daily brief for today (${context.date}).

DATA:
${JSON.stringify(context, null, 2)}

INSTRUCTIONS:
- Lead with the 1-3 most important things to focus on today
- Be specific: name accounts, values, dates
- Group into sections: Urgent, Today's Actions, Pipeline Snapshot, Opportunities
- Keep it under 300 words
- Use markdown formatting
- If there are overdue tasks, highlight them first
- If high-score campaign targets haven't been contacted, flag them
- End with one motivational insight about the pipeline`;

  const aiData = await callAI(aiConfig, {
    system: "You are a concise sales operations assistant. Output markdown.",
    messages: [{ role: "user", content: prompt }],
    maxTokens: 2000,
  });

  const brief = aiData.content || "Unable to generate brief.";

  // Generate notifications for critical items
  const notifications: any[] = [];
  for (const task of overdueTasks) {
    notifications.push({
      user_id: userId,
      title: `Overdue: ${task.title}`,
      message: `Task was due ${task.due_date}${clientNames[task.client_id] ? ` for ${clientNames[task.client_id]}` : ""}`,
      notification_type: "task_overdue",
      severity: "urgent",
    });
  }
  for (const t of trials) {
    notifications.push({
      user_id: userId,
      title: `Trial ending: ${clientNames[t.client_id]}`,
      message: `Trial ends ${t.trial_end_date}`,
      notification_type: "trial_ending",
      severity: "warning",
    });
  }
  for (const r of renewals) {
    notifications.push({
      user_id: userId,
      title: `Renewal due: ${clientNames[r.client_id]}`,
      message: `Renewal ${r.renewal_date} — $${Number(r.value).toLocaleString()}`,
      notification_type: "renewal_due",
      severity: "warning",
    });
  }

  // Deduplicate notifications
  if (notifications.length > 0) {
    const existing = await sql`SELECT title FROM notifications WHERE user_id = ${userId} AND created_at >= ${todayStr}`;
    const existingTitles = new Set(existing.map((e: any) => e.title));
    const newNotifs = notifications.filter(n => !existingTitles.has(n.title));
    if (newNotifs.length > 0) {
      for (const n of newNotifs) {
        await sql`INSERT INTO notifications (user_id, title, message, notification_type, severity) VALUES (${n.user_id}, ${n.title}, ${n.message}, ${n.notification_type}, ${n.severity})`;
      }
    }
  }

  return { data: { brief, context } };
}
