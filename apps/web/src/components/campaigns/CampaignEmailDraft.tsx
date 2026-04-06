import { useState } from 'react';
import { Mail, Loader2, Copy, Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  target: any;
  campaign: any;
  onClose: () => void;
}

export default function CampaignEmailDraft({ target, campaign, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [emailDraft, setEmailDraft] = useState<{ subject: string; body: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const clientName = target.clients?.name || target.prospect_name || 'the account';
  const rationale = target.fit_rationale || {};
  const productFit = target.product_fit_analysis || {};

  const generate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('campaign-email-draft', {
        body: {
          campaign_name: campaign.name,
          campaign_focus: campaign.focus,
          campaign_description: campaign.description,
          client_name: clientName,
          client_type: target.clients?.client_type || target.prospect_type,
          fit_score: target.fit_score,
          message_angle: target.recommended_messaging,
          evidence_of_fit: rationale.evidence_of_fit,
          product_relevance: rationale.product_relevance_rationale,
          why_now: rationale.why_now,
          best_persona: rationale.best_persona,
          recommended_approach: target.recommended_approach,
          coverage_overlap: productFit.coverage_overlap_score,
          sector_relevance: productFit.sector_relevance,
          supporting_companies: productFit.supporting_companies,
          evidence_summary: productFit.evidence_summary,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setEmailDraft(data);
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate email');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!emailDraft) return;
    navigator.clipboard.writeText(`Subject: ${emailDraft.subject}\n\n${emailDraft.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Email copied to clipboard');
  };

  // Auto-generate on mount
  if (!loading && !emailDraft) {
    generate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Mail size={16} className="text-primary" />
            <h3 className="text-sm font-semibold">Email Draft — {clientName}</h3>
          </div>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-primary mb-3" />
              <p className="text-sm text-muted-foreground">Generating personalized email...</p>
              <p className="text-[10px] text-muted-foreground mt-1">Using intelligence, product fit, and campaign context</p>
            </div>
          ) : emailDraft ? (
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Subject Line</p>
                <p className="text-sm font-medium bg-muted/50 rounded-md px-3 py-2">{emailDraft.subject}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Email Body</p>
                <div className="bg-muted/30 rounded-md px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
                  {emailDraft.body}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        {emailDraft && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border">
            <button
              onClick={generate}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <Loader2 size={11} className={loading ? 'animate-spin' : 'hidden'} />
              Regenerate
            </button>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
            >
              {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy Email</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
