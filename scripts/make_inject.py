
import json

with open(r'C:\Users\FREE\Desktop\app_data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

cables_json = json.dumps(data['cables'], ensure_ascii=False)
nodes_json = json.dumps(data['nodes'], ensure_ascii=False)

js = f"""
(async function() {{
  // 1. Get session
  const raw = localStorage.getItem('scms_user_session');
  const session = raw ? JSON.parse(raw) : null;
  const userId = session?.id || 'anonymous';
  const headers = {{'Content-Type': 'application/json', 'Authorization': 'Bearer ' + userId}};

  // 2. Get projects
  const projRes = await fetch('/api/projects', {{headers}});
  const projects = await projRes.json();
  console.log('Projects:', projects.length, projects.map(p=>p.name));
  if (!projects.length) {{ console.error('No projects'); return; }}
  const proj = projects[0];
  console.log('Using project:', proj.name, proj.id);

  // 3. Inject cable + node data
  const cables = {cables_json};
  const nodes = {nodes_json};

  const putRes = await fetch('/api/projects/' + proj.id, {{
    method: 'PUT',
    headers,
    body: JSON.stringify({{
      cables,
      nodes,
      history: [...(proj.history || []), {{
        id: 'h-inject-' + Date.now(),
        timestamp: new Date().toISOString(),
        action: 'file_upload',
        description: '케이블 122개, 노드 135개 업로드 (자동 주입)',
        cableCount: cables.length,
        nodeCount: nodes.length
      }}]
    }})
  }});
  const result = await putRes.json();
  console.log('PUT result:', result);
  alert('업로드 완료! 케이블 ' + cables.length + '개, 노드 ' + nodes.length + '개\\n페이지를 새로고침합니다...');
  location.reload();
}})();
"""

with open(r'C:\Users\FREE\Desktop\inject.js', 'w', encoding='utf-8') as f:
    f.write(js)

print(f"inject.js 생성 완료 ({len(js)} chars)")
# Print first 200 chars of cables_json to verify
print("Cables preview:", cables_json[:200])
