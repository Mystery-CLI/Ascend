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

const REIGN_MS = 7 * 24 * 60 * 60 * 1000; // a reign lasts 7 real days from crowning

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
    const allSubjects = await svc.entities.Subject.list("", 1000);
    // The AI populace never competes for standing or the crown, only real
    // subjects do. Filtered out here, once, so nothing downstream can leak them.
    const subjects = allSubjects.filter((s) => !s.is_ai);

    // Rank the realm by this week's renown; total renown breaks ties.
    const ranked = [...subjects].sort((a, b) => {
      const w = effectiveWeekRenown(b) - effectiveWeekRenown(a);
      return w !== 0 ? w : (b.renown || 0) - (a.renown || 0);
    });

    const wk = weekKey();
    const crowns = await svc.entities.Crown.list("", 1);
    let crown = crowns[0] || null;

    // An AI citizen may already hold the crown from before this filter existed.
    // Treat that the same as no monarch at all, so the realm self-heals now
    // instead of waiting for the reign to end.
    const monarchIsAi = !!crown?.monarch_id && !!allSubjects.find((s) => s.id === crown.monarch_id)?.is_ai;

    // Re-crown once the CURRENT reign's own 7 days are up, not when some
    // unrelated global week boundary ticks over. reign_ends_at is set below,
    // always 7 real days from the moment someone was actually crowned.
    const reignExpired = !!crown?.reign_ends_at && Date.now() >= new Date(crown.reign_ends_at).getTime();
    const needCrown = !crown || !crown.monarch_id || monarchIsAi || reignExpired;
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
          reign_ends_at: new Date(Date.now() + REIGN_MS).toISOString(),
          week_key: wk,
        };
        crown = crown
          ? { ...crown, ...(await svc.entities.Crown.update(crown.id, fields)) }
          : await svc.entities.Crown.create(fields);
        // update() may return only the patch; keep our merged view consistent
        crown = { ...crown, ...fields };
      }
    }

    const monarchId = crown?.monarch_id;

    // The reigning monarch holds position 1 for the whole reign, no matter how
    // weekly renown shifts among everyone else in the meantime. Re-sorting
    // `ranked` by live renown would let a challenger displace them early, and
    // the crown only changes hands when the week turns over above.
    const standing = monarchId
      ? [...ranked.filter((s) => s.id === monarchId), ...ranked.filter((s) => s.id !== monarchId)]
      : ranked;

    const me = user ? await findSubjectByEmail(svc, user.email) : null;
    const myPosition = me ? standing.findIndex((s) => s.id === me.id) + 1 : 0;

    // The standings list itself excludes the monarch: they are already shown,
    // permanently on top, in their own Throne card above this list. Public
    // display stops at 50 regardless of how many real subjects the realm has;
    // everyone still gets their own private position via my_position below,
    // whether they're in this list or not.
    const leaderboard = standing
      .filter((s) => s.id !== monarchId)
      .slice(0, 50)
      .map((s, i) => ({
        position: monarchId ? i + 2 : i + 1,
        subject_id: s.id,
        handle: s.handle,
        rank: s.rank,
      }));

    const nobles = ranked
      .filter((s) => s.rank === "noble" && s.id !== monarchId)
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
      // A Decree from before this fix has text but no decree_id, so it cannot
      // be verified. Treat it as no Decree rather than show one Heed can never
      // pay out on.
      decree:
        crown?.decree && crown.decree_id && crown.decree_day
          ? { text: crown.decree, day: crown.decree_day }
          : null,
      leaderboard,
      nobles,
      my_position: myPosition,
      total_subjects: subjects.length,
    });
  } catch (err) {
    return json({ error: (err as Error)?.message || "The throne stands empty." }, 500);
  }
});
