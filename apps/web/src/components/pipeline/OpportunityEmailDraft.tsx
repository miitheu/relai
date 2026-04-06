import { useState } from 'react';
import { useOpportunityEmailDraft, type EmailDraftTrigger } from '@/hooks/useOpportunityEmailDraft';
import { useEmailTemplates } from '@/hooks/useEmailTemplates';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useSupabase } from '@/hooks/useSupabase';
import {
  Mail, X, Loader2, Copy, Check, RefreshCw, ArrowLeft, Save, Sparkles, FileText,
} from 'lucide-react';

interface Props {
  opportunity: any;
  trigger: EmailDraftTrigger;
  onClose: () => void;
}

function getStageColor(stage: string): string {
  const colors: Record<string, string> = {
    'Lead': 'bg-muted text-muted-foreground',
    'Initial Discussion': 'bg-info/10 text-info',
    'Demo Scheduled': 'bg-primary/10 text-primary',
    'Trial': 'bg-warning/10 text-warning',
    'Evaluation': 'bg-warning/10 text-warning',
    'Commercial Discussion': 'bg-success/10 text-success',
    'Contract Sent': 'bg-success/10 text-success',
  };
  return colors[stage] || 'bg-muted text-muted-foreground';
}

export default function OpportunityEmailDraft({ opportunity, trigger, onClose }: Props) {
  const supabase = useSupabase();
  const { generate, emailDraft, variants, isLoading, error: generateError, reset, contacts } = useOpportunityEmailDraft(opportunity);
  const { data: allTemplates = [] } = useEmailTemplates();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'ai' | 'template'>('ai');
  const [userContext, setUserContext] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [referenceTemplateId, setReferenceTemplateId] = useState<string>('');
  const [editableSubject, setEditableSubject] = useState('');
  const [editableBody, setEditableBody] = useState('');
  const [selectedVariant, setSelectedVariant] = useState(0);
  const [copied, setCopied] = useState(false);
  const [logged, setLogged] = useState(false);
  const [phase, setPhase] = useState<'input' | 'draft'>('input');

  // Filter templates: exclude sample_email category (those are AI references, not user-facing)
  const templates = allTemplates.filter(t => t.is_active && t.category !== 'sample_email');

  const handleGenerate = async () => {
    const selectedContact = selectedContactId ? contacts.find((c: any) => c.id === selectedContactId) : undefined;
    // Combine user context with reference template if selected
    let fullContext = userContext || '';
    if (referenceTemplateId) {
      const refTemplate = allTemplates.find(t => t.id === referenceTemplateId);
      if (refTemplate) {
        const templateRef = `\n\nREFERENCE EMAIL TEMPLATE (adapt this style and structure, prioritize the content and talking points):\nSubject: ${refTemplate.subject}\nBody: ${refTemplate.body}`;
        fullContext = fullContext ? fullContext + templateRef : templateRef;
      }
    }
    await generate(trigger, fullContext || undefined, selectedContact);
    setPhase('draft');
  };

  const handleUseTemplate = () => {
    const tmpl = allTemplates.find(t => t.id === selectedTemplateId);
    if (!tmpl) return;
    // Substitute common variables
    const contact = selectedContactId ? contacts.find((c: any) => c.id === selectedContactId) : contacts[0];
    const vars: Record<string, string> = {
      name: contact?.name || '',
      company: opportunity.clients?.name || '',
      product: opportunity.datasets?.name || '',
      title: contact?.title || '',
      stage: opportunity.stage || '',
    };
    let subject = tmpl.subject;
    let body = tmpl.body;
    for (const [key, val] of Object.entries(vars)) {
      subject = subject.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'gi'), val);
      body = body.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'gi'), val);
    }
    setEditableSubject(subject);
    setEditableBody(body);
    setPhase('draft');
  };

  const getDraftContent = () => {
    if (mode === 'template') return { subject: editableSubject, body: editableBody };
    if (variants.length > 0) {
      const v = variants[selectedVariant] || variants[0];
      return { subject: v.subject, body: v.body };
    }
    return emailDraft ? { subject: emailDraft.subject, body: emailDraft.body } : null;
  };

  const handleCopy = () => {
    const draft = getDraftContent();
    if (!draft) return;
    navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogEmail = async () => {
    const draft = getDraftContent();
    if (!draft) return;
    if (logged) return; // Prevent duplicate logging
    try {
      await supabase.from('emails').insert({
        subject: draft.subject,
        summary: draft.body.slice(0, 500),
        body_text: draft.body,
        direction: 'outbound',
        sync_source: 'manual',
        client_id: opportunity.client_id,
        opportunity_id: opportunity.id,
        created_by: user?.id,
      });
      qc.invalidateQueries({ queryKey: ['emails'] });
      setLogged(true);
      toast({ title: 'Email logged', description: 'Draft saved to opportunity timeline' });
    } catch {
      toast({ title: 'Failed to log email', variant: 'destructive' });
    }
  };

  const handleBack = () => {
    reset();
    setPhase('input');
  };

  const triggerLabel = trigger === 'creation' ? 'Initial Outreach'
    : trigger === 'stage_change' ? `${opportunity.stage} Follow-up`
    : trigger === 'stale' ? 'Re-engagement'
    : `${opportunity.stage} Message`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Mail size={16} className="text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Draft Message</h3>
              <p className="text-[11px] text-muted-foreground">{opportunity.clients?.name || 'Unknown'} — {opportunity.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getStageColor(opportunity.stage)}`}>
              {triggerLabel}
            </span>
            <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X size={16} /></button>
          </div>
        </div>

        {/* Phase 1: Context input */}
        {phase === 'input' && !isLoading && (
          <div className="px-5 py-4 space-y-4">
            {/* Mode toggle */}
            <div className="flex gap-1 p-0.5 bg-muted/50 rounded-lg">
              <button
                onClick={() => setMode('ai')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === 'ai' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Sparkles size={12} /> Generate with AI
              </button>
              <button
                onClick={() => setMode('template')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === 'template' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <FileText size={12} /> Use Template
              </button>
            </div>

            {/* Auto-detected context */}
            <div>
              <p className="text-[11px] font-medium text-muted-foreground mb-2">Context (auto-detected)</p>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full">{opportunity.stage}</span>
                {opportunity.datasets?.name && (
                  <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full">{opportunity.datasets.name}</span>
                )}
                {opportunity.clients?.client_type && (
                  <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full">{opportunity.clients.client_type}</span>
                )}
              </div>
            </div>

            {/* Recipient selector */}
            {contacts.length > 0 && (
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">Recipient</label>
                <select
                  value={selectedContactId}
                  onChange={(e) => setSelectedContactId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-muted/30 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Auto-select (Decision Maker or first contact)</option>
                  {contacts.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.title ? ` — ${c.title}` : ''}{c.influence_level && c.influence_level !== 'Unknown' ? ` (${c.influence_level})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* AI mode: context input */}
            {mode === 'ai' && (
              <>
                {/* Reference template selector */}
                {templates.length > 0 && (
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">
                      Reference template <span className="text-muted-foreground/60">(optional — AI will adapt this style)</span>
                    </label>
                    <select
                      value={referenceTemplateId}
                      onChange={(e) => setReferenceTemplateId(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-muted/30 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="">No template — generate from scratch</option>
                      {templates.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name}{t.category ? ` (${t.category.replace('_', ' ')})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">
                    Additional context <span className="text-muted-foreground/60">(optional)</span>
                  </label>
                  <textarea
                    value={userContext}
                    onChange={(e) => setUserContext(e.target.value)}
                    placeholder="e.g. They expressed interest in procurement data on our last call, mention the new trade flows dataset..."
                    className="w-full h-20 px-3 py-2 text-sm bg-muted/30 border border-border rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
                  />
                </div>
                <button
                  onClick={handleGenerate}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
                >
                  <Sparkles size={14} /> Generate Draft
                </button>
              </>
            )}

            {/* Template mode: template selector */}
            {mode === 'template' && (
              <>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">Select Template</label>
                  {templates.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">No templates available. Create templates in Admin → Email Templates.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {templates.map(t => (
                        <label
                          key={t.id}
                          className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${selectedTemplateId === t.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
                        >
                          <input
                            type="radio"
                            name="template"
                            value={t.id}
                            checked={selectedTemplateId === t.id}
                            onChange={() => setSelectedTemplateId(t.id)}
                            className="mt-0.5 sr-only"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">{t.name}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{t.subject}</p>
                          </div>
                          {t.category && (
                            <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded-full shrink-0">{t.category.replace('_', ' ')}</span>
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={handleUseTemplate}
                  disabled={!selectedTemplateId}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FileText size={14} /> Use Template
                </button>
              </>
            )}
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="px-5 py-12 text-center">
            <Loader2 size={24} className="animate-spin text-primary mx-auto mb-3" />
            <p className="text-sm font-medium">Generating {triggerLabel.toLowerCase()}...</p>
            <p className="text-xs text-muted-foreground mt-1">Using account intelligence and opportunity context</p>
          </div>
        )}

        {/* Error state */}
        {phase === 'draft' && generateError && !isLoading && (
          <div className="px-5 py-8 text-center">
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-3">
              <X size={20} className="text-destructive" />
            </div>
            <p className="text-sm font-medium mb-1">Failed to generate draft</p>
            <p className="text-xs text-muted-foreground mb-4">{generateError}</p>
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 mx-auto px-3 py-1.5 text-xs border border-border rounded-md hover:bg-muted"
            >
              <ArrowLeft size={12} /> Try Again
            </button>
          </div>
        )}

        {/* Phase 2: Draft review */}
        {phase === 'draft' && (emailDraft || editableBody) && !isLoading && (
          <div className="px-5 py-4 space-y-4">
            {/* Variant toggle */}
            {mode === 'ai' && variants.length > 1 && (
              <div className="flex gap-1 p-0.5 bg-muted/50 rounded-lg">
                {variants.map((v, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedVariant(i)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${selectedVariant === i ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <span className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">{String.fromCharCode(65 + i)}</span>
                    {v.tone}
                  </button>
                ))}
              </div>
            )}

            {(() => {
              const draft = getDraftContent();
              if (!draft) return null;
              return (
                <>
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Subject Line</p>
                    {mode === 'template' ? (
                      <input
                        value={editableSubject}
                        onChange={(e) => setEditableSubject(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-muted/30 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    ) : (
                      <div className="bg-muted/30 rounded-lg px-3 py-2 text-sm">{draft.subject}</div>
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Email Body</p>
                    {mode === 'template' ? (
                      <textarea
                        value={editableBody}
                        onChange={(e) => setEditableBody(e.target.value)}
                        rows={10}
                        className="w-full px-3 py-3 text-sm bg-muted/20 border border-border rounded-lg leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                      />
                    ) : (
                      <div className="bg-muted/20 rounded-lg px-3 py-3 text-sm leading-relaxed whitespace-pre-wrap">
                        {draft.body}
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Footer */}
        {phase === 'draft' && (emailDraft || editableBody) && !isLoading && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border">
            <button onClick={handleBack} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft size={12} /> Edit Context
            </button>
            <div className="flex items-center gap-2">
              {mode === 'ai' && (
                <button
                  onClick={() => generate(trigger, userContext || undefined)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-md hover:bg-muted"
                >
                  <RefreshCw size={11} /> Regenerate
                </button>
              )}
              <button
                onClick={handleLogEmail}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-md hover:bg-muted"
              >
                {logged ? <><Check size={11} className="text-success" /> Logged</> : <><Save size={11} /> Log as Email</>}
              </button>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                {copied ? <><Check size={11} /> Copied!</> : <><Copy size={11} /> Copy</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
