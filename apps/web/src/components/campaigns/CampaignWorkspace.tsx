import { useState } from 'react';
import { useCampaignTargets, useUpdateCampaign } from '@/hooks/useCampaigns';
import { FileText, Users, BarChart3, Zap, Trash2, Rocket, X, Plus } from 'lucide-react';
import CampaignBrief from './CampaignBrief';
import CampaignTargetList from './CampaignTargetList';
import CampaignProgress from './CampaignProgress';
import CampaignScoringPanel from './CampaignScoringPanel';
import { toast } from 'sonner';

const tabs = [
  { id: 'scoring', label: 'AI Scoring', icon: Zap },
  { id: 'brief', label: 'Brief', icon: FileText },
  { id: 'targets', label: 'Targets', icon: Users },
  { id: 'progress', label: 'Progress', icon: BarChart3 },
];

export default function CampaignWorkspace({ campaign, datasets, onDelete }: { campaign: any; datasets: any[]; onDelete?: () => void }) {
  const [tab, setTab] = useState('scoring');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showLaunchDialog, setShowLaunchDialog] = useState(false);
  const [goals, setGoals] = useState<string[]>(['']);
  const [launchNote, setLaunchNote] = useState('');
  const { data: targets = [], isLoading: loadingTargets, refetch } = useCampaignTargets(campaign.id);
  const updateCampaign = useUpdateCampaign();

  const handleStatusChange = async (status: string) => {
    try {
      await updateCampaign.mutateAsync({
        id: campaign.id,
        status,
        ...(status === 'active' ? { started_at: new Date().toISOString() } : {}),
        ...(status === 'completed' ? { completed_at: new Date().toISOString() } : {}),
      });
      toast.success(`Campaign ${status}`);
    } catch {
      toast.error('Failed to update');
    }
  };

  const statusActions: Record<string, { label: string; next: string; cls: string }> = {
    draft: { label: 'Launch Campaign', next: 'active', cls: 'bg-success text-success-foreground' },
    active: { label: 'Complete', next: 'completed', cls: 'bg-info text-info-foreground' },
    paused: { label: 'Resume', next: 'active', cls: 'bg-success text-success-foreground' },
  };

  const action = statusActions[campaign.status];

  const existingCount = targets.filter((t: any) => t.is_existing_client).length;
  const newCount = targets.filter((t: any) => !t.is_existing_client).length;

  return (
    <div className="flex-1 min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">{campaign.name}</h2>
            {campaign.visibility === 'personal' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">Personal</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {(campaign.focus || '').replace(/_/g, ' ')} · {targets.length} targets
            {existingCount > 0 && ` (${existingCount} existing`}
            {newCount > 0 && `${existingCount > 0 ? ', ' : ' ('}${newCount} new`}
            {(existingCount > 0 || newCount > 0) && ')'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onDelete && !confirmDelete && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Delete campaign"
            >
              <Trash2 size={14} />
            </button>
          )}
          {confirmDelete && (
            <>
              <span className="text-xs text-destructive">Delete?</span>
              <button
                onClick={() => { onDelete?.(); setConfirmDelete(false); }}
                className="px-2 py-1 rounded-md bg-destructive text-destructive-foreground text-xs font-medium"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-1 rounded-md bg-muted text-muted-foreground text-xs"
              >
                Cancel
              </button>
            </>
          )}
          {campaign.status === 'active' && (
            <button
              onClick={() => handleStatusChange('paused')}
              className="px-3 py-1.5 rounded-md bg-muted text-muted-foreground text-xs hover:bg-muted/80"
            >
              Pause
            </button>
          )}
          {action && (
            <button
              onClick={() => {
                if (action.next === 'active' && campaign.status === 'draft') {
                  setShowLaunchDialog(true);
                } else {
                  handleStatusChange(action.next);
                }
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium ${action.cls}`}
            >
              {action.label}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-border">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors whitespace-nowrap ${
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon size={14} /> {t.label}
            {t.id === 'targets' && targets.length > 0 && (
              <span className="text-[10px] text-muted-foreground ml-1">{targets.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'brief' && <CampaignBrief campaign={campaign} datasets={datasets} />}
      {tab === 'scoring' && (
        <CampaignScoringPanel
          campaign={campaign}
          targets={targets}
          onComplete={() => { refetch(); setTab('targets'); }}
        />
      )}
      {tab === 'targets' && <CampaignTargetList campaign={campaign} targets={targets} loading={loadingTargets} />}
      {tab === 'progress' && <CampaignProgress campaign={campaign} targets={targets} />}

      {/* Launch Campaign Dialog */}
      {showLaunchDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowLaunchDialog(false)} />
          <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Rocket size={16} className="text-success" />
                <h3 className="text-sm font-semibold">Launch Campaign</h3>
              </div>
              <button onClick={() => setShowLaunchDialog(false)} className="p-1 hover:bg-muted rounded"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <p className="text-xs text-muted-foreground">
                Set your goals for this campaign before launching. These will be tracked in campaign analytics.
              </p>

              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">Campaign Goals</label>
                <div className="space-y-2">
                  {goals.map((g, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={g}
                        onChange={e => { const next = [...goals]; next[i] = e.target.value; setGoals(next); }}
                        placeholder={`Goal ${i + 1} (e.g. Book 5 meetings, Open 3 opportunities...)`}
                        className="flex-1 px-3 py-2 text-sm bg-muted/30 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
                      />
                      {goals.length > 1 && (
                        <button onClick={() => setGoals(goals.filter((_, j) => j !== i))} className="p-1 text-muted-foreground hover:text-destructive">
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                  {goals.length < 5 && (
                    <button
                      onClick={() => setGoals([...goals, ''])}
                      className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                    >
                      <Plus size={10} /> Add goal
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">
                  Launch note <span className="text-muted-foreground/60">(optional)</span>
                </label>
                <textarea
                  value={launchNote}
                  onChange={e => setLaunchNote(e.target.value)}
                  placeholder="Any context for this launch..."
                  className="w-full h-16 px-3 py-2 text-sm bg-muted/30 border border-border rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
              <button
                onClick={() => setShowLaunchDialog(false)}
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const filteredGoals = goals.filter(g => g.trim());
                  try {
                    await updateCampaign.mutateAsync({
                      id: campaign.id,
                      status: 'active',
                      goals_json: filteredGoals.map(g => ({ text: g.trim(), completed: false })),
                      started_at: new Date().toISOString(),
                      launched_at: new Date().toISOString(),
                      ...(launchNote ? { description: (campaign.description || '') + '\n\n---\nLaunch note: ' + launchNote } : {}),
                    });
                    toast.success('Campaign launched!');
                    setShowLaunchDialog(false);
                    setGoals(['']);
                    setLaunchNote('');
                  } catch {
                    toast.error('Failed to launch campaign');
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-success text-success-foreground rounded-md text-xs font-medium hover:bg-success/90"
              >
                <Rocket size={12} /> Launch Campaign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
