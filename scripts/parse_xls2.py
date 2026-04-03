
import openpyxl, json

def parse_sheet(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    rows_iter = ws.iter_rows(values_only=True)
    headers = [str(h).strip() if h is not None else '' for h in next(rows_iter)]
    rows = []
    for row in rows_iter:
        r = {}
        skip = True
        for c, h in enumerate(headers):
            v = row[c]
            sv = str(v) if v is not None else ''
            if sv: skip = False
            r[h] = sv
        if not skip:
            rows.append(r)
    wb.close()
    return headers, rows

try:
    ch, crows = parse_sheet(r'C:\Users\FREE\Desktop\sample cable list.xls')
    nh, nrows = parse_sheet(r'C:\Users\FREE\Desktop\sample-node.xls')
    result = {'cable_headers': ch, 'cables': crows[:5], 'node_headers': nh, 'nodes': nrows[:5]}
    print(f"Cable headers: {ch}")
    print(f"Node headers: {nh}")
    print(f"Cables: {len(crows)}, Nodes: {len(nrows)}")
    print("Sample cable:", json.dumps(crows[0], ensure_ascii=False) if crows else 'none')
    print("Sample node:", json.dumps(nrows[0], ensure_ascii=False) if nrows else 'none')

    # Full save
    full = {'cable_headers': ch, 'cables': crows, 'node_headers': nh, 'nodes': nrows}
    with open(r'C:\Users\FREE\Desktop\parsed_data.json', 'w', encoding='utf-8') as f:
        json.dump(full, f, ensure_ascii=False, indent=2)
    print("Saved parsed_data.json")
except Exception as e:
    import traceback; traceback.print_exc()
