// citizens: the living populace of the realm.
//
// A social kingdom that is empty is no kingdom at all, and a judge who lands
// alone at 2am must still find a tavern full of voices. So the realm is peopled
// by AI citizens, each with a rank and a personality, who post tidings and,
// crucially, REACT to real subjects: post a tiding and a citizen may answer you
// in character. That is what makes the place feel alive rather than staged.
//
// Three actions:
//   seed    - one-time, owner-only: generate the roster and their opening tidings.
//   enrich  - owner-only, repeatable: post another batch of tidings from the
//             EXISTING roster (no new citizens), covering a real mix of
//             weighty and throwaway subjects. Run this whenever the tavern
//             starts feeling thin again.
//   pulse   - throttled, any subject: have a citizen react to recent real posts.
//             AI is only spent when there is genuine activity to respond to, so
//             the credit cost tracks real use rather than running on a clock.

import { createClientFromRequest } from "npm:@base44/sdk";
import {
  RENOWN,
  adjustRenown,
  seedRenownForRank,
  notify,
  jsonResponse as json,
} from "../../shared/renown.ts";

// Who may seed the realm. Seeding creates many records and spends AI credits, so
// it is gated to the realm's stewards.
const STEWARDS = ["chibueze8141@gmail.com", "stellarsat.go@gmail.com"];

const PULSE_THROTTLE_MS = 30 * 1000; // at most one citizen reaction every 30s
const CITIZEN_COUNT = 12;

