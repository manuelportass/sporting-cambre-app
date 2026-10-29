# Ajuste 26/10: desde la J1 (06/09) los partidos solo salen de las actas y los RPE se agrupan en martes/jueves/viernes.
import json, datetime as dt, collections, sys
src, out = sys.argv[1], sys.argv[2]
s = json.load(open(src))
J1 = '2026-09-06'
D = dt.date.fromisoformat
iso = lambda d: d.isoformat()
monday = lambda d: d - dt.timedelta(days=d.weekday())
SLOTS = [1, 3, 4]  # martes, jueves, viernes
NAME = {1: 'martes', 3: 'jueves', 4: 'viernes'}
inc = []
# 1) Partidos desde la J1: fuera del formulario (la J1 ya va con el acta; el resto se añadirá con cada acta)
dropped = [e for e in s['entries'] if e['date'] >= J1 and e['type'] == 'Partido']
s['entries'] = [e for e in s['entries'] if not (e['date'] >= J1 and e['type'] == 'Partido')]
s['sessions'] = [x for x in s['sessions'] if not (x['date'] > J1 and x['type'] == 'Partido')]
for d, n in sorted(collections.Counter(e['date'] for e in dropped).items()):
    inc.append(f'Partido del {d}: {n} RPE del formulario descartados; la carga se calculará con el acta (RPE 10 × minutos).' if d > J1 else
               f'J1 ({d}): {n} RPE del formulario descartados; se usan los minutos del acta oficial.')
# 2) Sesiones de entrenamiento desde la J1 en martes/jueves/viernes: por orden dentro de cada semana
train = sorted([x for x in s['sessions'] if x['date'] > J1 and x['type'] == 'Entrenamiento'], key=lambda x: x['date'])
byweek = collections.defaultdict(list)
for x in train: byweek[monday(D(x['date']))].append(x)
remap = {}
for wk, xs in byweek.items():
    days = [D(x['date']).weekday() for x in xs]
    if all(d in SLOTS for d in days): continue
    assert len(xs) <= 3, wk
    for x, slot in zip(xs, SLOTS[:len(xs)] if len(xs) == 3 else None or []):
        nd = iso(wk + dt.timedelta(days=slot))
        if nd != x['date']: remap[x['date']] = nd; inc.append(f"Sesión del {x['date']} ({['lunes','martes','miércoles','jueves','viernes','sábado','domingo'][D(x['date']).weekday()]}) → sesión del {NAME[slot]} {nd}.")
    if len(xs) != 3:
        for x in xs:
            d = D(x['date']); best = min((sl for sl in SLOTS if iso(wk + dt.timedelta(days=sl)) not in [y['date'] for y in xs if y is not x]), key=lambda sl: (abs(sl - d.weekday()), -sl))
            nd = iso(wk + dt.timedelta(days=best))
            if nd != x['date']: remap[x['date']] = nd; inc.append(f"Sesión del {x['date']} → sesión del {NAME[best]} {nd}.")
for x in s['sessions']:
    if x['date'] in remap: x['date'] = remap[x['date']]
for e in s['entries']:
    if e['date'] in remap and e['type'] == 'Entrenamiento': e['notes'] += f" [sesión del {e['date']} asignada al {remap[e['date']]}]"; e['date'] = remap[e['date']]
# 3) Entrenamientos adicionales (días sin sesión) desde la J1: a la sesión libre más cercana de la misma semana
sesdates = {x['date'] for x in s['sessions'] if x['type'] == 'Entrenamiento'}
have = {(e['player'], e['date']) for e in s['entries'] if e['type'] == 'Entrenamiento'}
for e in s['entries']:
    if e['type'] != 'Adicional' or e['date'] < J1: continue
    d = D(e['date']); wk = monday(d)
    cands = sorted((iso(wk + dt.timedelta(days=sl)) for sl in SLOTS), key=lambda x: (abs((D(x) - d).days), x))
    free = [c for c in cands if c in sesdates and (e['player'], c) not in have]
    if free:
        old = e['date']; e['date'] = free[0]; e['type'] = 'Entrenamiento'; e['label'] = 'Entrenamiento'
        e['notes'] += f' [enviado para el {old}: asignado a la sesión del {NAME[D(free[0]).weekday()]} {free[0]}]'
        have.add((e['player'], free[0])); inc.append(f"{e['player']}: envío del {old} → sesión del {NAME[D(free[0]).weekday()]} {free[0]}.")
    else:
        inc.append(f"{e['player']}: envío del {e['date']} — ya tenía RPE en martes, jueves y viernes de esa semana → se mantiene como entrenamiento adicional.")
s['rules'] = [r for r in s['rules'] if not r.startswith('Partidos y amistosos') and not r.startswith('Envíos aislados')] + [
  'Hasta la J1 (06/09/2026) los datos se mantienen tal cual: sesiones de pretemporada en su día real y amistosos con RPE 10 × minutos declarados (máx. 90).',
  'Desde la J1 los partidos de liga solo se calculan con el acta: RPE 10 × minutos jugados. Los RPE de partido del formulario se descartan.',
  'Desde la J1 los RPE de entrenamiento pertenecen a una de las tres sesiones semanales (martes, jueves o viernes). Los registros fechados otro día se asignan a una de ellas.',
  'Envíos aislados antes de la J1: a la sesión de equipo de 1–3 días antes; si ya la tenía, entrenamiento adicional.']
s['incidents'] = s['incidents'] + inc
s['sessions'].sort(key=lambda x: x['date']); s['entries'].sort(key=lambda e: (e['date'], e['player']))
json.dump(s, open(out, 'w'), ensure_ascii=False, indent=1)
print('\n'.join(inc)); print(len(s['sessions']), 'sesiones,', len(s['entries']), 'registros')
c = collections.Counter((e['type'], ['L','M','X','J','V','S','D'][D(e['date']).weekday()]) for e in s['entries'] if e['date'] > J1); print(c)
