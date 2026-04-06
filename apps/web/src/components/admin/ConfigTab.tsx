import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Plus, X, GripVertical, Save, RotateCcw, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ConfigCategory {
  key: string;
  label: string;
  description: string;
  values: string[];
}

const defaultConfig: ConfigCategory[] = [
  {
    key: 'opportunity_stages',
    label: 'Opportunity Stages',
    description: 'Pipeline stages that opportunities move through from lead to close.',
    values: ['Lead', 'Initial Discussion', 'Demo Scheduled', 'Trial', 'Evaluation', 'Commercial Discussion', 'Contract Sent', 'Closed Won', 'Closed Lost'],
  },
  {
    key: 'client_types',
    label: 'Client Types',
    description: 'Classification of accounts by institution type.',
    values: ['Hedge Fund', 'Asset Manager', 'Bank', 'Insurance', 'Pension Fund', 'Sovereign Wealth', 'Corporate', 'Other'],
  },
  {
    key: 'client_tiers',
    label: 'Client Tiers',
    description: 'Strategic importance tiers for prioritizing accounts.',
    values: ['Tier 1', 'Tier 2', 'Tier 3'],
  },
  {
    key: 'relationship_statuses',
    label: 'Relationship Statuses',
    description: 'Lifecycle state of a client relationship.',
    values: ['Prospect', 'Active Client', 'Dormant', 'Strategic'],
  },
  {
    key: 'delivery_types',
    label: 'Delivery Types',
    description: 'Types of data deliveries to clients.',
    values: ['Full dataset', 'Sample', 'Trial', 'Custom extract'],
  },
  {
    key: 'delivery_methods',
    label: 'Delivery Methods',
    description: 'How data is delivered to the client.',
    values: ['SFTP', 'API', 'S3', 'Email', 'Snowflake'],
  },
  {
    key: 'renewal_statuses',
    label: 'Renewal Statuses',
    description: 'Status of contract renewals.',
    values: ['Upcoming', 'Negotiation', 'Renewed', 'Lost'],
  },
  {
    key: 'ball_statuses',
    label: 'Ball Status',
    description: 'Whose court the ball is in for active opportunities.',
    values: ['our_court', 'their_court', 'neutral', 'unknown'],
  },
  {
    key: 'influence_levels',
    label: 'Influence Levels',
    description: 'How much influence a contact has on purchasing decisions.',
    values: ['Decision Maker', 'Champion', 'Influencer', 'User', 'Procurement', 'Unknown'],
  },
  {
    key: 'relationship_strengths',
    label: 'Relationship Strengths',
    description: 'Quality of the relationship with a contact.',
    values: ['Strong', 'Medium', 'Weak'],
  },
  {
    key: 'deal_types',
    label: 'Deal Types',
    description: 'Classification of opportunity types.',
    values: ['New Business', 'Upsell', 'Renewal', 'Trial'],
  },
];

