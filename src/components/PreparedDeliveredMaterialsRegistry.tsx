import React, { useState, useMemo } from 'react';
import {
  Pill,
  PackageCheck,
  CheckCircle2,
  Clock,
  Search,
  Download,
  Store,
  FileText,
  Calendar,
  Layers,
  Sparkles,
  ArrowUpDown,
  Eye,
  Check,
  Building2,
  AlertCircle
} from 'lucide-react';
import { Order, OrderItem, WarehouseSettings, OrderStatus, WarehouseOperation } from '../types';

export interface FlattenedMaterialItem {
  uniqueId: string;
  orderId: string;
  orderNumber: string;
  pharmacyName: string;
  pharmacistName?: string;
  phone?: string;
  address?: string;
  status: OrderStatus;
  preparedAt?: string;
  completedAt?: string;
  createdAt: string;
  lastUpdatedAt?: string;
  operationTimestamps?: string[];
  preparedBy?: string;
  source?: 'direct' | 'link' | 'online_link' | 'offline_cart';
  
  // Item fields
  productId?: string;
  tradeNameAr: string;
  tradeNameEn: string;
  dosageForm?: string;
  quantity: number;
  bonusQuantity: number;
  totalQuantity: number; // quantity + bonusQuantity
  unitPrice: number;
  meltedUnitPrice?: number;
  totalPrice: number;
  batchNumber?: string;
  expiryDate?: string;
  confirmedExpiry?: string;
}

interface PreparedDeliveredMaterialsRegistryProps {
  orders: Order[];
  settings: WarehouseSettings;
  operations?: WarehouseOperation[];
  onPrintOrder?: (order: Order) => void;
  onViewOrder?: (orderId: string, orderNumber: string) => void;
}

type MaterialStatusFilter = 'all' | 'delivered' | 'ready' | 'preparing' | 'new';
type DatePresetType = 'all' | 'today_yesterday' | 'today' | 'yesterday' | 'week' | 'month';
type GroupViewMode = 'flat' | 'grouped';

// Helper function to safely extract local date in YYYY-MM-DD
const toLocalDateStr = (d?: string | Date | null): string => {
  if (!d) return '';
  try {
    const dt = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(dt.getTime())) return '';
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return '';
  }
};

