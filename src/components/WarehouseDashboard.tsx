import React, { useState, useMemo } from 'react';
import { 
  CheckCircle, 
  CheckCircle2,
  Clock, 
  PackageCheck, 
  Truck, 
  Printer, 
  Download,
  Copy,
  AlertCircle, 
  FileText, 
  Eye, 
  Search, 
  Phone, 
  MapPin, 
  Calendar, 
  Building, 
  Check, 
  ChevronDown, 
  ShieldCheck,
  UserCheck,
  Sparkles,
  QrCode,
  Layers,
  XCircle,
  X,
  Bell,
  PackageX,
  AlertTriangle,
  AlertOctagon,
  Flame,
  ArrowRight,
  Trash2,
  Store,
  Users,
  PhoneCall,
  Share2,
  Camera
} from 'lucide-react';
import { Order, OrderStatus, WarehouseSettings } from '../types';
import { InventoryAlertSummary } from '../services/alertService';
import { storage } from '../services/storage';
import { CameraBarcodeScannerModal } from './CameraBarcodeScannerModal';

interface WarehouseDashboardProps {
  orders: Order[];
  onUpdateOrderStatus: (orderId: string, status: OrderStatus, reason?: string) => void;
  onUpdateOrderVerification: (
    orderId: string, 
    items: Order['items'], 
    status?: OrderStatus,
    preparedBy?: string
  ) => void;
  onDeleteOrder: (orderId: string) => void;
  onDeletePharmacy: (pharmacyName: string, deleteOrders: boolean) => void;
  onOpenShareModalForPharmacy?: (pharmacyName: string) => void;
  settings: WarehouseSettings;
  newOrderAlert: Order | null;
  onDismissNewOrderAlert: () => void;
  alerts?: InventoryAlertSummary;
  onOpenNotificationCenter?: () => void;
  onNavigateToInventory?: (filterType: 'out_of_stock' | 'low_stock' | 'near_expiry' | 'expired') => void;
  onOpenApprovals?: () => void;
  pendingApprovalsCount?: number;
}

