// oracle: Ascend's own answer to X's Grok -- a wise advisor built into the
// realm, ask it anything. One action ("ask"), rate-limited per subject per
// day (server-enforced, same cooldown-field pattern as everything else in
// this app) so one enthusiastic peasant cannot spend the whole realm's AI
// budget alone. Conversation history is NOT persisted server-side: the
// client keeps it for the session, the Oracle just needs the last few turns
// to stay coherent.

import { createClientFromRequest } from "npm:@base44/sdk";
import { findSubjectByEmail, jsonResponse as json } from "../../shared/renown.ts";

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

      const prompt =
        `You are the Oracle of Ascend, a wise, warm, faintly mystical advisor built into a medieval-fantasy ` +
        `social kingdom app. Speak briefly (2-4 sentences), with a touch of old-world flavour, but stay ` +
        `genuinely clear and useful -- never let the voice get in the way of the answer. ` +
        `You are speaking with ${me.handle}, currently ranked ${me.rank} of the realm. ` +
        `Kingdom terms, use them naturally when relevant: Tiding = a post, Cheer = a like, Reply = a comment, ` +
        `Raven/Rookery = direct messages (rank-gated: reaching up needs an Audience, reaching down costs a ` +
        `Summons), Crest = a profile, Renown = points (yours alone to see), the rank ladder is ` +
        `Peasant -> Freeman -> Knight -> Noble -> Monarch, the Monarch is crowned weekly by whoever earns the ` +
        `most Renown that week and can issue a Decree, Champion/Proclaim/Bounty are Knight/Noble powers. ` +
        `If asked something with no real answer (idle chat, riddles, general knowledge), just answer normally ` +
        `in character -- you are not limited to only talking about the app.` +
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
