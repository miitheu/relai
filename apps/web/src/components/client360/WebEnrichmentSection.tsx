import { useState } from 'react';
import { useEnrichmentResults, useWebEnrich } from '@/hooks/useWebEnrich';
import { Globe, RefreshCw, ChevronDown, ChevronUp, Newspaper, Users, Building2, ExternalLink, Sparkles } from 'lucide-react';

interface WebEnrichmentSectionProps {
  clientId: string;
}

export default function WebEnrichmentSection({ clientId }: WebEnrichmentSectionProps) {
  const { data: enrichments = [], isLoading: loadingResults } = useEnrichmentResults(clientId, 'web_enrichment');
  const { enrich, isLoading: enriching } = useWebEnrich();
  const [expanded, setExpanded] = useState(true);

  // Group enrichments by type (latest first)
  const byType: Record<string, any> = {};
  for (const e of enrichments) {
    if (!byType[e.enrichment_type]) byType[e.enrichment_type] = e;
  }

  const profile = byType['company_profile']?.data_json;
  const news = byType['recent_news']?.data_json?.events || [];
  const contacts = byType['key_contacts']?.data_json?.contacts || [];
  const techFunding = byType['technology_funding']?.data_json;
  const competitive = byType['competitive_landscape']?.data_json;
  const confidence = byType['company_profile']?.confidence;
  const lastEnriched = enrichments[0]?.created_at;

  const hasData = enrichments.length > 0;

  return (
    <div className="data-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe size={14} className="text-primary" />
          <h3 className="text-sm font-medium">Web Enrichment</h3>
          {confidence != null && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${confidence >= 0.7 ? 'bg-success/20 text-success' : confidence >= 0.4 ? 'bg-warning/20 text-warning' : 'bg-destructive/20 text-destructive'}`}>
              {Math.round(confidence * 100)}% confidence
            </span>
          )}
          {lastEnriched && (
            <span className="text-[10px] text-muted-foreground">
              · {new Date(lastEnriched).toLocaleDateString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {hasData && (
            <button onClick={() => setExpanded(!expanded)} className="p-1 rounded hover:bg-muted">
              {expanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
            </button>
          )}
          <button
            onClick={() => enrich(clientId)}
            disabled={enriching}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-xs hover:bg-primary/20 disabled:opacity-50"
          >
            {enriching ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {hasData ? 'Re-enrich' : 'Enrich from Web'}
          </button>
        </div>
      </div>

      {!hasData && !enriching && (
        <p className="text-xs text-muted-foreground mt-2">Click "Enrich from Web" to pull real company data from the internet.</p>
      )}

      {hasData && expanded && (
        <div className="mt-3 space-y-4">
          {/* Company Profile */}
          {profile && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Building2 size={12} className="text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Company Profile</span>
              </div>
              <div className="text-sm leading-relaxed">
                {profile.description && <p className="mb-1">{profile.description}</p>}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                  {profile.headquarters && <span>📍 {profile.headquarters}</span>}
                  {profile.founded_year && <span>📅 Founded {profile.founded_year}</span>}
                  {profile.employee_count && <span>👥 ~{profile.employee_count} employees</span>}
                  {profile.website && (
                    <a href={`https://${profile.website}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-0.5">
                      🌐 {profile.website} <ExternalLink size={9} />
                    </a>
                  )}
                  {profile.aum_estimate && <span>💰 AUM: {profile.aum_estimate}</span>}
                </div>
              </div>
            </div>
          )}

          {/* Recent News */}
          {news.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Newspaper size={12} className="text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recent News</span>
              </div>
              <div className="space-y-1.5">
                {news.slice(0, 5).map((n: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-muted-foreground whitespace-nowrap min-w-[60px]">{n.date || '—'}</span>
                    <div>
                      <span className="text-foreground">{n.headline}</span>
                      {n.significance && <span className="text-muted-foreground ml-1">— {n.significance}</span>}
                      {n.source_url && (
                        <a href={n.source_url} target="_blank" rel="noopener noreferrer" className="ml-1 text-primary hover:underline inline-flex items-center gap-0.5">
                          <ExternalLink size={9} />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Key Contacts */}
          {contacts.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Users size={12} className="text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Key Contacts</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {contacts.slice(0, 6).map((c: any, i: number) => (
                  <div key={i} className="text-xs">
                    <span className="font-medium">{c.name}</span>
                    {c.title && <span className="text-muted-foreground ml-1">· {c.title}</span>}
                    {c.relevance && <p className="text-muted-foreground text-[10px] mt-0.5">{c.relevance}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Competitive Landscape */}
          {competitive && (competitive.competitors?.length > 0 || competitive.market_position) && (
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Competitive Landscape</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {competitive.market_position && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-foreground">{competitive.market_position}</span>
                )}
                {(competitive.competitors || []).slice(0, 5).map((c: string, i: number) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground">{c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Source URLs */}
          {profile?.source_urls?.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              <span className="text-[10px] text-muted-foreground">Sources:</span>
              {profile.source_urls.slice(0, 5).map((url: string, i: number) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-0.5 max-w-[200px] truncate">
                  {new URL(url).hostname} <ExternalLink size={8} />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