export const WarehouseDashboard: React.FC<WarehouseDashboardProps> = ({
  orders,
  onUpdateOrderStatus,
  onUpdateOrderVerification,
  onDeleteOrder,
  onDeletePharmacy,
  onOpenShareModalForPharmacy,
  settings,
  newOrderAlert,
  onDismissNewOrderAlert,
  alerts,
  onOpenNotificationCenter,
  onNavigateToInventory,
  onOpenApprovals,
  pendingApprovalsCount = 0,
}) => {
  const [activeTab, setActiveTab] = useState<OrderStatus | 'all' | 'pharmacies'>('new');
  const [searchTerm, setSearchTerm] = useState('');
  const [pharmacySearchTerm, setPharmacySearchTerm] = useState('');
  const [selectedOrderForPrep, setSelectedOrderForPrep] = useState<Order | null>(null);
  const [selectedOrderForPrint, setSelectedOrderForPrint] = useState<Order | null>(null);
  const [rejectModalOrder, setRejectModalOrder] = useState<{ order: Order; reason: string } | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [pharmacyToDelete, setPharmacyToDelete] = useState<{
    name: string;
    ordersCount: number;
    deleteOrders: boolean;
  } | null>(null);
  const [copiedText, setCopiedText] = useState(false);

  // Handle confirm delete order
  const handleConfirmDeleteOrder = async () => {
    if (!orderToDelete) return;
    const orderId = orderToDelete.id;
    if (onDeleteOrder) {
      await onDeleteOrder(orderId);
    } else {
      storage.deleteOrder(orderId);
    }
    setOrderToDelete(null);
  };

  // Handle confirm delete pharmacy
  const handleConfirmDeletePharmacy = async () => {
    if (!pharmacyToDelete) return;
    const { name, deleteOrders } = pharmacyToDelete;
    if (onDeletePharmacy) {
      await onDeletePharmacy(name, deleteOrders);
    } else {
      storage.deletePharmacy(name, deleteOrders);
    }
    setPharmacyToDelete(null);
  };

  // Accept Order and immediately Export & Print List
  const handleAcceptAndExportOrder = (order: Order) => {
    if (order.status === 'new') {
      onUpdateOrderStatus(order.id, 'preparing');
    }
    setSelectedOrderForPrint(order);
  };

  // Export Order to CSV file
  const handleExportOrderCSV = (order: Order) => {
    const headers = ['ت', 'اسم المادة الدوائية', 'الاسم العلمي / الإنجليزي', 'رقم الوجبة Batch', 'تاريخ الصلاحية والاكسباير', 'الكمية المطلوبة', 'البونص المجاني', 'سعر المفرد', 'المجموع'];
    const rows = order.items.map((item, idx) => [
      idx + 1,
      `"${item.tradeNameAr.replace(/"/g, '""')}"`,
      `"${(item.tradeNameEn || '').replace(/"/g, '""')}"`,
      `"${item.confirmedBatch || item.batchNumber || ''}"`,
      `"${item.confirmedExpiry || item.expiryDate || ''}"`,
      item.quantity,
      item.bonusQuantity,
      item.unitPrice,
      item.totalPrice
    ]);

    rows.push([]);
    rows.push(['إجمالي العلب المطلوبة', order.totalQuantity, 'إجمالي البونص المجاني', order.totalBonus, '', '', 'المبلغ الصافي المطلوب', order.totalAmount]);

    const csvContent = '\uFEFF' + [
      `مذخر سامو - قائمة تجهيز طلبيات الأدوية وسند الإخراج المخزني`,
      `رقم الطلبية: ${order.orderNumber} - التاريخ: ${new Date(order.createdAt).toLocaleDateString('ar-IQ')}`,
      `اسم الصيدلية: ${order.pharmacyName} - الموظف / المسؤول: ${order.pharmacistName} - الهاتف: ${order.phone} - العنوان: ${order.address}`,
      '',
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `قائمة_تجهيز_طلبية_${order.orderNumber}_${order.pharmacyName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Copy structured order text for WhatsApp or clipboard
  const handleCopyOrderText = (order: Order) => {
    const lines = [
      `*مذخر سامو - قائمة تجهيز طلبية معتمدة*`,
      `رقم الطلب: ${order.orderNumber}`,
      `التاريخ: ${new Date(order.createdAt).toLocaleDateString('ar-IQ')}`,
      `الصيدلية: ${order.pharmacyName}`,
      `الموظف / المسؤول: ${order.pharmacistName}`,
      `الهاتف: ${order.phone}`,
      `العنوان: ${order.address}`,
      `--------------------------`,
      ...order.items.map((i, idx) => `${idx + 1}. ${i.tradeNameAr} (${i.confirmedExpiry || i.expiryDate}) - الكمية: ${i.quantity} علبة ${i.bonusQuantity > 0 ? `(+ ${i.bonusQuantity} مجاناً)` : ''} - السعر: ${i.totalPrice.toLocaleString()} ${settings.currency}`),
      `--------------------------`,
      `إجمالي العلب: ${order.totalQuantity} علبة (+ ${order.totalBonus} بونص)`,
      `المبلغ الصافي المطلوب: ${order.totalAmount.toLocaleString()} ${settings.currency}`,
    ];
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2500);
    });
  };

  // Preparation modal state
  const [prepWorkerName, setPrepWorkerName] = useState('علي التميمي (أمين المخزن)');
  const [itemChecklist, setItemChecklist] = useState<{
    [productId: string]: {
      verified: boolean;
      status: 'available' | 'unavailable';
      confirmedBatch: string;
      confirmedExpiry: string;
      notes?: string;
    };
  }>({});

  // Filtered orders
  const filteredOrders = orders.filter((ord) => {
    const matchTab = activeTab === 'all' || ord.status === activeTab;
    const term = searchTerm.trim().toLowerCase();
    if (!term) return matchTab;
    const matchSearch =
      ord.orderNumber.toLowerCase().includes(term) ||
      ord.pharmacyName.toLowerCase().includes(term) ||
      ord.pharmacistName.toLowerCase().includes(term) ||
      ord.phone.includes(term) ||
      ord.address.toLowerCase().includes(term);
    return matchTab && matchSearch;
  });

  // Pharmacies directory calculation
  const pharmaciesList = useMemo(() => {
    const deleted = storage.getDeletedPharmacies().map(n => n.trim().toLowerCase());
    const map = new Map<string, {
      name: string;
      pharmacistName: string;
      phone: string;
      address: string;
      ordersCount: number;
      totalSpent: number;
      lastOrderDate: string;
    }>();

    orders.forEach((o) => {
      const name = (o.pharmacyName || '').trim();
      if (!name) return;
      if (deleted.includes(name.toLowerCase())) return;

      const key = name.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.ordersCount += 1;
        existing.totalSpent += o.totalAmount;
        if (new Date(o.createdAt) > new Date(existing.lastOrderDate)) {
          existing.lastOrderDate = o.createdAt;
          if (o.pharmacistName) existing.pharmacistName = o.pharmacistName;
          if (o.phone) existing.phone = o.phone;
          if (o.address) existing.address = o.address;
        }
      } else {
        map.set(key, {
          name: name,
          pharmacistName: o.pharmacistName || 'غير محدد',
          phone: o.phone || '',
          address: o.address || '',
          ordersCount: 1,
          totalSpent: o.totalAmount,
          lastOrderDate: o.createdAt,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => 
      new Date(b.lastOrderDate).getTime() - new Date(a.lastOrderDate).getTime()
    );
  }, [orders]);

  const filteredPharmacies = useMemo(() => {
    const term = pharmacySearchTerm.trim().toLowerCase();
    if (!term) return pharmaciesList;
    return pharmaciesList.filter(
      p =>
        p.name.toLowerCase().includes(term) ||
        p.pharmacistName.toLowerCase().includes(term) ||
        p.phone.includes(term) ||
        p.address.toLowerCase().includes(term)
    );
  }, [pharmaciesList, pharmacySearchTerm]);

  // Count orders per status
  const counts = {
    new: orders.filter((o) => o.status === 'new').length,
    preparing: orders.filter((o) => o.status === 'preparing').length,
    ready: orders.filter((o) => o.status === 'ready').length,
    delivered: orders.filter((o) => o.status === 'delivered').length,
    rejected: orders.filter((o) => o.status === 'rejected').length,
  };

  // Open preparation modal
  const handleStartPreparation = (order: Order) => {
    const initialChecklist: typeof itemChecklist = {};
    order.items.forEach((item) => {
      initialChecklist[item.productId] = {
        verified: item.verified ?? false,
        status: item.status === 'unavailable' ? 'unavailable' : 'available',
        confirmedBatch: item.confirmedBatch || item.batchNumber,
        confirmedExpiry: item.confirmedExpiry || item.expiryDate,
        notes: item.notes || '',
      };
    });
    setItemChecklist(initialChecklist);
    setSelectedOrderForPrep(order);
  };

  // Toggle item verification in preparation modal
  const toggleItemVerified = (productId: string) => {
    setItemChecklist((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        verified: !prev[productId]?.verified,
      },
    }));
  };

  // Toggle individual item availability (نفذ من المخزن / متوفر)
  const setItemAvailability = (productId: string, status: 'available' | 'unavailable') => {
    setItemChecklist((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        status,
        notes: status === 'unavailable' ? 'تعذر تجهيز المنتج (نفذ من المخزن)' : '',
      },
    }));
  };

  // Quick toggle item unavailable/available directly on the order card
  const handleToggleItemStatusDirect = (order: Order, productId: string) => {
    const updatedItems = order.items.map((item) => {
      if (item.productId === productId) {
        const isCurrentlyUnavailable = item.status === 'unavailable';
        const newStatus = isCurrentlyUnavailable ? 'available' : 'unavailable';
        return {
          ...item,
          status: newStatus as 'available' | 'unavailable',
          notes: newStatus === 'unavailable' ? 'تعذر تجهيز المنتج (نفذ من المخزن)' : '',
        };
      }
      return item;
    });
    onUpdateOrderVerification(order.id, updatedItems, order.status);
  };

  // Confirm order rejection
  const handleConfirmReject = () => {
    if (!rejectModalOrder) return;
    onUpdateOrderStatus(
      rejectModalOrder.order.id,
      'rejected',
      rejectModalOrder.reason || 'نعتذر، يتعذر تجهيز الطلبية حالياً نظراً لنفاد بعض المواد'
    );
    setRejectModalOrder(null);
  };

  // Update batch or expiry confirmation in preparation modal
  const updateItemDetails = (
    productId: string,
    field: 'confirmedBatch' | 'confirmedExpiry' | 'notes',
    value: string
  ) => {
    setItemChecklist((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value,
      },
    }));
  };

  // Complete preparation
  const handleSavePreparation = (isCompleted = false) => {
    if (!selectedOrderForPrep) return;

    const updatedItems = selectedOrderForPrep.items.map((item) => {
      const check = itemChecklist[item.productId];
      return {
        ...item,
        status: check?.status || item.status || 'available',
        verified: check ? check.verified : item.verified,
        confirmedBatch: check?.confirmedBatch || item.batchNumber,
        confirmedExpiry: check?.confirmedExpiry || item.expiryDate,
        notes: check?.notes,
      };
    });

    const newStatus: OrderStatus = isCompleted ? 'ready' : 'preparing';
    onUpdateOrderVerification(
      selectedOrderForPrep.id,
      updatedItems,
      newStatus,
      prepWorkerName
    );

    setSelectedOrderForPrep(null);
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'new':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            جديد بانتظار التجهيز
          </span>
        );
      case 'preparing':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700 border border-orange-200">
            <Clock className="w-3.5 h-3.5 text-orange-600" />
            قيد التجهيز وفحص الصلاحية
          </span>
        );
      case 'ready':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200">
            <PackageCheck className="w-3.5 h-3.5 text-blue-600" />
            جاهز للتسليم / تم التجهيز
          </span>
        );
      case 'delivered':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200">
            <CheckCircle className="w-3.5 h-3.5 text-green-600" />
            تم التسليم للصيدلية
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            تم رفض الطلب
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
            ملغي
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50 pb-20">
      {/* Alert popup when new order arrives */}
      {newOrderAlert && (
        <div className="bg-rose-600 text-white px-4 py-3 shadow-lg animate-in slide-in-from-top duration-300">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="p-2 bg-white/20 rounded-xl">
                <AlertCircle className="w-5 h-5 text-white" />
              </span>
              <div>
                <p className="text-sm font-black">
                  إشعار فوري: وصلت طلبية جديدة من {newOrderAlert.pharmacyName}!
                </p>
                <p className="text-xs text-rose-100">
                  رقم الطلب: {newOrderAlert.orderNumber} • إجمالي المواد: {newOrderAlert.items.length} صنف ({newOrderAlert.totalAmount.toLocaleString()} {settings.currency})
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  handleStartPreparation(newOrderAlert);
                  onDismissNewOrderAlert();
                }}
                className="px-3.5 py-1.5 bg-white text-rose-700 hover:bg-rose-50 text-xs font-bold rounded-lg shadow-xs transition"
              >
                تجهيز الطلب الآن
              </button>
              <button
                onClick={onDismissNewOrderAlert}
                className="text-white/80 hover:text-white text-xs px-2 py-1"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Warehouse Summary Dashboard Cards - Adaptive Full Width Layout */}
      <div className="w-full max-w-full px-3 sm:px-6 pt-4 sm:pt-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900">
              لوحة تحكم وتجهيز طلبيات الصيدليات
            </h2>
          </div>
          {onOpenApprovals && (
            <button
              id="btn-warehouse-open-approvals"
              onClick={onOpenApprovals}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white rounded-xl text-sm font-bold shadow-sm transition active:scale-95 cursor-pointer"
            >
              <ShieldCheck className="w-5 h-5 text-amber-200" />
              <span>تصاريح وموافقات الدخول</span>
              {pendingApprovalsCount > 0 && (
                <span className="bg-white text-amber-900 font-black text-xs px-2 py-0.5 rounded-full animate-pulse">
                  {pendingApprovalsCount} طلبات معلقة
                </span>
              )}
            </button>
          )}
        </div>

        {/* Pending User Approvals Alert Banner */}
        {pendingApprovalsCount > 0 && onOpenApprovals && (
          <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-400/10 to-amber-500/15 border-2 border-amber-400/60 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs font-bold">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <span>يوجد {pendingApprovalsCount} طلبات تصاريح دخول وصيدليات جديدة بانتظار موافقتك</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-slate-950 animate-pulse">موافقة المشرف</span>
                </h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  لا يمكن للمستخدمين الجدد الوصول إلى الكتالوج أو السلة إلا بعد إصدار تصريح الموافقة من قبلك.
                </p>
              </div>
            </div>
            <button
              onClick={onOpenApprovals}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <span>مراجعة واعتماد التصاريح</span>
              <span className="text-amber-400 font-black">({pendingApprovalsCount})</span>
            </button>
          </div>
        )}

        {/* Inventory Smart Alerts Widgets (Stock-Out & Near-Expiry) */}
        {alerts && alerts.totalAlerts > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Stock Alerts Card */}
            <div className="bg-gradient-to-br from-white to-rose-50/50 p-4 rounded-2xl border border-rose-200 shadow-xs flex flex-col justify-between">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 border border-rose-200">
                    <PackageX className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900">
                        تنبيهات النفاذ ونقص المخزون
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white">
                        {alerts.totalStockAlerts} مادة
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      {alerts.outOfStock.length > 0 ? (
                        <strong className="text-rose-700 font-bold ml-1">
                          {alerts.outOfStock.length} مادة نفدت بالكامل (0 علبة)
                        </strong>
                      ) : (
                        'لا توجد مواد نافذة كلياً'
                      )}
                      {alerts.lowStock.length > 0 && (
                        <span className="text-orange-700 font-semibold">
                          • {alerts.lowStock.length} مادة بمستوى حرج
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-rose-100">
                {onNavigateToInventory && (
                  <button
                    onClick={() => onNavigateToInventory(alerts.outOfStock.length > 0 ? 'out_of_stock' : 'low_stock')}
                    className="w-full py-2 px-3 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <span>عرض النواقص في شاشة المخزون</span>
                    <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                  </button>
                )}
              </div>
            </div>

            {/* Expiry Alerts Card */}
            <div className="bg-gradient-to-br from-white to-amber-50/50 p-4 rounded-2xl border border-amber-200 shadow-xs flex flex-col justify-between">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 border border-amber-200">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900">
                        تنبيهات الصلاحية والاكسباير
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-600 text-white">
                        {alerts.totalExpiryAlerts} مادة
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      {alerts.expired.length > 0 && (
                        <strong className="text-red-700 font-bold ml-1">
                          {alerts.expired.length} مادة منتهية الصلاحية
                        </strong>
                      )}
                      {(alerts.criticalExpiry.length + alerts.nearExpiry.length) > 0 && (
                        <span className="text-amber-800 font-semibold">
                          • {alerts.criticalExpiry.length + alerts.nearExpiry.length} مادة قريبة الانتهاء (≤ 6 أشهر)
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-amber-100">
                {onNavigateToInventory && (
                  <button
                    onClick={() => onNavigateToInventory(alerts.expired.length > 0 ? 'expired' : 'near_expiry')}
                    className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <span>عرض الأدوية في شاشة المخزون</span>
                    <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Status Count Cards (Professional Polish Design) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <button
            onClick={() => setActiveTab('new')}
            className={`p-4.5 rounded-xl border text-right transition cursor-pointer ${
              activeTab === 'new'
                ? 'bg-white border-red-500 ring-2 ring-red-500/20 shadow-xs'
                : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
            }`}
          >
            <p className="text-xs text-slate-500 font-medium flex items-center justify-between">
              <span>الطلبات الجديدة</span>
              <AlertCircle className="w-4 h-4 text-red-500" />
            </p>
            <p className="text-2xl sm:text-3xl font-bold mt-1 text-slate-900">
              {counts.new}
            </p>
            <p className="text-[10px] text-green-600 mt-1 font-semibold flex items-center gap-1">
              <span>+ فوري</span> بانتظار التجهيز والمطابقة
            </p>
          </button>

          <button
            onClick={() => setActiveTab('preparing')}
            className={`p-4.5 rounded-xl border text-right transition cursor-pointer ${
              activeTab === 'preparing'
                ? 'bg-white border-orange-500 ring-2 ring-orange-500/20 shadow-xs'
                : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
            }`}
          >
            <p className="text-xs text-slate-500 font-medium flex items-center justify-between">
              <span>قيد التجهيز</span>
              <Clock className="w-4 h-4 text-orange-500" />
            </p>
            <p className="text-2xl sm:text-3xl font-bold mt-1 text-orange-500">
              {counts.preparing}
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              في مسار التعبئة وفحص الرفوف
            </p>
          </button>

          <button
            onClick={() => setActiveTab('ready')}
            className={`p-4.5 rounded-xl border text-right transition cursor-pointer ${
              activeTab === 'ready'
                ? 'bg-white border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
            }`}
          >
            <p className="text-xs text-slate-500 font-medium flex items-center justify-between">
              <span>جاهزة للتسليم</span>
              <PackageCheck className="w-4 h-4 text-blue-600" />
            </p>
            <p className="text-2xl sm:text-3xl font-bold mt-1 text-blue-600">
              {counts.ready}
            </p>
            <p className="text-[10px] text-blue-600 mt-1 font-semibold">
              مجهزة ومطبوعة الفاتورة
            </p>
          </button>

          <button
            onClick={() => setActiveTab('delivered')}
            className={`p-4.5 rounded-xl border text-right transition cursor-pointer ${
              activeTab === 'delivered'
                ? 'bg-white border-green-500 ring-2 ring-green-500/20 shadow-xs'
                : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
            }`}
          >
            <p className="text-xs text-slate-500 font-medium flex items-center justify-between">
              <span>مكتملة ومسلمة</span>
              <CheckCircle className="w-4 h-4 text-green-600" />
            </p>
            <p className="text-2xl sm:text-3xl font-bold mt-1 text-green-600">
              {counts.delivered}
            </p>
            <p className="text-[10px] text-green-600 mt-1 font-semibold">
              تم الاستلام والتسديد
            </p>
          </button>
        </div>

        {/* Filter and Search Bar */}
        <div className="bg-white p-3 rounded-xl border border-slate-200 mb-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-xs">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="ابحث برقم الطلب، اسم الصيدلية، الصيدلي، أو العنوان..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-4 pr-10 py-2 bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:border-blue-500 transition"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-semibold">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-slate-900 text-white font-bold'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              كافة الطلبات ({orders.length})
            </button>
            <button
              onClick={() => setActiveTab('new')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                activeTab === 'new'
                  ? 'bg-red-600 text-white font-bold'
                  : 'bg-red-50 text-red-700 hover:bg-red-100'
              }`}
            >
              الجديدة ({counts.new})
            </button>
            <button
              onClick={() => setActiveTab('preparing')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                activeTab === 'preparing'
                  ? 'bg-orange-600 text-white font-bold'
                  : 'bg-orange-50 text-orange-700 hover:bg-orange-100'
              }`}
            >
              قيد التجهيز ({counts.preparing})
            </button>
            <button
              onClick={() => setActiveTab('ready')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                activeTab === 'ready'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              الجاهزة ({counts.ready})
            </button>
            <button
              onClick={() => setActiveTab('delivered')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                activeTab === 'delivered'
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              تم التسليم ({counts.delivered})
            </button>
            <button
              onClick={() => setActiveTab('rejected')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                activeTab === 'rejected'
                  ? 'bg-rose-600 text-white font-bold'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
              }`}
            >
              المرفوضة ({counts.rejected})
            </button>
            <button
              id="tab-pharmacies-directory"
              onClick={() => setActiveTab('pharmacies')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'pharmacies'
                  ? 'bg-purple-600 text-white font-bold'
                  : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>دليل الصيدليات ({pharmaciesList.length})</span>
            </button>
          </div>
        </div>

        {/* Content View: Either Pharmacies Directory or Orders List */}
        {activeTab === 'pharmacies' ? (
          <div className="space-y-4">
            {/* Top Sub-Bar for Pharmacies Directory */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold border border-purple-200">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    دليل الصيدليات المسجلة والمتعاملة
                  </h3>
                  <p className="text-xs text-slate-500">
                    إجمالي الصيدليات المسجلة: {pharmaciesList.length} صيدلية • إجمالي الطلبيات: {orders.length} طلبية
                  </p>
                </div>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="بحث باسم الصيدلية، الصيدلي، أو الهاتف..."
                  value={pharmacySearchTerm}
                  onChange={(e) => setPharmacySearchTerm(e.target.value)}
                  className="w-full pl-3 pr-9 py-2 bg-slate-50 focus:bg-white text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:border-purple-500 font-medium"
                />
              </div>
            </div>

            {filteredPharmacies.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 max-w-md mx-auto">
                <Store className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-800">لا توجد صيدليات مطابقة</h3>
                <p className="text-xs text-slate-500 mt-1">
                  {pharmacySearchTerm
                    ? 'جرب البحث بكلمة أو رقم هاتف مختلف.'
                    : 'ستظهر الصيدليات هنا تلقائياً بمجرد إرسال أول طلبية أو مشاركة الرابط معها.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredPharmacies.map((pharmacy) => (
                  <div
                    key={pharmacy.name}
                    className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-purple-300 transition flex flex-col justify-between space-y-4"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 flex items-center justify-center font-bold">
                            <Store className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-slate-900">{pharmacy.name}</h4>
                            <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                              <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                              <span>{pharmacy.pharmacistName}</span>
                            </p>
                          </div>
                        </div>

                        <button
                          id={`btn-delete-pharmacy-${encodeURIComponent(pharmacy.name)}`}
                          onClick={() => setPharmacyToDelete({
                            name: pharmacy.name,
                            ordersCount: pharmacy.ordersCount,
                            deleteOrders: true
                          })}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition cursor-pointer"
                          title="حذف الصيدلية من النظام"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-2 pt-3 text-xs">
                        {pharmacy.phone && (
                          <div className="flex items-center justify-between text-slate-600">
                            <span className="text-slate-400 flex items-center gap-1">
                              <Phone className="w-3.5 h-3.5" /> الهاتف:
                            </span>
                            <a
                              href={`tel:${pharmacy.phone}`}
                              className="font-mono font-bold text-blue-600 hover:underline"
                              dir="ltr"
                            >
                              {pharmacy.phone}
                            </a>
                          </div>
                        )}

                        {pharmacy.address && (
                          <div className="flex items-center justify-between text-slate-600">
                            <span className="text-slate-400 flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5" /> العنوان:
                            </span>
                            <span className="font-semibold text-slate-800 text-left truncate max-w-[180px]">
                              {pharmacy.address}
                            </span>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-slate-600 pt-1">
                          <span className="text-slate-400">إجمالي الطلبات:</span>
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 font-bold">
                            {pharmacy.ordersCount} طلبية
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-slate-600">
                          <span className="text-slate-400">إجمالي المسحوبات:</span>
                          <span className="font-bold text-emerald-700">
                            {pharmacy.totalSpent.toLocaleString()} {settings.currency}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-slate-400 text-[11px] pt-1">
                          <span>آخر طلبية:</span>
                          <span>{new Date(pharmacy.lastOrderDate).toLocaleDateString('ar-IQ')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          setSearchTerm(pharmacy.name);
                          setActiveTab('all');
                        }}
                        className="flex-1 py-2 px-2.5 bg-slate-50 hover:bg-purple-50 text-slate-700 hover:text-purple-700 border border-slate-200 hover:border-purple-300 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>عرض الطلبات</span>
                      </button>

                      {onOpenShareModalForPharmacy && (
                        <button
                          type="button"
                          onClick={() => onOpenShareModalForPharmacy(pharmacy.name)}
                          className="py-2 px-2.5 bg-white hover:bg-slate-50 text-blue-600 border border-slate-200 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                          title="مشاركة رابط طلب مخصص لهذه الصيدلية"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">رابط مخصص</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setPharmacyToDelete({
                          name: pharmacy.name,
                          ordersCount: pharmacy.ordersCount,
                          deleteOrders: true
                        })}
                        className="py-2 px-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                        title="حذف الصيدلية"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Orders Table / Cards List */
          filteredOrders.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 max-w-md mx-auto">
              <PackageCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-800">لا توجد طلبات في هذا القسم</h3>
              <p className="text-xs text-slate-500 mt-1">
                عند قيام أي صيدلية باختيار مواد وإرسال السلة، ستظهر الطلبية هنا مع تنبيه صوتي فوري.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredOrders.map((order) => {
                const verifiedItemsCount = order.items.filter((i) => i.verified).length;
                const allVerified = verifiedItemsCount === order.items.length;

                return (
                  <div
                    key={order.id}
                    id={`order-row-${order.id}`}
                    className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-blue-300 transition space-y-4"
                  >
                    {/* Order Top Meta */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center font-bold text-blue-700 text-sm">
                          #
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold text-slate-900">
                              {order.pharmacyName}
                            </h3>
                            <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                              {order.orderNumber}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                            <span>الصيدلي: {order.pharmacistName}</span>
                            <span>•</span>
                            <span dir="ltr">{order.phone}</span>
                            <span>•</span>
                            <span>{new Date(order.createdAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {getStatusBadge(order.status)}
                      </div>
                    </div>

                    {/* Order Items Preview Table - Smooth horizontal scroll */}
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full text-xs text-right min-w-[650px]">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
                            <th className="p-2.5">المادة الدوائية والشكل</th>
                            <th className="p-2.5">رقم الوجبة (Batch)</th>
                            <th className="p-2.5">تاريخ الصلاحية</th>
                            <th className="p-2.5 text-center">الكمية المطلوبة</th>
                            <th className="p-2.5 text-center">البونص المجاني</th>
                            <th className="p-2.5">سعر المفرد</th>
                            <th className="p-2.5">الإجمالي</th>
                            <th className="p-2.5 text-center">حالة المطابقة</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {order.items.map((item) => (
                            <tr key={item.productId} className="hover:bg-slate-50/70">
                              <td className="p-2.5">
                                <span className="font-bold text-slate-900 block">{item.tradeNameAr}</span>
                                <span className="text-[11px] text-slate-400 font-medium" dir="ltr">{item.tradeNameEn}</span>
                              </td>
                              <td className="p-2.5 font-mono text-[11px] font-semibold text-slate-700">
                                {item.confirmedBatch || item.batchNumber}
                              </td>
                              <td className="p-2.5 font-bold text-emerald-700">
                                {item.confirmedExpiry || item.expiryDate}
                              </td>
                              <td className="p-2.5 text-center font-bold text-slate-800">
                                {item.quantity}
                              </td>
                              <td className="p-2.5 text-center">
                                {item.bonusQuantity > 0 ? (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">
                                    + {item.bonusQuantity}
                                  </span>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                              <td className="p-2.5 font-semibold text-slate-600">
                                {item.unitPrice.toLocaleString()} {settings.currency}
                              </td>
                              <td className="p-2.5 font-bold text-blue-700">
                                {item.totalPrice.toLocaleString()} {settings.currency}
                              </td>
                              <td className="p-2.5 text-center">
                                {item.status === 'unavailable' ? (
                                  <div className="flex flex-col items-center gap-1">
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
                                      <XCircle className="w-3 h-3 text-rose-600" /> تعذر التجهيز (نفذ)
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleToggleItemStatusDirect(order, item.productId)}
                                      className="text-[10px] text-blue-600 hover:underline cursor-pointer"
                                    >
                                      إعادة للتجهيز
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center gap-1">
                                    {item.verified ? (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                        <Check className="w-3 h-3" /> تم الفحص
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                                        بانتظار السحب
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleToggleItemStatusDirect(order, item.productId)}
                                      className="text-[10px] text-rose-600 hover:text-rose-800 hover:underline cursor-pointer"
                                      title="تحديد هذا المنتج كغير متوفر لإشعار الصيدلية فوراً"
                                    >
                                      تحديد كـ "نفذ"
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Notes & Rejection Banner */}
                    {order.notes && (
                      <div className="bg-amber-50/80 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-900 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">ملاحظات الصيدلية:</span> {order.notes}
                        </div>
                      </div>
                    )}

                    {order.status === 'rejected' && (
                      <div className="bg-rose-50 border border-rose-200 rounded-lg p-2.5 text-xs text-rose-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                          <span><strong>حالة الطلب:</strong> تم رفض الطلب ({order.rejectionReason || 'تعذر التجهيز من قبل إدارة المذخر'}).</span>
                        </div>
                        <button
                          onClick={() => onUpdateOrderStatus(order.id, 'preparing')}
                          className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-rose-300 text-rose-700 rounded text-xs font-bold transition cursor-pointer self-start sm:self-auto"
                        >
                          إلغاء الرفض وقبول الطلب
                        </button>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-4 text-xs text-slate-600">
                        <div>
                          <span className="text-slate-400 block text-[11px]">العنوان:</span>
                          <span className="font-semibold text-slate-800">{order.address}</span>
                        </div>
                        <div className="h-6 w-px bg-slate-200"></div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">المبلغ الإجمالي المطلوب:</span>
                          <span className="text-base font-bold text-blue-700">
                            {order.totalAmount.toLocaleString()} {settings.currency}
                          </span>
                        </div>
                        <div className="h-6 w-px bg-slate-200"></div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">مطابقة المواد:</span>
                          <span className="font-bold text-slate-700">
                            {verifiedItemsCount} من {order.items.length} مفحوص
                          </span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Direct Accept & Export List Button */}
                        {order.status !== 'rejected' && (
                          <button
                            id={`btn-accept-export-${order.id}`}
                            onClick={() => handleAcceptAndExportOrder(order)}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                            title="قبول طلب الصيدلية وتصدير القائمة المنظمة للطباعة"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>قبول وتصدير القائمة</span>
                          </button>
                        )}

                        {/* Preparation button */}
                        {order.status !== 'rejected' && (
                          <button
                            id={`btn-prep-${order.id}`}
                            onClick={() => handleStartPreparation(order)}
                            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                          >
                            <PackageCheck className="w-4 h-4" />
                            <span>فحص الصلاحيات</span>
                          </button>
                        )}

                        {/* Invoice Print Button */}
                        <button
                          id={`btn-print-${order.id}`}
                          onClick={() => setSelectedOrderForPrint(order)}
                          className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                          title="معاينة وطباعة قائمة التجهيز"
                        >
                          <Printer className="w-4 h-4 text-slate-500" />
                          <span>معاينة القائمة</span>
                        </button>

                        {/* Status quick toggle */}
                        {order.status === 'ready' && (
                          <button
                            onClick={() => onUpdateOrderStatus(order.id, 'delivered')}
                            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                          >
                            <CheckCircle className="w-4 h-4" />
                            <span>تأكيد التسليم</span>
                          </button>
                        )}

                        {/* Reject Order Button */}
                        {order.status !== 'rejected' && order.status !== 'delivered' && (
                          <button
                            id={`btn-reject-${order.id}`}
                            onClick={() => setRejectModalOrder({
                              order,
                              reason: 'نعتذر، يتعذر تجهيز الطلبية حالياً نظراً لنفاد بعض المواد المطلوبة من المخزن'
                            })}
                            className="px-3 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                            title="رفض الطلب مع تحديد السبب وإشعار الصيدلية"
                          >
                            <XCircle className="w-4 h-4" />
                            <span>رفض الطلب</span>
                          </button>
                        )}

                        {/* Delete Order Button */}
                        <button
                          id={`btn-delete-${order.id}`}
                          onClick={() => setOrderToDelete(order)}
                          className="px-3 py-2 bg-slate-100 hover:bg-rose-50 border border-slate-200 hover:border-rose-300 text-slate-600 hover:text-rose-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                          title="حذف هذا الطلب نهائياً"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف الطلب</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* Interactive Preparation & Expiry Verification Modal */}
      {selectedOrderForPrep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-3xl bg-white rounded-2xl p-6 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-200">
                  نموذج تجهيز الطلبية وفحص تواريخ الصلاحية
                </span>
                <h3 className="text-xl font-bold text-slate-900 mt-2">
                  تجهيز مواد: {selectedOrderForPrep.pharmacyName}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  رقم الطلب: {selectedOrderForPrep.orderNumber} • يرجى مطابقة العبوات المسحوبة من الرف والتأكد من رقم التشغيلة وتاريخ الانتهاء.
                </p>
              </div>
              <button
                onClick={() => setSelectedOrderForPrep(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Worker Name */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-blue-600" />
                <span className="font-bold text-slate-700">المسؤول عن التجهيز بالمخزن:</span>
              </div>
              <input
                type="text"
                value={prepWorkerName}
                onChange={(e) => setPrepWorkerName(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold focus:outline-hidden focus:border-blue-500"
              />
            </div>

            {/* Items Checklist for Warehouse Worker */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-700">
                قائمة المواد المطلوب سحبها وتأكيد صلاحياتها ({selectedOrderForPrep.items.length} أصناف):
              </h4>

              {selectedOrderForPrep.items.map((item, idx) => {
                const check = itemChecklist[item.productId] || {
                  verified: false,
                  confirmedBatch: item.batchNumber,
                  confirmedExpiry: item.expiryDate,
                  notes: '',
                };

                return (
                  <div
                    key={item.productId}
                    className={`p-4 rounded-xl border transition ${
                      check.verified
                        ? 'bg-emerald-50/40 border-emerald-300 ring-1 ring-emerald-400/20'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Checkbox */}
                      <label className="flex items-start gap-3 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={check.verified}
                          onChange={() => toggleItemVerified(item.productId)}
                          className="mt-1 w-4.5 h-4.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900">
                              {idx + 1}. {item.tradeNameAr}
                            </span>
                            <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                              الكمية: {item.quantity} علبة
                            </span>
                            {item.bonusQuantity > 0 && (
                              <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                                + {item.bonusQuantity} بونص مجاني
                              </span>
                            )}
                            {check.status === 'unavailable' ? (
                              <button
                                type="button"
                                onClick={() => setItemAvailability(item.productId, 'available')}
                                className="text-xs font-bold text-rose-700 bg-rose-100 hover:bg-rose-200 border border-rose-300 px-2.5 py-0.5 rounded-md transition cursor-pointer"
                              >
                                ✕ تعذر تجهيز المنتج (نفذ) - اضغط لإعادته
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setItemAvailability(item.productId, 'unavailable')}
                                className="text-xs font-semibold text-slate-500 hover:text-rose-700 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-300 px-2.5 py-0.5 rounded-md transition cursor-pointer"
                              >
                                تحديد كـ "نفذ من المخزن"
                              </button>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5" dir="ltr">
                            {item.tradeNameEn} • {item.dosageForm} {item.strength}
                          </p>
                        </div>
                      </label>

                      <div className="text-left text-xs">
                        <span className="font-bold text-slate-700 block">
                          الإجمالي: {item.totalPrice.toLocaleString()} {settings.currency}
                        </span>
                      </div>
                    </div>

                    {/* Batch & Expiry Verification Fields */}
                    <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-lg">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          رقم الوجبة الفعلي على العلبة (Batch / LOT):
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={check.confirmedBatch}
                          onChange={(e) => updateItemDetails(item.productId, 'confirmedBatch', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-mono font-bold text-xs focus:border-blue-500 focus:outline-hidden text-left"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          تاريخ انتهاء الصلاحية المؤكد (Expiry Date):
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          placeholder="YYYY-MM"
                          value={check.confirmedExpiry}
                          onChange={(e) => updateItemDetails(item.productId, 'confirmedExpiry', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-mono font-bold text-xs text-emerald-700 focus:border-blue-500 focus:outline-hidden text-left"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-200">
              <button
                onClick={() => handleSavePreparation(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                حفظ كمسودة (قيد التجهيز)
              </button>

              <button
                onClick={() => handleSavePreparation(true)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-2 cursor-pointer"
              >
                <PackageCheck className="w-4 h-4" />
                <span>إتمام التجهيز والمطابقة وتحويل إلى (جاهز للتسليم)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Printable Invoice / Delivery Slip Modal */}
      {selectedOrderForPrint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl p-6 sm:p-8 my-8 text-slate-900 max-h-[95vh] overflow-y-auto">
            {/* Top Toolbar (not visible in print) */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-6 border-b border-slate-200 no-print">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    قائمة تجهيز الطلبية المنظمة وسند الإخراج المخزني
                  </h3>
                  <span className="text-xs text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 inline-block mt-0.5">
                    تم قبول الطلب • معتمد للتجهيز والطباعة
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleExportOrderCSV(selectedOrderForPrint)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  title="تحميل كملف إكسل (CSV)"
                >
                  <Download className="w-4 h-4 text-slate-600" />
                  <span>تصدير إكسل (CSV)</span>
                </button>

                <button
                  onClick={() => handleCopyOrderText(selectedOrderForPrint)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  title="نسخ ملخص القائمة لرسائل الواتساب"
                >
                  <Copy className="w-4 h-4 text-slate-600" />
                  <span>{copiedText ? 'تم النسخ!' : 'نسخ نص القائمة'}</span>
                </button>

                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة القائمة الآن (Print / PDF)</span>
                </button>

                <button
                  onClick={() => setSelectedOrderForPrint(null)}
                  className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>

            {/* PRINTABLE INVOICE CONTENT */}
            <div id="printable-invoice" className="bg-white p-2 sm:p-6 text-slate-900 font-sans">
              {/* Header */}
              <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4 mb-4">
                <div>
                  <h1 className="text-2xl font-black text-slate-950">
                    {settings.name || 'مذخر سامو'}
                  </h1>
                  <p className="text-xs text-slate-700 font-bold mt-0.5">
                    قائمة تجهيز طلبيات الأدوية وسند الإخراج المخزني المعتمد
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    ترخيص نقابة الصيادلة: {settings.licenseNumber} • الإدارة: {settings.pharmacistInCharge}
                  </p>
                  <p className="text-xs text-slate-600">
                    العنوان: {settings.address} • هاتف: <span dir="ltr">{settings.phone}</span>
                  </p>
                </div>

                <div className="text-left border-2 border-slate-900 rounded-xl p-3 bg-slate-50 min-w-[210px]">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">سند إخراج وتجهيز</span>
                  <span className="text-base font-black text-slate-900 font-mono block">
                    {selectedOrderForPrint.orderNumber}
                  </span>
                  <span className="text-xs text-slate-600 block mt-1 font-semibold">
                    التاريخ: {new Date(selectedOrderForPrint.createdAt).toLocaleDateString('ar-IQ')}
                  </span>
                  <span className="text-xs text-slate-600 block">
                    الوقت: {new Date(selectedOrderForPrint.createdAt).toLocaleTimeString('ar-IQ')}
                  </span>
                  <span className="inline-block mt-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded">
                    تم قبول الطلب وجاري التجهيز
                  </span>
                </div>
              </div>

              {/* Customer Pharmacy Information */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 mb-5 text-xs">
                <div>
                  <span className="text-slate-500 block text-[11px]">اسم الصيدلية المستلمة:</span>
                  <span className="font-bold text-base text-slate-900">{selectedOrderForPrint.pharmacyName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">اسم الموظف / الصيدلي المسؤول:</span>
                  <span className="font-bold text-sm text-slate-800">{selectedOrderForPrint.pharmacistName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">رقم الهاتف للتواصل:</span>
                  <span className="font-bold text-slate-800" dir="ltr">{selectedOrderForPrint.phone}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">عنوان الصيدلية والمدينة:</span>
                  <span className="font-semibold text-slate-800">{selectedOrderForPrint.address}</span>
                </div>
              </div>

              {/* Items Table */}
              <table className="w-full text-xs text-right border-collapse mb-5">
                <thead>
                  <tr className="bg-slate-800 text-white font-bold">
                    <th className="p-2 border border-slate-800 text-center w-10">ت</th>
                    <th className="p-2 border border-slate-800">اسم المادة والشكل الصيدلاني</th>
                    <th className="p-2 border border-slate-800 text-center">رقم التشغيلة (Batch)</th>
                    <th className="p-2 border border-slate-800 text-center">تاريخ الصلاحية</th>
                    <th className="p-2 border border-slate-800 text-center">الكمية</th>
                    <th className="p-2 border border-slate-800 text-center">البونص</th>
                    <th className="p-2 border border-slate-800 text-center">سعر المفرد</th>
                    <th className="p-2 border border-slate-800 text-left">المجموع</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrderForPrint.items.map((item, i) => (
                    <tr key={item.productId} className="border-b border-slate-300">
                      <td className="p-2 border border-slate-300 text-center font-bold">{i + 1}</td>
                      <td className="p-2 border border-slate-300">
                        <span className="font-bold text-slate-900 block">{item.tradeNameAr}</span>
                        <span className="text-[10px] text-slate-500" dir="ltr">{item.tradeNameEn}</span>
                      </td>
                      <td className="p-2 border border-slate-300 text-center font-mono text-[11px] font-bold" dir="ltr">
                        {item.confirmedBatch || item.batchNumber}
                      </td>
                      <td className="p-2 border border-slate-300 text-center font-bold text-slate-900" dir="ltr">
                        {item.confirmedExpiry || item.expiryDate}
                      </td>
                      <td className="p-2 border border-slate-300 text-center font-bold text-slate-900" dir="ltr">
                        {item.quantity}
                      </td>
                      <td className="p-2 border border-slate-300 text-center font-semibold">
                        {item.bonusQuantity > 0 ? `+ ${item.bonusQuantity}` : '0'}
                      </td>
                      <td className="p-2 border border-slate-300 text-center">
                        {item.isBonusMelted && item.meltedUnitPrice ? (
                          <div>
                            <span className="font-bold text-emerald-800">{item.meltedUnitPrice.toLocaleString()}</span>
                            <span className="block text-[9px] text-emerald-600 font-bold">تذويب {item.bonusPercentage}%</span>
                          </div>
                        ) : (
                          item.unitPrice.toLocaleString()
                        )}
                      </td>
                      <td className="p-2 border border-slate-300 text-left font-black">
                        {item.totalPrice.toLocaleString()} {settings.currency}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals Summary */}
              <div className="flex justify-end mb-8">
                <div className="w-72 bg-slate-100 p-4 rounded-xl border border-slate-300 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-600">إجمالي عدد العلب:</span>
                    <span className="font-bold">{selectedOrderForPrint.totalQuantity} علبة</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">إجمالي البونص المجاني:</span>
                    <span className="font-bold">{selectedOrderForPrint.totalBonus} علبة مجانية</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-300 pt-2 text-sm">
                    <span className="font-black text-slate-900">المبلغ الصافي المطلوب:</span>
                    <span className="font-black text-slate-900">
                      {selectedOrderForPrint.totalAmount.toLocaleString()} {settings.currency}
                    </span>
                  </div>
                </div>
              </div>

              {/* Signatures & Warehouse Seal */}
              <div className="grid grid-cols-3 gap-6 pt-6 border-t border-slate-400 text-center text-xs">
                <div>
                  <span className="font-bold block mb-8 text-slate-800">مسؤول التجهيز والمطابقة:</span>
                  <div className="border-b border-dashed border-slate-400 w-32 mx-auto"></div>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    {selectedOrderForPrint.preparedBy || 'أمين المستودع'}
                  </span>
                </div>

                <div>
                  <span className="font-bold block mb-8 text-slate-800">ختم المذخر الرسمي:</span>
                  <div className="w-20 h-20 rounded-full border-2 border-slate-400 border-dashed mx-auto flex items-center justify-center text-[10px] text-slate-400 font-bold">
                    ختم المذخر
                  </div>
                </div>

                <div>
                  <span className="font-bold block mb-8 text-slate-800">استلام الصيدلية:</span>
                  <div className="border-b border-dashed border-slate-400 w-32 mx-auto"></div>
                  <span className="text-[11px] text-slate-500 mt-1 block">توقيع واستلام الصيدلي</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal with predefined and custom reasons */}
      {rejectModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200">
                  <XCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    رفض طلب الصيدلية (#{rejectModalOrder.order.orderNumber})
                  </h3>
                  <p className="text-xs text-slate-500">{rejectModalOrder.order.pharmacyName}</p>
                </div>
              </div>
              <button
                onClick={() => setRejectModalOrder(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-600 font-medium">
                يرجى تحديد سبب الرفض ليتم إرساله كإشعار رسمي فوري للصيدلية:
              </p>

              {/* Quick Preset Reasons */}
              <div className="space-y-1.5">
                {[
                  'نعتذر، نفدت بعض المواد المطلوبة من المخزن حالياً',
                  'نعتذر، الطلبية خارج التغطية الجغرافية لخط التوزيع اليوم',
                  'نعتذر، يرجى مطابقة وتسوية الحساب المالي السابق مع الحسابات أولاً',
                  'نعتذر، الأسعار أو العبوات المطلوبة قيد التحديث في المستودع',
                ].map((reasonText) => (
                  <button
                    key={reasonText}
                    type="button"
                    onClick={() =>
                      setRejectModalOrder((prev) =>
                        prev ? { ...prev, reason: reasonText } : null
                      )
                    }
                    className={`w-full text-right p-2.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                      rejectModalOrder.reason === reasonText
                        ? 'bg-rose-50 border-rose-300 text-rose-800'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    • {reasonText}
                  </button>
                ))}
              </div>

              {/* Custom reason input */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  نص سبب الرفض المرسل للصيدلية:
                </label>
                <textarea
                  rows={3}
                  value={rejectModalOrder.reason}
                  onChange={(e) =>
                    setRejectModalOrder((prev) =>
                      prev ? { ...prev, reason: e.target.value } : null
                    )
                  }
                  placeholder="اكتب سبب الرفض هنا..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:outline-hidden focus:border-rose-500 font-medium text-slate-800"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRejectModalOrder(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <XCircle className="w-4 h-4" />
                <span>تأكيد الرفض وإشعار الصيدلية</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Order Confirmation Modal */}
      {orderToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    تأكيد حذف الطلب (#{orderToDelete.orderNumber})
                  </h3>
                  <p className="text-xs text-slate-500">{orderToDelete.pharmacyName}</p>
                </div>
              </div>
              <button
                onClick={() => setOrderToDelete(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-rose-50/70 border border-rose-100 rounded-xl p-3.5 text-xs text-rose-950 space-y-2">
              <p className="font-bold flex items-center gap-1 text-rose-700">
                <AlertCircle className="w-4 h-4 shrink-0" /> تحذير: هذا الإجراء نهائي ولا يمكن التراجع عنه
              </p>
              <p className="text-rose-800">
                سيتم حذف طلبية <strong>{orderToDelete.pharmacyName}</strong> ذات القيمة الإجمالية{' '}
                <strong>{orderToDelete.totalAmount.toLocaleString()} {settings.currency}</strong> ومجموع{' '}
                <strong>{orderToDelete.items.length}</strong> أصناف دوائية من قاعدة البيانات.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setOrderToDelete(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                id="btn-confirm-delete-order"
                onClick={handleConfirmDeleteOrder}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>نعم، احذف الطلب نهائياً</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Pharmacy Confirmation Modal */}
      {pharmacyToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    حذف الصيدلية من النظام
                  </h3>
                  <p className="text-xs text-rose-600 font-bold">{pharmacyToDelete.name}</p>
                </div>
              </div>
              <button
                onClick={() => setPharmacyToDelete(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-900 space-y-1.5">
                <p className="font-bold flex items-center gap-1">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                  تنبيه بخصوص حذف حساب الصيدلية:
                </p>
                <p className="text-slate-700">
                  سيتم شطب الصيدلية من سجلات المذخر ودليل الصيدليات المسجلة وتفريغ بيانات الجلسة الخاصة بها.
                </p>
              </div>

              {pharmacyToDelete.ordersCount > 0 && (
                <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100/70 transition">
                  <input
                    type="checkbox"
                    checked={pharmacyToDelete.deleteOrders}
                    onChange={(e) =>
                      setPharmacyToDelete((prev) =>
                        prev ? { ...prev, deleteOrders: e.target.checked } : null
                      )
                    }
                    className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4"
                  />
                  <div>
                    <span className="font-bold text-slate-900 block">
                      حذف كافة طلبات هذه الصيدلية ({pharmacyToDelete.ordersCount} طلب)
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      إذا لم تقم بتحديد هذا الخيار، سيتم الاحتفاظ بالطلبات السابقة في الأرشيف المالي للمذخر.
                    </span>
                  </div>
                </label>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPharmacyToDelete(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                id="btn-confirm-delete-pharmacy"
                onClick={handleConfirmDeletePharmacy}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>تأكيد حذف الصيدلية</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
