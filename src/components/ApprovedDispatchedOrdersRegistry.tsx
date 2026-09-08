import React, { useState, useMemo } from 'react';
import {
  FileText,
  CheckCircle,
  Clock,
  PackageCheck,
  Printer,
  Download,
  Calendar,
  Search,
  Building2,
  UserCheck,
  Phone,
  MapPin,
  Filter,
  Check,
  Package,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  X,
  Store,
  Layers,
  Sparkles,
  Send,
  ArrowRight,
  Pill
} from 'lucide-react';
import { Order, OrderStatus, WarehouseSettings, WarehouseOperation } from '../types';
import { PreparedDeliveredMaterialsRegistry } from './PreparedDeliveredMaterialsRegistry';

interface ApprovedDispatchedOrdersRegistryProps {
  orders: Order[];
  settings: WarehouseSettings;
  operations?: WarehouseOperation[];
  onUpdateOrderStatus: (orderId: string, status: OrderStatus) => void;
  onPrintOrder: (order: Order) => void;
  onClose?: () => void;
  isEmbedded?: boolean;
}

type DispatchedFilterType = 'all' | 'ready' | 'delivered' | 'preparing';
type DatePresetType = 'all' | 'today_yesterday' | 'today' | 'yesterday' | 'week' | 'month' | 'custom';

// Helper to safely extract local date in YYYY-MM-DD
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

