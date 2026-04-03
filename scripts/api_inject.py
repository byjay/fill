
import json, urllib.request, urllib.error

PROJECT_ID = 'proj_1775171251369'
SESSION_ID = 'guest_%EA%B9%80%EB%B4%89%EC%A0%95_mni34i7t'
API_BASE = 'https://scm.seastar.work/api'

with open(r'C:\Users\FREE\Desktop\app_data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

cables = data['cables']
nodes = data['nodes']

history = [{
    'id': 'h-upload-001',
    'timestamp': '2026-04-03T00:00:00.000Z',
    'action': 'file_upload',
    'description': f'케이블 {len(cables)}개, 노드 {len(nodes)}개 업로드',
    'cableCount': len(cables),
    'nodeCount': len(nodes)
}]

payload = json.dumps({'cables': cables, 'nodes': nodes, 'history': history}, ensure_ascii=False).encode('utf-8')

req = urllib.request.Request(
    f'{API_BASE}/projects/{PROJECT_ID}',
    data=payload,
    method='PUT',
    headers={
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {SESSION_ID}',
        'Content-Length': str(len(payload)),
    }
)

print(f"Sending {len(payload)} bytes to {API_BASE}/projects/{PROJECT_ID}...")
print(f"Cables: {len(cables)}, Nodes: {len(nodes)}")

try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read().decode('utf-8'))
        print("SUCCESS:", json.dumps(result, ensure_ascii=False))
except urllib.error.HTTPError as e:
    body = e.read().decode('utf-8')
    print(f"HTTP Error {e.code}: {body}")
except Exception as ex:
    print(f"Error: {ex}")
