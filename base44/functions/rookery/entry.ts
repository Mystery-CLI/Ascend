// rookery: the rank-gated ravens of the realm.
//
// This is the sharp mechanic of Ascend: who may speak to whom is decided by
// standing, and the whole thing reduces to one rule about a "pending"
// conversation, whichever direction it was opened from.
//
//   Same rank            -> speak freely (an open thread from the first word).
//   Reaching UP           -> an Audience request. A pending thread. The lower
//                            party cannot send again until the higher answers.
//   Reaching DOWN         -> a Summons. A pending thread that costs a token, and
//                            the higher party may send only as many as their
//                            rank's daily allowance until the lower replies.
//   The non-initiator's
//   first message         -> OPENS the thread. Accepting an Audience and replying
//                            to a Summons are the same act. Thereafter, free.
//   The Monarch           -> unlimited, every thread opens at once.
//
// Messages and conversations are created here under service-role authority and
// nowhere else, so the gate cannot be walked around with a crafted request.

import { createClientFromRequest } from "npm:@base44/sdk";
import { rankOrder, findSubjectByEmail, jsonResponse as json } from "../../shared/renown.ts";

// Daily downward-raven allowance by rank. The Monarch is boundless.
const SUMMONS_BUDGET: Record<string, number> = {
  peasant: 0,
  freeman: 2,
  knight: 4,
  noble: 10,
  monarch: Infinity,
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function preview(body: string) {
  return body.slice(0, 80);
}

async function budgetRemaining(svc: any, me: any) {
  const budget = SUMMONS_BUDGET[me.rank] ?? 0;
  if (budget === Infinity) return Infinity;
  const used = me.summons_date === today() ? me.summons_used || 0 : 0;
  return Math.max(0, budget - used);
}

async function spendSummons(svc: any, me: any) {
  if ((SUMMONS_BUDGET[me.rank] ?? 0) === Infinity) return; // Monarch pays nothing
  const isToday = me.summons_date === today();
  const used = (isToday ? me.summons_used || 0 : 0) + 1;
  await svc.entities.Subject.update(me.id, { summons_used: used, summons_date: today() });
  me.summons_used = used;
  me.summons_date = today();
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

  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Malformed petition." }, 400);
  }

  if (payload.action !== "send") return json({ error: "Unknown rookery action." }, 400);

  const body = (payload.body || "").toString().trim();
  if (!body) return json({ error: "A raven carries no empty scroll." }, 400);
  if (body.length > 1000) return json({ error: "That message is too long." }, 400);

  try {
    const me = await findSubjectByEmail(svc, user.email);
    if (!me) return json({ error: "Enter the realm first." }, 400);

    const target = await svc.entities.Subject.get(payload.target_subject_id);
    if (!target) return json({ error: "No such subject." }, 404);
    if (target.id === me.id) return json({ error: "You cannot send a raven to yourself." }, 400);

    // Canonical pair ordering, so one thread exists per pair.
    const [a, b] = me.id < target.id ? [me, target] : [target, me];
    const found = await svc.entities.Conversation.filter({ a_id: a.id, b_id: b.id });
    let conv = found[0] || null;

    const rel = rankOrder(me.rank) - rankOrder(target.rank); // >0 higher, <0 lower, 0 equal
    const iAmMonarch = me.rank === "monarch";

    const sendInto = async (conversationId: string) => {
      await svc.entities.Message.create({
        conversation_id: conversationId,
        from_id: me.id,
        from_email: me.user_email,
        from_handle: me.handle,
        to_email: target.user_email,
        body,
      });
      await svc.entities.Conversation.update(conversationId, {
        last_message_at: new Date().toISOString(),
        last_preview: preview(body),
        last_sender_id: me.id,
      });
    };

    const createConv = async (status: string) => {
      return await svc.entities.Conversation.create({
        a_id: a.id, a_email: a.user_email, a_handle: a.handle,
        b_id: b.id, b_email: b.user_email, b_handle: b.handle,
        status,
        initiator_id: me.id,
      });
    };

    /* -- an existing thread ------------------------------------------------ */
    if (conv) {
      if (conv.status === "open") {
        await sendInto(conv.id);
        return json({ ok: true, conversation_id: conv.id, status: "open" });
      }
      // pending
      if (conv.initiator_id === me.id) {
        if (rel > 0 && !iAmMonarch) {
          // A Summons still awaiting reply: each further raven costs a token.
          if ((await budgetRemaining(svc, me)) <= 0) {
            return json({ error: "You have sent all your ravens for today." }, 429);
          }
          await spendSummons(svc, me);
          await sendInto(conv.id);
          return json({ ok: true, conversation_id: conv.id, status: "pending" });
        }
        // An Audience request awaiting acceptance: one only.
        return json(
          { error: "Your request awaits their answer. You cannot send again until they reply." },
          403
        );
      }
      // I am the non-initiator: my message OPENS the thread (accept / reply).
      await svc.entities.Conversation.update(conv.id, { status: "open" });
      await sendInto(conv.id);
      return json({ ok: true, conversation_id: conv.id, status: "open", opened: true });
    }

    /* -- a new thread ------------------------------------------------------ */
    if (rel === 0 || iAmMonarch) {
      conv = await createConv("open");
      await sendInto(conv.id);
      return json({ ok: true, conversation_id: conv.id, status: "open" });
    }

    if (rel > 0) {
      // Summon downward: costs a token.
      if ((await budgetRemaining(svc, me)) <= 0) {
        return json({ error: "You have sent all your ravens for today." }, 429);
      }
      await spendSummons(svc, me);
      conv = await createConv("pending");
      await sendInto(conv.id);
      return json({ ok: true, conversation_id: conv.id, status: "pending", kind: "summons" });
    }

    // Reach upward: an Audience request, free but awaiting their grace.
    conv = await createConv("pending");
    await sendInto(conv.id);
    return json({ ok: true, conversation_id: conv.id, status: "pending", kind: "audience" });
  } catch (err) {
    return json({ error: (err as Error)?.message || "The rookery faltered." }, 500);
  }
});
