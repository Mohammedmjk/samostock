import csv
import json
import re

products = []

with open('./src/data/raw_medicines.csv', mode='r', encoding='utf-8') as f:
    reader = csv.reader(f)
    for idx, row in enumerate(reader):
        if not row or len(row) < 4:
            continue
        name = row[0].strip()
        if not name:
            continue
        barcode = row[1].strip() if len(row) > 1 else ""
        try:
            qty = int(re.sub(r'[^\d]', '', row[2])) if len(row) > 2 and row[2] else 0
        except:
            qty = 0
        try:
            price = int(re.sub(r'[^\d]', '', row[3])) if len(row) > 3 and row[3] else 0
        except:
            price = 0
        expiry = row[5].strip() if len(row) > 5 else "2028-01-01"
        if not expiry:
            expiry = "2028-01-01"
        expiry = expiry.replace('\\', '-').replace('/', '-')

        # Extract dosageForm & manufacturer
        m = name.split()[0] if name.split() else "مذخر سامو"
        dosage = "أقراص"
        lower_name = name.lower()
        if "syrup" in lower_name or "susp" in lower_name or "شراب" in lower_name:
            dosage = "شراب"
        elif "amp" in lower_name or "vial" in lower_name or "iv" in lower_name or "حقن" in lower_name:
            dosage = "حقن / فيال"
        elif "cream" in lower_name or "oint" in lower_name or "كريم" in lower_name or "مرهم" in lower_name or "gel" in lower_name:
            dosage = "مرهم / كريم"
        elif "drop" in lower_name or "قطرة" in lower_name or "eye" in lower_name or "spray" in lower_name or "بخاخ" in lower_name:
            dosage = "قطرات / بخاخ"
        elif "supp" in lower_name or "تحاميل" in lower_name:
            dosage = "تحاميل"
        elif "sachet" in lower_name or "فوار" in lower_name:
            dosage = "أكياس فوارة"
        elif "cap" in lower_name or "كبسول" in lower_name:
            dosage = "كبسول"

        prod_id = f"samo-p{idx+1:04d}"
        if not barcode:
            barcode = f"628{idx+1000000000:010d}"

        products.append({
            "id": prod_id,
            "barcode": barcode,
            "tradeNameAr": name,
            "tradeNameEn": name,
            "scientificName": name,
            "category": "أدوية عامة",
            "manufacturer": m,
            "dosageForm": dosage,
            "strength": "",
            "packSize": "عبوة أصلية",
            "storageCondition": "15-25°C",
            "batchNumber": f"LOT-2025-{idx+1:03d}",
            "expiryDate": expiry,
            "stockQuantity": qty,
            "minStockLevel": 5,
            "wholesalePrice": price,
            "publicPrice": int(price * 1.25) if price > 0 else 0,
            "isAvailable": qty > 0,
        })

output_ts = f"""import {{ Product, WarehouseSettings, Order }} from '../types';

export const initialWarehouseSettings: WarehouseSettings = {{
  name: 'مذخر سامو',
  pharmacistInCharge: 'إدارة مذخر سامو',
  phone: '07700000000',
  altPhone: '',
  address: 'مستودع وتوزيع الأدوية والمستلزمات الطبية',
  licenseNumber: 'SAMO-DEPOT-2024',
  currency: 'د.ع',
  soundAlertEnabled: true,
  minOrderValue: 0,
}};

export const initialProducts: Product[] = {json.dumps(products, ensure_ascii=False, indent=2)};

export const initialOrders: Order[] = [];
"""

with open('./src/data/initialProducts.ts', 'w', encoding='utf-8') as out:
    out.write(output_ts)

print(f"Successfully generated {len(products)} products in ./src/data/initialProducts.ts")
