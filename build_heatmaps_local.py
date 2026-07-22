"""
build_heatmaps_local.py (v4) - Koristi sprocket-boxcars-py
"""

import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

# Podesavanja
REPLAY_CACHE = Path("replay_cache.json")
REPLAY_DIR = Path("replays_cache")
DATA_FILE = Path("heatmap_data.json")
PROCESSED_FILE = Path("heatmap_processed.json")

FIELD_X_MIN, FIELD_X_MAX = -4200, 4200
FIELD_Y_MIN, FIELD_Y_MAX = -5300, 5300
GRID_COLS, GRID_ROWS = 64, 80
FPS = 10.0

def new_grid():
    return [[0 for _ in range(GRID_COLS)] for _ in range(GRID_ROWS)]

def add_point(grid, x, y):
    if x is None or y is None:
        return
    if not (FIELD_X_MIN <= x <= FIELD_X_MAX and FIELD_Y_MIN <= y <= FIELD_Y_MAX):
        return
    col = int((x - FIELD_X_MIN) / (FIELD_X_MAX - FIELD_X_MIN) * GRID_COLS)
    row = int((y - FIELD_Y_MIN) / (FIELD_Y_MAX - FIELD_Y_MIN) * GRID_ROWS)
    col = min(max(col, 0), GRID_COLS - 1)
    row = min(max(row, 0), GRID_ROWS - 1)
    grid[row][col] += 1

def find_position_indices(headers_list, prefix):
    x_idx = y_idx = None
    for i, name in enumerate(headers_list):
        low = name.lower()
        if "location" not in low and "pos" not in low:
            continue
        if low.endswith("_x") or low.endswith(".x") or low.endswith("x"):
            if x_idx is None:
                x_idx = i
        if low.endswith("_y") or low.endswith(".y") or low.endswith("y"):
            if y_idx is None:
                y_idx = i
    return x_idx, y_idx

def process_replay_in_process(replay_path):
    import sprocket_boxcars_py as subtr_actor
    
    global_adders = ["BallRigidBody"]
    player_adders = ["PlayerRigidBody"]
    
    headers = subtr_actor.get_column_headers(
        global_feature_adders=global_adders,
        player_feature_adders=player_adders,
    )
    meta, ndarray = subtr_actor.get_ndarray_with_info_from_replay_filepath(
        str(replay_path),
        global_feature_adders=global_adders,
        player_feature_adders=player_adders,
        fps=FPS,
        dtype="float32",
    )
    
    global_headers = headers["global_headers"] if isinstance(headers, dict) else headers.global_headers
    player_headers = headers["player_headers"] if isinstance(headers, dict) else headers.player_headers
    
    ball_x_i, ball_y_i = find_position_indices(global_headers, "Ball")
    if ball_x_i is None or ball_y_i is None:
        raise RuntimeError(f"Ne mogu da nadjem x/y kolone za loptu u headers: {global_headers}")
    
    n_global = len(global_headers)
    n_player_cols = len(player_headers)
    px_i, py_i = find_position_indices(player_headers, "Player")
    if px_i is None or py_i is None:
        raise RuntimeError(f"Ne mogu da nadjem x/y kolone za igraca u headers: {player_headers}")
    
    n_players = (ndarray.shape[1] - n_global) // n_player_cols if n_player_cols else 0
    
    ball_grid = new_grid()
    player_grid = new_grid()
    
    for row in ndarray:
        add_point(ball_grid, float(row[ball_x_i]), float(row[ball_y_i]))
        for p in range(n_players):
            base = n_global + p * n_player_cols
            add_point(player_grid, float(row[base + px_i]), float(row[base + py_i]))
    
    return {"ball_grid": ball_grid, "player_grid": player_grid}

def run_worker(replay_path, out_path):
    result = process_replay_in_process(replay_path)
    Path(out_path).write_text(json.dumps(result), encoding="utf-8")

