import { Megaphone, Target, CheckCircle2, PauseCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const statusConfig: Record<string, { icon: any; cls: string }> = {
  draft: { icon: Megaphone, cls: 'text-muted-foreground' },
  active: { icon: Target, cls: 'text-success' },
  completed: { icon: CheckCircle2, cls: 'text-info' },
  paused: { icon: PauseCircle, cls: 'text-warning' },
};

export default function CampaignList({
  campaigns,
  selectedId,
  onSelect,
}: {
  campaigns: any[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="w-72 shrink-0 space-y-1 overflow-y-auto max-h-[calc(100vh-180px)]">
      {campaigns.map((c: any) => {
        const cfg = statusConfig[c.status] || statusConfig.draft;
        const Icon = cfg.icon;
        const isActive = c.id === selectedId;
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
              isActive ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted border border-transparent'
            }`}
          >
            <div className="flex items-center gap-2 mb-0.5">
              <Icon size={13} className={cfg.cls} />
              <span className="text-sm font-medium truncate flex-1">{c.name}</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="capitalize">{c.status}</span>
              <span>·</span>
              <span>{c.focus?.replace('_', ' ')}</span>
              <span className="ml-auto">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
