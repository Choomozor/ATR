# AoE4 Esports Tournament Ranking (ATR) for Reddit

An interactive post for r/aoe4 that brings the community-run **AoE4 Esports Tournament Ranking** into Reddit: every recorded tournament series since 2021, turned into rankings, player profiles, rivalries, records and tournament stories.

## Features

### In the feed

- **Top 32 card**: the current Tournament Elo top 32 in two columns, with flags, rank movement since the last ATR update and the top 3 highlighted. Tap any name to open that player's page.
- **Shared links open where they were shared**: when someone shares a player, a comparison, a tournament or a nation, the card offers to open it directly.

### Ranking

- Full Tournament Elo leaderboard with search, region filters, rank movement, series win rate and each player's last 5 results (the latest one highlighted).

### Player pages

- **Tournament Elo chart** and **rank over time** (rank among active players at each month end), for all time, the last 12 months or the current year.
- **Key numbers**: series and map win rate, record against the current top 10, peak Elo, current and best win streak, tournaments played and **titles won**.
- **Titles**: every tournament the player won, with the final they won.
- **Nemesis and best matchup**: the opponents they struggle and thrive against (at least 3 series).
- **Win rate by tournament tier** (S, A, B, C).
- **Ranked ladder from AoE4World**: 1v1 rating, ladder rank, season win rate, **most played civilizations** with their flags, and linked smurf accounts.
- **Head-to-head** against anyone: series and map record, win rates on both sides, every series between them, and the **win chance for a series today** (Tournament Elo, adjusted by their head-to-head, with recent series counting more than old ones).
- **Fan flair**: wear a "🇫🇷 MarineLorD fan" user flair in the community with one tap (can be removed at any time; moderators can turn this off).
- **Share** the page with Reddit's share sheet.

### Side by side

- Two players on one page: both Elo curves on the same chart, ten stats side by side with the better value highlighted (Elo, rank, peak, series, maps, vs top 10, last 12 months, S-Tier, best streak, titles), win chance and full head-to-head.

### Records

- **Most titles** and **most S-Tier titles**
- **Rivalries**: the most played matchups
- **Highest peak Elo**, **longest win streaks**, **biggest upsets** (series won with the lowest win chance), **best series win rate** (50+ series), **biggest climbers** of the last 12 months and **most series played**

### Nations

- Nations ranked by the average Tournament Elo of their 3 best active players.
- **Nation pages**: the national podium (top 3 players) and who is next in line, every player of the nation, and the nation's record against every other nation.

### Tournaments

- Every event in the ATR, searchable and filterable by tier.
- **Tournament pages**: the champion, highlights (biggest upset, clash of the titans, best run, longest series), maps played, clean sweeps, deciding maps, how often the favourite won, the biggest Elo gains and losses, and every series with upsets tagged.
- **How champions are found**: an event is often split into several stages in the sheet (qualifiers, group stage, playoffs). Qualifiers and group stages never decide a title; the champion is read from the final day of the playoffs (or of the event when it has a single stage) as the player who finished it unbeaten. Events where this is ambiguous, like round robins, get no champion rather than a wrong one.

### Update posts (optional)

- When the ATR sheet is updated, the app can post the new top 10, biggest risers and drops, new entries in the top 32 and the upset of the update.

The data is read from the public ATR Google Sheet every 3 hours.

## For moderators

After installing the app, these items appear in the subreddit's mod menu (⋯ on the subreddit page):

| Menu item | What it does |
| --- | --- |
| **ATR: create ranking post** | Posts the interactive ranking. Pin it or add it to a wiki/sidebar link. |
| **ATR: sync data now** | Re-reads the ATR sheet right away (it also runs automatically every 3 hours and on install/upgrade). |
| **ATR: post update summary** | Posts the summary of the latest ATR update now. |
| **ATR: link player to AoE4World** | Fixes a wrong AoE4World match: paste the player's main account link. Smurfs linked on the AoE4World site are picked up automatically and shown under "Other accounts", best rating first. Leave it empty to go back to automatic matching by name. |
| **ATR: load bundled data (testing)** | Loads the copy of the sheet saved with `npm run snapshot`, for use before `docs.google.com` is approved. |

Settings for the subreddit:

- **Post a summary automatically each time the ATR sheet is updated** (off by default). It never posts on the first sync after install, and posts at most once per sheet update.
- **Let users set a "&lt;player&gt; fan" user flair from player pages** (on by default). The flair replaces the user's current flair in this community; users can remove it from the same page.

AoE4World profiles are matched by name automatically (team tags like `M8.` are ignored, profiles linked to Liquipedia are preferred). The player page says whether a profile was matched automatically or set by the mods.

## Fetch Domains

The following domains are requested for this app:

- `docs.google.com`: reads the public, view-only ATR Google Sheet (tabs "Tournament ELO" and "TRDB") as CSV through the documented Google Visualization query endpoint (`/gviz/tq?tqx=out:csv`). GET requests only; no data is sent. This sheet is the source of the ranking and is maintained by the ATR team.
- `aoe4world.com`: reads public player data (1v1 ranked rating, rank, win rate, most played civilizations) from the documented AoE4World public API (`/api/v0/players/search`, `/api/v0/players/{id}` and `/api/v0/players/{id}/games?include_alts=true&limit=1` to find accounts linked on AoE4World). GET requests only; responses are cached for 1 hour to keep the load low.

## Data and privacy

- The app stores in Redis: the ranking table, each player's tournament series, statistics computed from them (records, titles, rank history, nation records), a 1-hour cache of AoE4World lookups, and the AoE4World links set by moderators.
- It does not store or send any information about Reddit users. When a user chooses a fan flair, the app asks Reddit to set it on their account at that moment; the flair is kept by Reddit, not by the app.
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

- `src/shared/atr.ts`: CSV parsing, Tournament ELO and TRDB readers, statistics, head-to-head and win chance, records, titles, rank history, nation records, tournament highlights, AoE4World matching. Pure functions, covered by `tests/atr.test.ts`.
- `src/server/`: Hono server. `core/sync.ts` pulls the sheet into Redis, `core/aoe4world.ts` does the ladder lookup, `routes/` has the API, mod menu, form, scheduler and trigger endpoints.
- `src/client/`: React + Tailwind. `splash.tsx` is the top 32 card shown in the feed, `game.tsx` is the full app, `views/` has one file per page.
- `src/server/core/config.ts`: sheet ID and tab names. If a tab is renamed in the sheet, update it here.

### Sheet layout the parser expects

- **Tournament ELO**: player name in column C, Elo in D, last match date in E, `FALSE` in F for active players (empty = inactive), rank change in O, Elo change in P, nationality / sub-region / region in Q, R, S. The update date is in the first row.
- **TRDB**: found by header name: `Date`, `Tournament`, `Target`, `Opponent`, `Target Score`, `Opponent Score`, `Winner` (1 win, 0 loss), `Tier`, `New TR rating`, `Rating Change`. Each series appears once per player, in chronological order.

Player names are matched case-insensitively, so `Corvinus` and `corvinus` in TRDB count as the same player.

## Credits

Ranking and match data: the ATR team. Ladder data: [AoE4World](https://aoe4world.com). Country flags: [flag-icons](https://github.com/lipis/flag-icons) (MIT). Age of Empires IV © Microsoft Corporation; civilization flags come from the game and are used under Microsoft's [Game Content Usage Rules](https://www.xbox.com/en-US/developers/rules). This app is a fan project and is not affiliated with or endorsed by Microsoft, Relic, World's Edge or AoE4World.
