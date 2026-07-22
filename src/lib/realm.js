import { base44 } from "@/api/base44Client";

/**
 * Call the realm engine.
 *
 * Every renown- or rank-changing act goes through the one backend function, so
 * this thin wrapper is the only way the client asks for those changes. It never
 * writes renown or rank directly, it cannot: the entity's field rules forbid it.
 *
 * invoke() returns the raw axios response (JSON lives on .data) and throws on a
 * non-2xx, with the error body on err.response.data. We unwrap both here so
 * callers get a clean value or a clean Error.
 */
export async function realm(action, data = {}) {
  try {
    const res = await base44.functions.invoke("realm", { action, ...data });
    return res.data;
  } catch (err) {
    const message = err?.response?.data?.error || err?.message || "The realm did not answer.";
    throw new Error(message);
  }
}

/**
 * Nudge the AI populace to react to recent real posts. Fire-and-forget: it is a
 * flourish, not a guarantee, and the server throttles it, so a failure or a
 * "resting" no-op is nothing to surface to the user.
 */
export async function pulse() {
  try {
    const res = await base44.functions.invoke("citizens", { action: "pulse" });
    return res.data;
  } catch {
    return { acted: false };
  }
}
