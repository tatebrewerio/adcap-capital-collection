# Builds the site's data/ and img/ folders from the extracted AdCap 9.28 assets.
import json,os,shutil,re,sys
V='/home/claude/b/v2';EX='/home/claude/extract';OUT=sys.argv[1]
GUID=json.load(open(sys.argv[2]))
os.makedirs(OUT+'/data/ui',exist_ok=True);os.makedirs(OUT+'/img/ui',exist_ok=True);os.makedirs(OUT+'/img/items',exist_ok=True);os.makedirs(OUT+'/fonts',exist_ok=True)
PREFABS=['CareerScreen','EquipmentGridRow','EquipmentItemView','EquipmentItemDetailsPopup','ChangingRoomView','ChangingRoomEquipmentItemView','SwagContainer_earth','InfoPopup','InfoPopupBodyItemView']
uidir=V+'/data/ui';files=sorted(os.listdir(uidir))
def pf(name):
    for f in files:
        if f==name+'.json' or f.startswith(name+'__'):return os.path.join(uidir,f)
used=set()
def walk(n):
    for c in n.get('components',[]):
        s=c.get('sprite')
        if isinstance(s,dict) and s.get('file'):used.add(s['file'])
        if c.get('texture'):used.add(c['texture'])
    for ch in n.get('children',[]):walk(ch)
for p in PREFABS:
    j=json.load(open(pf(p)));walk(j);json.dump(j,open(f'{OUT}/data/ui/{p}.json','w'),separators=(',',':'))
extra=['btn-modal-close-tint','circle-md','icon-rarity-star']
for f in used:
    src=V+'/assets/ui/'+f
    if os.path.exists(src):shutil.copy(src,OUT+'/img/ui/'+f)
    else:print('missing ui sprite',f)
# nav tab icons are runtime art (CareerScreen sets them from the static manifest)
spr={}
for d in [EX+'/sprites',EX+'/core',EX+'/prefabs/sprites']:
    for f in os.listdir(d):
        if f.endswith('.png'):spr.setdefault(f[:-4].lower(),os.path.join(d,f))
def copyart(name,sub):
    if not name:return None
    p=spr.get(name.lower()) or spr.get(name.lower().replace(' ','_'))
    if not p:print('missing art',name);return None
    dst=f'{OUT}/img/{sub}/{os.path.basename(p)}'
    if not os.path.exists(dst):shutil.copy(p,dst)
    return f'img/{sub}/{os.path.basename(p)}'
for icon in ['icon-tab-career-changingroom','icon-tab-career-inventory','icon-tab-career-stats','icon-male','icon-female','ui-icon-male','ui-icon-female']:
    if icon.lower() in spr:copyart(icon,'ui')
eng=json.load(open(V+'/data/english.json'))
eq=json.load(open(V+'/data/equipment.json'))
def guidpath(ref):
    if not ref:return None
    p=GUID.get(ref.get('m_AssetGUID'))
    return p[0] if p and p[0] else None
def guidart(ref):
    p=guidpath(ref)
    return os.path.splitext(os.path.basename(p))[0] if p else None
chars={'male':set(),'female':set()}
def charart(ref,gender):
    p=guidpath(ref)
    if not p:return None
    name=os.path.splitext(os.path.basename(p))[0]
    if '/CapitalistMale/' in p:g='male'
    elif '/CapitalistFemale/' in p:g='female'
    else:return None
    chars[g].add(name);return f'img/{g}/{name}.png'
items=[];keys=set()
for i in eq['Items']:
    m=json.load(open(f"{EX}/mono/manifest.{i['ID']}.json"))
    t=(m.get('titleKey') or {}).get('id');d=(m.get('descriptionKey') or {}).get('id')
    it={k:i.get(k) for k in ['ID','GroupID','Type','RarityID','MaxLevel','ModifierLocation','ModifierTarget','ModifierEffect','ModifierIntensity','GrowthRate','IsPercentage','SetBonus']}
    it['Name']=eng.get(t,i.get('Name'));it['Description']=eng.get(d,i.get('Description'))
    icon=guidart(m.get('GalleryIcon'))
    # A few manifests in the Equipment/Swag folder resolve to a neighbouring icon (for example the Alabaster
    # Master Top Hat to Default_Earth_Red_Suit_Icon). The character layer they share a name with is always
    # right, so when the icon does not match the item's slot use "<character layer>_Icon" if it exists.
    male=guidart(m.get('MaleIcon')) if i['Type'] in('head','shirt','pants') else None
    want={'head':'_head','shirt':'_shirt','pants':'_pants'}.get(i['Type'])
    if male and want and (not icon or want not in icon.lower()) and (male+'_Icon').lower() in spr:
        icon=male+'_Icon'
    it['Icon']=copyart(icon,'items')
    if i['Type'] in('head','shirt','pants'):
        it['Male']=charart(m.get('MaleIcon'),'male');it['Female']=charart(m.get('FemaleIcon'),'female')
    items.append(it)
# set display names
sets={}
for f in os.listdir(EX+'/mono'):
    if f.startswith('manifest.equipment.set.'):
        m=json.load(open(EX+'/mono/'+f));sid=f[len('manifest.'):-5]
        k=None
        for key in ('titleKey','nameKey','locString','title'):
            v=m.get(key)
            if isinstance(v,dict) and v.get('id'):k=v['id'];break
        sets[sid]={'Name':eng.get(k,k)}
want=['ID_INVENTORY','ID_EQUIP','ID_UNEQUIP','ID_EQUIPPED','ID_VIEWING','ID_SORT','ID_NO_ITEM_IN_INVENTORY_TEXT','ID_NUM_PIECES_EQUIPPED','ID_INFO_BTN_CAREER_INVENTORY_TITLE','ID_INFO_BTN_ANSWER_CAREER_CAPITAL_COLLECTION','ID_CLOSE','ID_SWAP','ID_CAREER','ID_SWAG','ID_STATS','ID_STATISTICS','ID_HAT','ID_JACKET','ID_PANTS','ID_BADGE','ID_BADGES','ID_HATS','ID_JACKETS','ID_TROPHY','ID_TROPHIES','ID_ALL','ID_RARITY','ID_LEVEL','ID_MAX','ID_EARTH','ID_MOON','ID_MARS','ID_EVENTS','ID_PLANETS']
strings={k:eng[k] for k in eng if k in want or re.match(r'ID_RARITY_|ID_PLANET_DISPLAY_NAME_|ID_INFO_BTN_.*CAREER',k)}
for k in want:
    if k not in eng:print('no loc',k)
info=json.load(open(V+'/data/info-popups.json'))
json.dump({'items':items,'rarities':eq['Rarities'],'rarityOrder':eq['RarityOrder'],'sets':sets,'strings':strings,'info':{k:v for k,v in info.items() if 'career' in k or 'inventory' in k or 'swag' in k}},open(OUT+'/data/items.json','w'),separators=(',',':'),ensure_ascii=False)
shutil.copy(V+'/data/theme.json',OUT+'/data/theme.json')
for f in ['marytodd-atlas.png','marytodd-metrics.json','tabitha-atlas.png','tabitha-metrics.json']:shutil.copy(V+'/assets/'+f,OUT+'/fonts/'+f)
json.dump({k:sorted(v) for k,v in chars.items()},open(OUT+'/../chars.json','w'))
print(len(items),'items',len(used),'ui sprites',len(os.listdir(OUT+'/img/items')),'item images',len(sets),'sets')
