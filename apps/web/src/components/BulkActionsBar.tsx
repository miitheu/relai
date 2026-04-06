import { X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface BulkAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  variant?: 'default' | 'destructive';
}

interface BulkActionsBarProps {
  selectedCount: number;
  actions: BulkAction[];
  onClear: () => void;
}

export default function BulkActionsBar({ selectedCount, actions, onClear }: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="sticky top-0 z-20 flex items-center gap-3 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg mb-3 shadow-md animate-in slide-in-from-top-2">
      <span className="text-sm font-medium">{selectedCount} selected</span>
      <div className="w-px h-5 bg-primary-foreground/30" />
      <div className="flex items-center gap-1">
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              action.variant === 'destructive'
                ? 'bg-destructive/20 hover:bg-destructive/30 text-destructive-foreground'
                : 'bg-primary-foreground/10 hover:bg-primary-foreground/20'
            }`}
          >
            <action.icon size={13} />
            {action.label}
          </button>
        ))}
      </div>
      <div className="flex-1" />
      <button onClick={onClear} className="p-1 hover:bg-primary-foreground/10 rounded transition-colors">
        <X size={14} />
      </button>
    </div>
  );
}
