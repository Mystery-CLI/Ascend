// realm: the one hand that moves renown, rank, and the powers of the ranks.
//
// Every act that changes standing, entering, posting, cheering, replying, and
// now the rank powers (Champion, Proclaim, Bounty), passes through here with
// service-role authority. The client may ask, but can never write renown, rank,
// or a power-flag itself: the entity's field rules forbid it, and the rank
// checks below forbid a peasant from wielding a Knight's power. That is the
// integrity story of Ascend, standing and its privileges are earned through the
// server, not typed into a request.

import { createClientFromRequest } from "npm:@base44/sdk";
import {
  RENOWN,
  rankOrder,
  adjustRenown,
  findSubjectByEmail,
  jsonResponse as json,
} from "../../shared/renown.ts";

const CHAMPION_HOURS = 6; // how long a Championed tiding stays lifted
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // one use of a power per day
const HEED_BONUS = 10; // renown for heeding the King's Decree, once a day

function offCooldown(lastIso: string | undefined) {
  if (!lastIso) return true;
  return Date.now() - new Date(lastIso).getTime() >= COOLDOWN_MS;
}

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

  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Malformed petition." }, 400);
  }

  const action = payload.action;

  try {
    // -- enter: mint a Subject on first arrival, or return the existing one ---
    if (action === "enter") {
      let subject = await findSubjectByEmail(svc, user.email);
      if (!subject) {
        const handleSeed = (user.full_name || user.email.split("@")[0] || "Wanderer")
          .toString()
          .slice(0, 24);
        subject = await svc.entities.Subject.create({
          user_email: user.email,
          handle: handleSeed,
          avatar_url: "",
          bio: "",
          rank: "peasant",
          renown: 0,
          summons_tokens: 0,
          is_ai: false,
        });
      }
      return json({ subject });
    }

    // All remaining actions require the caller to already be a subject.
    const me = await findSubjectByEmail(svc, user.email);
    if (!me) return json({ error: "Enter the realm first." }, 400);

    // -- post ----------------------------------------------------------------
    if (action === "post") {
      const body = (payload.body || "").toString().trim();
      const media = Array.isArray(payload.media)
        ? payload.media.filter((u: unknown) => typeof u === "string").slice(0, 4)
        : [];
      const media_kind = payload.media_kind === "video" ? "video" : media.length ? "image" : undefined;

      // A poll: 2 to 4 non-empty options. A poll tiding carries no media.
      const pollOptions = Array.isArray(payload.poll_options)
        ? payload.poll_options.map((o: unknown) => (o || "").toString().trim()).filter(Boolean).slice(0, 4)
        : [];
      const isPoll = pollOptions.length >= 2;

      // A tiding needs words, media, or a poll, but not none of them.
      if (!body && media.length === 0 && !isPoll) {
        return json({ error: "A tiding cannot be empty." }, 400);
      }
      if (body.length > 600) return json({ error: "That tiding is too long." }, 400);

      const record: Record<string, unknown> = {
        author_subject_id: me.id,
        author_email: user.email,
        author_handle: me.handle,
        body,
        cheers_count: 0,
        replies_count: 0,
        proclaimed: false,
      };
      if (isPoll) {
        const hours = Math.min(168, Math.max(1, Number(payload.poll_hours) || 24));
        record.poll_options = pollOptions;
        record.poll_votes = pollOptions.map(() => 0);
        record.poll_closes_at = new Date(Date.now() + hours * 3600 * 1000).toISOString();
      } else if (media.length) {
        record.media = media;
        record.media_kind = media_kind;
        if (media_kind === "video" && typeof payload.media_poster === "string") {
          record.media_poster = payload.media_poster;
        }
      }

      const tiding = await svc.entities.Tiding.create(record);
      const updated = await adjustRenown(svc, me.id, RENOWN.post);
      return json({ tiding, renown: updated?.renown, rank: updated?.rank });
    }

    // -- cheer ---------------------------------------------------------------
    if (action === "cheer") {
      const tidingId = payload.tiding_id;
      if (!tidingId) return json({ error: "Which tiding?" }, 400);
      const tiding = await svc.entities.Tiding.get(tidingId);
      if (!tiding) return json({ error: "No such tiding." }, 404);

      const existing = await svc.entities.Cheer.filter({
        tiding_id: tidingId,
        subject_id: me.id,
      });

      if (existing.length > 0) {
        await svc.entities.Cheer.delete(existing[0].id);
        await svc.entities.Tiding.update(tidingId, {
          cheers_count: Math.max(0, (tiding.cheers_count || 0) - 1),
        });
        if (tiding.author_subject_id && tiding.author_subject_id !== me.id) {
          await adjustRenown(svc, tiding.author_subject_id, -RENOWN.cheerReceived);
        }
        const meAfter = await adjustRenown(svc, me.id, -RENOWN.cheerGiven);
        return json({ cheered: false, renown: meAfter?.renown, rank: meAfter?.rank });
      }

      await svc.entities.Cheer.create({
        tiding_id: tidingId,
        subject_id: me.id,
        user_email: user.email,
      });
      await svc.entities.Tiding.update(tidingId, {
        cheers_count: (tiding.cheers_count || 0) + 1,
      });
      if (tiding.author_subject_id && tiding.author_subject_id !== me.id) {
        await adjustRenown(svc, tiding.author_subject_id, RENOWN.cheerReceived);
      }
      const meAfter = await adjustRenown(svc, me.id, RENOWN.cheerGiven);
      return json({ cheered: true, renown: meAfter?.renown, rank: meAfter?.rank });
    }

    // -- reply ---------------------------------------------------------------
    if (action === "reply") {
      const tidingId = payload.tiding_id;
      const body = (payload.body || "").toString().trim();
      if (!tidingId || !body) return json({ error: "A reply needs words." }, 400);
      if (body.length > 400) return json({ error: "That reply is too long." }, 400);

      const tiding = await svc.entities.Tiding.get(tidingId);
      if (!tiding) return json({ error: "No such tiding." }, 404);

      const reply = await svc.entities.Reply.create({
        tiding_id: tidingId,
        author_subject_id: me.id,
        author_email: user.email,
        author_handle: me.handle,
        body,
      });
      await svc.entities.Tiding.update(tidingId, {
        replies_count: (tiding.replies_count || 0) + 1,
      });
      if (tiding.author_subject_id && tiding.author_subject_id !== me.id) {
        await adjustRenown(svc, tiding.author_subject_id, RENOWN.replyReceived);
      }
      const meAfter = await adjustRenown(svc, me.id, RENOWN.replyGiven);
      return json({ reply, renown: meAfter?.renown, rank: meAfter?.rank });
    }

    // -- vote: cast a ballot on a poll ---------------------------------------
    if (action === "vote") {
      const tiding = await svc.entities.Tiding.get(payload.tiding_id);
      if (!tiding || !(tiding.poll_options?.length >= 2)) {
        return json({ error: "No such poll." }, 404);
      }
      if (tiding.poll_closes_at && Date.now() > new Date(tiding.poll_closes_at).getTime()) {
        return json({ error: "This poll has closed." }, 400);
      }
      const idx = Number(payload.option_index);
      if (!(idx >= 0 && idx < tiding.poll_options.length)) {
        return json({ error: "No such option." }, 400);
      }

      const already = await svc.entities.Vote.filter({ tiding_id: tiding.id, subject_id: me.id });
      if (already.length > 0) {
        return json({ already: true, option_index: already[0].option_index });
      }

      await svc.entities.Vote.create({
        tiding_id: tiding.id,
        subject_id: me.id,
        user_email: user.email,
        option_index: idx,
      });
      const votes = Array.isArray(tiding.poll_votes)
        ? [...tiding.poll_votes]
        : tiding.poll_options.map(() => 0);
      votes[idx] = (votes[idx] || 0) + 1;
      await svc.entities.Tiding.update(tiding.id, { poll_votes: votes });

      if (tiding.author_subject_id && tiding.author_subject_id !== me.id) {
        await adjustRenown(svc, tiding.author_subject_id, RENOWN.voteReceived);
      }
      const meAfter = await adjustRenown(svc, me.id, RENOWN.voteGiven);
      return json({ voted: true, option_index: idx, poll_votes: votes, renown: meAfter?.renown, rank: meAfter?.rank });
    }

    // -- champion: a Knight's power to lift a tiding to the top --------------
    if (action === "champion") {
      if (rankOrder(me.rank) < rankOrder("knight")) {
        return json({ error: "Only a Knight or higher may Champion a tiding." }, 403);
      }
      if (!offCooldown(me.last_champion_at)) {
        return json({ error: "You have already Championed a tiding today." }, 429);
      }
      const tiding = await svc.entities.Tiding.get(payload.tiding_id);
      if (!tiding) return json({ error: "No such tiding." }, 404);

      const until = new Date(Date.now() + CHAMPION_HOURS * 3600 * 1000).toISOString();
      await svc.entities.Tiding.update(tiding.id, { championed_until: until });
      await svc.entities.Subject.update(me.id, { last_champion_at: new Date().toISOString() });
      return json({ championed_until: until });
    }

    // -- proclaim: a Noble's power to pin a tiding kingdom-wide --------------
    if (action === "proclaim") {
      if (rankOrder(me.rank) < rankOrder("noble")) {
        return json({ error: "Only a Noble or the Monarch may issue a Proclamation." }, 403);
      }
      if (!offCooldown(me.last_proclaim_at)) {
        return json({ error: "You have already Proclaimed today." }, 429);
      }
      const tiding = await svc.entities.Tiding.get(payload.tiding_id);
      if (!tiding) return json({ error: "No such tiding." }, 404);

      await svc.entities.Tiding.update(tiding.id, { proclaimed: true });
      await svc.entities.Subject.update(me.id, { last_proclaim_at: new Date().toISOString() });
      return json({ proclaimed: true });
    }

    // -- bounty: a Noble's power to reward a commoner with renown -----------
    if (action === "bounty") {
      if (rankOrder(me.rank) < rankOrder("noble")) {
        return json({ error: "Only a Noble or the Monarch may grant a Bounty." }, 403);
      }
      if (!offCooldown(me.last_bounty_at)) {
        return json({ error: "You have already granted a Bounty today." }, 429);
      }
      const target = await svc.entities.Subject.get(payload.subject_id);
      if (!target) return json({ error: "No such subject." }, 404);
      if (target.id === me.id) return json({ error: "You cannot reward yourself." }, 400);
      if (rankOrder(target.rank) >= rankOrder("knight")) {
        return json({ error: "A Bounty is for commoners, not for peers." }, 400);
      }

      const amount =
        RENOWN.bountyMin + Math.floor(Math.random() * (RENOWN.bountyMax - RENOWN.bountyMin + 1));
      const after = await adjustRenown(svc, target.id, amount);
      await svc.entities.Subject.update(me.id, { last_bounty_at: new Date().toISOString() });
      return json({ granted: amount, target_rank: after?.rank });
    }

    // -- decree: the Monarch sets a task for the whole realm -----------------
    if (action === "decree") {
      if (me.rank !== "monarch") {
        return json({ error: "Only the Monarch may issue a Decree." }, 403);
      }
      const text = (payload.text || "").toString().trim().slice(0, 140);
      if (!text) return json({ error: "A Decree needs words." }, 400);
      const crowns = await svc.entities.Crown.list("", 1);
      if (crowns[0]) {
        await svc.entities.Crown.update(crowns[0].id, { decree: text, decree_day: todayStr() });
      } else {
        await svc.entities.Crown.create({ decree: text, decree_day: todayStr() });
      }
      return json({ ok: true, decree: text });
    }

    // -- heed: any subject answers the Decree for a daily bonus --------------
    if (action === "heed") {
      const crowns = await svc.entities.Crown.list("", 1);
      const crown = crowns[0];
      if (!crown?.decree || crown.decree_day !== todayStr()) {
        return json({ error: "No Decree stands today." }, 400);
      }
      if (me.heeded_day === todayStr()) {
        return json({ already: true, error: "You have already heeded today's Decree." }, 400);
      }
      const after = await adjustRenown(svc, me.id, HEED_BONUS);
      await svc.entities.Subject.update(me.id, { heeded_day: todayStr() });
      return json({ ok: true, bonus: HEED_BONUS, renown: after?.renown, rank: after?.rank });
    }

    return json({ error: `Unknown decree: ${action}` }, 400);
  } catch (err) {
    return json({ error: (err as Error)?.message || "The realm faltered." }, 500);
  }
});
