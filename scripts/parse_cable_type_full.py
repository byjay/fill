import openpyxl, json

wb = openpyxl.load_workbook(r"C:\Users\FREE\Desktop\cable type.xlsx", data_only=True)
ws = wb['JIS']

cables = []
for i, row in enumerate(ws.iter_rows(values_only=True)):
    if i == 0: continue  # header
    if not row[1]: continue  # skip empty cableType
    ct = str(row[1]).strip().replace('\n','')
    od = float(row[2]) if row[2] else 0
    cross = float(row[4]) if row[4] else 0
    weight = float(row[5]) if row[5] else 0
    din = str(row[6] or '').strip()
    desc = str(row[7] or '').strip()
    gland = str(row[8] or '').strip()
    terminal_core = str(row[9] or '').strip() if row[9] else ''
    terminal_ea = int(row[10]) if row[10] and str(row[10]).isdigit() else None

    # Parse conductor section from terminal_core
    import re
    nums = re.findall(r'[\d.]+', terminal_core.split('x')[-1] if 'x' in terminal_core else terminal_core)
    cond_section = float(nums[0]) if nums else None

    cables.append({
        'type': ct,
        'od': od,
        'crossSection': round(cross, 2),
        'weight': weight,
        'din': din,
        'desc': desc,
        'gland': gland,
        'terminalCore': terminal_core,
        'conductorMm2': cond_section,
    })

print(f"Total cable types: {len(cables)}")
print("\nSample conductor sections (type -> conductorMm2):")
for c in cables[:30]:
    print(f"  {c['type']:15s} termCore={c['terminalCore']:10s} -> conductor={c['conductorMm2']}")

# Unique conductor sections
sections = sorted(set(c['conductorMm2'] for c in cables if c['conductorMm2']))
print(f"\nUnique conductor sections: {sections}")
