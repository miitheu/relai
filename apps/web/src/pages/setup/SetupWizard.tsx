import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import ChooseMode from './ChooseMode';
import CloudSetup from './CloudSetup';
import DatabaseSetup from './DatabaseSetup';
import AISetup from './AISetup';
import ImportData from './ImportData';

type Step = 'mode' | 'cloud' | 'database' | 'ai' | 'import' | 'done';

const stepLabels: Record<Step, string> = {
  mode: 'Choose Mode',
  cloud: 'Create Organization',
  database: 'Connect to API',
  ai: 'Connect AI',
  import: 'Import Data',
  done: 'Done',
};

const stepOrder: Step[] = ['mode', 'cloud', 'ai', 'import', 'done'];

export default function SetupWizard() {
  const [step, setStep] = useState<Step>('mode');
  const { user } = useAuth();
  const navigate = useNavigate();

  const currentIdx = stepOrder.indexOf(step);
  const progress = Math.round(((Math.max(currentIdx, 0) + 1) / stepOrder.length) * 100);

  const handleDone = () => {
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight mb-1">Relai CRM</h1>
          <p className="text-muted-foreground text-sm">
            {stepLabels[step]}
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-muted rounded-full mb-8 overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {step === 'mode' && (
          <ChooseMode
            onCloud={() => setStep('cloud')}
            onSelfHosted={() => setStep('database')}
          />
        )}

        {step === 'cloud' && (
          <CloudSetup
            onComplete={() => setStep('ai')}
            onBack={() => setStep('mode')}
          />
        )}

        {step === 'database' && (
          <DatabaseSetup
            onComplete={() => setStep('ai')}
            onBack={() => setStep('mode')}
          />
        )}

        {step === 'ai' && (
          <AISetup
            onComplete={() => setStep('import')}
            onSkip={() => setStep('import')}
          />
        )}

        {step === 'import' && (
          <ImportData
            onComplete={handleDone}
            onSkip={handleDone}
          />
        )}
      </div>
    </div>
  );
}
