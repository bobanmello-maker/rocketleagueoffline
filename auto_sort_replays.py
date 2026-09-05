#!/usr/bin/env python3
"""
Automatski sortira NOVO uploadovane replay-e u pravu grupu na ballchasing.com,
na osnovu toga koji igraci se pojavljuju u mecu - bez ijednog rucnog klika.

- Ako su SVI igraci iz seta OFFLINE_NAMES (vasa 4 splitscreen imena) -> ide u OFFLINE_GROUP
- Ako se ITKO od poznatih igraca pojavi (solo ili sa poznatim saigracem) -> ide u ONLINE_GROUP
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
MAX_RETRIES = 5

if not TOKEN:
    print("GRESKA: BALLCHASING_TOKEN nije postavljen.", file=sys.stderr)
    sys.exit(1)

HEADERS = {"Authorization": TOKEN}


def normalize(name):
    """'ExMirage (1)' / 'ExMirage(1)' / 'exmirage_1' -> 'exmirage1' - da ne zavisimo
    od tacnog razmaka/velikih slova/zagrada kad poredimo imena."""
    return "".join(ch for ch in name.lower() if ch.isalnum())


# Vasa 4 splitscreen imena (normalizovana)
OFFLINE_NAMES = {normalize(n) for n in [
    "ExMirage", "ExMirage(1)", "ExMirage(2)", "ExMirage(3)",
    "Zbunjena Inila", "Zbunjena Inila(1)", "Zbunjena Inila(2)", "Zbunjena Inila(3)",
]}
# Svi poznati igraci - ako se ITKO od njih pojavi u mecu koji nije 100% offline
# sastav, tretiramo ga kao online (bilo solo, bilo sa poznatim saigracem).
KNOWN_NAMES = OFFLINE_NAMES | {normalize(n) for n in ["Rarely_Sober"]}


def _request_with_retry(method, url, **kwargs):
    """Salje HTTP zahtev uz automatski retry na privremene mrezne greske
    (Connection reset, timeout i sl.) i na 429 (rate limit), umesto da
    ceo skript padne na prvom hiccup-u. Posle MAX_RETRIES pokusaja, ipak
    propagira gresku dalje (poziv ce se preskociti, ne rusi ceo skript)."""
    last_exc = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = requests.request(method, url, timeout=30, **kwargs)
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
            last_exc = e
            wait = min(5 * attempt, 30)
            print(f"    Mrezna greska ({type(e).__name__}), pokusaj {attempt}/{MAX_RETRIES}, cekam {wait}s...")
            time.sleep(wait)
            continue

        if r.status_code == 429:
            print(f"    Rate limited, pokusaj {attempt}/{MAX_RETRIES}, cekam 5s...")
            time.sleep(5)
            continue

        # 5xx greske sa ballchasing strane - i to vredi pokusati ponovo
        if r.status_code >= 500:
            last_exc = requests.exceptions.HTTPError(f"{r.status_code} server error")
            wait = min(5 * attempt, 30)
            print(f"    Server greska ({r.status_code}), pokusaj {attempt}/{MAX_RETRIES}, cekam {wait}s...")
            time.sleep(wait)
            continue

        r.raise_for_status()
        time.sleep(SLEEP_BETWEEN_CALLS)
        return r

    # Iscrpljeni pokusaji - digni poslednju gresku da je pozivalac uhvati i preskoci ovaj item
    if last_exc:
        raise last_exc
    raise RuntimeError("Nepoznata greska posle svih pokusaja.")


def api_get(path, params=None, url=None):
    r = _request_with_retry("GET", url or f"{API_BASE}{path}", headers=HEADERS, params=params)
    return r.json()


def api_patch(path, body):
    return _request_with_retry("PATCH", f"{API_BASE}{path}", headers=HEADERS, json=body)


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
    failed = 0
    for item in recent:
        rid = item.get("id")
        if not rid or rid in already:
            continue
        names = player_names(item)
        if not names:
            continue

        if names.issubset(OFFLINE_NAMES) and len(names) >= 2:
            target = OFFLINE_GROUP
        elif names & KNOWN_NAMES:
            target = ONLINE_GROUP
        else:
            continue  # ne prepoznajemo ovaj obrazac, ostavljamo na miru

        print(f"  -> {rid} ({', '.join(sorted(names))}) prebacujem u grupu {target}")
        try:
            api_patch(f"/replays/{rid}", {"group": target})
            moved += 1
        except requests.exceptions.RequestException as e:
            # NE prekidamo ceo skript zbog jednog replay-a - preskacemo ga,
            # probace se ponovo sledeci put kad se workflow pokrene.
            print(f"     GRESKA pri prebacivanju (preskacem, probace se sledeci put): {e}", file=sys.stderr)
            failed += 1

    print(f"\nGotovo. Prebaceno {moved} novih replay-a. Neuspesno (probace se ponovo sledeci put): {failed}.")


if __name__ == "__main__":
    main()
