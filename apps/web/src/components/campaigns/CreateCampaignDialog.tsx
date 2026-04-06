import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useSavedDiscoveries } from '@/hooks/useAccountDiscovery';
import { Sparkles } from 'lucide-react';

const objectives = [
  { value: 'upsell', label: 'Upsell', desc: 'Expand product usage with existing clients' },
  { value: 'cross_sell', label: 'Cross-sell', desc: 'Introduce complementary products to current accounts' },
  { value: 'new_logo', label: 'New Logo Acquisition', desc: 'Win net-new accounts never served before' },
  { value: 'reactivation', label: 'Reactivation', desc: 'Re-engage dormant or lapsed accounts' },
  { value: 'renewal_expansion', label: 'Renewal Expansion', desc: 'Increase value at upcoming renewals' },
  { value: 'partnership', label: 'Partnership', desc: 'Identify data distribution or tech partners' },
];

const accountTypes = ['Hedge Fund', 'Bank', 'Asset Manager', 'Corporate', 'Vendor', 'Other'];

const geographies = [
  'United States', 'United Kingdom', 'Germany', 'France', 'Switzerland',
  'Singapore', 'Hong Kong', 'Japan', 'Canada', 'Australia', 'Netherlands',
];

export default function CreateCampaignDialog({
  open, onOpenChange, datasets, onSubmit, isLoading,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  datasets: any[];
  onSubmit: (v: any) => void;
  isLoading: boolean;
}) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [focus, setFocus] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedGeos, setSelectedGeos] = useState<string[]>([]);
  const [includeExisting, setIncludeExisting] = useState(true);
  const [includeProspects, setIncludeProspects] = useState(true);
  const [maxTargets, setMaxTargets] = useState(25);
  const [selectedDiscovery, setSelectedDiscovery] = useState('');
  const { data: savedDiscoveries = [] } = useSavedDiscoveries();

  const toggle = (arr: string[], val: string, setter: (v: string[]) => void) =>
    setter(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);

  const reset = () => {
    setStep(1); setName(''); setDescription(''); setFocus('');
    setSelectedProducts([]); setSelectedTypes([]); setSelectedGeos([]);
    setIncludeExisting(true); setIncludeProspects(true); setMaxTargets(25);
    setSelectedDiscovery('');
  };

  const handleSubmit = () => {
    if (!name.trim() || !focus) return;
    onSubmit({
      name: name.trim(),
      description,
      focus,
      visibility: 'personal',
      seed_discovery_name: selectedDiscovery || undefined,
      target_product_ids: selectedProducts,
      target_account_types: selectedTypes,
      target_geographies: selectedGeos,
      include_existing_clients: includeExisting,
      include_prospects: includeProspects,
      max_targets: maxTargets,
    });
    reset();
  };

  const canNext = step === 1 ? !!focus : step === 2 ? selectedProducts.length > 0 : step === 3 ? !!name.trim() : false;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>New Campaign</span>
            <span className="text-xs font-normal text-muted-foreground">Step {step} of 3</span>
          </DialogTitle>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex gap-1 mb-2">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>

        {/* STEP 1: Objective */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Campaign Objective</label>
              <p className="text-[11px] text-muted-foreground mt-0.5 mb-3">What is the primary goal of this campaign?</p>
              <div className="grid grid-cols-2 gap-2">
                {objectives.map(o => (
                  <button
                    key={o.value}
                    onClick={() => setFocus(o.value)}
                    className={`text-left px-3 py-2.5 rounded-lg border transition-all ${
                      focus === o.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/30 hover:bg-muted/50'
                    }`}
                  >
                    <p className={`text-sm font-medium ${focus === o.value ? 'text-primary' : ''}`}>{o.label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{o.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Product + Scope */}
        {step === 2 && (
          <div className="space-y-5">
            {/* Seed from Discovery */}
            {savedDiscoveries.length > 0 && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Seed from Discovery</label>
                <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">Optionally pre-load targets from a saved discovery</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setSelectedDiscovery('')}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs border transition-colors ${
                      !selectedDiscovery ? 'bg-muted text-foreground border-border' : 'bg-secondary text-muted-foreground border-transparent hover:bg-muted'
                    }`}
                  >
                    None
                  </button>
                  {savedDiscoveries.map(d => (
                    <button
                      key={d.discovery_name}
                      onClick={() => setSelectedDiscovery(d.discovery_name)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs border transition-colors ${
                        selectedDiscovery === d.discovery_name
                          ? 'bg-primary/10 text-primary border-primary/30'
                          : 'bg-secondary text-secondary-foreground border-transparent hover:bg-muted'
                      }`}
                    >
                      <Sparkles size={10} /> {d.discovery_name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Target Product(s)</label>
              <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">Which product(s) are you pushing in this campaign?</p>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                {datasets.map((d: any) => (
                  <button
                    key={d.id}
                    onClick={() => toggle(selectedProducts, d.id, setSelectedProducts)}
                    className={`px-3 py-1.5 rounded-md text-xs transition-colors border ${
                      selectedProducts.includes(d.id)
                        ? 'bg-primary/10 text-primary border-primary/30'
                        : 'bg-secondary text-secondary-foreground border-transparent hover:bg-muted'
                    }`}
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Account Types</label>
              <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">Leave empty to include all types</p>
              <div className="flex flex-wrap gap-1.5">
                {accountTypes.map(t => (
                  <button
                    key={t}
                    onClick={() => toggle(selectedTypes, t, setSelectedTypes)}
                    className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                      selectedTypes.includes(t)
                        ? 'bg-primary/10 text-primary border-primary/30'
                        : 'bg-secondary text-secondary-foreground border-transparent hover:bg-muted'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Geography Filter</label>
              <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">Leave empty for all geographies</p>
              <div className="flex flex-wrap gap-1.5">
                {geographies.map(g => (
                  <button
                    key={g}
                    onClick={() => toggle(selectedGeos, g, setSelectedGeos)}
                    className={`px-2.5 py-1 rounded-md text-[11px] border transition-colors ${
                      selectedGeos.includes(g)
                        ? 'bg-primary/10 text-primary border-primary/30'
                        : 'bg-secondary text-secondary-foreground border-transparent hover:bg-muted'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Account Scope</label>
                <div className="mt-2 space-y-2">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={includeExisting} onChange={e => setIncludeExisting(e.target.checked)} className="rounded border-border" />
                    Existing clients
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={includeProspects} onChange={e => setIncludeProspects(e.target.checked)} className="rounded border-border" />
                    Prospects &amp; dormant
                  </label>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Max Targets</label>
                <div className="flex items-center gap-3 mt-2">
                  {[10, 25, 50, 100].map(n => (
                    <button
                      key={n}
                      onClick={() => setMaxTargets(n)}
                      className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                        maxTargets === n
                          ? 'bg-primary/10 text-primary border-primary/30'
                          : 'bg-secondary text-secondary-foreground border-transparent hover:bg-muted'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Name + Launch */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Campaign Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Q2 Government Contracts — Hedge Fund Push"
                className="w-full mt-1.5 px-3 py-2.5 rounded-lg bg-secondary text-sm border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                placeholder="Briefly describe the campaign strategy, expected outcomes, and any special considerations..."
                className="w-full mt-1.5 px-3 py-2.5 rounded-lg bg-secondary text-sm border border-border focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>

            {/* Summary */}
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Campaign Summary</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div><span className="text-muted-foreground">Objective:</span> <span className="font-medium capitalize">{focus.replace(/_/g, ' ')}</span></div>
                <div><span className="text-muted-foreground">Products:</span> <span className="font-medium">{selectedProducts.length} selected</span></div>
                <div><span className="text-muted-foreground">Account types:</span> <span className="font-medium">{selectedTypes.length > 0 ? selectedTypes.join(', ') : 'All'}</span></div>
                <div><span className="text-muted-foreground">Geography:</span> <span className="font-medium">{selectedGeos.length > 0 ? selectedGeos.join(', ') : 'Global'}</span></div>
                <div><span className="text-muted-foreground">Scope:</span> <span className="font-medium">{[includeExisting && 'Existing', includeProspects && 'Prospects'].filter(Boolean).join(' + ')}</span></div>
                <div><span className="text-muted-foreground">Max targets:</span> <span className="font-medium">{maxTargets}</span></div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex justify-between">
          <div>
            {step > 1 && (
              <button onClick={() => setStep(s => s - 1)} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
                Back
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => { reset(); onOpenChange(false); }} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
              Cancel
            </button>
            {step < 3 ? (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!canNext}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40"
              >
                Continue
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!name.trim() || isLoading}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40"
              >
                {isLoading ? 'Creating...' : 'Create Campaign'}
              </button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
