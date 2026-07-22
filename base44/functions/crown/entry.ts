// crown: keeps the throne occupied and returns the state of the realm.
//
// There is no scheduler on the platform, so the Crown is disciplined lazily:
// whenever someone opens the Throne Room, this runs, and if the week has turned
// it re-crowns whoever now tops the weekly renown race, demoting the old ruler
// back to the rank their renown earns. Otherwise it just reports the current
// reign, the standings, and the caller's own position.
//
// Standings are returned as an ORDER, handles and ranks only, never raw renown,
// so a subject's exact score stays private while the hierarchy stays public.

import { createClientFromRequest } from "npm:@base44/sdk";
import {
  rankForRenown,
  weekKey,
  effectiveWeekRenown,
  findSubjectByEmail,
  jsonResponse as json,
} from "../../shared/renown.ts";

function reignEnd(wk: number): string {
  return new Date((wk + 1) * 7 * 86400000).toISOString();
}

Deno.serve(async (req) => {
  let base44;
  try {
    base44 = createClientFromRequest(req);
  } catch {
    return json({ error: "Could not read the request." }, 400);
  }
  const svc = base44.asServiceRole;
  const user = await base44.auth.me().catch(() => null);

  try {
    const subjects = await svc.entities.Subject.list("", 1000);
    // Rank the realm by this week's renown; total renown breaks ties.
    const ranked = [...subjects].sort((a, b) => {
      const w = effectiveWeekRenown(b) - effectiveWeekRenown(a);
      return w !== 0 ? w : (b.renown || 0) - (a.renown || 0);
    });

    const wk = weekKey();
    const crowns = await svc.entities.Crown.list("", 1);
    let crown = crowns[0] || null;

    // Re-crown if the week has turned (or no one reigns yet).
    const needCrown = !crown || crown.week_key !== wk || !crown.monarch_id;
    if (needCrown) {
      const leader = ranked.find((s) => effectiveWeekRenown(s) > 0) || ranked[0];

      // Demote the previous monarch to the rank their renown earns.
      if (crown?.monarch_id && crown.monarch_id !== leader?.id) {
        const old = subjects.find((s) => s.id === crown.monarch_id);
        if (old && old.rank === "monarch") {
          await svc.entities.Subject.update(old.id, { rank: rankForRenown(old.renown || 0) });
        }
      }

      if (leader) {
        if (leader.rank !== "monarch") {
          await svc.entities.Subject.update(leader.id, { rank: "monarch" });
        }
        const fields = {
          monarch_id: leader.id,
          monarch_handle: leader.handle,
          crowned_at: new Date().toISOString(),
          reign_ends_at: reignEnd(wk),
          week_key: wk,
        };
        crown = crown
          ? { ...crown, ...(await svc.entities.Crown.update(crown.id, fields)) }
          : await svc.entities.Crown.create(fields);
        // update() may return only the patch; keep our merged view consistent
        crown = { ...crown, ...fields };
      }
    }

    const me = user ? await findSubjectByEmail(svc, user.email) : null;
    const myPosition = me ? ranked.findIndex((s) => s.id === me.id) + 1 : 0;

    const monarchId = crown?.monarch_id;
    const leaderboard = ranked.slice(0, 12).map((s, i) => ({
      position: i + 1,
      subject_id: s.id,
      handle: s.handle,
      // Reflect the just-crowned monarch even though `ranked` predates the update.
      rank: s.id === monarchId ? "monarch" : s.rank,
      is_ai: !!s.is_ai,
    }));

    const nobles = ranked
      .filter((s) => s.rank === "noble")
      .slice(0, 6)
      .map((s) => ({ subject_id: s.id, handle: s.handle }));

    return json({
      monarch: crown?.monarch_id
        ? {
            subject_id: crown.monarch_id,
            handle: crown.monarch_handle,
            crowned_at: crown.crowned_at,
            reign_ends_at: crown.reign_ends_at,
          }
        : null,
      decree: crown?.decree && crown.decree_day ? { text: crown.decree, day: crown.decree_day } : null,
      leaderboard,
      nobles,
      my_position: myPosition,
      total_subjects: subjects.length,
    });
  } catch (err) {
    return json({ error: (err as Error)?.message || "The throne stands empty." }, 500);
  }
});
