
import xlrd, json

def parse_cable(path):
    wb = xlrd.open_workbook(path)
    ws = wb.sheet_by_index(0)
    headers = [str(ws.cell_value(0, c)).strip() for c in range(ws.ncols)]
    rows = []
    for r in range(1, ws.nrows):
        row = {}
        for c, h in enumerate(headers):
            v = ws.cell_value(r, c)
            row[h] = str(v) if v != '' else ''
        rows.append(row)
    return headers, rows

def parse_node(path):
    wb = xlrd.open_workbook(path)
    ws = wb.sheet_by_index(0)
    headers = [str(ws.cell_value(0, c)).strip() for c in range(ws.ncols)]
    rows = []
    for r in range(1, ws.nrows):
        row = {}
        for c, h in enumerate(headers):
            v = ws.cell_value(r, c)
            row[h] = str(v) if v != '' else ''
        rows.append(row)
    return headers, rows

try:
    ch, crows = parse_cable(r'C:\Users\FREE\Desktop\sample cable list.xls')
    nh, nrows = parse_node(r'C:\Users\FREE\Desktop\sample-node.xls')
    result = {'cable_headers': ch, 'cables': crows, 'node_headers': nh, 'nodes': nrows}
    with open(r'C:\Users\FREE\Desktop\parsed_data.json', 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"Cable headers: {ch}")
    print(f"Node headers: {nh}")
    print(f"Cables: {len(crows)}, Nodes: {len(nrows)}")
except Exception as e:
    print(f"Error: {e}")
    # Try openpyxl as fallback
    try:
        import openpyxl
        print("Trying openpyxl...")
    except:
        print("No openpyxl either")
