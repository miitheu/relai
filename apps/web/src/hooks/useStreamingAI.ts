import { useState, useCallback, useRef } from 'react';
import { useSupabase } from '@/hooks/useSupabase';

export function useStreamingAI() {
  const supabase = useSupabase();
  const [content, setContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stream = useCallback(
    async (functionName: string, body: Record<string, unknown>) => {
      setIsStreaming(true);
      setContent('');
      setError(null);

      abortRef.current = new AbortController();

      try {
        const { data, error: fnError } = await supabase.functions.invoke(
          functionName,
          {
            body: { ...body, stream: true },
          },
        );

        if (fnError) throw fnError;

        // If the response is already text (non-streaming fallback)
        if (typeof data === 'string') {
          setContent(data);
          return data;
        }

        // If we get a JSON response instead of stream
        if (data && typeof data === 'object') {
          const text =
            data.choices?.[0]?.message?.content ||
            JSON.stringify(data, null, 2);
          setContent(text);
          return text;
        }

        return content;
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          setError(e.message || 'Streaming failed');
        }
        return null;
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  return { content, isStreaming, error, stream, abort };
}
