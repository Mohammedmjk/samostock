import React, { useState, useRef, useMemo } from 'react';
import { 
  Plus, 
  Upload, 
  Barcode, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  FileSpreadsheet, 
  Download, 
  ArrowRight, 
  Trash2, 
  Boxes, 
  HelpCircle,
  Tag,
  Search,
  Package,
  Check,
  RefreshCw,
  Building,
  DollarSign,
  Gift,
  Calendar,
  AlertTriangle,
  Camera
} from 'lucide-react';
import { Product, WarehouseSettings, calculateMeltedPrice } from '../types';
import { GLOBAL_DOSAGE_FORMS, getDosageFormLabel } from '../data/dosageForms';
import { useHardwareBarcodeScanner } from '../hooks/useHardwareBarcodeScanner';

const CameraBarcodeScannerModal = React.lazy(() => import('./CameraBarcodeScannerModal').then(m => ({ default: m.CameraBarcodeScannerModal })));

interface AddMaterialsPageProps {
  products: Product[];
  onAddProduct: (product: Omit<Product, 'id'>) => void;
  onBatchAddProducts?: (newProducts: Omit<Product, 'id'>[]) => void;
  onNavigateBack: () => void;
  settings: WarehouseSettings;
}

export const AddMaterialsPage: React.FC<AddMaterialsPageProps> = ({
  products,
  onAddProduct,
  onBatchAddProducts,
  onNavigateBack,
  settings,
}) => {
  const [activeTab, setActiveTab] = useState<'manual' | 'import'>('manual');

  // Manual Form State
  const [tradeNameAr, setTradeNameAr] = useState('');
  const [tradeNameEn, setTradeNameEn] = useState('');
  const [scientificName, setScientificName] = useState('');
  const [category, setCategory] = useState('مضادات حيوية');
  const [manufacturer, setManufacturer] = useState('');
  const [dosageForm, setDosageForm] = useState('أقراص');
  const [strength, setStrength] = useState('500 mg');
  const [packSize, setPackSize] = useState('عبوة 20 قرص');
  const [storageCondition, setStorageCondition] = useState('حرارة الغرفة 15-25°C');
  const [batchNumber, setBatchNumber] = useState(`LOT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
  const [expiryDate, setExpiryDate] = useState(`${new Date().getFullYear() + 2}-12`);
  const [stockQuantity, setStockQuantity] = useState<number>(100);
  const [minStockLevel, setMinStockLevel] = useState<number>(20);
  const [wholesalePrice, setWholesalePrice] = useState<number>(5000);
  const [bonusPercentage, setBonusPercentage] = useState<number>(0);
  const [description, setDescription] = useState('');

  // Barcode & Aliases State
  const [barcode, setBarcode] = useState('');
  const [aliases, setAliases] = useState<string[]>([]);
  const [aliasInput, setAliasInput] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Camera & Hardware Barcode Scanning State
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<'primary' | 'alias'>('primary');

  // USB/Bluetooth HID Barcode Reader Hook
  useHardwareBarcodeScanner({
    onScan: (scanned) => {
      if (activeTab === 'manual') {
        setBarcode(scanned);
        setFeedbackMsg({
          type: 'success',
          text: `تم مسح الباركود عبر القارئ الليزري: ${scanned}`,
        });
        setTimeout(() => setFeedbackMsg(null), 3500);
      }
    },
    enabled: !isCameraOpen,
  });

  // Bulk Import State
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importSearchTerm, setImportSearchTerm] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto Generate Barcode (13 digits standard EAN-13 compatible)
  const handleGenerateBarcode = () => {
    let newBarcode = '';
    let isDuplicate = true;
    let attempts = 0;

    while (isDuplicate && attempts < 50) {
      // EAN-13 style random prefix (e.g. 625 for Jordan/Iraq regional pharma or 890)
      const prefix = '625';
      const randomPart = Math.floor(100000000 + Math.random() * 900000000).toString();
      const code12 = (prefix + randomPart).slice(0, 12);
      
      // Calculate EAN-13 check digit
      let sum = 0;
      for (let i = 0; i < 12; i++) {
        const digit = parseInt(code12[i], 10);
        sum += i % 2 === 0 ? digit : digit * 3;
      }
      const checkDigit = (10 - (sum % 10)) % 10;
      newBarcode = code12 + checkDigit;

      // Check collision
      isDuplicate = products.some(
        (p) => p.barcode === newBarcode || (p.barcodeAliases && p.barcodeAliases.includes(newBarcode))
      );
      attempts++;
    }

    setBarcode(newBarcode);
    setFeedbackMsg({
      type: 'success',
      text: `تم توليد باركود تلقائي مميز غير مكرر: ${newBarcode}`,
    });
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  // Smart Barcode Matching Checker
  const matchingExistingProduct = useMemo(() => {
    const clean = barcode.trim();
    if (!clean || clean.length < 4) return null;
    return products.find(
      (p) => p.barcode === clean || (p.barcodeAliases && p.barcodeAliases.includes(clean))
    );
  }, [barcode, products]);

  // Handle adding an alias barcode
  const handleAddAlias = () => {
    const clean = aliasInput.trim();
    if (!clean) return;
    if (clean === barcode) {
      setFeedbackMsg({ type: 'error', text: 'الباركود البديل لا يمكن أن يتطابق مع الباركود الأساسي' });
      return;
    }
    if (aliases.includes(clean)) {
      setFeedbackMsg({ type: 'error', text: 'الباركود البديل مضاف مسبقاً في القائمة' });
      return;
    }
    setAliases([...aliases, clean]);
    setAliasInput('');
  };

  const handleRemoveAlias = (index: number) => {
    setAliases(aliases.filter((_, i) => i !== index));
  };

  // Submit Manual Product
  const handleSubmitManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tradeNameAr.trim() && !tradeNameEn.trim()) {
      setFeedbackMsg({ type: 'error', text: 'يرجى إدخال اسم الدواء التجاري (عربي أو إنجليزي)' });
      return;
    }

    let finalBarcode = barcode.trim();
    if (!finalBarcode) {
      // Auto generate if empty
      const prefix = '625';
      const randomPart = Math.floor(100000000 + Math.random() * 900000000).toString();
      finalBarcode = (prefix + randomPart).slice(0, 13);
    }

    const melted = calculateMeltedPrice(wholesalePrice, bonusPercentage);

    const newProduct: Omit<Product, 'id'> = {
      barcode: finalBarcode,
      barcodeAliases: aliases.length > 0 ? aliases : undefined,
      tradeNameAr: tradeNameAr.trim() || tradeNameEn.trim(),
      tradeNameEn: tradeNameEn.trim() || tradeNameAr.trim(),
      scientificName: scientificName.trim() || 'غير محدد',
      category: category.trim() || 'أدوية عامة',
      manufacturer: manufacturer.trim() || 'شركة دوائية معتمدة',
      dosageForm: dosageForm.trim() || 'أقراص',
      strength: strength.trim() || '',
      packSize: packSize.trim() || '',
      storageCondition: storageCondition.trim() || 'حرارة الغرفة 15-25°C',
      batchNumber: batchNumber.trim() || `LOT-${new Date().getFullYear()}-001`,
      expiryDate: expiryDate.trim() || `${new Date().getFullYear() + 2}-12`,
      stockQuantity: Number(stockQuantity) || 0,
      minStockLevel: Number(minStockLevel) || 10,
      wholesalePrice: Number(wholesalePrice) || 0,
      bonusPercentage: Number(bonusPercentage) || 0,
      meltedPrice: melted,
      isAvailable: Number(stockQuantity) > 0,
      description: description.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };

    onAddProduct(newProduct);
    setFeedbackMsg({
      type: 'success',
      text: `تمت إضافة المادة (${newProduct.tradeNameAr}) بنجاح إلى المستودع!`,
    });

    // Reset Form for next entry
    setTradeNameAr('');
    setTradeNameEn('');
    setScientificName('');
    setBarcode('');
    setAliases([]);
    setBatchNumber(`LOT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
  };

  // Download Sample Excel Template
  const handleDownloadTemplate = async () => {
    const sampleData = [
      {
        'الاسم التجاري عربي': 'بنادول إكسترا أقراص',
        'الاسم التجاري إنجليزي': 'Panadol Extra Tablets',
        'الاسم العلمي': 'Paracetamol + Caffeine',
        'الباركود': '6251234567890',
        'الباركود البديل (مفصول بفاصلة)': '6251234567891, 6251234567892',
        'الفئة': 'مسكنات وخافض حرارة',
        'الشركة المصنعة': 'GSK GlaxoSmithKline',
        'الشكل الصيدلاني': 'أقراص',
        'التركيز': '500mg / 65mg',
        'حجم العبوة': 'عبوة 24 قرص',
        'رقم الوجبة LOT': 'LOT-2026-440',
        'تاريخ الصلاحية (YYYY-MM)': '2028-12',
        'الكمية الحالية': 150,
        'الحد الأدنى': 25,
        'سعر الجملة': 3500,
        'نسبة البونص %': 10,
      },
      {
        'الاسم التجاري عربي': 'أوغمنتين 1 غرام',
        'الاسم التجاري إنجليزي': 'Augmentin 1g Tab',
        'الاسم العلمي': 'Amoxicillin + Clavulanic acid',
        'الباركود': '6259876543210',
        'الباركود البديل (مفصول بفاصلة)': '',
        'الفئة': 'مضادات حيوية',
        'الشركة المصنعة': 'GSK',
        'الشكل الصيدلاني': 'أقراص',
        'التركيز': '1000mg',
        'حجم العبوة': 'عبوة 14 قرص',
        'رقم الوجبة LOT': 'LOT-2026-112',
        'تاريخ الصلاحية (YYYY-MM)': '2027-10',
        'الكمية الحالية': 80,
        'الحد الأدنى': 20,
        'سعر الجملة': 8500,
        'نسبة البونص %': 0,
      },
    ];

    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'قالب استيراد الأدوية');
    XLSX.writeFile(wb, `قالب_استيراد_أدوية_المستودع.xlsx`);
  };

  // Process Excel File
  const handleProcessFile = (file: File) => {
    setImportError(null);
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const XLSX = await import('xlsx');
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json: any[] = XLSX.utils.sheet_to_json(worksheet);

        if (!json || json.length === 0) {
          setImportError('الملف المختار فارغ أو لا يحتوي على صفوف بيانات صالحة.');
          return;
        }

        // Map and normalize rows
        const normalized = json.map((row, index) => {
          const tradeAr = row['الاسم التجاري عربي'] || row['اسم المادة'] || row['tradeNameAr'] || row['Name'] || '';
          const tradeEn = row['الاسم التجاري إنجليزي'] || row['tradeNameEn'] || '';
          const scientific = row['الاسم العلمي'] || row['scientificName'] || '';
          const bar = String(row['الباركود'] || row['barcode'] || row['كود'] || '').trim();
          const aliasRaw = String(row['الباركود البديل (مفصول بفاصلة)'] || row['barcodeAliases'] || '');
          const aliasesParsed = aliasRaw ? aliasRaw.split(/[,،]/).map(s => s.trim()).filter(Boolean) : [];
          
          const cat = row['الفئة'] || row['category'] || 'أدوية عامة';
          const mfr = row['الشركة المصنعة'] || row['الشركة'] || row['manufacturer'] || 'عام';
          const form = row['الشكل الصيدلاني'] || row['dosageForm'] || 'أقراص';
          const str = String(row['التركيز'] || row['strength'] || '');
          const pack = String(row['حجم العبوة'] || row['packSize'] || '');
          const lot = String(row['رقم الوجبة LOT'] || row['رقم التشغيلة'] || row['batchNumber'] || `LOT-${new Date().getFullYear()}-${index + 100}`);
          const exp = String(row['تاريخ الصلاحية (YYYY-MM)'] || row['تاريخ الصلاحية'] || row['expiryDate'] || `${new Date().getFullYear() + 2}-12`);
          const qty = Number(row['الكمية الحالية'] || row['الكمية'] || row['stockQuantity'] || 0);
          const minQty = Number(row['الحد الأدنى'] || row['minStockLevel'] || 10);
          const price = Number(row['سعر الجملة'] || row['السعر'] || row['wholesalePrice'] || 0);
          const bonus = Number(row['نسبة البونص %'] || row['البونص'] || row['bonusPercentage'] || 0);

          return {
            id: `import-${index}-${Date.now()}`,
            tradeNameAr: tradeAr || tradeEn || `مادة غير مسماة ${index + 1}`,
            tradeNameEn: tradeEn || tradeAr || '',
            scientificName: scientific || 'غير محدد',
            barcode: bar || `${Math.floor(1000000000000 + Math.random() * 9000000000000)}`,
            barcodeAliases: aliasesParsed,
            category: cat,
            manufacturer: mfr,
            dosageForm: form,
            strength: str,
            packSize: pack,
            batchNumber: lot,
            expiryDate: exp,
            stockQuantity: qty,
            minStockLevel: minQty,
            wholesalePrice: price,
            bonusPercentage: bonus,
            isValid: Boolean(tradeAr || tradeEn),
          };
        });

        setImportRows(normalized);
      } catch (err: any) {
        setImportError('حدث خطأ أثناء قراءة ملف Excel: ' + (err.message || 'تأكد من صيغة الملف'));
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleConfirmImport = () => {
    if (importRows.length === 0) return;
    setIsImporting(true);

    const validNewProducts: Omit<Product, 'id'>[] = importRows
      .filter((r) => r.isValid)
      .map((r) => ({
        barcode: r.barcode,
        barcodeAliases: r.barcodeAliases.length > 0 ? r.barcodeAliases : undefined,
        tradeNameAr: r.tradeNameAr,
        tradeNameEn: r.tradeNameEn,
        scientificName: r.scientificName,
        category: r.category,
        manufacturer: r.manufacturer,
        dosageForm: r.dosageForm,
        strength: r.strength,
        packSize: r.packSize,
        storageCondition: 'حرارة الغرفة 15-25°C',
        batchNumber: r.batchNumber,
        expiryDate: r.expiryDate,
        stockQuantity: r.stockQuantity,
        minStockLevel: r.minStockLevel,
        wholesalePrice: r.wholesalePrice,
        bonusPercentage: r.bonusPercentage,
        meltedPrice: calculateMeltedPrice(r.wholesalePrice, r.bonusPercentage),
        isAvailable: r.stockQuantity > 0,
        updatedAt: new Date().toISOString(),
      }));

    if (onBatchAddProducts) {
      onBatchAddProducts(validNewProducts);
    } else {
      validNewProducts.forEach((p) => onAddProduct(p));
    }

    setIsImporting(false);
    setFeedbackMsg({
      type: 'success',
      text: `تم استيراد وإدراج ${validNewProducts.length} مادة دوائية إلى المستودع بنجاح!`,
    });
    setImportRows([]);
  };

  return (
    <div className="w-full max-w-full overflow-x-hidden px-3 sm:px-6 py-4 sm:py-6 space-y-6 animate-in fade-in duration-200">
      {/* Header Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <button
            onClick={onNavigateBack}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
            title="رجوع"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                <Plus className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-black text-slate-900">
                إضافة المواد والباركود الذكي
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              إدخال مواد دوائية جديدة وتوليد باركود تلقائي أو استيراد مجمع من ملفات Excel
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('manual')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'manual'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>الإدخال اليدوي المباشر</span>
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'import'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>الاستيراد الذكي (Excel / CSV)</span>
          </button>
        </div>
      </div>

      {/* Global Feedback Message */}
      {feedbackMsg && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-sm font-bold animate-in slide-in-from-top ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMsg(null)}
            className="text-xs opacity-70 hover:opacity-100 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* TAB 1: MANUAL DIRECT ENTRY */}
      {activeTab === 'manual' && (
        <form onSubmit={handleSubmitManual} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Main Info */}
            <div className="lg:col-span-2 space-y-6">
              {/* Card 1: Names & Categorization */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
                  <Package className="w-4 h-4 text-blue-600" />
                  <span>البيانات الأساسية للدواء والمادة</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      الاسم التجاري (بالعربية) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: بنادول إكسترا أقراص"
                      value={tradeNameAr}
                      onChange={(e) => setTradeNameAr(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      الاسم التجاري (بالإنجليزي)
                    </label>
                    <input
                      type="text"
                      placeholder="مثال: Panadol Extra 500mg"
                      value={tradeNameEn}
                      onChange={(e) => setTradeNameEn(e.target.value)}
                      dir="ltr"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 text-right"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      الاسم العلمي / المادة الفعالة
                    </label>
                    <input
                      type="text"
                      placeholder="مثال: Paracetamol + Caffeine"
                      value={scientificName}
                      onChange={(e) => setScientificName(e.target.value)}
                      dir="ltr"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 text-right"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      الشركة المصنعة / المصدر *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: GlaxoSmithKline (GSK) أو SDI"
                      value={manufacturer}
                      onChange={(e) => setManufacturer(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      الفئة الدوائية
                    </label>
                    <input
                      type="text"
                      placeholder="مسكنات، مضادات حيوية..."
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      الشكل الصيدلاني
                    </label>
                    <select
                      value={dosageForm}
                      onChange={(e) => setDosageForm(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold text-slate-800"
                    >
                      {GLOBAL_DOSAGE_FORMS.map((f) => (
                        <option key={f.id} value={f.nameAr}>
                          {f.nameAr} ({f.nameEn})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      التركيز
                    </label>
                    <input
                      type="text"
                      placeholder="500mg, 1g..."
                      value={strength}
                      onChange={(e) => setStrength(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Card 2: Batch, Expiry & Quantities */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
                  <Calendar className="w-4 h-4 text-emerald-600" />
                  <span>بيانات الوجبة (LOT) وتواريخ الصلاحية والكميات</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      رقم الوجبة / التشغيلة (LOT) *
                    </label>
                    <input
                      type="text"
                      required
                      value={batchNumber}
                      onChange={(e) => setBatchNumber(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      تاريخ الصلاحية (YYYY-MM أو YYYY-MM-DD) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="2028-12"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      dir="ltr"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold font-mono text-right"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      الكمية المتوفرة بالمستودع *
                    </label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={stockQuantity}
                      onChange={(e) => setStockQuantity(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      الحد الأدنى للإنذار (الكمية الحرجة)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={minStockLevel}
                      onChange={(e) => setMinStockLevel(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Card 3: Pricing & Bonus */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
                  <DollarSign className="w-4 h-4 text-amber-600" />
                  <span>التسعير وتذويب البونص للصيدليات</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      سعر الجملة للصيدلية (د.ع) *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="50"
                      required
                      value={wholesalePrice}
                      onChange={(e) => setWholesalePrice(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      نسبة البونص % (تذوب تلقائياً في السعر)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={bonusPercentage}
                      onChange={(e) => setBonusPercentage(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900"
                    />
                  </div>
                </div>

                {bonusPercentage > 0 && (
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-center justify-between text-xs font-bold text-amber-900">
                    <span>السعر النهائي المذاب للصيدلية:</span>
                    <span className="text-sm font-black text-amber-700">
                      {(calculateMeltedPrice(wholesalePrice || 0, bonusPercentage || 0) ?? 0).toLocaleString()} د.ع
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Right 1 Col: Barcode, Aliases & Smart Matching */}
            <div className="space-y-6">
              {/* Barcode & Aliases Card */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <Barcode className="w-4 h-4 text-blue-600" />
                    <span>الباركود والباركود البديل</span>
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setCameraTarget('primary');
                        setIsCameraOpen(true);
                      }}
                      className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                      title="مسح الباركود عبر الكاميرا"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>مسح بالكاميرا</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleGenerateBarcode}
                      className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>توليد تلقائي</span>
                    </button>
                  </div>
                </div>

                {/* Primary Barcode */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    الباركود الأساسي للمادة *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="امسح بالباركود أو اكتب الرمز"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    dir="ltr"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 text-right"
                  />
                </div>

                {/* Smart Collision / Matching Alert */}
                {matchingExistingProduct && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-1">
                    <div className="flex items-center gap-1.5 text-amber-900 font-bold">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>تنبيه تطابق باركود ذكي:</span>
                    </div>
                    <p className="text-slate-700 leading-relaxed">
                      هذا الباركود مسجل مسبقاً لمادة موجودة بالمستودع:
                      <br />
                      <strong className="text-slate-900 font-black">
                        {matchingExistingProduct.tradeNameAr} ({matchingExistingProduct.tradeNameEn})
                      </strong>
                    </p>
                  </div>
                )}

                {/* Barcode Aliases Section */}
                <div className="pt-2 border-t border-slate-100 space-y-2.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      إضافة باركود بديل / مرادف (Alias Barcode)
                    </label>
                    <p className="text-[11px] text-slate-500 mb-2">
                      للمنتجات التي تحمل أكثر من باركود دولي أو تعبئة مستوردة مختلفة.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="أدخل الباركود البديل"
                        value={aliasInput}
                        onChange={(e) => setAliasInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddAlias();
                          }
                        }}
                        dir="ltr"
                        className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-right"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setCameraTarget('alias');
                          setIsCameraOpen(true);
                        }}
                        className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs transition cursor-pointer"
                        title="مسح الباركود البديل بالكاميرا"
                      >
                        <Camera className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleAddAlias}
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                      >
                        إضافة
                      </button>
                    </div>
                  </div>

                  {/* List of Added Aliases */}
                  {aliases.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[11px] font-bold text-slate-600 block">
                        الباركودات البديلة المعتمدة ({aliases.length}):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {aliases.map((al, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800"
                          >
                            <span>{al}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveAlias(idx)}
                              className="text-slate-400 hover:text-rose-600 transition"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Box */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <button
                  type="submit"
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-md shadow-blue-600/20 transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>إضافة المادة واعتمادها بالمستودع</span>
                </button>

                <button
                  type="button"
                  onClick={onNavigateBack}
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition cursor-pointer"
                >
                  إلغاء والرجوع لجدول المخزون
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* TAB 2: SMART BULK IMPORT */}
      {activeTab === 'import' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Top Info & Download Template */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-black text-slate-900">
                استيراد مجمع من ملف Excel / CSV
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                يمكنك تحميل نموذج Excel الجاهز وملء المواد ثم رفعها بضغطة واحدة.
              </p>
            </div>

            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>تحميل نموذج Excel الجاهز</span>
            </button>
          </div>

          {/* Upload Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleProcessFile(file);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`p-8 border-2 border-dashed rounded-2xl text-center transition cursor-pointer ${
              isDragging
                ? 'border-blue-500 bg-blue-50/50'
                : 'border-slate-300 hover:border-blue-400 bg-white'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleProcessFile(file);
              }}
            />

            <div className="max-w-md mx-auto space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto shadow-xs">
                <Upload className="w-7 h-7" />
              </div>
              <h4 className="text-base font-black text-slate-800">
                اضغط هنا لاختيار ملف Excel أو اسحب الملف وأفلته
              </h4>
              <p className="text-xs text-slate-500">
                يدعم الملفات بصيغة (.xlsx, .xls, .csv) مع التعرف الذكي على الأعمدة العربية والإنجليزية
              </p>
            </div>
          </div>

          {importError && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{importError}</span>
            </div>
          )}

          {/* Parsed Rows Preview Table */}
          {importRows.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h4 className="text-sm font-black text-slate-900">
                    معاينة المواد الجاهزة للاستيراد ({importRows.length} مادة)
                  </h4>
                  <p className="text-xs text-slate-500">
                    يرجى مراجعة المواد قبل تأكيد إدراجها في قاعدة بيانات المستودع.
                  </p>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-60">
                    <input
                      type="text"
                      placeholder="بحث في المواد المعاينة..."
                      value={importSearchTerm}
                      onChange={(e) => setImportSearchTerm(e.target.value)}
                      className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
                  </div>

                  <button
                    type="button"
                    onClick={handleConfirmImport}
                    disabled={isImporting}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shrink-0 shadow-xs"
                  >
                    {isImporting ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>تأكيد استيراد المواد ({importRows.length})</span>
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto max-h-96 border border-slate-100 rounded-xl">
                <table className="w-full text-right text-xs min-w-[650px]">
                  <thead className="bg-slate-50 text-slate-700 font-bold sticky top-0">
                    <tr>
                      <th className="p-2.5">المادة</th>
                      <th className="p-2.5">الباركود</th>
                      <th className="p-2.5">الشركة</th>
                      <th className="p-2.5">الصلاحية</th>
                      <th className="p-2.5">الكمية</th>
                      <th className="p-2.5">سعر الجملة</th>
                      <th className="p-2.5">البونص</th>
                      <th className="p-2.5 text-center">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importRows
                      .filter((r) => {
                        if (!importSearchTerm.trim()) return true;
                        const q = importSearchTerm.toLowerCase();
                        return (
                          r.tradeNameAr.toLowerCase().includes(q) ||
                          r.tradeNameEn.toLowerCase().includes(q) ||
                          r.barcode.includes(q)
                        );
                      })
                      .map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2.5 font-bold text-slate-900">
                            {row.tradeNameAr}
                            {row.tradeNameEn && (
                              <span className="block text-[10px] text-slate-400 font-mono">
                                {row.tradeNameEn}
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 font-mono text-slate-600" dir="ltr">
                            {row.barcode}
                          </td>
                          <td className="p-2.5 text-slate-700">{row.manufacturer}</td>
                          <td className="p-2.5 font-mono text-slate-700" dir="ltr">
                            {row.expiryDate}
                          </td>
                          <td className="p-2.5 font-bold text-slate-900">
                            {row.stockQuantity}
                          </td>
                          <td className="p-2.5 font-bold text-emerald-700">
                            {(row.wholesalePrice ?? 0).toLocaleString()} د.ع
                          </td>
                          <td className="p-2.5 text-slate-600">
                            {row.bonusPercentage > 0 ? `${row.bonusPercentage}%` : '-'}
                          </td>
                          <td className="p-2.5 text-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
                              <Check className="w-3 h-3" />
                              <span>صالح</span>
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Camera Barcode Scanner Modal */}
      {isCameraOpen && (
        <React.Suspense fallback={null}>
          <CameraBarcodeScannerModal
            isOpen={true}
            onClose={() => setIsCameraOpen(false)}
            onDetected={(detected) => {
              if (cameraTarget === 'primary') {
                setBarcode(detected);
                setFeedbackMsg({
                  type: 'success',
                  text: `تم مسح الباركود بنجاح: ${detected}`,
                });
                setTimeout(() => setFeedbackMsg(null), 3500);
              } else {
                setAliasInput(detected);
              }
              setIsCameraOpen(false);
            }}
            title={cameraTarget === 'primary' ? 'مسح الباركود الأساسي للمادة' : 'مسح الباركود البديل (Alias)'}
          />
        </React.Suspense>
      )}
    </div>
  );
};
