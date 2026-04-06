// Pure utility — no React hooks here
export function isKeySnoozed(
  dismissals: { action_key: string; dismissed_until: string }[] | undefined,
  key: string
): boolean {
  if (!dismissals) return false;
  const match = dismissals.find(d => d.action_key === key);
  if (!match) return false;
  return new Date(match.dismissed_until) > new Date();
}
