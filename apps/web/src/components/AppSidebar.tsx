import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, Building2, TrendingUp,
  BarChart3, Megaphone, Search, Command, ChevronLeft,
  ChevronRight, LogOut, Shield, Grid3X3, Sparkles, RefreshCw, Settings, Plug, Bug, ChevronUp,
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import ReportBugDialog from './ReportBugDialog';
import { useAuth } from '@/contexts/AuthContext';


const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/clients', icon: Building2, label: 'Accounts' },
  { to: '/pipeline', icon: TrendingUp, label: 'Pipeline' },
  { to: '/renewals', icon: RefreshCw, label: 'Renewals' },
  { to: '/campaigns', icon: Megaphone, label: 'Campaigns' },
  { to: '/discovery', icon: Sparkles, label: 'Discovery' },
  { to: '/whitespace', icon: Grid3X3, label: 'Whitespace' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
];

export default function AppSidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, role, signOut } = useAuth();
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <aside className={`flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-200 ${collapsed ? 'w-16' : 'w-56'}`}>
      <div className="flex items-center px-3 h-14 border-b border-sidebar-border">
        <span className="text-lg font-bold tracking-tight">Relai</span>
      </div>

      {!collapsed && (
        <div className="px-3 py-3">
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md bg-sidebar-accent text-muted-foreground text-xs cursor-pointer hover:bg-sidebar-accent/80"
          >
            <Search size={14} />
            <span>Search...</span>
            <kbd className="ml-auto flex items-center gap-0.5 text-[10px] bg-sidebar border border-sidebar-border rounded px-1 py-0.5">
              <Command size={10} /> K
            </kbd>
          </button>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {navItems.map((item) => {
          const isActive = item.to === '/'
            ? location.pathname === '/'
            : location.pathname === item.to || location.pathname.startsWith(item.to + '/');
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={`nav-item ${isActive ? 'nav-item-active' : ''} ${collapsed ? 'justify-center px-0' : ''}`}
            >
              <item.icon size={16} />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {role === 'admin' && (
        <div className="px-2 pb-1">
          <NavLink
            to="/admin"
            className={`nav-item ${location.pathname === '/admin' ? 'nav-item-active' : ''} ${collapsed ? 'justify-center px-0' : ''}`}
          >
            <Shield size={16} />
            {!collapsed && <span>Admin</span>}
          </NavLink>
        </div>
      )}

      <div className="border-t border-sidebar-border p-2 space-y-1">
        {/* User menu dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className={`nav-item w-full text-muted-foreground hover:text-foreground ${collapsed ? 'justify-center px-0' : ''}`}
          >
            <Settings size={16} />
            {!collapsed && (
              <>
                <span className="flex-1 truncate text-left">{profile?.full_name || 'Settings'}</span>
                <ChevronUp size={12} className={`transition-transform ${menuOpen ? '' : 'rotate-180'}`} />
              </>
            )}
          </button>

          {menuOpen && (
            <div className={`absolute bottom-full mb-1 ${collapsed ? 'left-0' : 'left-0 right-0'} min-w-[180px] bg-card border border-border rounded-lg shadow-xl z-50 py-1`}>
              <button
                onClick={() => { navigate('/integrations'); setMenuOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-muted transition-colors ${location.pathname === '/integrations' ? 'text-primary' : 'text-foreground'}`}
              >
                <Plug size={14} /> Integrations
              </button>
              <button
                onClick={() => { navigate('/settings'); setMenuOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-muted transition-colors ${location.pathname === '/settings' ? 'text-primary' : 'text-foreground'}`}
              >
                <Settings size={14} /> Settings
              </button>
              <div className="border-t border-border my-1" />
              <button
                onClick={() => { signOut(); setMenuOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          )}
        </div>

        <ReportBugDialog collapsed={collapsed} />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="nav-item w-full justify-center"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </aside>
  );
}
