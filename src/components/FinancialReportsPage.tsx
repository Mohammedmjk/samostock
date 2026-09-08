import React, { useState, useMemo } from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  AlertTriangle, 
  Clock, 
  Package, 
  FileSpreadsheet, 
  Download, 
  ArrowRight, 
  Search, 
  CheckCircle2, 
  AlertOctagon, 
  Building2, 
  ShoppingBag, 
  Filter,
  BarChart3,
  Flame,
  ShieldCheck,
  Calendar,
  Layers,
  ArrowUpRight
} from 'lucide-react';
import { Product, Order, WarehouseSettings } from '../types';
import { calculateExpiryDetails, calculateStockDetails } from '../services/alertService';

interface FinancialReportsPageProps {
  products: Product[];
  orders: Order[];
  settings: WarehouseSettings;
  onNavigateBack: () => void;
  onNavigateToInventoryWithFilter?: (filter: 'all' | 'out_of_stock' | 'low_stock' | 'near_expiry' | 'expired') => void;
}

export type FinancialFilter = 'all' | 'valid_only' | 'expired' | 'low_stock' | 'near_expiry' | 'out_of_stock';

export const FinancialReportsPage: React.FC<FinancialReportsPageProps> = ({
  products,
  orders,
  settings,
  onNavigateBack,
  onNavigateToInventoryWithFilter,
}) => {
  const [activeFilter, setActiveFilter] = useState<FinancialFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'inventory_value' | 'sales_analytics'>('inventory_value');

  const now = useMemo(() => new Date(), []);

  // 1. Core Financial Calculations
  const financialMetrics = useMemo(() => {
    let actualActiveInventoryValue = 0;
    let actualActiveItemsCount = 0;

    let expiredStockValue = 0;
    let expiredItemsCount = 0;

    let nearExpiryValue = 0;
    let nearExpiryItemsCount = 0;

    let lowStockValue = 0;
    let lowStockItemsCount = 0;

    let zeroStockItemsCount = 0;

    products.forEach((p) => {
      const expiry = calculateExpiryDetails(p.expiryDate, now);
      const stock = calculateStockDetails(p);
      const totalItemValue = (p.stockQuantity || 0) * (p.wholesalePrice || 0);

      if (stock.status === 'out_of_stock') {
        zeroStockItemsCount++;
      } else if (expiry.status === 'expired') {
        expiredStockValue += totalItemValue;
        expiredItemsCount++;
      } else {
        // Active and strictly valid inventory
        actualActiveInventoryValue += totalItemValue;
        actualActiveItemsCount++;

        if (expiry.status === 'near' || expiry.status === 'critical') {
          nearExpiryValue += totalItemValue;
          nearExpiryItemsCount++;
        }

        if (stock.status === 'low_stock') {
          lowStockValue += totalItemValue;
          lowStockItemsCount++;
        }
      }
    });

    // Sales Calculations from Orders
    const validOrders = orders.filter((o) => o.status !== 'cancelled' && o.status !== 'rejected');
    const totalSalesRevenue = validOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const deliveredOrders = orders.filter((o) => o.status === 'delivered');
    const deliveredRevenue = deliveredOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    return {
      actualActiveInventoryValue,
      actualActiveItemsCount,
      expiredStockValue,
      expiredItemsCount,
      nearExpiryValue,
      nearExpiryItemsCount,
      lowStockValue,
      lowStockItemsCount,
      zeroStockItemsCount,
      totalSalesRevenue,
      deliveredRevenue,
      totalOrdersCount: validOrders.length,
      deliveredOrdersCount: deliveredOrders.length,
    };
  }, [products, orders, now]);

  // 2. Best-Selling Products
  const bestSellingProducts = useMemo(() => {
    const map = new Map<string, { product: Product | null; name: string; quantity: number; totalRevenue: number }>();

    orders
      .filter((o) => o.status !== 'cancelled' && o.status !== 'rejected')
      .forEach((order) => {
        (order.items || []).forEach((item) => {
          const key = item.productId || item.tradeNameAr;
          const current = map.get(key) || {
            product: products.find((p) => p.id === item.productId) || null,
            name: item.tradeNameAr || item.tradeNameEn || 'دواء',
            quantity: 0,
            totalRevenue: 0,
          };

          current.quantity += item.quantity || 0;
          current.totalRevenue += item.totalPrice || (item.quantity * item.unitPrice) || 0;
          map.set(key, current);
        });
      });

    return Array.from(map.values())
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 15);
  }, [orders, products]);

  // 3. Top Pharmacies
  const topPharmacies = useMemo(() => {
    const map = new Map<string, { pharmacyName: string; ordersCount: number; totalSpent: number; lastOrder: string }>();

    orders
      .filter((o) => o.status !== 'cancelled' && o.status !== 'rejected')
      .forEach((order) => {
        const name = (order.pharmacyName || 'صيدلية غير مسماة').trim();
        const current = map.get(name) || {
          pharmacyName: name,
          ordersCount: 0,
          totalSpent: 0,
          lastOrder: order.createdAt,
        };

        current.ordersCount += 1;
        current.totalSpent += order.totalAmount || 0;
        if (new Date(order.createdAt) > new Date(current.lastOrder)) {
          current.lastOrder = order.createdAt;
        }
        map.set(name, current);
      });

    return Array.from(map.values())
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 15);
  }, [orders]);

  // 4. Filtered Table Rows
  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return products.filter((p) => {
      const expiry = calculateExpiryDetails(p.expiryDate, now);
      const stock = calculateStockDetails(p);

      let matchFilter = true;
      if (activeFilter === 'valid_only') {
        matchFilter = expiry.status !== 'expired' && stock.status !== 'out_of_stock';
      } else if (activeFilter === 'expired') {
        matchFilter = expiry.status === 'expired';
      } else if (activeFilter === 'low_stock') {
        matchFilter = stock.status === 'low_stock';
      } else if (activeFilter === 'near_expiry') {
        matchFilter = expiry.status === 'near' || expiry.status === 'critical';
      } else if (activeFilter === 'out_of_stock') {
        matchFilter = stock.status === 'out_of_stock';
      }

      if (!term) return matchFilter;

      const matchName = (p.tradeNameAr && p.tradeNameAr.toLowerCase().includes(term)) ||
        (p.tradeNameEn && p.tradeNameEn.toLowerCase().includes(term)) ||
        (p.scientificName && p.scientificName.toLowerCase().includes(term));
      const matchBarcode = (p.barcode && p.barcode.includes(term)) ||
        (p.barcodeAliases && p.barcodeAliases.some(b => b.includes(term)));
      const matchMfr = p.manufacturer && p.manufacturer.toLowerCase().includes(term);

      return matchFilter && (matchName || matchBarcode || matchMfr);
    });
  }, [products, activeFilter, searchTerm, now]);

  // 5. Detailed Excel Export
  const handleExportExcel = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    // Sheet 1: تقييم المخزون المالي
    const inventoryData = products.map((p, idx) => {
      const expiry = calculateExpiryDetails(p.expiryDate, now);
      const stock = calculateStockDetails(p);
      const isActuallyActive = expiry.status !== 'expired' && stock.status !== 'out_of_stock';
      const itemTotalValue = (p.stockQuantity || 0) * (p.wholesalePrice || 0);

      return {
        'ت': idx + 1,
        'الاسم التجاري عربي': p.tradeNameAr,
        'الاسم التجاري إنجليزي': p.tradeNameEn,
        'الاسم العلمي': p.scientificName,
        'الباركود': p.barcode,
        'الشركة المصنعة': p.manufacturer,
        'رقم الوجبة': p.batchNumber,
        'تاريخ الصلاحية': p.expiryDate,
        'حالة الصلاحية': expiry.statusLabel,
        'الكمية المتوفرة': p.stockQuantity,
        'سعر الجملة (د.ع)': p.wholesalePrice,
        'القيمة المخزنية الإجمالية (د.ع)': itemTotalValue,
        'تصنيف المخزون': isActuallyActive ? 'مخزون فعلي صالح' : expiry.status === 'expired' ? 'منتهي الصلاحية' : 'رصيد صفري',
      };
    });
    const wsInventory = XLSX.utils.json_to_sheet(inventoryData);
    XLSX.utils.book_append_sheet(wb, wsInventory, 'تقييم المخزون المالي');

    // Sheet 2: الأكثر مبيعاً
    const bestSellingData = bestSellingProducts.map((b, idx) => ({
      'الترتيب': idx + 1,
      'اسم المادة': b.name,
      'إجمالي الكمية المباعة': b.quantity,
      'إجمالي الإيرادات (د.ع)': b.totalRevenue,
    }));
    const wsBest = XLSX.utils.json_to_sheet(bestSellingData);
    XLSX.utils.book_append_sheet(wb, wsBest, 'المواد الأكثر مبيعاً');

    // Sheet 3: أعلى الصيدليات
    const topPharmaciesData = topPharmacies.map((ph, idx) => ({
      'الترتيب': idx + 1,
      'اسم الصيدلية': ph.pharmacyName,
      'عدد الطلبيات': ph.ordersCount,
      'إجمالي المشتريات (د.ع)': ph.totalSpent,
      'تاريخ آخر طلبية': new Date(ph.lastOrder).toLocaleDateString('ar-IQ'),
    }));
    const wsPharmacies = XLSX.utils.json_to_sheet(topPharmaciesData);
    XLSX.utils.book_append_sheet(wb, wsPharmacies, 'أعلى الصيدليات طلباً');

    // Sheet 4: الملخص المالي العام
    const summaryData = [
      { 'المؤشر المالي': 'القيمة المخزنية الحقيقية الحالية (الصالح فقط)', 'القيمة': `${(financialMetrics.actualActiveInventoryValue ?? 0).toLocaleString()} د.ع` },
      { 'المؤشر المالي': 'قيمة المواد منتهية الصلاحية (خسائر محتملة)', 'القيمة': `${(financialMetrics.expiredStockValue ?? 0).toLocaleString()} د.ع` },
      { 'المؤشر المالي': 'قيمة المواد وشيكة الانتهاء (< 90 يوم)', 'القيمة': `${(financialMetrics.nearExpiryValue ?? 0).toLocaleString()} د.ع` },
      { 'المؤشر المالي': 'إجمالي مبيعات الطلبات', 'القيمة': `${(financialMetrics.totalSalesRevenue ?? 0).toLocaleString()} د.ع` },
      { 'المؤشر المالي': 'المبيعات المسلمة فعلياً', 'القيمة': `${(financialMetrics.deliveredRevenue ?? 0).toLocaleString()} د.ع` },
      { 'المؤشر المالي': 'عدد الأصناف الصالحة والفعالة', 'القيمة': `${financialMetrics.actualActiveItemsCount} صنف` },
      { 'المؤشر المالي': 'عدد الأصناف منتهية الصلاحية', 'القيمة': `${financialMetrics.expiredItemsCount} صنف` },
      { 'المؤشر المالي': 'عدد الأصناف الصفرية الرصيد', 'القيمة': `${financialMetrics.zeroStockItemsCount} صنف` },
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'الملخص المالي العام');

    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `التقرير_المالي_المخزني_الشامل_${dateStr}.xlsx`);
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
              <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                <DollarSign className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-black text-slate-900">
                التقارير المالية وإحصائيات المستودع
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              حساب القيمة المخزنية الحقيقية واستبعاد التالف، مع إحصائيات المبيعات والصيدليات الأكثر طلباً
            </p>
          </div>
        </div>

        {/* Action: Export to Excel */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>تصدير التقرير إلى Excel</span>
          </button>
        </div>
      </div>

      {/* Primary Financial Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Actual Current Inventory Value */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">القيمة المخزنية الحقيقية</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">
              {(financialMetrics.actualActiveInventoryValue ?? 0).toLocaleString()} <span className="text-sm font-bold text-emerald-600">د.ع</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-1 font-semibold">
              المخزون الصالح الفعلي ({financialMetrics.actualActiveItemsCount} صنف)
            </p>
            <div className="mt-2 text-[10px] text-emerald-800 bg-emerald-50 py-1 px-2 rounded-lg font-bold">
              ✓ تم استبعاد الأصناف الصفرية والمنتهية تلقائياً
            </div>
          </div>
        </div>

        {/* Metric 2: Total Sales Revenue */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">إجمالي مبيعات الطلبات</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">
              {(financialMetrics.totalSalesRevenue ?? 0).toLocaleString()} <span className="text-sm font-bold text-blue-600">د.ع</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-1 font-semibold">
              منها {(financialMetrics.deliveredRevenue ?? 0).toLocaleString()} د.ع مسلمة فعلياً
            </p>
            <div className="mt-2 text-[10px] text-blue-800 bg-blue-50 py-1 px-2 rounded-lg font-bold">
              {financialMetrics.totalOrdersCount} طلبية واردة من الصيدليات
            </div>
          </div>
        </div>

        {/* Metric 3: Expired Stock Loss (التالف المنتهي) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">بضاعة منتهية الصلاحية (خسائر)</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <AlertOctagon className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-rose-600 tracking-tight">
              {(financialMetrics.expiredStockValue ?? 0).toLocaleString()} <span className="text-sm font-bold text-rose-500">د.ع</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-1 font-semibold">
              مجموع {financialMetrics.expiredItemsCount} صنف منتهي الصلاحية
            </p>
            <div className="mt-2 text-[10px] text-rose-800 bg-rose-50 py-1 px-2 rounded-lg font-bold">
              مستبعدة كلياً من القيمة الصالحة
            </div>
          </div>
        </div>

        {/* Metric 4: Near Expiry / At Risk */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">مواد وشيكة الانتهاء (&lt; 90 يوم)</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-amber-600 tracking-tight">
              {(financialMetrics.nearExpiryValue ?? 0).toLocaleString()} <span className="text-sm font-bold text-amber-500">د.ع</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-1 font-semibold">
              {financialMetrics.nearExpiryItemsCount} صنف بحاجة لتصريف أو عروض
            </p>
            <div className="mt-2 text-[10px] text-amber-900 bg-amber-50 py-1 px-2 rounded-lg font-bold">
              تتطلب متابعة سريعة قبل انتهاء الصلاحية
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Switcher: Inventory Valuation Table vs. Sales & Top Pharmacies Analytics */}
      <div className="flex border-b border-slate-200 bg-white px-5 rounded-t-2xl pt-3">
        <button
          onClick={() => setActiveTab('inventory_value')}
          className={`pb-3 px-4 font-bold text-xs sm:text-sm border-b-2 transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'inventory_value'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>جدول التقييم المخزني للمواد</span>
        </button>
        <button
          onClick={() => setActiveTab('sales_analytics')}
          className={`pb-3 px-4 font-bold text-xs sm:text-sm border-b-2 transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'sales_analytics'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>المواد الأكثر مبيعاً وأعلى الصيدليات طلباً</span>
        </button>
      </div>

      {/* TAB 1: INVENTORY VALUATION & QUICK FILTERS */}
      {activeTab === 'inventory_value' && (
        <div className="bg-white p-5 rounded-b-2xl border-x border-b border-slate-200 shadow-xs space-y-5 -mt-6">
          {/* Quick Filter Badges */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5 ml-2">
              <Filter className="w-3.5 h-3.5" />
              <span>فلاتر سريعة:</span>
            </span>

            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeFilter === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>جميع المواد</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/10">
                {products.length}
              </span>
            </button>

            <button
              onClick={() => setActiveFilter('valid_only')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeFilter === 'valid_only'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              <span>المخزون الصالح الفعلي</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/10">
                {financialMetrics.actualActiveItemsCount}
              </span>
            </button>

            <button
              onClick={() => setActiveFilter('expired')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeFilter === 'expired'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
              }`}
            >
              <span>منتهية الصلاحية</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/10">
                {financialMetrics.expiredItemsCount}
              </span>
            </button>

            <button
              onClick={() => setActiveFilter('near_expiry')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeFilter === 'near_expiry'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              <span>وشيكة الانتهاء (&lt; 90 يوم)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/10">
                {financialMetrics.nearExpiryItemsCount}
              </span>
            </button>

            <button
              onClick={() => setActiveFilter('low_stock')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeFilter === 'low_stock'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
              }`}
            >
              <span>قاربت على النفاد</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/10">
                {financialMetrics.lowStockItemsCount}
              </span>
            </button>

            <button
              onClick={() => setActiveFilter('out_of_stock')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeFilter === 'out_of_stock'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>نفدت الكمية (صفر)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/10">
                {financialMetrics.zeroStockItemsCount}
              </span>
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <input
              type="text"
              placeholder="البحث بالاسم التجاري، العلمي، أو الباركود..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
          </div>

          {/* Valuation Table */}
          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-right text-xs min-w-[700px]">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">المادة الدوائية</th>
                  <th className="p-3">الباركود والشركة</th>
                  <th className="p-3">الصلاحية</th>
                  <th className="p-3">الكمية</th>
                  <th className="p-3">سعر الجملة</th>
                  <th className="p-3 font-black text-slate-900">القيمة المخزنية</th>
                  <th className="p-3 text-center">حالة الصلاحية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 font-bold">
                      لا توجد مواد تطابق الفلتر أو البحث المحدد
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => {
                    const expiry = calculateExpiryDetails(p.expiryDate, now);
                    const stock = calculateStockDetails(p);
                    const totalItemValue = (p.stockQuantity || 0) * (p.wholesalePrice || 0);

                    return (
                      <tr key={p.id} className="hover:bg-slate-50 transition">
                        <td className="p-3">
                          <div className="font-bold text-slate-900">{p.tradeNameAr}</div>
                          <div className="text-[11px] text-slate-400 font-mono" dir="ltr">
                            {p.tradeNameEn}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="font-mono text-slate-700" dir="ltr">{p.barcode}</div>
                          <div className="text-[11px] text-slate-500">{p.manufacturer}</div>
                        </td>
                        <td className="p-3 font-mono" dir="ltr">
                          {p.expiryDate}
                        </td>
                        <td className="p-3 font-bold text-slate-900">
                          {p.stockQuantity}
                        </td>
                        <td className="p-3 font-bold text-slate-700">
                          {(p.wholesalePrice ?? 0).toLocaleString()} د.ع
                        </td>
                        <td className="p-3 font-black text-emerald-700">
                          {(totalItemValue ?? 0).toLocaleString()} د.ع
                        </td>
                        <td className="p-3 text-center">
                          {expiry.status === 'expired' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <AlertOctagon className="w-3 h-3" />
                              <span>منتهي الصلاحية</span>
                            </span>
                          ) : expiry.status === 'critical' || expiry.status === 'near' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              <Clock className="w-3 h-3" />
                              <span>{expiry.daysRemaining} يوم متبقي</span>
                            </span>
                          ) : stock.status === 'out_of_stock' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              <span>رصيد صفري</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>صالح وفعال</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: SALES & TOP PHARMACIES ANALYTICS */}
      {activeTab === 'sales_analytics' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 -mt-6">
          {/* Card 1: Best Selling Products */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-amber-500" />
                <h3 className="text-sm font-black text-slate-900">
                  الأدوية الأكثر مبيعاً وطلباً
                </h3>
              </div>
              <span className="text-xs text-slate-500 font-bold">
                أعلى {bestSellingProducts.length} مواد
              </span>
            </div>

            {bestSellingProducts.length === 0 ? (
              <div className="p-8 text-center text-slate-400 font-bold text-xs">
                لا توجد بيانات مبيعات مسجلة حتى الآن
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {bestSellingProducts.map((item, idx) => (
                  <div key={idx} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-black text-xs flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div>
                        <h4 className="text-xs font-black text-slate-900">{item.name}</h4>
                        <span className="text-[11px] text-slate-500 font-semibold">
                          تم بيع {item.quantity} عبوة
                        </span>
                      </div>
                    </div>
                    <div className="text-left font-black text-xs text-blue-700">
                      {(item.totalRevenue ?? 0).toLocaleString()} د.ع
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Card 2: Top Ordering Pharmacies */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-black text-slate-900">
                  الصيدليات الأكثر طلباً ونشاطاً
                </h3>
              </div>
              <span className="text-xs text-slate-500 font-bold">
                أعلى {topPharmacies.length} صيدليات
              </span>
            </div>

            {topPharmacies.length === 0 ? (
              <div className="p-8 text-center text-slate-400 font-bold text-xs">
                لا توجد طلبيات صيدليات مسجلة حتى الآن
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {topPharmacies.map((pharmacy, idx) => (
                  <div key={idx} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-700 font-black text-xs flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div>
                        <h4 className="text-xs font-black text-slate-900">
                          {pharmacy.pharmacyName}
                        </h4>
                        <span className="text-[11px] text-slate-500 font-semibold">
                          {pharmacy.ordersCount} طلبيات مكتملة
                        </span>
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="font-black text-xs text-emerald-700">
                        {(pharmacy.totalSpent ?? 0).toLocaleString()} د.ع
                      </div>
                      <div className="text-[10px] text-slate-400">
                        آخر طلب: {new Date(pharmacy.lastOrder).toLocaleDateString('ar-IQ')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
