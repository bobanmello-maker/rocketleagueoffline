#!/usr/bin/env python3
"""
Automatski sortira NOVO uploadovane replay-e u pravu grupu na ballchasing.com,
na osnovu toga koji igraci se pojavljuju u mecu - bez ijednog rucnog klika.

- Ako su SVI igraci iz seta OFFLINE_NAMES (vasa 4 splitscreen imena) -> ide u OFFLINE_GROUP
- Ako su igraci tacno ExMirage + Rarely_Sober (tvoj online duo) -> ide u ONLINE_GROUP
- Sve sto se ne poklapa ni sa jednim obrascem - ostaje netaknuto (da ne pogresi sortiranje)

Pokrece se PRE fetch_stats.py u istom workflow-u.
"""

import os
import sys
import time
import requests

API_BASE = "https://ballchasing.com/api"
TOKEN = os.environ.get("BALLCHASING_TOKEN")
ONLINE_GROUP = os.environ.get("BALLCHASING_ONLINE_GROUP", "online-30wp20uwjv")
OFFLINE_GROUP = os.environ.get("BALLCHASING_OFFLINE_GROUP", "exibition-eyc42k96yc")
SLEEP_BETWEEN_CALLS = 0.6

if not TOKEN:
    print("GRESKA: BALLCHASING_TOKEN nije postavljen.", file=sys.stderr)
    sys.exit(1)

HEADERS = {"Authorization": TOKEN}


def normalize(name):
    """'ExMirage (1)' / 'ExMirage(1)' / 'exmirage_1' -> 'exmirage1' - da ne zavisimo
    od tacnog razmaka/velikih slova/zagrada kad poredimo imena."""
    return "".join(ch for ch in name.lower() if ch.isalnum())


# Vasa 4 splitscreen imena (normalizovana)
OFFLINE_NAMES = {normalize(n) for n in ["ExMirage", "ExMirage(1)", "ExMirage(2)", "ExMirage(3)"]}
# Tvoj online ranked duo
ONLINE_NAMES = {normalize(n) for n in ["ExMirage", "Rarely_Sober"]}


def api_get(path, params=None, url=None):
    while True:
        r = requests.get(url or f"{API_BASE}{path}", headers=HEADERS, params=params)
        if r.status_code == 429:
            print("Rate limited, cekam 5s...")
            time.sleep(5)
            continue
        r.raise_for_status()
        time.sleep(SLEEP_BETWEEN_CALLS)
        return r.json()


def api_patch(path, body):
    while True:
        r = requests.patch(f"{API_BASE}{path}", headers=HEADERS, json=body)
        if r.status_code == 429:
            time.sleep(5)
            continue
        r.raise_for_status()
        time.sleep(SLEEP_BETWEEN_CALLS)
        return r


def list_group_replay_ids(group_id):
    ids = set()
    params = {"group": group_id, "count": 200}
    next_url = None
    while True:
        data = api_get("/replays", params=params) if not next_url else api_get(None, url=next_url)
        for r in data.get("list", []):
            ids.add(r["id"])
        next_url = data.get("next")
        if not next_url:
            break
    return ids


def list_recent_uploads(count=100):
    data = api_get("/replays", params={"uploader": "me", "count": count})
    return data.get("list", [])


def player_names(replay_item):
    names = set()
    for color in ("blue", "orange"):
        team = replay_item.get(color) or {}
        for p in team.get("players", []):
            n = p.get("name")
            if n:
                names.add(normalize(n))
    return names


def main():
    print("Ucitavam vec sortirane replay-e (da ih preskocim)...")
    already = list_group_replay_ids(ONLINE_GROUP) | list_group_replay_ids(OFFLINE_GROUP)
    print(f"  {len(already)} replay-a je vec u nekoj od dve grupe")

    recent = list_recent_uploads(100)
    print(f"Poslednjih {len(recent)} upload-a - proveravam koji nisu sortirani...")

    moved = 0
    for item in recent:
        rid = item.get("id")
        if not rid or rid in already:
            continue
        names = player_names(item)
        if not names:
            continue

        if names.issubset(OFFLINE_NAMES) and len(names) >= 2:
            target = OFFLINE_GROUP
        elif ONLINE_NAMES.issubset(names):
            target = ONLINE_GROUP
        else:
            continue  # ne prepoznajemo ovaj obrazac, ostavljamo na miru

        print(f"  -> {rid} ({', '.join(sorted(names))}) prebacujem u grupu {target}")
        try:
            api_patch(f"/replays/{rid}", {"group": target})
            moved += 1
        except requests.HTTPError as e:
            print(f"     GRESKA pri prebacivanju: {e}", file=sys.stderr)

    print(f"\nGotovo. Prebaceno {moved} novih replay-a u odgovarajuce grupe.")


if __name__ == "__main__":
    main()
