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

// Usernames are X-style: unique, lowercase, letters/numbers/underscore only.
// The entity's own RLS makes `username` server-write-only (same treatment as
// rank/renown), so this is the only path that can ever set one -- a raw
// client-side Subject.update() cannot skip the uniqueness check below it.
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

function slugifyUsername(seed: string): string {
  const slug = (seed || "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
  return slug.length >= 3 ? slug : (slug + "citizen").slice(0, 20);
}

async function usernameTaken(svc: any, username: string, excludeId?: string): Promise<boolean> {
  const rows = await svc.entities.Subject.filter({ username });
  return rows.some((s: any) => s.id !== excludeId);
}

// Used only to mint a starting username automatically (at signup, or backfilled
// for an account that predates this feature) so no one is ever blocked from
// entering the realm waiting on a name choice. They can change it any time
// from their crest, where the live checker lives.
async function uniqueUsernameFrom(svc: any, seed: string): Promise<string> {
  const base = slugifyUsername(seed);
  let candidate = base;
  let n = 0;
  while (await usernameTaken(svc, candidate)) {
    n++;
    const suffix = String(n);
    candidate = base.slice(0, 20 - suffix.length) + suffix;
  }
  return candidate;
}

// The Decree is chosen from a fixed list, not typed freely, because each one
// maps to something the server can actually check happened. That is what
// closes the old loophole: Heed used to just be a button that paid out on
// trust. Now it pays out only once the day's real record backs it up.
const DECREES: Record<string, string> = {
  post: "Post a tiding in the Tavern today.",
  cheer3: "Cheer 3 tidings today.",
  reply: "Reply to someone in the Tavern today.",
  vote: "Vote in a poll today.",
};

async function decreeFulfilled(svc: any, me: any, decreeId: string, day: string): Promise<boolean> {
  const since = `${day}T00:00:00.000Z`;
  switch (decreeId) {
    case "post": {
      const rows = await svc.entities.Tiding.filter({ author_subject_id: me.id });
      return rows.some((t: any) => t.created_date >= since);
    }
    case "cheer3": {
      const rows = await svc.entities.Cheer.filter({ subject_id: me.id });
      return rows.filter((c: any) => c.created_date >= since).length >= 3;
    }
    case "reply": {
      const rows = await svc.entities.Reply.filter({ author_subject_id: me.id });
      return rows.some((r: any) => r.created_date >= since);
    }
    case "vote": {
      const rows = await svc.entities.Vote.filter({ subject_id: me.id });
      return rows.some((v: any) => v.created_date >= since);
    }
    default:
      return false;
  }
}

Deno.serve(async (req) => {
  let base44;
  try {
    base44 = createClientFromRequest(req);
  } catch {
    return json({ error: "Could not read the request." }, 400);
  }

  const user = await base44.auth.me().catch(() => null);
  const svc = base44.asServiceRole;

  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Malformed petition." }, 400);
  }

  const action = payload.action;

  try {
    // -- check_username: live availability check, X-style. Deliberately the
    //    ONE action that needs no session at all: a visitor checking a name
    //    on the signup form has not sworn fealty yet, there is no Base44
    //    session to check against.
    if (action === "check_username") {
      const raw = (payload.username || "").toString().trim().toLowerCase();
      if (!USERNAME_RE.test(raw)) {
        return json({
          available: false,
          reason: "3-20 characters: lowercase letters, numbers, underscore only.",
        });
      }
      const mine = user ? (await findSubjectByEmail(svc, user.email))?.username : null;
      if (raw === mine) return json({ available: true, reason: null }); // already yours, unchanged
      const taken = await usernameTaken(svc, raw);
      return json({ available: !taken, reason: taken ? "That username is already taken." : null });
    }

    if (!user) return json({ error: "You must swear fealty first." }, 401);

    // -- enter: mint a Subject on first arrival, or return the existing one ---
    if (action === "enter") {
      let subject = await findSubjectByEmail(svc, user.email);
      if (!subject) {
        const handleSeed = (user.full_name || user.email.split("@")[0] || "Wanderer")
          .toString()
          .slice(0, 24);
        // A username chosen on the signup form, if the caller sent one and it
        // is still valid and free; otherwise mint one so onboarding is never
        // blocked (they can always change it later from their crest).
        const requested = (payload.username || "").toString().trim().toLowerCase();
        const username =
          requested && USERNAME_RE.test(requested) && !(await usernameTaken(svc, requested))
            ? requested
            : await uniqueUsernameFrom(svc, user.email.split("@")[0] || handleSeed);
        subject = await svc.entities.Subject.create({
          user_email: user.email,
          handle: handleSeed,
          username,
          avatar_url: "",
          bio: "",
          rank: "peasant",
          renown: 0,
          summons_tokens: 0,
          is_ai: false,
        });
      } else if (!subject.username) {
        // Backfill: this subject predates the username field.
        const username = await uniqueUsernameFrom(svc, subject.handle || user.email.split("@")[0]);
        const patch = await svc.entities.Subject.update(subject.id, { username });
        subject = { ...subject, ...patch, username };
      }
      return json({ subject });
    }

    // All remaining actions require the caller to already be a subject.
    const me = await findSubjectByEmail(svc, user.email);
    if (!me) return json({ error: "Enter the realm first." }, 400);

    // -- set_username: the only path that may actually write it ---------------
    if (action === "set_username") {
      const raw = (payload.username || "").toString().trim().toLowerCase();
      if (!USERNAME_RE.test(raw)) {
        return json({ error: "Usernames are 3-20 characters: lowercase letters, numbers, underscore only." }, 400);
      }
      if (raw !== me.username && (await usernameTaken(svc, raw, me.id))) {
        return json({ error: "That username is already taken." }, 409);
      }
      await svc.entities.Subject.update(me.id, { username: raw });
      return json({ ok: true, username: raw });
    }

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
      // Posting earns nothing on its own: renown only comes from someone else
      // cheering it, or heeding the Monarch's Decree.
      return json({ tiding, renown: me.renown, rank: me.rank });
    }

    // -- cheer: a tiding, or a reply beneath one ------------------------------
    if (action === "cheer") {
      const tidingId = payload.tiding_id;
      const replyId = payload.reply_id;
      if (!tidingId && !replyId) return json({ error: "Which tiding?" }, 400);

      if (replyId) {
        const reply = await svc.entities.Reply.get(replyId);
        if (!reply) return json({ error: "No such reply." }, 404);

        const existing = await svc.entities.Cheer.filter({ reply_id: replyId, subject_id: me.id });
        if (existing.length > 0) {
          await svc.entities.Cheer.delete(existing[0].id);
          await svc.entities.Reply.update(replyId, {
            cheers_count: Math.max(0, (reply.cheers_count || 0) - 1),
          });
          if (reply.author_subject_id && reply.author_subject_id !== me.id) {
            await adjustRenown(svc, reply.author_subject_id, -RENOWN.cheerReceived);
          }
          return json({ cheered: false, renown: me.renown, rank: me.rank });
        }

        await svc.entities.Cheer.create({
          tiding_id: reply.tiding_id,
          reply_id: replyId,
          subject_id: me.id,
          user_email: user.email,
        });
        await svc.entities.Reply.update(replyId, {
          cheers_count: (reply.cheers_count || 0) + 1,
        });
        if (reply.author_subject_id && reply.author_subject_id !== me.id) {
          await adjustRenown(svc, reply.author_subject_id, RENOWN.cheerReceived);
        }
        // Cheering earns the cheerer nothing; only being cheered pays out.
        return json({ cheered: true, renown: me.renown, rank: me.rank });
      }

      const tiding = await svc.entities.Tiding.get(tidingId);
      if (!tiding) return json({ error: "No such tiding." }, 404);

      // tiding_id is denormalized onto reply-cheers too, so filter by it alone
      // would catch those as well; isolate the tiding's own cheer record.
      const existing = await svc.entities.Cheer.filter({ tiding_id: tidingId, subject_id: me.id });
      const ownCheer = existing.find((c: any) => !c.reply_id);

      if (ownCheer) {
        await svc.entities.Cheer.delete(ownCheer.id);
        await svc.entities.Tiding.update(tidingId, {
          cheers_count: Math.max(0, (tiding.cheers_count || 0) - 1),
        });
        if (tiding.author_subject_id && tiding.author_subject_id !== me.id) {
          await adjustRenown(svc, tiding.author_subject_id, -RENOWN.cheerReceived);
        }
        return json({ cheered: false, renown: me.renown, rank: me.rank });
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
      return json({ cheered: true, renown: me.renown, rank: me.rank });
    }

    // -- reply: to a tiding, or to another reply (nested, X-style) -----------
    if (action === "reply") {
      const tidingId = payload.tiding_id;
      const parentReplyId = payload.parent_reply_id || undefined;
      const body = (payload.body || "").toString().trim();
      if (!tidingId || !body) return json({ error: "A reply needs words." }, 400);
      if (body.length > 400) return json({ error: "That reply is too long." }, 400);

      const tiding = await svc.entities.Tiding.get(tidingId);
      if (!tiding) return json({ error: "No such tiding." }, 404);

      if (parentReplyId) {
        const parent = await svc.entities.Reply.get(parentReplyId);
        if (!parent || parent.tiding_id !== tidingId) {
          return json({ error: "No such reply." }, 404);
        }
      }

      const reply = await svc.entities.Reply.create({
        tiding_id: tidingId,
        parent_reply_id: parentReplyId,
        author_subject_id: me.id,
        author_email: user.email,
        author_handle: me.handle,
        body,
        cheers_count: 0,
      });
      await svc.entities.Tiding.update(tidingId, {
        replies_count: (tiding.replies_count || 0) + 1,
      });
      // Replying earns nothing on its own, same as posting.
      return json({ reply, renown: me.renown, rank: me.rank });
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

      // Voting earns nothing on its own, same as posting and replying.
      return json({ voted: true, option_index: idx, poll_votes: votes, renown: me.renown, rank: me.rank });
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

    // -- decree: the Monarch picks a task for the whole realm ----------------
    if (action === "decree") {
      if (me.rank !== "monarch") {
        return json({ error: "Only the Monarch may issue a Decree." }, 403);
      }
      const decreeId = (payload.decree_id || "").toString();
      const text = DECREES[decreeId];
      if (!text) return json({ error: "No such Decree." }, 400);
      const crowns = await svc.entities.Crown.list("", 1);
      const fields = { decree: text, decree_id: decreeId, decree_day: todayStr() };
      if (crowns[0]) {
        await svc.entities.Crown.update(crowns[0].id, fields);
      } else {
        await svc.entities.Crown.create(fields);
      }
      return json({ ok: true, decree: text });
    }

    // -- heed: any subject claims the Decree's bonus, once they have actually
    //    done it. The old version paid out on a bare click; this one checks
    //    today's real record (a post, cheers, a reply, a vote) before paying.
    if (action === "heed") {
      const crowns = await svc.entities.Crown.list("", 1);
      const crown = crowns[0];
      if (!crown?.decree_id || crown.decree_day !== todayStr()) {
        return json({ error: "No Decree stands today." }, 400);
      }
      if (me.heeded_day === todayStr()) {
        return json({ already: true, error: "You have already heeded today's Decree." }, 400);
      }
      const done = await decreeFulfilled(svc, me, crown.decree_id, crown.decree_day);
      if (!done) {
        return json({ error: "You have not yet done today's Decree." }, 400);
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
