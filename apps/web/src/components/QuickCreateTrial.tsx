import { useEffect, useState } from 'react';
import { useQuickCreate } from '@/contexts/QuickCreateContext';
import { useClients, useDatasets, useOpportunities, useCreateDelivery, useProfiles } from '@/hooks/useCrmData';
import { useToast } from '@/hooks/use-toast';
import { X } from 'lucide-react';
import { addDays, format } from 'date-fns';

export default function QuickCreateTrial() {
  const { isTrialOpen, close, defaults } = useQuickCreate();
  const { toast } = useToast();
  
  const { data: clients = [] } = useClients();
  const { data: datasets = [] } = useDatasets();
  const { data: opportunities = [] } = useOpportunities();
  const { data: profiles = [] } = useProfiles();
  const createDelivery = useCreateDelivery();

  const [formData, setFormData] = useState({
    client_id: '',
    dataset_id: '',
    opportunity_id: '',
    delivery_type: 'Trial',
    trial_start_date: format(new Date(), 'yyyy-MM-dd'),
    trial_end_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    delivery_method: 'SFTP',
    owner_id: '',
    notes: '',
  });

  useEffect(() => {
    if (isTrialOpen) {
      setFormData(prev => ({
        ...prev,
        client_id: defaults.client_id || '',
        dataset_id: defaults.dataset_id || '',
        opportunity_id: defaults.opportunity_id || '',
        owner_id: defaults.owner_id || '',
        delivery_type: 'Trial',
        trial_start_date: format(new Date(), 'yyyy-MM-dd'),
        trial_end_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
      }));
    }
  }, [isTrialOpen, defaults]);

  if (!isTrialOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.client_id) {
      toast({ title: 'Client is required', variant: 'destructive' });
      return;
    }
    
    try {
      await createDelivery.mutateAsync({
        client_id: formData.client_id,
        dataset_id: formData.dataset_id || undefined,
        opportunity_id: formData.opportunity_id || undefined,
        delivery_type: formData.delivery_type,
        trial_start_date: formData.trial_start_date || undefined,
        trial_end_date: formData.trial_end_date || undefined,
        delivery_method: formData.delivery_method,
        owner_id: formData.owner_id || undefined,
        notes: formData.notes || undefined,
        delivery_date: formData.trial_start_date || format(new Date(), 'yyyy-MM-dd'),
        access_status: 'active'
      });
      
      toast({ title: 'Trial logged successfully' });
      close();
    } catch (err: any) {
      toast({ title: 'Error logging trial', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 transition-all" onClick={close} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-background border-l border-border shadow-2xl animate-in slide-in-from-right-full duration-300">
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold">New Trial</h2>
            <button onClick={close} className="p-2 hover:bg-muted rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6">
            <form id="trial-form" onSubmit={handleSubmit} className="space-y-5">
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Client *</label>
                <select
                  required
                  value={formData.client_id}
                  onChange={e => setFormData({ ...formData, client_id: e.target.value })}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background"
                >
                  <option value="">Select client...</option>
                  {clients.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Dataset</label>
                <select
                  value={formData.dataset_id}
                  onChange={e => setFormData({ ...formData, dataset_id: e.target.value })}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background"
                >
                  <option value="">Select dataset...</option>
                  {datasets.map((d: any) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Linked Opportunity</label>
                <select
                  value={formData.opportunity_id}
                  onChange={e => setFormData({ ...formData, opportunity_id: e.target.value })}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background"
                >
                  <option value="">Select opportunity (optional)...</option>
                  {opportunities
                    .filter((o: any) => !formData.client_id || o.client_id === formData.client_id)
                    .map((o: any) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Start Date</label>
                  <input
                    type="date"
                    required
                    value={formData.trial_start_date}
                    onChange={e => setFormData({ ...formData, trial_start_date: e.target.value })}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">End Date</label>
                  <input
                    type="date"
                    required
                    value={formData.trial_end_date}
                    onChange={e => setFormData({ ...formData, trial_end_date: e.target.value })}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Type</label>
                  <select
                    value={formData.delivery_type}
                    onChange={e => setFormData({ ...formData, delivery_type: e.target.value })}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background"
                  >
                    <option value="Trial">Trial</option>
                    <option value="Sample data">Sample</option>
                    <option value="API access">API Access</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Method</label>
                  <select
                    value={formData.delivery_method}
                    onChange={e => setFormData({ ...formData, delivery_method: e.target.value })}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background"
                  >
                    <option value="SFTP">SFTP</option>
                    <option value="API">API</option>
                    <option value="Download">Download</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Owner</label>
                <select
                  value={formData.owner_id}
                  onChange={e => setFormData({ ...formData, owner_id: e.target.value })}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background"
                >
                  <option value="">Select owner...</option>
                  {profiles.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full min-h-[100px] p-3 rounded-md border border-input bg-background resize-y"
                  placeholder="Trial objectives, requirements..."
                />
              </div>
            </form>
          </div>
          
          <div className="p-6 border-t border-border bg-muted/30">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={close}
                className="flex-1 px-4 py-2 border border-input bg-background hover:bg-muted rounded-md font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="trial-form"
                disabled={createDelivery.isPending}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md font-medium transition-colors disabled:opacity-50"
              >
                {createDelivery.isPending ? 'Saving...' : 'Start Trial'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}