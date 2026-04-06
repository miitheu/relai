import { useState } from 'react';
import { useEmails } from '@/hooks/useGmailIntegration';
import { useAuth } from '@/contexts/AuthContext';
import { useSupabase } from '@/hooks/useSupabase';
import { useQueryClient } from '@tanstack/react-query';
import {
  Mail, ArrowDownLeft, ArrowUpRight, Lock, Eye, EyeOff,
  Search, ChevronDown, ChevronRight, Loader2,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

type ViewMode = 'full' | 'summary' | 'date_only';

interface Props {
  clientId: string;
}

export default function ClientEmails({ clientId }: Props) {
  const supabase = useSupabase();
  const { data: emails = [], isLoading } = useEmails({ client_id: clientId });
  const { user } = useAuth();
  const qc = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    (localStorage.getItem('email_view_mode') as ViewMode) || 'full'
  );
  const [search, setSearch] = useState('');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'inbound' | 'outbound'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('email_view_mode', mode);
  };

  const handleVisibilityChange = async (emailId: string, visibility: string) => {
    try {
      await supabase.from('emails').update({ visibility }).eq('id', emailId);
      qc.invalidateQueries({ queryKey: ['emails'] });
    } catch { /* ignore */ }
  };

  const filtered = emails.filter((e: any) => {
    if (directionFilter !== 'all' && e.direction !== directionFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.subject?.toLowerCase().includes(q) ||
        e.from_address?.toLowerCase().includes(q) ||
        (e.to_addresses || []).some((a: string) => a.toLowerCase().includes(q)) ||
        e.summary?.toLowerCase().includes(q) ||
        e.body_text?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={18} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">{emails.length} Emails</h3>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            {(['all', 'inbound', 'outbound'] as const).map(d => (
              <button
                key={d}
                onClick={() => setDirectionFilter(d)}
                className={`px-2 py-0.5 text-[10px] font-medium rounded ${directionFilter === d ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                {d === 'all' ? 'All' : d === 'inbound' ? '← Inbound' : '→ Outbound'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search emails..."
              className="pl-7 pr-3 py-1 text-xs bg-muted/30 border border-border rounded-md w-48 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            {([['full', 'Full'], ['summary', 'Summary'], ['date_only', 'Date']] as [ViewMode, string][]).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => handleViewModeChange(mode)}
                className={`px-2 py-0.5 text-[10px] font-medium rounded ${viewMode === mode ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Email list */}
      {(() => {
        // Separate own emails from others' private emails
        const myEmails = filtered.filter((e: any) => e.created_by === user?.id || e.subject); // has subject = visible to me
        const othersPrivateEmails = filtered.filter((e: any) => e.created_by !== user?.id && !e.subject); // no subject = private from others

        // Group others' private emails by created_by for summary
        const otherUserSummaries = new Map<string, { count: number; lastDate: string; directions: { inbound: number; outbound: number } }>();
        for (const e of othersPrivateEmails) {
          const key = e.created_by || 'unknown';
          const existing = otherUserSummaries.get(key);
          if (existing) {
            existing.count++;
            if (e.email_date > existing.lastDate) existing.lastDate = e.email_date;
            if (e.direction === 'inbound') existing.directions.inbound++;
            else existing.directions.outbound++;
          } else {
            otherUserSummaries.set(key, {
              count: 1,
              lastDate: e.email_date || '',
              directions: { inbound: e.direction === 'inbound' ? 1 : 0, outbound: e.direction === 'outbound' ? 1 : 0 },
            });
          }
        }

        if (myEmails.length === 0 && otherUserSummaries.size === 0) {
          return (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {emails.length === 0 ? 'No emails synced yet. Connect Gmail in Integrations to sync.' : 'No emails match your filters.'}
            </div>
          );
        }

        return (
          <div className="space-y-1.5">
            {/* Other users' email summaries */}
            {otherUserSummaries.size > 0 && (
              <div className="data-card px-4 py-3 bg-muted/20">
                <div className="flex items-center gap-2 text-xs">
                  <Lock size={12} className="text-muted-foreground" />
                  <span className="text-muted-foreground">
                    Other team members have exchanged <span className="font-medium text-foreground">{othersPrivateEmails.length} emails</span> with this account
                    {othersPrivateEmails.length > 0 && (
                      <> · last {formatDistanceToNow(new Date(Math.max(...othersPrivateEmails.map((e: any) => new Date(e.email_date).getTime()))), { addSuffix: true })}</>
                    )}
                  </span>
                </div>
              </div>
            )}

            {/* My emails (full detail) */}
            {myEmails.map((e: any) => {
              const isExpanded = expandedId === e.id;
              const isOwner = e.created_by === user?.id;
              const isInbound = e.direction === 'inbound';
              const dateStr = e.email_date ? format(new Date(e.email_date), 'MMM d, yyyy h:mm a') : '';
              const relativeDate = e.email_date ? formatDistanceToNow(new Date(e.email_date), { addSuffix: true }) : '';

              return (
                <div key={e.id} className="data-card px-4 py-2.5 hover:border-primary/30 transition-colors">
                  {/* Header row */}
                  <div
                    className="flex items-center gap-2 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : e.id)}
                  >
                    {isExpanded ? <ChevronDown size={12} className="text-muted-foreground shrink-0" /> : <ChevronRight size={12} className="text-muted-foreground shrink-0" />}
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${isInbound ? 'bg-info/10' : 'bg-success/10'}`}>
                      {isInbound ? <ArrowDownLeft size={10} className="text-info" /> : <ArrowUpRight size={10} className="text-success" />}
                    </div>
                    <span className="text-sm font-medium truncate flex-1">{e.subject || '(no subject)'}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {e.sync_source === 'gmail' && (
                        <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">Gmail</span>
                      )}
                      {isOwner && e.visibility === 'private' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Only you</span>
                      )}
                      <span className="text-[10px] text-muted-foreground" title={dateStr}>{relativeDate}</span>
                    </div>
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center gap-2 ml-[28px] mt-0.5 text-[10px] text-muted-foreground">
                    {isInbound ? (
                      <span>From: {e.from_address || 'unknown'}</span>
                    ) : (
                      <span>To: {(e.to_addresses || []).join(', ') || 'unknown'}</span>
                    )}
                  </div>

                {/* Content (when expanded, respecting view mode) */}
                {isExpanded && viewMode !== 'date_only' && (
                  <div className="ml-[28px] mt-2 space-y-2">
                    {viewMode === 'full' && e.body_text && (
                      <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto bg-muted/20 rounded-lg px-3 py-2">
                        {e.body_text}
                      </div>
                    )}
                    {viewMode === 'summary' && (
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {e.ai_summary || e.summary || '(no summary)'}
                      </p>
                    )}
                    {viewMode === 'full' && !e.body_text && e.summary && (
                      <p className="text-xs text-muted-foreground">{e.summary}</p>
                    )}
                    {e.ai_next_action && (
                      <div className="bg-primary/5 rounded-lg px-3 py-2">
                        <p className="text-[10px] font-medium text-primary mb-0.5">Suggested action</p>
                        <p className="text-xs text-foreground">{e.ai_next_action}</p>
                      </div>
                    )}

                    {/* Visibility toggle (owner only) */}
                    {isOwner && (
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-[10px] text-muted-foreground">Visibility:</span>
                        {(['public', 'summary_only', 'private'] as const).map(v => (
                          <button
                            key={v}
                            onClick={() => handleVisibilityChange(e.id, v)}
                            className={`text-[10px] px-1.5 py-0.5 rounded ${e.visibility === v ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted'}`}
                          >
                            {v === 'public' ? 'Public' : v === 'summary_only' ? 'Summary only' : 'Private'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
