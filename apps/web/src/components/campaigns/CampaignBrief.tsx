import { useState } from 'react';
import { Target, Package, MapPin, Users, Globe, BarChart3, MessageSquare, Loader2, Plus, X } from 'lucide-react';
import { useUpdateCampaign } from '@/hooks/useCampaigns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const objectiveDescriptions: Record<string, string> = {
  upsell: 'Expand product usage with existing paying clients',
  cross_sell: 'Introduce complementary products to current accounts',
  new_logo: 'Win net-new accounts never served before',
  reactivation: 'Re-engage dormant or lapsed accounts',
  renewal_expansion: 'Increase value at upcoming renewals',
  partnership: 'Identify data distribution or technology partners',
};

export default function CampaignBrief({ campaign, datasets }: { campaign: any; datasets: any[] }) {
  const productNames = (campaign.target_product_ids || [])
    .map((id: string) => datasets.find((d: any) => d.id === id))
    .filter(Boolean);

  const geos = campaign.target_geographies || [];
  const updateCampaign = useUpdateCampaign();
  const [generating, setGenerating] = useState(false);

  const messaging = campaign.messaging_guidance || {};
  const hasTalkTracks = messaging.talk_tracks?.length > 0;
  const hasObjections = messaging.objection_handling?.length > 0;

  const generateMessaging = async () => {
    setGenerating(true);
    try {
      const productContext = productNames.map((d: any) => `${d.name}: ${d.description || 'N/A'}`).join('; ');

      const { data, error } = await supabase.functions.invoke('campaign-email-draft', {
        body: {
          campaign_name: campaign.name,
          campaign_focus: campaign.focus,
          campaign_description: campaign.description,
          client_name: '__MESSAGING_FRAMEWORK__',
          client_type: 'framework',
          message_angle: `Generate a campaign-level messaging framework for: ${campaign.name}`,
          evidence_of_fit: `Products: ${productContext}`,
          product_relevance: `Objective: ${objectiveDescriptions[campaign.focus] || campaign.focus}`,
          why_now: `Target types: ${(campaign.target_account_types || []).join(', ') || 'All'}`,
          best_persona: 'Various personas',
          recommended_approach: 'Generate talk tracks and objection handling',
          coverage_overlap: 0,
          sector_relevance: [],
          supporting_companies: [],
          evidence_summary: `Geos: ${geos.join(', ') || 'Global'}`,
          generate_messaging_framework: true,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Parse AI response into structured messaging guidance
      const body = data?.body || '';
      const subject = data?.subject || '';

      // Extract structured sections from the AI response
      const guidanceObj = parseMessagingResponse(body, subject, campaign);

      await updateCampaign.mutateAsync({ id: campaign.id, messaging_guidance: guidanceObj });
      toast.success('Messaging framework generated');
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate messaging');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Objective card */}
      <div className="data-card border-l-2 border-l-primary">
        <div className="flex items-center gap-2 mb-1.5">
          <Target size={14} className="text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Campaign Objective</span>
        </div>
        <p className="text-sm font-semibold capitalize">{(campaign.focus || '').replace(/_/g, ' ')}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {objectiveDescriptions[campaign.focus] || campaign.focus}
        </p>
      </div>

      {/* Description */}
      {campaign.description && (
        <div className="data-card">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Strategy Brief</p>
          <p className="text-sm leading-relaxed">{campaign.description}</p>
        </div>
      )}

      {/* Scope grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="data-card">
          <div className="flex items-center gap-2 mb-2">
            <Package size={14} className="text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Target Products</span>
          </div>
          {productNames.length > 0 ? (
            <div className="space-y-1.5">
              {productNames.map((d: any) => (
                <div key={d.id}>
                  <p className="text-xs font-medium">{d.name}</p>
                  {d.description && (
                    <p className="text-[10px] text-muted-foreground line-clamp-2">{d.description}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">All products</p>
          )}
        </div>

        <div className="data-card">
          <div className="flex items-center gap-2 mb-2">
            <Users size={14} className="text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Account Scope</span>
          </div>
          <div className="space-y-1.5">
            {(campaign.target_account_types || []).length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {campaign.target_account_types.map((t: string) => (
                  <span key={t} className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground text-[11px]">{t}</span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">All account types</p>
            )}
            <div className="flex gap-2 text-[11px]">
              {campaign.include_existing_clients && (
                <span className="px-1.5 py-0.5 rounded bg-success/10 text-success">Existing</span>
              )}
              {campaign.include_prospects && (
                <span className="px-1.5 py-0.5 rounded bg-info/10 text-info">Prospects</span>
              )}
            </div>
          </div>
        </div>

        <div className="data-card">
          <div className="flex items-center gap-2 mb-2">
            <Globe size={14} className="text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Geography</span>
          </div>
          {geos.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {geos.map((g: string) => (
                <span key={g} className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground text-[11px]">{g}</span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Global — no geographic filter</p>
          )}
        </div>

        <div className="data-card">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 size={14} className="text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Parameters</span>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Max Targets</span>
              <span className="font-mono font-medium">{campaign.max_targets || 25}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium capitalize ${
                campaign.status === 'active' ? 'bg-success/10 text-success' :
                campaign.status === 'completed' ? 'bg-info/10 text-info' :
                campaign.status === 'paused' ? 'bg-warning/10 text-warning' :
                'bg-muted text-muted-foreground'
              }`}>
                {campaign.status}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Messaging Framework — hidden for now */}
    </div>
  );
}

/** Parse the AI email draft response into a structured messaging framework */
function parseMessagingResponse(body: string, subject: string, campaign: any): any {
  // Try to extract structured sections from the AI response
  const lines = body.split('\n').filter((l: string) => l.trim());

  const talkTracks: any[] = [];
  const objections: any[] = [];
  let tone = '';
  let valueProp = subject || '';

  // Attempt to parse sections
  let currentSection = '';
  let currentItem: any = null;

  for (const line of lines) {
    const lower = line.toLowerCase().trim();

    if (lower.includes('talk track') || lower.includes('opening') || lower.includes('value bridge') || lower.includes('evidence') || lower.includes('call to action') || lower.includes('closing')) {
      if (currentItem && currentSection === 'talk_tracks') talkTracks.push(currentItem);
      const title = line.replace(/^[\d\.\-\*\#]+\s*/, '').replace(/[:]/g, '').trim();
      currentItem = { title, content: '' };
      currentSection = 'talk_tracks';
      continue;
    }

    if (lower.includes('objection') && lower.includes(':')) {
      const objText = line.replace(/^[\d\.\-\*\#]+\s*/, '').replace('Objection:', '').replace('objection:', '').trim();
      currentItem = { objection: objText, response: '' };
      currentSection = 'objections';
      continue;
    }

    if (lower.includes('response:') || lower.includes('→')) {
      if (currentItem && currentSection === 'objections') {
        currentItem.response = line.replace(/^[\→\-\*]+\s*/, '').replace('Response:', '').replace('response:', '').trim();
        objections.push(currentItem);
        currentItem = null;
      }
      continue;
    }

    if (lower.includes('tone') && lower.includes(':')) {
      tone = line.replace(/.*tone[:\s]*/i, '').trim();
      continue;
    }

    // Append content to current item
    if (currentItem && currentSection === 'talk_tracks') {
      currentItem.content += (currentItem.content ? ' ' : '') + line.trim();
    }
  }

  if (currentItem && currentSection === 'talk_tracks') talkTracks.push(currentItem);

  // If AI parsing didn't produce structured results, build from the full response
  if (talkTracks.length === 0) {
    // Split the body into paragraphs and use them as talk tracks
    const paragraphs = body.split('\n\n').filter((p: string) => p.trim().length > 20);
    if (paragraphs.length >= 2) {
      talkTracks.push({ title: 'Opening Hook', content: paragraphs[0]?.trim() || '' });
      talkTracks.push({ title: 'Value Proposition', content: paragraphs[1]?.trim() || '' });
      if (paragraphs[2]) talkTracks.push({ title: 'Evidence & Proof Points', content: paragraphs[2].trim() });
      if (paragraphs[3]) talkTracks.push({ title: 'Call to Action', content: paragraphs[3].trim() });
    } else {
      // Fallback: use the whole body as a single talk track
      talkTracks.push({ title: 'Core Message', content: body.trim() });
    }
  }

  if (objections.length === 0) {
    // Generate contextual objection handling based on campaign focus
    const focusObjections: Record<string, any[]> = {
      upsell: [
        { objection: 'We\'re happy with our current data coverage', response: 'Review their specific portfolio gaps where our additional datasets provide incremental alpha signals they\'re currently missing.' },
        { objection: 'Budget is allocated for the year', response: 'Position as a pilot with measurable ROI — show how the expanded coverage addresses specific blind spots in their current analysis.' },
      ],
      cross_sell: [
        { objection: 'We already have a provider for that category', response: 'Offer a side-by-side comparison trial focused on the specific companies and sectors where our coverage differs.' },
        { objection: 'Our team doesn\'t have bandwidth for another data source', response: 'Highlight integration simplicity and show how it complements rather than replaces their existing workflow.' },
      ],
      new_logo: [
        { objection: 'We haven\'t heard of your company', response: 'Lead with a specific case study from a comparable firm, showing concrete alpha generation or risk reduction from our data.' },
        { objection: 'We need to evaluate multiple vendors', response: 'Offer a targeted trial covering their top 20 portfolio positions to demonstrate value quickly.' },
      ],
      reactivation: [
        { objection: 'We tried your data before and it wasn\'t useful', response: 'Acknowledge their experience and highlight specific improvements since their last evaluation — new datasets, better coverage, updated methodology.' },
        { objection: 'Our strategy has changed since we last spoke', response: 'Use their updated strategy as an opportunity to show how our current product suite aligns with their new focus areas.' },
      ],
    };
    const defaultObj = [
      { objection: 'We need more time to evaluate', response: 'Propose a time-boxed pilot with clear success criteria and a decision framework.' },
      { objection: 'The pricing doesn\'t fit our budget', response: 'Explore flexible packaging — start with a focused subset that demonstrates value before expanding.' },
    ];
    objections.push(...(focusObjections[campaign.focus] || defaultObj));
  }

  if (!tone) {
    tone = 'Professional, evidence-based, consultative. Reference specific portfolio companies, sectors, or themes from scoring analysis. Never generic.';
  }

  if (!valueProp) {
    valueProp = `${campaign.name} — ${campaign.description || (campaign.focus || '').replace(/_/g, ' ')}`;
  }

  return {
    value_proposition: valueProp,
    talk_tracks: talkTracks,
    objection_handling: objections,
    tone,
    generated_at: new Date().toISOString(),
  };
}
