import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useSupabase } from '@/hooks/useSupabase';
import { useToast } from '@/hooks/use-toast';
import { Settings as SettingsIcon, User, KeyRound, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Settings() {
  const supabase = useSupabase();
  const { profile } = useAuth();
  const { toast } = useToast();

  // Change password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Notification preferences (stored in localStorage for now)
  const [emailNotifications, setEmailNotifications] = useState(() =>
    localStorage.getItem('pref_email_notifications') !== 'false'
  );
  const [syncNotifications, setSyncNotifications] = useState(() =>
    localStorage.getItem('pref_sync_notifications') !== 'false'
  );
  const [actionReminders, setActionReminders] = useState(() =>
    localStorage.getItem('pref_action_reminders') !== 'false'
  );
  const [weeklyDigest, setWeeklyDigest] = useState(() =>
    localStorage.getItem('pref_weekly_digest') === 'true'
  );

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Password updated successfully' });
      setNewPassword('');
      setConfirmPassword('');
    }
    setChangingPassword(false);
  };

  const toggleNotification = (key: string, value: boolean, setter: (v: boolean) => void) => {
    localStorage.setItem(`pref_${key}`, String(value));
    setter(value);
    toast({ title: `${value ? 'Enabled' : 'Disabled'} ${key.replace(/_/g, ' ')}` });
  };

  return (
    <AppLayout>
      <div className="max-w-3xl">
        <div className="flex items-center gap-2 mb-6">
          <SettingsIcon size={20} className="text-primary" />
          <h1 className="text-xl font-bold">Settings</h1>
        </div>

        {/* Profile */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <User size={14} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold">Profile</h2>
          </div>
          <div className="data-card p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">Name</span>
                <p className="font-medium">{profile?.full_name || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Email</span>
                <p className="font-medium">{profile?.email || '—'}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Change Password */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <KeyRound size={14} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold">Change Password</h2>
          </div>
          <div className="data-card p-4">
            <form onSubmit={handleChangePassword} className="flex items-end gap-3">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Min 6 characters"
                  className="w-full px-3 py-2 text-sm bg-muted/30 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Repeat password"
                  className="w-full px-3 py-2 text-sm bg-muted/30 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <Button type="submit" size="sm" disabled={changingPassword || !newPassword}>
                {changingPassword ? 'Updating...' : 'Update'}
              </Button>
            </form>
          </div>
        </section>

        {/* Notifications */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Bell size={14} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold">Notifications</h2>
          </div>
          <div className="data-card p-4 space-y-4">
            <NotificationToggle
              label="Email sync notifications"
              description="Get notified when new emails are synced from Gmail"
              details="Receive an in-app notification each time a Gmail sync completes. Shows how many new emails were imported and which contacts they matched. Useful for staying on top of incoming client communications without manually checking."
              enabled={syncNotifications}
              onChange={(v) => toggleNotification('sync_notifications', v, setSyncNotifications)}
            />
            <NotificationToggle
              label="Action reminders"
              description="Reminders for overdue next actions on opportunities"
              details="When an opportunity has a next action with a due date that has passed, you'll receive a reminder. Includes the opportunity name, client, action description, and how many days overdue. Helps prevent deals from going stale."
              enabled={actionReminders}
              onChange={(v) => toggleNotification('action_reminders', v, setActionReminders)}
            />
            <NotificationToggle
              label="Email activity alerts"
              description="Alerts when contacts reply to your emails"
              details="Get alerted when a CRM contact sends you a new email (detected during Gmail sync). Shows the contact name, company, and email subject. Enables quick follow-up on time-sensitive responses from prospects and clients."
              enabled={emailNotifications}
              onChange={(v) => toggleNotification('email_notifications', v, setEmailNotifications)}
            />
            <NotificationToggle
              label="Weekly digest"
              description="Weekly summary of pipeline activity and key metrics"
              details="Every Monday morning, receive a summary of your pipeline: new opportunities created, deals that moved stages, total pipeline value change, overdue actions, and upcoming renewals. Great for weekly planning and staying aligned with team activity."
              enabled={weeklyDigest}
              onChange={(v) => toggleNotification('weekly_digest', v, setWeeklyDigest)}
            />
          </div>
        </section>

      </div>
    </AppLayout>
  );
}

function NotificationToggle({ label, description, details, enabled, onChange }: {
  label: string;
  description: string;
  details?: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="py-1 border-b border-border/50 last:border-0">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <button
          onClick={() => onChange(!enabled)}
          className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ml-4 ${enabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
      </div>
      {details && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-primary/70 hover:text-primary mt-1"
          >
            {expanded ? 'Show less' : 'Learn more'}
          </button>
          {expanded && (
            <p className="text-[11px] text-muted-foreground/80 leading-relaxed mt-1 bg-muted/20 rounded-md px-2.5 py-2">
              {details}
            </p>
          )}
        </>
      )}
    </div>
  );
}