def process_replay(replay_path):
    with tempfile.TemporaryDirectory() as tmp_dir:
        out_path = Path(tmp_dir) / "result.json"
        proc = subprocess.run(
            [sys.executable, str(Path(__file__).resolve()), "--worker", str(replay_path), str(out_path)],
            capture_output=True,
            text=True,
            timeout=180,
        )
        if proc.returncode != 0 or not out_path.exists():
            stderr_tail = "\n".join(proc.stderr.strip().splitlines()[-5:]) if proc.stderr else "(nema stderr)"
            raise RuntimeError(f"pod-proces pao (kod {proc.returncode}): {stderr_tail}")
        result = json.loads(out_path.read_text(encoding="utf-8"))
        return result["ball_grid"], result["player_grid"]

def merge_grid(target, addition):
    for r in range(len(target)):
        for c in range(len(target[r])):
            target[r][c] += addition[r][c]

def main():
    # Učitaj replay_cache.json od fetch_stats.py
    if not REPLAY_CACHE.exists():
        print(f"Upozorenje: {REPLAY_CACHE} ne postoji. Pokreni fetch_stats.py prvo.")
        return
    
    with open(REPLAY_CACHE, 'r') as f:
        cache = json.load(f)
    
    # Izvuci sve replay ID-eve iz keša
    all_replay_ids = list(cache.keys())
    print(f"Nadjeno {len(all_replay_ids)} replay-a u kešu")
    
    # Učitaj već obrađene
    processed = set()
    if PROCESSED_FILE.exists():
        with open(PROCESSED_FILE, 'r') as f:
            processed = set(json.load(f))
    
    todo = [rid for rid in all_replay_ids if rid not in processed]
    print(f"Novih za obradu: {len(todo)}")
    
    # Učitaj postojeći heatmap ili kreiraj novi
    if DATA_FILE.exists():
        with open(DATA_FILE, 'r') as f:
            data = json.load(f)
    else:
        data = {
            "grid_cols": GRID_COLS,
            "grid_rows": GRID_ROWS,
            "field_x": [FIELD_X_MIN, FIELD_X_MAX],
            "field_y": [FIELD_Y_MIN, FIELD_Y_MAX],
            "ball_grid": new_grid(),
            "player_grid": new_grid(),
            "replays_included": 0,
        }
    
    REPLAY_DIR.mkdir(exist_ok=True)
    
    ok_count = 0
    err_count = 0
    
    for i, replay_id in enumerate(todo, 1):
        print(f"[{i}/{len(todo)}] {replay_id} ... ", end="", flush=True)
        replay_path = REPLAY_DIR / f"{replay_id}.replay"
        
        try:
            # Ako replay fajl ne postoji, pokušaj da ga dohvatiš
            if not replay_path.exists():
                import requests
                token = os.environ.get("BALLCHASING_TOKEN")
                if not token:
                    raise RuntimeError("BALLCHASING_TOKEN nije podesen")
                url = f"https://ballchasing.com/api/replays/{replay_id}/file"
                resp = requests.get(url, headers={"Authorization": token}, timeout=60)
                resp.raise_for_status()
                replay_path.write_bytes(resp.content)
                time.sleep(0.5)
            
            ball_grid, player_grid = process_replay(replay_path)
            merge_grid(data["ball_grid"], ball_grid)
            merge_grid(data["player_grid"], player_grid)
            
            processed.add(replay_id)
            data["replays_included"] += 1
            ok_count += 1
            print("OK")
        except Exception as e:
            err_count += 1
            print(f"GRESKA: {type(e).__name__}: {e}")
        
        # Cuvaj progres posle svakog replay-a
        DATA_FILE.write_text(json.dumps(data), encoding="utf-8")
        PROCESSED_FILE.write_text(json.dumps(sorted(processed)), encoding="utf-8")
    
    print(f"\nGotovo. Uspesno: {ok_count}. Greske: {err_count}.")

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--worker":
        run_worker(sys.argv[2], sys.argv[3])
    else:
        main()
