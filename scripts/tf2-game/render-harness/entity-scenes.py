"""Writes entity-scenes.json for the render harness (shoot.ts --scenes): TF2 classes on 2fort,
a running scout, a soldier's rocket, buildings, player conditions, deaths and gibs, effects, every
class's view model idle and firing, HL2 NPC stand-ins and a Portal cube.

    python3 scripts/tf2-game/render-harness/entity-scenes.py scripts/tf2-game/render-harness/entity-scenes.json
"""
import json
import sys
CLASSES = [(1,'scout',13),(3,'soldier',18),(7,'pyro',21),(4,'demo',19),(6,'heavy',15),(9,'engineer',9),(5,'medic',17),(2,'sniper',14),(8,'spy',24)]
def player(id, cls, team, x, y, z, yaw, wpn, **kw):
    f = dict(cls=cls, team=team, ox=x, oy=y, oz=z, yaw=yaw, eyeYaw=yaw, eyePitch=0, lifeState=0, onGround=True,
             activeWeapon=wpn, activeSlot=0, vx=0, vy=0, vz=0, health=125, maxHealth=125, animEvent=0, animEventSeq=0)
    f.update(kw)
    return dict(id=id, type='player', fields=f, ground=True)
scenes = {}
t = []
# 1. all classes, RED row and BLU row, red spawn exit courtyard
for team, tn in ((2,'red'),(3,'blu')):
    ents = [player(10+i, c, team, 1130, 1250 + i*50, 300, 0, w) for i,(c,n,w) in enumerate(CLASSES)]
    t.append(dict(name='classes-'+tn, view=dict(origin=[1440,1450,320], angles=[6,180,0], fov=80), entities=ents, script=[dict(advance=0.5)]))
t.append(dict(name='scout-single', view=dict(origin=[1420,1440,330], angles=[10,180,0], fov=90), entities=[player(1,1,2,1250,1440,300,0,13)], script=[dict(advance=0.3)]))
# running scout mid stride (moving +y relative to view, facing camera-left)
t.append(dict(name='scout-run', view=dict(origin=[1420,1440,330], angles=[10,180,0], fov=70),
   entities=[player(1,1,2,1250,1440,300,90,13, vx=0, vy=400)], script=[dict(advance=0.37)]))
# soldier firing a rocket with trail
sol = player(1,3,3,1250,1380,300,90,18)
rocket = dict(id=2, type='projectile', fields=dict(ox=1250, oy=1420, oz=360, pitch=0, yaw=90, roll=0, model='models/weapons/w_models/w_rocket.mdl', team=3, critical=0, vx=0, vy=1100, vz=0))
t.append(dict(name='soldier-rocket', view=dict(origin=[1450,1480,350], angles=[8,180,0], fov=80), entities=[sol, rocket],
   script=[dict(advance=0.3), dict(patch=dict(id=1, fields=dict(animEvent=0, animEventSeq=1))), dict(advance=0.12)] + [x for k in range(12) for x in (dict(patch=dict(id=2, fields=dict(oy=1420+ (k+1)*20))), dict(advance=1/30))]))
# buildings
blds = [
  dict(id=50, type='sentrygun', fields=dict(ox=1150, oy=1300, oz=280, yaw=0, model='models/buildables/sentry3.mdl', team=2, level=3, health=216, maxHealth=216, aimYaw=-30, aimPitch=-10, fireSeq=0, muzzle=0), ground=True),
  dict(id=51, type='dispenser', fields=dict(ox=1150, oy=1440, oz=280, yaw=0, model='models/buildables/dispenser_lvl3_light.mdl', team=2, level=3, health=216, maxHealth=216), ground=True),
  dict(id=52, type='teleporter', fields=dict(ox=1150, oy=1580, oz=280, yaw=0, model='models/buildables/teleporter_light.mdl', team=2, level=3, health=216, maxHealth=216, matchId=53, charge=1), ground=True),
]
t.append(dict(name='buildings', view=dict(origin=[1420,1440,350], angles=[12,180,0], fov=80), entities=blds,
   script=[dict(advance=0.4), dict(patch=dict(id=50, fields=dict(fireSeq=1))), dict(advance=0.05)]))
# conditions: über (INVULNERABLE 5), cloak (STEALTHED 4), burning (22), crit (11), disguised spy seen by RED
cond = lambda *b: sum(1 << x for x in b)
st = [player(1,6,2,1150,1300,300,0,15, cond0=cond(5)), player(2,8,3,1150,1380,300,0,24, cond0=cond(4)),
      player(3,1,3,1150,1460,300,0,13, cond0=cond(22)), player(4,3,2,1150,1540,300,0,18, cond0=cond(11)),
      player(5,8,3,1150,1620,300,0,24, cond0=cond(3), disguiseClass=1, disguiseTeam=2)]
t.append(dict(name='conditions', view=dict(origin=[1420,1460,330], angles=[8,180,0], fov=75), entities=st, script=[dict(advance=0.5)]))
# deaths: a headshot (death sequence) and an explosive gib
dd = [player(1,3,2,1150,1380,300,0,18), player(2,9,3,1150,1520,300,0,9)]
t.append(dict(name='deaths', view=dict(origin=[1420,1450,330], angles=[12,180,0], fov=75), entities=dd, script=[
  dict(advance=0.3),
  dict(event=dict(type='death', victim=1, attacker=2, assister=0, inflictor=0, weapon='sniperrifle', weaponDefIndex=14, crit=2, customKill=1, damageType=0, deathFlags=0, victimClass=3, gib=False, burning=False)),
  dict(event=dict(type='death', victim=2, attacker=1, assister=0, inflictor=0, weapon='rocket', weaponDefIndex=18, crit=2, customKill=0, damageType=0, deathFlags=0, victimClass=9, gib=True, burning=False)),
  dict(patch=dict(id=1, fields=dict(lifeState=2))), dict(patch=dict(id=2, fields=dict(lifeState=2))),
  dict(advance=1.4)]))
