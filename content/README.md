# Editing the yacht data

Everything the app shows about yachts and shows lives in this folder as plain JSON.
No code change is needed to add a yacht, fix a season number, or add a newly-discovered
MMSI — edit the file and restart the app (`docker compose restart web` in production,
or just save the file if you're running `./start.sh` in dev, which reloads itself).

## `yachts.json`

One entry per yacht **per show appearance** — if the same real yacht was renamed and
reused across two shows or seasons under a different show name, give it two entries
(that's normal; charter yachts get reused a lot).

```json
{
  "id": "below-deck-med-s5-ace",
  "showName": "Ace",
  "realName": "Sirius",
  "show": "below-deck-med",
  "seasons": [5],
  "vesselType": "motor yacht",
  "lengthFt": 180,
  "builder": "Benetti",
  "mmsi": 227812340,
  "imo": 9812345,
  "homeWaters": "Mediterranean (Croatia, Greece, Italy, France)",
  "notes": null
}
```

| Field        | What it means                                                                 |
| ------------ | ------------------------------------------------------------------------------ |
| `id`         | Unique, stable, never reused. `<show>-s<seasons>-<showname-slug>` is the convention. |
| `showName`   | The name used on the TV show — what viewers know it as.                       |
| `realName`   | The yacht's actual registered name. Same as `showName` for the few not renamed. |
| `show`       | One of the slugs in `shows.json`.                                             |
| `seasons`    | Array — usually one number, but a yacht can span two seasons of the same show.|
| `mmsi`       | **The important one.** This is what makes live tracking work for this yacht. `null` if unknown — the app just shows it as "not currently tracked" instead of guessing. |
| `homeWaters` | Free text, shown in the UI. Doesn't affect tracking (the AIS filter is by MMSI, not location). |
| anything else | Set to `null` if you don't know it. Don't guess — a wrong MMSI is worse than a missing one, it'll show someone else's boat. |

### Finding an MMSI

Search the yacht's real name on [MarineTraffic](https://www.marinetraffic.com) or
[VesselFinder](https://www.vesselfinder.com). If several vessels share a similar name,
cross-check the length/builder against what you've put in `lengthFt`/`builder` before
trusting the MMSI — getting this wrong tracks the wrong boat.

## `shows.json`

The five shows in the franchise. `colour` is the hex used for that show's badge —
pick something that reads clearly as white text on top of it if you add a new one.

## After editing

Restart the app so it re-reads these files:

```bash
docker compose restart web   # production
```

(`./start.sh` in dev restarts itself on save — no action needed.)
