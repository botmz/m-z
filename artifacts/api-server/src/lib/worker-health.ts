export const WORKER_HEARTBEAT_STALE_AFTER_MS = 90_000;

export type WorkerHeartbeat = {
  status: string;
  detail: string;
  checkedAt: string | null;
};

export function resolveWorkerHealth(
  heartbeat: WorkerHeartbeat | null,
  enabled: boolean,
  now = Date.now(),
): WorkerHeartbeat {
  if (!enabled) {
    return heartbeat?.status === "paused"
      ? heartbeat
      : { status: "stopped", detail: "عامل المعالجة متوقف", checkedAt: heartbeat?.checkedAt ?? null };
  }

  const checkedAt = heartbeat?.checkedAt ? Date.parse(heartbeat.checkedAt) : Number.NaN;
  if (!heartbeat || !Number.isFinite(checkedAt) || now - checkedAt > WORKER_HEARTBEAT_STALE_AFTER_MS) {
    return {
      status: "stale",
      detail: heartbeat?.checkedAt
        ? "نبضة عامل المعالجة قديمة؛ يُرجى التحقق من الخدمة"
        : "لم تُسجل نبضة لعامل المعالجة؛ يُرجى التحقق من الخدمة",
      checkedAt: heartbeat?.checkedAt ?? null,
    };
  }

  return heartbeat;
}
