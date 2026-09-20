export type ModelExecutionWindow = {
  allowed: boolean;
  timezone: string;
  localHour: number | null;
  startHour: number;
  endHour: number;
  reason: "within_window" | "outside_window" | "disabled" | "invalid_timezone";
};

/**
 * Controls when requests that can incur a model-provider charge may leave this
 * service. It is evaluated inside the worker path, so manual ticks and crash
 * recovery cannot bypass the schedule.
 */
export function modelExecutionWindow(now = new Date()): ModelExecutionWindow {
  const timezone = String(process.env.PRODUCT_MODEL_EXECUTION_TIMEZONE || "Asia/Shanghai").trim() || "Asia/Shanghai";
  const startHour = configuredHour("PRODUCT_MODEL_EXECUTION_START_HOUR", 0);
  const endHour = configuredHour("PRODUCT_MODEL_EXECUTION_END_HOUR", 6);
  if (String(process.env.PRODUCT_MODEL_EXECUTION_WINDOW_ENABLED || "true").toLowerCase() === "false") {
    return { allowed: true, timezone, localHour: null, startHour, endHour, reason: "disabled" };
  }
  try {
    const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" })
      .formatToParts(now).find((part) => part.type === "hour")?.value);
    const allowed = inWindow(hour, startHour, endHour);
    return { allowed, timezone, localHour: hour, startHour, endHour, reason: allowed ? "within_window" : "outside_window" };
  } catch {
    // A malformed timezone must fail closed: an unexpected billable request is
    // worse than deferring queued model work.
    return { allowed: false, timezone, localHour: null, startHour, endHour, reason: "invalid_timezone" };
  }
}

function configuredHour(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= 0 && value <= 23 ? value : fallback;
}

function inWindow(hour: number, startHour: number, endHour: number) {
  if (startHour === endHour) return false;
  return startHour < endHour ? hour >= startHour && hour < endHour : hour >= startHour || hour < endHour;
}
