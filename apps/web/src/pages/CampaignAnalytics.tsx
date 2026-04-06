import AppLayout from '@/components/AppLayout';
import { useCampaigns, useCampaignTargets } from '@/hooks/useCampaigns';
import LoadingState from '@/components/LoadingState';
import { useMemo } from 'react';
import { BarChart3, Target, TrendingUp, Users, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function CampaignMetrics({ campaignId }: { campaignId: string }) {
  const { data: targets = [] } = useCampaignTargets(campaignId);
  const contacted = targets.filter((t: any) => !['not_started', 'outreach_ready'].includes(t.status)).length;
  const won = targets.filter((t: any) => t.status === 'won').length;
  const lost = targets.filter((t: any) => t.status === 'lost').length;
  const avgScore = targets.length > 0
    ? Math.round(targets.reduce((s: number, t: any) => s + (t.fit_score || 0), 0) / targets.length)
    : 0;
  return { targets: targets.length, contacted, won, lost, avgScore };
}

export default function CampaignAnalytics() {
  const { data: campaigns = [], isLoading } = useCampaigns();
  const navigate = useNavigate();

  if (isLoading) return <AppLayout><LoadingState /></AppLayout>;

  const active = campaigns.filter((c: any) => c.status === 'active');
  const completed = campaigns.filter((c: any) => c.status === 'completed');
  const totalCampaigns = campaigns.length;

  return (
    <AppLayout>
      <button
        onClick={() => navigate('/campaigns')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft size={14} /> Back to Campaigns
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Campaign Analytics</h1>
          <p className="text-sm text-muted-foreground">Cross-campaign performance and benchmarks</p>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="data-card text-center">
          <BarChart3 size={16} className="mx-auto text-primary mb-1" />
          <p className="text-2xl font-bold font-mono">{totalCampaigns}</p>
          <p className="text-[10px] text-muted-foreground">Total Campaigns</p>
        </div>
        <div className="data-card text-center">
          <Target size={16} className="mx-auto text-success mb-1" />
          <p className="text-2xl font-bold font-mono text-success">{active.length}</p>
          <p className="text-[10px] text-muted-foreground">Active</p>
        </div>
        <div className="data-card text-center">
          <CheckCircle2 size={16} className="mx-auto text-info mb-1" />
          <p className="text-2xl font-bold font-mono text-info">{completed.length}</p>
          <p className="text-[10px] text-muted-foreground">Completed</p>
        </div>
        <div className="data-card text-center">
          <Users size={16} className="mx-auto text-warning mb-1" />
          <p className="text-2xl font-bold font-mono text-warning">{campaigns.filter((c: any) => c.status === 'draft').length}</p>
          <p className="text-[10px] text-muted-foreground">Drafts</p>
        </div>
      </div>

      {/* Campaign comparison table */}
      <div className="data-card">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Campaign Comparison</p>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Campaign</th>
                <th className="text-center px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="text-center px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Focus</th>
                <th className="text-center px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Targets</th>
                <th className="text-center px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Contacted</th>
                <th className="text-center px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Won</th>
                <th className="text-center px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Win Rate</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c: any) => (
                <CampaignRow key={c.id} campaign={c} onNavigate={() => navigate(`/campaigns/${c.id}`)} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}

function CampaignRow({ campaign, onNavigate }: { campaign: any; onNavigate: () => void }) {
  const { data: targets = [] } = useCampaignTargets(campaign.id);
  const contacted = targets.filter((t: any) => !['not_started', 'outreach_ready'].includes(t.status)).length;
  const won = targets.filter((t: any) => t.status === 'won').length;
  const lost = targets.filter((t: any) => t.status === 'lost').length;
  const winRate = (won + lost) > 0 ? Math.round((won / (won + lost)) * 100) : 0;

  const statusCls: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground',
    active: 'bg-success/10 text-success',
    completed: 'bg-info/10 text-info',
    paused: 'bg-warning/10 text-warning',
  };

  return (
    <tr className="border-b border-border hover:bg-muted/30 transition-colors cursor-pointer" onClick={onNavigate}>
      <td className="px-3 py-2.5">
        <p className="font-medium truncate max-w-[200px]">{campaign.name}</p>
      </td>
      <td className="text-center px-2 py-2.5">
        <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${statusCls[campaign.status] || ''}`}>
          {campaign.status}
        </span>
      </td>
      <td className="text-center px-2 py-2.5 text-muted-foreground capitalize">
        {(campaign.focus || '').replace(/_/g, ' ')}
      </td>
      <td className="text-center px-2 py-2.5 font-mono">{targets.length}</td>
      <td className="text-center px-2 py-2.5 font-mono">{contacted}</td>
      <td className="text-center px-2 py-2.5 font-mono text-success">{won}</td>
      <td className="text-center px-2 py-2.5">
        {(won + lost) > 0 ? (
          <span className={`font-mono ${winRate >= 50 ? 'text-success' : winRate >= 25 ? 'text-warning' : 'text-destructive'}`}>
            {winRate}%
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-2 py-2.5">
        <TrendingUp size={11} className="text-muted-foreground" />
      </td>
    </tr>
  );
}
