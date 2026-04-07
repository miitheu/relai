import { useState } from 'react';
import { useDb } from '@relai/db/react';
import { useCreateClient } from '@/hooks/useCrmData';
import { Compass, Loader2, Building2, Plus, CheckCircle2, ExternalLink, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface SimilarCompany {
  name: string;
  type: string;
  country: string;
  similarity_reason: string;
  product_fit_reason: string;
  
  recommended_approach: string;
  already_in_crm: boolean;
}

export default function SimilarAccountsTab({ clientId, clientName, clientType }: {
  const db = useDb();
  clientId: string;
  clientName: string;
  clientType: string;
}) {
  const [suggestions, setSuggestions] = useState<SimilarCompany[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [addedNames, setAddedNames] = useState<Set<string>>(new Set());
  const createClient = useCreateClient();
  const navigate = useNavigate();

  const runDiscovery = async () => {
    setLoading(true);
    try {
      const { data, error } = await db.invoke('account-discovery', { client_id: clientId });
      if (error) throw error;
      setSuggestions(data.suggestions || []);
      setHasRun(true);
    } catch (e: any) {
      toast.error(e.message || 'Discovery failed');
    } finally {
      setLoading(false);
    }
  };

  const addToCRM = async (company: SimilarCompany) => {
    try {
      const result = await createClient.mutateAsync({
        name: company.name,
        client_type: company.type,
        relationship_status: 'Prospect',
        headquarters_country: company.country,
        notes: `Discovered via similar account analysis from ${clientName}. ${company.similarity_reason}`,
      });
      setAddedNames(prev => new Set([...prev, company.name]));
      toast.success(`${company.name} added to CRM`);
    } catch {
      toast.error('Failed to add account');
    }
  };

  if (!hasRun) {
    return (
      <div className="text-center py-16">
        <Compass size={36} className="mx-auto text-primary mb-4" />
        <h3 className="text-base font-semibold mb-1">Discover Similar Accounts</h3>
        <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">
          Find companies similar to <span className="font-medium text-foreground">{clientName}</span> that 
          could be great prospects for your products.
        </p>
        <button
          onClick={runDiscovery}
          disabled={loading}
          className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2"
        >
          {loading ? (
            <><Loader2 size={14} className="animate-spin" /> Discovering...</>
          ) : (
            <><Sparkles size={14} /> Find Similar Accounts</>
          )}
        </button>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-muted-foreground">No similar accounts found. Try again later.</p>
        <button onClick={runDiscovery} className="mt-3 text-xs text-primary hover:underline">
          Retry
        </button>
      </div>
    );
  }

  const inCrm = suggestions.filter(s => s.already_in_crm);
  const notInCrm = suggestions.filter(s => !s.already_in_crm);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {suggestions.length} similar accounts found · {notInCrm.length} new prospects
        </p>
        <button
          onClick={runDiscovery}
          disabled={loading}
          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
        >
          {loading ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
          Refresh
        </button>
      </div>

      {/* New prospects */}
      {notInCrm.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
            New Prospects
          </h3>
          <div className="space-y-2">
            {notInCrm.map((s, i) => (
              <CompanyCard
                key={i}
                company={s}
                added={addedNames.has(s.name)}
                onAdd={() => addToCRM(s)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Already in CRM */}
      {inCrm.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
            Already in CRM
          </h3>
          <div className="space-y-2">
            {inCrm.map((s, i) => (
              <CompanyCard key={i} company={s} inCrm />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CompanyCard({ company, inCrm, added, onAdd }: {
  company: SimilarCompany;
  inCrm?: boolean;
  added?: boolean;
  onAdd?: () => void;
}) {
  return (
    <div className="data-card">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center shrink-0 mt-0.5">
          <Building2 size={14} className="text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-medium">{company.name}</p>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
              {company.type}
            </span>
            {company.country && (
              <span className="text-[10px] text-muted-foreground">{company.country}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-1.5">{company.similarity_reason}</p>
          <p className="text-xs text-foreground/80">
            <span className="font-medium text-primary">Product Fit:</span> {company.product_fit_reason}
          </p>
          {company.recommended_approach && (
            <p className="text-xs text-foreground/70 mt-1">
              <span className="font-medium">Approach:</span> {company.recommended_approach}
            </p>
          )}
        </div>
        <div className="shrink-0">
          {inCrm ? (
            <span className="text-[10px] px-2 py-1 rounded bg-success/10 text-success font-medium">In CRM</span>
          ) : added ? (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-success/10 text-success font-medium">
              <CheckCircle2 size={10} /> Added
            </span>
          ) : (
            <button
              onClick={onAdd}
              className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-primary/10 text-primary font-medium hover:bg-primary/20 transition-colors"
            >
              <Plus size={10} /> Add to CRM
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
