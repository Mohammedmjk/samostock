import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  X,
  PackagePlus,
  Store,
  UserCheck,
  Phone,
  MapPin,
  Search,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  PackageCheck,
  Printer,
  Sparkles,
  ClipboardList,
  AlertTriangle,
  User,
  FileText,
  RefreshCw,
  Building2,
  Check,
  Layers,
  ArrowRight
} from 'lucide-react';
import { Order, OrderItem, OrderStatus, Product, WarehouseSettings, calculateMeltedPrice } from '../types';
import { storage } from '../services/storage';

interface DirectPharmacyDispatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  existingPharmacies: Array<{
    name: string;
    pharmacistName: string;
    phone: string;
    address: string;
    city?: string;
    ordersCount?: number;
  }>;
  initialPharmacyName?: string;
  settings: WarehouseSettings;
  onSaveDirectOrder: (order: Order, postAction?: 'prep' | 'print' | 'none', keepOpenForNext?: boolean) => void;
}

export const DirectPharmacyDispatchModal: React.FC<DirectPharmacyDispatchModalProps> = ({
  isOpen,
  onClose,
  products,
  existingPharmacies,
  initialPharmacyName,
  settings,
  onSaveDirectOrder,
}) => {
  // Real-time directory sync helper without requiring page reload
  const getLivePharmacies = useCallback((): Array<{
    name: string;
    pharmacistName: string;
    phone: string;
    address: string;
    city?: string;
    ordersCount?: number;
  }> => {
    const deleted = storage.getDeletedPharmacies().map((n) => n.trim().toLowerCase());
    const map = new Map<
      string,
      {
        name: string;
        pharmacistName: string;
        phone: string;
        address: string;
        city?: string;
        ordersCount?: number;
      }
    >();

    // Filter out warehouse management / admin HQ accounts
    const isWarehouseOrStaffHq = (name?: string, role?: string) => {
      const n = (name || '').trim().toLowerCase();
      return (
        role === 'super_admin' ||
        role === 'founder' ||
        role === 'staff' ||
        role === 'warehouse_manager' ||
        role === 'pharmacist_staff' ||
        n.includes('الإدارة العامة') ||
        n.includes('مذخر سامو') ||
        n.includes('المشرف العام') ||
        n.includes('كادر مذخر') ||
        n.includes('فريق عمل المذخر')
      );
    };

    // 1. From props
    existingPharmacies.forEach((p) => {
      const name = (p.name || '').trim();
      if (name && !isWarehouseOrStaffHq(name) && !deleted.includes(name.toLowerCase())) {
        map.set(name.toLowerCase(), {
          ...p,
          name,
          ordersCount: p.ordersCount || 0,
        });
      }
    });

    // 2. From storage registered users (including approved, pending, and secondary branches)
    try {
      const users = storage.getRegisteredUsers();
      users.forEach((u) => {
        if (
          u.pharmacyName &&
          u.pharmacyName.trim() &&
          !isWarehouseOrStaffHq(u.pharmacyName, u.role) &&
          u.status !== 'rejected' &&
          u.status !== 'blocked' &&
          !storage.isUserDeleted(u.id, u.identifier, u.pharmacyName) &&
          !deleted.includes(u.pharmacyName.trim().toLowerCase())
        ) {
          const key = u.pharmacyName.trim().toLowerCase();
          if (!map.has(key)) {
            map.set(key, {
              name: u.pharmacyName.trim(),
              pharmacistName: u.pharmacistName || u.name || 'صيدلي معتمد',
              phone: u.phone || u.identifier || '',
              address: u.address || '',
              city: '',
              ordersCount: 0,
            });
          } else {
            const existing = map.get(key)!;
            if (u.pharmacistName && (!existing.pharmacistName || existing.pharmacistName === 'صيدلي معتمد')) {
              existing.pharmacistName = u.pharmacistName;
            }
            if (u.phone && !existing.phone) existing.phone = u.phone;
            if (u.address && !existing.address) existing.address = u.address;
          }
        }

        // Secondary branches registered under this account
        if (Array.isArray((u as any).pharmacies)) {
          (u as any).pharmacies.forEach((b: any) => {
            const bName = (b.name || '').trim();
            if (bName && !isWarehouseOrStaffHq(bName) && !deleted.includes(bName.toLowerCase())) {
              const bKey = bName.toLowerCase();
              if (!map.has(bKey)) {
                map.set(bKey, {
                  name: bName,
                  pharmacistName: b.pharmacistName || u.pharmacistName || u.name || 'صيدلي معتمد',
                  phone: b.phone || u.phone || u.identifier || '',
                  address: b.address || u.address || '',
                  city: '',
                  ordersCount: 0,
                });
              }
            }
          });
        }
      });
    } catch {}

    // 3. From storage branches
    try {
      const branchList: any[] = JSON.parse(localStorage.getItem('samo_user_pharmacy_branches_v1') || '[]');
      branchList.forEach((b) => {
        const bName = (b.name || '').trim();
        if (bName && !isWarehouseOrStaffHq(bName) && !deleted.includes(bName.toLowerCase())) {
          const bKey = bName.toLowerCase();
          if (!map.has(bKey)) {
            map.set(bKey, {
              name: bName,
              pharmacistName: b.pharmacistName || 'صيدلي مسجل',
              phone: b.phone || '',
              address: b.address || '',
              city: '',
              ordersCount: 0,
            });
          }
        }
      });
    } catch {}

    // 4. From storage orders
    try {
      const orders = storage.getOrders();
      orders.forEach((o) => {
        const name = (o.pharmacyName || '').trim();
        if (name && !isWarehouseOrStaffHq(name) && !deleted.includes(name.toLowerCase())) {
          const key = name.toLowerCase();
          const existing = map.get(key);
          if (existing) {
            existing.ordersCount = (existing.ordersCount || 0) + 1;
            if (o.pharmacistName && (!existing.pharmacistName || existing.pharmacistName === 'صيدلي معتمد')) {
              existing.pharmacistName = o.pharmacistName;
            }
            if (o.phone && !existing.phone) existing.phone = o.phone;
            if (o.address && !existing.address) existing.address = o.address;
          } else {
            map.set(key, {
              name,
              pharmacistName: o.pharmacistName || 'صيدلي معتمد',
              phone: o.phone || '',
              address: o.address || '',
              city: o.city || '',
              ordersCount: 1,
            });
          }
        }
      });
    } catch {}

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [existingPharmacies]);

  // Live state of pharmacies directory (auto-updates in real-time)
  const [livePharmacies, setLivePharmacies] = useState(getLivePharmacies);

  // Pharmacy Selection Mode: 'existing' | 'new'
  const [pharmacyMode, setPharmacyMode] = useState<'existing' | 'new'>(
    initialPharmacyName ? 'existing' : livePharmacies.length > 0 ? 'existing' : 'new'
  );

  // Search inside directory
  const [pharmacySearchTerm, setPharmacySearchTerm] = useState('');
  const [showDirectoryCards, setShowDirectoryCards] = useState(true);

  // Pharmacy Details
  const [selectedPharmacyKey, setSelectedPharmacyKey] = useState<string>(initialPharmacyName || '');
  const [pharmacyName, setPharmacyName] = useState(initialPharmacyName || '');
  const [pharmacistName, setPharmacistName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');

  // Order Details
  const [preparedBy, setPreparedBy] = useState(settings.pharmacistInCharge || 'موظف المذخر المناوب');
  const [initialStatus, setInitialStatus] = useState<OrderStatus>('preparing');
  const [notes, setNotes] = useState('تجهيز مباشر من المذخر');

  // Selected Order Items
  const [items, setItems] = useState<OrderItem[]>([]);

  // Product Search State
  const [productSearch, setProductSearch] = useState('');
  const [productFilter, setProductFilter] = useState<'all' | 'in_stock' | 'with_bonus'>('all');
  const [isSearchingProduct, setIsSearchingProduct] = useState(false);

  // Session-prepared orders counter (for preparing more than one order in succession)
  const [sessionDispatchedOrders, setSessionDispatchedOrders] = useState<Order[]>([]);
  const [batchNotice, setBatchNotice] = useState<string | null>(null);

  // Candidate product quantity state before adding to order
  const [candidateQuantities, setCandidateQuantities] = useState<Record<string, number>>({});

  const getCandidateQuantity = (productId: string) => {
    return candidateQuantities[productId] !== undefined ? candidateQuantities[productId] : 1;
  };

  const setCandidateQuantity = (productId: string, qty: number) => {
    const safeQty = Math.max(1, isNaN(qty) ? 1 : Math.floor(qty));
    setCandidateQuantities((prev) => ({
      ...prev,
      [productId]: safeQty,
    }));
  };

  // Success screen state after order creation
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [itemAddedToast, setItemAddedToast] = useState<string | null>(null);

  // Live subscription to storage & window events without requiring page reload
  useEffect(() => {
    setLivePharmacies(getLivePharmacies());

    const syncInterval = setInterval(() => {
      setLivePharmacies(getLivePharmacies());
    }, 2500);

    const handleStorageEvent = () => {
      setLivePharmacies(getLivePharmacies());
    };

    window.addEventListener('storage', handleStorageEvent);
    window.addEventListener('focus', handleStorageEvent);

    return () => {
      clearInterval(syncInterval);
      window.removeEventListener('storage', handleStorageEvent);
      window.removeEventListener('focus', handleStorageEvent);
    };
  }, [getLivePharmacies]);

  // When initialPharmacyName is provided or changed
  useEffect(() => {
    if (initialPharmacyName) {
      const match = livePharmacies.find(
        (p) => p.name.trim().toLowerCase() === initialPharmacyName.trim().toLowerCase()
      );
      if (match) {
        setSelectedPharmacyKey(match.name);
        setPharmacyName(match.name);
        setPharmacistName(match.pharmacistName || '');
        setPhone(match.phone || '');
        setAddress(match.address || '');
        setCity(match.city || '');
        setPharmacyMode('existing');
      } else {
        setPharmacyName(initialPharmacyName);
        setPharmacyMode('new');
      }
    }
  }, [initialPharmacyName, livePharmacies]);

  // Handle existing pharmacy selection
  const handleSelectExistingPharmacy = (name: string) => {
    setSelectedPharmacyKey(name);
    const match = livePharmacies.find((p) => p.name === name);
    if (match) {
      setPharmacyName(match.name);
      setPharmacistName(match.pharmacistName || '');
      setPhone(match.phone || '');
      setAddress(match.address || '');
      setCity(match.city || '');
    }
  };

  // Filtered pharmacies in directory search
  const filteredDirectoryPharmacies = useMemo(() => {
    const term = pharmacySearchTerm.trim().toLowerCase();
    if (!term) return livePharmacies;
    return livePharmacies.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.pharmacistName && p.pharmacistName.toLowerCase().includes(term)) ||
        (p.phone && p.phone.includes(term)) ||
        (p.address && p.address.toLowerCase().includes(term))
    );
  }, [livePharmacies, pharmacySearchTerm]);

  // Filter products for search
  const filteredProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term && productFilter === 'all') {
      return products.slice(0, 15);
    }

    return products
      .filter((p) => {
        if (productFilter === 'in_stock' && (p.stockQuantity || 0) <= 0) return false;
        if (productFilter === 'with_bonus' && (!p.bonusPercentage || p.bonusPercentage <= 0) && !p.bonusBuyQuantity) return false;

        if (!term) return true;

        const matchAr = p.tradeNameAr?.toLowerCase().includes(term);
        const matchEn = p.tradeNameEn?.toLowerCase().includes(term);
        const matchGen = p.genericName?.toLowerCase().includes(term);
        const matchBatch = p.batchNumber?.toLowerCase().includes(term);
        const matchForm = p.dosageForm?.toLowerCase().includes(term);
        const matchBarcode = p.barcode?.toLowerCase().includes(term);

        return matchAr || matchEn || matchGen || matchBatch || matchForm || matchBarcode;
      })
      .slice(0, 20);
  }, [products, productSearch, productFilter]);

  // Add a product to items
  const handleAddProduct = (product: Product, initialQty: number = 1) => {
    const qty = Math.max(1, isNaN(initialQty) ? 1 : Math.floor(initialQty));
    setValidationError(null);
    const existingIndex = items.findIndex((it) => it.productId === product.id);

    if (existingIndex !== -1) {
      // Increment existing
      const existing = items[existingIndex];
      handleUpdateItemQuantity(product.id, existing.quantity + qty);
    } else {
      // Calculate bonus
      let bonusQty = 0;
      if (product.bonusBuyQuantity && product.bonusFreeQuantity) {
        bonusQty = Math.floor(qty / product.bonusBuyQuantity) * product.bonusFreeQuantity;
      } else if (product.bonusPercentage && product.bonusPercentage > 0) {
        bonusQty = Math.floor((qty * product.bonusPercentage) / 100);
      }

      const isMelted = Boolean(product.bonusPercentage && product.bonusPercentage > 0);
      const meltedPrice = isMelted
        ? calculateMeltedPrice(product.wholesalePrice, product.bonusPercentage)
        : undefined;
      const effectiveUnitPrice = isMelted && meltedPrice ? meltedPrice : product.wholesalePrice;

      const newItem: OrderItem = {
        productId: product.id,
        tradeNameAr: product.tradeNameAr,
        tradeNameEn: product.tradeNameEn,
        dosageForm: product.dosageForm,
        strength: product.strength,
        batchNumber: product.batchNumber,
        expiryDate: product.expiryDate,
        quantity: qty,
        bonusQuantity: bonusQty,
        bonusPercentage: product.bonusPercentage,
        meltedUnitPrice: meltedPrice,
        isBonusMelted: isMelted,
        unitPrice: product.wholesalePrice,
        totalPrice: qty * effectiveUnitPrice,
        verified: false,
        status: 'available',
      };

      setItems((prev) => [...prev, newItem]);
    }

    // Reset candidate quantity to 1 for this product
    setCandidateQuantities((prev) => ({ ...prev, [product.id]: 1 }));
    setProductSearch('');

    setItemAddedToast(`تمت إضافة "${product.tradeNameAr}" (${qty} علبة) بنجاح - يمكنك اعتماد التجهيز الآن حتى لو صنف واحد!`);
    setTimeout(() => {
      setItemAddedToast(null);
    }, 3500);
  };

  // Update item quantity
  const handleUpdateItemQuantity = (productId: string, newQty: number) => {
    const qty = Math.max(1, Math.floor(newQty));
    const product = products.find((p) => p.id === productId);

    setItems((prev) =>
      prev.map((it) => {
        if (it.productId === productId) {
          let bonusQty = it.bonusQuantity;
          if (product?.bonusBuyQuantity && product?.bonusFreeQuantity) {
            bonusQty = Math.floor(qty / product.bonusBuyQuantity) * product.bonusFreeQuantity;
          } else if (product?.bonusPercentage && product?.bonusPercentage > 0) {
            bonusQty = Math.floor((qty * product.bonusPercentage) / 100);
          }

          const effectivePrice = it.isBonusMelted && it.meltedUnitPrice ? it.meltedUnitPrice : it.unitPrice;

          return {
            ...it,
            quantity: qty,
            bonusQuantity: bonusQty,
            totalPrice: qty * effectivePrice,
          };
        }
        return it;
      })
    );
  };

  // Update item bonus directly
  const handleUpdateItemBonus = (productId: string, newBonus: number) => {
    const bQty = Math.max(0, Math.floor(newBonus));
    setItems((prev) =>
      prev.map((it) => {
        if (it.productId === productId) {
          return {
            ...it,
            bonusQuantity: bQty,
          };
        }
        return it;
      })
    );
  };

  // Remove item
  const handleRemoveItem = (productId: string) => {
    setItems((prev) => prev.filter((it) => it.productId !== productId));
  };

  // Totals calculations
  const totalQuantity = useMemo(() => items.reduce((s, it) => s + it.quantity, 0), [items]);
  const totalBonus = useMemo(() => items.reduce((s, it) => s + (it.bonusQuantity || 0), 0), [items]);
  const totalAmount = useMemo(() => items.reduce((s, it) => s + it.totalPrice, 0), [items]);

  // Handle Save / Dispatch
  const handleSaveOrder = (postAction: 'prep' | 'print' | 'none' = 'none') => {
    const finalPharmName = pharmacyName.trim();
    if (!finalPharmName) {
      setValidationError('يرجى تحديد أو إدخال اسم الصيدلية أولاً');
      return;
    }

    if (items.length === 0) {
      setValidationError('يرجى إضافة مادة واحدة على الأقل لقائمة التجهيز (حتى لو مادة واحدة)');
      return;
    }

    const orderNumber = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
    const nowIso = new Date().toISOString();

    const newOrder: Order = {
      id: `ord-direct-${Date.now()}`,
      orderNumber,
      createdAt: nowIso,
      pharmacyName: finalPharmName,
      pharmacistName: pharmacistName.trim() || 'صيدلي مسؤول',
      phone: phone.trim() || '',
      address: address.trim() || 'الموقع مسجل لدى المذخر',
      city: city.trim() || '',
      notes: notes.trim(),
      items,
      totalQuantity,
      totalBonus,
      totalAmount,
      status: initialStatus,
      preparedAt: initialStatus === 'preparing' || initialStatus === 'ready' ? nowIso : undefined,
      preparedBy: preparedBy.trim() || settings.pharmacistInCharge,
      completedAt: initialStatus === 'ready' ? nowIso : undefined,
      source: 'direct',
      synced: true,
    };

    setCreatedOrder(newOrder);
    onSaveDirectOrder(newOrder, postAction, false);
  };

  // Handle Save and directly start preparing next order without closing the modal ("واكثر من طلبية يمكن تجهيز")
  const handleSaveAndPrepareNext = (stayWithSamePharmacy = false) => {
    const finalPharmName = pharmacyName.trim();
    if (!finalPharmName) {
      setValidationError('يرجى تحديد أو إدخال اسم الصيدلية أولاً');
      return;
    }

    if (items.length === 0) {
      setValidationError('يرجى إضافة مادة واحدة على الأقل لقائمة التجهيز (حتى لو مادة واحدة)');
      return;
    }

    const orderNumber = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
    const nowIso = new Date().toISOString();

    const newOrder: Order = {
      id: `ord-direct-${Date.now()}`,
      orderNumber,
      createdAt: nowIso,
      pharmacyName: finalPharmName,
      pharmacistName: pharmacistName.trim() || 'صيدلي مسؤول',
      phone: phone.trim() || '',
      address: address.trim() || 'الموقع مسجل لدى المذخر',
      city: city.trim() || '',
      notes: notes.trim(),
      items,
      totalQuantity,
      totalBonus,
      totalAmount,
      status: initialStatus,
      preparedAt: initialStatus === 'preparing' || initialStatus === 'ready' ? nowIso : undefined,
      preparedBy: preparedBy.trim() || settings.pharmacistInCharge,
      completedAt: initialStatus === 'ready' ? nowIso : undefined,
      source: 'direct',
      synced: true,
    };

    onSaveDirectOrder(newOrder, 'none', true);
    setSessionDispatchedOrders((prev) => [newOrder, ...prev]);

    setBatchNotice(
      `تم اعتماد وتجهيز طلبية (${newOrder.orderNumber} - ${newOrder.pharmacyName}) بنجاح! جاهز الآن لتجهيز طلبية جديدة مباشرة دون إغلاق النافذة.`
    );
    setTimeout(() => {
      setBatchNotice(null);
    }, 4500);

    // Reset items for the next order
    setItems([]);
    setProductSearch('');
    setValidationError(null);

    if (!stayWithSamePharmacy) {
      setSelectedPharmacyKey('');
      setPharmacyName('');
      setPharmacistName('');
      setPhone('');
      setAddress('');
      setCity('');
      setPharmacyMode('existing');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-gradient-to-r from-emerald-700 via-teal-700 to-cyan-800 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center text-white shrink-0 shadow-xs">
              <PackagePlus className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black tracking-tight text-white">
                  تجهيز طلبية صيدلية مباشرة
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/40 text-emerald-100 border border-emerald-400/50">
                  إجراء موظف المذخر
                </span>
                {sessionDispatchedOrders.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-900 flex items-center gap-1 shadow-xs">
                    <Check className="w-3 h-3" />
                    <span>تم إنجاز {sessionDispatchedOrders.length} طلبية بالجلسة</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-emerald-100/90 mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span>تجهيز وصرف أدوية ومستلزمات لأي صيدلية مسجلة في الدليل أو جديدة</span>
                <span className="inline-flex items-center gap-1 bg-white/15 px-2 py-0.2 rounded-full text-[10px] font-bold text-white">
                  <Store className="w-3 h-3" />
                  {livePharmacies.length} صيدلية معتمدة بالدليل
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer"
            title="إغلاق النافذة"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Batch Notice Banner */}
        {batchNotice && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 text-xs text-emerald-900 flex items-center justify-between gap-2 shrink-0 animate-in slide-in-from-top-1">
            <div className="flex items-center gap-2 font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{batchNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setBatchNotice(null)}
              className="text-emerald-700 hover:text-emerald-950 p-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Item Added Toast */}
        {itemAddedToast && (
          <div className="bg-teal-50 border-b border-teal-200 px-4 py-1.5 text-xs text-teal-900 flex items-center gap-2 shrink-0 animate-in fade-in">
            <Sparkles className="w-3.5 h-3.5 text-teal-600 shrink-0" />
            <span className="font-semibold">{itemAddedToast}</span>
          </div>
        )}

        {/* Validation Error Banner */}
        {validationError && (
          <div className="bg-rose-50 border-b border-rose-200 px-4 py-2.5 text-xs text-rose-800 flex items-center gap-2 shrink-0 animate-in slide-in-from-top-1">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-bold">{validationError}</span>
          </div>
        )}

        {/* Modal Body */}
        {createdOrder ? (
          /* Post-creation Success Screen */
          <div className="p-6 sm:p-8 text-center space-y-6 overflow-y-auto">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center border-4 border-emerald-50">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h4 className="text-xl font-black text-slate-900">
                تم اعتماد وتجهيز طلبية {createdOrder.pharmacyName} بنجاح!
              </h4>
              <p className="text-sm text-slate-500 mt-1">
                رقم الطلبية:{' '}
                <strong className="font-mono text-slate-800">{createdOrder.orderNumber}</strong> • إجمالي
                الأصناف: <strong>{createdOrder.items.length} صنف</strong> ({createdOrder.totalQuantity} علبة)
              </p>
            </div>

            {/* Order Card Preview */}
            <div className="max-w-md mx-auto bg-slate-50 border border-slate-200 rounded-xl p-4 text-right space-y-2 text-xs">
              <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                <span className="text-slate-500">حالة التجهيز:</span>
                <span className="font-bold text-emerald-700">
                  {createdOrder.status === 'preparing'
                    ? 'قيد التجهيز وفحص الوجبات'
                    : createdOrder.status === 'ready'
                    ? 'جاهزة للتسليم / تم التجهيز'
                    : 'جديدة'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">المسؤول عن التجهيز:</span>
                <span className="font-bold text-slate-800">{createdOrder.preparedBy}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">إجمالي المبلغ:</span>
                <span className="font-black text-emerald-700 text-sm">
                  {createdOrder.totalAmount.toLocaleString()} {settings.currency}
                </span>
              </div>
              {createdOrder.totalBonus > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">بونص مجاني مضاف:</span>
                  <span className="font-bold text-amber-700">
                    + {createdOrder.totalBonus} علبة مجانية
                  </span>
                </div>
              )}
            </div>

            {/* Quick Next Actions */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSessionDispatchedOrders((prev) => [createdOrder, ...prev]);
                  setItems([]);
                  setCreatedOrder(null);
                  setValidationError(null);
                }}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>+ تجهيز طلبية ثانية لنفس الصيدلية</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSessionDispatchedOrders((prev) => [createdOrder, ...prev]);
                  setItems([]);
                  setSelectedPharmacyKey('');
                  setPharmacyName('');
                  setPharmacistName('');
                  setPhone('');
                  setAddress('');
                  setCity('');
                  setPharmacyMode('existing');
                  setCreatedOrder(null);
                  setValidationError(null);
                }}
                className="px-4 py-2.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <Store className="w-4 h-4" />
                <span>+ تجهيز طلبية لصيدلية أخرى من الدليل ({livePharmacies.length})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onSaveDirectOrder(createdOrder, 'prep', false);
                  onClose();
                }}
                className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <Clock className="w-4 h-4" />
                <span>فحص ومطابقة الصلاحيات</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onSaveDirectOrder(createdOrder, 'print', false);
                  onClose();
                }}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة القائمة والفاتورة</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer"
              >
                إغلاق النافذة
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-6 overflow-y-auto space-y-6 divide-y divide-slate-100">
            {/* 1. Pharmacy Selection Block with Real-time Directory */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Store className="w-4 h-4 text-emerald-600" />
                  <span>تحديد الصيدلية المستلمة:</span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                    دليل الصيدليات ({livePharmacies.length} صيدلية مسجلة)
                  </span>
                </label>

                <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setPharmacyMode('existing')}
                    className={`px-3 py-1 rounded-md transition cursor-pointer flex items-center gap-1 ${
                      pharmacyMode === 'existing'
                        ? 'bg-white text-emerald-800 font-bold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>دليل الصيدليات ({livePharmacies.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPharmacyMode('new');
                      setSelectedPharmacyKey('');
                      setPharmacyName('');
                      setPharmacistName('');
                      setPhone('');
                      setAddress('');
                      setCity('');
                    }}
                    className={`px-3 py-1 rounded-md transition cursor-pointer ${
                      pharmacyMode === 'new'
                        ? 'bg-white text-emerald-800 font-bold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    + صيدلية جديدة غير مدرجة
                  </button>
                </div>
              </div>

              {pharmacyMode === 'existing' ? (
                <div className="space-y-3">
                  {/* Real-time search bar inside directory */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="relative flex-1">
                        <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={pharmacySearchTerm}
                          onChange={(e) => setPharmacySearchTerm(e.target.value)}
                          placeholder={`ابحث في دليل الصيدليات (${livePharmacies.length} صيدلية) بالاسم، الهاتف، الصيدلي أو العنوان...`}
                          className="w-full pl-8 pr-9 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-hidden focus:border-emerald-500 placeholder:text-slate-400"
                        />
                        {pharmacySearchTerm && (
                          <button
                            type="button"
                            onClick={() => setPharmacySearchTerm('')}
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600 shrink-0">
                        <span className="px-2 py-1 rounded bg-white border border-slate-200 text-emerald-700">
                          المعروض: {filteredDirectoryPharmacies.length} من {livePharmacies.length} صيدلية
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowDirectoryCards((prev) => !prev)}
                          className="px-2.5 py-1 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 cursor-pointer transition text-[11px]"
                        >
                          {showDirectoryCards ? 'إخفاء البطاقات' : 'عرض البطاقات'}
                        </button>
                      </div>
                    </div>

                    {/* Quick Dropdown select */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          اختيار مباشر من القائمة المنسدلة:
                        </label>
                        <select
                          value={selectedPharmacyKey}
                          onChange={(e) => handleSelectExistingPharmacy(e.target.value)}
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-hidden focus:border-emerald-500"
                        >
                          <option value="">-- اختر الصيدلية من الدليل ({livePharmacies.length}) --</option>
                          {filteredDirectoryPharmacies.map((pharm) => (
                            <option key={pharm.name} value={pharm.name}>
                              {pharm.name} {pharm.pharmacistName ? `(${pharm.pharmacistName})` : ''}{' '}
                              {pharm.phone ? `- هاتف: ${pharm.phone}` : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          اسم الصيدلية المعتمد للتجهيز:
                        </label>
                        <input
                          type="text"
                          value={pharmacyName}
                          onChange={(e) => setPharmacyName(e.target.value)}
                          placeholder="اسم الصيدلية..."
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-hidden focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    {/* Interactive Directory Cards (Live without reload) */}
                    {showDirectoryCards && (
                      <div className="pt-2 border-t border-slate-200/80">
                        <div className="text-[11px] font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                          <span>دليل الصيدليات المعتمدة للتجهيز السريع:</span>
                          <span className="text-[10px] text-slate-500">انقر على أي صيدلية لاختيارها فوراً</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 sm:max-h-56 overflow-y-auto p-1 bg-white border border-slate-200 rounded-lg">
                          {filteredDirectoryPharmacies.length === 0 ? (
                            <div className="col-span-full py-4 text-center text-xs text-slate-400">
                              لا توجد صيدلية مطابقة للبحث في الدليل.
                            </div>
                          ) : (
                            filteredDirectoryPharmacies.map((pharm) => {
                              const isSelected = selectedPharmacyKey === pharm.name || pharmacyName === pharm.name;
                              return (
                                <button
                                  key={pharm.name}
                                  type="button"
                                  onClick={() => handleSelectExistingPharmacy(pharm.name)}
                                  className={`p-2.5 text-right rounded-lg border transition cursor-pointer flex flex-col justify-between gap-1.5 ${
                                    isSelected
                                      ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                                      : 'bg-slate-50/50 hover:bg-slate-100/80 border-slate-200'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-1">
                                    <span className="font-bold text-xs text-slate-900 truncate">
                                      {pharm.name}
                                    </span>
                                    {isSelected && (
                                      <span className="px-1.5 py-0.2 rounded bg-emerald-600 text-white text-[10px] font-bold shrink-0">
                                        محددة ✓
                                      </span>
                                    )}
                                  </div>

                                  <div className="text-[10px] text-slate-500 space-y-0.5">
                                    {pharm.pharmacistName && (
                                      <div className="truncate">الصيدلي: {pharm.pharmacistName}</div>
                                    )}
                                    {pharm.phone && (
                                      <div className="font-mono text-slate-600 truncate" dir="ltr">
                                        {pharm.phone}
                                      </div>
                                    )}
                                    {pharm.address && (
                                      <div className="truncate text-slate-400">{pharm.address}</div>
                                    )}
                                  </div>

                                  <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-100 text-emerald-700 font-semibold">
                                    <span>{pharm.ordersCount ? `${pharm.ordersCount} طلبية سابقة` : 'صيدلية مسجلة'}</span>
                                    <span className="text-emerald-800 font-bold">اختيار ←</span>
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}

                    {/* Selected Pharmacy Confirmation Badge */}
                    {pharmacyName && (
                      <div className="bg-emerald-50/90 border border-emerald-300 rounded-lg p-2.5 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                          <div className="truncate">
                            <span className="font-black text-emerald-950">الصيدلية المحددة: {pharmacyName}</span>
                            <span className="text-emerald-800 text-[11px] mr-2">
                              ({pharmacistName ? `الصيدلي: ${pharmacistName}` : 'معتمدة بالدليل'}
                              {phone ? ` • هاتف: ${phone}` : ''})
                            </span>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-emerald-200 text-emerald-900 text-[10px] font-bold shrink-0">
                          جاهزة لاستقبال التجهيز
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      اسم الصيدلية * (مطلوب):
                    </label>
                    <input
                      type="text"
                      value={pharmacyName}
                      onChange={(e) => setPharmacyName(e.target.value)}
                      placeholder="مثال: صيدلية الشفاء المركزية"
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      اسم الصيدلي / المستلم:
                    </label>
                    <input
                      type="text"
                      value={pharmacistName}
                      onChange={(e) => setPharmacistName(e.target.value)}
                      placeholder="مثال: د. أحمد التميمي"
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-hidden focus:border-emerald-500"
                    />
                  </div>
                </div>
              )}

              {/* Extra contact details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    رقم الهاتف للتواصل:
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="077XXXXXXXX"
                      className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-medium focus:outline-hidden focus:border-emerald-500"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    العنوان / موقع الصيدلية:
                  </label>
                  <div className="relative">
                    <MapPin className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="المدينة، المنطقة، أقرب نقطة دالة..."
                      className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-hidden focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Dispatch Control & Staff */}
            <div className="pt-4 space-y-3">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <span>إعدادات مسار التجهيز والموظف المسؤول:</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    موظف التجهيز / المحضر:
                  </label>
                  <div className="relative">
                    <User className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={preparedBy}
                      onChange={(e) => setPreparedBy(e.target.value)}
                      placeholder="اسم الموظف المجهز..."
                      className="w-full pl-3 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-hidden focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    حالة الطلبية الأولية:
                  </label>
                  <select
                    value={initialStatus}
                    onChange={(e) => setInitialStatus(e.target.value as OrderStatus)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-hidden focus:border-emerald-500"
                  >
                    <option value="preparing">قيد التجهيز وفحص الصلاحيات (موصى به)</option>
                    <option value="ready">جاهزة للتسليم / تم التجهيز</option>
                    <option value="new">جديدة بانتظار التجهيز</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    ملاحظات التجهيز والشحن:
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="ملاحظات الشحنة..."
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* 3. Product Catalog Selection & Search */}
            <div className="pt-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <PackagePlus className="w-4 h-4 text-emerald-600" />
                  <span>إضافة أدوية ومواد من المخزن إلى الطلبية:</span>
                </label>

                {/* Filter chips */}
                <div className="flex items-center gap-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setProductFilter('all')}
                    className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                      productFilter === 'all'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    كافة المواد
                  </button>
                  <button
                    type="button"
                    onClick={() => setProductFilter('in_stock')}
                    className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                      productFilter === 'in_stock'
                        ? 'bg-emerald-700 text-white font-bold'
                        : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    }`}
                  >
                    المتوفر فقط
                  </button>
                  <button
                    type="button"
                    onClick={() => setProductFilter('with_bonus')}
                    className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                      productFilter === 'with_bonus'
                        ? 'bg-amber-600 text-white font-bold'
                        : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                    }`}
                  >
                    عروض وبونص
                  </button>
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="ابحث بالاسم التجاري، العلمي، الشكل، الوجبة أو الباركود لإضافة المادة..."
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value);
                    setIsSearchingProduct(true);
                  }}
                  onFocus={() => setIsSearchingProduct(true)}
                  className="w-full pl-3 pr-10 py-2.5 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-hidden focus:border-emerald-500 font-medium transition"
                />
                {productSearch && (
                  <button
                    type="button"
                    onClick={() => setProductSearch('')}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Product Candidates Grid / Results */}
              <div className="max-h-64 sm:max-h-72 overflow-y-auto border border-slate-200 rounded-xl bg-slate-50/50 divide-y divide-slate-100 p-1.5 space-y-1">
                {filteredProducts.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">
                    لا توجد مواد مطابقة في المخزن. جرب كلمة بحث أخرى.
                  </div>
                ) : (
                  filteredProducts.map((p) => {
                    const isAdded = items.some((it) => it.productId === p.id);
                    const currentInOrder = items.find((it) => it.productId === p.id);
                    const isOutOfStock = (p.stockQuantity || 0) <= 0;
                    const currentQty = getCandidateQuantity(p.id);

                    return (
                      <div
                        key={p.id}
                        className={`p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border transition ${
                          isAdded
                            ? 'bg-emerald-50/80 border-emerald-300/80 shadow-2xs'
                            : 'bg-white hover:bg-slate-50 border-slate-200/80'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs sm:text-sm text-slate-900 truncate">
                              {p.tradeNameAr}
                            </span>
                            <span className="text-slate-500 text-[11px] font-medium truncate">
                              ({p.tradeNameEn})
                            </span>
                            {p.dosageForm && (
                              <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold">
                                {p.dosageForm} {p.strength}
                              </span>
                            )}
                            {p.bonusPercentage && p.bonusPercentage > 0 && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                                بونص {p.bonusPercentage}%
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 sm:gap-3 text-[11px] text-slate-500 mt-1 flex-wrap">
                            <span>
                              السعر:{' '}
                              <strong className="text-slate-800">
                                {p.wholesalePrice.toLocaleString()} {settings.currency}
                              </strong>
                            </span>
                            <span>•</span>
                            <span>وجبة: {p.batchNumber}</span>
                            <span>•</span>
                            <span>إكسباير: {p.expiryDate}</span>
                            <span>•</span>
                            <span
                              className={`font-bold ${
                                isOutOfStock
                                  ? 'text-rose-600'
                                  : (p.stockQuantity || 0) < 20
                                  ? 'text-amber-700'
                                  : 'text-emerald-700'
                              }`}
                            >
                              المتوفر: {p.stockQuantity || 0} علبة
                            </span>
                          </div>
                        </div>

                        {/* Add / Added Controls with Quantity Selector */}
                        <div className="flex items-center gap-2 shrink-0 justify-end flex-wrap sm:flex-nowrap">
                          {isAdded ? (
                            <div className="flex items-center gap-2 bg-white border border-emerald-300 rounded-xl p-1 shadow-2xs">
                              <div className="flex items-center gap-1 bg-emerald-100 text-emerald-900 rounded-lg px-2 py-1 text-xs font-bold shrink-0">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                                <span>بالقائمة:</span>
                              </div>
                              <div className="inline-flex items-center bg-slate-100 border border-slate-200 rounded-lg p-0.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateItemQuantity(p.id, (currentInOrder?.quantity || 1) - 1)
                                  }
                                  disabled={(currentInOrder?.quantity || 1) <= 1}
                                  className="w-5 h-5 rounded flex items-center justify-center text-slate-600 hover:bg-slate-200 disabled:opacity-25 transition cursor-pointer"
                                  title="تقليل العدد في القائمة"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <input
                                  type="number"
                                  min="1"
                                  value={currentInOrder?.quantity || 1}
                                  onChange={(e) =>
                                    handleUpdateItemQuantity(p.id, parseInt(e.target.value) || 1)
                                  }
                                  className="w-11 text-center text-xs font-mono font-bold bg-transparent border-0 focus:outline-hidden text-emerald-900"
                                  title="الكمية المعتمدة بالقائمة"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateItemQuantity(p.id, (currentInOrder?.quantity || 1) + 1)
                                  }
                                  className="w-5 h-5 rounded flex items-center justify-center text-slate-600 hover:bg-slate-200 transition cursor-pointer"
                                  title="زيادة العدد في القائمة"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                              <span className="text-[11px] text-slate-500 font-bold pl-1">علبة</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              {/* Quantity Selector Before Adding */}
                              <div className="flex items-center gap-1 bg-slate-100/90 border border-slate-300 rounded-xl p-1 shadow-2xs">
                                <span className="text-[11px] font-bold text-slate-600 pr-1 select-none">
                                  العدد:
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setCandidateQuantity(p.id, currentQty - 1)}
                                  disabled={currentQty <= 1}
                                  className="w-5 h-5 rounded bg-white hover:bg-slate-200 disabled:opacity-30 text-slate-700 flex items-center justify-center font-bold text-xs cursor-pointer shadow-2xs transition"
                                  title="تقليل العدد"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <input
                                  type="number"
                                  min="1"
                                  max={p.stockQuantity && p.stockQuantity > 0 ? p.stockQuantity : undefined}
                                  value={currentQty}
                                  onChange={(e) => setCandidateQuantity(p.id, parseInt(e.target.value) || 1)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      if (!isOutOfStock) {
                                        handleAddProduct(p, currentQty);
                                      }
                                    }
                                  }}
                                  className="w-12 text-center text-xs font-mono font-bold text-slate-800 bg-white border border-slate-200 rounded py-0.5 focus:outline-hidden focus:border-emerald-500"
                                  title="حدد عدد العلب المراد إضافتها"
                                />
                                <button
                                  type="button"
                                  onClick={() => setCandidateQuantity(p.id, currentQty + 1)}
                                  className="w-5 h-5 rounded bg-white hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs cursor-pointer shadow-2xs transition"
                                  title="زيادة العدد"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>

                              {/* Add Button with Selected Quantity */}
                              <button
                                type="button"
                                onClick={() => handleAddProduct(p, currentQty)}
                                disabled={isOutOfStock}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer shrink-0"
                                title={`إضافة ${currentQty} علبة مباشرة إلى القائمة`}
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>إضافة ({currentQty}) للتجهيز</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 4. Prepared Items List Table */}
            <div className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <ClipboardList className="w-4 h-4 text-emerald-600" />
                  <span>قائمة المواد المجهزة للشحنة ({items.length} صنف):</span>
                </label>

                {items.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setItems([])}
                    className="text-[11px] text-rose-600 hover:underline font-bold"
                  >
                    تفريغ القائمة
                  </button>
                )}
              </div>

              {items.length === 0 ? (
                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center bg-slate-50/50">
                  <PackagePlus className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-700">لم يتم اختيار مواد للتجهيز بعد</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    ابحث عن الأدوية والمواد في الصندوق أعلاه واضغط «إضافة للتجهيز»
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-right border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                          <th className="p-2.5">#</th>
                          <th className="p-2.5">المادة والمواصفات</th>
                          <th className="p-2.5">الوجبة / الصلاحية</th>
                          <th className="p-2.5">السعر</th>
                          <th className="p-2.5 text-center">الكمية (علبة)</th>
                          <th className="p-2.5 text-center">بونص مجاني</th>
                          <th className="p-2.5">الإجمالي</th>
                          <th className="p-2.5 text-center">حذف</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {items.map((item, idx) => {
                          const product = products.find((p) => p.id === item.productId);
                          const isOverStock =
                            product && (product.stockQuantity || 0) < item.quantity + (item.bonusQuantity || 0);

                          return (
                            <tr key={item.productId} className="hover:bg-slate-50/70 transition">
                              <td className="p-2.5 text-slate-400 font-mono text-[11px]">{idx + 1}</td>

                              <td className="p-2.5">
                                <div className="font-bold text-slate-900">{item.tradeNameAr}</div>
                                <div className="text-[10px] text-slate-500 font-medium">
                                  {item.tradeNameEn} • {item.dosageForm} {item.strength}
                                </div>
                                {isOverStock && (
                                  <div className="text-[10px] text-rose-600 font-bold flex items-center gap-1 mt-0.5">
                                    <AlertTriangle className="w-3 h-3" />
                                    <span>يتجاوز الرصيد المتوفر ({product?.stockQuantity || 0} علبة)</span>
                                  </div>
                                )}
                              </td>

                              <td className="p-2.5 text-[11px] text-slate-600">
                                <div className="font-mono">{item.batchNumber}</div>
                                <div className="text-emerald-700 font-bold">{item.expiryDate}</div>
                              </td>

                              <td className="p-2.5 text-[11px] font-semibold text-slate-800">
                                {item.unitPrice.toLocaleString()} {settings.currency}
                                {item.isBonusMelted && item.meltedUnitPrice && (
                                  <div className="text-[9px] text-amber-700 font-bold">
                                    مذاب: {item.meltedUnitPrice.toLocaleString()}
                                  </div>
                                )}
                              </td>

                              {/* Quantity Control */}
                              <td className="p-2.5 text-center">
                                <div className="inline-flex items-center justify-center gap-1 bg-slate-100 border border-slate-200 rounded-lg p-0.5">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateItemQuantity(item.productId, item.quantity - 1)}
                                    disabled={item.quantity <= 1}
                                    className="w-5 h-5 rounded flex items-center justify-center text-slate-600 hover:bg-slate-200 disabled:opacity-25 transition cursor-pointer"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <input
                                    type="number"
                                    min="1"
                                    value={item.quantity}
                                    onChange={(e) =>
                                      handleUpdateItemQuantity(item.productId, parseInt(e.target.value) || 1)
                                    }
                                    className="w-12 text-center text-xs font-mono font-bold bg-transparent border-0 focus:outline-hidden"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateItemQuantity(item.productId, item.quantity + 1)}
                                    className="w-5 h-5 rounded flex items-center justify-center text-slate-600 hover:bg-slate-200 transition cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                              </td>

                              {/* Bonus Quantity Control */}
                              <td className="p-2.5 text-center">
                                <div className="inline-flex items-center justify-center gap-1 bg-amber-50 border border-amber-200 rounded-lg p-0.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateItemBonus(item.productId, (item.bonusQuantity || 0) - 1)
                                    }
                                    disabled={!item.bonusQuantity || item.bonusQuantity <= 0}
                                    className="w-5 h-5 rounded flex items-center justify-center text-amber-700 hover:bg-amber-100 disabled:opacity-25 transition cursor-pointer"
                                  >
                                    <Minus className="w-2.5 h-2.5" />
                                  </button>
                                  <input
                                    type="number"
                                    min="0"
                                    value={item.bonusQuantity || 0}
                                    onChange={(e) =>
                                      handleUpdateItemBonus(item.productId, parseInt(e.target.value) || 0)
                                    }
                                    className="w-10 text-center text-xs font-mono font-bold text-amber-900 bg-transparent border-0 focus:outline-hidden"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateItemBonus(item.productId, (item.bonusQuantity || 0) + 1)
                                    }
                                    className="w-5 h-5 rounded flex items-center justify-center text-amber-700 hover:bg-amber-100 transition cursor-pointer"
                                  >
                                    <Plus className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              </td>

                              <td className="p-2.5 font-black text-emerald-800 text-xs">
                                {item.totalPrice.toLocaleString()} {settings.currency}
                              </td>

                              <td className="p-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(item.productId)}
                                  className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                  title="حذف من الشحنة"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* 5. Summary Metrics Bar */}
            <div className="pt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                <span className="text-[10px] text-slate-500 font-bold block">أصناف المواد</span>
                <span className="text-base font-black text-slate-900">{items.length} صنف</span>
              </div>

              <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-3 text-center">
                <span className="text-[10px] text-blue-700 font-bold block">إجمالي العلب المطلوبة</span>
                <span className="text-base font-black text-blue-900">{totalQuantity} علبة</span>
              </div>

              <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-3 text-center">
                <span className="text-[10px] text-amber-700 font-bold block">إجمالي البونص المجاني</span>
                <span className="text-base font-black text-amber-900">
                  {totalBonus > 0 ? `+ ${totalBonus} علبة` : 'لا يوجد'}
                </span>
              </div>

              <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3 text-center">
                <span className="text-[10px] text-emerald-700 font-bold block">الإجمالي المالي</span>
                <span className="text-base font-black text-emerald-900">
                  {totalAmount.toLocaleString()} {settings.currency}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        {!createdOrder && (
          <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
            <div className="text-xs text-slate-500 hidden sm:flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>
                {items.length === 0 ? (
                  'اختر صيدلية من الدليل وأضف مادة واحدة على الأقل للتجهيز'
                ) : items.length === 1 ? (
                  <span className="text-emerald-800 font-bold">
                    تمت إضافة صنف واحد — جاهز للاعتماد أو التجهيز المتعدد فوراً
                  </span>
                ) : (
                  <span className="text-emerald-800 font-bold">
                    تمت إضافة {items.length} أصناف — جاهزة للاعتماد والتجهيز
                  </span>
                )}
              </span>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end flex-wrap">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                إلغاء
              </button>

              <button
                type="button"
                onClick={() => handleSaveAndPrepareNext(false)}
                disabled={items.length === 0 || !pharmacyName.trim()}
                className="px-4 py-2.5 bg-teal-700 hover:bg-teal-800 active:bg-teal-900 disabled:opacity-40 disabled:hover:bg-teal-700 text-white rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                title="حفظ هذه الطلبية والانتقال مباشرة لتجهيز طلبية جديدة أخرى دون إغلاق النافذة"
              >
                <Plus className="w-4 h-4" />
                <span>حفظ وتجهيز طلبية أخرى مباشرة (+)</span>
              </button>

              <button
                type="button"
                onClick={() => handleSaveOrder('none')}
                disabled={items.length === 0 || !pharmacyName.trim()}
                className="flex-1 sm:flex-initial px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <PackageCheck className="w-4 h-4" />
                <span>حفظ واعتماد التجهيز ({items.length} صنف)</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
