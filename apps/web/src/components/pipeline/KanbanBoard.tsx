import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Clock, AlertTriangle, User, GripVertical } from 'lucide-react';
import { differenceInDays } from 'date-fns';
import { formatCurrency, getStageColor } from '@/data/mockData';
import { useNavigate } from 'react-router-dom';
import BallStatusBadge from '@/components/BallStatusBadge';
import { BallStatus } from '@/hooks/useActionCenter';

interface KanbanBoardProps {
  opportunities: any[];
  stages: string[];
  profileMap: Map<string, string>;
  scope: string;
  onStageChange: (oppId: string, newStage: string) => void;
  getCompleteness: (o: any) => { score: number; total: number; pct: number };
}

function KanbanColumn({
  stage,
  opportunities,
  profileMap,
  scope,
  getCompleteness,
}: {
  stage: string;
  opportunities: any[];
  profileMap: Map<string, string>;
  scope: string;
  getCompleteness: (o: any) => { score: number; total: number; pct: number };
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const total = opportunities.reduce((s: number, o: any) => s + Number(o.value), 0);
  const weighted = opportunities.reduce((s: number, o: any) => s + Number(o.value) * (o.probability / 100), 0);

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-72 flex flex-col bg-muted/30 rounded-lg border ${isOver ? 'border-primary bg-primary/5' : 'border-border'} transition-colors`}
    >
      <div className="px-3 py-2.5 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`status-badge ${getStageColor(stage)}`}>{stage}</span>
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{opportunities.length}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-muted-foreground">
          <span>{formatCurrency(total)}</span>
          <span className="text-primary">{formatCurrency(weighted)} wtd</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-[100px]">
        <SortableContext items={opportunities.map((o: any) => o.id)} strategy={verticalListSortingStrategy}>
          {opportunities.map((o: any) => (
            <KanbanCard
              key={o.id}
              opportunity={o}
              profileMap={profileMap}
              scope={scope}
              getCompleteness={getCompleteness}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

function KanbanCard({
  opportunity: o,
  profileMap,
  scope,
  getCompleteness,
  isDragging,
}: {
  opportunity: any;
  profileMap: Map<string, string>;
  scope: string;
  getCompleteness: (o: any) => { score: number; total: number; pct: number };
  isDragging?: boolean;
}) {
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortableDragging } = useSortable({ id: o.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.5 : 1,
  };

  const bs: BallStatus = o.ball_status || 'unknown';
  const daysInStage = o.stage_entered_at ? differenceInDays(new Date(), new Date(o.stage_entered_at)) : null;
  const comp = getCompleteness(o);
  const isStale = differenceInDays(new Date(), new Date(o.last_activity_at || o.updated_at || o.created_at)) > 30;
  const isOverdueAction = o.next_action_due_date && o.next_action_due_date < new Date().toISOString().split('T')[0];
  const ownerName = o.owner_id ? profileMap.get(o.owner_id) : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-card border rounded-md p-2.5 cursor-grab active:cursor-grabbing hover:border-primary/40 transition-colors ${
        isStale ? 'border-warning/40' : isOverdueAction ? 'border-destructive/40' : 'border-border'
      } ${isDragging ? 'shadow-lg ring-2 ring-primary/20' : ''}`}
      {...attributes}
      {...listeners}
    >
      <div onClick={(e) => { e.stopPropagation(); navigate(`/pipeline/${o.id}`); }} className="cursor-pointer">
        <div className="flex items-center gap-1.5 mb-0.5">
          <GripVertical size={10} className="text-muted-foreground shrink-0" />
          <p className="text-sm font-medium truncate flex-1">{o.name}</p>
          {bs !== 'unknown' && <BallStatusBadge status={bs} size="sm" showIcon={true} />}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5 pl-4">{o.clients?.name} · {o.datasets?.name || '\u2014'}</p>

        {scope !== 'mine' && ownerName && (
          <div className="flex items-center gap-1 mt-1 pl-4">
            <User size={9} className="text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">{ownerName}</span>
          </div>
        )}

        <div className="flex items-center justify-between mt-2 pl-4">
          <span className="text-xs font-mono">{formatCurrency(Number(o.value))}</span>
          <div className="flex items-center gap-2">
            {daysInStage !== null && (
              <span className={`text-[10px] flex items-center gap-0.5 ${daysInStage > 30 ? 'text-destructive' : daysInStage > 14 ? 'text-warning' : 'text-muted-foreground'}`}>
                <Clock size={9} />{daysInStage}d
              </span>
            )}
            <span className="text-[10px] text-muted-foreground">{o.probability}%</span>
          </div>
        </div>

        {(isStale || isOverdueAction) && (
          <div className="flex gap-1 mt-1.5 pt-1.5 border-t border-border pl-4">
            {isOverdueAction && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive flex items-center gap-0.5">
                <AlertTriangle size={8} /> Overdue
              </span>
            )}
            {isStale && !isOverdueAction && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-warning/10 text-warning flex items-center gap-0.5">
                <Clock size={8} /> Stale
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function KanbanBoard({
  opportunities,
  stages,
  profileMap,
  scope,
  onStageChange,
  getCompleteness,
}: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const activeOpp = activeId ? opportunities.find((o: any) => o.id === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const oppId = active.id as string;
    const opp = opportunities.find((o: any) => o.id === oppId);
    if (!opp) return;

    // Determine target stage - "over" could be a column (stage name) or another card
    let targetStage: string;
    if (stages.includes(over.id as string)) {
      targetStage = over.id as string;
    } else {
      // Dropped on another card - find its stage
      const targetOpp = opportunities.find((o: any) => o.id === over.id);
      if (!targetOpp) return;
      targetStage = targetOpp.stage;
    }

    if (opp.stage !== targetStage) {
      onStageChange(oppId, targetStage);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-2 px-2">
        {stages.map((stage) => {
          const stageOpps = opportunities.filter((o: any) => o.stage === stage);
          return (
            <KanbanColumn
              key={stage}
              stage={stage}
              opportunities={stageOpps}
              profileMap={profileMap}
              scope={scope}
              getCompleteness={getCompleteness}
            />
          );
        })}
      </div>

      <DragOverlay>
        {activeOpp ? (
          <KanbanCard
            opportunity={activeOpp}
            profileMap={profileMap}
            scope={scope}
            getCompleteness={getCompleteness}
            isDragging
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
