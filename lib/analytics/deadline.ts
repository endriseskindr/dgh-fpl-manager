/** Human-readable FPL deadline countdown. Uses the device clock at render time. */
export function getDeadlineCountdown(deadlineTimeISO: string, now = Date.now()): string {
  const ms = new Date(deadlineTimeISO).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return "DEADLINE PASSED";
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function isDeadlineUrgent(deadlineTimeISO: string, now = Date.now()): boolean {
  const ms = new Date(deadlineTimeISO).getTime() - now;
  return ms > 0 && ms <= 60 * 60 * 1000;
}
