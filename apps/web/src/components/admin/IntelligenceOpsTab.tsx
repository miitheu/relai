import { useState } from 'react';
import {
  useAllIntelligenceRuns,
  useAccountsWithoutIntelligence,
  useGenerateIntelligence,
  type IntelligenceRun,
} from '@/hooks/useFundIntelligence';
import { useDb } from '@relai/db/react';
import { useQuery } from '@tanstack/react-query';
import {
  Brain, Loader2, RefreshCw, AlertTriangle, CheckCircle2,
  Clock, Search, Zap, XCircle, ChevronDown, ChevronRight,
  Play, BarChart3,
} from 'lucide-react';

const STEP_LABELS: Record<string, string> = {
  account_classification: 'Classification',
  source_discovery: 'Source Discovery',
  source_retrieval: 'Source Retrieval',
  holdings_extraction: 'Holdings Extraction',
  signal_generation: 'Signal Generation',
  product_fit_analysis: 'Product Fit',
  intelligence_summary: 'Summary',
};

export default function IntelligenceOpsTab() {
  const db = useDb();
  const { data: allRuns = [], isLoading: runsLoading } = useAllIntelligenceRuns();
  const { data: noIntelAccounts = [] } = useAccountsWithoutIntelligence();
  const [filter, setFilter] = useState<'all' | 'failed' | 'completed' | 'processing'>('all');
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  // Stale intelligence
  const { data: staleSummaries = [] } = useQuery({
    queryKey: ['stale-intelligence'],
    queryFn: async () => {
      const { data } = await db.query('account_intelligence_summaries', { select: '*, clients(id, name, client_type)', or: 'freshness_status.eq.stale,freshness_status.eq.aging,new_source_available.eq.true', order: [{ column: 'generated_at', ascending: true }] });
      return (data || []) as any[];
    },
  });

  const filteredRuns = filter === 'all' ? allRuns : allRuns.filter(r => r.run_status === filter);
  const failedRuns = allRuns.filter(r => r.run_status === 'failed');
  const processingRuns = allRuns.filter(r => r.run_status === 'processing');
  const completedRuns = allRuns.filter(r => r.run_status === 'completed');
  const newSourceAccounts = staleSummaries.filter((s: any) => s.new_source_available);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-5 gap-3">
        <KPI icon={Brain} label="Total Runs" value={allRuns.length} color="text-primary" />
        <KPI icon={CheckCircle2} label="Completed" value={completedRuns.length} color="text-success" />
        <KPI icon={XCircle} label="Failed" value={failedRuns.length} color="text-destructive" />
        <KPI icon={AlertTriangle} label="No Intelligence" value={noIntelAccounts.length} color="text-warning" />
        <KPI icon={Zap} label="New Filings" value={newSourceAccounts.length} color="text-info" />
      </div>

      {/* Accounts with new SEC filings */}
      {newSourceAccounts.length > 0 && (
        <section className="data-card border-info/30">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={14} className="text-info" />
            <h3 className="text-sm font-semibold">Accounts with New SEC Filings</h3>
          </div>
          <div className="space-y-2">
            {newSourceAccounts.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{s.clients?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    New filing: {s.new_source_metadata?.filing_date || '—'}
                    · Last run: {new Date(s.generated_at).toLocaleDateString()}
                  </p>
                </div>
                <RerunButton clientId={s.client_id} clientName={s.clients?.name || ''} reason="sec_update" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Accounts without intelligence */}
      {noIntelAccounts.length > 0 && (
        <section className="data-card">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={14} className="text-warning" />
            <h3 className="text-sm font-semibold">Accounts Without Intelligence</h3>
            <span className="text-[10px] text-muted-foreground ml-auto">{noIntelAccounts.length} accounts</span>
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {noIntelAccounts.slice(0, 20).map((c: any) => (
              <div key={c.id} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{c.name}</span>
                  <span className="text-[10px] text-muted-foreground">{c.client_type}</span>
                </div>
                <RerunButton clientId={c.id} clientName={c.name} reason="initial" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Stale intelligence */}
      {staleSummaries.filter((s: any) => !s.new_source_available).length > 0 && (
        <section className="data-card">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={14} className="text-warning" />
            <h3 className="text-sm font-semibold">Stale Intelligence</h3>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {staleSummaries.filter((s: any) => !s.new_source_available).map((s: any) => (
              <div key={s.id} className="flex items-center justify-between py-1.5">
                <div>
                  <span className="text-sm">{s.clients?.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    Last: {new Date(s.generated_at).toLocaleDateString()} · {s.freshness_status}
                  </span>
                </div>
                <RerunButton clientId={s.client_id} clientName={s.clients?.name || ''} reason="refresh" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Run History */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold">Run History</h3>
          <div className="flex gap-1 ml-auto">
            {(['all', 'completed', 'failed', 'processing'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-[10px] px-2 py-0.5 rounded ${filter === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                {f}
              </button>
            ))}
          </div>
        </div>
        {runsLoading ? (
          <div className="text-center py-4"><Loader2 size={16} className="animate-spin text-muted-foreground mx-auto" /></div>
        ) : (
          <div className="space-y-1">
            {filteredRuns.slice(0, 50).map((r) => (
              <RunRow key={r.id} run={r} expanded={expandedRun === r.id} onToggle={() => setExpandedRun(expandedRun === r.id ? null : r.id)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function KPI({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number; color: string }) {
  return (
    <div className="data-card text-center py-3">
      <Icon size={16} className={`${color} mx-auto mb-1`} />
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function RerunButton({ clientId, clientName, reason }: { clientId: string; clientName: string; reason: string }) {
  const gen = useGenerateIntelligence();
  return (
    <button
      onClick={() => gen.mutate({ clientId, clientName, runReason: reason })}
      disabled={gen.isPending}
      className="flex items-center gap-1 text-[10px] text-primary hover:underline disabled:opacity-50"
    >
      {gen.isPending ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
      Run
    </button>
  );
}

function RunRow({ run, expanded, onToggle }: { run: IntelligenceRun & { clients: { name: string } }; expanded: boolean; onToggle: () => void }) {
  const db = useDb();
  const { data: steps = [] } = useQuery({
    queryKey: ['run-steps', run.id],
    enabled: expanded,
    queryFn: async () => {
      const { data } = await db.query('intelligence_run_steps', { select: '*', filters: [{ column: 'run_id', operator: 'eq', value: run.id }], order: [{ column: 'step_order', ascending: true }] });
      return (data || []) as any[];
    },
  });

  return (
    <div className="border border-border/50 rounded-lg">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/30 transition-colors">
        <span className={`w-2 h-2 rounded-full shrink-0 ${
          run.run_status === 'completed' ? 'bg-success' :
          run.run_status === 'failed' ? 'bg-destructive' :
          'bg-warning animate-pulse'
        }`} />
        <span className="text-sm font-medium flex-1">{run.clients?.name}</span>
        <span className="text-[10px] text-muted-foreground">{(run as any).playbook_type}</span>
        <span className="text-[10px] text-muted-foreground">{new Date(run.created_at).toLocaleDateString()}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
          run.run_status === 'completed' ? 'bg-success/10 text-success' :
          run.run_status === 'failed' ? 'bg-destructive/10 text-destructive' :
          'bg-warning/10 text-warning'
        }`}>{run.run_status}</span>
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {run.error_message && (
            <p className="text-xs text-destructive bg-destructive/5 rounded px-2 py-1">{run.error_message}</p>
          )}
          {run.run_status === 'failed' && (
            <RerunButton clientId={run.client_id} clientName={run.clients?.name || ''} reason="retry" />
          )}
          {steps.length > 0 && (
            <div className="space-y-1">
              {steps.map((s: any) => (
                <div key={s.id} className="flex items-center gap-2 text-xs">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    s.step_status === 'completed' ? 'bg-success' :
                    s.step_status === 'failed' ? 'bg-destructive' :
                    s.step_status === 'running' ? 'bg-primary animate-pulse' :
                    'bg-muted-foreground/30'
                  }`} />
                  <span className="text-muted-foreground w-28">{STEP_LABELS[s.step_name] || s.step_name}</span>
                  <span className="text-[10px] text-muted-foreground flex-1 truncate">{s.output_summary || s.error_message || '—'}</span>
                  {s.completed_at && <span className="text-[10px] text-muted-foreground">{new Date(s.completed_at).toLocaleTimeString()}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