# effects: explosion + scorch, tracers, impacts
t.append(dict(name='effects', view=dict(origin=[1420,1440,330], angles=[10,180,0], fov=80), entities=[], script=[
  dict(event=dict(type='effect', kind='explosion', system='ExplosionCore_Wall', pos=dict(x=1150,y=1350,z=280), normal=dict(x=0,y=0,z=1))),
  dict(event=dict(type='effect', kind='decal', system='Scorch', pos=dict(x=1150,y=1350,z=277), normal=dict(x=0,y=0,z=1))),
  dict(event=dict(type='effect', kind='impact', material='concrete', pos=dict(x=1150,y=1550,z=277), normal=dict(x=0,y=0,z=1))),
  dict(event=dict(type='effect', kind='decal', system='Blood', pos=dict(x=1250,y=1550,z=277), normal=dict(x=0,y=0,z=1))),
  dict(event=dict(type='effect', kind='tracer', pos=dict(x=1000,y=1600,z=320), start=dict(x=1350,y=1300,z=320), end=dict(x=1000,y=1600,z=320))),
  dict(advance=0.12)]))
scenes['tf2/ctf_2fort'] = t
# viewmodels: one scene per class idle + firing
vms = []
for c,n,w in CLASSES:
    for fire in (0,1):
        vm = dict(cls=c, team=2, defindex=w, vmActivity=0, vmActivitySeq=1, eyeOrigin=dict(x=1420,y=1440,z=340), eyeAngles=dict(x=0,y=180,z=0), velocity=dict(x=0,y=0,z=0), visible=True)
        script = [dict(advance=0.5)]
        if fire: script += [dict(vm=dict(vmActivity=3, vmActivitySeq=2)), dict(advance=0.06)]
        name = f'vm-{n}-{"fire" if fire else "idle"}'
        vms.append(dict(name=name, view=dict(origin=[1420,1440,340], angles=[0,180,0], fov=90), vm=vm, script=script))
scenes['tf2/ctf_2fort'] += vms
# loadouts (shoot.ts --loadout <dir>; without it the same players render stock): unlock weapons,
# painted cosmetics (two-tone Team Spirit on RED and BLU), a bone-merged coat, a festivized
# Powerjack, unusual effects, and the Direct Hit in first person
lo = [
  player(1,3,2,1150,1290,300,0,127, items='P127/S133w/M6/C183p5046e13/C446p5051'),
  player(2,3,3,1150,1360,300,0,127, items='P127/S133w/M6/C183p5046e13/C446p5051'),
  player(3,7,2,1150,1430,300,0,215, items='P215/S12/M214f/C126p5054e59'),
  player(4,7,3,1150,1500,300,0,214, items='P215/S12/M214f/C126p5054e59'),
  player(5,6,2,1150,1570,300,0,41, items='P41/S11/M5/C378/C734p5051'),
  player(6,5,3,1150,1640,300,0,35, items='P17/S35/M8/C126e19'),
]
scenes['tf2/ctf_2fort'].append(dict(name='loadout-players', view=dict(origin=[1330,1465,345], angles=[10,180,0], fov=75), entities=lo, script=[dict(advance=0.5)]))
scenes['tf2/ctf_2fort'].append(dict(name='loadout-closeup', view=dict(origin=[1290,1325,335], angles=[6,180,0], fov=45), entities=lo[:2], script=[dict(advance=0.5)]))
for fire in (0,1):
    vm = dict(cls=3, team=2, defindex=127, vmActivity=0, vmActivitySeq=1, eyeOrigin=dict(x=1420,y=1440,z=340), eyeAngles=dict(x=0,y=180,z=0), velocity=dict(x=0,y=0,z=0), visible=True)
    script = [dict(advance=0.5)]
    if fire: script += [dict(vm=dict(vmActivity=3, vmActivitySeq=2)), dict(advance=0.06)]
    scenes['tf2/ctf_2fort'].append(dict(name='loadout-vm-directhit-' + ('fire' if fire else 'idle'), view=dict(origin=[1420,1440,340], angles=[0,180,0], fov=90), vm=vm, script=script))

def prop(id, model, x, y, z, yaw, seq='', skin=0, **kw):
    f = dict(model=model, ox=x, oy=y, oz=z, pitch=0, yaw=yaw, roll=0, skin=skin, body=0, sequence=seq, animStart=0, playbackRate=1, modelScale=1)
    f.update(kw)
    return dict(id=id, type='prop', fields=f, ground=True)
scenes['hl2/d1_trainstation_02'] = [dict(name='npcs', view=dict(origin=[-2500,-2500,60], angles=[5,90,0], fov=75), entities=[
  prop(1,'models/humans/group01/male_07.mdl',-2540,-2380,0,270,'ACT_IDLE'),
  prop(2,'models/police.mdl',-2460,-2380,0,250,'ACT_IDLE'),
  prop(3,'models/humans/group01/female_01.mdl',-2600,-2330,0,300,'ACT_IDLE')], script=[dict(advance=0.5)])]
scenes['portal/testchmb_a_00'] = [dict(name='cube', view=dict(origin=[-607,-346,225], angles=[25,0,0], fov=75), entities=[
  prop(1,'models/props/metal_box.mdl',-500,-346,200,30)], script=[dict(advance=0.2)])]

json.dump(scenes, open(sys.argv[1], 'w'), indent=1)
