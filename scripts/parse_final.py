
import pandas as pd, json, math

def clean_val(v):
    if v is None: return ''
    if isinstance(v, float):
        if math.isnan(v) or math.isinf(v): return ''
        if v == int(v): return str(int(v))
        return str(v)
    return str(v).strip()

# Cable
df_c = pd.read_excel(r'C:\Users\FREE\Desktop\sample cable list.xls', engine='openpyxl', dtype=str)
df_c = df_c.fillna('')
print("Cable cols:", list(df_c.columns))
print("Cable rows:", len(df_c))

# Node
df_n = pd.read_excel(r'C:\Users\FREE\Desktop\sample-node.xls', engine='openpyxl', dtype=str)
df_n = df_n.fillna('')
print("Node cols:", list(df_n.columns))
print("Node rows:", len(df_n))

cables = df_c.to_dict('records')
nodes = df_n.to_dict('records')

result = {
    'cable_headers': list(df_c.columns),
    'cables': cables,
    'node_headers': list(df_n.columns),
    'nodes': nodes
}

with open(r'C:\Users\FREE\Desktop\parsed_data.json', 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print("Sample cable[0]:", json.dumps(cables[0], ensure_ascii=False))
print("Sample node[0]:", json.dumps(nodes[0], ensure_ascii=False))
print("DONE")
