import { ArrowLeft, Server } from 'lucide-react';

interface DatabaseSetupProps {
  onBack: () => void;
}

export default function DatabaseSetup({ onBack }: DatabaseSetupProps) {
  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <div className="text-center py-8">
        <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <Server className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="font-semibold mb-2">Self-hosted mode</h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Self-hosted database support is coming soon. For now, please use our cloud option
          to get started. Your data can be migrated to self-hosted later.
        </p>
      </div>
    </div>
  );
}
