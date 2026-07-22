"""
debug_sprocket.py - Ispisuje sve dostupne atribute u sprocket_boxcars_py
"""

import sprocket_boxcars_py as sb

print("Dostupni atributi u sprocket_boxcars_py:")
print("=" * 50)

for attr in dir(sb):
    if not attr.startswith('_'):
        print(f"  {attr}")

# Probaj da vidiš da li postoji neka funkcija za učitavanje
print("\n" + "=" * 50)
print("Pokusavam da ucitam replay...")

# Probaj različite varijante
possible_funcs = ['load', 'load_replay', 'parse', 'parse_replay', 'from_file', 'open', 'read']

for func_name in possible_funcs:
    if hasattr(sb, func_name):
        print(f"  ✅ Ima: {func_name}")
    else:
        print(f"  ❌ Nema: {func_name}")
