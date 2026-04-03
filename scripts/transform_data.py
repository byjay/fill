
import pandas as pd, json, math

def safe_float(v, default=0):
    try:
        f = float(str(v).replace(',','').strip())
        return 0 if math.isnan(f) else f
    except:
        return default

def safe_str(v):
    if v is None or (isinstance(v, float) and math.isnan(v)): return ''
    return str(v).strip()

# ── Cables ──
df_c = pd.read_excel(r'C:\Users\FREE\Desktop\sample cable list.xls', engine='openpyxl', dtype=str)
df_c = df_c.fillna('')

cables = []
for i, row in df_c.iterrows():
    name = safe_str(row.get('CABLE_NAME',''))
    if not name: continue
    od = safe_float(row.get('CABLE_OUTDIA',''), 10)
    cables.append({
        'id': f'c-{i}',
        'name': name,
        'type': safe_str(row.get('CABLE_TYPE','')),
        'system': safe_str(row.get('CABLE_SYSTEM','')),
        'fromNode': safe_str(row.get('FROM_NODE','')),
        'toNode': safe_str(row.get('TO_NODE','')),
        'fromRoom': safe_str(row.get('FROM_ROOM','')),
        'toRoom': safe_str(row.get('TO_ROOM','')),
        'fromEquip': safe_str(row.get('FROM_EQUIP','')),
        'toEquip': safe_str(row.get('TO_EQUIP','')),
        'fromRest': safe_float(row.get('FROM_REST',''), 0),
        'toRest': safe_float(row.get('TO_REST',''), 0),
        'length': safe_float(row.get('POR_LENGTH',''), 0),
        'path': safe_str(row.get('CABLE_PATH','')),
        'od': od if od > 0 else 10,
        'checkNode': safe_str(row.get('CHECK_NODE','')),
        'wdPage': safe_str(row.get('WD_PAGE','')),
        'supplyDeck': safe_str(row.get('SUPPLY_DECK','')),
        'porWeight': safe_float(row.get('POR_WEIGHT',''), 0),
        'interference': safe_str(row.get('INTERFERENCE','')),
        'remark': safe_str(row.get('REMARK','')),
        'remark1': safe_str(row.get('REMARK1','')),
        'remark2': safe_str(row.get('REMARK2','')),
        'remark3': safe_str(row.get('REMARK3','')),
        'revision': safe_str(row.get('REVISION','')),
        'cableWeight': safe_float(row.get('CABLE_WEIGHT',''), 0),
    })

# ── Nodes ──
df_n = pd.read_excel(r'C:\Users\FREE\Desktop\sample-node.xls', engine='openpyxl', dtype=str)
df_n = df_n.fillna('')

nodes = []
for i, row in df_n.iterrows():
    name = safe_str(row.get('NODE_RNAME',''))
    if not name: continue
    # Parse POINT field "x,y,z"
    point = safe_str(row.get('POINT',''))
    x, y, z = None, None, None
    if point:
        parts = point.split(',')
        if len(parts) >= 3:
            try: x = float(parts[0])
            except: pass
            try: y = float(parts[1])
            except: pass
            try: z = float(parts[2])
            except: pass
    node = {
        'name': name,
        'structure': safe_str(row.get('STRUCTURE_NAME','')),
        'component': safe_str(row.get('COMPONENT','')),
        'type': safe_str(row.get('NODE_TYPE','')),
        'relation': safe_str(row.get('RELATION','')),
        'linkLength': safe_float(row.get('LINK_LENGTH',''), 0),
        'areaSize': safe_float(row.get('AREA_SIZE',''), 0),
    }
    if x is not None: node['x'] = x
    if y is not None: node['y'] = y
    if z is not None: node['z'] = z
    nodes.append(node)

print(f"Cables: {len(cables)}, Nodes: {len(nodes)}")
print("Sample cable:", json.dumps(cables[0], ensure_ascii=False))
print("Sample node:", json.dumps(nodes[0], ensure_ascii=False))

result = {'cables': cables, 'nodes': nodes}
with open(r'C:\Users\FREE\Desktop\app_data.json', 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False)
print("Saved app_data.json")
