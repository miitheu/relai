import { useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { useTerritories, useTerritoryAssignments, useCreateTerritory, useUpdateTerritory, useDeleteTerritory, useAssignTerritory, useUnassignTerritory } from '@/hooks/useTerritories';
import type { Territory, TerritoryAssignment } from '@/hooks/useTerritories';
import { useProfiles } from '@/hooks/useCrmData';
import { useCurrencyRerender } from '@/hooks/useCurrencyRerender';
import { useAuth } from '@/contexts/AuthContext';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import { Map, Plus, Users, ChevronDown, ChevronRight, Globe, Tag, Pencil, Trash2, X, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

export default function Territories({ embedded }: { embedded?: boolean } = {}) {
  useCurrencyRerender();
  const { user, role } = useAuth();
  const { data: territories = [], isLoading } = useTerritories();
  const { data: allAssignments = [] } = useTerritoryAssignments();
  const { data: profiles = [] } = useProfiles();
  const createTerritory = useCreateTerritory();
  const updateTerritory = useUpdateTerritory();
  const deleteTerritory = useDeleteTerritory();
  const assignTerritory = useAssignTerritory();
  const unassignTerritory = useUnassignTerritory();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAssign, setShowAssign] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formRegion, setFormRegion] = useState('');
  const [formSegment, setFormSegment] = useState('');
  const [assignUserId, setAssignUserId] = useState('');

  const canManage = role === 'admin' || role === 'sales_manager';

  const profileMap = useMemo(() => {
    const m = new Map<string, string>();
    profiles.forEach((p: any) => m.set(p.user_id, p.full_name || p.email));
    return m;
  }, [profiles]);

  // Group assignments by territory
  const assignmentsByTerritory = useMemo(() => {
    const m = new Map<string, TerritoryAssignment[]>();
    allAssignments.forEach(a => {
      const list = m.get(a.territory_id) || [];
      list.push(a);
      m.set(a.territory_id, list);
    });
    return m;
  }, [allAssignments]);

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormRegion('');
    setFormSegment('');
  };

  const openEdit = (t: Territory) => {
    setFormName(t.name);
    setFormDescription(t.description || '');
    setFormRegion(t.region || '');
    setFormSegment(t.segment || '');
    setEditingId(t.id);
  };

  const handleCreate = async () => {
    if (!formName.trim()) return;
    try {
      await createTerritory.mutateAsync({
        name: formName.trim(),
        description: formDescription.trim() || undefined,
        region: formRegion.trim() || undefined,
        segment: formSegment.trim() || undefined,
      });
      setShowCreate(false);
      resetForm();
      toast.success('Territory created');
    } catch {
      toast.error('Failed to create territory');
    }
  };

  const handleUpdate = async () => {
    if (!editingId || !formName.trim()) return;
    try {
      await updateTerritory.mutateAsync({
        id: editingId,
        name: formName.trim(),
        description: formDescription.trim() || null,
        region: formRegion.trim() || null,
        segment: formSegment.trim() || null,
      });
      setEditingId(null);
      resetForm();
      toast.success('Territory updated');
    } catch {
      toast.error('Failed to update territory');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTerritory.mutateAsync(id);
      if (expandedId === id) setExpandedId(null);
      toast.success('Territory deleted');
    } catch {
      toast.error('Failed to delete territory');
    }
  };

  const handleAssign = async (territoryId: string) => {
    if (!assignUserId) return;
    try {
      await assignTerritory.mutateAsync({ territory_id: territoryId, user_id: assignUserId });
      setAssignUserId('');
      setShowAssign(null);
      toast.success('User assigned to territory');
    } catch {
      toast.error('Failed to assign user');
    }
  };

  const handleUnassign = async (assignmentId: string) => {
    try {
      await unassignTerritory.mutateAsync(assignmentId);
      toast.success('Assignment removed');
    } catch {
      toast.error('Failed to remove assignment');
    }
  };

  if (isLoading) return embedded ? <LoadingState /> : <AppLayout><LoadingState /></AppLayout>;

  const Wrapper = embedded ? 'div' : AppLayout;

  return (
    <Wrapper>
      <div className="page-header">
        <div>
          <h1 className="page-title">Territories</h1>
          <p className="text-sm text-muted-foreground">
            {territories.length} {territories.length === 1 ? 'territory' : 'territories'}
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => { resetForm(); setShowCreate(true); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
          >
            <Plus size={14} /> New Territory
          </button>
        )}
      </div>

      {territories.length === 0 ? (
        <EmptyState
          icon={Map}
          title="No territories yet"
          description="Create your first territory to organize accounts by region or segment."
          actionLabel={canManage ? 'New Territory' : undefined}
          onAction={canManage ? () => { resetForm(); setShowCreate(true); } : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {territories.map((t: Territory) => {
            const assignments = assignmentsByTerritory.get(t.id) || [];
            const userAssignments = assignments.filter(a => !a.client_id);
            const isExpanded = expandedId === t.id;

            return (
              <div key={t.id} className="data-card p-0 overflow-hidden">
                {/* Card header - clickable */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : t.id)}
                  className="w-full text-left px-4 py-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Map size={16} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate">{t.name}</span>
                        {isExpanded ? <ChevronDown size={14} className="text-muted-foreground shrink-0" /> : <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
                      </div>
                      {t.description && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{t.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        {t.region && (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Globe size={10} /> {t.region}
                          </span>
                        )}
                        {t.segment && (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Tag size={10} /> {t.segment}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Users size={10} /> <span className="metric-value">{userAssignments.length}</span> users
                        </span>
                      </div>
                    </div>
                  </div>
                </button>

                {/* Expanded section */}
                {isExpanded && (
                  <div className="border-t border-border px-4 py-3 space-y-3">
                    {/* Actions */}
                    {canManage && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(t)}
                          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Pencil size={10} /> Edit
                        </button>
                        <button
                          onClick={() => setShowAssign(t.id)}
                          className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors"
                        >
                          <UserPlus size={10} /> Assign User
                        </button>
                        <div className="flex-1" />
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="flex items-center gap-1 text-[11px] text-destructive hover:text-destructive/80 transition-colors"
                        >
                          <Trash2 size={10} /> Delete
                        </button>
                      </div>
                    )}

                    {/* Assigned users */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                        Assigned Users ({userAssignments.length})
                      </p>
                      {userAssignments.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground italic">No users assigned</p>
                      ) : (
                        <div className="space-y-1">
                          {userAssignments.map(a => (
                            <div key={a.id} className="flex items-center gap-2 text-xs">
                              <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                                <Users size={10} className="text-muted-foreground" />
                              </div>
                              <span className="flex-1 truncate">{profileMap.get(a.user_id) || 'Unknown user'}</span>
                              {canManage && (
                                <button
                                  onClick={() => handleUnassign(a.id)}
                                  className="text-muted-foreground hover:text-destructive transition-colors"
                                  title="Remove assignment"
                                >
                                  <X size={12} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Territory Dialog */}
      <Dialog open={showCreate} onOpenChange={(o) => { if (!o) resetForm(); setShowCreate(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Territory</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name *</label>
              <input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="e.g. North America"
                className="w-full mt-1.5 px-3 py-2.5 rounded-lg bg-secondary text-sm border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</label>
              <textarea
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                rows={2}
                placeholder="Describe this territory..."
                className="w-full mt-1.5 px-3 py-2.5 rounded-lg bg-secondary text-sm border border-border focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Region</label>
                <input
                  value={formRegion}
                  onChange={e => setFormRegion(e.target.value)}
                  placeholder="e.g. EMEA"
                  className="w-full mt-1.5 px-3 py-2.5 rounded-lg bg-secondary text-sm border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Segment</label>
                <input
                  value={formSegment}
                  onChange={e => setFormSegment(e.target.value)}
                  placeholder="e.g. Enterprise"
                  className="w-full mt-1.5 px-3 py-2.5 rounded-lg bg-secondary text-sm border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => { resetForm(); setShowCreate(false); }} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!formName.trim() || createTerritory.isPending}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40"
            >
              {createTerritory.isPending ? 'Creating...' : 'Create Territory'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Territory Dialog */}
      <Dialog open={!!editingId} onOpenChange={(o) => { if (!o) { setEditingId(null); resetForm(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Territory</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name *</label>
              <input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                className="w-full mt-1.5 px-3 py-2.5 rounded-lg bg-secondary text-sm border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</label>
              <textarea
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                rows={2}
                className="w-full mt-1.5 px-3 py-2.5 rounded-lg bg-secondary text-sm border border-border focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Region</label>
                <input
                  value={formRegion}
                  onChange={e => setFormRegion(e.target.value)}
                  className="w-full mt-1.5 px-3 py-2.5 rounded-lg bg-secondary text-sm border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Segment</label>
                <input
                  value={formSegment}
                  onChange={e => setFormSegment(e.target.value)}
                  className="w-full mt-1.5 px-3 py-2.5 rounded-lg bg-secondary text-sm border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => { setEditingId(null); resetForm(); }} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
              Cancel
            </button>
            <button
              onClick={handleUpdate}
              disabled={!formName.trim() || updateTerritory.isPending}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40"
            >
              {updateTerritory.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign User Dialog */}
      <Dialog open={!!showAssign} onOpenChange={(o) => { if (!o) { setShowAssign(null); setAssignUserId(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign User to Territory</DialogTitle>
          </DialogHeader>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select User</label>
            <select
              value={assignUserId}
              onChange={e => setAssignUserId(e.target.value)}
              className="w-full mt-1.5 px-3 py-2.5 rounded-lg bg-secondary text-sm border border-border focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Choose a user...</option>
              {profiles.map((p: any) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.full_name || p.email}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <button onClick={() => { setShowAssign(null); setAssignUserId(''); }} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
              Cancel
            </button>
            <button
              onClick={() => showAssign && handleAssign(showAssign)}
              disabled={!assignUserId || assignTerritory.isPending}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40"
            >
              {assignTerritory.isPending ? 'Assigning...' : 'Assign'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Wrapper>
  );
}
