import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/supabase/database.types";

type Level = "info" | "warn" | "error";

/** Log do radar (radar_logs), fire-and-forget: nunca derruba quem chamou. */
export async function logEvent(level: Level, message: string, meta?: Record<string, unknown>) {
  try {
    await createServiceClient()
      .from("radar_logs")
      .insert({ level, message, meta: (meta ?? null) as Json });
  } catch {
    console.error(`[${level}] ${message}`, meta);
  }
}
