
import json
d = json.load(open(r'C:\Users\FREE\Desktop\xls_b64.json'))
open(r'C:\Users\FREE\Desktop\cable_b64.txt', 'w').write(d['cable'])
open(r'C:\Users\FREE\Desktop\node_b64.txt', 'w').write(d['node'])
print("OK cable:", len(d['cable']), "node:", len(d['node']))
