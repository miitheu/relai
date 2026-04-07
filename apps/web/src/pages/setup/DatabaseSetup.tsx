import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDb } from '@relai/db/react';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, CheckCircle2, XCircle, Server } from 'lucide-react';

interface DatabaseSetupProps {
  onComplete: () => void;
  onBack: () => void;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}

export default function DatabaseSetup({ onComplete, onBack }: DatabaseSetupProps) {
  const { user, refreshProfile } = useAuth();
  const db = useDb();
  const [apiStatus, setApiStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [orgName, setOrgName] = useState('');
  const [creating, setCreating] = useState(false);

  // Check API health on mount
  useEffect(() => {
    (async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
        const res = await fetch(`${apiUrl}/api/health`, { credentials: 'include' });
        const data = await res.json();
        setApiStatus(data.status === 'ok' ? 'ok' : 'error');
      } catch {
        setApiStatus('error');
      }
    })();
  }, []);

  const handleCreate = async () => {
    const name = orgName.trim();
    if (!name) {
      toast.error('Please enter an organization name');
      return;
    }

    setCreating(true);
    try {
      const slug = slugify(name) || 'org';
      const orgResult = await db.insert<{ id: string }>('organizations', {
        name,
        slug: `${slug}-${Date.now().toString(36)}`,
        plan: 'free',
        settings: {},
      });

      if (orgResult.error || !orgResult.data?.[0]) {
        throw new Error(orgResult.error?.message || 'Failed to create organization');
      }

      const newOrgId = orgResult.data[0].id;
      await db.update('profiles', { user_id: user!.id }, { org_id: newOrgId });
      await refreshProfile();

      toast.success('Organization created');
      onComplete();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create organization');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {/* API health check */}
      <div className="p-4 rounded-lg border border-border">
        <div className="flex items-center gap-3">
          <Server className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1">
            <h3 className="text-sm font-medium">API Server</h3>
            <p className="text-xs text-muted-foreground">
              {import.meta.env.VITE_API_URL || 'http://localhost:3001'}
            </p>
          </div>
          {apiStatus === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {apiStatus === 'ok' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
          {apiStatus === 'error' && <XCircle className="h-4 w-4 text-red-500" />}
        </div>
        {apiStatus === 'error' && (
          <p className="text-xs text-red-500 mt-2">
            Could not connect to the API server. Make sure it's running:
            <code className="block mt-1 p-2 bg-muted rounded text-[11px]">pnpm --filter @relai/api dev</code>
          </p>
        )}
      </div>

      {apiStatus === 'ok' && (
        <>
          <div>
            <label htmlFor="org-name" className="block text-sm font-medium mb-2">
              Organization name
            </label>
            <input
              id="org-name"
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Acme Corp"
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
          </div>

          <button
            onClick={handleCreate}
            disabled={creating || !orgName.trim()}
            className="w-full py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {creating && <Loader2 className="h-4 w-4 animate-spin" />}
            {creating ? 'Creating...' : 'Create organization'}
          </button>
        </>
      )}
    </div>
  );
}
