import { useState } from 'react';
import { Upload, ArrowRight, FileSpreadsheet } from 'lucide-react';

interface ImportDataProps {
  onComplete: () => void;
  onSkip: () => void;
}

export default function ImportData({ onComplete, onSkip }: ImportDataProps) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground text-center">
        Import your existing data to get started quickly, or skip this step and add data manually.
      </p>

      <div className="space-y-3">
        <a
          href="/import/contacts"
          className="w-full p-4 rounded-lg border border-border hover:border-primary transition-colors flex items-center gap-3 group"
        >
          <div className="p-2 rounded bg-muted">
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-medium group-hover:text-primary transition-colors">
              Import contacts & companies
            </h4>
            <p className="text-xs text-muted-foreground">CSV with name, email, company, title</p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </a>

        <a
          href="/import/opportunities"
          className="w-full p-4 rounded-lg border border-border hover:border-primary transition-colors flex items-center gap-3 group"
        >
          <div className="p-2 rounded bg-muted">
            <Upload className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-medium group-hover:text-primary transition-colors">
              Import deals
            </h4>
            <p className="text-xs text-muted-foreground">CSV with deal name, value, stage, company</p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </a>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          onClick={onSkip}
          className="flex-1 py-2.5 rounded-md border border-input text-sm font-medium hover:bg-accent transition-colors"
        >
          Skip for now
        </button>
        <button
          onClick={onComplete}
          className="flex-1 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}