function ConfigCategoryEditor({
  category,
  onUpdate,
}: {
  category: ConfigCategory;
  onUpdate: (key: string, values: string[]) => void;
}) {
  const [newValue, setNewValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const addValue = () => {
    const trimmed = newValue.trim();
    if (!trimmed || category.values.includes(trimmed)) return;
    onUpdate(category.key, [...category.values, trimmed]);
    setNewValue('');
    setIsAdding(false);
  };

  const removeValue = (value: string) => {
    onUpdate(category.key, category.values.filter(v => v !== value));
  };

  const moveValue = (index: number, direction: -1 | 1) => {
    const newValues = [...category.values];
    const target = index + direction;
    if (target < 0 || target >= newValues.length) return;
    [newValues[index], newValues[target]] = [newValues[target], newValues[index]];
    onUpdate(category.key, newValues);
  };

  return (
    <div className="p-4 border rounded-lg space-y-3 group">
      <div>
        <h4 className="text-sm font-medium">{category.label}</h4>
        <p className="text-[11px] text-muted-foreground mt-0.5">{category.description}</p>
      </div>
      <div className="flex flex-wrap gap-1.5 items-center">
        {category.values.map((v, i) => (
          <div key={v} className="group/badge inline-flex items-center gap-0.5">
            <Badge
              variant="secondary"
              className="text-xs font-normal pr-1 flex items-center gap-1 cursor-default"
            >
              <button
                onClick={() => moveValue(i, -1)}
                className="opacity-0 group-hover/badge:opacity-50 hover:!opacity-100 transition-opacity"
                title="Move left"
              >
                <GripVertical size={10} />
              </button>
              {v}
              <button
                onClick={() => removeValue(v)}
                className="opacity-0 group-hover/badge:opacity-100 transition-opacity ml-0.5 hover:text-destructive"
                title="Remove"
              >
                <X size={10} />
              </button>
            </Badge>
          </div>
        ))}

        {isAdding ? (
          <div className="inline-flex items-center gap-1">
            <input
              autoFocus
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') addValue();
                if (e.key === 'Escape') { setIsAdding(false); setNewValue(''); }
              }}
              placeholder="New value..."
              className="h-6 px-2 text-xs border border-border rounded bg-card focus:outline-none focus:ring-1 focus:ring-primary w-32"
            />
            <button onClick={addValue} className="h-6 w-6 flex items-center justify-center rounded bg-primary/10 text-primary hover:bg-primary/20">
              <Check size={11} />
            </button>
            <button onClick={() => { setIsAdding(false); setNewValue(''); }} className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground">
              <X size={11} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="h-[22px] px-2 text-[10px] text-muted-foreground border border-dashed border-border rounded hover:border-primary hover:text-primary transition-colors flex items-center gap-1"
          >
            <Plus size={10} /> Add
          </button>
        )}
      </div>
    </div>
  );
}

export default function ConfigTab() {
  const { toast } = useToast();
  const [config, setConfig] = useState<ConfigCategory[]>(defaultConfig);
  const [savedConfig, setSavedConfig] = useState<ConfigCategory[]>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load config from DB
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('crm_settings')
          .select('key, value')
          .eq('category', 'config');

        if (data && data.length > 0) {
          const overrides = new Map(data.map((r: any) => [r.key, r.value]));
          const merged = defaultConfig.map(cat => ({
            ...cat,
            values: overrides.has(cat.key) ? (overrides.get(cat.key) as string[]) : cat.values,
          }));
          setConfig(merged);
          setSavedConfig(merged);
        }
      } catch {
        // Table might not exist yet — use defaults
      }
      setLoading(false);
    })();
  }, []);

  const handleUpdate = useCallback((key: string, values: string[]) => {
    setConfig(prev => prev.map(c => c.key === key ? { ...c, values } : c));
  }, []);

  const hasChanges = JSON.stringify(config) !== JSON.stringify(savedConfig);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Upsert each changed category
      const changed = config.filter((c, i) =>
        JSON.stringify(c.values) !== JSON.stringify(savedConfig[i]?.values)
      );

      for (const cat of changed) {
        await supabase.from('crm_settings').upsert(
          { key: cat.key, category: 'config', value: cat.values, updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );
      }

      setSavedConfig([...config]);
      toast({ title: 'Configuration saved', description: `${changed.length} categor${changed.length === 1 ? 'y' : 'ies'} updated.` });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const handleReset = () => {
    setConfig([...savedConfig]);
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Loading configuration...</div>;
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">CRM Configuration</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage reference values used across the CRM. Hover over values to reorder or remove.
          </p>
        </div>
        {hasChanges && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded border border-border hover:bg-muted transition-colors"
            >
              <RotateCcw size={12} /> Discard
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Save size={12} /> {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {config.map(cat => (
          <ConfigCategoryEditor
            key={cat.key}
            category={cat}
            onUpdate={handleUpdate}
          />
        ))}
      </div>
    </div>
  );
}
