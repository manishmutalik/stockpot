/** "Good morning, Anita": by the hour on the phone (0-23), with the first word of the owner's name when there is one. */
export function greeting(hour: number, displayName?: string | null): string {
  const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const first = displayName?.trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}
