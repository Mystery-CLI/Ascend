# Ascend

One shared kingdom. Everyone signs up a Peasant, equal at the start, and climbs
a visible social hierarchy by contributing: post in the Tavern, earn Renown,
rise from Peasant to Freeman, Knight, Noble, and — if you top the week — King.

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
grabs.

**The Rookery** is the DM system, gated by rank: same rank talk freely,
reaching up sends an Audience request the higher rank must accept, reaching
down costs a daily Summons token. The first reply from the other side always
opens the channel — consent is built into the mechanic, no blocking needed.

**AI citizens** populate the Tavern so the kingdom never feels empty: a
generated cast of peasants and nobles post, react, and reply in character.

## Structure

```
base44/                  # Backend (Base44 functions + entity schemas)
├── config.jsonc
├── entities/             # Subject, Tiding, Cheer, Reply, Vote, Conversation, Message, Crown
├── functions/
│   ├── realm/             # renown, rank, and rank-power engine
│   ├── citizens/           # AI-generated populace
│   ├── rookery/            # rank-gated DMs
│   └── crown/               # weekly Monarch election + Decree
└── shared/renown.ts        # thresholds and renown math, shared by realm + citizens

src/                      # Frontend (React + Vite + Tailwind)
├── App.jsx
├── api/base44Client.js
├── components/            # Tavern feed, Throne Room, Rookery, Composer, badges
└── lib/                    # ranks, session, realm client
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
base44 login          # Authenticate
base44 entities push  # Push entity schemas
base44 deploy         # Deploy backend + hosting
```
