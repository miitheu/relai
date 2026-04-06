import { useState } from 'react';
import { Plus, X, Filter } from 'lucide-react';

type FilterOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'in';

interface FilterField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'date';
  options?: { value: string; label: string }[];
}

export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value: string;
}

interface FilterBuilderProps {
  fields: FilterField[];
  conditions: FilterCondition[];
  onChange: (conditions: FilterCondition[]) => void;
}

const operatorLabels: Record<FilterOperator, string> = {
  eq: 'equals',
  neq: 'not equals',
  gt: 'greater than',
  lt: 'less than',
  gte: 'at least',
  lte: 'at most',
  contains: 'contains',
  in: 'is one of',
};

const operatorsForType: Record<string, FilterOperator[]> = {
  text: ['contains', 'eq', 'neq'],
  number: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte'],
  select: ['eq', 'neq'],
  date: ['eq', 'gt', 'lt', 'gte', 'lte'],
};

export default function FilterBuilder({ fields, conditions, onChange }: FilterBuilderProps) {
  const [isOpen, setIsOpen] = useState(conditions.length > 0);

  const addCondition = () => {
    if (fields.length === 0) return;
    const firstField = fields[0];
    onChange([...conditions, { field: firstField.name, operator: operatorsForType[firstField.type][0], value: '' }]);
    setIsOpen(true);
  };

  const removeCondition = (index: number) => {
    const next = conditions.filter((_, i) => i !== index);
    onChange(next);
    if (next.length === 0) setIsOpen(false);
  };

  const updateCondition = (index: number, updates: Partial<FilterCondition>) => {
    const next = conditions.map((c, i) => (i === index ? { ...c, ...updates } : c));
    // When changing field, reset operator and value
    if (updates.field) {
      const field = fields.find((f) => f.name === updates.field);
      if (field) {
        next[index].operator = operatorsForType[field.type][0];
        next[index].value = '';
      }
    }
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={addCondition}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md hover:border-primary/40 transition-colors"
        >
          <Filter size={12} />
          Add filter
        </button>
        {conditions.length > 0 && (
          <button
            onClick={() => { onChange([]); setIsOpen(false); }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {isOpen && conditions.length > 0 && (
        <div className="space-y-1.5">
          {conditions.map((condition, index) => {
            const field = fields.find((f) => f.name === condition.field);
            const availableOps = field ? operatorsForType[field.type] : [];

            return (
              <div key={index} className="flex items-center gap-2 bg-muted/30 rounded-md px-2 py-1.5">
                {index > 0 && <span className="text-xs text-muted-foreground font-medium px-1">AND</span>}

                <select
                  value={condition.field}
                  onChange={(e) => updateCondition(index, { field: e.target.value })}
                  className="bg-background border border-border rounded px-2 py-1 text-xs"
                >
                  {fields.map((f) => (
                    <option key={f.name} value={f.name}>{f.label}</option>
                  ))}
                </select>

                <select
                  value={condition.operator}
                  onChange={(e) => updateCondition(index, { operator: e.target.value as FilterOperator })}
                  className="bg-background border border-border rounded px-2 py-1 text-xs"
                >
                  {availableOps.map((op) => (
                    <option key={op} value={op}>{operatorLabels[op]}</option>
                  ))}
                </select>

                {field?.type === 'select' && field.options ? (
                  <select
                    value={condition.value}
                    onChange={(e) => updateCondition(index, { value: e.target.value })}
                    className="bg-background border border-border rounded px-2 py-1 text-xs flex-1"
                  >
                    <option value="">Select...</option>
                    {field.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ) : field?.type === 'date' ? (
                  <input
                    type="date"
                    value={condition.value}
                    onChange={(e) => updateCondition(index, { value: e.target.value })}
                    className="bg-background border border-border rounded px-2 py-1 text-xs flex-1"
                  />
                ) : field?.type === 'number' ? (
                  <input
                    type="number"
                    value={condition.value}
                    onChange={(e) => updateCondition(index, { value: e.target.value })}
                    placeholder="Value..."
                    className="bg-background border border-border rounded px-2 py-1 text-xs flex-1"
                  />
                ) : (
                  <input
                    type="text"
                    value={condition.value}
                    onChange={(e) => updateCondition(index, { value: e.target.value })}
                    placeholder="Value..."
                    className="bg-background border border-border rounded px-2 py-1 text-xs flex-1"
                  />
                )}

                <button
                  onClick={() => removeCondition(index)}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
