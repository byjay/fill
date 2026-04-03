
import json, os

with open(r'C:\Users\FREE\Desktop\app_data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

cables = data['cables']
nodes = data['nodes']

# Split cables into chunks of 12
cable_chunks = [cables[i:i+12] for i in range(0, len(cables), 12)]
node_chunks = [nodes[i:i+20] for i in range(0, len(nodes), 20)]

out_dir = r'C:\Users\FREE\Desktop\chunks'
os.makedirs(out_dir, exist_ok=True)

# Generate init snippet
with open(f'{out_dir}\\chunk_00_init.js', 'w', encoding='utf-8') as f:
    f.write("window.__cables=[]; window.__nodes=[]; console.log('INIT OK');")

# Cable chunks
for i, chunk in enumerate(cable_chunks):
    js = f"window.__cables=window.__cables.concat({json.dumps(chunk,ensure_ascii=False)}); console.log('cables chunk {i+1}/{len(cable_chunks)} - total:', window.__cables.length);"
    with open(f'{out_dir}\\chunk_c{i+1:02d}.js', 'w', encoding='utf-8') as f:
        f.write(js)
    print(f"Cable chunk {i+1}: {len(js)} chars, {len(chunk)} items")

# Node chunks  
for i, chunk in enumerate(node_chunks):
    js = f"window.__nodes=window.__nodes.concat({json.dumps(chunk,ensure_ascii=False)}); console.log('nodes chunk {i+1}/{len(node_chunks)} - total:', window.__nodes.length);"
    with open(f'{out_dir}\\chunk_n{i+1:02d}.js', 'w', encoding='utf-8') as f:
        f.write(js)
    print(f"Node chunk {i+1}: {len(js)} chars, {len(chunk)} items")

# Final fetch snippet
sid = 'guest_%EA%B9%80%EB%B4%89%EC%A0%95_mni34i7t'
proj_id = 'proj_1775171251369'
final_js = f"""
fetch('/api/projects/{proj_id}', {{
  method: 'PUT',
  headers: {{'Content-Type':'application/json','Authorization':'Bearer {sid}'}},
  body: JSON.stringify({{
    cables: window.__cables,
    nodes: window.__nodes,
    history: [{{id:'h1',timestamp:new Date().toISOString(),action:'file_upload',description:'케이블 '+window.__cables.length+'개 노드 '+window.__nodes.length+'개',cableCount:window.__cables.length,nodeCount:window.__nodes.length}}]
  }})
}}).then(r=>r.json()).then(d=>console.log('PUT OK:',JSON.stringify(d))).catch(e=>console.error('ERR:',e));
'fetch sent - cables:'+window.__cables.length+' nodes:'+window.__nodes.length;
"""
with open(f'{out_dir}\\chunk_ZZ_send.js', 'w', encoding='utf-8') as f:
    f.write(final_js)

print(f"\nTotal: {len(cable_chunks)} cable chunks + {len(node_chunks)} node chunks + 1 send")
print("Files in:", out_dir)
for fn in sorted(os.listdir(out_dir)):
    size = os.path.getsize(f'{out_dir}\\{fn}')
    print(f"  {fn}: {size} bytes")
