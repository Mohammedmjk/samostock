import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  Edit3, 
  Trash2, 
  AlertTriangle, 
  Clock, 
  Package, 
  CheckCircle2, 
  FileSpreadsheet, 
  Download, 
  Upload,
  Calendar,
  Barcode,
  Building,
  DollarSign,
  Gift,
  X,
  Check,
  AlertCircle,
  RefreshCw,
  FileUp,
  HelpCircle,
  PackageX,
  AlertOctagon,
  Flame,
  Bell,
  Sparkles,
  Scale,
  History,
  Camera,
  ArrowUp,
  ArrowDown,
  Printer,
  CheckSquare,
  Square
} from 'lucide-react';
import { Product, WarehouseSettings, calculateMeltedPrice, AppUser } from '../types';
import { GLOBAL_DOSAGE_FORMS, getDosageFormLabel } from '../data/dosageForms';
import { 
  computeInventoryAlerts, 
  calculateExpiryDetails, 
  calculateStockDetails, 
  exportAlertsReportToExcel 
} from '../services/alertService';
import { useHardwareBarcodeScanner } from '../hooks/useHardwareBarcodeScanner';
import { analyzeFEFOStatus } from '../services/batchService';
import { generateUniqueBarcode, renderBarcodeToSvg } from '../services/barcodeService';
import { BarcodePrintModal, BarcodePrintItem } from './BarcodePrintModal';
import { QuickBarcodeModal } from './QuickBarcodeModal';
import { QuickQuantityModal } from './QuickQuantityModal';

// Subcomponent for real-time SVG barcode rendering in Add/Edit modal
const ModalBarcodeSvgPreview: React.FC<{ barcode: string }> = ({ barcode }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  useEffect(() => {
    if (svgRef.current && barcode) {
      renderBarcodeToSvg(svgRef.current, barcode, {
        height: 32,
        width: 1.3,
        fontSize: 10,
        margin: 2,
      });
    }
  }, [barcode]);

  if (!barcode) return <span className="text-[11px] text-slate-400">لا يوجد باركود حالياً</span>;
  return <svg ref={svgRef} className="max-w-full h-8" />;
};

const InventoryAdjustmentModal = React.lazy(() => import('./InventoryAdjustmentModal').then(m => ({ default: m.InventoryAdjustmentModal })));
const ProductAuditModal = React.lazy(() => import('./ProductAuditModal').then(m => ({ default: m.ProductAuditModal })));
const CameraBarcodeScannerModal = React.lazy(() => import('./CameraBarcodeScannerModal').then(m => ({ default: m.CameraBarcodeScannerModal })));

export type InventoryFilterType = 'all' | 'out_of_stock' | 'low_stock' | 'near_expiry' | 'expired';

interface InventoryManagerProps {
  products: Product[];
  onAddProduct: (product: Omit<Product, 'id'>) => void;
  onBatchAddProducts?: (newProducts: Omit<Product, 'id'>[]) => void;
  onUpdateProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  settings: WarehouseSettings;
  initialFilter?: InventoryFilterType;
  currentUser?: AppUser | null;
}

