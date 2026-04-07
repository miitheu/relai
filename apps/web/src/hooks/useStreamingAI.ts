import { useState, useCallback, useRef } from 'react';
import { useDb } from '@relai/db/react';

export function useStreamingAI() {
  const db = useDb();
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
        const { data, error: fnError } = await db.invoke(
          functionName,
          { ...body, stream: true },
        );

        if (fnError) throw fnError;

        if (typeof data === 'string') {
          setContent(data);
          return data;
        }

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
