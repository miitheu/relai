import { Cloud, Server } from 'lucide-react';

interface ChooseModeProps {
  onCloud: () => void;
  onSelfHosted: () => void;
}

export default function ChooseMode({ onCloud, onSelfHosted }: ChooseModeProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground text-center mb-6">
        How would you like to run Relai?
      </p>

      <button
        onClick={onCloud}
        className="w-full p-6 rounded-lg border-2 border-border hover:border-primary transition-colors text-left group"
      >
        <div className="flex items-start gap-4">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Cloud className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-semibold group-hover:text-primary transition-colors">
              Use our cloud
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              We host everything. Get started in seconds with no infrastructure to manage.
            </p>
          </div>
        </div>
      </button>

      <button
        onClick={onSelfHosted}
        className="w-full p-6 rounded-lg border-2 border-border hover:border-primary transition-colors text-left group"
      >
        <div className="flex items-start gap-4">
          <div className="p-2 rounded-lg bg-muted text-muted-foreground">
            <Server className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-semibold group-hover:text-primary transition-colors">
              Connect your own database
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Self-host with your own PostgreSQL. Full control over your data.
            </p>
          </div>
        </div>
      </button>
    </div>
  );
}
