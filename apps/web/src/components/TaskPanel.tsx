import { useState } from 'react';
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from '@/hooks/useTasks';
import { CheckCircle2, Circle, Plus, Trash2, Calendar, X, Flag } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  client_id?: string;
  opportunity_id?: string;
  campaign_target_id?: string;
  compact?: boolean;
}

const priorityColors: Record<string, string> = {
  high: 'text-destructive',
  medium: 'text-warning',
  low: 'text-muted-foreground',
};

export default function TaskPanel({ client_id, opportunity_id, campaign_target_id, compact }: Props) {
  const { data: tasks = [], isLoading } = useTasks({ client_id, opportunity_id });
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('medium');

  const handleAdd = async () => {
    if (!title.trim()) return;
    try {
      await createTask.mutateAsync({
        title: title.trim(),
        due_date: dueDate || undefined,
        priority,
        client_id,
        opportunity_id,
        campaign_target_id,
      });
      setTitle('');
      setDueDate('');
      setPriority('medium');
      setAdding(false);
      toast.success('Task created');
    } catch {
      toast.error('Failed to create task');
    }
  };

  const toggleDone = async (task: any) => {
    const newStatus = task.status === 'done' ? 'todo' : 'done';
    await updateTask.mutateAsync({ id: task.id, status: newStatus });
  };

  const pending = tasks.filter((t: any) => t.status !== 'done');
  const done = tasks.filter((t: any) => t.status === 'done');

  return (
    <div className={compact ? '' : 'data-card'}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium">Tasks & Follow-ups</h3>
        <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs text-primary hover:underline">
          <Plus size={12} /> Add
        </button>
      </div>

      {adding && (
        <div className="mb-3 p-2 rounded-md bg-muted/50 space-y-2">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Task title..."
            className="w-full text-sm bg-transparent border-b border-border outline-none pb-1"
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar size={10} />
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="bg-transparent text-xs outline-none" />
            </div>
            <select value={priority} onChange={e => setPriority(e.target.value)} className="bg-transparent text-xs outline-none text-muted-foreground">
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <div className="ml-auto flex gap-1">
              <button onClick={handleAdd} className="px-2 py-0.5 rounded bg-primary text-primary-foreground text-xs">Save</button>
              <button onClick={() => setAdding(false)} className="px-2 py-0.5 rounded bg-muted text-muted-foreground text-xs">
                <X size={10} />
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-muted-foreground py-2">Loading...</p>
      ) : pending.length === 0 && done.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">No tasks yet</p>
      ) : (
        <div className="space-y-1">
          {pending.map((t: any) => (
            <TaskRow key={t.id} task={t} onToggle={() => toggleDone(t)} onDelete={() => deleteTask.mutateAsync(t.id)} />
          ))}
          {done.length > 0 && (
            <details className="mt-2">
              <summary className="text-[10px] text-muted-foreground cursor-pointer">{done.length} completed</summary>
              <div className="space-y-1 mt-1 opacity-60">
                {done.slice(0, 5).map((t: any) => (
                  <TaskRow key={t.id} task={t} onToggle={() => toggleDone(t)} onDelete={() => deleteTask.mutateAsync(t.id)} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, onToggle, onDelete }: { task: any; onToggle: () => void; onDelete: () => void }) {
  const isDone = task.status === 'done';
  const isOverdue = !isDone && task.due_date && new Date(task.due_date) < new Date();
  return (
    <div className="flex items-center gap-2 py-1 group">
      <button onClick={onToggle} className="shrink-0">
        {isDone ? <CheckCircle2 size={14} className="text-success" /> : <Circle size={14} className="text-muted-foreground hover:text-primary" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm truncate ${isDone ? 'line-through text-muted-foreground' : ''}`}>{task.title}</p>
        {task.due_date && (
          <p className={`text-[10px] ${isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
            {task.due_date}
          </p>
        )}
      </div>
      <Flag size={10} className={`shrink-0 ${priorityColors[task.priority] || 'text-muted-foreground'}`} />
      <button onClick={onDelete} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <Trash2 size={10} className="text-muted-foreground hover:text-destructive" />
      </button>
    </div>
  );
}
