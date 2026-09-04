import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  ShoppingCart, 
  Plus, 
  Minus, 
  CheckCircle2, 
  CheckCircle,
  Building, 
  AlertCircle, 
  MessageSquare, 
  Send, 
  Gift, 
  Info, 
  ChevronRight, 
  Phone, 
  User, 
  ShieldCheck, 
  Calendar, 
  Printer, 
  Download, 
  Table as TableIcon, 
  LayoutGrid, 
  Check, 
  Edit3,
  Package,
  XCircle,
  X,
  ExternalLink,
  RefreshCw,
  Copy,
  ArrowRight,
  Share2,
  Pill,
  ClipboardList,
  Clock,
  Layers,
  LayoutDashboard
} from 'lucide-react';
import { Product, CartItem, Order, WarehouseSettings, calculateMeltedPrice, AppUser } from '../types';
import { storage } from '../services/storage';
import { EditContactModal } from './EditContactModal';

interface PharmacyPortalProps {
  products: Product[];
  cart: CartItem[];
  orders?: Order[];
  onAddToCart: (product: Product, quantity?: number) => void;
  onUpdateCartQuantity: (productId: string, quantity: number) => void;
  onRemoveFromCart: (productId: string) => void;
  onClearCart: () => void;
  onSubmitOrder: (pharmacyData: {
    pharmacyName: string;
    pharmacistName: string;
    phone: string;
    address: string;
    notes: string;
  }) => Promise<Order>;
  settings: WarehouseSettings;
  prefilledPharmacyName?: string;
  onSwitchToWarehouse?: () => void;
  onUpdateSettings?: (newSettings: WarehouseSettings) => void;
  currentUser?: AppUser | null;
  onLogout?: () => void;
}

