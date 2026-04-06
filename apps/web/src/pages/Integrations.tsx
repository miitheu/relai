import AppLayout from '@/components/AppLayout';
import GmailIntegrationCard from '@/components/admin/GmailIntegrationCard';
import { Plug, Mail, FolderOpen, Calendar } from 'lucide-react';

export default function Integrations() {
  return (
    <AppLayout>
      <div className="max-w-4xl">
        <div className="flex items-center gap-2 mb-1">
          <Plug size={20} className="text-primary" />
          <h1 className="text-xl font-bold">Integrations</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Connect external services to sync data with your CRM.
        </p>

        {/* Gmail */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Mail size={14} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold">Email</h2>
          </div>
          <div className="text-xs text-muted-foreground mb-3 space-y-1">
            <p>Connect your Gmail account to automatically sync emails with CRM contacts. Only emails that meet <b>all</b> of these criteria are synced:</p>
            <ul className="list-disc list-inside ml-2 space-y-0.5">
              <li>In your <b>Primary</b> inbox category (not Promotions, Social, or Updates)</li>
              <li>Sent by you or addressed <b>directly to you</b> (CC/BCC emails are excluded)</li>
              <li>From external addresses only (internal team emails are auto-filtered)</li>
              <li>Not from automated senders (noreply, notifications, newsletters, etc.)</li>
            </ul>
            <p>Synced emails are <b>private by default</b> — only you can see the content. Other team members see that email contact exists, but not the details.</p>
          </div>
          <GmailIntegrationCard />
        </section>

        {/* Future integrations placeholders */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={14} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold">Calendar</h2>
          </div>
          <div className="data-card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
              <Calendar size={20} className="text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Google Calendar</p>
              <p className="text-xs text-muted-foreground">Coming soon — auto-log meetings and sync calendar events</p>
            </div>
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-3">
            <FolderOpen size={14} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold">Storage</h2>
          </div>
          <div className="data-card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
              <FolderOpen size={20} className="text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Google Drive</p>
              <p className="text-xs text-muted-foreground">Coming soon — link folders and files to accounts and opportunities</p>
            </div>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