export const PreparedDeliveredMaterialsRegistry: React.FC<PreparedDeliveredMaterialsRegistryProps> = ({
  orders,
  settings,
  operations,
  onPrintOrder,
  onViewOrder,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<MaterialStatusFilter>('all');
  const [datePreset, setDatePreset] = useState<DatePresetType>('all');
  const [viewMode, setViewMode] = useState<GroupViewMode>('flat');
  const [sortField, setSortField] = useState<'date' | 'quantity' | 'totalPrice' | 'name'>('date');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Flatten all items across all active orders and operations stream
  const allMaterials: FlattenedMaterialItem[] = useMemo(() => {
    const list: FlattenedMaterialItem[] = [];
    const processedOrderIds = new Set<string>();

    // 1. Traverse all orders in system
    orders.forEach((order) => {
      if (!order || !order.id) return;
      processedOrderIds.add(order.id);
      if (order.orderNumber) processedOrderIds.add(order.orderNumber);

      const opsForOrder = (operations || []).filter(
        (op) =>
          (op.orderId && op.orderId === order.id) ||
          (op.orderNumber && op.orderNumber === order.orderNumber)
      );
      const opDates = opsForOrder.map((op) => op.timestamp).filter(Boolean);
      const prepOp = opsForOrder.find((op) => op.type === 'order_prepared' || op.type === 'status_changed');

      (order.items || []).forEach((item, idx) => {
        const qty = item.quantity || 0;
        const bonus = item.bonusQuantity || 0;
        const uPrice = item.unitPrice || 0;
        const tPrice = item.totalPrice ?? (qty * uPrice) ?? 0;

        list.push({
          uniqueId: `${order.id}-${idx}-${item.productId || item.tradeNameAr || idx}`,
          orderId: order.id,
          orderNumber: order.orderNumber || 'ORD',
          pharmacyName: order.pharmacyName || 'صيدلية غير محددة',
          pharmacistName: order.pharmacistName,
          phone: order.phone,
          address: order.address,
          status: order.status || 'new',
          preparedAt: order.preparedAt || prepOp?.timestamp,
          completedAt: order.completedAt,
          createdAt: order.createdAt,
          lastUpdatedAt: (order as any).lastUpdatedAt || (order as any).editedAt,
          operationTimestamps: opDates,
          preparedBy: order.preparedBy || prepOp?.performedBy || 'كادر المذخر',
          source: order.source,

          productId: item.productId,
          tradeNameAr: item.tradeNameAr || 'مادة بدون اسم',
          tradeNameEn: item.tradeNameEn || '',
          dosageForm: item.dosageForm,
          quantity: qty,
          bonusQuantity: bonus,
          totalQuantity: qty + bonus,
          unitPrice: uPrice,
          meltedUnitPrice: item.meltedUnitPrice,
          totalPrice: tPrice,
          batchNumber: item.batchNumber || item.confirmedBatch,
          expiryDate: item.expiryDate,
          confirmedExpiry: item.confirmedExpiry || item.expiryDate,
        });
      });
    });

    // 2. Supplement with items recorded in the warehouse operations stream (if any missing from orders list)
    (operations || []).forEach((op) => {
      if (op.items && Array.isArray(op.items) && op.items.length > 0) {
        const isKnownOrder =
          (op.orderId && processedOrderIds.has(op.orderId)) ||
          (op.orderNumber && processedOrderIds.has(op.orderNumber));

        if (!isKnownOrder) {
          op.items.forEach((item, idx) => {
            const qty = item.quantity || 0;
            const bonus = item.bonusQuantity || 0;
            const uPrice = item.unitPrice || 0;
            const tPrice = item.totalPrice ?? (qty * uPrice) ?? 0;

            list.push({
              uniqueId: `op-${op.id}-${idx}-${item.productId || item.tradeNameAr || idx}`,
              orderId: op.orderId || op.id,
              orderNumber: op.orderNumber || 'ORD',
              pharmacyName: op.pharmacyName || 'صيدلية غير محددة',
              status: (op.targetStatus || op.status || 'ready') as OrderStatus,
              preparedAt: op.timestamp,
              completedAt: op.type === 'order_delivered' ? op.timestamp : undefined,
              createdAt: op.timestamp,
              lastUpdatedAt: op.timestamp,
              operationTimestamps: [op.timestamp],
              preparedBy: op.performedBy || 'كادر المذخر',
              source: 'direct',

              productId: item.productId,
              tradeNameAr: item.tradeNameAr || 'مادة بدون اسم',
              tradeNameEn: item.tradeNameEn || '',
              dosageForm: item.dosageForm,
              quantity: qty,
              bonusQuantity: bonus,
              totalQuantity: qty + bonus,
              unitPrice: uPrice,
              meltedUnitPrice: item.meltedUnitPrice,
              totalPrice: tPrice,
              batchNumber: item.batchNumber || item.confirmedBatch,
              expiryDate: item.expiryDate,
              confirmedExpiry: item.confirmedExpiry || item.expiryDate,
            });
          });
        }
      }
    });

    return list;
  }, [orders, operations]);

  // Apply filters (search, status, date)
  const filteredMaterials = useMemo(() => {
    const now = new Date();
    const todayStr = toLocalDateStr(now);
    const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = toLocalDateStr(yesterdayDate);

    const sevenDaysAgoDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const firstDayOfMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);

    return allMaterials.filter((item) => {
      // 1. Status Filter
      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }

      // 2. Comprehensive Date Filter:
      // Checks all associated timestamps: preparedAt, completedAt, lastUpdatedAt, createdAt, or operation activity
      const candidateDates: string[] = [
        item.preparedAt,
        item.completedAt,
        item.lastUpdatedAt,
        item.createdAt,
        ...(item.operationTimestamps || []),
      ].filter(Boolean) as string[];

      const candidateLocalDateStrs = candidateDates.map(toLocalDateStr).filter(Boolean);
      const candidateTimestamps = candidateDates
        .map((d) => new Date(d).getTime())
        .filter((t) => !isNaN(t));

      if (datePreset === 'today') {
        if (!candidateLocalDateStrs.includes(todayStr)) return false;
      } else if (datePreset === 'yesterday') {
        if (!candidateLocalDateStrs.includes(yesterdayStr)) return false;
      } else if (datePreset === 'today_yesterday') {
        if (!candidateLocalDateStrs.some((d) => d === todayStr || d === yesterdayStr)) return false;
      } else if (datePreset === 'week') {
        if (!candidateTimestamps.some((t) => t >= sevenDaysAgoDate.getTime())) return false;
      } else if (datePreset === 'month') {
        if (!candidateTimestamps.some((t) => t >= firstDayOfMonthDate.getTime())) return false;
      }

      // 3. Search Filter
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const matchesNameAr = item.tradeNameAr.toLowerCase().includes(query);
        const matchesNameEn = (item.tradeNameEn || '').toLowerCase().includes(query);
        const matchesPharmacy = item.pharmacyName.toLowerCase().includes(query);
        const matchesOrder = item.orderNumber.toLowerCase().includes(query);
        const matchesBatch = (item.batchNumber || '').toLowerCase().includes(query);
        const matchesPreparedBy = (item.preparedBy || '').toLowerCase().includes(query);

        if (
          !matchesNameAr &&
          !matchesNameEn &&
          !matchesPharmacy &&
          !matchesOrder &&
          !matchesBatch &&
          !matchesPreparedBy
        ) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      if (sortField === 'quantity') {
        return sortOrder === 'desc' ? b.totalQuantity - a.totalQuantity : a.totalQuantity - b.totalQuantity;
      }
      if (sortField === 'totalPrice') {
        return sortOrder === 'desc' ? b.totalPrice - a.totalPrice : a.totalPrice - b.totalPrice;
      }
      if (sortField === 'name') {
        return sortOrder === 'desc'
          ? b.tradeNameAr.localeCompare(a.tradeNameAr, 'ar')
          : a.tradeNameAr.localeCompare(b.tradeNameAr, 'ar');
      }
      // Default: latest activity date
      const getLatestTime = (item: FlattenedMaterialItem) => {
        const dates = [
          item.completedAt,
          item.preparedAt,
          item.lastUpdatedAt,
          item.createdAt,
          ...(item.operationTimestamps || []),
        ].filter(Boolean);
        const times = dates.map((d) => new Date(d as string).getTime()).filter((t) => !isNaN(t));
        return times.length > 0 ? Math.max(...times) : 0;
      };
      const dateA = getLatestTime(a);
      const dateB = getLatestTime(b);
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });
  }, [allMaterials, statusFilter, datePreset, searchTerm, sortField, sortOrder]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const totalRecords = filteredMaterials.length;
    const totalOriginalQuantity = filteredMaterials.reduce((sum, i) => sum + i.quantity, 0);
    const totalBonusQuantity = filteredMaterials.reduce((sum, i) => sum + i.bonusQuantity, 0);
    const totalBoxes = totalOriginalQuantity + totalBonusQuantity;
    const totalMoneyAmount = filteredMaterials.reduce((sum, i) => sum + i.totalPrice, 0);

    const deliveredItems = filteredMaterials.filter((i) => i.status === 'delivered');
    const readyItems = filteredMaterials.filter((i) => i.status === 'ready');
    const preparingItems = filteredMaterials.filter((i) => i.status === 'preparing');

    const deliveredBoxes = deliveredItems.reduce((sum, i) => sum + i.totalQuantity, 0);
    const readyBoxes = readyItems.reduce((sum, i) => sum + i.totalQuantity, 0);

    const uniquePharmacies = new Set(filteredMaterials.map((i) => i.pharmacyName.trim().toLowerCase())).size;
    const uniqueMedicines = new Set(filteredMaterials.map((i) => i.tradeNameAr.trim().toLowerCase())).size;

    return {
      totalRecords,
      totalOriginalQuantity,
      totalBonusQuantity,
      totalBoxes,
      totalMoneyAmount,
      deliveredBoxes,
      readyBoxes,
      deliveredCount: deliveredItems.length,
      readyCount: readyItems.length,
      preparingCount: preparingItems.length,
      uniquePharmacies,
      uniqueMedicines,
    };
  }, [filteredMaterials]);

  // Grouped by Medicine View Data
  const groupedByMedicine = useMemo(() => {
    const map = new Map<
      string,
      {
        tradeNameAr: string;
        tradeNameEn: string;
        dosageForm?: string;
        totalQuantity: number;
        totalBonus: number;
        totalBoxes: number;
        totalRevenue: number;
        deliveriesCount: number;
        pharmaciesList: {
          pharmacyName: string;
          quantity: number;
          bonus: number;
          orderNumber: string;
          status: OrderStatus;
          date: string;
        }[];
      }
    >();

    filteredMaterials.forEach((item) => {
      const key = item.tradeNameAr.trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          tradeNameAr: item.tradeNameAr,
          tradeNameEn: item.tradeNameEn,
          dosageForm: item.dosageForm,
          totalQuantity: 0,
          totalBonus: 0,
          totalBoxes: 0,
          totalRevenue: 0,
          deliveriesCount: 0,
          pharmaciesList: [],
        });
      }

      const group = map.get(key)!;
      group.totalQuantity += item.quantity;
      group.totalBonus += item.bonusQuantity;
      group.totalBoxes += item.totalQuantity;
      group.totalRevenue += item.totalPrice;
      group.deliveriesCount += 1;
      group.pharmaciesList.push({
        pharmacyName: item.pharmacyName,
        quantity: item.quantity,
        bonus: item.bonusQuantity,
        orderNumber: item.orderNumber,
        status: item.status,
        date: item.completedAt || item.preparedAt || item.createdAt,
      });
    });

    return Array.from(map.values()).sort((a, b) => b.totalBoxes - a.totalBoxes);
  }, [filteredMaterials]);

  // Export to Excel / CSV
  const handleExportCSV = () => {
    if (filteredMaterials.length === 0) return;

    const headers = [
      'ت',
      'الصنف الدوائي (عربي)',
      'الصنف الدوائي (إنكليزي)',
      'الشكل الصيدلاني',
      'الكمية المطلوبة (علب)',
      'البونص المجاني',
      'إجمالي العلب المصروفة',
      'سعر الوحدة',
      'إجمالي السعر',
      'رقم الوجبة (Batch)',
      'تاريخ انتهاء الصلاحية',
      'اسم الصيدلية',
      'رقم الطلبية',
      'حالة التجهيز والتسليم',
      'القائم بالتجهيز',
      'تاريخ ووقت الإجراء',
    ];

    const rows = filteredMaterials.map((item, idx) => {
      const statusLabel =
        item.status === 'delivered'
          ? 'تم التسليم للصيدلية'
          : item.status === 'ready'
          ? 'جاهز للتسليم (تم التجهيز)'
          : 'قيد التجهيز';

      const dateStr = item.completedAt || item.preparedAt || item.createdAt;
      const formattedDate = new Date(dateStr).toLocaleString('ar-IQ');

      return [
        idx + 1,
        `"${item.tradeNameAr}"`,
        `"${item.tradeNameEn || ''}"`,
        `"${item.dosageForm || ''}"`,
        item.quantity,
        item.bonusQuantity,
        item.totalQuantity,
        item.unitPrice,
        item.totalPrice,
        `"${item.batchNumber || ''}"`,
        `"${item.confirmedExpiry || item.expiryDate || ''}"`,
        `"${item.pharmacyName}"`,
        `"${item.orderNumber}"`,
        `"${statusLabel}"`,
        `"${item.preparedBy || 'إدارة المذخر'}"`,
        `"${formattedDate}"`,
      ].join(',');
    });

    const bom = '\uFEFF';
    const csvContent = bom + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `سجل_المواد_المجهزة_والمسلمة_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'delivered':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
            <Check className="w-3 h-3 text-emerald-600" />
            <span>تم التسليم</span>
          </span>
        );
      case 'ready':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
            <PackageCheck className="w-3 h-3 text-blue-600" />
            <span>جاهزة ومجهزة</span>
          </span>
        );
      case 'preparing':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-600" />
            <span>قيد التجهيز</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
            <span>{status}</span>
          </span>
        );
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-6 space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white flex items-center justify-center font-black shadow-md shadow-emerald-500/20 shrink-0">
            <Pill className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                سجل كافة المواد المجهزة والمسلّمة
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                {metrics.totalRecords} بند صيدلاني
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              حصر دقيق وشامل لجميع المواد والأدوية التي تم تجهيزها وفحص وجباتها وتسليمها للصيدليات مع الكميات، البونص، والأسعار
            </p>
          </div>
        </div>

        {/* View Mode & Export Actions */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('flat')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'flat'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>عرض تفصيلي للبنود ({filteredMaterials.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grouped')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'grouped'
                  ? 'bg-white text-emerald-800 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-emerald-600" />
              <span>تجميع حسب المادة ({metrics.uniqueMedicines})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={filteredMaterials.length === 0}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            title="تصدير بيانات المواد لملف Excel / CSV"
          >
            <Download className="w-4 h-4" />
            <span>تصدير Excel ({filteredMaterials.length})</span>
          </button>
        </div>
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total Boxes Dispatched */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50/50 rounded-xl p-3.5 border border-emerald-200/80">
          <div className="flex items-center justify-between text-emerald-700 text-xs font-bold">
            <span>إجمالي العلب المصروفة</span>
            <PackageCheck className="w-4 h-4" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-emerald-900 font-mono">
              {metrics.totalBoxes.toLocaleString()}
            </span>
            <span className="text-xs font-bold text-emerald-700">علبة</span>
          </div>
          <div className="text-[11px] text-emerald-700 mt-1 font-semibold flex items-center gap-1">
            <span>{metrics.totalOriginalQuantity.toLocaleString()} أساسي</span>
            <span>+</span>
            <span className="text-amber-700">{metrics.totalBonusQuantity.toLocaleString()} بونص مجاني</span>
          </div>
        </div>

        {/* Delivered vs Ready Boxes */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 rounded-xl p-3.5 border border-blue-200/80">
          <div className="flex items-center justify-between text-blue-700 text-xs font-bold">
            <span>التسليم والجاهزية</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-blue-900 font-mono">
              {metrics.deliveredBoxes.toLocaleString()}
            </span>
            <span className="text-xs font-bold text-blue-700">علبة مسلّمة</span>
          </div>
          <div className="text-[11px] text-blue-700 mt-1 font-semibold">
            و {metrics.readyBoxes.toLocaleString()} علبة مجهزة بانتظار الشحن والتسليم
          </div>
        </div>

        {/* Financial Value of Dispatched Goods */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50/50 rounded-xl p-3.5 border border-amber-200/80">
          <div className="flex items-center justify-between text-amber-700 text-xs font-bold">
            <span>القيمة الإجمالية للمواد</span>
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-amber-900 font-mono">
              {(metrics.totalMoneyAmount ?? 0).toLocaleString()}
            </span>
            <span className="text-xs font-bold text-amber-700">{settings.currency}</span>
          </div>
          <div className="text-[11px] text-amber-800 mt-1 font-semibold">
            عبر {metrics.uniquePharmacies} صيدلية معتمدة
          </div>
        </div>

        {/* Unique Medicines Count */}
        <div className="bg-gradient-to-br from-purple-50 to-pink-50/50 rounded-xl p-3.5 border border-purple-200/80">
          <div className="flex items-center justify-between text-purple-700 text-xs font-bold">
            <span>تنوع الأصناف الدوائية</span>
            <Pill className="w-4 h-4" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-purple-900 font-mono">
              {metrics.uniqueMedicines}
            </span>
            <span className="text-xs font-bold text-purple-700">صنف متميز</span>
          </div>
          <div className="text-[11px] text-purple-700 mt-1 font-semibold">
            ضمن {metrics.totalRecords} عملية صرف وتجهيز
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث باسم المادة الدوائية (عربي أو إنكليزي)، الصيدلية، الوجبة، رقم الطلب..."
              className="w-full pr-9 pl-4 py-2 bg-white border border-slate-200 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                مسح
              </button>
            )}
          </div>

          {/* Status Filter Buttons */}
          <div className="flex items-center gap-1 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              الكل ({allMaterials.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('ready')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                statusFilter === 'ready'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-white text-blue-700 hover:bg-blue-50 border border-slate-200'
              }`}
            >
              جاهزة ومجهزة ({allMaterials.filter((i) => i.status === 'ready').length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('delivered')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                statusFilter === 'delivered'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-white text-emerald-700 hover:bg-emerald-50 border border-slate-200'
              }`}
            >
              تم التسليم ({allMaterials.filter((i) => i.status === 'delivered').length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('preparing')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                statusFilter === 'preparing'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-white text-amber-700 hover:bg-amber-50 border border-slate-200'
              }`}
            >
              قيد التجهيز ({allMaterials.filter((i) => i.status === 'preparing').length})
            </button>
            {allMaterials.some((i) => i.status === 'new') && (
              <button
                type="button"
                onClick={() => setStatusFilter('new')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                  statusFilter === 'new'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-white text-indigo-700 hover:bg-indigo-50 border border-slate-200'
                }`}
              >
                طلبات جديدة ({allMaterials.filter((i) => i.status === 'new').length})
              </button>
            )}
          </div>
        </div>

        {/* Secondary Row: Date Preset & Sort */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-slate-500 font-bold flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>فترة الصرف والتجهيز:</span>
            </span>
            <button
              type="button"
              onClick={() => setDatePreset('all')}
              className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                datePreset === 'all' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              كافة الفترات ({allMaterials.length})
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('today_yesterday')}
              className={`px-3 py-1 rounded-md font-bold transition flex items-center gap-1 cursor-pointer ${
                datePreset === 'today_yesterday'
                  ? 'bg-emerald-700 text-white shadow-xs ring-2 ring-emerald-400/40'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300 font-black'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>اليوم وأمس (آخر 48 ساعة)</span>
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('today')}
              className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                datePreset === 'today' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              اليوم
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('yesterday')}
              className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                datePreset === 'yesterday' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              أمس
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('week')}
              className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                datePreset === 'week' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              آخر 7 أيام
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('month')}
              className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                datePreset === 'month' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              هذا الشهر
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-bold flex items-center gap-1">
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>ترتيب حسب:</span>
            </span>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as any)}
              className="bg-white border border-slate-200 text-slate-700 text-xs rounded-md px-2 py-1 font-bold focus:outline-none"
            >
              <option value="date">تاريخ الإجراء</option>
              <option value="quantity">إجمالي العلب</option>
              <option value="totalPrice">المبلغ الإجمالي</option>
              <option value="name">اسم الصنف أبجدياً</option>
            </select>
            <button
              type="button"
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              className="p-1 bg-white border border-slate-200 rounded-md text-slate-600 hover:bg-slate-100 cursor-pointer font-bold text-xs"
              title={sortOrder === 'desc' ? 'تنازلي (الأحدث/الأعلى)' : 'تصاعدي (الأقدم/الأقل)'}
            >
              {sortOrder === 'desc' ? '⬇ تنازلي' : '⬆ تصاعدي'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content: Flat Table vs Grouped View */}
      {filteredMaterials.length === 0 ? (
        <div className="py-16 text-center text-slate-400 bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
          <Pill className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <h4 className="text-base font-bold text-slate-700">لا توجد مواد مطابقة لشروط البحث والفلترة</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            تأكد من اختيار فترة زمنية مناسبة أو إلغاء قيود البحث لعرض كافة المواد التي قام الكادر بتجهيزها أو تسليمها للصيدليات
          </p>
          {(searchTerm || statusFilter !== 'all' || datePreset !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
                setDatePreset('all');
              }}
              className="mt-4 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition cursor-pointer"
            >
              إعادة ضبط الفلاتر وعرض الكل
            </button>
          )}
        </div>
      ) : viewMode === 'flat' ? (
        /* Detailed Items Flat Table */
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/90 text-slate-700 border-b border-slate-200 font-bold">
                <th className="p-3 w-10 text-center">ت</th>
                <th className="p-3">الصنف الدوائي والمواصفات</th>
                <th className="p-3">الصيدلية المستلمة</th>
                <th className="p-3">الطلبية والحالة</th>
                <th className="p-3 text-center">الكمية المصروفة</th>
                <th className="p-3 text-center">السعر والإجمالي</th>
                <th className="p-3">الوجبة والصلاحية</th>
                <th className="p-3">المجهز والتاريخ</th>
                <th className="p-3 text-center w-24">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMaterials.map((item, idx) => {
                const itemDate = item.completedAt || item.preparedAt || item.createdAt;
                const localItemDate = toLocalDateStr(itemDate);
                const now = new Date();
                const todayStr = toLocalDateStr(now);
                const yesterdayStr = toLocalDateStr(new Date(now.getTime() - 24 * 60 * 60 * 1000));
                const isTodayItem = localItemDate === todayStr;
                const isYesterdayItem = localItemDate === yesterdayStr;

                const formattedDate = new Date(itemDate).toLocaleDateString('ar-IQ', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });
                const formattedTime = new Date(itemDate).toLocaleTimeString('ar-IQ', {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <tr
                    key={item.uniqueId}
                    className="hover:bg-slate-50/80 transition group"
                  >
                    <td className="p-3 text-center text-slate-400 font-mono font-bold">
                      {idx + 1}
                    </td>

                    {/* Medicine Info */}
                    <td className="p-3">
                      <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                        <Pill className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>{item.tradeNameAr}</span>
                      </div>
                      {item.tradeNameEn && (
                        <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                          {item.tradeNameEn}
                        </div>
                      )}
                      {item.dosageForm && (
                        <span className="inline-block mt-1 text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded">
                          {item.dosageForm}
                        </span>
                      )}
                    </td>

                    {/* Pharmacy Info */}
                    <td className="p-3">
                      <div className="font-bold text-slate-800 flex items-center gap-1.5">
                        <Store className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>{item.pharmacyName}</span>
                      </div>
                      {item.address && (
                        <div className="text-[11px] text-slate-400 truncate max-w-[160px]">
                          {item.address}
                        </div>
                      )}
                      {item.phone && (
                        <div className="text-[10px] font-mono text-slate-500 mt-0.5" dir="ltr">
                          {item.phone}
                        </div>
                      )}
                    </td>

                    {/* Order & Status */}
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-xs">
                          #{item.orderNumber}
                        </span>
                      </div>
                      <div className="mt-1.5">
                        {getStatusBadge(item.status)}
                      </div>
                    </td>

                    {/* Quantities (Original + Bonus) */}
                    <td className="p-3 text-center">
                      <div className="font-mono font-black text-sm text-slate-900">
                        {item.totalQuantity} <span className="text-[11px] font-bold text-slate-500">علبة</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        <span>{item.quantity} أساسي</span>
                        {item.bonusQuantity > 0 && (
                          <span className="text-amber-700 font-bold mr-1">
                            (+{item.bonusQuantity} بونص)
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Price & Total */}
                    <td className="p-3 text-center">
                      <div className="font-mono font-black text-emerald-700 text-sm">
                        {(item.totalPrice ?? 0).toLocaleString()} <span className="text-[10px]">{settings.currency}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {item.meltedUnitPrice ? (
                          <span title="سعر التذويب الفعلي">
                            تذويب: {(item.meltedUnitPrice ?? 0).toLocaleString()}
                          </span>
                        ) : (
                          <span>{(item.unitPrice ?? 0).toLocaleString()} للعلبة</span>
                        )}
                      </div>
                    </td>

                    {/* Batch & Expiry */}
                    <td className="p-3">
                      <div className="font-mono text-xs font-bold text-slate-800 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>{item.confirmedExpiry || item.expiryDate || '—'}</span>
                      </div>
                      {item.batchNumber && (
                        <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                          وجبة: <span className="text-slate-800 font-semibold">{item.batchNumber}</span>
                        </div>
                      )}
                    </td>

                    {/* Prepared By & Date */}
                    <td className="p-3">
                      <div className="font-bold text-slate-800 text-xs">
                        {item.preparedBy || 'إدارة المذخر'}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        <span>{formattedDate}</span>
                        <span className="mx-1">•</span>
                        <span dir="ltr">{formattedTime}</span>
                      </div>
                      {isTodayItem && (
                        <div className="mt-1">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                            تجهيز اليوم
                          </span>
                        </div>
                      )}
                      {isYesterdayItem && (
                        <div className="mt-1">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-300">
                            تجهيز أمس
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {onViewOrder && (
                          <button
                            type="button"
                            onClick={() => onViewOrder(item.orderId, item.orderNumber)}
                            className="p-1.5 bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-700 rounded-lg transition cursor-pointer"
                            title="عرض قائمة الطلب بالكامل"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                        {onPrintOrder && (
                          <button
                            type="button"
                            onClick={() => {
                              const targetOrder = orders.find((o) => o.id === item.orderId);
                              if (targetOrder) onPrintOrder(targetOrder);
                            }}
                            className="p-1.5 bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 rounded-lg transition cursor-pointer"
                            title="طباعة وصل الطلبية"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Grouped by Medicine View */
        <div className="space-y-3">
          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-900 flex items-center justify-between">
            <span>تجميع الأصناف المسلمة والمجهزة ({groupedByMedicine.length} صنف مختلف):</span>
            <span>مرتبة حسب الأكثر صرفاً من المذخر</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {groupedByMedicine.map((med, mIdx) => (
              <div
                key={mIdx}
                className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs hover:shadow-xs transition space-y-3"
              >
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center font-black">
                      <Pill className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">
                        {med.tradeNameAr}
                      </h4>
                      {med.tradeNameEn && (
                        <p className="text-[11px] font-mono text-slate-400">
                          {med.tradeNameEn}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-left">
                    <div className="font-mono font-black text-emerald-700 text-sm">
                      {(med.totalRevenue ?? 0).toLocaleString()} {settings.currency}
                    </div>
                    <div className="text-[11px] text-slate-400 font-semibold">
                      {med.deliveriesCount} عملية صرف
                    </div>
                  </div>
                </div>

                {/* Box Counters */}
                <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-lg text-center text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block font-semibold">إجمالي العلب</span>
                    <span className="font-mono font-black text-slate-900 text-sm">
                      {med.totalBoxes.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block font-semibold">كمية أساسية</span>
                    <span className="font-mono font-black text-blue-700 text-sm">
                      {med.totalQuantity.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block font-semibold">بونص مجاني</span>
                    <span className="font-mono font-black text-amber-700 text-sm">
                      {med.totalBonus.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Recipient Pharmacies List */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-bold text-slate-600 block">
                    الصيدليات التي استلمت هذا الصنف ({med.pharmaciesList.length}):
                  </span>
                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                    {med.pharmaciesList.map((pharm, pIdx) => (
                      <div
                        key={pIdx}
                        className="flex items-center justify-between text-xs bg-slate-50/70 hover:bg-slate-100 px-2 py-1.5 rounded-md transition"
                      >
                        <div className="flex items-center gap-1.5">
                          <Store className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="font-semibold text-slate-800">{pharm.pharmacyName}</span>
                          <span className="text-[10px] font-mono text-blue-600">#{pharm.orderNumber}</span>
                        </div>
                        <div className="flex items-center gap-2 font-mono text-[11px]">
                          <span className="font-black text-slate-900">
                            {pharm.quantity + pharm.bonus} علبة
                          </span>
                          {pharm.bonus > 0 && (
                            <span className="text-[10px] text-amber-700 font-bold">
                              (+{pharm.bonus})
                            </span>
                          )}
                          {getStatusBadge(pharm.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
