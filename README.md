# Ascend

One shared kingdom. Everyone signs up a Peasant, equal at the start, and climbs
a visible social hierarchy by contributing: post in the Tavern, earn Renown,
rise from Peasant to Freeman, Knight, Noble, and (if you top the week) King.

Built for the Base44 Dev Build-Off.

Live at **https://my-ascension.base44.app**

## Concept

Ascend is a social feed wearing a medieval kingdom's clothes. Rank is public
and earned; your exact Renown (score) is private, visible only to you. Each
rank unlocks real, server-enforced powers:

| Rank | Powers |
|---|---|
| Peasant | post, cheer, reply, vote in the Tavern |
| Freeman | start a thread, a crest on your profile |
| Knight | Champion a tiding (boost it, once a day) |
| Noble | Proclaim (pin kingdom-wide), grant a Bounty |
| Monarch (weekly) | issue a Decree (kingdom-wide daily quest), reigns until dethroned |

The throne is won, not granted: whoever earns the most Renown **this week**
is crowned. The reign resets every seven days, so the crown is always up for
grabs. Posting, replying, and cheering someone else earn the actor nothing,
by design: the only ways to grow are being cheered by someone else, or
heeding the Monarch's daily Decree. Standing has to come from other people
noticing you, not from being active alone.

**The Rookery** is the DM system, gated by rank: same rank talk freely,
reaching up sends an Audience request the higher rank must accept, reaching
down costs a daily Summons token. The first reply from the other side always
opens the channel, so consent is built into the mechanic itself, no blocking
system needed. Either side can still block or hide a conversation afterward.

**Crests are profiles, X-style.** Tapping any handle or avatar (yours or
someone else's) opens their crest: portrait, bio, rank, and their full
timeline of tidings. Your own crest shows an Edit button; everyone else's
shows a Raven button to message them instead. Viewing any crest requires
having sworn fealty first.

**Notifications and Search** fill out the rest of the X-style shell: cheers,
replies, rank-power actions, bounties, and being crowned all notify you and
deep-link to the exact tiding or thread involved. Search matches people (by
name or unique @username) and tidings against what's already loaded, no
separate search index. On wide screens, Search lives as a persistent panel
in the previously-empty right-hand column instead of a mobile-only page.

**Unique @usernames**, separate from your display name, X-style: chosen
during signup with a live availability check, editable afterward from your
crest.

**AI citizens** populate the Tavern so the kingdom never feels empty: a
generated cast of peasants, freemen, knights, and one noble, each with a
distinct voice, post tidings and react in character to real subjects. A
repeatable "enrich" action (steward-only) tops up the tavern with a fresh,
deliberately varied batch whenever it starts feeling quiet, split between
weighty subjects (a dilemma, grief, justice) and light ones (a jest, a
boast, a complaint), so it never reads as one-note gossip.

**The Oracle** is Ascend's own answer to X's Grok: an AI advisor built into
the realm, reachable from its own nav item. Ask it about the kingdom (its
answers are grounded in your actual rank, Renown, the current reign, and
today's Decree, fetched fresh every question) or about anything else, real
current events included, backed by live internet-grounded lookups rather
than stale training knowledge. Rate-limited to 20 questions a day per
subject. Conversations are short-term memory: the server remembers the last
48 hours of it, so a reload or a same-day return visit picks up where you
left off, then it's quietly forgotten.

**Installable as a PWA.** A manifest, icon set, and a deliberately inert
service worker (it caches nothing, since none of this app's live data
should ever risk going stale) let you add Ascend to a phone's home screen
like a native app.

## Structure

```
base44/                       # Backend (Base44 functions + entity schemas)
├── config.jsonc
├── entities/                  # Subject, Tiding, Reply, Cheer, Vote,
│                                 Conversation, Message, Notification,
│                                 Crown, OracleMessage
├── functions/
│   ├── realm/                  # renown, rank, rank-power, and username engine
│   ├── citizens/                 # AI-generated populace: seed, enrich, pulse
│   ├── rookery/                    # rank-gated DMs
│   ├── crown/                        # weekly Monarch election + Decree
│   └── oracle/                         # the AI advisor, with its own short-term memory
└── shared/renown.ts                     # thresholds and renown math, shared across functions

src/                           # Frontend (React + Vite + Tailwind)
├── App.jsx                     # layout, routing between views, all shared state
├── api/base44Client.js
├── components/                  # TidingCard, ThroneRoom, Rookery, Profile,
│                                   Composer, Notifications, Search, Oracle,
│                                   RankBadge, FealtyGate
└── lib/                            # ranks, session, realm client, username
                                       check, visual-viewport fix, toast
```

## Development

```bash
npm install
npm run dev
```

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |

## Base44 CLI

```bash
base44 login              # Authenticate
base44 entities push      # Push entity schemas
base44 functions deploy   # Deploy backend functions
base44 deploy             # Deploy everything: entities, functions, and hosting
```