function aiEmail(handle: string) {
  return `citizen.${handle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@realm.ai`;
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
    payload = {};
  }

  try {
    /* ---- seed ---------------------------------------------------------- */
    if (payload.action === "seed") {
      if (!STEWARDS.includes(user.email)) {
        return json({ error: "Only a steward of the realm may summon citizens." }, 403);
      }

      const existing = await svc.entities.Subject.filter({ is_ai: true });
      if (existing.length > 0 && !payload.force) {
        return json({ skipped: true, reason: "The realm is already peopled.", count: existing.length });
      }

      // 1) Generate a varied roster in one AI call.
      const rosterRes: any = await ai.InvokeLLM({
        prompt:
          `Invent ${CITIZEN_COUNT} inhabitants of a medieval-fantasy kingdom social app called Ascend, ` +
          `where people gather in a tavern to share news. Give each a short medieval handle (a name or ` +
          `epithet, max 20 chars), a rank, a vivid one-line personality describing how they speak, and a ` +
          `one-line bio. Make them characterful and different from one another: a gossipy tavern maid, a ` +
          `boastful knight, a doom-saying prophet, a shrewd merchant, a weary farmer, a scheming courtier, ` +
          `a drunk bard, and so on. Rank distribution: about 5 peasant, 3 freeman, 3 knight, 1 noble.`,
        response_json_schema: {
          type: "object",
          properties: {
            citizens: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  handle: { type: "string" },
                  rank: { type: "string", enum: ["peasant", "freeman", "knight", "noble"] },
                  personality: { type: "string" },
                  bio: { type: "string" },
                },
                required: ["handle", "rank", "personality"],
              },
            },
          },
        },
      });

      const roster = (rosterRes?.citizens || []).slice(0, CITIZEN_COUNT);
      if (roster.length === 0) return json({ error: "The roster came back empty." }, 502);

      // 2) Create a Subject for each citizen, standing seeded to their rank.
      const created: Record<string, any> = {};
      for (const c of roster) {
        const handle = (c.handle || "Stranger").toString().slice(0, 24);
        const rank = ["peasant", "freeman", "knight", "noble"].includes(c.rank) ? c.rank : "peasant";
        const subject = await svc.entities.Subject.create({
          user_email: aiEmail(handle),
          handle,
          avatar_url: "",
          bio: (c.bio || "").toString().slice(0, 160),
          rank,
          renown: seedRenownForRank(rank),
          summons_tokens: 0,
          is_ai: true,
          personality: (c.personality || "").toString().slice(0, 200),
        });
        created[handle] = subject;
      }

      // 3) Generate opening tidings in each citizen's voice, one AI call.
      const voiceLines = roster
        .map((c: any) => `- ${c.handle}: ${c.personality}`)
        .join("\n");
      const tidingsRes: any = await ai.InvokeLLM({
        prompt:
          `These are citizens of the kingdom tavern and how they speak:\n${voiceLines}\n\n` +
          `Write 1 to 2 short tavern posts (tidings) for each, 1-2 sentences, strictly in that ` +
          `citizen's voice, medieval-fantasy flavour. Vary the subjects: rumours, complaints, boasts, ` +
          `local news, jokes, warnings, gossip. No hashtags, no modern words.`,
        response_json_schema: {
          type: "object",
          properties: {
            tidings: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  handle: { type: "string" },
                  body: { type: "string" },
                },
                required: ["handle", "body"],
              },
            },
          },
        },
      });

      const tidings = tidingsRes?.tidings || [];
      let posted = 0;
      const madeTidings: any[] = [];
      for (const t of tidings) {
        const author = created[(t.handle || "").toString()];
        if (!author || !t.body) continue;
        const tiding = await svc.entities.Tiding.create({
          author_subject_id: author.id,
          author_email: author.user_email,
          author_handle: author.handle,
          body: t.body.toString().slice(0, 600),
          cheers_count: 0,
          replies_count: 0,
          proclaimed: false,
        });
        madeTidings.push(tiding);
        posted++;
      }

      // 4) Let citizens cheer one another so tidings and standing feel earned.
      //    No AI here, just organic-looking engagement.
      const citizenList = Object.values(created);
      for (const tiding of madeTidings) {
        const cheerers = citizenList
          .filter((s: any) => s.id !== tiding.author_subject_id)
          .sort(() => Math.random() - 0.5)
          .slice(0, Math.floor(Math.random() * 4)); // 0-3 cheers each
        for (const cheerer of cheerers) {
          await svc.entities.Cheer.create({
            tiding_id: tiding.id,
            subject_id: (cheerer as any).id,
            user_email: (cheerer as any).user_email,
          });
          await adjustRenown(svc, tiding.author_subject_id, RENOWN.cheerReceived);
        }
        const finalCount = await svc.entities.Cheer.filter({ tiding_id: tiding.id });
        await svc.entities.Tiding.update(tiding.id, { cheers_count: finalCount.length });
      }

      return json({ seeded: true, citizens: citizenList.length, tidings: posted });
    }

    /* ---- enrich ---------------------------------------------------------
       Adds a fresh batch of tidings from the EXISTING citizen roster (no new
       citizens created, unlike seed) so the tavern keeps feeling lived-in
       beyond the one-time opening batch. Deliberately mixes weighty and
       throwaway subjects and asks for real prose craft, not just a one-line
       gossip stub, since that first batch leaned hard on rumour/jokes/boasts
       and read thin after a few screens of it. */
    if (payload.action === "enrich") {
      if (!STEWARDS.includes(user.email)) {
        return json({ error: "Only a steward of the realm may enrich the tavern." }, 403);
      }

      const citizens = await svc.entities.Subject.filter({ is_ai: true });
      if (citizens.length === 0) {
        return json({ error: "No citizens exist yet. Seed the realm first." }, 400);
      }

      const count = Math.min(Math.max(Number(payload.count) || 24, 1), 40);
      const voiceLines = citizens
        .map((c: any) => `- ${c.handle} (${c.rank}): ${c.personality}`)
        .join("\n");

      const tidingsRes: any = await ai.InvokeLLM({
        prompt:
          `These are citizens of a medieval-fantasy kingdom tavern and how they speak:\n${voiceLines}\n\n` +
          `Write ${count} tavern posts (tidings) total, spread across these citizens (a citizen may post ` +
          `more than once), strictly in each one's own established voice, medieval-fantasy flavour, no ` +
          `modern words, no hashtags. Write with genuine craft: 2-4 sentences each, well-composed and ` +
          `quotable, the way a real, thoughtful person actually writes, not a throwaway one-liner. Cover a ` +
          `real MIX of subjects across the batch: roughly half should be WEIGHTY and IMPORTANT (a real ` +
          `dilemma, a moral question, grief, ambition, justice, a hard choice, news from the wider ` +
          `kingdom), and roughly half RANDOM and LIGHT (a jest, a small complaint, an odd rumour, a boast, ` +
          `a passing observation). Vary the shape post to post; do not repeat the same sentence structure ` +
          `twice in a row, and do not let every citizen sound like they are discussing the same topic.`,
        response_json_schema: {
          type: "object",
          properties: {
            tidings: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  handle: { type: "string" },
                  body: { type: "string" },
                },
                required: ["handle", "body"],
              },
            },
          },
        },
      });

      const byHandle: Record<string, any> = {};
      for (const c of citizens) byHandle[c.handle] = c;

      const tidings = tidingsRes?.tidings || [];
      let posted = 0;
      const madeTidings: any[] = [];
      for (const t of tidings) {
        const author = byHandle[(t.handle || "").toString()];
        if (!author || !t.body) continue;
        const tiding = await svc.entities.Tiding.create({
          author_subject_id: author.id,
          author_email: author.user_email,
          author_handle: author.handle,
          body: t.body.toString().slice(0, 600),
          cheers_count: 0,
          replies_count: 0,
          proclaimed: false,
        });
        madeTidings.push(tiding);
        posted++;
      }

      // Light organic cross-cheering, same as seed's own step 4: no AI cost,
      // just entity writes, so tidings and standing feel earned rather than
      // arriving with a suspicious zero.
      for (const tiding of madeTidings) {
        const cheerers = citizens
          .filter((s: any) => s.id !== tiding.author_subject_id)
          .sort(() => Math.random() - 0.5)
          .slice(0, Math.floor(Math.random() * 4));
        for (const cheerer of cheerers) {
          await svc.entities.Cheer.create({
            tiding_id: tiding.id,
            subject_id: cheerer.id,
            user_email: cheerer.user_email,
          });
          await adjustRenown(svc, tiding.author_subject_id, RENOWN.cheerReceived);
        }
        const finalCount = await svc.entities.Cheer.filter({ tiding_id: tiding.id });
        await svc.entities.Tiding.update(tiding.id, { cheers_count: finalCount.length });
      }

      return json({ enriched: true, citizens: citizens.length, tidings: posted });
    }

    /* ---- pulse --------------------------------------------------------- */
    if (payload.action === "pulse") {
      const citizens = await svc.entities.Subject.filter({ is_ai: true });
      if (citizens.length === 0) return json({ acted: false, reason: "no citizens yet" });

      // Throttle: if a citizen has replied very recently, stay quiet. Keeps the
      // realm lively without letting anyone spin the AI to burn credits.
      const recentReplies = await svc.entities.Reply.list("-created_date", 5);
      const citizenIds = new Set(citizens.map((c: any) => c.id));
      const lastCitizenReply = recentReplies.find((r: any) =>
        citizenIds.has(r.author_subject_id)
      );
      if (
        lastCitizenReply &&
        Date.now() - new Date(lastCitizenReply.created_date).getTime() < PULSE_THROTTLE_MS
      ) {
        return json({ acted: false, reason: "resting" });
      }

      // Find the newest REAL tiding a citizen has not yet answered.
      const recentTidings = await svc.entities.Tiding.list("-created_date", 12);
      let target = null;
      for (const t of recentTidings) {
        if (citizenIds.has(t.author_subject_id)) continue; // skip citizens' own posts
        const replies = await svc.entities.Reply.filter({ tiding_id: t.id });
        const answered = replies.some((r: any) => citizenIds.has(r.author_subject_id));
        if (!answered) {
          target = t;
          break;
        }
      }
      if (!target) return json({ acted: false, reason: "nothing new to answer" });

      // Choose a citizen and answer in their voice.
      const speaker = citizens[Math.floor(Math.random() * citizens.length)];
      const replyText = await ai.InvokeLLM({
        prompt:
          `You are ${speaker.handle}, a ${speaker.rank} of the kingdom tavern. Your manner: ` +
          `${speaker.personality || "plainspoken"}. Reply to this tavern post in ONE sentence, ` +
          `strictly in your voice, medieval-fantasy flavour, no modern words, no quotation marks:\n\n` +
          `"${target.body}"`,
      });

      const body = (typeof replyText === "string" ? replyText : replyText?.toString() || "")
        .trim()
        .slice(0, 400);
      if (!body) return json({ acted: false, reason: "no words came" });

      await svc.entities.Reply.create({
        tiding_id: target.id,
        author_subject_id: speaker.id,
        author_email: speaker.user_email,
        author_handle: speaker.handle,
        body,
      });
      await svc.entities.Tiding.update(target.id, {
        replies_count: (target.replies_count || 0) + 1,
      });
      // A reply earns nothing on its own now, from a citizen or a real
      // subject alike; only being cheered does. It still notifies the real
      // author, though: to them, someone replied, full stop.
      await notify(
        svc,
        target.author_email,
        target.author_subject_id,
        speaker.id,
        speaker.handle,
        "reply_tiding",
        `${speaker.handle} replied to your tiding.`,
        target.id
      );

      return json({ acted: true, by: speaker.handle, on: target.id });
    }

    return json({ error: "Unknown citizens action." }, 400);
  } catch (err) {
    return json({ error: (err as Error)?.message || "The citizens faltered." }, 500);
  }
});
