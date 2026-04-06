import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Shield, Users, UserCog, ArrowRightLeft, Settings, Upload, Brain, GitMerge, Building2, FileSearch, ScrollText, Workflow, Mail, Cpu, Plug, MapPin, Target, DollarSign, Package } from 'lucide-react';
import UsersTab from '@/components/admin/UsersTab';
import TeamsTab from '@/components/admin/TeamsTab';
import OwnershipTab from '@/components/admin/OwnershipTab';
import ConfigTab from '@/components/admin/ConfigTab';
import ImportsTab from '@/components/admin/ImportsTab';
import AuditTab from '@/components/admin/AuditTab';
import IntelligenceOpsTab from '@/components/admin/IntelligenceOpsTab';
import EntityResolutionQueue from '@/components/admin/EntityResolutionQueue';
import AccountMergeTab from '@/components/admin/AccountMergeTab';
import SecImportTab from '@/components/admin/SecImportTab';
import WorkflowsTab from '@/components/admin/WorkflowsTab';
import EmailTemplatesTab from '@/components/admin/EmailTemplatesTab';
import AIUsageTab from '@/components/admin/AIUsageTab';
import IntegrationsTab from '@/components/admin/IntegrationsTab';
import Territories from '@/pages/Territories';
import Quotas from '@/pages/Quotas';
import Commissions from '@/pages/Commissions';
import DatasetCatalog from '@/pages/DatasetCatalog';

interface NavItem {
  key: string;
  label: string;
  icon: React.ElementType;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: 'People',
    items: [
      { key: 'users', label: 'Users', icon: Users },
      { key: 'teams', label: 'Teams', icon: UserCog },
      { key: 'ownership', label: 'Ownership', icon: ArrowRightLeft },
    ],
  },
  {
    title: 'Sales Setup',
    items: [
      { key: 'config', label: 'Configuration', icon: Settings },
      { key: 'territories', label: 'Territories', icon: MapPin },
      { key: 'quotas', label: 'Quotas', icon: Target },
      { key: 'commissions', label: 'Commissions', icon: DollarSign },
      { key: 'products', label: 'Products', icon: Package },
    ],
  },
  {
    title: 'Data Operations',
    items: [
      { key: 'imports', label: 'Imports', icon: Upload },
      { key: 'intelligence', label: 'Intelligence Ops', icon: Brain },
      { key: 'entity-resolution', label: 'Entity Resolution', icon: GitMerge },
      { key: 'merge', label: 'Account Merge', icon: Building2 },
      { key: 'sec-import', label: 'SEC Import', icon: FileSearch },
    ],
  },
  {
    title: 'Automation',
    items: [
      { key: 'workflows', label: 'Workflows', icon: Workflow },
      { key: 'email-templates', label: 'Email Templates', icon: Mail },
      { key: 'integrations', label: 'Integrations', icon: Plug },
    ],
  },
  {
    title: 'Monitoring',
    items: [
      { key: 'audit', label: 'Audit Log', icon: ScrollText },
      { key: 'ai-usage', label: 'AI Usage', icon: Cpu },
    ],
  },
];

const tabContent: Record<string, React.ReactNode> = {
  users: <UsersTab />,
  teams: <TeamsTab />,
  ownership: <OwnershipTab />,
  config: <ConfigTab />,
  imports: <ImportsTab />,
  intelligence: <IntelligenceOpsTab />,
  'entity-resolution': <EntityResolutionQueue />,
  merge: <AccountMergeTab />,
  'sec-import': <SecImportTab />,
  audit: <AuditTab />,
  workflows: <WorkflowsTab />,
  'email-templates': <EmailTemplatesTab />,
  'ai-usage': <AIUsageTab />,
  integrations: <IntegrationsTab />,
  territories: <Territories embedded />,
  quotas: <Quotas embedded />,
  commissions: <Commissions embedded />,
  products: <DatasetCatalog embedded />,
};

export default function AdminPortal() {
  const { role, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('users');

  if (loading) return null;
  if (role !== 'admin') return <Navigate to="/" replace />;

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-56px)]">
        {/* Sidebar */}
        <nav className="w-52 shrink-0 border-r border-border bg-muted/30 overflow-y-auto py-4 px-2">
          <div className="flex items-center gap-2 px-3 mb-4">
            <Shield size={16} className="text-primary" />
            <span className="text-sm font-semibold">Admin</span>
          </div>
          {navGroups.map(group => (
            <div key={group.title} className="mb-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-3 mb-1">{group.title}</p>
              {group.items.map(item => {
                const Icon = item.icon;
                const isActive = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => setActiveTab(item.key)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors ${
                      isActive
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <Icon size={13} className={isActive ? 'text-primary' : ''} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {tabContent[activeTab]}
        </div>
      </div>
    </AppLayout>
  );
}
