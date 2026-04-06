import { ReactNode, useState } from 'react';
import { Plus, MessageSquarePlus, ListChecks, Menu } from 'lucide-react';
import AppSidebar from './AppSidebar';
import { useQuickCreate } from '@/contexts/QuickCreateContext';
import { useInteraction } from '@/contexts/InteractionContext';
import { useActionCenter } from '@/hooks/useActionCenter';
import { useAuth } from '@/contexts/AuthContext';
import ActionCenterPanel from './ActionCenterPanel';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import CurrencyToggle from './CurrencyToggle';
import NotificationBell from './NotificationBell';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { open: openOpp } = useQuickCreate();
  const { open: openInteraction } = useInteraction();
  const { user, role } = useAuth();
  const { summary } = useActionCenter(user?.id, role === 'admin');
  const [panelOpen, setPanelOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar - hidden on mobile unless toggled */}
      <div className={`fixed inset-y-0 left-0 z-50 md:relative md:z-auto transition-transform duration-200 md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <AppSidebar onNavigate={() => setSidebarOpen(false)} />
      </div>

      <main className="flex-1 overflow-y-auto min-w-0">
        <div className="sticky top-0 z-30 flex items-center gap-1.5 px-4 md:px-6 h-14 bg-background/80 backdrop-blur-sm border-b border-border">
          {/* Mobile hamburger */}
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors md:hidden">
            <Menu size={18} />
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={() => openInteraction()}
                className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <MessageSquarePlus size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Log Interaction</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={() => openOpp()}
                className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <Plus size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>New Opportunity</TooltipContent>
          </Tooltip>
          <div className="ml-auto flex items-center gap-1">
            <CurrencyToggle />
            <NotificationBell />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setPanelOpen(true)}
                  className="relative p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <ListChecks size={16} />
                  {summary.total > 0 && (
                    <span className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[10px] font-bold px-1 ${
                      summary.urgent > 0 ? 'bg-destructive text-destructive-foreground' : 'bg-warning text-warning-foreground'
                    }`}>
                      {summary.total}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>Action Center</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
          {children}
        </div>
      </main>
      <ActionCenterPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </div>
  );
}