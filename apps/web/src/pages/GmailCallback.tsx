import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useExchangeGmailCode } from '@/hooks/useGmailIntegration';
import { Loader2, Check, X } from 'lucide-react';

export default function GmailCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const exchangeCode = useExchangeGmailCode();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      setStatus('error');
      setErrorMsg(error === 'access_denied' ? 'Access denied. You cancelled the authorization.' : error);
      return;
    }

    if (!code) {
      setStatus('error');
      setErrorMsg('No authorization code received.');
      return;
    }

    exchangeCode.mutate({ code, state }, {
      onSuccess: () => {
        setStatus('success');
        setTimeout(() => navigate('/integrations'), 2000);
      },
      onError: (err: any) => {
        setStatus('error');
        setErrorMsg(err.message || 'Failed to connect Gmail.');
      },
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        {status === 'processing' && (
          <>
            <Loader2 size={32} className="animate-spin text-primary mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-1">Connecting Gmail...</h2>
            <p className="text-sm text-muted-foreground">Please wait while we complete the authorization.</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
              <Check size={24} className="text-success" />
            </div>
            <h2 className="text-lg font-semibold mb-1">Gmail Connected!</h2>
            <p className="text-sm text-muted-foreground">Redirecting to integrations...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <X size={24} className="text-destructive" />
            </div>
            <h2 className="text-lg font-semibold mb-1">Connection Failed</h2>
            <p className="text-sm text-muted-foreground mb-4">{errorMsg}</p>
            <button
              onClick={() => navigate('/integrations')}
              className="text-sm text-primary hover:underline"
            >
              Back to Integrations
            </button>
          </>
        )}
      </div>
    </div>
  );
}
