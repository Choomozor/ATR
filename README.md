# AoE4 Esports Tournament Ranking (ATR) for Reddit

An interactive post for r/aoe4 that brings the community-run **AoE4 Esports Tournament Ranking** into Reddit:

- **Tournament Elo leaderboard** with search, region filters, movement since the last ATR update and each player's last 5 results.
- **Player pages** built from every recorded tournament series: Elo history chart, series and map win rate, win rate by tournament tier (S/A/B/C), record against the current top 10, peak Elo, current streak, most-played rivals and recent results, for all time, the last 12 months or the current year. A "Copy link" button shares a player's numbers with a link to the post.
- **Head-to-head** between any two players, with each player's win chance from their current Tournament Elo.
- **Nations** ranked by the average Tournament Elo of their 3 best active players, with each nation's top 5.
- **Tournaments**: every event in the ATR with its series and the biggest Elo gains and losses.
- **Ranked ladder** status from AoE4World (1v1 rating, ladder rank, season win rate) next to the tournament numbers.
- **Automatic update post** (optional): when the ATR sheet is updated, the app posts the new top 10, biggest risers and drops, new entries in the top 32 and the upset of the update.

The data is read from the public ATR Google Sheet every 3 hours. Nothing is collected from Reddit users.

## For moderators

After installing the app, three items appear in the subreddit's mod menu (⋯ on the subreddit page):

| Menu item | What it does |
| --- | --- |
| **ATR: create ranking post** | Posts the interactive ranking. Pin it or add it to a wiki/sidebar link. |
| **ATR: sync data now** | Re-reads the ATR sheet right away (it also runs automatically every 3 hours and on install/upgrade). |
| **ATR: post update summary** | Posts the summary of the latest ATR update now. |
| **ATR: link player to AoE4World** | Fixes a wrong AoE4World match by pasting the player's AoE4World profile link. Leave the link empty to go back to automatic matching. |
| **ATR: load bundled data (testing)** | Loads the copy of the sheet saved with `npm run snapshot`, for use before `docs.google.com` is approved. |

In the app's settings for the subreddit, **"Post a summary automatically each time the ATR sheet is updated"** turns on the automatic update post (off by default). It never posts on the first sync after install, and posts at most once per sheet update.

AoE4World profiles are matched by name automatically (team tags like `M8.` are ignored, profiles linked to Liquipedia are preferred). The player page says whether a profile was matched automatically or set by the mods.

## Fetch Domains

The following domains are requested for this app:

- `docs.google.com`: reads the public, view-only ATR Google Sheet (tabs "Tournament ELO" and "TRDB") as CSV through the documented Google Visualization query endpoint (`/gviz/tq?tqx=out:csv`). GET requests only; no data is sent. This sheet is the source of the ranking and is maintained by the ATR team.
- `aoe4world.com`: reads public player data (1v1 ranked rating, rank, win rate) from the documented AoE4World public API (`/api/v0/players/search` and `/api/v0/players/{id}`). GET requests only; responses are cached for 1 hour to keep the load low.

## Data and privacy

- The app stores in Redis: the ranking table, each player's tournament series, a 1-hour cache of AoE4World lookups, and the AoE4World links set by moderators.
- It does not store or send any information about Reddit users.
- Terms: see [TERMS.md](TERMS.md). Privacy policy: see [PRIVACY.md](PRIVACY.md).

## Development

Requires Node.js 24+ and a Reddit account connected to [developers.reddit.com](https://developers.reddit.com).

```bash
npm install
npm run login        # connect the CLI to your Reddit account
npm run dev          # playtest on your own test subreddit
npm run test:unit    # parsing and statistics tests (real ATR rows)
npm run deploy       # type-check, lint and upload a new version
npm run launch       # upload and submit for review
```

Project layout:

- `src/shared/atr.ts`: CSV parsing, Tournament ELO and TRDB readers, statistics, head-to-head, AoE4World matching. Pure functions, covered by `tests/atr.test.ts`.
- `src/server/`: Hono server. `core/sync.ts` pulls the sheet into Redis, `core/aoe4world.ts` does the ladder lookup, `routes/` has the API, mod menu, form, scheduler and trigger endpoints.
- `src/client/`: React + Tailwind. `splash.tsx` is the top-5 card shown in the feed, `game.tsx` is the full ranking.
- `src/server/core/config.ts`: sheet ID and tab names. If a tab is renamed in the sheet, update it here.

### Sheet layout the parser expects

- **Tournament ELO**: player name in column C, Elo in D, last match date in E, `FALSE` in F for active players (empty = inactive), rank change in O, Elo change in P, nationality / sub-region / region in Q, R, S. The update date is in the first row.
- **TRDB**: found by header name: `Date`, `Tournament`, `Target`, `Opponent`, `Target Score`, `Opponent Score`, `Winner` (1 win, 0 loss), `Tier`, `New TR rating`, `Rating Change`. Each series appears once per player, in chronological order.

Player names are matched case-insensitively, so `Corvinus` and `corvinus` in TRDB count as the same player.

## Credits

Ranking and match data: the ATR team. Ladder data: [AoE4World](https://aoe4world.com). Age of Empires IV is a trademark of Microsoft; this app is a fan project and is not affiliated with Microsoft, Relic, World's Edge or AoE4World.
