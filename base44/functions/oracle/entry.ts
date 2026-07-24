// oracle: Ascend's own answer to X's Grok -- a wise advisor built into the
// realm, ask it anything. One action ("ask"), rate-limited per subject per
// day (server-enforced, same cooldown-field pattern as everything else in
// this app) so one enthusiastic peasant cannot spend the whole realm's AI
// budget alone. Conversation history is NOT persisted server-side: the
// client keeps it for the session, the Oracle just needs the last few turns
// to stay coherent.

import { createClientFromRequest } from "npm:@base44/sdk";
import {
  RENOWN,
  THRESHOLDS,
  findSubjectByEmail,
  jsonResponse as json,
} from "../../shared/renown.ts";

// The climbing order (Monarch excluded: it's won weekly, not earned by
// Renown). Built from the SAME THRESHOLDS array realm/entry.ts itself
// derives rank from, so if a threshold ever changes, the Oracle's numbers
// change with it automatically instead of quietly going stale.
const CLIMB_ORDER = ["peasant", "freeman", "knight", "noble"];

function thresholdFor(rank: string): number | undefined {
  return THRESHOLDS.find((t) => t.rank === rank)?.at;
}

function cap(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

const DAILY_LIMIT = 20;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  let base44;
  try {
    base44 = createClientFromRequest(req);
  } catch {
    return json({ error: "Could not read the request." }, 400);
  }

  const user = await base44.auth.me().catch(() => null);
  if (!user) return json({ error: "You must swear fealty first." }, 401);

  const svc = base44.asServiceRole;
  const ai = base44.integrations.Core;

  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Malformed petition." }, 400);
  }

  const me = await findSubjectByEmail(svc, user.email);
  if (!me) return json({ error: "Enter the realm first." }, 400);

  try {
    if (payload.action === "ask") {
      const question = (payload.message || "").toString().trim().slice(0, 500);
      if (!question) return json({ error: "Ask the Oracle something." }, 400);

      const today = todayStr();
      const used = me.oracle_day === today ? me.oracle_used || 0 : 0;
      if (used >= DAILY_LIMIT) {
        return json(
          { error: "The Oracle has spoken enough for you today. Return with the dawn." },
          429
        );
      }

      // Up to the last few turns, for context, not persisted server-side.
      const history = Array.isArray(payload.history) ? payload.history.slice(-6) : [];
      const historyText = history
        .map((h: any) => `${h.role === "user" ? me.handle : "Oracle"}: ${(h.content || "").toString().slice(0, 400)}`)
        .join("\n");

      // Live realm state, fetched fresh on every question rather than baked
      // into the prompt text, so the Oracle is never answering from a stale
      // memory of who reigns or what today's Decree is.
      const crowns = await svc.entities.Crown.list("", 1);
      const crown = crowns[0];
      let crownFact: string;
      if (crown?.monarch_handle) {
        const daysLeft = crown.reign_ends_at
          ? Math.max(0, Math.ceil((new Date(crown.reign_ends_at).getTime() - Date.now()) / 86400000))
          : null;
        crownFact = `${crown.monarch_handle} currently reigns as Monarch${daysLeft !== null ? ` (about ${daysLeft} day${daysLeft === 1 ? "" : "s"} left in the reign)` : ""}.`;
      } else {
        crownFact = "The throne is currently vacant: no real subject has earned any Renown yet this week.";
      }
      const decreeFact =
        crown?.decree && crown?.decree_day === today
          ? `Today's Decree: "${crown.decree}"`
          : "No Decree stands today.";

      // The climb, computed from the caller's ACTUAL current Renown, not a
      // generic description of the ladder.
      const climbIdx = CLIMB_ORDER.indexOf(me.rank);
      let climbFact = "";
      if (climbIdx >= 0 && climbIdx < CLIMB_ORDER.length - 1) {
        const nextRank = CLIMB_ORDER[climbIdx + 1];
        const nextAt = thresholdFor(nextRank);
        if (nextAt != null) {
          const remaining = Math.max(0, nextAt - (me.renown || 0));
          climbFact = ` They need ${remaining} more Renown to reach ${cap(nextRank)} (at ${nextAt} total).`;
        }
      }

      const thresholdFacts = THRESHOLDS.filter((t) => t.rank !== "peasant")
        .sort((a, b) => a.at - b.at)
        .map((t) => `${cap(t.rank)} at ${t.at}`)
        .join(", ");

      const prompt =
        `You are the Oracle of Ascend, a wise, warm, faintly mystical advisor built into a medieval-fantasy ` +
        `social kingdom app. Speak briefly (2-4 sentences), with a touch of old-world flavour, but stay ` +
        `genuinely clear and useful -- never let the voice get in the way of the answer, and never invent a ` +
        `number or rule that is not given to you below.\n\n` +
        `FACTS ABOUT THE REALM, treat these as ground truth, not the general internet's idea of a social app:\n` +
        `- You are speaking with ${me.handle}, currently a ${me.rank} with ${me.renown ?? 0} Renown ` +
        `(Renown is private, visible only to them).${climbFact}\n` +
        `- Rank thresholds by total Renown: ${thresholdFacts}. Monarch is not reached by Renown at all, ` +
        `it is won weekly (see below).\n` +
        `- CRITICAL, this surprises people because it is the opposite of most apps: posting a Tiding, ` +
        `replying, voting on a poll, and cheering someone ELSE's tiding all earn the ACTOR nothing. The ` +
        `ONLY two ways to earn Renown are (1) someone else cheers YOUR tiding or reply (+${RENOWN.cheerReceived}), ` +
        `or (2) heeding the Monarch's Decree once per day. Being active does not, by itself, earn Renown.\n` +
        `- ${crownFact} ${decreeFact} A Monarch's reign lasts 7 real days from the moment they were crowned.\n` +
        `- Champion (Knight or higher): lifts a tiding to the top of the Tavern for 6 hours, once per day.\n` +
        `- Proclaim (Noble or higher): pins a tiding kingdom-wide until proclaimed again, once per day.\n` +
        `- Bounty (Noble or higher): grants a random ${RENOWN.bountyMin}-${RENOWN.bountyMax} Renown to a ` +
        `Peasant of their choosing, once per day.\n` +
        `- Terms: Tiding = a post, Cheer = a like, Reply = a comment, Raven/Rookery = direct messages ` +
        `(same rank talk freely; reaching UP needs the higher rank to accept an Audience; reaching DOWN ` +
        `costs the sender a daily Summons token; the other side's first reply always opens the channel ` +
        `permanently), Crest = a profile.\n\n` +
        `If asked something with no real answer here (idle chat, riddles, general knowledge), just answer ` +
        `normally in character -- you are not limited to only talking about the app.` +
        (historyText ? `\n\nRecent conversation:\n${historyText}\n` : "\n") +
        `\n${me.handle}: ${question}\nOracle:`;

      const raw = await ai.InvokeLLM({ prompt });
      const answer = (typeof raw === "string" ? raw : raw?.toString() || "").trim().slice(0, 800);
      if (!answer) return json({ error: "The Oracle has no words. Try asking again." }, 500);

      const newUsed = used + 1;
      await svc.entities.Subject.update(me.id, { oracle_day: today, oracle_used: newUsed });

      return json({ answer, used: newUsed, limit: DAILY_LIMIT });
    }

    return json({ error: "Unknown oracle action." }, 400);
  } catch (err) {
    return json({ error: (err as Error)?.message || "The Oracle fell silent." }, 500);
  }
});