export const InventoryManager: React.FC<InventoryManagerProps> = ({
  products,
  onAddProduct,
  onBatchAddProducts,
  onUpdateProduct,
  onDeleteProduct,
  settings,
  initialFilter = 'all',
  currentUser = null,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expiryFilter, setExpiryFilter] = useState<InventoryFilterType>(initialFilter);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Modals for Stock Adjustment, Audit Logs, and Barcode Scanning
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [auditingProduct, setAuditingProduct] = useState<Product | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [lastScannedBarcode, setLastScannedBarcode] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Quick Barcode Modal & Quick Quantity Modal & Barcode Printing Modal states
  const [barcodeEditingProduct, setBarcodeEditingProduct] = useState<Product | null>(null);
  const [quantityEditingProduct, setQuantityEditingProduct] = useState<Product | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [productsToPrint, setProductsToPrint] = useState<BarcodePrintItem[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [scanSuccessBanner, setScanSuccessBanner] = useState<{ barcode: string; product: Product } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // High-Speed Barcode Hardware Scanner Hook (HID USB/Bluetooth)
  useHardwareBarcodeScanner({
    onScan: (scannedCode) => {
      setSearchTerm(scannedCode);
      setLastScannedBarcode(scannedCode);
      const match = products.find(
        (p) => (p.barcode && p.barcode.toLowerCase() === scannedCode.toLowerCase()) ||
               (p.barcodeAliases && p.barcodeAliases.some(b => b.toLowerCase() === scannedCode.toLowerCase()))
      );
      if (match) {
        setScanSuccessBanner({ barcode: scannedCode, product: match });
        setTimeout(() => setScanSuccessBanner(null), 6000);
      }
    },
    enabled: !isModalOpen && !isImportModalOpen && !adjustingProduct && !auditingProduct && !isScannerOpen && !isPrintModalOpen && !barcodeEditingProduct && !quantityEditingProduct,
  });

  // Shortcut key F2 to focus the barcode search input
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Sync initialFilter when changed externally (from notifications or dashboard)
  useEffect(() => {
    if (initialFilter) {
      setExpiryFilter(initialFilter);
    }
  }, [initialFilter]);

  // Excel / CSV Import State
  const [importedProductsPreview, setImportedProductsPreview] = useState<Omit<Product, 'id'>[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importSearchTerm, setImportSearchTerm] = useState('');
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const desktopListRef = useRef<HTMLDivElement>(null);
  const mobileListRef = useRef<HTMLDivElement>(null);

  const scrollToTop = () => {
    if (desktopListRef.current) {
      desktopListRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (mobileListRef.current) {
      mobileListRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Form State
  const [formData, setFormData] = useState({
    barcode: '',
    tradeNameAr: '',
    tradeNameEn: '',
    scientificName: '',
    category: 'مضادات حيوية',
    manufacturer: '',
    dosageForm: 'أقراص',
    strength: '',
    packSize: '',
    storageCondition: 'حرارة الغرفة 15-25°C',
    batchNumber: '',
    expiryDate: '',
    stockQuantity: 100,
    minStockLevel: 20,
    wholesalePrice: 5000,
    bonusPercentage: 0,
    meltedPrice: 5000,
    bonusBuyQuantity: 10,
    bonusFreeQuantity: 1,
    bonusDescription: '',
    description: '',
  });

  // Manufacturer dropdown filter state
  const [selectedManufacturer, setSelectedManufacturer] = useState<string>('all');

  const categories = useMemo(() => {
    const cats = Array.from(new Set(products.map((p) => p.category).filter(Boolean)));
    return ['all', ...cats];
  }, [products]);

  const manufacturers = useMemo(() => {
    const mfrs: string[] = Array.from(new Set(products.map((p) => (p.manufacturer || '').trim()).filter(Boolean)));
    mfrs.sort((a, b) => a.localeCompare(b, 'ar'));
    return ['all', ...mfrs];
  }, [products]);

  // Compute alerts summary for quick filter counters and notifications
  const alerts = useMemo(() => computeInventoryAlerts(products), [products]);

  // Check if current search term matches any product's scientific name (to highlight alternatives)
  const isScientificSearchActive = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term || term.length < 3) return false;
    return products.some(p => p.scientificName && p.scientificName.toLowerCase().includes(term));
  }, [products, searchTerm]);

  const filteredProducts = useMemo(() => {
    const now = new Date();
    const term = searchTerm.trim().toLowerCase();

    return products.filter((p) => {
      const matchCat = selectedCategory === 'all' || p.category === selectedCategory;
      const matchMfr = selectedManufacturer === 'all' || (p.manufacturer || '').trim() === selectedManufacturer;
      
      const expiry = calculateExpiryDetails(p.expiryDate, now);
      const stock = calculateStockDetails(p);

      let matchFilter = true;
      if (expiryFilter === 'out_of_stock') {
        matchFilter = stock.status === 'out_of_stock';
      } else if (expiryFilter === 'low_stock') {
        matchFilter = stock.status === 'low_stock';
      } else if (expiryFilter === 'near_expiry') {
        matchFilter = expiry.status === 'near' || expiry.status === 'critical';
      } else if (expiryFilter === 'expired') {
        matchFilter = expiry.status === 'expired';
      }

      if (!term) return matchCat && matchMfr && matchFilter;

      // 3-Path Fast Search:
      // Path 1: Barcode match (main barcode or any alias)
      const matchBarcode = (p.barcode && p.barcode.toLowerCase().includes(term)) ||
        (p.barcodeAliases && p.barcodeAliases.some(b => b.toLowerCase().includes(term)));

      // Path 2: Trade name flexible match (Arabic or English)
      const matchTrade = (p.tradeNameAr && p.tradeNameAr.toLowerCase().includes(term)) ||
        (p.tradeNameEn && p.tradeNameEn.toLowerCase().includes(term));

      // Path 3: Scientific name match (retrieves all alternative trade products sharing this active ingredient)
      const matchScientific = p.scientificName && p.scientificName.toLowerCase().includes(term);

      // Other secondary attributes (batch, manufacturer)
      const matchOther = (p.batchNumber && p.batchNumber.toLowerCase().includes(term)) ||
        (p.manufacturer && p.manufacturer.toLowerCase().includes(term));

      return matchCat && matchMfr && matchFilter && (matchBarcode || matchTrade || matchScientific || matchOther);
    });
  }, [products, selectedCategory, selectedManufacturer, expiryFilter, searchTerm]);

  // Performance optimization: window rendering limit for instant DOM paints
  const [displayLimit, setDisplayLimit] = useState<number>(50);

  // Reset limit when user searches or switches filter
  useEffect(() => {
    setDisplayLimit(50);
  }, [searchTerm, selectedCategory, selectedManufacturer, expiryFilter]);

  const visibleProducts = useMemo(() => {
    return filteredProducts.slice(0, displayLimit);
  }, [filteredProducts, displayLimit]);

  const handleOpenAddModal = () => {
    setEditingProduct(null);
    setFormData({
      barcode: generateUniqueBarcode(products),
      tradeNameAr: '',
      tradeNameEn: '',
      scientificName: '',
      category: 'مضادات حيوية',
      manufacturer: '',
      dosageForm: 'أقراص',
      strength: '500 mg',
      packSize: 'عبوة 20 قرص',
      storageCondition: 'حرارة الغرفة 15-25°C',
      batchNumber: `LOT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      expiryDate: `${new Date().getFullYear() + 2}-12`,
      stockQuantity: 150,
      minStockLevel: 25,
      wholesalePrice: 4500,
      bonusPercentage: 0,
      meltedPrice: 4500,
      bonusBuyQuantity: 10,
      bonusFreeQuantity: 1,
      bonusDescription: '',
      description: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (product: Product) => {
    setEditingProduct(product);
    const bPercent = product.bonusPercentage || 0;
    setFormData({
      barcode: product.barcode || '',
      tradeNameAr: product.tradeNameAr,
      tradeNameEn: product.tradeNameEn,
      scientificName: product.scientificName,
      category: product.category,
      manufacturer: product.manufacturer,
      dosageForm: product.dosageForm,
      strength: product.strength,
      packSize: product.packSize,
      storageCondition: product.storageCondition,
      batchNumber: product.batchNumber,
      expiryDate: product.expiryDate,
      stockQuantity: product.stockQuantity,
      minStockLevel: product.minStockLevel,
      wholesalePrice: product.wholesalePrice,
      bonusPercentage: bPercent,
      meltedPrice: calculateMeltedPrice(product.wholesalePrice, bPercent),
      bonusBuyQuantity: product.bonusBuyQuantity || 10,
      bonusFreeQuantity: product.bonusFreeQuantity || 1,
      bonusDescription: product.bonusDescription || '',
      description: product.description || '',
    });
    setIsModalOpen(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalMelted = calculateMeltedPrice(formData.wholesalePrice, formData.bonusPercentage);
    if (editingProduct) {
      onUpdateProduct({
        ...editingProduct,
        ...formData,
        meltedPrice: finalMelted,
        isAvailable: formData.stockQuantity > 0,
      });
    } else {
      onAddProduct({
        ...formData,
        meltedPrice: finalMelted,
        isAvailable: formData.stockQuantity > 0,
      });
    }
    setIsModalOpen(false);
  };

  // Exact barcode match detection for instant scanner feedback
  const exactBarcodeMatch = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term || term.length < 3) return null;
    return products.find(
      (p) => (p.barcode && p.barcode.toLowerCase() === term) ||
             (p.barcodeAliases && p.barcodeAliases.some(b => b.toLowerCase() === term))
    );
  }, [products, searchTerm]);

  // Fast direct quantity increment / decrement
  const handleQuickDeltaQuantity = (product: Product, delta: number) => {
    const newQty = Math.max(0, product.stockQuantity + delta);
    onUpdateProduct({
      ...product,
      stockQuantity: newQty,
      isAvailable: newQty > 0,
    });
  };

  // Save new quantity from QuickQuantityModal
  const handleSaveQuantity = (productId: string, newQuantity: number) => {
    const target = products.find((p) => p.id === productId);
    if (target) {
      onUpdateProduct({
        ...target,
        stockQuantity: Math.max(0, newQuantity),
        isAvailable: newQuantity > 0,
      });
    }
  };

  // Save new barcode from QuickBarcodeModal
  const handleSaveBarcode = (productId: string, newBarcode: string) => {
    const target = products.find((p) => p.id === productId);
    if (target) {
      onUpdateProduct({
        ...target,
        barcode: newBarcode.trim(),
      });
    }
  };

  // Generate unique barcode directly in 1-click for products lacking barcode
  const handleGenerateBarcodeDirectly = (product: Product) => {
    const newBarcode = generateUniqueBarcode(products);
    onUpdateProduct({
      ...product,
      barcode: newBarcode,
    });
  };

  // Open single product barcode print modal
  const handleOpenSinglePrint = (product: Product) => {
    setProductsToPrint([{ product, copies: 1 }]);
    setIsPrintModalOpen(true);
  };

  // Open batch barcode print modal for selected or all filtered products
  const handleBatchPrintSelectedOrFiltered = () => {
    let itemsToPrint: Product[] = [];
    if (selectedProductIds.size > 0) {
      itemsToPrint = products.filter((p) => selectedProductIds.has(p.id));
    } else {
      itemsToPrint = filteredProducts;
    }

    if (itemsToPrint.length === 0) return;

    setProductsToPrint(
      itemsToPrint.map((product) => ({
        product,
        copies: 1,
      }))
    );
    setIsPrintModalOpen(true);
  };

  // Toggle selection for individual product
  const handleToggleSelectProduct = (productId: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  // Toggle selection for all visible products
  const handleToggleSelectAllVisible = () => {
    const visibleIds = visibleProducts.map((p) => p.id);
    const allSelected = visibleIds.every((id) => selectedProductIds.has(id));

    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleExportCSV = () => {
    const headers = [
      'الباركود',
      'الاسم التجاري',
      'English Name',
      'الاسم العلمي',
      'القسم',
      'الشركة المصنعة',
      'الشكل الصيدلاني',
      'العيار',
      'رقم الوجبة',
      'تاريخ الصلاحية',
      'الرصيد المتوفر',
      'سعر المفرد للصيدلية',
      'نسبة البونص %',
      'السعر بعد تذويب البونص',
      'ملاحظة البونص'
    ];

    const rows = products.map((p) => [
      `"${p.barcode}"`,
      `"${p.tradeNameAr}"`,
      `"${p.tradeNameEn}"`,
      `"${p.scientificName}"`,
      `"${p.category}"`,
      `"${p.manufacturer}"`,
      `"${p.dosageForm}"`,
      `"${p.strength}"`,
      `"${p.batchNumber}"`,
      `"${p.expiryDate}"`,
      p.stockQuantity,
      p.wholesalePrice,
      p.bonusPercentage || 0,
      calculateMeltedPrice(p.wholesalePrice, p.bonusPercentage),
      `"${p.bonusDescription || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `كشف_مخزون_الأدوية_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Download Sample Excel Template for Warehouse Medicines
  const handleDownloadExcelTemplate = async () => {
    const headers = [
      'الباركود',
      'اسم الدواء التجاري (عربي)',
      'الاسم التجاري (إنجليزي)',
      'الاسم العلمي (تركيبة)',
      'الفئة / التصنيف',
      'الشركة المصنعة',
      'الشكل الصيدلاني',
      'الجرعة والقوة',
      'رقم الوجبة Batch',
      'تاريخ الصلاحية والاكسباير (YYYY-MM)',
      'الكمية الكلية المتاحة',
      'سعر المفرد للصيدلية',
      'نسبة البونص %',
      'عرض البونص (اختياري مثل: 10 + 1 مجاناً)',
    ];

    const sampleRows = [
      [
        '6281000000001',
        'باراسيتامول 500 ملغم',
        'Paracetamol 500mg',
        'Paracetamol',
        'مسكنات وخافضات حرارة',
        'سامراء للأدوية SDI',
        'أقراص',
        '500 mg',
        'LOT-2025-01',
        '2027-10',
        250,
        4500,
        10,
        'خصم تذويب 10%',
      ],
      [
        '6281000000002',
        'أموكسيسيلين 500 ملغم',
        'Amoxicillin 500mg',
        'Amoxicillin Trihydrate',
        'مضادات حيوية',
        'فارما العراقية',
        'كبسول',
        '500 mg',
        'LOT-2025-02',
        '2027-04',
        180,
        8500,
        11000,
        '15 + 2 مجاناً',
      ],
      [
        '6281000000003',
        'أوميبرازول 20 ملغم',
        'Omeprazole 20mg',
        'Omeprazole',
        'أدوية الجهاز الهضمي',
        'دار الدواء Hikma',
        'كبسول',
        '20 mg',
        'LOT-2025-03',
        '2026-12',
        100,
        7000,
        9500,
        '20 + 3 مجاناً',
      ],
    ];

    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
    ws['!cols'] = [
      { wch: 16 },
      { wch: 25 },
      { wch: 22 },
      { wch: 22 },
      { wch: 18 },
      { wch: 18 },
      { wch: 14 },
      { wch: 12 },
      { wch: 15 },
      { wch: 20 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 22 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'قائمة_الأدوية');
    XLSX.writeFile(wb, 'نموذج_استيراد_أدوية_مذخر_سامو.xlsx');
  };

  // Parse Excel / CSV File
  const processExcelFile = (file: File) => {
    setImportError(null);
    setImportFileName(file.name);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const XLSX = await import('xlsx');
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          setImportError('الملف لا يحتوي على أي صفحات صالحة.');
          return;
        }
        const worksheet = workbook.Sheets[firstSheetName];
        const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (!rows || rows.length < 2) {
          setImportError('الملف فارغ أو لا يحتوي على صفوف بيانات.');
          return;
        }

        const headerRow: string[] = rows[0].map((h: any) => String(h).trim().toLowerCase());

        const findColIdx = (synonyms: string[]) => {
          return headerRow.findIndex((col) =>
            synonyms.some((s) => col.includes(s.toLowerCase()))
          );
        };

        const barcodeIdx = findColIdx(['باراكود', 'باركود', 'barcode', 'code', 'كود']);
        const nameArIdx = findColIdx(['اسم الدواء', 'الاسم التجاري', 'اسم المادة', 'المادة', 'trade', 'medicine', 'name', 'دواء']);
        const nameEnIdx = findColIdx(['انجليزي', 'en', 'english', 'latin']);
        const sciIdx = findColIdx(['علمي', 'scientific', 'generic']);
        const catIdx = findColIdx(['فئة', 'تصنيف', 'category', 'نوع']);
        const mfgIdx = findColIdx(['شركة', 'مصنع', 'manufacturer', 'company']);
        const formIdx = findColIdx(['شكل', 'صيدلاني', 'dosage', 'form']);
        const strengthIdx = findColIdx(['جرعة', 'قوة', 'strength', 'عيار']);
        const batchIdx = findColIdx(['وجبة', 'تشغيلة', 'batch', 'lot']);
        const expIdx = findColIdx(['صلاحية', 'انتهاء', 'اكسباير', 'expiry', 'exp']);
        const qtyIdx = findColIdx(['كمية', 'عدد', 'مخزون', 'qty', 'quantity', 'stock']);
        const wholesaleIdx = findColIdx(['مفرد', 'سعر المفرد', 'جملة', 'سعر الجملة', 'سعر', 'price', 'wholesale']);
        const bonusPercentIdx = findColIdx(['نسبة البونص', 'تذويب', 'بونص %', 'bonus %', 'percent']);
        const bonusIdx = findColIdx(['بونص', 'مجاني', 'عرض', 'bonus', 'free']);

        const parsed: Omit<Product, 'id'>[] = [];

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.every((c: any) => String(c).trim() === '')) continue;

          const tradeName =
            nameArIdx !== -1 && row[nameArIdx]
              ? String(row[nameArIdx]).trim()
              : String(row[1] || row[0] || '').trim();

          if (!tradeName) continue;

          const tradeNameEn =
            nameEnIdx !== -1 && row[nameEnIdx] ? String(row[nameEnIdx]).trim() : tradeName;
          const barcode =
            barcodeIdx !== -1 && row[barcodeIdx]
              ? String(row[barcodeIdx]).trim()
              : `${Math.floor(6281000000000 + Math.random() * 9999999999)}`;
          const scientificName =
            sciIdx !== -1 && row[sciIdx] ? String(row[sciIdx]).trim() : tradeName;
          const category =
            catIdx !== -1 && row[catIdx] ? String(row[catIdx]).trim() : 'أدوية عامة';
          const manufacturer =
            mfgIdx !== -1 && row[mfgIdx] ? String(row[mfgIdx]).trim() : 'عام';
          const dosageForm =
            formIdx !== -1 && row[formIdx] ? String(row[formIdx]).trim() : 'أقراص';
          const strength =
            strengthIdx !== -1 && row[strengthIdx] ? String(row[strengthIdx]).trim() : '';
          const batchNumber =
            batchIdx !== -1 && row[batchIdx]
              ? String(row[batchIdx]).trim()
              : `LOT-${Date.now().toString().slice(-4)}`;

          let rawExp = expIdx !== -1 && row[expIdx] ? String(row[expIdx]).trim() : '';
          if (typeof row[expIdx] === 'number' && row[expIdx] > 30000) {
            const dateObj = new Date((row[expIdx] - 25569) * 86400 * 1000);
            rawExp = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
          } else if (rawExp && rawExp.length > 7 && rawExp.includes('-')) {
            rawExp = rawExp.slice(0, 7);
          } else if (!rawExp) {
            rawExp = '2027-12';
          }

          const rawQty =
            qtyIdx !== -1 && row[qtyIdx] ? parseFloat(String(row[qtyIdx])) : 100;
          const rawWholesale =
            wholesaleIdx !== -1 && row[wholesaleIdx]
              ? parseFloat(String(row[wholesaleIdx]).replace(/[^0-9.]/g, ''))
              : 5000;
          const rawBonusPercent =
            bonusPercentIdx !== -1 && row[bonusPercentIdx]
              ? parseFloat(String(row[bonusPercentIdx]).replace(/[^0-9.]/g, ''))
              : 0;
          const bonusDesc =
            bonusIdx !== -1 && row[bonusIdx] ? String(row[bonusIdx]).trim() : '';

          const wp = isNaN(rawWholesale) ? 5000 : rawWholesale;
          const bp = isNaN(rawBonusPercent) ? 0 : rawBonusPercent;

          parsed.push({
            barcode,
            tradeNameAr: tradeName,
            tradeNameEn: tradeNameEn || tradeName,
            scientificName: scientificName || tradeName,
            category: category || 'أدوية عامة',
            manufacturer: manufacturer || 'عام',
            dosageForm: dosageForm || 'أقراص',
            strength: strength,
            packSize: 'عبوة أصلية',
            storageCondition: 'حرارة الغرفة 15-25°C',
            batchNumber: batchNumber,
            expiryDate: rawExp,
            stockQuantity: isNaN(rawQty) ? 50 : Math.max(0, rawQty),
            minStockLevel: 10,
            wholesalePrice: wp,
            bonusPercentage: bp,
            meltedPrice: calculateMeltedPrice(wp, bp),
            bonusBuyQuantity: bonusDesc.includes('+')
              ? parseInt(bonusDesc.split('+')[0].trim()) || undefined
              : undefined,
            bonusFreeQuantity: bonusDesc.includes('+')
              ? parseInt(bonusDesc.split('+')[1].trim()) || undefined
              : undefined,
            bonusDescription: bonusDesc || (bp > 0 ? `خصم تذويب ${bp}%` : ''),
            isAvailable: true,
          });
        }

        if (parsed.length === 0) {
          setImportError('لم يتم العثور على أدوية صالحة في الملف. تأكد من احتواء الملف على أعمدة: اسم الدواء، الكمية، الصلاحية، والسعر.');
        } else {
          setImportedProductsPreview(parsed);
        }
      } catch (err: any) {
        console.error('Error parsing excel:', err);
        setImportError('حدث خطأ أثناء قراءة الملف. يرجى التأكد من أن الملف بصيغة Excel أو CSV صالحة.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleConfirmImport = () => {
    if (importedProductsPreview.length === 0) return;
    if (onBatchAddProducts) {
      onBatchAddProducts(importedProductsPreview);
    } else {
      importedProductsPreview.forEach((p) => onAddProduct(p));
    }
    setImportSuccessMessage(`تم بنجاح استيراد وتحديث (${importedProductsPreview.length}) مادة دوائية في مستودع مذخر سامو!`);
    setIsImportModalOpen(false);
    setImportedProductsPreview([]);
    setImportFileName('');
    setTimeout(() => setImportSuccessMessage(null), 5000);
  };

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50 pb-20">
      <div className="w-full max-w-full px-3 sm:px-6 pt-4 sm:pt-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
              إدارة مستودع الأدوية وتواريخ الصلاحية
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
              title="تصدير كشف المخزون كملف Excel / CSV"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>تصدير Excel/CSV</span>
            </button>
          </div>
        </div>

        {/* Success Alert Banner */}
        {importSuccessMessage && (
          <div className="mb-6 p-4 bg-emerald-50 border-2 border-emerald-400 rounded-xl flex items-center justify-between text-xs sm:text-sm text-emerald-950 font-bold shadow-xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{importSuccessMessage}</span>
            </div>
            <button
              onClick={() => setImportSuccessMessage(null)}
              className="text-emerald-700 hover:text-emerald-900 text-xs px-2 py-1 rounded cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Inventory Critical Alerts Notice Banner */}
        {alerts.totalAlerts > 0 && (
          <div className="mb-6 p-4 bg-gradient-to-r from-rose-50 via-amber-50 to-orange-50 border-2 border-rose-300 rounded-2xl shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Bell className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-black text-rose-950">
                    تنبيهات المخزون الذكية: {alerts.totalAlerts} مادة تستوجب المتابعة العاجلة
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white">
                    تنبيه نشط
                  </span>
                </div>
                <p className="text-xs text-rose-900 mt-1 font-medium">
                  {alerts.outOfStock.length > 0 && (
                    <span className="ml-2 font-bold text-rose-700">
                      🔴 {alerts.outOfStock.length} مادة نفدت بالكامل (0 علبة)
                    </span>
                  )}
                  {alerts.lowStock.length > 0 && (
                    <span className="ml-2 font-bold text-orange-700">
                      ⚠️ {alerts.lowStock.length} مادة بمستوى حرج
                    </span>
                  )}
                  {alerts.expired.length > 0 && (
                    <span className="ml-2 font-bold text-red-800">
                      ❌ {alerts.expired.length} مادة منتهية الصلاحية
                    </span>
                  )}
                  {(alerts.criticalExpiry.length + alerts.nearExpiry.length) > 0 && (
                    <span className="ml-2 font-bold text-amber-800">
                      ⏳ {alerts.criticalExpiry.length + alerts.nearExpiry.length} مادة قريبة الانتهاء (خلال 6 أشهر)
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end md:self-center shrink-0">
              <button
                onClick={() => exportAlertsReportToExcel(alerts, settings.name)}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>تصدير تقرير الإشعارات (Excel)</span>
              </button>
            </div>
          </div>
        )}

        {/* Filters and search bar - High Visibility & Barcode Scanning Hub */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border-2 border-slate-200 mb-6 space-y-3.5 shadow-sm">
          {/* Top Row: Search Input with Scanner & Print Buttons */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1">
              <div className="relative flex-1 group">
                <Search className="w-5 h-5 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="ابحث بالاسم التجاري، العلمي، امسح الباركود مباشرة، رقم الوجبة، الشركة..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-11 py-2.5 bg-slate-50 hover:bg-slate-100/70 border-2 border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 focus:outline-hidden focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-100 transition shadow-2xs"
                />
                <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTerm('');
                        searchInputRef.current?.focus();
                      }}
                      className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1 rounded-md transition cursor-pointer"
                      title="مسح البحث وإعادة التعيين"
                    >
                      ✕
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsScannerOpen(true)}
                    className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition cursor-pointer"
                    title="مسح الباركود بكاميرا الموبايل"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Quick Focus Button with Keyboard Shortcut */}
              <button
                type="button"
                onClick={() => searchInputRef.current?.focus()}
                className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-2xs"
                title="تركيز مؤشر القارئ في حقل البحث (F2)"
              >
                <Barcode className="w-4 h-4 text-slate-700" />
                <span className="hidden sm:inline">تركيز القارئ (F2)</span>
              </button>

              {/* Barcode Camera Scanner */}
              <button
                type="button"
                id="btn-inventory-barcode-camera"
                onClick={() => setIsScannerOpen(true)}
                className="px-3.5 py-2.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-2xs active:scale-95"
                title="مسح الباركود عبر كاميرا الجهاز"
              >
                <Camera className="w-4 h-4 text-blue-600" />
                <span className="inline">مسح بالكاميرا</span>
              </button>
            </div>

            {/* Hardware Scanner Live Indicator & Batch Barcode Print Button */}
            <div className="flex items-center gap-2 justify-between lg:justify-end flex-wrap">
              {/* Ready status badge */}
              <div className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold select-none">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>قارئ الباركود جاهز للمسح (USB / Bluetooth)</span>
              </div>

              {/* Batch Print Barcode Labels Button */}
              <button
                type="button"
                onClick={handleBatchPrintSelectedOrFiltered}
                className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="طباعة ملصقات الباركود على طابعة الملصقات المعرفة بالجهاز"
              >
                <Printer className="w-4 h-4 text-indigo-600" />
                <span>
                  طباعة ملصقات الباركود ({selectedProductIds.size > 0 ? selectedProductIds.size : filteredProducts.length})
                </span>
              </button>
            </div>
          </div>

          {/* Scanned / Matched Product Instant Banner */}
          {(exactBarcodeMatch || scanSuccessBanner) && (
            <div className="p-3 bg-emerald-50 border-2 border-emerald-300 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-emerald-950 animate-in fade-in">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-sm block">
                    تم العثور على: {(exactBarcodeMatch || scanSuccessBanner?.product)?.tradeNameAr}
                  </span>
                  <span className="text-[11px] text-emerald-700 font-mono">
                    الباركود: {(exactBarcodeMatch || scanSuccessBanner?.product)?.barcode || '—'} • الرصيد الحالي: {(exactBarcodeMatch || scanSuccessBanner?.product)?.stockQuantity ?? 0} علبة • السعر: {((exactBarcodeMatch || scanSuccessBanner?.product)?.wholesalePrice ?? 0).toLocaleString()} {settings.currency}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setQuantityEditingProduct(exactBarcodeMatch || scanSuccessBanner?.product || null)}
                  className="px-3 py-1.5 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg font-bold transition cursor-pointer"
                >
                  تعديل الكمية
                </button>
                <button
                  type="button"
                  onClick={() => setBarcodeEditingProduct(exactBarcodeMatch || scanSuccessBanner?.product || null)}
                  className="px-3 py-1.5 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg font-bold transition cursor-pointer"
                >
                  تعديل الباركود
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenSinglePrint(exactBarcodeMatch || scanSuccessBanner!.product)}
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold transition flex items-center gap-1 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة ملصق</span>
                </button>
              </div>
            </div>
          )}

            {/* Quick status tabs */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
              <button
                onClick={() => setExpiryFilter('all')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  expiryFilter === 'all'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                جميع المواد ({products.length})
              </button>

              <button
                onClick={() => setExpiryFilter('out_of_stock')}
                className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1 cursor-pointer ${
                  expiryFilter === 'out_of_stock'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                }`}
              >
                <PackageX className="w-3.5 h-3.5" />
                <span>نفد بالكامل (0)</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-200 text-rose-900">
                  {alerts.outOfStock.length}
                </span>
              </button>

              <button
                onClick={() => setExpiryFilter('low_stock')}
                className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1 cursor-pointer ${
                  expiryFilter === 'low_stock'
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>مخزون حرج</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-orange-200 text-orange-900">
                  {alerts.lowStock.length}
                </span>
              </button>

              <button
                onClick={() => setExpiryFilter('near_expiry')}
                className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1 cursor-pointer ${
                  expiryFilter === 'near_expiry'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>قريب الصلاحية (≤6 أشهر)</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-200 text-amber-900">
                  {alerts.criticalExpiry.length + alerts.nearExpiry.length}
                </span>
              </button>

              <button
                onClick={() => setExpiryFilter('expired')}
                className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1 cursor-pointer ${
                  expiryFilter === 'expired'
                    ? 'bg-red-700 text-white shadow-xs'
                    : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                }`}
              >
                <AlertOctagon className="w-3.5 h-3.5" />
                <span>منتهي الصلاحية</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-red-200 text-red-900">
                  {alerts.expired.length}
                </span>
              </button>
            </div>

          {/* Categories and Manufacturer filter row */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs flex-1">
              <span className="text-slate-500 font-bold ml-1 shrink-0">الأقسام:</span>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat === 'all' ? 'كافة الأقسام' : cat}
                </button>
              ))}
            </div>

            {/* Manufacturer Dropdown Filter */}
            <div className="flex items-center gap-2 shrink-0 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
              <label className="text-xs font-bold text-slate-700 whitespace-nowrap flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-blue-600" />
                <span>الشركة المصنعة:</span>
              </label>
              <select
                id="filter-manufacturer"
                value={selectedManufacturer}
                onChange={(e) => setSelectedManufacturer(e.target.value)}
                className="bg-white border border-slate-200 rounded-md text-xs font-semibold text-slate-800 py-1 px-2 focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer max-w-[180px] truncate"
              >
                <option value="all">كافة الشركات ({manufacturers.length - 1})</option>
                {manufacturers.filter(m => m !== 'all').map((mfr) => (
                  <option key={mfr} value={mfr}>{mfr}</option>
                ))}
              </select>
              {selectedManufacturer !== 'all' && (
                <button
                  onClick={() => setSelectedManufacturer('all')}
                  className="text-[11px] text-rose-600 hover:text-rose-800 font-bold px-1"
                  title="إلغاء فلتر الشركة"
                >
                  إلغاء
                </button>
              )}
            </div>
          </div>

          {/* Scientific Name Search Indicator Banner */}
          {isScientificSearchActive && (
            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 font-bold flex items-center gap-2 animate-in fade-in">
              <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                بحث سريع بالاسم العلمي: يتم الآن عرض كافة المواد والبدائل التجارية المتطابقة في المادة العلمية ({filteredProducts.length} صنف/بديل متاح بالمخزن).
              </span>
            </div>
          )}
        </div>

        {/* Products Table & Mobile Cards - Stable Fixed Frame with Downward Scroll */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          {/* Frame Header Bar */}
          <div className="px-4 py-3 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 shrink-0 select-none">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-blue-400 shrink-0" />
              <h3 className="font-bold text-xs sm:text-sm">
                قائمة الأدوية والمستلزمات بالمخزن ({filteredProducts.length} صنف)
              </h3>
              {filteredProducts.length !== products.length && (
                <span className="text-[11px] text-slate-300 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full font-medium">
                  مفلترة من إجمالي {products.length}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="hidden sm:inline text-[11px] text-slate-400">
                إطار ثابت للتصفح • مرر للأسفل
              </span>
              <button
                type="button"
                onClick={scrollToTop}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer border border-slate-700 active:scale-95 shadow-2xs"
                title="الصعود لأول القائمة"
              >
                <ArrowUp className="w-3.5 h-3.5 text-blue-400" />
                <span>لأعلى القائمة</span>
              </button>
            </div>
          </div>

          {/* Mobile & Tablet Responsive Card Layout - Fixed Frame with Downward Scrolling */}
          <div
            ref={mobileListRef}
            className="md:hidden divide-y divide-slate-100 overflow-y-auto max-h-[62vh] min-h-[360px] scroll-smooth overscroll-contain bg-slate-50/40"
          >
            {filteredProducts.length === 0 ? (
              <div className="p-8 text-center text-slate-400 space-y-2">
                <PackageX className="w-10 h-10 mx-auto text-slate-300" />
                <p className="font-bold text-sm text-slate-700">لا توجد أدوية مطابقة لبحثك</p>
                <p className="text-xs text-slate-400">جرب كتابة جزء آخر من الاسم أو إعادة تعيين الفلاتر</p>
              </div>
            ) : (
              <>
                {visibleProducts.map((p) => {
                  const expInfo = calculateExpiryDetails(p.expiryDate);
                  const stockInfo = calculateStockDetails(p);
                  const isZero = stockInfo.status === 'out_of_stock';
                  const isLow = stockInfo.status === 'low_stock';

                  return (
                    <div key={p.id} className="p-4 space-y-3 bg-white hover:bg-slate-50/50 transition">
                  {/* Top: Names, Status badges */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-slate-900 text-sm">{p.tradeNameAr}</span>
                        {expInfo.status === 'expired' ? (
                          <span className="px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-black animate-pulse">
                            منتهي
                          </span>
                        ) : expInfo.status === 'critical' ? (
                          <span className="px-2 py-0.5 rounded bg-orange-600 text-white text-[10px] font-black">
                            قريب جداً
                          </span>
                        ) : expInfo.status === 'near' ? (
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                            قريب
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 text-[10px] font-bold">
                            صالح
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500 font-medium block truncate" dir="ltr">
                        {p.tradeNameEn}
                      </span>
                      <span className="text-[11px] text-blue-700 font-mono block truncate">
                        {p.scientificName}
                      </span>
                    </div>

                    {/* Stock badge & Quick Steppers */}
                    <div className="text-left shrink-0">
                      {isZero ? (
                        <div className="space-y-1">
                          <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 border border-rose-200 text-xs font-black block">
                            نفد بالكامل
                          </span>
                          <button
                            type="button"
                            onClick={() => setQuantityEditingProduct(p)}
                            className="text-[10px] text-blue-600 hover:underline font-bold"
                          >
                            إضافة رصيد
                          </button>
                        </div>
                      ) : (
                        <div className="text-left">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleQuickDeltaQuantity(p, -1)}
                              className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-700 font-bold text-xs flex items-center justify-center border border-slate-200 active:scale-90"
                              title="خصم علبة (-1)"
                            >
                              -
                            </button>
                            <button
                              type="button"
                              onClick={() => setQuantityEditingProduct(p)}
                              className="px-2 py-0.5 rounded-lg bg-slate-50 hover:bg-amber-50 border border-slate-200 text-slate-900 font-mono font-black text-sm"
                              title="اضغط لتعديل الكمية"
                            >
                              {p.stockQuantity} <span className="text-[10px] font-normal text-slate-500">علبة</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickDeltaQuantity(p, 1)}
                              className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-700 font-bold text-xs flex items-center justify-center border border-slate-200 active:scale-90"
                              title="إضافة علبة (+1)"
                            >
                              +
                            </button>
                          </div>
                          {isLow && (
                            <span className="block text-[10px] text-orange-600 font-bold mt-0.5">
                              مخزون حرج (حد {p.minStockLevel || 10})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Barcode Strip on Mobile */}
                  <div className="flex items-center justify-between gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Barcode className="w-4 h-4 text-slate-600 shrink-0" />
                      {p.barcode ? (
                        <span className="font-mono font-bold text-slate-800 truncate" dir="ltr">
                          {p.barcode}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">بدون باركود</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {p.barcode ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setBarcodeEditingProduct(p)}
                            className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition"
                          >
                            تعديل
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenSinglePrint(p)}
                            className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-lg text-[11px] font-bold transition flex items-center gap-1"
                          >
                            <Printer className="w-3 h-3 text-indigo-600" />
                            <span>طباعة</span>
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleGenerateBarcodeDirectly(p)}
                          className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-[11px] font-bold transition flex items-center gap-1"
                        >
                          <Sparkles className="w-3 h-3 text-amber-700" />
                          <span>توليد باركود</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Batch, Expiry, Price Grid */}
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-xl text-[11px] border border-slate-100">
                    <div>
                      <span className="text-slate-400 block text-[10px]">رقم الوجبة (Batch LOT):</span>
                      <span dir="ltr" className="font-mono font-bold text-slate-800 block truncate">
                        {p.batchNumber}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">تاريخ الصلاحية:</span>
                      <span dir="ltr" className="font-mono font-bold text-slate-800 block">
                        {p.expiryDate}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">السعر الأساسي:</span>
                      <span dir="ltr" className="font-bold text-slate-900 block">
                        {(p.wholesalePrice ?? 0).toLocaleString()} {settings.currency}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">تذويب البونص:</span>
                      {p.bonusPercentage && p.bonusPercentage > 0 ? (
                        <span dir="ltr" className="font-bold text-emerald-700 block truncate">
                          {(calculateMeltedPrice(p.wholesalePrice, p.bonusPercentage) ?? 0).toLocaleString()} {settings.currency} ({p.bonusPercentage}%)
                        </span>
                      ) : (
                        <span className="text-slate-400 block font-mono">بدون تذويب</span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons on mobile (Touch targets >= 44px) */}
                  <div className="flex items-center justify-between gap-1.5 pt-1">
                    <div className="flex items-center gap-1.5 flex-1">
                      <button
                        type="button"
                        onClick={() => handleOpenSinglePrint(p)}
                        className="py-2 px-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                        title="طباعة ملصق الباركود على الطابعة المعرفة"
                      >
                        <Printer className="w-3.5 h-3.5 text-indigo-700" />
                        <span>طباعة باركود</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setAdjustingProduct(p)}
                        className="py-2 px-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                        title="تسوية جردية دقيقة"
                      >
                        <Scale className="w-3.5 h-3.5 text-amber-700" />
                        <span>تسوية</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setAuditingProduct(p)}
                        className="py-2 px-2 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-900 text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                        title="سجل التدقيق والحركات"
                      >
                        <History className="w-3.5 h-3.5 text-purple-700" />
                        <span>تدقيق</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(p)}
                        className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                        title="تعديل المادة"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`هل أنت متأكد من حذف ${p.tradeNameAr} من المخزن؟`)) {
                            onDeleteProduct(p.id);
                          }
                        }}
                        className="p-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 transition cursor-pointer"
                        title="حذف من المخزن"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredProducts.length > displayLimit && (
                <div className="p-3 text-center bg-slate-50 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setDisplayLimit((prev) => prev + 50)}
                    className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                  >
                    عرض المزيد ({filteredProducts.length - displayLimit} مادة إضافية)
                  </button>
                </div>
              )}
            </>
          )}
          </div>

          {/* Desktop Table - Fixed Frame with Downward & Horizontal Scrolling + Sticky Thead */}
          <div
            ref={desktopListRef}
            className="hidden md:block overflow-auto max-h-[62vh] xl:max-h-[68vh] min-h-[420px] scroll-smooth overscroll-contain bg-white"
          >
            <table className="w-full text-xs text-right min-w-[1200px]">
              <thead className="sticky top-0 z-10 shadow-xs">
                <tr className="bg-slate-900 text-slate-200 font-semibold border-b border-slate-700 select-none">
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={visibleProducts.length > 0 && visibleProducts.every((p) => selectedProductIds.has(p.id))}
                      onChange={handleToggleSelectAllVisible}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                      title="تحديد كافة المواد الظاهرة للطباعة الدفعية"
                    />
                  </th>
                  <th className="p-3">اسم الدواء والمواصفات</th>
                  <th className="p-3">التركيبة العلمية</th>
                  <th className="p-3">الشركة والمنشأ</th>
                  <th className="p-3 text-center min-w-[160px]">الباركود (Barcode)</th>
                  <th className="p-3 text-center">رقم الوجبة (Batch)</th>
                  <th className="p-3 text-center">تاريخ الصلاحية</th>
                  <th className="p-3 text-center min-w-[130px]">الرصيد وتعديل الكمية</th>
                  <th className="p-3">سعر المفرد</th>
                  <th className="p-3">تذويب البونص</th>
                  <th className="p-3">ملاحظة البونص</th>
                  <th className="p-3 text-center min-w-[170px]">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="p-12 text-center text-slate-400">
                      <PackageX className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                      <p className="font-bold text-sm text-slate-700">لا توجد أدوية مطابقة للبحث أو الفلتر المحدد</p>
                      <p className="text-xs text-slate-400 mt-1">يرجى تعديل مصطلح البحث أو اختيار "الكل"</p>
                    </td>
                  </tr>
                ) : (
                  visibleProducts.map((p) => {
                  const expInfo = calculateExpiryDetails(p.expiryDate);
                  const stockInfo = calculateStockDetails(p);
                  const isZero = stockInfo.status === 'out_of_stock';
                  const isLow = stockInfo.status === 'low_stock';

                  return (
                    <tr 
                      key={p.id} 
                      className={`transition ${
                        selectedProductIds.has(p.id)
                          ? 'bg-blue-50/70'
                          : isZero 
                          ? 'bg-rose-50/40 hover:bg-rose-50/70' 
                          : expInfo.status === 'expired'
                          ? 'bg-red-50/40 hover:bg-red-50/70'
                          : isLow
                          ? 'bg-orange-50/30 hover:bg-orange-50/60'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      {/* Checkbox for batch printing */}
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedProductIds.has(p.id)}
                          onChange={() => handleToggleSelectProduct(p.id)}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>

                      <td className="p-3">
                        <span className="font-bold text-slate-900 block text-[13px]">
                          {p.tradeNameAr}
                        </span>
                        <span className="text-[11px] text-slate-500 font-medium" dir="ltr">
                          {p.tradeNameEn}
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          {p.dosageForm} • {p.strength} • {p.packSize}
                        </span>
                      </td>

                      <td className="p-3 font-mono text-[11px] text-blue-700 font-semibold max-w-[180px]">
                        {p.scientificName}
                      </td>

                      <td className="p-3 text-slate-700 font-medium">
                        {p.manufacturer}
                      </td>

                      {/* Barcode column with quick generate / edit / print */}
                      <td className="p-3 text-center">
                        {p.barcode ? (
                          <div className="flex items-center justify-center gap-1">
                            <span 
                              className="font-mono text-[11px] font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded border border-slate-200 select-all cursor-copy" 
                              dir="ltr"
                              title="اضغط لتحديد الباركود ونسخه"
                            >
                              {p.barcode}
                            </span>
                            <button
                              type="button"
                              onClick={() => setBarcodeEditingProduct(p)}
                              className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition cursor-pointer"
                              title="تعديل أو إعادة توليد الباركود"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenSinglePrint(p)}
                              className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition cursor-pointer"
                              title="طباعة ملصق الباركود على الطابعة المعرفة بالجهاز"
                            >
                              <Printer className="w-3 h-3 text-indigo-600" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleGenerateBarcodeDirectly(p)}
                            className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg font-bold text-[10px] transition inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                            title="توليد رمز باركود تلقائي وحفظه فوراً"
                          >
                            <Sparkles className="w-3 h-3 text-amber-600" />
                            <span>توليد باركود</span>
                          </button>
                        )}
                      </td>

                      <td className="p-3 text-center font-mono font-bold text-slate-800">
                        <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200" dir="ltr">
                          {p.batchNumber}
                        </span>
                      </td>

                      <td className="p-3 text-center">
                        {expInfo.status === 'expired' ? (
                          <span className="inline-block px-2.5 py-1 rounded-md bg-red-600 text-white text-[10px] font-black shadow-xs animate-pulse" dir="ltr">
                            منتهي ({p.expiryDate})
                          </span>
                        ) : expInfo.status === 'critical' ? (
                          <span className="inline-block px-2.5 py-1 rounded-md bg-orange-600 text-white text-[10px] font-black shadow-xs" dir="ltr">
                            قريب جداً ({p.expiryDate})
                          </span>
                        ) : expInfo.status === 'near' ? (
                          <span className="inline-block px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold" dir="ltr">
                            قريب ({p.expiryDate})
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-semibold" dir="ltr">
                            {p.expiryDate}
                          </span>
                        )}
                      </td>

                      {/* Stock Quantity with Quick Editing & Steppers */}
                      <td className="p-3 text-center">
                        <div className="inline-flex flex-col items-center">
                          {isZero ? (
                            <div className="space-y-1">
                              <span className="px-2.5 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-300 font-black text-[11px] block">
                                نفد بالكامل (0)
                              </span>
                              <button
                                type="button"
                                onClick={() => setQuantityEditingProduct(p)}
                                className="text-[10px] text-blue-600 hover:underline font-bold cursor-pointer"
                              >
                                إضافة رصيد
                              </button>
                            </div>
                          ) : isLow ? (
                            <>
                              <div className="flex items-center gap-1">
                                <span className="font-bold text-sm text-orange-600 font-mono" dir="ltr">
                                  {p.stockQuantity} علبة
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setQuantityEditingProduct(p)}
                                  className="p-1 text-orange-600 hover:bg-orange-100 rounded transition cursor-pointer"
                                  title="تعديل مباشر للكمية"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                              </div>
                              <span className="text-[9px] text-orange-700 font-bold bg-orange-100 px-1.5 py-0.2 rounded mt-0.5 border border-orange-200">
                                مخزون حرج (حد: {p.minStockLevel || 10})
                              </span>
                            </>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="font-bold text-sm text-slate-800 font-mono" dir="ltr">
                                {p.stockQuantity} علبة
                              </span>
                              <button
                                type="button"
                                onClick={() => setQuantityEditingProduct(p)}
                                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition cursor-pointer"
                                title="تعديل مباشر للكمية"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                            </div>
                          )}

                          {/* Quick Steppers (-1 / +1) */}
                          <div className="flex items-center gap-1 mt-1">
                            <button
                              type="button"
                              onClick={() => handleQuickDeltaQuantity(p, -1)}
                              className="w-5 h-5 rounded bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 font-bold text-xs flex items-center justify-center transition cursor-pointer border border-slate-200 active:scale-95"
                              title="خصم علبة واحدة (-1)"
                            >
                              -
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickDeltaQuantity(p, 1)}
                              className="w-5 h-5 rounded bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-700 font-bold text-xs flex items-center justify-center transition cursor-pointer border border-slate-200 active:scale-95"
                              title="إضافة علبة واحدة (+1)"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </td>

                      <td className="p-3 font-bold text-slate-900" dir="ltr">
                        {(p.wholesalePrice ?? 0).toLocaleString()} {settings.currency}
                      </td>

                      <td className="p-3">
                        {p.bonusPercentage && p.bonusPercentage > 0 ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-black text-[10px] border border-emerald-200">
                              خصم {p.bonusPercentage}%
                            </span>
                            <span className="block font-bold text-xs text-emerald-700" dir="ltr">
                              {(calculateMeltedPrice(p.wholesalePrice, p.bonusPercentage) ?? 0).toLocaleString()} {settings.currency}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs font-mono">بدون تذويب</span>
                        )}
                      </td>

                      <td className="p-3">
                        {p.bonusDescription ? (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-900 rounded font-semibold text-[11px] border border-amber-200">
                            {p.bonusDescription}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenSinglePrint(p)}
                            className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition cursor-pointer"
                            title="طباعة ملصق الباركود على الطابعة المعرفة بالجهاز"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setBarcodeEditingProduct(p)}
                            className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition cursor-pointer"
                            title="إدارة وتعديل الباركود"
                          >
                            <Barcode className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setAdjustingProduct(p)}
                            className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg transition cursor-pointer"
                            title="تسوية جردية دقيقة (Audit Adjustment)"
                          >
                            <Scale className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setAuditingProduct(p)}
                            className="p-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg transition cursor-pointer"
                            title="سجل التدقيق والحركات (Audit Trail)"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(p)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition cursor-pointer"
                            title="تعديل المادة والصلاحية"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`هل أنت متأكد من حذف ${p.tradeNameAr} من المخزن؟`)) {
                                onDeleteProduct(p.id);
                              }
                            }}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition cursor-pointer"
                            title="حذف من المخزن"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }))}
                {filteredProducts.length > displayLimit && (
                  <tr>
                    <td colSpan={12} className="p-3 text-center bg-slate-50">
                      <button
                        type="button"
                        onClick={() => setDisplayLimit((prev) => prev + 50)}
                        className="py-2 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-2"
                      >
                        <span>عرض 50 مادة إضافية ({filteredProducts.length - displayLimit} مادة متبقية)</span>
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Frame Footer - Summary and Quick Scroll Control */}
          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-600 font-medium shrink-0">
            <div className="flex items-center gap-3">
              <span>
                إجمالي رصيد العلب بالقائمة: <strong className="text-slate-900 font-mono font-bold">{filteredProducts.reduce((acc, p) => acc + (p.stockQuantity || 0), 0).toLocaleString()}</strong> علبة
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                القائمة ثابتة داخل إطار مخصص للتمرير
              </span>
              <button
                type="button"
                onClick={scrollToTop}
                className="text-blue-600 hover:text-blue-800 text-xs font-bold flex items-center gap-1 cursor-pointer transition active:scale-95"
              >
                <ArrowUp className="w-3.5 h-3.5" />
                <span>العودة للأعلى</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Add / Edit Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-white rounded-2xl p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                {editingProduct ? 'تعديل بيانات المادة وتاريخ الصلاحية' : 'إضافة مادة دوائية جديدة للمخزن'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">الاسم التجاري بالعربية *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: أوجمنتين 1 غرام أقراص"
                    value={formData.tradeNameAr}
                    onChange={(e) => setFormData({ ...formData, tradeNameAr: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">الاسم التجاري بالإنجليزية *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Augmentin 1000mg Tabs"
                    dir="ltr"
                    value={formData.tradeNameEn}
                    onChange={(e) => setFormData({ ...formData, tradeNameEn: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">الاسم والتركيب العلمي (Generic Name) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Amoxicillin + Clavulanic Acid"
                  dir="ltr"
                  value={formData.scientificName}
                  onChange={(e) => setFormData({ ...formData, scientificName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">القسم / التصنيف *</label>
                  <input
                    type="text"
                    required
                    placeholder="مضادات حيوية، مسكنات، قلب..."
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">الشركة المصنعة والمنشأ *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: GSK - بريطانيا"
                    value={formData.manufacturer}
                    onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">الشكل الصيدلاني *</label>
                  <div className="space-y-1.5">
                    <div className="relative">
                      <input
                        list="global-dosage-forms-list"
                        type="text"
                        required
                        placeholder="اختر أو اكتب: حب، كبسول، شراب، تحاميل، كريم، سيرم، بخاخ، قطعة..."
                        value={formData.dosageForm}
                        onChange={(e) => setFormData({ ...formData, dosageForm: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-blue-500 font-bold text-slate-800 text-xs sm:text-sm"
                      />
                      <datalist id="global-dosage-forms-list">
                        {GLOBAL_DOSAGE_FORMS.map((form) => (
                          <option key={form.id} value={`${form.nameAr} (${form.nameEn})`}>
                            {form.nameAr} - {form.nameEn} ({form.abbreviation})
                          </option>
                        ))}
                      </datalist>
                    </div>
                    {/* Quick selection pills for common global dosage forms */}
                    <div className="flex flex-wrap gap-1 pt-1">
                      {[
                        { ar: 'حب', en: 'Tab' },
                        { ar: 'كبسول', en: 'Cap' },
                        { ar: 'شراب', en: 'Syr' },
                        { ar: 'تحاميل', en: 'Supp' },
                        { ar: 'كريم', en: 'Crm' },
                        { ar: 'مرهم', en: 'Oint' },
                        { ar: 'سيرم', en: 'Serum' },
                        { ar: 'بخاخ', en: 'Spray' },
                        { ar: 'قطعة', en: 'Piece' },
                        { ar: 'امبول', en: 'Amp' },
                        { ar: 'فيال', en: 'Vial' },
                        { ar: 'قطرة', en: 'Drops' },
                      ].map((item) => (
                        <button
                          key={item.ar}
                          type="button"
                          onClick={() => setFormData({ ...formData, dosageForm: `${item.ar} (${item.en})` })}
                          className={`px-2 py-0.5 rounded text-[11px] font-bold border transition cursor-pointer ${
                            formData.dosageForm.includes(item.ar)
                              ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-blue-50 hover:text-blue-700'
                          }`}
                        >
                          {item.ar} <span className="text-[9px] opacity-75 font-mono">{item.en}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Batches and Expiry */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-blue-50/60 p-3.5 rounded-xl border border-blue-100">
                <div>
                  <label className="block font-bold text-blue-900 mb-1">رقم الوجبة / التشغيلة (Batch LOT) *</label>
                  <input
                    type="text"
                    required
                    placeholder="LOT-2024-AUG18"
                    value={formData.batchNumber}
                    onChange={(e) => setFormData({ ...formData, batchNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-blue-900 mb-1">تاريخ الصلاحية (YYYY-MM) *</label>
                  <input
                    type="text"
                    required
                    placeholder="2027-10"
                    value={formData.expiryDate}
                    onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg font-bold text-emerald-800"
                  />
                </div>

                <div>
                  <label className="block font-bold text-blue-900 mb-1">الرصيد المتوفر بالمخزن *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.stockQuantity}
                    onChange={(e) => setFormData({ ...formData, stockQuantity: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg font-bold"
                  />
                </div>
              </div>

              {/* Pricing & Bonus Melting */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                    <h4 className="text-xs font-bold text-slate-800">التسعير ونظام تذويب البونص</h4>
                  </div>
                  <span className="text-[11px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold">
                    سعر الجملة للصيدليات فقط (لا يوجد سعر عموم)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1 text-xs">
                      سعر المفرد للصيدلية ({settings.currency}) *
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={formData.wholesalePrice}
                      onChange={(e) => {
                        const wp = parseInt(e.target.value) || 0;
                        setFormData({
                          ...formData,
                          wholesalePrice: wp,
                          meltedPrice: calculateMeltedPrice(wp, formData.bonusPercentage),
                        });
                      }}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block font-semibold text-slate-700 text-xs">
                        نسبة البونص % (تذوب تلقائياً)
                      </label>
                      <div className="flex gap-1">
                        {[0, 5, 10, 15, 20].map((rate) => (
                          <button
                            key={rate}
                            type="button"
                            onClick={() =>
                              setFormData({
                                ...formData,
                                bonusPercentage: rate,
                                meltedPrice: calculateMeltedPrice(formData.wholesalePrice, rate),
                                bonusDescription: rate > 0 ? `خصم تذويب بونص ${rate}%` : '',
                              })
                            }
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer transition ${
                              formData.bonusPercentage === rate
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                            }`}
                          >
                            {rate}%
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="90"
                        value={formData.bonusPercentage || 0}
                        onChange={(e) => {
                          const bp = Math.min(90, Math.max(0, parseFloat(e.target.value) || 0));
                          setFormData({
                            ...formData,
                            bonusPercentage: bp,
                            meltedPrice: calculateMeltedPrice(formData.wholesalePrice, bp),
                            bonusDescription: bp > 0 ? `خصم تذويب بونص ${bp}%` : '',
                          });
                        }}
                        className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-lg font-bold text-emerald-800"
                      />
                      <span className="absolute left-3 top-2 text-xs font-bold text-emerald-600">%</span>
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1 text-xs">
                      السعر بعد تذويب البونص (الصافي)
                    </label>
                    <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between h-[42px]">
                      <span className="text-sm font-black text-emerald-700">
                        {(calculateMeltedPrice(formData.wholesalePrice, formData.bonusPercentage || 0) ?? 0).toLocaleString()} {settings.currency}
                      </span>
                      {(formData.bonusPercentage || 0) > 0 && (
                        <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold">
                          وفر {Math.round(((formData.wholesalePrice || 0) * (formData.bonusPercentage || 0)) / 100).toLocaleString()} {settings.currency}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1 text-xs">
                    ملاحظة البونص الإضافي / العرض (اختياري)
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: 10 + 1 مجاناً أو خصم تذويب خاص"
                    value={formData.bonusDescription}
                    onChange={(e) => setFormData({ ...formData, bonusDescription: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-amber-900 font-semibold"
                  />
                </div>
              </div>

              {/* Storage & Pack info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">حجم العبوة والتقسيم</label>
                  <input
                    type="text"
                    placeholder="شريطين (20 قرص)، زجاجة 100 مل..."
                    value={formData.packSize}
                    onChange={(e) => setFormData({ ...formData, packSize: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">ظروف التخزين والحفظ</label>
                  <input
                    type="text"
                    placeholder="مكان جاف أقل من 25°C، مبرد 2-8°C..."
                    value={formData.storageCondition}
                    onChange={(e) => setFormData({ ...formData, storageCondition: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-xs transition cursor-pointer"
                >
                  {editingProduct ? 'حفظ التعديلات' : 'إضافة المادة للمستودع'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Excel / CSV Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold">
                    استيراد قائمة الأدوية من ملف إكسل (Excel / CSV)
                  </h3>
                  <p className="text-xs text-slate-400">
                    أضف مئات الأدوية دفعة واحدة مع الباركود والكمية وتواريخ الصلاحية والأسعار
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportedProductsPreview([]);
                  setImportError(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-5">
              {/* If no items parsed yet, show upload dropzone and template download */}
              {importedProductsPreview.length === 0 ? (
                <div className="space-y-4">
                  {/* Template download notice */}
                  <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-start gap-2.5">
                      <HelpCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-blue-900 block text-sm">هل تحتاج نموذج إكسل جاهز؟</span>
                        <span className="text-blue-700">
                          يمكنك تحميل قالب إكسل رسمي منسق يحتوي على جميع الأعمدة المطلوبة (الاسم، الباركود، الاكسباير، الكمية، السعر).
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleDownloadExcelTemplate}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg font-bold flex items-center gap-1.5 shadow-xs transition shrink-0 cursor-pointer self-start sm:self-auto"
                    >
                      <Download className="w-4 h-4" />
                      <span>تحميل نموذج إكسل جاهز (.xlsx)</span>
                    </button>
                  </div>

                  {/* Drag and Drop Zone */}
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
                      if (file) processExcelFile(file);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition cursor-pointer ${
                      isDragging
                        ? 'border-emerald-500 bg-emerald-50/50'
                        : 'border-slate-300 hover:border-emerald-500 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx, .xls, .csv"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) processExcelFile(file);
                      }}
                    />
                    <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center mb-3">
                      <Upload className="w-8 h-8" />
                    </div>
                    <h4 className="text-sm sm:text-base font-bold text-slate-800">
                      اسحب وأفلت ملف الإكسل هنا، أو انقر لاختيار الملف من جهازك
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">
                      يدعم صيغ Excel (.xlsx, .xls) وملفات القيم المفصولة (.csv)
                    </p>
                  </div>

                  {/* Error display */}
                  {importError && (
                    <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                      <span>{importError}</span>
                    </div>
                  )}
                </div>
              ) : (
                /* Preview Table for parsed items */
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      <span className="text-xs sm:text-sm font-bold text-emerald-950">
                        تمت قراءة ({importedProductsPreview.length}) مادة بنجاح من الملف: <span className="font-mono text-emerald-800">{importFileName}</span>
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setImportedProductsPreview([]);
                        setImportFileName('');
                      }}
                      className="text-xs text-slate-600 hover:text-rose-600 underline cursor-pointer self-start sm:self-auto"
                    >
                      اختيار ملف آخر
                    </button>
                  </div>

                  {/* Search inside preview */}
                  <div className="relative">
                    <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="ابحث في المواد المقروءة للتأكد..."
                      value={importSearchTerm}
                      onChange={(e) => setImportSearchTerm(e.target.value)}
                      className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-hidden"
                    />
                  </div>

                  {/* Scrollable preview table */}
                  <div className="border border-slate-200 rounded-xl max-h-72 overflow-y-auto">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100 sticky top-0 border-b border-slate-200">
                        <tr>
                          <th className="p-2.5 text-center w-10">ت</th>
                          <th className="p-2.5">اسم الدواء</th>
                          <th className="p-2.5 text-center">الباركود</th>
                          <th className="p-2.5 text-center">الاكسباير</th>
                          <th className="p-2.5 text-center">الكمية</th>
                          <th className="p-2.5">سعر المفرد</th>
                          <th className="p-2.5">نسبة البونص</th>
                          <th className="p-2.5">السعر بعد التذويب</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {importedProductsPreview
                          .filter(
                            (p) =>
                              !importSearchTerm ||
                              p.tradeNameAr.toLowerCase().includes(importSearchTerm.toLowerCase()) ||
                              p.barcode.includes(importSearchTerm)
                          )
                          .slice(0, 100)
                          .map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="p-2 text-center text-slate-400 font-mono">{idx + 1}</td>
                              <td className="p-2 font-bold text-slate-900">
                                {item.tradeNameAr}
                                {item.tradeNameEn && item.tradeNameEn !== item.tradeNameAr && (
                                  <span className="block text-[10px] text-slate-400 font-normal font-sans" dir="ltr">
                                    {item.tradeNameEn}
                                  </span>
                                )}
                              </td>
                              <td className="p-2 text-center font-mono text-slate-600 text-[11px]">
                                {item.barcode}
                              </td>
                              <td className="p-2 text-center font-mono font-bold text-emerald-700">
                                {item.expiryDate}
                              </td>
                              <td className="p-2 text-center font-bold text-slate-900">
                                {item.stockQuantity}
                              </td>
                              <td className="p-2 font-bold text-slate-900">
                                {(item.wholesalePrice ?? 0).toLocaleString()} {settings.currency}
                              </td>
                              <td className="p-2 font-semibold text-emerald-700">
                                {item.bonusPercentage ? `${item.bonusPercentage}%` : '-'}
                              </td>
                              <td className="p-2 text-emerald-800 text-xs font-black">
                                {(calculateMeltedPrice(item.wholesalePrice, item.bonusPercentage) ?? 0).toLocaleString()} {settings.currency}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>

                  {importedProductsPreview.length > 100 && (
                    <p className="text-[11px] text-slate-500 text-center">
                      يتم عرض أول 100 مادة للمعاينة السريعة (سيتم استيراد كافة الـ {importedProductsPreview.length} مادة بالكامل).
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportedProductsPreview([]);
                  setImportError(null);
                }}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                إلغاء
              </button>

              {importedProductsPreview.length > 0 && (
                <button
                  type="button"
                  id="btn-confirm-excel-import"
                  onClick={handleConfirmImport}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-xs transition cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>تأكيد استيراد ({importedProductsPreview.length}) مادة إلى مذخر سامو</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Inventory Batch Adjustment Modal */}
      {adjustingProduct && (
        <React.Suspense fallback={null}>
          <InventoryAdjustmentModal
            isOpen={true}
            onClose={() => setAdjustingProduct(null)}
            product={adjustingProduct}
            currentUser={currentUser}
            onProductUpdated={(updated) => {
              onUpdateProduct(updated);
              setAdjustingProduct(null);
            }}
          />
        </React.Suspense>
      )}

      {/* Product Audit History Modal */}
      {auditingProduct && (
        <React.Suspense fallback={null}>
          <ProductAuditModal
            isOpen={true}
            onClose={() => setAuditingProduct(null)}
            product={auditingProduct}
          />
        </React.Suspense>
      )}

      {/* Camera Barcode Scanner Modal */}
      {isScannerOpen && (
        <React.Suspense fallback={null}>
          <CameraBarcodeScannerModal
            isOpen={true}
            onClose={() => setIsScannerOpen(false)}
            onDetected={(detectedBarcode) => {
              setSearchTerm(detectedBarcode);
              setIsScannerOpen(false);
            }}
          />
        </React.Suspense>
      )}

      {/* Quick Barcode Generation & Editing Modal */}
      {barcodeEditingProduct && (
        <QuickBarcodeModal
          isOpen={true}
          onClose={() => setBarcodeEditingProduct(null)}
          product={barcodeEditingProduct}
          allProducts={products}
          onSaveBarcode={(productId, newBarcode) => handleSaveBarcode(productId, newBarcode)}
          onOpenPrint={(prod) => {
            setBarcodeEditingProduct(null);
            handleOpenSinglePrint(prod);
          }}
        />
      )}

      {/* Quick Stock Quantity Adjustment Modal */}
      {quantityEditingProduct && (
        <QuickQuantityModal
          isOpen={true}
          onClose={() => setQuantityEditingProduct(null)}
          product={quantityEditingProduct}
          onSaveQuantity={(productId, newQty) => handleSaveQuantity(productId, newQty)}
        />
      )}

      {/* Barcode Print Modal for System-Defined Printers */}
      {isPrintModalOpen && productsToPrint.length > 0 && (
        <BarcodePrintModal
          isOpen={true}
          onClose={() => setIsPrintModalOpen(false)}
          productsToPrint={productsToPrint}
          settings={settings}
        />
      )}
    </div>
  );
};
