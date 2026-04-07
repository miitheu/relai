import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDb } from '@relai/db/react';
import { toast } from 'sonner';
import { ArrowLeft, Loader2 } from 'lucide-react';

interface CloudSetupProps {
  onComplete: () => void;
  onBack: () => void;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

export default function CloudSetup({ onComplete, onBack }: CloudSetupProps) {
  const { user, refreshProfile } = useAuth();
  const db = useDb();
  const [orgName, setOrgName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    const name = orgName.trim();
    if (!name) {
      toast.error('Please enter an organization name');
      return;
    }

    setCreating(true);
    try {
      // Create organization
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

      // Update user's profile with org_id
      await db.update('profiles', { user_id: user!.id }, { org_id: newOrgId });

      // Refresh auth context to pick up the new org_id
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
        <p className="text-xs text-muted-foreground mt-1.5">
          This is your company or team name. You can change it later in settings.
        </p>
      </div>

      <button
        onClick={handleCreate}
        disabled={creating || !orgName.trim()}
        className="w-full py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {creating && <Loader2 className="h-4 w-4 animate-spin" />}
        {creating ? 'Creating...' : 'Create organization'}
      </button>
    </div>
  );
}
