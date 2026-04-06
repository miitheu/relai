import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Lightbulb, RefreshCw, Copy, Check } from 'lucide-react';

interface Props {
  clientId: string;
  clientName: string;
  opportunities: any[];
  deliveries: any[];
  renewals: any[];
  signals: any[];
  contacts: any[];
}

export default function SuggestedNextAction({ clientId, clientName, opportunities, deliveries, renewals, signals, contacts }: Props) {
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!suggestion) return;
    navigator.clipboard.writeText(suggestion);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const generate = async () => {
    setLoading(true);
    try {
      const context = {
        account: clientName,
        active_opps: opportunities.filter(o => !['Closed Won', 'Closed Lost'].includes(o.stage)).map(o => ({
          name: o.name, stage: o.stage, value: o.value, expected_close: o.expected_close,
          last_activity: o.last_activity_at || o.updated_at,
        })),
        trials: deliveries.filter(d => d.delivery_type?.toLowerCase() === 'trial').map(d => ({
          dataset: d.datasets?.name, end_date: d.trial_end_date, status: d.status,
        })),
        renewals: renewals.filter(r => ['Upcoming', 'Negotiation'].includes(r.status)).map(r => ({
          dataset: r.datasets?.name, date: r.renewal_date, value: r.value,
        })),
        signals: signals.slice(0, 5).map(s => ({ topic: s.topic, strength: s.strength })),
        contact_count: contacts.length,
        key_contacts: contacts.slice(0, 3).map(c => ({ name: c.name, title: c.title, influence: c.influence_level })),
      };

      const { data, error } = await supabase.functions.invoke('campaign-email-draft', {
        body: {
          mode: 'suggested_action',
          context,
        },
      });
      if (error) throw error;
      setSuggestion(data?.suggestion || data?.draft || 'No suggestion generated.');
    } catch {
      setSuggestion('Failed to generate suggestion.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="data-card">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Lightbulb size={14} className="text-warning" />
          <h3 className="text-sm font-medium">Suggested Next Action</h3>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-warning/10 text-warning text-xs hover:bg-warning/20 disabled:opacity-50"
        >
          {loading ? <RefreshCw size={12} className="animate-spin" /> : <Lightbulb size={12} />}
          {suggestion ? 'Refresh' : 'Get Suggestion'}
        </button>
      </div>
      {suggestion ? (
        <div className="relative group">
          <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{suggestion}</div>
          <button
            onClick={handleCopy}
            className="absolute top-0 right-0 p-1 rounded text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            title="Copy suggestion"
          >
            {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">AI will analyze this account's pipeline, trials, renewals, and signals to suggest your best next move.</p>
      )}
    </div>
  );
}
