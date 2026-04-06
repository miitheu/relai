import AppLayout from '@/components/AppLayout';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCampaigns, useCreateCampaign, useCreateCampaignTarget, useCampaignTargets } from '@/hooks/useCampaigns';
import { useImportSuggestion } from '@/hooks/useAccountDiscovery';
import { supabase } from '@/integrations/supabase/client';
import { useDatasets } from '@/hooks/useCrmData';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import CreateCampaignDialog from '@/components/campaigns/CreateCampaignDialog';
import { Plus, Megaphone, Target, CheckCircle2, PauseCircle, Users, TrendingUp, ChevronRight, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

const statusConfig: Record<string, { icon: any; cls: string; label: string; bg: string }> = {
  draft: { icon: Megaphone, cls: 'text-muted-foreground', label: 'Draft', bg: 'bg-muted' },
  active: { icon: Target, cls: 'text-success', label: 'Active', bg: 'bg-success/10' },
  completed: { icon: CheckCircle2, cls: 'text-info', label: 'Completed', bg: 'bg-info/10' },
  paused: { icon: PauseCircle, cls: 'text-warning', label: 'Paused', bg: 'bg-warning/10' },
};

function CampaignRow({ campaign, onClick }: { campaign: any; onClick: () => void }) {
  const cfg = statusConfig[campaign.status] || statusConfig.draft;
  const Icon = cfg.icon;
  const { data: targets = [] } = useCampaignTargets(campaign.id);

  const avgScore = targets.length > 0
    ? Math.round(targets.reduce((sum: number, t: any) => sum + (t.fit_score || 0), 0) / targets.length)
    : 0;

  const contacted = targets.filter((t: any) => !['not_started', 'outreach_ready'].includes(t.status)).length;
  const won = targets.filter((t: any) => t.status === 'won').length;

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-5 py-4 rounded-lg border border-border hover:border-primary/30 hover:bg-muted/30 transition-all group"
    >
      <div className="flex items-center gap-4">
        {/* Status icon */}
        <div className={`w-9 h-9 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0`}>
          <Icon size={16} className={cfg.cls} />
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold truncate">{campaign.name}</span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.cls}`}>
              {cfg.label}
            </span>
            {campaign.visibility === 'personal' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">Personal</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
            {campaign.focus && <span className="capitalize">{campaign.focus.replace(/_/g, ' ')}</span>}
            {campaign.description && <><span>·</span><span className="truncate max-w-xs">{campaign.description}</span></>}
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-5 shrink-0">
          <div className="text-center min-w-[48px]">
            <div className="flex items-center justify-center gap-1">
              <Users size={11} className="text-muted-foreground" />
              <span className="text-sm font-bold font-mono">{targets.length}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Targets</p>
          </div>

          {targets.length > 0 && (
            <>
              <div className="text-center min-w-[48px]">
                <div className="flex items-center justify-center gap-1">
                  <TrendingUp size={11} className="text-primary" />
                  <span className="text-sm font-bold font-mono text-primary">{avgScore}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">Avg Score</p>
              </div>

              <div className="text-center min-w-[48px]">
                <span className="text-sm font-bold font-mono">{contacted}</span>
                <p className="text-[10px] text-muted-foreground">Contacted</p>
              </div>

              {won > 0 && (
                <div className="text-center min-w-[48px]">
                  <span className="text-sm font-bold font-mono text-success">{won}</span>
                  <p className="text-[10px] text-muted-foreground">Won</p>
                </div>
              )}
            </>
          )}

          <div className="text-[10px] text-muted-foreground min-w-[60px] text-right">
            {formatDistanceToNow(new Date(campaign.created_at), { addSuffix: true })}
          </div>

          <ChevronRight size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
      </div>
    </button>
  );
}

export default function Campaigns() {
  const { data: campaigns = [], isLoading } = useCampaigns();
  const { data: datasets = [] } = useDatasets();
  const createCampaign = useCreateCampaign();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);

  const createTarget = useCreateCampaignTarget();
  const importSuggestion = useImportSuggestion();

  const handleCreate = async (values: any) => {
    try {
      const { seed_discovery_name, ...campaignValues } = values;
      const c = await createCampaign.mutateAsync(campaignValues);
      setShowCreate(false);

      // If seeded from discovery, import suggestions as targets
      if (seed_discovery_name) {
        toast.success('Campaign created — importing discovery targets...');
        try {
          const { data: discoverySuggestions } = await supabase
            .from('discovery_suggestions')
            .select('*')
            .eq('discovery_name', seed_discovery_name)
            .eq('status', 'new')
            .order('composite_score', { ascending: false })
            .limit(values.max_targets || 25);

          let imported = 0;
          for (const s of (discoverySuggestions || [])) {
            let clientId = s.imported_client_id;
            if (!clientId) {
              const result = await importSuggestion.mutateAsync(s as any);
              clientId = result?.clientId || null;
            }
            if (clientId) {
              await createTarget.mutateAsync({ campaign_id: c.id, client_id: clientId, is_existing_client: !!s.imported_client_id });
              imported++;
            }
          }
          toast.success(`Imported ${imported} targets from "${seed_discovery_name}"`);
        } catch (e: any) {
          toast.error(`Campaign created but target import failed: ${e.message}`);
        }
      } else {
        toast.success('Campaign created');
      }

      navigate(`/campaigns/${c.id}`);
    } catch {
      toast.error('Failed to create campaign');
    }
  };

  if (isLoading) return <AppLayout><LoadingState /></AppLayout>;

  const personalCampaigns = campaigns.filter((c: any) => c.visibility !== 'team');
  const teamCampaigns = campaigns.filter((c: any) => c.visibility === 'team');
  const activeCampaigns = personalCampaigns.filter((c: any) => c.status === 'active');
  const draftCampaigns = personalCampaigns.filter((c: any) => c.status === 'draft');
  const otherCampaigns = personalCampaigns.filter((c: any) => !['active', 'draft'].includes(c.status));

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">My Campaigns</h1>
          <p className="text-sm text-muted-foreground">Your personal campaigns — only visible to you</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/campaigns/analytics')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-medium hover:bg-muted/80 hover:text-foreground transition-colors"
          >
            <BarChart3 size={14} /> Analytics
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus size={14} /> New Campaign
          </button>
        </div>
      </div>

      {personalCampaigns.length === 0 && teamCampaigns.length === 0 ? (
        <div className="max-w-2xl mx-auto py-8">
          <div className="text-center mb-8">
            <Megaphone size={36} className="mx-auto text-primary mb-3" />
            <h2 className="text-lg font-bold mb-2">Create Your First Campaign</h2>
            <p className="text-sm text-muted-foreground">Campaigns help you systematically target the right accounts with the right products.</p>
          </div>

          <div className="space-y-4 mb-8">
            {[
              { step: '1', title: 'Choose Objective', desc: 'Upsell, cross-sell, new logo, reactivation, renewal, or partnership', icon: Target },
              { step: '2', title: 'Select Products & Scope', desc: 'Pick target products, account types, geography, and set max targets', icon: Users },
              { step: '3', title: 'AI Scores & Prioritizes', desc: 'AI analyzes each account for product fit, timing signals, and conversion likelihood', icon: Megaphone },
              { step: '4', title: 'Review & Reach Out', desc: 'Get personalized messaging, draft emails, and track progress through the funnel', icon: ChevronRight },
            ].map(s => (
              <div key={s.step} className="flex items-start gap-4 data-card">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-primary">{s.step}</span>
                </div>
                <div>
                  <p className="text-sm font-medium">{s.title}</p>
                  <p className="text-xs text-muted-foreground">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center">
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 mx-auto"
            >
              <Plus size={14} /> Create Campaign
            </button>
            <p className="text-[10px] text-muted-foreground mt-3">
              Tip: Run Account Discovery first to build a target list, then import it into your campaign.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {activeCampaigns.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Active</p>
              <div className="space-y-2">
                {activeCampaigns.map((c: any) => (
                  <CampaignRow key={c.id} campaign={c} onClick={() => navigate(`/campaigns/${c.id}`)} />
                ))}
              </div>
            </div>
          )}

          {draftCampaigns.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Drafts</p>
              <div className="space-y-2">
                {draftCampaigns.map((c: any) => (
                  <CampaignRow key={c.id} campaign={c} onClick={() => navigate(`/campaigns/${c.id}`)} />
                ))}
              </div>
            </div>
          )}

          {otherCampaigns.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Completed & Paused</p>
              <div className="space-y-2">
                {otherCampaigns.map((c: any) => (
                  <CampaignRow key={c.id} campaign={c} onClick={() => navigate(`/campaigns/${c.id}`)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Team Campaigns (Legacy) */}
      {teamCampaigns.length > 0 && (
        <div className="mt-8 pt-6 border-t border-border">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Team Campaigns (Legacy)</p>
          <div className="space-y-2">
            {teamCampaigns.map((c: any) => (
              <CampaignRow key={c.id} campaign={c} onClick={() => navigate(`/campaigns/${c.id}`)} />
            ))}
          </div>
        </div>
      )}

      <CreateCampaignDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        datasets={datasets}
        onSubmit={handleCreate}
        isLoading={createCampaign.isPending}
      />
    </AppLayout>
  );
}
