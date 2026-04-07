import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Bug, X, Loader2, Send, Check } from 'lucide-react';
import { useDb } from '@relai/db/react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface Props {
  collapsed: boolean;
}

export default function ReportBugDialog({ collapsed }: Props) {
  const db = useDb();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { profile } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const body = [
        description,
        '',
        '---',
        `**Reported by:** ${profile?.full_name || profile?.email || 'Unknown'}`,
        `**Page:** ${window.location.pathname}`,
        `**Time:** ${new Date().toISOString()}`,
        `**User Agent:** ${navigator.userAgent}`,
      ].join('\n');

      const { data, error } = await db.invoke('report-bug', { title: title.trim(), body });
      if (error) throw error;

      setSubmitted(true);
      toast({ title: 'Bug reported', description: 'Thank you! The team will look into it.' });
      setTimeout(() => {
        setOpen(false);
        setTitle('');
        setDescription('');
        setSubmitted(false);
      }, 1500);
    } catch (err: any) {
      toast({ title: 'Failed to submit', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`nav-item w-full text-muted-foreground hover:text-warning ${collapsed ? 'justify-center px-0' : ''}`}
        title="Report Bug"
      >
        <Bug size={16} />
        {!collapsed && <span>Report Bug</span>}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Bug size={16} className="text-warning" />
                <h3 className="text-sm font-semibold">Report a Bug</h3>
              </div>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-muted rounded">
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Title *</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Brief description of the issue"
                  className="w-full px-3 py-2 text-sm bg-muted/30 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Details</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Steps to reproduce, expected vs actual behavior..."
                  className="w-full h-28 px-3 py-2 text-sm bg-muted/30 border border-border rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Current page ({window.location.pathname}) and your name will be included automatically.
              </p>
            </div>

            <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
              <button
                onClick={() => setOpen(false)}
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!title.trim() || submitting || submitted}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                {submitted ? <><Check size={12} /> Submitted</> : submitting ? <><Loader2 size={12} className="animate-spin" /> Submitting...</> : <><Send size={12} /> Submit</>}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