export const PharmacyPortal: React.FC<PharmacyPortalProps> = ({
  products,
  cart,
  orders = [],
  onAddToCart,
  onUpdateCartQuantity,
  onRemoveFromCart,
  onClearCart,
  onSubmitOrder,
  settings,
  prefilledPharmacyName = '',
  onSwitchToWarehouse,
  onUpdateSettings,
  currentUser,
  onLogout,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedProductDetails, setSelectedProductDetails] = useState<Product | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);
  const [selectedOrderForPrint, setSelectedOrderForPrint] = useState<Order | null>(null);
  const [copiedInvoiceText, setCopiedInvoiceText] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isEditContactOpen, setIsEditContactOpen] = useState(false);
  const [activePortalTab, setActivePortalTab] = useState<'catalog' | 'order_history'>('catalog');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | 'pending' | 'ready' | 'completed'>('all');

  // Permission check for warehouse management vs guest access
  const isWarehouseStaffOrOwner = Boolean(
    currentUser &&
    (currentUser.role === 'owner' ||
     currentUser.role === 'super_admin' ||
     currentUser.role === 'warehouse_manager' ||
     currentUser.role === 'pharmacist_staff' ||
     currentUser.founder)
  );

  // Pharmacy Profile Fields (Saved locally for pharmacy convenience)
  const savedProfile = useMemo(() => storage.getSavedPharmacyProfile(), []);
  const [pharmacyName, setPharmacyName] = useState(prefilledPharmacyName || savedProfile.name || '');
  const [pharmacistName, setPharmacistName] = useState(savedProfile.pharmacist || '');
  const [phone, setPhone] = useState(savedProfile.phone || '');
  const [address, setAddress] = useState(savedProfile.address || '');
  const [notes, setNotes] = useState('');
  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
  const [hasProfileSaved, setHasProfileSaved] = useState(() => Boolean((prefilledPharmacyName || savedProfile.name) && savedProfile.pharmacist));

  // Stored list of order IDs submitted from this pharmacy browser session
  const [myOrderIds, setMyOrderIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('samo_pharmacy_my_orders_v3');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Track all orders corresponding to this pharmacy
  const myOrders = useMemo(() => {
    if (!orders || orders.length === 0) return [];
    return orders.filter((o) => {
      const matchId = myOrderIds.includes(o.id);
      const matchName = Boolean(
        pharmacyName.trim() &&
        o.pharmacyName.trim().toLowerCase() === pharmacyName.trim().toLowerCase()
      );
      return matchId || matchName;
    });
  }, [orders, myOrderIds, pharmacyName]);

  // Specific item unavailability alerts ("تعذر تجهيز المنتج الفلاني")
  const unavailableAlerts = useMemo(() => {
    const alerts: { order: Order; item: any }[] = [];
    myOrders.forEach((o) => {
      o.items.forEach((item) => {
        if (item.status === 'unavailable') {
          alerts.push({ order: o, item });
        }
      });
    });
    return alerts;
  }, [myOrders]);

  // Filtered orders history for the Dedicated Tab
  const filteredOrdersHistory = useMemo(() => {
    if (orderStatusFilter === 'all') return myOrders;
    if (orderStatusFilter === 'pending') {
      return myOrders.filter((o) => o.status === 'new' || o.status === 'pending');
    }
    if (orderStatusFilter === 'ready') {
      return myOrders.filter((o) => o.status === 'ready' || o.status === 'preparing');
    }
    if (orderStatusFilter === 'completed') {
      return myOrders.filter((o) => o.status === 'completed');
    }
    return myOrders;
  }, [myOrders, orderStatusFilter]);

  // Check if there is an unconfirmed pending/new order for this pharmacy (for automatic order merging)
  const pendingOrderForPharmacy = useMemo(() => {
    const currentPharm = (pharmacyName || currentUser?.pharmacyName || '').trim().toLowerCase();
    if (!currentPharm) return null;
    return orders.find(
      (o) =>
        o.pharmacyName.trim().toLowerCase() === currentPharm &&
        (o.status === 'new' || o.status === 'pending')
    );
  }, [orders, pharmacyName, currentUser?.pharmacyName]);

  // Sync shared cart with other colleagues of the same pharmacy
  useEffect(() => {
    const currentPharm = (pharmacyName || currentUser?.pharmacyName || '').trim();
    if (!currentPharm) return;

    // Load shared cart from server on initialization
    storage.syncSharedCartFromServer(currentPharm).then((serverItems) => {
      if (serverItems && serverItems.length > 0 && cart.length === 0) {
        serverItems.forEach((it) => {
          const prod = products.find((p) => p.id === it.productId);
          if (prod) {
            onAddToCart(prod, it.quantity);
          }
        });
      }
    });

    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/events');
      es.addEventListener('cart_cleared', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          if (data.pharmacyName && data.pharmacyName.toLowerCase() === currentPharm.toLowerCase()) {
            onClearCart();
          }
        } catch {}
      });
    } catch {}

    return () => {
      es?.close();
    };
  }, [pharmacyName, currentUser?.pharmacyName, products]);

  // Save/broadcast shared cart updates
  useEffect(() => {
    const currentPharm = (pharmacyName || currentUser?.pharmacyName || '').trim();
    if (!currentPharm || cart.length === 0) return;
    storage.saveSharedCart(currentPharm, cart, pharmacistName || currentUser?.name);
  }, [cart, pharmacyName, pharmacistName, currentUser]);

  useEffect(() => {
    if (prefilledPharmacyName && !pharmacyName) {
      setPharmacyName(prefilledPharmacyName);
    }
  }, [prefilledPharmacyName]);

  // Security barrier: Check if explicitly deleted from database by warehouse owner
  const isBlocked = useMemo(() => {
    if (currentUser && storage.isUserDeleted(currentUser.id, currentUser.identifier, currentUser.pharmacyName)) return true;
    if (currentUser?.pharmacyName && storage.isPharmacyDeleted(currentUser.pharmacyName)) return true;
    if (pharmacyName && (storage.isPharmacyDeleted(pharmacyName) || storage.isUserDeleted(undefined, undefined, pharmacyName))) return true;
    return false;
  }, [currentUser, pharmacyName]);

  useEffect(() => {
    if (isBlocked) {
      storage.setCurrentUser(null);
      storage.clearPharmacyProfile();
      onClearCart();
      onLogout?.();
    }
  }, [isBlocked, onLogout, onClearCart]);

  const handleOpenCart = () => {
    if (isBlocked) {
      storage.setCurrentUser(null);
      storage.clearPharmacyProfile();
      onClearCart();
      onLogout?.();
      return;
    }
    setIsCartOpen(true);
  };

  const handleAddToCartSecure = (product: Product, quantity = 1) => {
    if (isBlocked) {
      storage.setCurrentUser(null);
      storage.clearPharmacyProfile();
      onClearCart();
      onLogout?.();
      return;
    }
    onAddToCart(product, quantity);
  };

  const handleSaveProfile = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const errors: { [key: string]: string } = {};
    if (!pharmacyName.trim()) errors.pharmacyName = 'يرجى كتابة اسم الصيدلية';
    if (!pharmacistName.trim()) errors.pharmacistName = 'يرجى كتابة اسم الموظف / المسؤول';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    storage.savePharmacyProfile({
      name: pharmacyName.trim(),
      pharmacist: pharmacistName.trim(),
      phone: phone.trim(),
      address: address.trim(),
    });
    setHasProfileSaved(true);
    setIsEditingProfile(false);
  };

  // Extract unique categories
  const categories = useMemo(() => {
    const cats = Array.from(new Set(products.map(p => p.category).filter(Boolean)));
    return ['all', ...cats];
  }, [products]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchCat = selectedCategory === 'all' || p.category === selectedCategory;
      const term = searchTerm.trim().toLowerCase();
      if (!term) return matchCat;
      const matchSearch = 
        p.tradeNameAr.toLowerCase().includes(term) ||
        p.tradeNameEn.toLowerCase().includes(term) ||
        p.scientificName.toLowerCase().includes(term) ||
        p.manufacturer.toLowerCase().includes(term) ||
        (p.barcode && p.barcode.includes(term)) ||
        (p.batchNumber && p.batchNumber.toLowerCase().includes(term));
      return matchCat && matchSearch;
    });
  }, [products, selectedCategory, searchTerm]);

  // Calculations
  const cartTotalAmount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.subtotal, 0);
  }, [cart]);

  const cartTotalQuantity = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  const cartTotalBonus = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.bonusQuantity, 0);
  }, [cart]);

  const [copiedCartLink, setCopiedCartLink] = useState(false);

  const getCartShareUrl = () => {
    const baseUrl = window.location.origin + window.location.pathname;
    const cartData = cart.map((c) => ({ id: c.productId, q: c.quantity }));
    const pName = pharmacyName.trim() || currentUser?.pharmacyName || '';
    return `${baseUrl}?view=pharmacy${pName ? `&pharmacy=${encodeURIComponent(pName)}` : ''}&cart=${encodeURIComponent(JSON.stringify(cartData))}`;
  };

  const handleCopyCartLink = () => {
    if (cart.length === 0) return;
    const url = getCartShareUrl();
    navigator.clipboard.writeText(url);
    setCopiedCartLink(true);
    setTimeout(() => setCopiedCartLink(false), 2500);
  };

  const handleShareCartWhatsApp = () => {
    if (cart.length === 0) return;
    const url = getCartShareUrl();
    const message = `سلة طلبيات الأدوية من *${settings.name}*:\n` +
      `الأصناف المطلوبة: ${cart.length} أصناف (${cartTotalQuantity} علبة).\n` +
      `المبلغ الإجمالي: ${cartTotalAmount.toLocaleString()} ${settings.currency}.\n` +
      `رابط السلة المباشر:\n${url}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, '_blank');
  };

  // Check Expiry Urgency
  const getExpiryBadge = (expiryDate: string) => {
    if (!expiryDate) return { label: 'غير محدد', color: 'bg-slate-100 text-slate-700 border-slate-200' };
    const parts = expiryDate.split('-');
    const yearStr = parts[0];
    const monthStr = parts[1] || '1';
    const expDate = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1);
    const now = new Date();
    const diffMonths = (expDate.getFullYear() - now.getFullYear()) * 12 + (expDate.getMonth() - now.getMonth());

    if (diffMonths < 0) {
      return { label: 'منتهي الصلاحية', color: 'bg-rose-100 text-rose-800 border-rose-300' };
    } else if (diffMonths <= 6) {
      return { label: `صلاحية قريبة (${expiryDate})`, color: 'bg-amber-100 text-amber-800 border-amber-300' };
    } else {
      return { label: `صالح (${expiryDate})`, color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
    }
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { [key: string]: string } = {};
    if (!pharmacyName.trim()) errors.pharmacyName = 'اسم الصيدلية مطلوب';
    if (!pharmacistName.trim()) errors.pharmacistName = 'اسم الموظف / الصيدلي مطلوب';
    if (!phone.trim()) errors.phone = 'رقم الهاتف مطلوب للتنسيق والتسليم';
    if (!address.trim()) errors.address = 'العنوان / المنطقة مطلوب للشحن';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    setIsSubmitting(true);
    try {
      storage.savePharmacyProfile({
        name: pharmacyName.trim(),
        pharmacist: pharmacistName.trim(),
        phone: phone.trim(),
        address: address.trim(),
      });
      const order = await onSubmitOrder({
        pharmacyName,
        pharmacistName,
        phone,
        address,
        notes,
      });
      setCompletedOrder(order);
      setMyOrderIds((prev) => {
        const next = [order.id, ...prev.filter((id) => id !== order.id)];
        try {
          localStorage.setItem('samo_pharmacy_my_orders_v3', JSON.stringify(next));
        } catch (e) {
          console.error(e);
        }
        return next;
      });
      setIsCartOpen(false);
    } catch (err) {
      console.error('Order submission error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleShareWhatsApp = (order: Order) => {
    const text = `*طلب دواء من ${order.pharmacyName}*\n` +
      `المسؤول / الموظف: ${order.pharmacistName}\n` +
      `رقم الطلب: ${order.orderNumber}\n` +
      `الهاتف: ${order.phone}\n` +
      `العنوان: ${order.address}\n` +
      `عدد المواد: ${order.items.length}\n` +
      `إجمالي الكمية: ${order.totalQuantity} علبة (+ ${order.totalBonus} بونص مجاني)\n` +
      `المجموع: ${order.totalAmount.toLocaleString()} ${settings.currency}\n` +
      `يرجى التجهيز ومطابقة تواريخ الصلاحية وشكراً!`;
    const targetWa = (settings.whatsappPhone || settings.phone || '').replace(/[^0-9]/g, '');
    const url = `https://api.whatsapp.com/send?phone=${targetWa}&text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Export medicines list as CSV
  const handleExportMedicinesCSV = () => {
    if (filteredProducts.length === 0) return;
    const headers = ['ت', 'اسم الدواء التجاري', 'الاسم العلمي', 'الشكل الصيدلاني', 'الاكسباير', 'الكمية الكلية المتاحة', 'سعر الجملة', 'الشركة المصنعة', 'رقم الوجبة'];
    const rows = filteredProducts.map((p, idx) => [
      idx + 1,
      `"${p.tradeNameAr.replace(/"/g, '""')}"`,
      `"${(p.scientificName || '').replace(/"/g, '""')}"`,
      `"${(p.dosageForm || '').replace(/"/g, '""')}"`,
      `"${p.expiryDate}"`,
      p.stockQuantity,
      p.wholesalePrice,
      `"${(p.manufacturer || '').replace(/"/g, '""')}"`,
      `"${p.batchNumber}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `قائمة_أدوية_${settings.name || 'مذخر_سامو'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50 pb-24 text-slate-800">
      {/* Top Banner - Clean, Direct & Elegant */}
      <section className="bg-slate-900 text-white py-3.5 px-4 sm:px-6 border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
              <ShieldCheck className="w-5 h-5 shrink-0" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black tracking-tight text-white">
                  {settings.name || 'مذخر سامو'}
                </h2>
                <span className="text-[11px] font-bold text-blue-400 bg-blue-950/80 px-2 py-0.5 rounded-full border border-blue-800/60">
                  قائمة الأدوية والطلبيات
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-xs self-stretch sm:self-auto justify-between sm:justify-end">
            {currentUser && (
              <div className="flex items-center gap-2 bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-700/60 shrink-0">
                <User className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="font-bold text-slate-200">{currentUser.pharmacyName || currentUser.name}</span>
                {onLogout && (
                  <button
                    type="button"
                    onClick={onLogout}
                    className="mr-1 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                    title="تسجيل الخروج"
                  >
                    خروج
                  </button>
                )}
              </div>
            )}

            {/* Switch to warehouse / admin login button */}
            {onSwitchToWarehouse && (
              <button
                type="button"
                id="btn-portal-back-warehouse"
                onClick={onSwitchToWarehouse}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition cursor-pointer shrink-0 text-xs shadow-xs active:scale-95 ${
                  isWarehouseStaffOrOwner
                    ? 'bg-blue-600 hover:bg-blue-500 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40'
                }`}
                title="لوحة تحكم المذخر وإدارة المخزون"
              >
                {isWarehouseStaffOrOwner ? (
                  <>
                    <LayoutDashboard className="w-3.5 h-3.5 shrink-0 text-white" />
                    <span>لوحة تحكم المذخر 🏢</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                    <span>دخول إدارة المذخر 🔐</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Pharmacy Profile Bar - Compact & Elegant */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-3">
        {(!hasProfileSaved || isEditingProfile) ? (
          <div className="bg-white rounded-xl border border-blue-200 p-4 shadow-xs space-y-3 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold text-slate-900">
                  بيانات الصيدلية للطلب
                </h3>
              </div>
              {hasProfileSaved && (
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 font-medium cursor-pointer"
                >
                  إلغاء
                </button>
              )}
            </div>

            <form onSubmit={handleSaveProfile} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div>
                <input
                  type="text"
                  placeholder="اسم الصيدلية *"
                  value={pharmacyName}
                  onChange={(e) => setPharmacyName(e.target.value)}
                  className={`w-full px-3 py-2 bg-slate-50 focus:bg-white text-xs rounded-lg border ${
                    formErrors.pharmacyName ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                  } focus:outline-hidden focus:border-blue-600`}
                />
              </div>

              <div>
                <input
                  type="text"
                  placeholder="اسم المستلم / الصيدلي *"
                  value={pharmacistName}
                  onChange={(e) => setPharmacistName(e.target.value)}
                  className={`w-full px-3 py-2 bg-slate-50 focus:bg-white text-xs rounded-lg border ${
                    formErrors.pharmacistName ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                  } focus:outline-hidden focus:border-blue-600`}
                />
              </div>

              <div>
                <input
                  type="tel"
                  placeholder="رقم الهاتف للتواصل"
                  dir="ltr"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 focus:bg-white text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:border-blue-600 text-right"
                />
              </div>

              <div>
                <button
                  type="submit"
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>حفظ البيانات</span>
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-2.5 shadow-xs flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 text-xs">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center font-bold shrink-0">
                <Building className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-center flex-wrap gap-2">
                <span className="font-bold text-slate-900">{pharmacyName}</span>
                <span className="text-slate-300">•</span>
                <span className="text-slate-600">{pharmacistName}</span>
                {phone && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span dir="ltr" className="text-slate-500 font-mono">{phone}</span>
                  </>
                )}
              </div>
            </div>

            <button
              onClick={() => setIsEditingProfile(true)}
              className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-blue-600 transition cursor-pointer"
            >
              <Edit3 className="w-3 h-3" />
              <span>تعديل</span>
            </button>
          </div>
        )}
      </div>

      {/* Live Order Notifications & Status from Warehouse - Minimal & Clean */}
      {(unavailableAlerts.length > 0 || myOrders.some(o => o.status === 'preparing' || o.status === 'ready' || o.status === 'rejected')) && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-3 space-y-2">
          {/* Unavailable Item Alerts */}
          {unavailableAlerts.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-900 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-rose-800">
                <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>تعذر تجهيز بعض المواد لنفادها من المخزن:</span>
              </div>
              <div className="space-y-1 mr-5">
                {unavailableAlerts.map(({ order, item }) => (
                  <div
                    key={`${order.id}-${item.productId}`}
                    className="flex items-center justify-between text-[11px] bg-white px-2.5 py-1 rounded-md border border-rose-100"
                  >
                    <span className="font-bold text-rose-700">{item.tradeNameAr} (طلب #{order.orderNumber})</span>
                    <span className="text-rose-600 font-semibold bg-rose-50 px-1.5 py-0.5 rounded">نفذ من المخزن</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Accepted or In-Preparation Orders */}
          {myOrders
            .filter((o) => o.status === 'preparing' || o.status === 'ready')
            .map((order) => (
              <div
                key={`accepted-${order.id}`}
                className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2 text-emerald-950">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-bold">
                    {order.status === 'ready' ? 'اكتمل تجهيز الطلب' : 'جاري تجهيز الطلب بالمستودع'}
                  </span>
                  <span className="font-mono bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">
                    #{order.orderNumber}
                  </span>
                </div>

                <button
                  id={`btn-pharmacy-print-${order.id}`}
                  onClick={() => setSelectedOrderForPrint(order)}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة القائمة</span>
                </button>
              </div>
            ))}

          {/* Rejected Orders */}
          {myOrders
            .filter((o) => o.status === 'rejected')
            .map((order) => (
              <div
                key={`rejected-${order.id}`}
                className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2 text-rose-950">
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span className="font-bold">تعذر قبول الطلب #{order.orderNumber}</span>
                  {order.rejectionReason && (
                    <span className="text-rose-700 font-medium">({order.rejectionReason})</span>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Primary Navigation Tabs for Pharmacy: Catalog vs Order History */}
      <div className="w-full max-w-full px-3 sm:px-6 mt-3">
        <div className="flex items-center gap-2 p-1.5 bg-white rounded-2xl border border-slate-200 shadow-2xs w-fit">
          <button
            type="button"
            id="tab-pharmacy-catalog"
            onClick={() => setActivePortalTab('catalog')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer ${
              activePortalTab === 'catalog'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Pill className="w-4 h-4" />
            <span>تصفح الأدوية والكتالوج</span>
          </button>

          <button
            type="button"
            id="tab-pharmacy-orders"
            onClick={() => setActivePortalTab('order_history')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer ${
              activePortalTab === 'order_history'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            <span>طلبياتي / سجل الطلبيات</span>
            {myOrders.length > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                activePortalTab === 'order_history' ? 'bg-blue-800 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {myOrders.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* VIEW 1: CATALOG TAB */}
      {activePortalTab === 'catalog' && (
        <>
          {/* Filter, Search Bar and Actions */}
          <div className="w-full max-w-full px-3 sm:px-6 mt-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="input-search-pharmacy"
                type="text"
                placeholder="بحث باسم الدواء، المادة الفعالة، أو الباركود..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-4 pr-10 py-2 bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-500 rounded-lg text-xs sm:text-sm focus:outline-hidden transition"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 hover:text-slate-600 bg-slate-200 px-1.5 py-0.5 rounded cursor-pointer"
                >
                  مسح
                </button>
              )}
            </div>

            {/* Quick Actions & View Mode Toggle */}
            <div className="flex flex-wrap items-center gap-2 justify-between md:justify-end">
              {/* View Switcher */}
              <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                    viewMode === 'table' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                  }`}
                  title="عرض جدول"
                >
                  <TableIcon className="w-3.5 h-3.5" />
                  <span>جدول</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                    viewMode === 'cards' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                  }`}
                  title="عرض بطاقات"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>بطاقات</span>
                </button>
              </div>

              {/* Export CSV / Print buttons */}
              <button
                onClick={handleExportMedicinesCSV}
                disabled={filteredProducts.length === 0}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
                title="تصدير إكسل"
              >
                <Download className="w-3.5 h-3.5 text-slate-600" />
                <span className="hidden sm:inline">إكسل</span>
              </button>

              <button
                onClick={() => window.print()}
                disabled={filteredProducts.length === 0}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
                title="طباعة"
              >
                <Printer className="w-3.5 h-3.5 text-slate-600" />
                <span className="hidden sm:inline">طباعة</span>
              </button>

              {/* Cart button */}
              <button
                id="btn-open-cart-top"
                onClick={handleOpenCart}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>السلة ({cartTotalQuantity})</span>
                {cartTotalAmount > 0 && (
                  <span className="bg-blue-800/80 px-1.5 py-0.5 rounded text-[11px] font-bold">
                    {cartTotalAmount.toLocaleString()} {settings.currency}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Categories Horizontal Scroll */}
          {categories.length > 2 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-xs no-scrollbar border-t border-slate-100 pt-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat === 'all' ? 'الكل' : cat}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Medicines Presentation Area */}
      <div className="w-full max-w-full px-3 sm:px-6 mt-3">
        {products.length === 0 ? (
          /* Empty Database Notification */
          <div className="bg-white rounded-xl p-10 text-center border border-slate-200 max-w-md mx-auto my-6">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2.5">
              <Package className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">المذخر جاهز لإضافة المواد</h3>
            <p className="text-xs text-slate-500 mt-1">
              لا توجد أدوية مضافة حالياً.
            </p>
          </div>
        ) : filteredProducts.length === 0 ? (
          /* Search No Match */
          <div className="bg-white rounded-xl p-10 text-center border border-slate-200 max-w-md mx-auto my-6">
            <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-800">لا توجد نتائج مطابقة</h3>
            <button
              onClick={() => { setSearchTerm(''); setSelectedCategory('all'); }}
              className="mt-3 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold cursor-pointer"
            >
              عرض كافة الأدوية
            </button>
          </div>
        ) : viewMode === 'table' ? (
          /* RESPONSIVE FULL-WIDTH LIST VIEW - ZERO HORIZONTAL SCROLL */
          <div className="space-y-3 w-full max-w-full">
            {filteredProducts.map((product, idx) => {
              const inCart = cart.find((c) => c.productId === product.id);
              const expiryInfo = getExpiryBadge(product.expiryDate);

              return (
                <div
                  key={product.id}
                  id={`product-row-${product.id}`}
                  className="bg-white rounded-xl border border-slate-200/90 hover:border-blue-500 hover:shadow-xs transition-all duration-200 p-3.5 sm:p-4 w-full flex flex-col gap-3"
                >
                  {/* 1. اسم المادة */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <h3
                          onClick={() => setSelectedProductDetails(product)}
                          className="text-base sm:text-lg font-black text-slate-900 hover:text-blue-600 transition cursor-pointer leading-tight truncate"
                          title={product.tradeNameAr}
                        >
                          {product.tradeNameAr}
                        </h3>
                      </div>
                      <p className="text-xs text-slate-500 font-medium" dir="ltr">
                        {product.tradeNameEn} {product.strength && `• ${product.strength}`} {product.dosageForm && `• ${product.dosageForm}`}
                      </p>
                    </div>

                    <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10px] font-bold shrink-0">
                      {product.category || 'عام'}
                    </span>
                  </div>

                  {/* 2. وتحتها تاريخ الصلاحية مباشرة */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200/70">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                      <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
                      <span className="text-slate-500">تاريخ الصلاحية:</span>
                      <span className="font-mono font-black text-slate-950 text-sm tracking-wider" dir="ltr">
                        {product.expiryDate}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-md border text-[10px] font-extrabold ${expiryInfo.color}`}>
                      {expiryInfo.label}
                    </span>
                  </div>

                  {/* 3. السعر والكمية المتوفرة بالمذخر */}
                  <div className="flex items-center justify-between gap-2 text-xs pt-1 border-t border-slate-100">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">السعر للصيدلية:</span>
                      {product.bonusPercentage && product.bonusPercentage > 0 ? (
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-base font-black text-emerald-700">
                            {calculateMeltedPrice(product.wholesalePrice, product.bonusPercentage).toLocaleString()}
                          </span>
                          <span className="text-[10px] text-emerald-600 font-bold">{settings.currency}</span>
                          <span className="text-slate-400 line-through text-[11px] mr-1">
                            {product.wholesalePrice.toLocaleString()}
                          </span>
                          <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-1 rounded">
                            تذويب {product.bonusPercentage}%
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-baseline gap-1">
                          <span className="text-base font-black text-slate-900">
                            {product.wholesalePrice.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-blue-600 font-bold">{settings.currency}</span>
                        </div>
                      )}
                    </div>

                    <div className="text-left">
                      <span className="text-[10px] text-slate-400 font-bold block">المتوفر بالمذخر:</span>
                      <span className={`text-sm font-black ${product.stockQuantity <= 10 ? 'text-rose-600' : 'text-slate-800'}`}>
                        {product.stockQuantity.toLocaleString()} علبة
                      </span>
                    </div>
                  </div>

                  {/* 4. وبالاسفل السلة واختيار الكميات */}
                  <div className="pt-2 border-t border-slate-100">
                    {inCart ? (
                      <div className="flex items-center justify-between bg-blue-50/80 border-2 border-blue-600 rounded-xl p-1.5 shadow-xs w-full">
                        <button
                          type="button"
                          onClick={() => onUpdateCartQuantity(product.id, inCart.quantity - 1)}
                          className="w-9 h-9 rounded-lg bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center font-bold transition cursor-pointer shadow-xs"
                          title="تقليل الكمية"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <div className="text-center px-3">
                          <span className="text-xs sm:text-sm font-black text-blue-800 block">
                            {inCart.quantity} علبة في السلة
                          </span>
                          <span className="text-[11px] text-slate-600 font-bold block">
                            الإجمالي: {(inCart.unitPrice * inCart.quantity).toLocaleString()} {settings.currency}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onUpdateCartQuantity(product.id, inCart.quantity + 1)}
                          className="w-9 h-9 rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center font-bold transition cursor-pointer shadow-xs"
                          title="زيادة الكمية"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAddToCartSecure(product, 1)}
                        disabled={product.stockQuantity <= 0}
                        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition shadow-xs cursor-pointer"
                      >
                        <ShoppingCart className="w-4 h-4" />
                        <span>{product.stockQuantity <= 0 ? 'نفدت الكمية من المذخر' : 'إضافة إلى السلة'}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* CARDS VIEW - NO HORIZONTAL SCROLL: NAME -> EXPIRY -> PRICE -> CART & QUANTITY */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 w-full max-w-full">
            {filteredProducts.map((product) => {
              const inCart = cart.find((c) => c.productId === product.id);
              const expiryInfo = getExpiryBadge(product.expiryDate);

              return (
                <div
                  key={product.id}
                  id={`product-card-${product.id}`}
                  className="bg-white rounded-2xl border border-slate-200/90 hover:border-blue-500 hover:shadow-md transition-all duration-200 flex flex-col justify-between overflow-hidden group w-full"
                >
                  <div className="p-4 space-y-3">
                    {/* 1. اسم المادة */}
                    <div>
                      <div className="flex items-center justify-between gap-1.5 mb-1.5">
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10px] font-bold">
                          {product.category || 'عام'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">{product.dosageForm}</span>
                      </div>
                      <h3
                        onClick={() => setSelectedProductDetails(product)}
                        className="text-base font-black text-slate-900 group-hover:text-blue-600 transition cursor-pointer leading-snug"
                        title={product.tradeNameAr}
                      >
                        {product.tradeNameAr}
                      </h3>
                      <p className="text-xs text-slate-500 font-medium mt-0.5" dir="ltr">
                        {product.tradeNameEn} {product.strength && `• ${product.strength}`}
                      </p>
                    </div>

                    {/* 2. وتحتها تاريخ الصلاحية مباشرة */}
                    <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>تاريخ الصلاحية:</span>
                        </span>
                        <span className={`px-2 py-0.5 rounded-md border text-[10px] font-extrabold ${expiryInfo.color}`}>
                          {expiryInfo.label}
                        </span>
                      </div>
                      <div className="text-sm font-mono font-black text-slate-900 tracking-wider" dir="ltr">
                        {product.expiryDate}
                      </div>
                    </div>

                    {/* 3. التفاصيل المالية والمخزون */}
                    <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block">السعر للصيدلية:</span>
                        {product.bonusPercentage && product.bonusPercentage > 0 ? (
                          <div>
                            <div className="flex items-baseline gap-1">
                              <span className="text-base font-black text-emerald-700">
                                {calculateMeltedPrice(product.wholesalePrice, product.bonusPercentage).toLocaleString()}
                              </span>
                              <span className="text-[10px] text-emerald-600 font-bold">{settings.currency}</span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px]">
                              <span className="text-slate-400 line-through">
                                {product.wholesalePrice.toLocaleString()}
                              </span>
                              <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-1 rounded">
                                تذويب {product.bonusPercentage}%
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-baseline gap-1">
                            <span className="text-base font-black text-slate-900">
                              {product.wholesalePrice.toLocaleString()}
                            </span>
                            <span className="text-[10px] text-blue-600 font-bold">{settings.currency}</span>
                          </div>
                        )}
                      </div>

                      <div className="text-left">
                        <span className="text-[10px] text-slate-400 font-bold block">المتوفر بالمذخر:</span>
                        <span className={`text-sm font-black ${product.stockQuantity <= 10 ? 'text-rose-600' : 'text-slate-800'}`}>
                          {product.stockQuantity.toLocaleString()} علبة
                        </span>
                      </div>
                    </div>

                    {/* Bonus if exists */}
                    {product.bonusDescription && (
                      <div className="flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-[11px] font-bold">
                        <Gift className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>عرض: {product.bonusDescription}</span>
                      </div>
                    )}
                  </div>

                  {/* 4. وبالاسفل السلة واختيار الكميات */}
                  <div className="p-3 bg-slate-50/70 border-t border-slate-100">
                    {inCart ? (
                      <div className="flex items-center justify-between bg-white border-2 border-blue-600 rounded-xl p-1 shadow-xs w-full">
                        <button
                          type="button"
                          onClick={() => onUpdateCartQuantity(product.id, inCart.quantity - 1)}
                          className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition cursor-pointer"
                          title="تقليل الكمية"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <div className="text-center px-2">
                          <span className="text-xs font-black text-blue-700 block">
                            {inCart.quantity} علبة في السلة
                          </span>
                          <span className="text-[10px] text-slate-500 font-bold block">
                            الإجمالي: {(inCart.unitPrice * inCart.quantity).toLocaleString()} {settings.currency}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onUpdateCartQuantity(product.id, inCart.quantity + 1)}
                          className="w-8 h-8 rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition cursor-pointer"
                          title="زيادة الكمية"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAddToCartSecure(product, 1)}
                        disabled={product.stockQuantity <= 0}
                        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition shadow-xs cursor-pointer"
                      >
                        <ShoppingCart className="w-4 h-4" />
                        <span>{product.stockQuantity <= 0 ? 'نفدت الكمية من المذخر' : 'إضافة إلى السلة'}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
        </>
      )}

      {/* VIEW 2: ORDER HISTORY ARCHIVE TAB */}
      {activePortalTab === 'order_history' && (
        <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 mt-4 space-y-4">
          {/* Header & Filter */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center font-bold shrink-0">
                <ClipboardList className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-black text-slate-900">
                  سجل طلبيات صيدلية {pharmacyName || currentUser?.pharmacyName || ''}
                </h3>
                <p className="text-xs text-slate-500">
                  أرشيف تفصيلي بالطلبيات السابقة والحالية وحالة كل طلب
                </p>
              </div>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold border border-slate-200">
              <button
                type="button"
                onClick={() => setOrderStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  orderStatusFilter === 'all'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                الكل ({myOrders.length})
              </button>
              <button
                type="button"
                onClick={() => setOrderStatusFilter('pending')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  orderStatusFilter === 'pending'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                قيد المراجعة ({myOrders.filter((o) => o.status === 'new' || o.status === 'pending').length})
              </button>
              <button
                type="button"
                onClick={() => setOrderStatusFilter('ready')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  orderStatusFilter === 'ready'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                تم التجهيز ({myOrders.filter((o) => o.status === 'ready' || o.status === 'preparing').length})
              </button>
              <button
                type="button"
                onClick={() => setOrderStatusFilter('completed')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  orderStatusFilter === 'completed'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                مكتمل ({myOrders.filter((o) => o.status === 'completed').length})
              </button>
            </div>
          </div>

          {/* Orders Cards List */}
          {myOrders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-md mx-auto my-8 space-y-3 shadow-xs">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                <ClipboardList className="w-7 h-7" />
              </div>
              <h4 className="text-base font-black text-slate-800">لا توجد طلبيات مسجلة بعد</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                لم تقم الصيدلية بطلب أي طلبيات أدوية حتى الآن. تصفح الكتالوج وقم بإضافة المواد للسلة لإنشاء طلب جديد.
              </p>
              <button
                type="button"
                onClick={() => setActivePortalTab('catalog')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition cursor-pointer shadow-xs"
              >
                الذهاب لكتالوج الأدوية
              </button>
            </div>
          ) : filteredOrdersHistory.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-md mx-auto my-6 space-y-2">
              <AlertCircle className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-xs font-bold text-slate-700">لا توجد طلبيات تطابق هذا التصنيف</p>
              <button
                type="button"
                onClick={() => setOrderStatusFilter('all')}
                className="text-xs text-blue-600 font-bold hover:underline"
              >
                عرض كافة الطلبيات
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredOrdersHistory.map((order) => {
                const isPending = order.status === 'new' || order.status === 'pending';
                const isPreparing = order.status === 'preparing';
                const isReady = order.status === 'ready';
                const isCompleted = order.status === 'completed';
                const isRejected = order.status === 'rejected';

                return (
                  <div
                    key={order.id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden transition hover:border-blue-300"
                  >
                    {/* Header */}
                    <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-mono font-black text-sm shadow-xs">
                          #{order.orderNumber.replace(/[^0-9]/g, '') || order.orderNumber.slice(-4)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-black text-slate-900 text-sm">{order.orderNumber}</span>
                            {isPending && (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                                <Clock className="w-3 h-3 text-amber-600" />
                                <span>قيد المراجعة والتدقيق</span>
                              </span>
                            )}
                            {isPreparing && (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-100 text-blue-900 border border-blue-300 flex items-center gap-1">
                                <RefreshCw className="w-3 h-3 text-blue-600 animate-spin" />
                                <span>جاري التجهيز بالمستودع</span>
                              </span>
                            )}
                            {isReady && (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>تم التجهيز وجاهز للشحن</span>
                              </span>
                            )}
                            {isCompleted && (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-green-100 text-green-900 border border-green-300 flex items-center gap-1">
                                <Check className="w-3 h-3 text-green-600" />
                                <span>مكتمل ومسلم</span>
                              </span>
                            )}
                            {isRejected && (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-100 text-rose-900 border border-rose-300 flex items-center gap-1">
                                <XCircle className="w-3 h-3 text-rose-600" />
                                <span>تعذر التجهيز</span>
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 flex-wrap">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>
                              {new Date(order.createdAt).toLocaleDateString('ar-IQ', {
                                weekday: 'short',
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            {order.pharmacistName && (
                              <>
                                <span>•</span>
                                <span>الموظف: {order.pharmacistName}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedOrderForPrint(order)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border border-slate-200"
                        >
                          <Printer className="w-3.5 h-3.5 text-slate-600" />
                          <span>طباعة القائمة</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleShareWhatsApp(order)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>واتساب المذخر</span>
                        </button>
                      </div>
                    </div>

                    {/* Shared Cart Merging Banner */}
                    {isPending && (
                      <div className="bg-amber-50/80 px-4 py-2 border-b border-amber-200 flex items-center justify-between gap-2 text-xs text-amber-900 font-bold">
                        <div className="flex items-center gap-2">
                          <Layers className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>
                            سلة طلب مفتوحة: أي مواد يضيفها موظفو الصيدلية الآن ستُجمع وتُدمج تلقائياً في هذا الطلب قبل اعتماده من إدارة المذخر.
                          </span>
                        </div>
                        <span className="text-[10px] bg-amber-200 text-amber-950 px-2 py-0.5 rounded-full font-black shrink-0">
                          دمج تلقائي
                        </span>
                      </div>
                    )}

                    {/* Itemized Table */}
                    <div className="p-4 overflow-x-auto">
                      <table className="w-full text-right text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500 font-bold text-[11px]">
                            <th className="pb-2 text-right">الدواء والمواصفات</th>
                            <th className="pb-2 text-center">الاكسباير</th>
                            <th className="pb-2 text-center">الكمية المطلوبة</th>
                            <th className="pb-2 text-center">البونص المجاني</th>
                            <th className="pb-2 text-left">سعر المفرد</th>
                            <th className="pb-2 text-left">المجموع</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {order.items.map((item, i) => (
                            <tr key={`${item.productId}-${i}`} className="hover:bg-slate-50/50">
                              <td className="py-2.5 pr-1">
                                <div className="font-black text-slate-900">{item.tradeNameAr}</div>
                                <div className="text-[11px] text-slate-500 font-mono" dir="ltr">
                                  {item.tradeNameEn} {item.strength && `• ${item.strength}`} {item.dosageForm && `• ${item.dosageForm}`}
                                </div>
                              </td>
                              <td className="py-2.5 text-center font-mono font-bold text-slate-700" dir="ltr">
                                {item.expiryDate || '—'}
                              </td>
                              <td className="py-2.5 text-center font-black text-slate-900">
                                <span className="bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                                  {item.quantity} علبة
                                </span>
                              </td>
                              <td className="py-2.5 text-center">
                                {item.bonusQuantity > 0 ? (
                                  <span className="bg-amber-100 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-md font-black text-[11px]">
                                    +{item.bonusQuantity} مجاناً
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="py-2.5 text-left font-mono font-semibold text-slate-700">
                                {item.unitPrice.toLocaleString()} {settings.currency}
                              </td>
                              <td className="py-2.5 text-left font-mono font-black text-blue-700">
                                {item.totalPrice.toLocaleString()} {settings.currency}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Order Footer Totals */}
                    <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-slate-600 font-bold">
                          إجمالي الأصناف: <strong className="text-slate-900">{order.items.length} أصناف</strong>
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-600 font-bold">
                          إجمالي العلب: <strong className="text-slate-900">{order.totalQuantity} علبة</strong>
                          {order.totalBonus > 0 && <span className="text-amber-700 mr-1">(+{order.totalBonus} بونص)</span>}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 font-bold">المبلغ الإجمالي للطلب:</span>
                        <span className="text-base font-black text-blue-700 font-mono">
                          {order.totalAmount.toLocaleString()} {settings.currency}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Floating Bottom Sticky Cart Bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-xl p-3 sm:p-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-base shadow-xs">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-800">
                    {cart.length} أصناف مختارة
                  </span>
                  <span className="text-xs text-slate-500 font-medium">
                    ({cartTotalQuantity} علبة {cartTotalBonus > 0 && `+ ${cartTotalBonus} بونص مجاني`})
                  </span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xs text-slate-500">المجموع المطلوب:</span>
                  <span className="text-lg font-black text-blue-700">
                    {cartTotalAmount.toLocaleString()} {settings.currency}
                  </span>
                </div>
              </div>
            </div>

            <button
              id="btn-open-cart-checkout"
              onClick={handleOpenCart}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-xs transition flex items-center gap-2 cursor-pointer"
            >
              <span>مراجعة وتثبيت الطلبية</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Cart Review & Checkout Slide-Over Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col justify-between animate-in slide-in-from-left duration-200">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-1.5">
                    سلة طلبات الصيدلية
                    <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-mono font-bold">
                      {cart.length}
                    </span>
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    {cartTotalQuantity} علبة • {cartTotalAmount.toLocaleString()} {settings.currency}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {cart.length > 0 && (
                  <button
                    onClick={handleCopyCartLink}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer ${
                      copiedCartLink
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                    }`}
                    title="نسخ رابط السلة المباشر للمنتجات"
                  >
                    {copiedCartLink ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>تم نسخ الرابط!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-blue-600" />
                        <span className="hidden sm:inline">نسخ رابط السلة</span>
                      </>
                    )}
                  </button>
                )}
                <button
                  onClick={() => setIsCartOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200 transition cursor-pointer"
                  title="إغلاق السلة"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {cart.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <ShoppingCart className="w-12 h-12 mx-auto text-slate-300" />
                  <p className="text-sm font-semibold">السلة فارغة حالياً</p>
                </div>
              ) : (
                <>
                  {/* Shared Cart Team Indicator */}
                  <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                        🛒
                      </div>
                      <div>
                        <span className="font-black text-blue-950 block">
                          سلة مشتريات موحدة لصيدلية {pharmacyName || currentUser?.pharmacyName || 'الصيدلية'}
                        </span>
                        <span className="text-[11px] text-blue-700">
                          تجمع مشتريات كافة موظفي الصيدلية في طلب واحد مشترك
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] bg-blue-200 text-blue-950 font-black px-2 py-0.5 rounded-full shrink-0">
                      سلة مشتركة
                    </span>
                  </div>

                  {/* Pending Order Merging Notice */}
                  {pendingOrderForPharmacy && (
                    <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-2.5 text-xs text-amber-950 animate-in fade-in duration-150">
                      <Layers className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-black flex items-center gap-1.5">
                          <span>دمج تلقائي مع طلبك قيد التدقيق:</span>
                          <span className="font-mono bg-amber-200 text-amber-900 px-1.5 py-0.2 rounded font-black">
                            #{pendingOrderForPharmacy.orderNumber}
                          </span>
                        </div>
                        <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                          يوجد طلب حالي قيد المراجعة في المذخر. عند تأكيد هذا الطلب، ستُدمج هذه الأصناف تلقائياً في نفس الطلب لتصلكم في شحنة واحدة موحدة.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Shareable Cart Link Banner */}
                  <div className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shadow-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                        <ShoppingCart className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">رابط سلة المنتجات المباشر</span>
                        <span className="text-[11px] text-slate-600">يمكنك مشاركة رابط السلة مع كامل المواد والكميات المختارة</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={handleCopyCartLink}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition cursor-pointer shadow-xs ${
                          copiedCartLink
                            ? 'bg-emerald-600 text-white'
                            : 'bg-white text-blue-700 border border-blue-300 hover:bg-blue-50'
                        }`}
                      >
                        {copiedCartLink ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-white" />
                            <span>تم النسخ!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-blue-600" />
                            <span>نسخ رابط السلة</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={handleShareCartWhatsApp}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer shadow-xs"
                        title="إرسال رابط السلة عبر واتساب"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>واتساب</span>
                      </button>
                    </div>
                  </div>

                  {/* Cart Items List */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      المواد والكميات المطلوبة:
                    </h4>
                    {cart.map((item) => (
                      <div
                        key={item.productId}
                        className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-bold text-slate-900 truncate">
                            {item.product.tradeNameAr}
                          </h4>
                          <p className="text-[11px] text-slate-500 truncate" dir="ltr">
                            {item.product.tradeNameEn}
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-600">
                            <span className="text-emerald-700 font-bold">
                              الصلاحية: {item.product.expiryDate}
                            </span>
                            {item.product.batchNumber && (
                              <span className="font-mono bg-white px-1.5 py-0.2 rounded border border-slate-200">
                                {item.product.batchNumber}
                              </span>
                            )}
                          </div>
                          {item.bonusPercentage && item.bonusPercentage > 0 ? (
                            <span className="inline-block mt-1 text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded border border-emerald-200">
                              تذويب {item.bonusPercentage}% ({(item.meltedUnitPrice || calculateMeltedPrice(item.unitPrice, item.bonusPercentage)).toLocaleString()} {settings.currency})
                            </span>
                          ) : item.bonusQuantity > 0 ? (
                            <span className="inline-block mt-1 text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">
                              + {item.bonusQuantity} مجاناً
                            </span>
                          ) : null}
                        </div>

                        {/* Quantity and Price */}
                        <div className="flex flex-col items-end gap-1.5">
                          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-1">
                            <button
                              onClick={() => onUpdateCartQuantity(item.productId, item.quantity - 1)}
                              className="w-6 h-6 flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
                            >
                              -
                            </button>
                            <span className="w-8 text-center text-xs font-bold text-slate-800">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => onUpdateCartQuantity(item.productId, item.quantity + 1)}
                              className="w-6 h-6 flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
                            >
                              +
                            </button>
                          </div>

                          <span className="text-xs font-bold text-slate-900">
                            {item.subtotal.toLocaleString()} {settings.currency}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pharmacy Details Form */}
                  <form onSubmit={handleCheckoutSubmit} id="pharmacy-checkout-form" className="space-y-3 pt-4 border-t border-slate-200">
                    <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Building className="w-4 h-4 text-blue-600" />
                      بيانات الاستلام:
                    </h4>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        اسم الصيدلية <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="اسم الصيدلية"
                        value={pharmacyName}
                        onChange={(e) => setPharmacyName(e.target.value)}
                        className={`w-full px-3 py-2 text-xs rounded-lg border ${
                          formErrors.pharmacyName ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                        } focus:outline-hidden focus:border-blue-500`}
                      />
                      {formErrors.pharmacyName && (
                        <span className="text-[11px] text-rose-600 mt-0.5 block">{formErrors.pharmacyName}</span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          اسم الموظف / الصيدلي المسؤول <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="اسم الموظف"
                          value={pharmacistName}
                          onChange={(e) => setPharmacistName(e.target.value)}
                          className={`w-full px-3 py-2 text-xs rounded-lg border ${
                            formErrors.pharmacistName ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                          } focus:outline-hidden focus:border-blue-500`}
                        />
                        {formErrors.pharmacistName && (
                          <span className="text-[11px] text-rose-600 mt-0.5 block">{formErrors.pharmacistName}</span>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          رقم الهاتف / واتساب <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="tel"
                          placeholder="0770xxxxxxx"
                          dir="ltr"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className={`w-full px-3 py-2 text-xs rounded-lg border text-right ${
                            formErrors.phone ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                          } focus:outline-hidden focus:border-blue-500`}
                        />
                        {formErrors.phone && (
                          <span className="text-[11px] text-rose-600 mt-0.5 block">{formErrors.phone}</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        العنوان والمدينة / المنطقة <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="المدينة - المنطقة - أقرب نقطة دالة"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className={`w-full px-3 py-2 text-xs rounded-lg border ${
                          formErrors.address ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                        } focus:outline-hidden focus:border-blue-500`}
                      />
                      {formErrors.address && (
                        <span className="text-[11px] text-rose-600 mt-0.5 block">{formErrors.address}</span>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        ملاحظات إضافية للتجهيز (اختياري)
                      </label>
                      <textarea
                        rows={2}
                        placeholder="أي تفاصيل خاصة بتواريخ الصلاحية أو مندوب التوصيل..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:border-blue-500"
                      />
                    </div>
                  </form>
                </>
              )}
            </div>

            {/* Drawer Footer Checkout Button */}
            {cart.length > 0 && (
              <div className="p-4 border-t border-slate-200 bg-slate-50 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">إجمالي المواد والكميات:</span>
                  <span className="font-bold text-slate-800">
                    {cartTotalQuantity} علبة {cartTotalBonus > 0 && `(+ ${cartTotalBonus} بونص مجاني)`}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-slate-700">المبلغ الإجمالي:</span>
                  <span className="text-xl font-black text-slate-900">
                    {cartTotalAmount.toLocaleString()} {settings.currency}
                  </span>
                </div>

                <button
                  type="submit"
                  form="pharmacy-checkout-form"
                  disabled={isSubmitting}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-lg shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>{isSubmitting ? 'جاري إرسال الطلبية للمذخر...' : 'إرسال الطلبية لمسؤول مذخر سامو الآن'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Order Completed Success Modal */}
      {completedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-xl text-center space-y-4 animate-in zoom-in-95 duration-150">
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-200">
                تم استلام طلب الصيدلية بنجاح
              </span>
              <h3 className="text-xl font-bold text-slate-900 mt-2">
                رقم الطلب: {completedOrder.orderNumber}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                ظهر إشعار فوري عند صاحب المذخر، وسيقوم بفحص تواريخ الصلاحية وتجهيز العبوات المطلوبة فوراً.
              </p>
            </div>

            {/* Order Summary box */}
            <div className="bg-slate-50 rounded-xl p-4 text-xs text-slate-700 text-right space-y-2 border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500">الصيدلية:</span>
                <span className="font-bold">{completedOrder.pharmacyName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الموظف / المسؤول:</span>
                <span className="font-bold">{completedOrder.pharmacistName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">عدد المواد:</span>
                <span className="font-bold">{completedOrder.items.length} صنف ({completedOrder.totalQuantity} علبة)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">المبلغ الإجمالي:</span>
                <span className="font-black text-blue-700 text-sm">
                  {completedOrder.totalAmount.toLocaleString()} {settings.currency}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-2 pt-2">
              <button
                onClick={() => handleShareWhatsApp(completedOrder)}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                <span>إرسال نسخة عبر واتساب المذخر مباشرة</span>
              </button>

              <button
                onClick={() => {
                  setCompletedOrder(null);
                  onClearCart();
                }}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                العودة للتسوق وطلب مواد أخرى
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Detail Modal */}
      {selectedProductDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-200">
                  {selectedProductDetails.category || 'عام'}
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-2">
                  {selectedProductDetails.tradeNameAr}
                </h3>
                <p className="text-xs text-slate-500 font-medium" dir="ltr">
                  {selectedProductDetails.tradeNameEn}
                </p>
              </div>
              <button
                onClick={() => setSelectedProductDetails(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {selectedProductDetails.scientificName && (
              <div className="bg-blue-50/70 rounded-xl p-3 text-xs border border-blue-100 space-y-1">
                <span className="text-blue-900 font-bold block">التركيبة والاسم العلمي (Generic):</span>
                <p className="font-mono text-blue-800 text-[13px]">{selectedProductDetails.scientificName}</p>
              </div>
            )}

            {/* Core Specifications */}
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-slate-400 block text-[11px]">تاريخ الانتهاء (الاكسباير):</span>
                <span className="font-black text-emerald-700">{selectedProductDetails.expiryDate}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-slate-400 block text-[11px]">الكمية الكلية المتاحة:</span>
                <span className="font-black text-slate-900">{selectedProductDetails.stockQuantity} علبة</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-slate-400 block text-[11px]">الشركة المصنعة:</span>
                <span className="font-bold text-slate-800">{selectedProductDetails.manufacturer || 'غير محدد'}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-slate-400 block text-[11px]">الشكل الصيدلاني:</span>
                <span className="font-bold text-slate-800">{selectedProductDetails.dosageForm}</span>
              </div>
            </div>

            {/* Pricing Details */}
            <div className="flex items-center justify-between p-3.5 bg-slate-900 text-white rounded-xl">
              <div>
                <span className="text-[11px] text-slate-400 block">سعر المفرد للصيدلية:</span>
                {selectedProductDetails.bonusPercentage && selectedProductDetails.bonusPercentage > 0 ? (
                  <div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xl font-black text-emerald-400">
                        {calculateMeltedPrice(selectedProductDetails.wholesalePrice, selectedProductDetails.bonusPercentage).toLocaleString()}
                      </span>
                      <span className="text-xs text-emerald-300 font-bold">{settings.currency}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-slate-400 line-through">
                        {selectedProductDetails.wholesalePrice.toLocaleString()} {settings.currency}
                      </span>
                      <span className="text-[10px] bg-emerald-500/30 text-emerald-300 px-1.5 py-0.2 rounded font-bold">
                        تذويب بونص {selectedProductDetails.bonusPercentage}%
                      </span>
                    </div>
                  </div>
                ) : (
                  <span className="text-lg font-black text-white">
                    {selectedProductDetails.wholesalePrice.toLocaleString()} {settings.currency}
                  </span>
                )}
              </div>
              {selectedProductDetails.bonusDescription && !selectedProductDetails.bonusPercentage && (
                <div className="text-left bg-amber-500/20 text-amber-300 px-2.5 py-1 rounded-lg border border-amber-400/30 text-xs font-bold">
                  {selectedProductDetails.bonusDescription}
                </div>
              )}
            </div>

            {/* Add to Cart button from inside modal */}
            <button
              onClick={() => {
                handleAddToCartSecure(selectedProductDetails, 1);
                setSelectedProductDetails(null);
                handleOpenCart();
              }}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs transition"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة الصنف إلى سلة الصيدلية</span>
            </button>
          </div>
        </div>
      )}

      {/* Pharmacy Printable Invoice Modal */}
      {selectedOrderForPrint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white">
          <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden my-auto print:shadow-none print:m-0 print:w-full print:rounded-none">
            {/* Top Toolbar (Hidden when printing) */}
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-blue-400" />
                <span className="font-bold text-sm">
                  قائمة تجهيز الأدوية المعتمدة (#{selectedOrderForPrint.orderNumber})
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const text = `*قائمة طلبية أدوية معتمدة من ${settings.name || 'مذخر سامو'}*\n` +
                      `رقم القائمة: ${selectedOrderForPrint.orderNumber}\n` +
                      `الصيدلية: ${selectedOrderForPrint.pharmacyName}\n` +
                      `الموظف: ${selectedOrderForPrint.pharmacistName}\n` +
                      `المبلغ الإجمالي: ${selectedOrderForPrint.totalAmount.toLocaleString()} ${settings.currency}\n` +
                      `عدد الأصناف: ${selectedOrderForPrint.items.length}\n` +
                      `حالة الطلب: ${selectedOrderForPrint.status === 'ready' ? 'مكتمل التجهيز ومطابق' : 'تم القبول وجاري التجهيز'}`;
                    navigator.clipboard.writeText(text);
                    setCopiedInvoiceText(true);
                    setTimeout(() => setCopiedInvoiceText(false), 2000);
                  }}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Copy className="w-4 h-4 text-slate-400" />
                  <span>{copiedInvoiceText ? 'تم النسخ!' : 'نسخ ملخص'}</span>
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
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>

            {/* Printable Invoice Document */}
            <div id="pharmacy-printable-invoice" className="bg-white p-4 sm:p-8 text-slate-900 font-sans">
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
                    العنوان: {settings.address} • هاتف المذخر: <span dir="ltr">{settings.phone}</span>
                    {settings.salesPhone && <span> • المبيعات والتجهيز: <span dir="ltr">{settings.salesPhone}</span></span>}
                    {settings.supportPhone && <span> • الدعم الفني: <span dir="ltr">{settings.supportPhone}</span></span>}
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
                  <span className="inline-block mt-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded">
                    {selectedOrderForPrint.status === 'ready' ? 'مكتمل التجهيز ومطابق' : 'تم قبول الطلب وجاري التجهيز'}
                  </span>
                </div>
              </div>

              {/* Pharmacy Meta */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 mb-5 text-xs">
                <div>
                  <span className="text-slate-500 block text-[11px]">اسم الصيدلية:</span>
                  <span className="font-bold text-base text-slate-900">{selectedOrderForPrint.pharmacyName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">اسم الموظف / الصيدلي:</span>
                  <span className="font-bold text-base text-slate-900">{selectedOrderForPrint.pharmacistName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">هاتف الصيدلية:</span>
                  <span className="font-semibold text-slate-800" dir="ltr">{selectedOrderForPrint.phone}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">العنوان / المحافظة:</span>
                  <span className="font-semibold text-slate-800">{selectedOrderForPrint.address}</span>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-300 rounded-lg overflow-hidden mb-6">
                <table className="w-full text-xs text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                      <th className="p-2.5 text-center w-10">ت</th>
                      <th className="p-2.5">اسم الدواء والمواصفات</th>
                      <th className="p-2.5 text-center">رقم الوجبة (Batch)</th>
                      <th className="p-2.5 text-center">تاريخ الانتهاء (Expiry)</th>
                      <th className="p-2.5 text-center">الكمية</th>
                      <th className="p-2.5 text-center">بونص</th>
                      <th className="p-2.5">السعر المفرد</th>
                      <th className="p-2.5">الإجمالي</th>
                      <th className="p-2.5 text-center">حالة الصنف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {selectedOrderForPrint.items.map((item, idx) => (
                      <tr key={idx} className={item.status === 'unavailable' ? 'bg-rose-50/50' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                        <td className="p-2.5 text-center font-bold text-slate-500">{idx + 1}</td>
                        <td className="p-2.5">
                          <span className="font-bold text-slate-900 block">{item.tradeNameAr}</span>
                          <span className="text-[10px] text-slate-500 block" dir="ltr">
                            {item.tradeNameEn} • {item.dosageForm} {item.strength}
                          </span>
                        </td>
                        <td className="p-2.5 text-center font-mono font-bold text-slate-700">
                          {item.batchNumber}
                        </td>
                        <td className="p-2.5 text-center font-mono font-bold text-slate-900">
                          {item.expiryDate}
                        </td>
                        <td className="p-2.5 text-center font-bold text-slate-900">
                          {item.quantity}
                        </td>
                        <td className="p-2.5 text-center">
                          {item.bonusQuantity > 0 ? (
                            <span className="font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded text-[10px]">
                              +{item.bonusQuantity}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="p-2.5 font-medium text-slate-700">
                          {item.isBonusMelted && item.meltedUnitPrice ? (
                            <div>
                              <span className="font-bold text-emerald-800">{item.meltedUnitPrice.toLocaleString()} {settings.currency}</span>
                              <span className="block text-[9px] text-emerald-600 font-bold">تذويب {item.bonusPercentage}%</span>
                            </div>
                          ) : (
                            <span>{item.unitPrice.toLocaleString()} {settings.currency}</span>
                          )}
                        </td>
                        <td className="p-2.5 font-bold text-slate-900">
                          {item.status === 'unavailable' ? '0' : item.totalPrice.toLocaleString()} {settings.currency}
                        </td>
                        <td className="p-2.5 text-center">
                          {item.status === 'unavailable' ? (
                            <span className="text-rose-700 font-bold text-[10px] bg-rose-100 px-1.5 py-0.5 rounded">
                              تعذر التجهيز (نفذ)
                            </span>
                          ) : item.verified ? (
                            <span className="text-emerald-700 font-bold text-[10px] bg-emerald-100 px-1.5 py-0.5 rounded">
                              ✓ مطابق ومعتمد
                            </span>
                          ) : (
                            <span className="text-slate-500 text-[10px]">قيد المراجعة</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals Summary */}
              <div className="flex justify-end mb-8">
                <div className="w-80 bg-slate-50 rounded-xl p-4 border border-slate-300 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>إجمالي عدد المواد:</span>
                    <span className="font-bold text-slate-900">{selectedOrderForPrint.items.length} صنف</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>إجمالي الكمية المطلوبة:</span>
                    <span className="font-bold text-slate-900">{selectedOrderForPrint.totalQuantity} علبة</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>مجموع البونص المجاني:</span>
                    <span className="font-bold text-amber-800">{selectedOrderForPrint.totalBonus} علبة</span>
                  </div>
                  <div className="border-t-2 border-slate-900 pt-2 flex justify-between text-base font-black text-slate-950">
                    <span>المبلغ الصافي المطلوب:</span>
                    <span className="text-blue-700">
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

      {/* Edit Contact / Inquiry Modal */}
      {onUpdateSettings && (
        <EditContactModal
          isOpen={isEditContactOpen}
          onClose={() => setIsEditContactOpen(false)}
          settings={settings}
          onUpdateSettings={onUpdateSettings}
        />
      )}

      {/* Warehouse Contact & Support Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-8 print:hidden">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-black text-slate-900">
                تواصل مباشر مع إدارة {settings.name || 'المذخر'}
              </h4>
              <p className="text-[11px] text-slate-500">
                لأي استفسار بخصوص تواريخ الصلاحية، الأسعار، أو التجهيز السريع
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
            {settings.phone && (
              <a
                href={`tel:${settings.phone}`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
              >
                <span>الإدارة:</span>
                <span dir="ltr" className="font-mono">{settings.phone}</span>
              </a>
            )}
            {settings.salesPhone && (
              <a
                href={`tel:${settings.salesPhone}`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl transition"
              >
                <span>المبيعات:</span>
                <span dir="ltr" className="font-mono">{settings.salesPhone}</span>
              </a>
            )}
            {settings.supportPhone && (
              <a
                href={`tel:${settings.supportPhone}`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl transition"
              >
                <span>الدعم الفني:</span>
                <span dir="ltr" className="font-mono">{settings.supportPhone}</span>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Discrete Switch back to Warehouse Dashboard if authorized */}
      {onSwitchToWarehouse && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-12 pt-6 border-t border-slate-200 text-center text-xs text-slate-400 print:hidden">
          <button
            onClick={onSwitchToWarehouse}
            className="hover:text-blue-600 underline cursor-pointer inline-flex items-center gap-1 transition"
          >
            <span>دخول لوحة إدارة ومخازن مذخر سامو</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