export const ApprovedDispatchedOrdersRegistry: React.FC<ApprovedDispatchedOrdersRegistryProps> = ({
  orders,
  settings,
  operations,
  onUpdateOrderStatus,
  onPrintOrder,
  onClose,
  isEmbedded = false,
}) => {
  const [subView, setSubView] = useState<'orders' | 'materials'>('orders');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<DispatchedFilterType>('all');
  const [datePreset, setDatePreset] = useState<DatePresetType>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Filter approved & dispatched orders: status in ['ready', 'delivered', 'preparing']
  // Exclude rejected and new (unapproved) orders
  const baseApprovedDispatchedOrders = useMemo(() => {
    return orders.filter(
      (o) => o.status === 'ready' || o.status === 'delivered' || o.status === 'preparing' || (Array.isArray(o.items) && o.items.some(i => i.verified || i.confirmedBatch))
    );
  }, [orders]);

  // Apply filters
  const filteredOrders = useMemo(() => {
    const now = new Date();
    const todayStr = toLocalDateStr(now);
    const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = toLocalDateStr(yesterdayDate);

    const sevenDaysAgoDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const firstDayOfMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);

    return baseApprovedDispatchedOrders.filter((order) => {
      // 1. Status Filter
      if (statusFilter !== 'all' && order.status !== statusFilter) {
        return false;
      }

      // Collect all candidate dates for this order
      const opsForThisOrder = (operations || []).filter(
        (op) => (op.orderId && op.orderId === order.id) || (op.orderNumber && op.orderNumber === order.orderNumber)
      );
      const opDates = opsForThisOrder.map((op) => op.timestamp).filter(Boolean);

      const candidateDates: string[] = [
        order.preparedAt,
        order.completedAt,
        (order as any).lastUpdatedAt,
        order.createdAt,
        ...opDates,
      ].filter(Boolean) as string[];

      const candidateLocalDateStrs = candidateDates.map(toLocalDateStr).filter(Boolean);
      const candidateTimestamps = candidateDates
        .map((d) => new Date(d).getTime())
        .filter((t) => !isNaN(t));

      // 2. Date Preset Filter
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
      } else if (datePreset === 'custom') {
        if (customStartDate && !candidateLocalDateStrs.some((d) => d >= customStartDate)) return false;
        if (customEndDate && !candidateLocalDateStrs.some((d) => d <= customEndDate)) return false;
      }

      // 3. Search Term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const matchesNumber = (order.orderNumber || '').toLowerCase().includes(query);
        const matchesPharmacy = (order.pharmacyName || '').toLowerCase().includes(query);
        const matchesPharmacist = (order.pharmacistName || '').toLowerCase().includes(query);
        const matchesPhone = (order.phone || '').includes(query);
        const matchesAddress = (order.address || '').toLowerCase().includes(query);
        const matchesMedicines = order.items.some(
          (i) =>
            i.tradeNameAr.toLowerCase().includes(query) ||
            i.tradeNameEn.toLowerCase().includes(query) ||
            (i.batchNumber && i.batchNumber.toLowerCase().includes(query))
        );

        if (
          !matchesNumber &&
          !matchesPharmacy &&
          !matchesPharmacist &&
          !matchesPhone &&
          !matchesAddress &&
          !matchesMedicines
        ) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      // Sort newest first based on preparedAt / completedAt / createdAt
      const dateA = new Date(a.preparedAt || a.completedAt || a.createdAt).getTime();
      const dateB = new Date(b.preparedAt || b.completedAt || b.createdAt).getTime();
      return dateB - dateA;
    });
  }, [baseApprovedDispatchedOrders, statusFilter, datePreset, customStartDate, customEndDate, searchTerm]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const totalOrdersCount = filteredOrders.length;
    const totalAmountSum = filteredOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const totalMedicinesPackages = filteredOrders.reduce((sum, o) => sum + (o.totalQuantity || 0), 0);
    const totalBonusPackages = filteredOrders.reduce((sum, o) => sum + (o.totalBonus || 0), 0);
    const uniquePharmacies = new Set(filteredOrders.map((o) => o.pharmacyName.trim().toLowerCase())).size;

    const readyCount = filteredOrders.filter((o) => o.status === 'ready').length;
    const deliveredCount = filteredOrders.filter((o) => o.status === 'delivered').length;
    const preparingCount = filteredOrders.filter((o) => o.status === 'preparing').length;

    return {
      totalOrdersCount,
      totalAmountSum,
      totalMedicinesPackages,
      totalBonusPackages,
      uniquePharmacies,
      readyCount,
      deliveredCount,
      preparingCount,
    };
  }, [filteredOrders]);

  // Format Full Arabic Date & Time
  const formatDateTime = (dateIso?: string) => {
    if (!dateIso) return '—';
    try {
      const d = new Date(dateIso);
      const datePart = d.toLocaleDateString('ar-IQ', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
      const timePart = d.toLocaleTimeString('ar-IQ', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `${datePart} • ${timePart}`;
    } catch {
      return dateIso;
    }
  };

  const formatDateOnly = (dateIso?: string) => {
    if (!dateIso) return '—';
    try {
      const d = new Date(dateIso);
      return d.toLocaleDateString('ar-IQ', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      return dateIso;
    }
  };

  // Export to Excel / CSV
  const handleExportCSV = () => {
    if (filteredOrders.length === 0) return;

    const headers = [
      'ت',
      'رقم الطلبية',
      'اسم الصيدلية',
      'اسم الصيدلي',
      'الهاتف',
      'العنوان',
      'تاريخ الطلب',
      'تاريخ ووقت الموافقة والتجهيز',
      'تاريخ ووقت التسليم',
      'القائم بالتجهيز',
      'عدد المواد',
      'إجمالي العلب',
      'إجمالي البونص',
      'المبلغ الإجمالي',
      'حالة القائمة',
      'نوع التجهيز',
    ];

    const rows = filteredOrders.map((o, idx) => {
      const statusLabel =
        o.status === 'delivered'
          ? 'تم التسليم للصيدلية'
          : o.status === 'ready'
          ? 'جاهز للتسليم / صادر'
          : 'معتمد قيد التجهيز';

      const sourceLabel = o.source === 'direct' ? 'تجهيز مباشر من المذخر' : 'طلب رابط مباشر';

      return [
        idx + 1,
        o.orderNumber,
        `"${o.pharmacyName}"`,
        `"${o.pharmacistName || ''}"`,
        `"${o.phone || ''}"`,
        `"${o.address || ''}"`,
        `"${formatDateTime(o.createdAt)}"`,
        `"${formatDateTime(o.preparedAt || o.createdAt)}"`,
        `"${o.completedAt ? formatDateTime(o.completedAt) : 'بانتظار التسليم'}"`,
        `"${o.preparedBy || 'إدارة المذخر'}"`,
        o.items.length,
        o.totalQuantity,
        o.totalBonus,
        `${o.totalAmount} ${settings.currency}`,
        `"${statusLabel}"`,
        `"${sourceLabel}"`,
      ].join(',');
    });

    const bom = '\uFEFF'; // UTF-8 BOM for Arabic support in Excel
    const csvContent = bom + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `سجل_الطلبيات_الصادرة_والمعتمدة_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print Complete Registry Report
  const handlePrintRegistry = () => {
    window.print();
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'ready':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200 shadow-2xs">
            <PackageCheck className="w-3.5 h-3.5 text-blue-600" />
            جاهز للتسليم / صادر
          </span>
        );
      case 'delivered':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            تم التسليم للصيدلية
          </span>
        );
      case 'preparing':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            معتمد قيد التجهيز
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className={`w-full max-w-full ${isEmbedded ? '' : 'p-3 sm:p-6 bg-slate-50 min-h-screen'}`}>
      {/* Printable Official Header (visible during print) */}
      <div className="hidden print:block mb-6 p-4 border-b-2 border-slate-900 text-slate-900">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black">{settings.name || 'مذخر سامو للأدوية والمستلزمات الطبية'}</h1>
            <p className="text-sm font-bold mt-1">سجل الطلبيات الموافق عليها والصادرة مع التواريخ</p>
            <p className="text-xs text-slate-600 mt-0.5">
              تاريخ إصدار التقرير: {new Date().toLocaleDateString('ar-IQ')} • {new Date().toLocaleTimeString('ar-IQ')}
            </p>
          </div>
          <div className="text-left text-xs font-mono">
            <p><strong>الهاتف:</strong> {settings.phone || '07700000000'}</p>
            <p><strong>العنوان:</strong> {settings.address || 'العراق'}</p>
            <p><strong>إجمالي القوائم:</strong> {filteredOrders.length} قائمة</p>
          </div>
        </div>
      </div>

      {/* Screen Header & Action Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 mb-5 no-print">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-bold shadow-md shadow-blue-500/20 shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-slate-900">
                  سجل الطلبيات الموافق عليها والصادرة
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-100 text-blue-800 border border-blue-200">
                  {filteredOrders.length} طلبية
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                أرشيف وتوثيق تفصيلي للطلبيات المعتمدة، تاريخ الموافقة والتجهيز، وتاريخ الصرف والتسليم للصيدليات
              </p>
            </div>
          </div>

          {/* Action Buttons: Print & Excel */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <button
              id="btn-export-dispatched-csv"
              type="button"
              onClick={handleExportCSV}
              className="flex-1 sm:flex-none px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              title="تصدير سجل الطلبيات الصادرة كملف Excel / CSV"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
              <span>تصدير Excel / CSV</span>
            </button>

            <button
              id="btn-print-dispatched-registry"
              type="button"
              onClick={handlePrintRegistry}
              className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-900 hover:bg-slate-800 active:bg-black text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              title="طباعة تقرير سجل الطلبيات الصادرة"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة كشف السجل</span>
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs transition cursor-pointer"
                title="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Metric Overview Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-5 pt-4 border-t border-slate-100">
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80">
            <p className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
              <span>إجمالي الصادر المعتمد</span>
              <FileText className="w-3.5 h-3.5 text-blue-600" />
            </p>
            <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
              {metrics.totalOrdersCount}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5 font-semibold">
              {metrics.readyCount} جاهزة • {metrics.deliveredCount} مسلّمة
            </p>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80">
            <p className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
              <span>المبلغ الكلي المصروف</span>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            </p>
            <p className="text-lg sm:text-xl font-black text-emerald-700 mt-1 truncate" title={`${metrics.totalAmountSum.toLocaleString()} ${settings.currency}`}>
              {metrics.totalAmountSum.toLocaleString()}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5 font-bold">
              {settings.currency}
            </p>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80">
            <p className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
              <span>علب الأدوية المجهزة</span>
              <Package className="w-3.5 h-3.5 text-indigo-600" />
            </p>
            <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
              {metrics.totalMedicinesPackages.toLocaleString()}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5 font-medium">
              عبوة دواء أساسية
            </p>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80">
            <p className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
              <span>بونص مجاني ممنوح</span>
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            </p>
            <p className="text-xl sm:text-2xl font-black text-amber-700 mt-1">
              +{metrics.totalBonusPackages.toLocaleString()}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5 font-medium">
              علبة بونص مجانية
            </p>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 col-span-2 sm:col-span-1">
            <p className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
              <span>الصيدليات المستفيدة</span>
              <Store className="w-3.5 h-3.5 text-purple-600" />
            </p>
            <p className="text-xl sm:text-2xl font-black text-purple-800 mt-1">
              {metrics.uniquePharmacies}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5 font-medium">
              صيدلية مختلفة
            </p>
          </div>
        </div>

        {/* SubView Mode Toggle */}
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100 no-print flex-wrap">
          <button
            type="button"
            onClick={() => setSubView('orders')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              subView === 'orders'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <FileText className="w-4 h-4 text-blue-300" />
            <span>عرض حسب قوائم الطلبيات الصادرة ({filteredOrders.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubView('materials')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              subView === 'materials'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            <Pill className="w-4 h-4 text-emerald-300" />
            <span>عرض كافة المواد والعلب المجهزة والمسلّمة بالتفصيل ({metrics.totalMedicinesPackages.toLocaleString()} علبة)</span>
          </button>
        </div>

        {subView === 'orders' && (
          /* Filter Controls: Date Range & Status Tabs */
          <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col gap-3">
          {/* Row 1: Search & Status Selector */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="search-dispatched-orders"
                type="text"
                placeholder="ابحث برقم القائمة، اسم الصيدلية، الصيدلي، الهاتف، أو اسم الدواء..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-4 pr-10 py-2 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-hidden focus:border-blue-500 font-medium transition"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  مسح
                </button>
              )}
            </div>

            {/* Status pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-semibold shrink-0">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-blue-600 text-white font-bold shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                الكل الصادر والمعتمد ({baseApprovedDispatchedOrders.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('ready')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                  statusFilter === 'ready'
                    ? 'bg-blue-600 text-white font-bold shadow-2xs'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
              >
                <PackageCheck className="w-3.5 h-3.5" />
                <span>جاهزة للتسليم ({baseApprovedDispatchedOrders.filter((o) => o.status === 'ready').length})</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('delivered')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                  statusFilter === 'delivered'
                    ? 'bg-emerald-600 text-white font-bold shadow-2xs'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>تم التسليم ({baseApprovedDispatchedOrders.filter((o) => o.status === 'delivered').length})</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('preparing')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                  statusFilter === 'preparing'
                    ? 'bg-amber-600 text-white font-bold shadow-2xs'
                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>قيد التجهيز ({baseApprovedDispatchedOrders.filter((o) => o.status === 'preparing').length})</span>
              </button>
            </div>
          </div>

          {/* Row 2: Date Presets & Custom Range */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
            <div className="flex items-center gap-1.5 text-xs font-semibold overflow-x-auto">
              <span className="text-slate-500 flex items-center gap-1 pl-2 text-[11px] font-bold">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span>تصفية التاريخ:</span>
              </span>
              <button
                type="button"
                onClick={() => setDatePreset('all')}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                  datePreset === 'all'
                    ? 'bg-white text-blue-700 font-bold shadow-2xs border border-blue-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                كافة التواريخ
              </button>
              <button
                type="button"
                onClick={() => setDatePreset('today_yesterday')}
                className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 cursor-pointer ${
                  datePreset === 'today_yesterday'
                    ? 'bg-blue-600 text-white font-bold shadow-2xs'
                    : 'text-blue-700 bg-blue-50/70 hover:bg-blue-100 border border-blue-200'
                }`}
              >
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>اليوم وأمس</span>
              </button>
              <button
                type="button"
                onClick={() => setDatePreset('today')}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                  datePreset === 'today'
                    ? 'bg-white text-blue-700 font-bold shadow-2xs border border-blue-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                اليوم
              </button>
              <button
                type="button"
                onClick={() => setDatePreset('yesterday')}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                  datePreset === 'yesterday'
                    ? 'bg-white text-blue-700 font-bold shadow-2xs border border-blue-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                أمس
              </button>
              <button
                type="button"
                onClick={() => setDatePreset('week')}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                  datePreset === 'week'
                    ? 'bg-white text-blue-700 font-bold shadow-2xs border border-blue-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                آخر 7 أيام
              </button>
              <button
                type="button"
                onClick={() => setDatePreset('month')}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                  datePreset === 'month'
                    ? 'bg-white text-blue-700 font-bold shadow-2xs border border-blue-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                هذا الشهر
              </button>
              <button
                type="button"
                onClick={() => setDatePreset('custom')}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                  datePreset === 'custom'
                    ? 'bg-white text-blue-700 font-bold shadow-2xs border border-blue-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                نطاق مخصص
              </button>
            </div>

            {/* Custom Date Inputs if 'custom' is selected */}
            {datePreset === 'custom' && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">من:</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono font-medium"
                />
                <span className="text-slate-500">إلى:</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono font-medium"
                />
              </div>
            )}
          </div>
        </div>
        )}
      </div>

      {/* View Content: Materials Registry vs Orders List */}
      {subView === 'materials' ? (
        <PreparedDeliveredMaterialsRegistry
          orders={orders}
          settings={settings}
          operations={operations}
          onPrintOrder={onPrintOrder}
        />
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 max-w-lg mx-auto shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 mx-auto mb-4 flex items-center justify-center border border-blue-200">
            <FileText className="w-8 h-8 text-blue-500" />
          </div>
          <h3 className="text-base font-bold text-slate-800">لا توجد طلبيات صادرة أو معتمدة مطابقة</h3>
          <p className="text-xs text-slate-500 mt-2 max-w-sm mx-auto">
            {searchTerm || statusFilter !== 'all' || datePreset !== 'all'
              ? 'جرّب تعديل خيارات الفلترة أو التاريخ لعرض طلبيات أخرى.'
              : 'تظهر هنا الطلبيات التي تم قبولها وتجهيزها وفحص صلاحياتها أو تسليمها للصيدليات مع كامل التواريخ.'}
          </p>
          {(searchTerm || statusFilter !== 'all' || datePreset !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
                setDatePreset('all');
              }}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
            >
              إعادة ضبط الفلاتر
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredOrders.map((order, idx) => {
            const isExpanded = expandedOrderId === order.id;
            const verifiedCount = order.items.filter((i) => i.verified).length;

            return (
              <div
                key={order.id}
                id={`dispatched-order-${order.id}`}
                className="bg-white rounded-2xl border border-slate-200 hover:border-blue-300 transition shadow-xs overflow-hidden"
              >
                {/* Main Row Header */}
                <div className="p-4 sm:p-5">
                  <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                    {/* Pharmacy & Order Meta */}
                    <div className="flex items-start gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex flex-col items-center justify-center shrink-0">
                        <span className="text-[10px] font-bold text-blue-500">#</span>
                        <span className="text-xs font-black leading-none">{idx + 1}</span>
                      </div>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-black text-slate-900">
                            {order.pharmacyName}
                          </h3>
                          <span className="text-xs font-mono font-black text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                            {order.orderNumber}
                          </span>
                          {order.source === 'direct' && (
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              تجهيز مباشر
                            </span>
                          )}
                          {getStatusBadge(order.status)}
                        </div>

                        <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-slate-500">
                          {order.pharmacistName && (
                            <span className="flex items-center gap-1">
                              <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                              <strong className="text-slate-700">{order.pharmacistName}</strong>
                            </span>
                          )}
                          {order.phone && (
                            <span className="flex items-center gap-1 font-mono" dir="ltr">
                              <Phone className="w-3.5 h-3.5 text-slate-400" />
                              <a href={`tel:${order.phone}`} className="text-blue-600 hover:underline">
                                {order.phone}
                              </a>
                            </span>
                          )}
                          {order.address && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-slate-400" />
                              <span>{order.address}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Timeline with Dates (تاريخ ووقت الإنشاء، الاعتماد، والتسليم) */}
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/90 flex flex-wrap sm:flex-nowrap items-center gap-4 text-xs w-full lg:w-auto">
                      {/* 1. Created Date */}
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block mb-0.5">
                          تاريخ الطلب:
                        </span>
                        <div className="font-bold text-slate-800 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          <span>{formatDateTime(order.createdAt)}</span>
                        </div>
                      </div>

                      <div className="hidden sm:block w-px h-8 bg-slate-200"></div>

                      {/* 2. Approved & Prepared Date */}
                      <div>
                        <span className="text-[10px] font-bold text-blue-600 block mb-0.5">
                          تاريخ الاعتماد والتجهيز:
                        </span>
                        <div className="font-bold text-blue-900 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-blue-600" />
                          <span>{formatDateTime(order.preparedAt || order.createdAt)}</span>
                        </div>
                        {order.preparedBy && (
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            بواسطة: {order.preparedBy}
                          </span>
                        )}
                      </div>

                      <div className="hidden sm:block w-px h-8 bg-slate-200"></div>

                      {/* 3. Delivery / Dispatch Date */}
                      <div>
                        <span className="text-[10px] font-bold text-emerald-600 block mb-0.5">
                          تاريخ التسليم والصرف:
                        </span>
                        <div className="font-bold text-emerald-900 flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{order.completedAt ? formatDateTime(order.completedAt) : 'بانتظار التسليم'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Summary Bar & Action Buttons */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mt-4 pt-3.5 border-t border-slate-100">
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                      <div className="bg-slate-100/80 px-2.5 py-1 rounded-lg">
                        <span className="text-slate-400 font-medium">عدد الأصناف:</span>{' '}
                        <strong className="text-slate-800">{order.items.length} صنف</strong>
                      </div>
                      <div className="bg-slate-100/80 px-2.5 py-1 rounded-lg">
                        <span className="text-slate-400 font-medium">إجمالي العلب:</span>{' '}
                        <strong className="text-slate-800">{order.totalQuantity} علبة</strong>
                      </div>
                      {order.totalBonus > 0 && (
                        <div className="bg-amber-50 text-amber-800 px-2.5 py-1 rounded-lg border border-amber-200/60 font-bold">
                          +{order.totalBonus} بونص
                        </div>
                      )}
                      <div>
                        <span className="text-slate-400 font-medium">المبلغ المطلوب:</span>{' '}
                        <strong className="text-sm font-black text-blue-700">
                          {order.totalAmount.toLocaleString()} {settings.currency}
                        </strong>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Print Invoice Button */}
                      <button
                        type="button"
                        id={`btn-print-order-${order.id}`}
                        onClick={() => onPrintOrder(order)}
                        className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        title="طباعة قائمة التجهيز وسند الإخراج المخزني"
                      >
                        <Printer className="w-3.5 h-3.5 text-blue-600" />
                        <span>طباعة القائمة</span>
                      </button>

                      {/* Deliver Toggle Button */}
                      {order.status === 'ready' && (
                        <button
                          type="button"
                          id={`btn-mark-delivered-${order.id}`}
                          onClick={() => onUpdateOrderStatus(order.id, 'delivered')}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                          title="تأكيد خروج وتسليم الطلبية للصيدلية وتوثيق تاريخ التسليم"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>تأكيد التسليم الآن</span>
                        </button>
                      )}

                      {/* Expand / Collapse items table */}
                      <button
                        type="button"
                        onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                          isExpanded
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        <span>{isExpanded ? 'إخفاء المواد' : 'عرض المواد والتفاصيل'}</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Itemized List */}
                {isExpanded && (
                  <div className="bg-slate-50/70 border-t border-slate-200 p-4 sm:p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-blue-600" />
                        <span>قائمة المواد والأدوية المصروفة ({order.items.length} صنف):</span>
                      </h4>
                      <span className="text-[11px] text-slate-500 font-semibold">
                        المفحوص: {verifiedCount} من {order.items.length}
                      </span>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                      <table className="w-full text-right text-xs">
                        <thead>
                          <tr className="bg-slate-100/80 text-slate-600 border-b border-slate-200 font-bold">
                            <th className="p-2.5">ت</th>
                            <th className="p-2.5">اسم المادة الدوائية</th>
                            <th className="p-2.5">الشكل والعيار</th>
                            <th className="p-2.5 text-center">رقم الوجبة (LOT)</th>
                            <th className="p-2.5 text-center">تاريخ الانتهاء</th>
                            <th className="p-2.5 text-center">الكمية</th>
                            <th className="p-2.5 text-center">البونص</th>
                            <th className="p-2.5">سعر المفرد</th>
                            <th className="p-2.5">المجموع</th>
                            <th className="p-2.5 text-center">حالة الصرف</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {order.items.map((item, i) => (
                            <tr key={item.productId || i} className="hover:bg-slate-50/60 transition">
                              <td className="p-2.5 text-slate-400 font-mono font-bold text-[11px]">{i + 1}</td>
                              <td className="p-2.5">
                                <div className="font-bold text-slate-900">{item.tradeNameAr}</div>
                                <div className="text-[10px] text-slate-400 font-mono" dir="ltr">{item.tradeNameEn}</div>
                              </td>
                              <td className="p-2.5 text-slate-600">
                                {item.dosageForm} {item.strength ? `(${item.strength})` : ''}
                              </td>
                              <td className="p-2.5 text-center font-mono font-bold text-slate-700" dir="ltr">
                                {item.confirmedBatch || item.batchNumber || '—'}
                              </td>
                              <td className="p-2.5 text-center font-mono font-bold text-emerald-700" dir="ltr">
                                {item.confirmedExpiry || item.expiryDate || '—'}
                              </td>
                              <td className="p-2.5 text-center font-black text-slate-900">
                                {item.quantity}
                              </td>
                              <td className="p-2.5 text-center">
                                {item.bonusQuantity > 0 ? (
                                  <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold text-[10px]">
                                    +{item.bonusQuantity}
                                  </span>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                              <td className="p-2.5 text-slate-600 font-medium">
                                {item.unitPrice.toLocaleString()} {settings.currency}
                              </td>
                              <td className="p-2.5 font-bold text-blue-700">
                                {item.totalPrice.toLocaleString()} {settings.currency}
                              </td>
                              <td className="p-2.5 text-center">
                                {item.verified ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                    <Check className="w-3 h-3" /> تم الفحص
                                  </span>
                                ) : (
                                  <span className="text-slate-400 text-[11px]">مجهز</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {order.notes && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-900">
                        <strong>ملاحظات مرفقة:</strong> {order.notes}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
