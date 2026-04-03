
import struct

for fname in ['sample cable list.xls', 'sample-node.xls']:
    path = r'C:\Users\FREE\Desktop\\' + fname
    with open(path, 'rb') as f:
        magic = f.read(8)
    print(f"{fname}: {magic.hex()} ({magic})")
    # D0CF11E0A1B11AE1 = OLE2 (XLS BIFF)
    # 504B0304 = ZIP (XLSX)
    if magic[:4] == b'\xd0\xcf\x11\xe0':
        print("  -> OLE2/BIFF (old XLS)")
    elif magic[:4] == b'PK\x03\x04':
        print("  -> ZIP/XLSX")
    else:
        print("  -> Unknown")

# Try pandas
try:
    import pandas as pd
    df = pd.read_excel(r'C:\Users\FREE\Desktop\sample cable list.xls', engine='xlrd')
    print("pandas xlrd works:", df.shape, list(df.columns[:5]))
except Exception as e:
    print("pandas xlrd error:", e)
    try:
        df = pd.read_excel(r'C:\Users\FREE\Desktop\sample cable list.xls', engine='openpyxl')
        print("pandas openpyxl works:", df.shape, list(df.columns[:5]))
    except Exception as e2:
        print("pandas openpyxl error:", e2)
