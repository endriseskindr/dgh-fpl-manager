const starts = new Map<string, number>();

export function perfStart(label: string): void {
  if (!__DEV__) return;
  starts.set(label, Date.now());
  console.log(`[DGH-PERF] START ${label}`);
}

export function perfMark(label: string): void {
  if (!__DEV__) return;
  console.log(`[DGH-PERF] MARK ${label}`);
}

export function perfEnd(label: string): void {
  if (!__DEV__) return;
  const started = starts.get(label);
  const elapsed = started == null ? null : Date.now() - started;
  starts.delete(label);
  console.log(`[DGH-PERF] END ${label}${elapsed == null ? "" : ` ${elapsed}ms`}`);
}
