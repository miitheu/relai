import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDb } from '@relai/db/react';
import { toast } from 'sonner';
import { Brain, Loader2, CheckCircle2, XCircle } from 'lucide-react';

interface AISetupProps {
  onComplete: () => void;
  onSkip: () => void;
}

type ProviderId = 'anthropic' | 'openai' | 'google' | 'ollama' | 'custom';

const PROVIDERS: { id: ProviderId; name: string; needsKey: boolean; needsUrl: boolean; defaultUrl?: string; models: string[] }[] = [
  { id: 'anthropic', name: 'Anthropic (Claude)', needsKey: true, needsUrl: false, models: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001', 'claude-opus-4-20250514'] },
  { id: 'openai', name: 'OpenAI', needsKey: true, needsUrl: false, models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] },
  { id: 'google', name: 'Google (Gemini)', needsKey: true, needsUrl: false, models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'] },
  { id: 'ollama', name: 'Ollama (Local)', needsKey: false, needsUrl: true, defaultUrl: 'http://localhost:11434', models: ['llama3.1', 'mistral', 'codellama', 'gemma2'] },
  { id: 'custom', name: 'Custom (OpenAI-compatible)', needsKey: true, needsUrl: true, models: [] },
];

export default function AISetup({ onComplete, onSkip }: AISetupProps) {
  const { orgId } = useAuth();
  const db = useDb();
  const [selectedProvider, setSelectedProvider] = useState<ProviderId | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'error' | null>(null);
  const [saving, setSaving] = useState(false);

  const provider = PROVIDERS.find((p) => p.id === selectedProvider);

  const handleTest = async () => {
    if (!selectedProvider) return;
    setTesting(true);
    setTestResult(null);

    try {
      const result = await db.invoke<{ ok: boolean; error?: string }>('ai-test', {
        provider: {
          id: selectedProvider,
          apiKey: apiKey || undefined,
          baseUrl: baseUrl || provider?.defaultUrl || undefined,
          model: model || provider?.models[0] || undefined,
        },
      });

      if (result.error || !result.data?.ok) {
        setTestResult('error');
        toast.error(result.error?.message || result.data?.error || 'Connection failed');
      } else {
        setTestResult('ok');
        toast.success('AI connection verified');
      }
    } catch (err: any) {
      setTestResult('error');
      toast.error(err.message || 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!selectedProvider || !orgId) return;
    setSaving(true);

    try {
      // Read current org settings
      const orgResult = await db.queryOne<{ settings: Record<string, any> }>('organizations', {
        filters: [{ column: 'id', operator: 'eq', value: orgId }],
      });

      const currentSettings = orgResult.data?.settings || {};
      const newSettings = {
        ...currentSettings,
        ai_provider: {
          id: selectedProvider,
          apiKey: apiKey || undefined,
          baseUrl: baseUrl || provider?.defaultUrl || undefined,
          model: model || provider?.models[0] || undefined,
        },
      };

      await db.update('organizations', { id: orgId }, { settings: newSettings });
      toast.success('AI provider saved');
      onComplete();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
          <Brain className="h-5 w-5 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground">
          Connect an AI provider to enable email drafts, meeting prep, account discovery, and more.
        </p>
      </div>

      {/* Provider selection */}
      <div className="grid gap-2">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setSelectedProvider(p.id);
              setBaseUrl(p.defaultUrl || '');
              setModel(p.models[0] || '');
              setTestResult(null);
            }}
            className={`w-full p-3 rounded-lg border-2 text-left text-sm transition-colors ${
              selectedProvider === p.id
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <span className="font-medium">{p.name}</span>
          </button>
        ))}
      </div>

      {/* Config fields */}
      {provider && (
        <div className="space-y-4 pt-2">
          {provider.needsKey && (
            <div>
              <label className="block text-sm font-medium mb-1.5">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setTestResult(null); }}
                placeholder={`${provider.name} API key`}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}

          {provider.needsUrl && (
            <div>
              <label className="block text-sm font-medium mb-1.5">Base URL</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => { setBaseUrl(e.target.value); setTestResult(null); }}
                placeholder={provider.defaultUrl || 'https://api.example.com'}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1.5">Model</label>
            {provider.models.length > 0 ? (
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {provider.models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
                <option value="">Custom...</option>
              </select>
            ) : (
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="model-name"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            )}
          </div>

          {/* Test + Save buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleTest}
              disabled={testing || (provider.needsKey && !apiKey)}
              className="flex-1 py-2 rounded-md border border-input text-sm font-medium hover:bg-accent disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : testResult === 'ok' ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : testResult === 'error' ? <XCircle className="h-4 w-4 text-red-500" /> : null}
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || (provider.needsKey && !apiKey)}
              className="flex-1 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? 'Saving...' : 'Save & Continue'}
            </button>
          </div>
        </div>
      )}

      {/* Skip */}
      <button
        onClick={onSkip}
        className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        Skip for now — you can add AI later in Settings
      </button>
    </div>
  );
}
