import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Product, Order, OrderStatus, CartItem, WarehouseSettings, calculateMeltedPrice, AppUser, WarehouseOperation } from './types';
import { storage } from './services/storage';
import { playNewOrderChime, playSuccessChime, playWarningAlertChime } from './services/sound';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { Header } from './components/Header';
import { AuthModal } from './components/AuthModal';
import { PendingApprovalScreen } from './components/PendingApprovalScreen';
import { OfflineIndicator } from './components/OfflineIndicator';
import { computeInventoryAlerts } from './services/alertService';
import type { InventoryFilterType } from './components/InventoryManager';
import { WarehouseDashboard } from './components/WarehouseDashboard';
import { PharmacyPortal } from './components/PharmacyPortal';
import { 
  db,
  subscribeToUser, 
  subscribeToAllUsers, 
  subscribeToAllOrders,
  saveOrderToFirestore,
  deleteOrderFromFirestore,
  deleteOrdersFromFirestore,
  logWarehouseOperation,
  subscribeToWarehouseOperations,
  signOutFirebase 
} from './services/firebase';
import { LayoutDashboard, Boxes, Receipt, Share2, ShoppingBag, Pill, ShieldCheck, UserCheck, PlusCircle, DollarSign, BarChart3, TrendingUp, Menu, X, LogOut, AlertCircle, ArrowRight, Bell, CheckCircle, XCircle, FileText, PackageCheck } from 'lucide-react';

import { InventoryManager } from './components/InventoryManager';
import { AddMaterialsPage } from './components/AddMaterialsPage';
import { FinancialReportsPage } from './components/FinancialReportsPage';
import { ShareLinkModal } from './components/ShareLinkModal';
import { UserApprovalsModal } from './components/UserApprovalsModal';
import { PharmacyOnboardingModal } from './components/PharmacyOnboardingModal';

const ViewLoader = () => (
  <div className="flex flex-col items-center justify-center min-h-[350px] py-16 text-slate-500" dir="rtl">
    <div className="w-10 h-10 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin mb-4" />
    <span className="text-sm font-bold text-slate-700">جاري تحميل الشاشة...</span>
  </div>
);

export type AppView = 'warehouse' | 'pharmacy' | 'inventory' | 'add_materials' | 'financial_reports';

export default function App() {
  const isOnline = useOnlineStatus();

  // Primary data state
  const [products, setProducts] = useState<Product[]>(() => storage.getProducts());
  const [orders, setOrders] = useState<Order[]>(() => storage.getOrders());
  const [settings, setSettings] = useState<WarehouseSettings>(() => storage.getSettings());
  const [cart, setCart] = useState<CartItem[]>([]);
  const [warehouseInitialTab, setWarehouseInitialTab] = useState<OrderStatus | 'all' | 'pharmacies' | 'approved_dispatched'>('new');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Active view and navigation history - defaults to warehouse dashboard for main system
  const [currentView, setCurrentView] = useState<AppView>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const viewParam = params.get('view');
      const pharmacyParam = params.get('pharmacy');
      if (viewParam === 'pharmacy' || pharmacyParam) {
        return 'pharmacy';
      }
      if (viewParam === 'warehouse' || viewParam === 'inventory' || viewParam === 'add_materials' || viewParam === 'financial_reports') {
        return viewParam;
      }
    } catch {
      // ignore
    }
    const user = storage.getCurrentUser();
    if (user?.role === 'pharmacy') {
      return 'pharmacy';
    }
    // Samo Warehouse system defaults to the Warehouse Dashboard
    return 'warehouse';
  });
  const [viewHistory, setViewHistory] = useState<AppView[]>([]);
  const [prefilledPharmacyName, setPrefilledPharmacyName] = useState<string>('');
  // Fast tab switching: keep visited tabs mounted to eliminate render freeze & preserve tab state
  const [visitedViews, setVisitedViews] = useState<Set<AppView>>(() => new Set([currentView]));

  // Mobile sidebar drawer state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  // Switch view with history tracking for Back button
  const navigateToView = useCallback((newView: AppView) => {
    setIsMobileMenuOpen(false);
    setVisitedViews((prev) => {
      if (prev.has(newView)) return prev;
      const updated = new Set(prev);
      updated.add(newView);
      return updated;
    });
    setCurrentView((prev) => {
      if (prev !== newView) {
        setViewHistory((hist) => [...hist, prev]);
      }
      return newView;
    });
  }, []);

  // Back button handler
  const handleGoBack = useCallback(() => {
    setViewHistory((hist) => {
      if (hist.length === 0) {
        setCurrentView('warehouse');
        return [];
      }
      const previous = hist[hist.length - 1];
      setCurrentView(previous);
      return hist.slice(0, -1);
    });
  }, []);

  const getPreviousViewName = (view?: AppView) => {
    if (!view) return '';
    switch (view) {
      case 'warehouse':
        return 'لوحة التحكم والطلبات';
      case 'inventory':
        return 'المخزون والمواد';
      case 'pharmacy':
        return 'بوابة الصيدليات';
      case 'add_materials':
        return 'إضافة المواد والباركود';
      case 'financial_reports':
        return 'التقارير المالية';
      default:
        return 'التبويب السابق';
    }
  };

  // Notifications & Modal State
  const [newOrderAlert, setNewOrderAlert] = useState<Order | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [inventoryInitialFilter, setInventoryInitialFilter] = useState<InventoryFilterType>('all');
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(() => storage.getPendingSyncOrders().length);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Authentication & Access Approvals State
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => storage.getCurrentUser());
  const [registeredUsers, setRegisteredUsers] = useState<AppUser[]>(() => storage.getRegisteredUsers());
  const pendingUsers = useMemo(
    () => registeredUsers.filter((u) => u.status === 'pending' || u.role === 'pending'),
    [registeredUsers]
  );
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isApprovalsModalOpen, setIsApprovalsModalOpen] = useState<boolean>(false);
  const [authModalCustomMessage, setAuthModalCustomMessage] = useState<string>('');
  const [newRegistrationAlert, setNewRegistrationAlert] = useState<AppUser | null>(null);

  // Live Operations & Real-time Staff Activity Stream
  const [operations, setOperations] = useState<WarehouseOperation[]>([]);
  const [liveOperationAlert, setLiveOperationAlert] = useState<WarehouseOperation | null>(null);

  const knownPendingIdsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef<boolean>(true);

  // Synthesized notification chime for new registration requests
  const playPendingNotificationChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const now = ctx.currentTime;
      
      // Tone 1: 587.33 Hz (D5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0.2, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      // Tone 2: 880 Hz (A5)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.12);
      gain2.gain.setValueAtTime(0.25, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.55);
    } catch (e) {
      console.warn('Notification chime warning:', e);
    }
  }, []);

  const isRealPendingUser = useCallback((u?: AppUser | null): boolean => {
    if (!u) return false;
    const id = u.id || '';
    const email = (u.email || u.identifier || '').toLowerCase().trim();
    if (email === 'mohammedjafaralkabi@gmail.com' || id === 'user-super-admin-master' || u.founder) return false;
    if (
      id === 'user-owner' ||
      id === 'user-pharma-demo' ||
      id.startsWith('mock-') ||
      id.startsWith('demo-') ||
      email === 'admin@samo.pharma' ||
      email === 'alishifa@gmail.com'
    ) {
      return false;
    }
    if (storage.isUserDeleted(u.id, u.identifier, u.pharmacyName)) return false;
    if (storage.isAlertHandled(u.id, u.identifier, u.phone, u.email)) return false;
    return u.status === 'pending' || u.role === 'pending';
  }, []);

  // نظام الإشعار الصوتي والبصري للطلبات المعلقة الحقيقية الجديدة فقط
  useEffect(() => {
    if (isInitialLoadRef.current) {
      pendingUsers.forEach((u) => {
        knownPendingIdsRef.current.add(u.id);
        if (u.identifier) knownPendingIdsRef.current.add(u.identifier);
      });
      if (registeredUsers.length > 0) {
        isInitialLoadRef.current = false;
      }
    } else {
      const freshPending = pendingUsers.filter(
        (u) =>
          !knownPendingIdsRef.current.has(u.id) &&
          (!u.identifier || !knownPendingIdsRef.current.has(u.identifier)) &&
          !storage.isAlertHandled(u.id, u.identifier, u.phone, u.email) &&
          isRealPendingUser(u)
      );
      if (freshPending.length > 0) {
        const newest = freshPending[0];
        if (soundEnabled) {
          playPendingNotificationChime();
        }
        setNewRegistrationAlert(newest);
        freshPending.forEach((u) => {
          knownPendingIdsRef.current.add(u.id);
          if (u.identifier) knownPendingIdsRef.current.add(u.identifier);
        });
      }
    }
  }, [pendingUsers, soundEnabled, playPendingNotificationChime, registeredUsers.length, isRealPendingUser]);

  // Compute live alerts for out-of-stock and near-expiry items
  const alerts = useMemo(() => computeInventoryAlerts(products), [products]);

  // Persistent local session bootstrap & live verification
  useEffect(() => {
    const user = storage.getCurrentUser();
    if (user) {
      const sessionCheck = storage.validateSession(user);
      if (!sessionCheck.valid) {
        storage.setCurrentUser(null);
        setCurrentUser(null);
        if (sessionCheck.reason === 'deleted') {
          setAuthModalCustomMessage('تم إنهاء صلاحية وصولك للنظام من قبل إدارة المذخر.');
        }
      } else {
        setCurrentUser(user);
      }
    }
  }, []);

  // Real-time Firestore subscription for the current user's profile updates & immediate ejection if blocked/deleted
  useEffect(() => {
    if (!currentUser?.id) return;
    // Founder / Owner / Passcode users are completely immune to remote ejection
    if (
      currentUser.founder ||
      currentUser.role === 'founder' ||
      currentUser.id === 'founder_admin' ||
      currentUser.id === 'user-super-admin-master' ||
      currentUser.identifier === 'admin2026' ||
      currentUser.identifier === 'staff2026' ||
      currentUser.identifier?.toLowerCase() === 'mohammedjafaralkabi@gmail.com' ||
      (currentUser.email && currentUser.email.toLowerCase() === 'mohammedjafaralkabi@gmail.com')
    ) {
      return;
    }

    const unsubscribe = subscribeToUser(currentUser.id, (liveUser) => {
      // Immediate ejection ONLY if explicitly deleted or blocked in Firestore
      if (liveUser && (liveUser.status === 'blocked' || liveUser.status === 'deleted' || liveUser.status === 'rejected')) {
        storage.setCurrentUser(null);
        setCurrentUser(null);
        setAuthModalCustomMessage('تم إنهاء صلاحية وصولك للنظام من قبل إدارة المذخر.');
        setIsAuthModalOpen(true);
        return;
      }
      if (!liveUser) return;

      setCurrentUser((prev) => {
        if (!prev) return liveUser;
        if (
          prev.role !== liveUser.role ||
          prev.status !== liveUser.status ||
          prev.profileCompleted !== liveUser.profileCompleted ||
          prev.pharmacyName !== liveUser.pharmacyName
        ) {
          storage.setCurrentUser(liveUser);
          return liveUser;
        }
        return prev;
      });
    });
    return () => unsubscribe();
  }, [currentUser?.id, currentUser?.founder, currentUser?.role]);

  // Live synchronization of registered users and approval status from backend server
  const syncServerUsers = useCallback(async (isInitial = false) => {
    try {
      const res = await fetch('/api/auth/users', {
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.users)) {
          const currentRegistered = storage.getRegisteredUsers();
          const userMap = new Map<string, AppUser>();
          // Add server users first (server is the single source of truth)
          data.users.forEach((u: AppUser) => {
            if (u && !storage.isUserDeleted(u.id, u.identifier, u.pharmacyName)) {
              const id = u.id || '';
              const email = (u.email || u.identifier || '').toLowerCase().trim();
              if (
                id !== 'user-owner' &&
                id !== 'user-pharma-demo' &&
                !id.startsWith('mock-') &&
                !id.startsWith('demo-') &&
                email !== 'admin@samo.pharma' &&
                email !== 'alishifa@gmail.com'
              ) {
                userMap.set(u.id, u);
              }
            }
          });

          // Keep any valid user from currentRegistered that is not deleted
          currentRegistered.forEach((u) => {
            if (u && !userMap.has(u.id) && !storage.isUserDeleted(u.id, u.identifier, u.pharmacyName)) {
              userMap.set(u.id, u);
            }
          });
          const merged = Array.from(userMap.values());
          storage.saveRegisteredUsers(merged);
          setRegisteredUsers(merged);

          // Check if there is a newly arrived real pending user for notification
          if (!isInitial) {
            const prevPendingIds = new Set(currentRegistered.filter((u) => isRealPendingUser(u)).map((u) => u.id));
            const newlyPending = merged.find(
              (u) =>
                isRealPendingUser(u) &&
                !prevPendingIds.has(u.id) &&
                !storage.isAlertHandled(u.id, u.identifier, u.phone, u.email)
            );
            if (newlyPending) {
              setNewRegistrationAlert(newlyPending);
              if (soundEnabled) {
                playWarningAlertChime();
              }
            }
          }

          // Seamless direct entry check: If currentUser was pending and now approved on server, upgrade
          const curr = storage.getCurrentUser();
          if (curr && curr.status !== 'approved') {
            const serverMatch = merged.find(
              (u) =>
                (u.id && u.id === curr.id) ||
                (u.identifier && curr.identifier && u.identifier.toLowerCase() === curr.identifier.toLowerCase()) ||
                (u.email && curr.email && u.email.toLowerCase() === curr.email.toLowerCase())
            );
            if (serverMatch && serverMatch.status === 'approved') {
              const updated: AppUser = {
                ...curr,
                ...serverMatch,
                status: 'approved',
                role: serverMatch.role && serverMatch.role !== 'pending' ? serverMatch.role : (curr.role && curr.role !== 'pending' ? curr.role : 'pharmacy'),
              };
              storage.setCurrentUser(updated);
              setCurrentUser(updated);
              if (updated.role === 'pharmacy') {
                setCurrentView('pharmacy');
              }
              if (soundEnabled) {
                playSuccessChime();
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('Failed to sync users from server:', err);
    }
  }, [soundEnabled, isRealPendingUser, playSuccessChime]);

  // Live synchronization of all orders (incoming, preparing, ready, delivered, and dispatched) across all warehouse accounts & devices
  const syncServerOrders = useCallback(async (isInitial = false) => {
    if (!isOnline) return;
    try {
      const res = await fetch('/api/orders', {
        headers: {
          'Cache-Control': 'no-cache',
          ...(currentUser?.id ? { 'x-user-id': currentUser.id } : {}),
          ...(currentUser?.identifier ? { 'x-user-identifier': currentUser.identifier } : {}),
          ...(currentUser?.role ? { 'x-user-role': currentUser.role } : {}),
        },
      });

      if (!res.ok) return;

      const data = await res.json();
      if (!Array.isArray(data.orders)) return;

      const serverList: Order[] = data.orders;

      setOrders((prevOrders) => {
        // If server is completely empty but client has local orders, upload to server
        if (serverList.length === 0 && prevOrders.length > 0) {
          fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pendingOrders: prevOrders }),
          }).catch(() => {});
          return prevOrders;
        }

        const orderMap = new Map<string, Order>();

        // 1. Add server orders (server is source of truth across all devices and accounts)
        serverList.forEach((o) => {
          if (o && o.id && !storage.isOrderDeleted(o.id)) {
            orderMap.set(o.id, o);
          }
        });

        // 2. Preserve and upload any local-only orders that have not yet reached server
        prevOrders.forEach((localOrder) => {
          if (localOrder && localOrder.id && !storage.isOrderDeleted(localOrder.id)) {
            if (!orderMap.has(localOrder.id)) {
              orderMap.set(localOrder.id, localOrder);
              fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...localOrder, mergePending: false }),
              }).catch(() => {});
            } else {
              // Both have the order: select the more progressed or updated status
              const serverOrder = orderMap.get(localOrder.id)!;
              const serverTime = new Date(serverOrder.completedAt || serverOrder.preparedAt || serverOrder.createdAt || 0).getTime();
              const localTime = new Date(localOrder.completedAt || localOrder.preparedAt || localOrder.createdAt || 0).getTime();

              if (localTime > serverTime) {
                orderMap.set(localOrder.id, localOrder);
                fetch(`/api/orders/${localOrder.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(localOrder),
                }).catch(() => {});
              }
            }
          }
        });

        const merged = Array.from(orderMap.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        // Notify if a brand new unhandled incoming order arrived while logged in
        if (!isInitial && prevOrders.length > 0) {
          const prevIdSet = new Set(prevOrders.map((o) => o.id));
          const newlyArrived = merged.find((o) => !prevIdSet.has(o.id) && o.status === 'new');
          if (newlyArrived) {
            setNewOrderAlert(newlyArrived);
            if (soundEnabled) {
              playNewOrderChime();
            }
          }
        }

        storage.saveOrders(merged);
        return merged;
      });
    } catch (err) {
      console.warn('Orders live sync error:', err);
    }
  }, [isOnline, soundEnabled, playNewOrderChime]);

  // Real-time Firestore subscription for all users (for Founder and Warehouse management)
  useEffect(() => {
    const isFounderOrWarehouse =
      !currentUser ||
      currentUser.role === 'founder' ||
      currentUser.founder ||
      currentUser.role === 'warehouse' ||
      currentUser.role === 'owner' ||
      currentUser.role === 'super_admin' ||
      currentUser.role === 'warehouse_manager' ||
      currentUser.role === 'staff' ||
      currentUser.role === 'pharmacist_staff' ||
      currentView === 'warehouse';

    if (!isFounderOrWarehouse) return;

    const unsubscribe = subscribeToAllUsers(
      (liveUsers) => {
        const clean = liveUsers.filter((u) => {
          if (!u) return false;
          const id = u.id || '';
          const email = (u.email || u.identifier || '').toLowerCase().trim();
          if (id === 'user-super-admin-master' || email === 'mohammedjafaralkabi@gmail.com' || u.founder) return true;
          if (
            id === 'user-owner' ||
            id === 'user-pharma-demo' ||
            !id ||
            id.startsWith('mock-') ||
            id.startsWith('demo-') ||
            email === 'admin@samo.pharma' ||
            email === 'alishifa@gmail.com'
          ) {
            return false;
          }
          return !storage.isUserDeleted(u.id, u.identifier, u.pharmacyName);
        });
        setRegisteredUsers(clean);
        storage.saveRegisteredUsers(clean);
      },
      (error) => {
        console.info('Firestore all-users subscription notice:', error?.code || error?.message);
        syncServerUsersRef.current?.(false);
      }
    );
    return () => unsubscribe();
  }, [currentUser?.id, currentUser?.role, currentUser?.founder, currentView]);

  // Real-time Firestore live subscription for all orders across all warehouse employees & accounts
  useEffect(() => {
    const unsubOrders = subscribeToAllOrders(
      (firestoreOrders) => {
        if (!firestoreOrders || firestoreOrders.length === 0) return;
        setOrders((prevOrders) => {
          const orderMap = new Map<string, Order>();
          // 1. Add firestore orders (authoritative cloud sync)
          firestoreOrders.forEach((o) => {
            if (o && o.id && !storage.isOrderDeleted(o.id)) {
              orderMap.set(o.id, o);
            }
          });

          // 2. Preserve any local-only orders that have not yet reached Firestore or have newer local preparation status
          prevOrders.forEach((localOrder) => {
            if (localOrder && localOrder.id && !storage.isOrderDeleted(localOrder.id)) {
              if (!orderMap.has(localOrder.id)) {
                orderMap.set(localOrder.id, localOrder);
                saveOrderToFirestore(localOrder).catch(() => {});
              } else {
                const cloudOrder = orderMap.get(localOrder.id)!;
                const cloudTime = new Date(cloudOrder.completedAt || cloudOrder.preparedAt || (cloudOrder as any).lastUpdatedAt || cloudOrder.createdAt || 0).getTime();
                const localTime = new Date(localOrder.completedAt || localOrder.preparedAt || (localOrder as any).lastUpdatedAt || localOrder.createdAt || 0).getTime();
                // If local order has more advanced preparation status or newer local timestamp, retain it and push to cloud
                const isLocalProgressed = (localOrder.status !== 'new' && cloudOrder.status === 'new') || localTime > cloudTime;
                if (isLocalProgressed) {
                  const mergedOrder: Order = { ...cloudOrder, ...localOrder };
                  orderMap.set(localOrder.id, mergedOrder);
                  saveOrderToFirestore(mergedOrder).catch(() => {});
                }
              }
            }
          });

          const merged = Array.from(orderMap.values()).sort(
            (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
          );
          storage.saveOrders(merged);
          return merged;
        });
      },
      (error) => {
        console.info('Firestore orders subscription notice:', error?.message);
      }
    );

    // Subscribe to warehouse operations stream for real-time employee preparation visibility
    const unsubOps = subscribeToWarehouseOperations(
      (ops) => {
        if (Array.isArray(ops)) {
          setOperations(ops);
        }
      },
      (err) => {
        console.info('Firestore operations subscription notice:', err?.message);
      }
    );

    return () => {
      unsubOrders();
      unsubOps();
    };
  }, []);

  // Sync state to local storage whenever they change
  useEffect(() => {
    storage.saveProducts(products);
  }, [products]);

  useEffect(() => {
    storage.saveOrders(orders);
  }, [orders]);

  // Read URL query params on initial load & enforce deleted user blocking even after changing the link
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const viewParam = params.get('view');
      const pharmacyParam = params.get('pharmacy');
      const cartParam = params.get('cart');

      // Check if current device / profile belongs to a deleted account or deleted pharmacy
      const currentStoredUser = storage.getCurrentUser();
      const savedProfile = storage.getSavedPharmacyProfile();
      const isUserDel = currentStoredUser && (storage.isUserDeleted(currentStoredUser.id, currentStoredUser.identifier, currentStoredUser.pharmacyName) || storage.isPharmacyDeleted(currentStoredUser.pharmacyName));
      const isProfileDel = savedProfile && (storage.isPharmacyDeleted(savedProfile.name) || storage.isUserDeleted(undefined, undefined, savedProfile.name));

      if (isUserDel || isProfileDel) {
        // Strip URL query parameters immediately
        window.history.replaceState({}, '', window.location.pathname);
        setCurrentUser(null);
        storage.setCurrentUser(null);
        storage.clearPharmacyProfile();
        setPrefilledPharmacyName('');
        setCart([]);
        setAuthModalCustomMessage('تم حذف تصريح هذا الحساب نهائياً من قبل إدارة المذخر • تم حظر الوصول إلى السلة والكتالوج حتى بعد تغيير الرابط.');
        setIsAuthModalOpen(true);
        return;
      }

      if (viewParam === 'pharmacy' || pharmacyParam) {
        setCurrentView('pharmacy');
      }

      if (pharmacyParam) {
        const decoded = decodeURIComponent(pharmacyParam).trim();
        if (storage.isPharmacyDeleted(decoded) || storage.isUserDeleted(undefined, undefined, decoded)) {
          window.history.replaceState({}, '', window.location.pathname);
          setPrefilledPharmacyName('');
          setCurrentUser(null);
          storage.setCurrentUser(null);
          storage.clearPharmacyProfile();
          setCart([]);
          setAuthModalCustomMessage('تم حذف تصريح هذه الصيدلية من قبل إدارة المذخر • تم حظر الوصول إلى السلة والكتالوج حتى بعد تغيير الرابط.');
          setIsAuthModalOpen(true);
          return;
        } else {
          setPrefilledPharmacyName(decoded);
        }
      }

      if (cartParam) {
        try {
          const parsed = JSON.parse(decodeURIComponent(cartParam));
          if (Array.isArray(parsed)) {
            const reconstructedCart: CartItem[] = [];
            parsed.forEach((item: { id: string; q: number }) => {
              const p = products.find(prod => prod.id === item.id);
              if (p) {
                const bonus = calculateBonus(p, item.q);
                reconstructedCart.push({
                  productId: p.id,
                  product: p,
                  quantity: item.q,
                  bonusQuantity: bonus,
                  unitPrice: p.wholesalePrice,
                  subtotal: p.wholesalePrice * item.q,
                });
              }
            });
            if (reconstructedCart.length > 0) {
              setCart(reconstructedCart);
            }
          }
        } catch (e) {
          console.error('Error parsing cart param:', e);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Validate active session against security rules (PIN version, user deletion)
  const verifyCurrentSession = useCallback(() => {
    const user = storage.getCurrentUser();
    if (!user) return;
    const sessionCheck = storage.validateSession(user);
    if (!sessionCheck.valid) {
      setCurrentUser(null);
      storage.setCurrentUser(null);
      if (sessionCheck.reason === 'deleted') {
        storage.clearPharmacyProfile();
        setCart([]);
        setAuthModalCustomMessage('تم حذف وإلغاء تصريح هذا الحساب من قبل إدارة المذخر • تم حظر الوصول إلى السلة والكتالوج.');
      } else if (sessionCheck.reason === 'pin_changed') {
        setAuthModalCustomMessage('تم تغيير رمز المرور السري المركزي للمذخر • تم إبطال الجلسة ويجب إدخال الرمز الجديد للمتابعة كصاحب متجر.');
      } else if (sessionCheck.reason === 'unapproved') {
        setAuthModalCustomMessage('حسابك قيد المراجعة أو تم تجميد تصريحه من قبل صاحب المذخر.');
      }
      setIsAuthModalOpen(true);
    }
  }, []);

  // Validate on mount, tab focus, and storage changes
  useEffect(() => {
    verifyCurrentSession();
    const handleFocus = () => verifyCurrentSession();
    const handleStorage = () => verifyCurrentSession();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        verifyCurrentSession();
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [verifyCurrentSession]);

  // Seamless direct entry check: Verify if pending or link-opening user was approved on server so they enter directly
  useEffect(() => {
    const checkLiveApproval = async () => {
      const user = storage.getCurrentUser();
      if (!user || user.founder || user.id === 'user-super-admin-master') return;

      try {
        const queryParams = new URLSearchParams();
        if (user.id) queryParams.set('id', user.id);
        if (user.identifier) queryParams.set('identifier', user.identifier);
        if (user.email) queryParams.set('email', user.email);

        const res = await fetch(`/api/auth/status?${queryParams.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (data.found && data.user) {
            const serverUser: AppUser = data.user;
            if (serverUser.status === 'approved' && user.status !== 'approved') {
              const updated: AppUser = {
                ...user,
                ...serverUser,
                status: 'approved',
                role: serverUser.role && serverUser.role !== 'pending' ? serverUser.role : (user.role && user.role !== 'pending' ? user.role : 'pharmacy'),
              };
              storage.setCurrentUser(updated);
              setCurrentUser(updated);
              if (updated.role === 'pharmacy') {
                setCurrentView('pharmacy');
              }
              if (soundEnabled) {
                playSuccessChime();
              }
            } else if (serverUser.status === 'approved' && user.status === 'approved') {
              if (serverUser.role && serverUser.role !== user.role && serverUser.role !== 'pending') {
                const updated: AppUser = { ...user, role: serverUser.role };
                storage.setCurrentUser(updated);
                setCurrentUser(updated);
              }
            }
          }
        }
      } catch (e) {
        console.warn('Live approval verification error:', e);
      }
    };

    checkLiveApproval();
  }, [soundEnabled, playSuccessChime]);

  // Stable refs for sync functions to prevent background polling restart loops
  const syncServerUsersRef = useRef(syncServerUsers);
  syncServerUsersRef.current = syncServerUsers;
  const syncServerOrdersRef = useRef(syncServerOrders);
  syncServerOrdersRef.current = syncServerOrders;

  // Initial user and orders sync and background polling interval across all devices
  useEffect(() => {
    if (!isOnline) return;

    // Run immediately on load
    syncServerUsersRef.current(true);
    syncServerOrdersRef.current(true);

    // Efficient background polling interval to keep all warehouse accounts completely synchronized
    const pollInterval = setInterval(() => {
      syncServerUsersRef.current(false);
      syncServerOrdersRef.current(false);
    }, 8000);

    // Also trigger on window focus and screen wake
    const handleFocusSync = () => {
      if (document.visibilityState === 'visible') {
        syncServerUsersRef.current(false);
        syncServerOrdersRef.current(false);
      }
    };
    window.addEventListener('focus', handleFocusSync);
    document.addEventListener('visibilitychange', handleFocusSync);

    return () => {
      clearInterval(pollInterval);
      window.removeEventListener('focus', handleFocusSync);
      document.removeEventListener('visibilitychange', handleFocusSync);
    };
  }, [isOnline]);

  // Sync orders whenever logged-in user changes
  useEffect(() => {
    if (currentUser) {
      syncServerOrdersRef.current(false);
    }
  }, [currentUser?.id]);

  // Setup Server-Sent Events (SSE) for live order notifications across tabs & devices
  useEffect(() => {
    if (!isOnline) return;

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/events');

      eventSource.addEventListener('new_order', (e) => {
        try {
          const incomingOrder: Order = JSON.parse(e.data);
          setOrders((prev) => {
            if (prev.some((o) => o.id === incomingOrder.id)) return prev;
            return [incomingOrder, ...prev];
          });

          // Play audio chime and display visual alert banner
          if (soundEnabled) {
            playNewOrderChime();
          }
          setNewOrderAlert(incomingOrder);
        } catch (err) {
          console.error('Error parsing SSE new_order:', err);
        }
      });

      // User registration & approval SSE listeners
      eventSource.addEventListener('new_user_registration', (e) => {
        try {
          const incomingUser: AppUser = JSON.parse(e.data);
          setRegisteredUsers((prev) => {
            const exists = prev.some((u) => u.id === incomingUser.id);
            const updated = exists ? prev.map(u => u.id === incomingUser.id ? incomingUser : u) : [incomingUser, ...prev];
            storage.saveRegisteredUsers(updated);
            return updated;
          });
          if (
            incomingUser.status === 'pending' &&
            !storage.isAlertHandled(incomingUser.id, incomingUser.identifier, incomingUser.phone, incomingUser.email)
          ) {
            setNewRegistrationAlert(incomingUser);
            if (soundEnabled) {
              playWarningAlertChime();
            }
          }
        } catch {}
      });

      eventSource.addEventListener('user_updated', (e) => {
        try {
          const updatedUser: AppUser = JSON.parse(e.data);
          setRegisteredUsers((prev) => {
            const exists = prev.some((u) => u.id === updatedUser.id);
            const updated = exists ? prev.map(u => u.id === updatedUser.id ? updatedUser : u) : [updatedUser, ...prev];
            storage.saveRegisteredUsers(updated);
            return updated;
          });
          if (
            updatedUser.status === 'pending' &&
            !storage.isAlertHandled(updatedUser.id, updatedUser.identifier, updatedUser.phone, updatedUser.email)
          ) {
            setNewRegistrationAlert(updatedUser);
            if (soundEnabled) {
              playWarningAlertChime();
            }
          } else {
            // Dismiss alert if this updated user is no longer pending
            storage.markAlertHandled(updatedUser.id, updatedUser.identifier, updatedUser.phone, updatedUser.email);
            setNewRegistrationAlert((curr) => {
              if (!curr) return null;
              if (
                curr.id === updatedUser.id ||
                (curr.identifier && updatedUser.identifier && curr.identifier.toLowerCase() === updatedUser.identifier.toLowerCase()) ||
                (curr.phone && updatedUser.phone && curr.phone === updatedUser.phone) ||
                (curr.email && updatedUser.email && curr.email.toLowerCase() === updatedUser.email.toLowerCase())
              ) {
                return null;
              }
              return curr;
            });
          }

          if (updatedUser.status === 'approved') {
            setCurrentUser((curr) => {
              if (
                curr &&
                (curr.id === updatedUser.id ||
                  (curr.identifier && updatedUser.identifier && curr.identifier.toLowerCase() === updatedUser.identifier.toLowerCase()) ||
                  (curr.email && updatedUser.email && curr.email.toLowerCase() === updatedUser.email.toLowerCase()))
              ) {
                storage.setCurrentUser(updatedUser);
                if (updatedUser.role === 'pharmacy') {
                  setCurrentView('pharmacy');
                }
                if (soundEnabled) {
                  playSuccessChime();
                }
                return updatedUser;
              }
              return curr;
            });
          }
        } catch {}
      });

      eventSource.addEventListener('user_approved', (e) => {
        try {
          const approvedUser: AppUser = JSON.parse(e.data);
          storage.markAlertHandled(approvedUser.id, approvedUser.identifier, approvedUser.phone, approvedUser.email);
          setNewRegistrationAlert((curr) => {
            if (!curr) return null;
            if (
              curr.id === approvedUser.id ||
              (curr.identifier && approvedUser.identifier && curr.identifier.toLowerCase() === approvedUser.identifier.toLowerCase()) ||
              (curr.phone && approvedUser.phone && curr.phone === approvedUser.phone) ||
              (curr.email && approvedUser.email && curr.email.toLowerCase() === approvedUser.email.toLowerCase())
            ) {
              return null;
            }
            return curr;
          });
          setRegisteredUsers((prev) => {
            const updated = prev.map((u) => (u.id === approvedUser.id ? approvedUser : u));
            storage.saveRegisteredUsers(updated);
            return updated;
          });
          // Dispatch window event for modal listeners
          window.dispatchEvent(new MessageEvent('sse_user_approved', { data: e.data }));
          // If current logged-in user was approved, seamlessly transition immediately
          setCurrentUser((curr) => {
            if (
              curr &&
              (curr.id === approvedUser.id ||
                (curr.identifier && approvedUser.identifier && curr.identifier.toLowerCase() === approvedUser.identifier.toLowerCase()) ||
                (curr.email && approvedUser.email && curr.email.toLowerCase() === approvedUser.email.toLowerCase()))
            ) {
              storage.setCurrentUser(approvedUser);
              if (approvedUser.role === 'pharmacy') {
                setCurrentView('pharmacy');
              }
              if (soundEnabled) {
                playSuccessChime();
              }
              return approvedUser;
            }
            return curr;
          });
        } catch {}
      });

      eventSource.addEventListener('user_rejected', (e) => {
        try {
          const rejectedUser: AppUser = JSON.parse(e.data);
          storage.markAlertHandled(rejectedUser.id, rejectedUser.identifier, rejectedUser.phone, rejectedUser.email);
          setNewRegistrationAlert((curr) => {
            if (!curr) return null;
            if (
              curr.id === rejectedUser.id ||
              (curr.identifier && rejectedUser.identifier && rejectedUser.identifier.toLowerCase() === rejectedUser.identifier.toLowerCase()) ||
              (curr.phone && rejectedUser.phone && curr.phone === rejectedUser.phone) ||
              (curr.email && rejectedUser.email && curr.email.toLowerCase() === rejectedUser.email.toLowerCase())
            ) {
              return null;
            }
            return curr;
          });
          setRegisteredUsers((prev) => {
            const updated = prev.map((u) => (u.id === rejectedUser.id ? rejectedUser : u));
            storage.saveRegisteredUsers(updated);
            return updated;
          });
        } catch {}
      });

      eventSource.addEventListener('pin_invalidated', (e) => {
        try {
          const { version } = JSON.parse(e.data);
          if (version) {
            storage.setOwnerPasscodeVersion(version);
          }
          setCurrentUser((curr) => {
            if (curr && (curr.role === 'owner' || curr.role === 'super_admin')) {
              if (!curr.passcodeVersion || curr.passcodeVersion < version) {
                storage.setCurrentUser(null);
                setAuthModalCustomMessage('تم تغيير رمز المرور السري المركزي للمذخر • تم إبطال الجلسة ويجب إدخال الرمز الجديد للمتابعة كصاحب متجر.');
                setIsAuthModalOpen(true);
                return null;
              }
            }
            return curr;
          });
        } catch {}
      });

      eventSource.addEventListener('user_deleted', (e) => {
        try {
          const { id, identifier, pharmacyName } = JSON.parse(e.data);
          storage.recordDeletedUser(id, identifier, pharmacyName);
          setRegisteredUsers((prev) => {
            const updated = prev.filter((u) => u.id !== id && (!identifier || u.identifier !== identifier));
            storage.saveRegisteredUsers(updated);
            return updated;
          });
          setCurrentUser((curr) => {
            if (curr) {
              const matchesId = curr.id === id;
              const matchesIdent = identifier && curr.identifier.toLowerCase() === String(identifier).toLowerCase();
              const matchesPharm = pharmacyName && curr.pharmacyName && curr.pharmacyName.toLowerCase() === String(pharmacyName).toLowerCase();
              if (matchesId || matchesIdent || matchesPharm) {
                storage.setCurrentUser(null);
                storage.clearPharmacyProfile();
                setCart([]);
                setAuthModalCustomMessage('تم حذف وإلغاء تصريح هذا الحساب من قبل إدارة المذخر • تم حظر الوصول إلى السلة والكتالوج حتى بعد تغيير الرابط.');
                setIsAuthModalOpen(true);
                return null;
              }
            }
            return curr;
          });
        } catch {}
      });

      eventSource.addEventListener('order_updated', (e) => {
        try {
          const updated: Order = JSON.parse(e.data);
          setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
          if (updated.status !== 'new') {
            setNewOrderAlert((curr) => (curr && curr.id === updated.id ? null : curr));
          }
        } catch {
          // ignore
        }
      });

      eventSource.addEventListener('product_updated', (e) => {
        try {
          const updated: Product = JSON.parse(e.data);
          setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        } catch {
          // ignore
        }
      });

      eventSource.addEventListener('order_deleted', (e) => {
        try {
          const { id } = JSON.parse(e.data);
          setOrders((prev) => prev.filter((o) => o.id !== id));
          setNewOrderAlert((curr) => (curr && curr.id === id ? null : curr));
        } catch {
          // ignore
        }
      });

      eventSource.addEventListener('orders_bulk_deleted', (e) => {
        try {
          const { ids } = JSON.parse(e.data);
          if (Array.isArray(ids) && ids.length > 0) {
            const idSet = new Set(ids);
            storage.deleteOrders(ids);
            setOrders((prev) => prev.filter((o) => !idSet.has(o.id)));
            setNewOrderAlert((curr) => (curr && idSet.has(curr.id) ? null : curr));
          }
        } catch {
          // ignore
        }
      });

      eventSource.addEventListener('pharmacy_deleted', (e) => {
        try {
          const { name, deleteOrders, deletedUsers } = JSON.parse(e.data);
          if (name) {
            storage.deletePharmacy(name, deleteOrders);
          }
          if (deleteOrders) {
            setOrders((prev) =>
              prev.filter((o) => o.pharmacyName.trim().toLowerCase() !== String(name).trim().toLowerCase())
            );
          }
          setCurrentUser((curr) => {
            if (curr && curr.pharmacyName && curr.pharmacyName.trim().toLowerCase() === String(name).trim().toLowerCase()) {
              storage.setCurrentUser(null);
              storage.clearPharmacyProfile();
              setCart([]);
              setAuthModalCustomMessage('تم حذف تصريح هذه الصيدلية من قبل إدارة المذخر • تم حظر الوصول إلى السلة والكتالوج.');
              setIsAuthModalOpen(true);
              return null;
            }
            return curr;
          });
        } catch {
          // ignore
        }
      });
    } catch {
      // SSE not supported or offline
    }

    return () => {
      eventSource?.close();
    };
  }, [isOnline, soundEnabled]);

  // Sync offline queue when back online
  const handleSyncPendingOrders = useCallback(async () => {
    if (!isOnline) return;
    const queue = storage.getPendingSyncOrders();
    if (queue.length === 0) return;

    setIsSyncing(true);
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingOrders: queue }),
      });
      if (res.ok) {
        storage.clearPendingSyncOrders();
        setPendingSyncCount(0);
        // Mark orders in state as synced
        setOrders((prev) =>
          prev.map((o) => (queue.some((q) => q.id === o.id) ? { ...o, synced: true } : o))
        );
        playSuccessChime();
      }
    } catch (err) {
      console.error('Failed to sync offline orders:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline]);

  // Auto-trigger sync on reconnect
  useEffect(() => {
    if (isOnline) {
      handleSyncPendingOrders();
    }
  }, [isOnline, handleSyncPendingOrders]);

  // Helper: calculate free bonus units
  function calculateBonus(product: Product, quantity: number): number {
    if (!product.bonusBuyQuantity || !product.bonusFreeQuantity || product.bonusBuyQuantity <= 0) {
      return 0;
    }
    const eligibleMultiplier = Math.floor(quantity / product.bonusBuyQuantity);
    return eligibleMultiplier * product.bonusFreeQuantity;
  }

  // Cart operations with bonus melting support
  const handleAddToCart = (product: Product, quantity = 1) => {
    const hasBonusMelting = Boolean(product.bonusPercentage && product.bonusPercentage > 0);
    const effectivePrice = hasBonusMelting
      ? calculateMeltedPrice(product.wholesalePrice, product.bonusPercentage!)
      : product.wholesalePrice;

    setCart((prev) => {
      const existingIndex = prev.findIndex((item) => item.productId === product.id);
      if (existingIndex > -1) {
        const item = prev[existingIndex];
        const newQty = item.quantity + quantity;
        const bonus = hasBonusMelting ? 0 : calculateBonus(product, newQty);
        const updated = [...prev];
        updated[existingIndex] = {
          ...item,
          quantity: newQty,
          bonusQuantity: bonus,
          bonusPercentage: product.bonusPercentage,
          meltedUnitPrice: hasBonusMelting ? effectivePrice : undefined,
          isBonusMelted: hasBonusMelting,
          subtotal: newQty * effectivePrice,
        };
        return updated;
      } else {
        const bonus = hasBonusMelting ? 0 : calculateBonus(product, quantity);
        return [
          ...prev,
          {
            productId: product.id,
            product,
            quantity,
            bonusQuantity: bonus,
            bonusPercentage: product.bonusPercentage,
            meltedUnitPrice: hasBonusMelting ? effectivePrice : undefined,
            isBonusMelted: hasBonusMelting,
            unitPrice: product.wholesalePrice,
            subtotal: quantity * effectivePrice,
          },
        ];
      }
    });
  };

  const handleUpdateCartQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveFromCart(productId);
      return;
    }
    setCart((prev) =>
      prev.map((item) => {
        if (item.productId === productId) {
          const hasBonusMelting = Boolean(item.product.bonusPercentage && item.product.bonusPercentage > 0);
          const effectivePrice = hasBonusMelting
            ? (item.meltedUnitPrice || calculateMeltedPrice(item.unitPrice, item.product.bonusPercentage!))
            : item.unitPrice;
          const bonus = hasBonusMelting ? 0 : calculateBonus(item.product, quantity);
          return {
            ...item,
            quantity,
            bonusQuantity: bonus,
            subtotal: quantity * effectivePrice,
          };
        }
        return item;
      })
    );
  };

  const handleRemoveFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  const handleClearCart = () => {
    setCart([]);
  };

  // Submit Order from Pharmacy Portal
  const handleSubmitOrder = async (pharmacyData: {
    pharmacyName: string;
    pharmacistName: string;
    phone: string;
    address: string;
    notes: string;
  }): Promise<Order> => {
    // Save pharmacy profile for next time
    storage.savePharmacyProfile({
      name: pharmacyData.pharmacyName,
      pharmacist: pharmacyData.pharmacistName,
      phone: pharmacyData.phone,
      address: pharmacyData.address,
    });

    const totalQuantity = cart.reduce((sum, i) => sum + i.quantity, 0);
    const totalBonus = cart.reduce((sum, i) => sum + i.bonusQuantity, 0);
    const totalAmount = cart.reduce((sum, i) => sum + i.subtotal, 0);

    const placedOrder = storage.createOrMergeOrder({
      pharmacyName: pharmacyData.pharmacyName,
      pharmacistName: pharmacyData.pharmacistName,
      phone: pharmacyData.phone,
      address: pharmacyData.address,
      notes: pharmacyData.notes,
      items: cart.map((c) => ({
        productId: c.productId,
        tradeNameAr: c.product.tradeNameAr,
        tradeNameEn: c.product.tradeNameEn,
        dosageForm: c.product.dosageForm,
        strength: c.product.strength,
        batchNumber: c.product.batchNumber,
        expiryDate: c.product.expiryDate,
        quantity: c.quantity,
        bonusQuantity: c.bonusQuantity,
        unitPrice: c.unitPrice,
        bonusPercentage: c.bonusPercentage || c.product.bonusPercentage,
        meltedUnitPrice: c.meltedUnitPrice || (c.product.bonusPercentage ? calculateMeltedPrice(c.unitPrice, c.product.bonusPercentage) : undefined),
        isBonusMelted: Boolean(c.isBonusMelted || (c.product.bonusPercentage && c.product.bonusPercentage > 0)),
        totalPrice: c.subtotal,
        verified: false,
      })),
      totalQuantity,
      totalBonus,
      totalAmount,
      source: 'online_link',
      synced: isOnline,
    });

    // Update state & storage
    setOrders((prev) => {
      const exists = prev.some((o) => o.id === placedOrder.id);
      if (exists) {
        return prev.map((o) => (o.id === placedOrder.id ? placedOrder : o));
      }
      return [placedOrder, ...prev];
    });

    // Play warehouse notification chime
    if (soundEnabled) {
      playNewOrderChime();
    }
    setNewOrderAlert(placedOrder);

    // If online: post to server
    if (isOnline) {
      try {
        await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(placedOrder),
        });
      } catch (err) {
        console.warn('Network post failed, queuing for sync:', err);
        storage.addPendingSyncOrder(placedOrder);
        setPendingSyncCount((prev) => prev + 1);
      }
    } else {
      // Offline mode
      storage.addPendingSyncOrder(placedOrder);
      setPendingSyncCount((prev) => prev + 1);
    }

    // Deduct stock for ordered quantities
    setProducts((prev) =>
      prev.map((p) => {
        const cartMatch = cart.find((c) => c.productId === p.id);
        if (cartMatch) {
          const totalDeducted = cartMatch.quantity + cartMatch.bonusQuantity;
          return {
            ...p,
            stockQuantity: Math.max(0, p.stockQuantity - totalDeducted),
          };
        }
        return p;
      })
    );

    return placedOrder;
  };

  // Warehouse status update
  const handleUpdateOrderStatus = (orderId: string, status: OrderStatus, rejectionReason?: string) => {
    const nowIso = new Date().toISOString();
    let updatedOrderObj: Order | null = null;

    setOrders((prev) => {
      const updated = prev.map((o) => {
        if (o.id === orderId) {
          const mod: Order = {
            ...o,
            status,
            rejectionReason: rejectionReason || o.rejectionReason,
            preparedAt: (status === 'ready' || status === 'preparing') ? nowIso : (o.preparedAt || nowIso),
            completedAt: status === 'delivered' ? (o.completedAt || nowIso) : o.completedAt,
            lastUpdatedAt: nowIso,
          };
          updatedOrderObj = mod;
          return mod;
        }
        return o;
      });
      storage.saveOrders(updated);
      return updated;
    });

    if (newOrderAlert && newOrderAlert.id === orderId) {
      setNewOrderAlert(null);
    }

    if (updatedOrderObj) {
      const targetOrder = updatedOrderObj as Order;
      // Persist directly to Firestore so all devices see the updated preparation state
      saveOrderToFirestore(targetOrder).catch((err) => console.warn('Firestore order status save error:', err));
      logWarehouseOperation({
        type: 'status_changed',
        actionTitle: status === 'ready' ? 'اكتمال تجهيز الطلبية' : status === 'delivered' ? 'تسليم الطلبية للصيدلية' : 'تحديث مسار الطلب',
        details: `تم تغيير حالة طلبية ${targetOrder.pharmacyName} (${targetOrder.orderNumber}) إلى "${status === 'ready' ? 'جاهزة للتسليم' : status === 'delivered' ? 'تم التسليم' : status === 'preparing' ? 'قيد التجهيز' : status}"`,
        orderId: targetOrder.id,
        orderNumber: targetOrder.orderNumber,
        pharmacyName: targetOrder.pharmacyName,
        performedBy: currentUser?.name || currentUser?.role || 'كادر المذخر',
        targetStatus: status,
        status: status,
        itemsCount: targetOrder.items?.length || 0,
        totalQuantity: targetOrder.totalQuantity || targetOrder.items?.reduce((s, i) => s + (i.quantity || 0) + (i.bonusQuantity || 0), 0) || 0,
        totalAmount: targetOrder.totalAmount,
        items: targetOrder.items || [],
      }).catch(() => {});
    }

    if (isOnline) {
      fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status, 
          rejectionReason,
          completedAt: status === 'delivered' ? nowIso : undefined,
          preparedAt: (status === 'ready' || status === 'preparing') ? nowIso : undefined
        }),
      }).catch(() => {});
    }
  };

  // Warehouse order preparation & expiry confirmation
  const handleUpdateOrderVerification = (
    orderId: string,
    updatedItems: Order['items'],
    status?: OrderStatus,
    preparedBy?: string
  ) => {
    const nowIso = new Date().toISOString();
    let updatedOrderObj: Order | null = null;

    setOrders((prev) => {
      const updated = prev.map((o) => {
        if (o.id === orderId) {
          const mod: Order = {
            ...o,
            items: updatedItems,
            status: status || o.status,
            preparedBy: preparedBy || o.preparedBy || currentUser?.name || 'كادر التجهيز',
            preparedAt: nowIso,
            completedAt: status === 'delivered' ? (o.completedAt || nowIso) : o.completedAt,
            lastUpdatedAt: nowIso,
          };
          updatedOrderObj = mod;
          return mod;
        }
        return o;
      });
      storage.saveOrders(updated);
      return updated;
    });

    if (newOrderAlert && newOrderAlert.id === orderId) {
      setNewOrderAlert(null);
    }

    playSuccessChime();

    if (updatedOrderObj) {
      const targetOrder = updatedOrderObj as Order;
      // Persist directly to Firestore for immediate sync to founder and all colleagues
      saveOrderToFirestore(targetOrder).catch((err) => console.warn('Firestore preparation save error:', err));
      logWarehouseOperation({
        type: 'order_prepared',
        actionTitle: 'تجهيز وفحص صلاحيات الطلبية',
        details: `قام ${targetOrder.preparedBy} بتجهيز ومطابقة وجبات طلبية ${targetOrder.pharmacyName} (${targetOrder.orderNumber})`,
        orderId: targetOrder.id,
        orderNumber: targetOrder.orderNumber,
        pharmacyName: targetOrder.pharmacyName,
        performedBy: targetOrder.preparedBy || currentUser?.name || 'كادر التجهيز',
        targetStatus: targetOrder.status,
        status: targetOrder.status,
        itemsCount: targetOrder.items?.length || 0,
        totalQuantity: targetOrder.totalQuantity || targetOrder.items?.reduce((s, i) => s + (i.quantity || 0) + (i.bonusQuantity || 0), 0) || 0,
        totalAmount: targetOrder.totalAmount,
        items: targetOrder.items || [],
      }).catch(() => {});
    }

    if (isOnline) {
      fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: updatedItems,
          status: status,
          preparedBy: preparedBy || currentUser?.name,
          preparedAt: (status === 'ready' || status === 'preparing') ? nowIso : undefined,
          completedAt: status === 'delivered' ? nowIso : undefined,
        }),
      }).catch(() => {});
    }
  };

  // Warehouse direct order edit (quantities, bonus, items, totals)
  const handleUpdateOrder = (updatedOrder: Order) => {
    setOrders((prev) => {
      const updated = prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o));
      storage.saveOrders(updated);
      return updated;
    });

    if (newOrderAlert && newOrderAlert.id === updatedOrder.id) {
      setNewOrderAlert(null);
    }

    playSuccessChime();

    // Persist to Firestore and log operation
    saveOrderToFirestore(updatedOrder).catch((err) => console.warn('Firestore update order error:', err));
    logWarehouseOperation({
      type: 'order_edited',
      actionTitle: 'تعديل كميات وبونص الطلبية',
      details: `تم تعديل أصناف أو كميات طلبية ${updatedOrder.pharmacyName} (${updatedOrder.orderNumber}) بواسطة ${currentUser?.name || 'كادر المذخر'}`,
      orderId: updatedOrder.id,
      orderNumber: updatedOrder.orderNumber,
      pharmacyName: updatedOrder.pharmacyName,
      performedBy: currentUser?.name || 'كادر المذخر',
      status: updatedOrder.status,
      itemsCount: updatedOrder.items?.length || 0,
      totalQuantity: updatedOrder.totalQuantity || updatedOrder.items?.reduce((s, i) => s + (i.quantity || 0) + (i.bonusQuantity || 0), 0) || 0,
      totalAmount: updatedOrder.totalAmount,
      items: updatedOrder.items || [],
    }).catch(() => {});

    if (isOnline) {
      fetch(`/api/orders/${updatedOrder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedOrder),
      }).catch(() => {});
    }
  };

  // Warehouse direct dispatch order (created directly by warehouse employee for pharmacy)
  const handleAddDirectOrder = (newOrder: Order) => {
    const nowIso = new Date().toISOString();
    const stampedOrder: Order = {
      ...newOrder,
      preparedAt: newOrder.preparedAt || nowIso,
      preparedBy: newOrder.preparedBy || currentUser?.name || 'كادر المذخر',
      completedAt: newOrder.status === 'delivered' ? (newOrder.completedAt || nowIso) : newOrder.completedAt,
    };
    setOrders((prev) => [stampedOrder, ...prev.filter((o) => o.id !== stampedOrder.id)]);
    storage.addOrder(stampedOrder);
    playSuccessChime();

    // Persist to Firestore immediately so all accounts see this direct dispatch instantly
    saveOrderToFirestore(stampedOrder).catch((err) => console.warn('Firestore add direct order error:', err));
    logWarehouseOperation({
      type: 'order_created',
      actionTitle: 'إنشاء وتجهيز طلبية مباشرة',
      details: `تم إنشاء وتجهيز طلبية مباشرة لـ "${stampedOrder.pharmacyName}" (${stampedOrder.orderNumber}) بمبلغ ${(stampedOrder.totalAmount ?? 0).toLocaleString()} د.ع بواسطة ${currentUser?.name || 'كادر المذخر'}`,
      orderId: stampedOrder.id,
      orderNumber: stampedOrder.orderNumber,
      pharmacyName: stampedOrder.pharmacyName,
      performedBy: currentUser?.name || 'كادر المذخر',
      targetStatus: stampedOrder.status,
      status: stampedOrder.status,
      itemsCount: stampedOrder.items?.length || 0,
      totalQuantity: stampedOrder.totalQuantity || stampedOrder.items?.reduce((s, i) => s + (i.quantity || 0) + (i.bonusQuantity || 0), 0) || 0,
      totalAmount: stampedOrder.totalAmount,
      items: stampedOrder.items || [],
    }).catch(() => {});

    if (isOnline) {
      fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...stampedOrder, mergePending: false }),
      }).catch(() => {});
    }
  };

  // Delete Order with persistence and real-time backend sync
  const handleDeleteOrder = async (orderId: string) => {
    const target = orders.find((o) => o.id === orderId);
    storage.deleteOrder(orderId);
    if (newOrderAlert && newOrderAlert.id === orderId) {
      setNewOrderAlert(null);
    }
    // Delete from Firestore
    deleteOrderFromFirestore(orderId).catch(() => {});
    if (target) {
      logWarehouseOperation({
        type: 'order_deleted',
        actionTitle: 'حذف طلبية',
        details: `تم حذف طلبية ${target.pharmacyName} (${target.orderNumber}) بواسطة ${currentUser?.name || 'كادر المذخر'}`,
        orderId: target.id,
        orderNumber: target.orderNumber,
        pharmacyName: target.pharmacyName,
        performedBy: currentUser?.name || 'كادر المذخر',
      }).catch(() => {});
    }

    if (isOnline) {
      try {
        await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });
      } catch (err) {
        console.warn('Backend delete order failed:', err);
      }
    }
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
  };

  // Delete Orders in bulk (e.g. all pending orders)
  const handleDeleteOrdersBulk = async (orderIds: string[]) => {
    if (!orderIds || orderIds.length === 0) return;
    const idSet = new Set(orderIds);
    storage.deleteOrders(orderIds);
    if (newOrderAlert && idSet.has(newOrderAlert.id)) {
      setNewOrderAlert(null);
    }
    deleteOrdersFromFirestore(orderIds).catch(() => {});
    if (isOnline) {
      try {
        await fetch('/api/orders/bulk-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: orderIds }),
        });
      } catch (err) {
        console.warn('Backend bulk delete orders failed:', err);
      }
    }
    setOrders((prev) => prev.filter((o) => !idSet.has(o.id)));
  };

  // Delete Pharmacy with optional orders cleanup
  const handleDeletePharmacy = async (pharmacyName: string, deleteOrders: boolean) => {
    storage.deletePharmacy(pharmacyName, deleteOrders);
    if (currentUser && (currentUser.pharmacyName || '').trim().toLowerCase() === pharmacyName.trim().toLowerCase()) {
      setCurrentUser(null);
      storage.setCurrentUser(null);
      storage.clearPharmacyProfile();
      setPrefilledPharmacyName('');
      setCart([]);
      setAuthModalCustomMessage('تم حذف تصريح هذه الصيدلية من قبل إدارة المذخر • تم حظر الوصول إلى السلة والكتالوج حتى بعد تغيير الرابط.');
      setIsAuthModalOpen(true);
    }
    if (isOnline) {
      try {
        await fetch(
          `/api/pharmacies/${encodeURIComponent(pharmacyName)}?deleteOrders=${deleteOrders ? 'true' : 'false'}`,
          { method: 'DELETE' }
        );
      } catch (err) {
        console.warn('Backend delete pharmacy failed:', err);
      }
    }
    if (deleteOrders) {
      setOrders((prev) =>
        prev.filter(
          (o) => o.pharmacyName.trim().toLowerCase() !== pharmacyName.trim().toLowerCase()
        )
      );
    }
  };

  // Product CRUD
  const handleAddProduct = (newProductData: Omit<Product, 'id'>) => {
    const newProduct: Product = {
      ...newProductData,
      id: `med-${Date.now()}`,
    };
    setProducts((prev) => [newProduct, ...prev]);
    if (isOnline) {
      fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProduct),
      }).catch(() => {});
    }
  };

  const handleBatchAddProducts = (newProductsList: Omit<Product, 'id'>[]) => {
    const formatted: Product[] = newProductsList.map((p, idx) => ({
      ...p,
      id: `med-${Date.now()}-${idx}`,
    }));
    setProducts((prev) => [...formatted, ...prev]);
    if (isOnline) {
      fetch('/api/products/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: formatted }),
      }).catch(() => {});
    }
  };

  const handleUpdateProduct = (updatedProduct: Product) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === updatedProduct.id ? updatedProduct : p))
    );
    if (isOnline) {
      fetch(`/api/products/${updatedProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProduct),
      }).catch(() => {});
    }
  };

  const handleDeleteProduct = (productId: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== productId));
    if (isOnline) {
      fetch(`/api/products/${productId}`, {
        method: 'DELETE',
      }).catch(() => {});
    }
  };

  const newOrdersCount = orders.filter((o) => o.status === 'new').length;

  const handleNavigateToInventoryWithFilter = (filterType: InventoryFilterType) => {
    setInventoryInitialFilter(filterType);
    navigateToView('inventory');
  };

  const handleUpdateProductStock = (productId: string, newStock: number) => {
    setProducts((prev) =>
      prev.map((p) =>
        p.id === productId
          ? { ...p, stockQuantity: newStock, isAvailable: newStock > 0 }
          : p
      )
    );
    if (isOnline) {
      const prod = products.find((p) => p.id === productId);
      if (prod) {
        fetch(`/api/products/${productId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...prod, stockQuantity: newStock, isAvailable: newStock > 0 }),
        }).catch(() => {});
      }
    }
  };

  // =========================================================================
  // ACCESS CONTROL & WORKFLOW GATE (Strictly respecting user instructions):
  // "من يملك الرابط يسجل دخول أما صيدلية بمعلوماتها أو موظف مذخر وانا اوافق"
  // =========================================================================

  // 1. Permanently deleted / blocked account check
  const isProtectedUser = Boolean(
    currentUser && (
      currentUser.founder ||
      currentUser.role === 'founder' ||
      currentUser.role === 'owner' ||
      currentUser.role === 'super_admin' ||
      currentUser.role === 'warehouse_manager' ||
      currentUser.role === 'pharmacist_staff' ||
      currentUser.role === 'staff' ||
      currentUser.identifier === 'mohammedjafaralkabi@gmail.com' ||
      (currentUser.email && currentUser.email.toLowerCase() === 'mohammedjafaralkabi@gmail.com') ||
      currentUser.status === 'approved'
    )
  );

  const isUserPermanentlyDeleted = Boolean(
    !isProtectedUser &&
    currentUser && (
      currentUser.status === 'blocked' ||
      currentUser.status === 'deleted' ||
      storage.isUserDeleted(currentUser.id, currentUser.identifier, currentUser.pharmacyName) ||
      (currentUser.pharmacyName && storage.isPharmacyDeleted(currentUser.pharmacyName))
    )
  );

  if (isUserPermanentlyDeleted) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-6 text-center space-y-4 shadow-xl border border-rose-200">
          <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl mx-auto flex items-center justify-center">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-black text-slate-900">تم إلغاء صلاحية الوصول إلى النظام</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            تم إلغاء صلاحية الوصول إلى النظام من قبل إدارة المذخر • يرجى التواصل مع إدارة مذخر سامو للأدوية.
          </p>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem('samo_user_session');
              storage.setCurrentUser(null);
              setCurrentUser(null);
            }}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black transition cursor-pointer"
          >
            تسجيل الخروج والرجوع للرئيسية
          </button>
        </div>
      </div>
    );
  }

  // 2. Pending Approval Screen: For any pharmacy awaiting Founder approval
  if (currentUser && (currentUser.status === 'pending' || currentUser.role === 'pending')) {
    return (
      <PendingApprovalScreen
        user={currentUser}
        settings={settings}
        onApproved={(approvedUser) => {
          setCurrentUser(approvedUser);
          storage.setCurrentUser(approvedUser);
          playSuccessChime();
          if (approvedUser.role === 'pharmacy') {
            setCurrentView('pharmacy');
          } else {
            setCurrentView('warehouse');
          }
        }}
        onLogout={async () => {
          await signOutFirebase();
          localStorage.removeItem('samo_user_session');
          setCurrentUser(null);
          storage.setCurrentUser(null);
        }}
      />
    );
  }

  // 3. Rejected or Deactivated User Screen
  if (currentUser && (currentUser.status === 'rejected' || currentUser.status === 'deactivated')) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-6 text-center space-y-4 shadow-xl border border-rose-200">
          <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl mx-auto flex items-center justify-center">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-black text-slate-900">تم رفض هذا الحساب</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            تم رفض طلب تسجيل هذا الحساب من قبل إدارة مذخر سامو. يرجى التواصل هاتفياً مع إدارة المذخر في حال وجود أي استفسار.
          </p>
          <button
            type="button"
            onClick={async () => {
              await signOutFirebase();
              localStorage.removeItem('samo_user_session');
              setCurrentUser(null);
              storage.setCurrentUser(null);
            }}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black transition cursor-pointer"
          >
            تسجيل الخروج والرجوع للرئيسية
          </button>
        </div>
      </div>
    );
  }

  // 4. Unauthenticated Visitor Catalog (Browsing allowed, cart locked)
  if (!currentUser && currentView === 'pharmacy') {
    return (
      <React.Suspense fallback={<ViewLoader />}>
        <PharmacyPortal
          products={products}
          cart={cart}
          orders={orders}
          onAddToCart={handleAddToCart}
          onUpdateCartQuantity={handleUpdateCartQuantity}
          onRemoveFromCart={handleRemoveFromCart}
          onClearCart={handleClearCart}
          onSubmitOrder={handleSubmitOrder}
          settings={settings}
          prefilledPharmacyName=""
          currentUser={null}
          onOpenAuth={() => setIsAuthModalOpen(true)}
          onDeleteOrder={handleDeleteOrder}
          onDeleteOrdersBulk={handleDeleteOrdersBulk}
          onLogout={async () => {
            await signOutFirebase();
            localStorage.removeItem('samo_user_session');
            setCurrentUser(null);
            storage.setCurrentUser(null);
          }}
          onSwitchToWarehouse={() => {
            setCurrentView('warehouse');
          }}
          onUpdateSettings={(newSettings) => setSettings(newSettings)}
        />
        <OfflineIndicator />
        {isAuthModalOpen && (
          <AuthModal
            isOpen={true}
            currentUser={null}
            settings={settings}
            canDismiss={true}
            customMessage={authModalCustomMessage || "مرحباً بك في مذخر سامو للأدوية • يرجى تسجيل الدخول أو إرسال طلب تسجيل صيدلية"}
            onClose={() => setIsAuthModalOpen(false)}
            onLoginSuccess={(user) => {
              setCurrentUser(user);
              storage.setCurrentUser(user);
              setIsAuthModalOpen(false);
              if (user.status === 'approved') {
                if (user.role === 'pharmacy') {
                  setCurrentView('pharmacy');
                } else {
                  setCurrentView('warehouse');
                }
              }
            }}
            onLogout={async () => {
              await signOutFirebase();
              localStorage.removeItem('samo_user_session');
              setCurrentUser(null);
              storage.setCurrentUser(null);
            }}
          />
        )}
      </React.Suspense>
    );
  }

  // 5. Unauthenticated User Gate for other views (Warehouse, Inventory, etc.)
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-3 sm:p-4">
        <AuthModal
          isOpen={true}
          currentUser={null}
          settings={settings}
          canDismiss={true}
          onClose={() => setCurrentView('pharmacy')}
          customMessage="مرحباً بك في مذخر سامو للأدوية • يرجى تسجيل الدخول أو استعراض بوابة الصيدليات"
          onLoginSuccess={(user) => {
            setCurrentUser(user);
            storage.setCurrentUser(user);
            if (user.status === 'approved') {
              if (user.role === 'pharmacy') {
                setCurrentView('pharmacy');
              } else {
                setCurrentView('warehouse');
              }
            }
          }}
          onLogout={async () => {
            await signOutFirebase();
            localStorage.removeItem('samo_user_session');
            setCurrentUser(null);
            storage.setCurrentUser(null);
          }}
        />
      </div>
    );
  }

  // 6. Approved Pharmacy Portal View
  if (currentUser.role === 'pharmacy') {
    // Check if pharmacy needs initial one-time onboarding
    const needsOnboarding = !currentUser.profileCompleted && (
      !currentUser.pharmacyName ||
      currentUser.pharmacyName === 'مستخدم جديد' ||
      !currentUser.syndicateNumber ||
      !currentUser.phone ||
      !currentUser.address
    );

    if (needsOnboarding) {
      return (
        <React.Suspense fallback={<ViewLoader />}>
          <PharmacyOnboardingModal
            user={currentUser}
            onCompleted={(updatedUser) => {
              setCurrentUser(updatedUser);
              storage.setCurrentUser(updatedUser);
              setCurrentView('pharmacy');
            }}
            onLogout={async () => {
              await signOutFirebase();
              localStorage.removeItem('samo_user_session');
              setCurrentUser(null);
              storage.setCurrentUser(null);
            }}
          />
        </React.Suspense>
      );
    }

    return (
      <React.Suspense fallback={<ViewLoader />}>
        <PharmacyPortal
          products={products}
          cart={cart}
          orders={orders}
          onAddToCart={handleAddToCart}
          onUpdateCartQuantity={handleUpdateCartQuantity}
          onRemoveFromCart={handleRemoveFromCart}
          onClearCart={handleClearCart}
          onSubmitOrder={handleSubmitOrder}
          settings={settings}
          prefilledPharmacyName={currentUser.pharmacyName || prefilledPharmacyName}
          currentUser={currentUser}
          onOpenAuth={() => setIsAuthModalOpen(true)}
          onDeleteOrder={handleDeleteOrder}
          onDeleteOrdersBulk={handleDeleteOrdersBulk}
          onLogout={async () => {
            await signOutFirebase();
            localStorage.removeItem('samo_user_session');
            setCurrentUser(null);
            storage.setCurrentUser(null);
          }}
          onSwitchToWarehouse={undefined}
          onUpdateSettings={(newSettings) => setSettings(newSettings)}
        />
        <OfflineIndicator />
      </React.Suspense>
    );
  }

  // 7. Approved Warehouse / Founder Gate
  const isFounderUser = Boolean(
    currentUser &&
    (currentUser.id === 'founder_admin' ||
      currentUser.founder ||
      currentUser.role === 'founder' ||
      currentUser.identifier?.toLowerCase() === 'mohammedjafaralkabi@gmail.com' ||
      (currentUser.email && currentUser.email.toLowerCase() === 'mohammedjafaralkabi@gmail.com'))
  );

  const isWarehouseAuthorized = Boolean(
    isFounderUser ||
    (currentUser &&
      (currentUser.role === 'staff' ||
        currentUser.role === 'warehouse' ||
        currentUser.role === 'owner' ||
        currentUser.role === 'super_admin' ||
        currentUser.role === 'warehouse_manager' ||
        currentUser.role === 'pharmacist_staff' ||
        currentUser.role === 'auditor_readonly' ||
        currentUser.registrationAccountType === 'warehouse_staff' ||
        currentUser.status === 'approved') &&
      currentUser.status === 'approved')
  );

  if (!isWarehouseAuthorized) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <AuthModal
          isOpen={true}
          currentUser={currentUser}
          settings={settings}
          canDismiss={false}
          customMessage="لوحة تحكم المذخر والمخزون مخصصة للإدارة المصرح لها فقط • يرجى تسجيل الدخول بحساب المؤسس أو موظف المذخر"
          onLoginSuccess={(user) => {
            setCurrentUser(user);
            storage.setCurrentUser(user);
            if (user.role === 'pharmacy') {
              setCurrentView('pharmacy');
            } else {
              setCurrentView('warehouse');
            }
          }}
          onLogout={async () => {
            await signOutFirebase();
            localStorage.removeItem('samo_user_session');
            setCurrentUser(null);
            storage.setCurrentUser(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50 flex selection:bg-blue-600 selection:text-white text-slate-800">
      {/* Desktop Sidebar (Professional Polish Theme) - Sticky Stationary (قائمة طولية ثابتة) */}
      <aside className="w-64 bg-slate-900 text-white hidden lg:flex flex-col shrink-0 border-l border-slate-800 select-none sticky top-0 h-screen z-30 shadow-md">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
              <Pill className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white leading-tight">{settings.name || 'مذخر سامو'}</h1>
              <p className="text-xs text-slate-400 mt-0.5 font-medium">نظام توزيع الأدوية وإدارة المبيعات</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <button
            onClick={() => navigateToView('warehouse')}
            className={`w-full px-4 py-2.5 rounded-lg flex items-center gap-3 cursor-pointer text-sm font-semibold transition ${
              currentView === 'warehouse'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span>لوحة التحكم والتجهيز</span>
            {newOrdersCount > 0 && (
              <span className="mr-auto bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {newOrdersCount}
              </span>
            )}
          </button>

          <button
            onClick={() => navigateToView('inventory')}
            className={`w-full px-4 py-2.5 rounded-lg flex items-center gap-3 cursor-pointer text-sm font-semibold transition ${
              currentView === 'inventory'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Boxes className="w-5 h-5" />
            <span>المخزون والمواد</span>
          </button>

          <button
            onClick={() => navigateToView('add_materials')}
            className={`w-full px-4 py-2.5 rounded-lg flex items-center gap-3 cursor-pointer text-sm font-semibold transition ${
              currentView === 'add_materials'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <PlusCircle className="w-5 h-5 text-emerald-400" />
            <span>إضافة المواد والباركود</span>
          </button>

          <button
            onClick={() => navigateToView('financial_reports')}
            className={`w-full px-4 py-2.5 rounded-lg flex items-center gap-3 cursor-pointer text-sm font-semibold transition ${
              currentView === 'financial_reports'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <DollarSign className="w-5 h-5 text-amber-400" />
            <span>التقارير المالية والمبيعات</span>
          </button>

          <button
            onClick={() => {
              setWarehouseInitialTab('new');
              navigateToView('warehouse');
            }}
            className={`w-full px-4 py-2.5 rounded-lg flex items-center gap-3 cursor-pointer text-sm font-semibold transition ${
              currentView === 'warehouse' && warehouseInitialTab === 'new'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Receipt className="w-5 h-5 text-red-400" />
            <span>الطلبات الواردة</span>
            {newOrdersCount > 0 && (
              <span className="mr-auto bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {newOrdersCount}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setWarehouseInitialTab('ready');
              navigateToView('warehouse');
            }}
            className={`w-full px-4 py-2.5 rounded-lg flex items-center gap-3 cursor-pointer text-sm font-semibold transition ${
              currentView === 'warehouse' && warehouseInitialTab === 'ready'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <PackageCheck className="w-5 h-5 text-blue-400" />
            <span>الطلبات المجهزة</span>
            {orders.filter(o => o.status === 'ready').length > 0 && (
              <span className="mr-auto bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {orders.filter(o => o.status === 'ready').length}
              </span>
            )}
          </button>

          <button
            id="nav-approved-dispatched-registry"
            onClick={() => {
              setWarehouseInitialTab('approved_dispatched');
              navigateToView('warehouse');
            }}
            className={`w-full px-4 py-2.5 rounded-lg flex items-center gap-3 cursor-pointer text-sm font-semibold transition ${
              currentView === 'warehouse' && warehouseInitialTab === 'approved_dispatched'
                ? 'bg-indigo-600 text-white shadow-xs font-bold'
                : 'text-indigo-300 hover:text-white hover:bg-slate-800'
            }`}
            title="سجل وتوثيق كافة الطلبيات الموافق عليها والصادرة مع التواريخ"
          >
            <FileText className="w-5 h-5 text-indigo-400" />
            <span>سجل الصادر والمعتمد</span>
            <span className="mr-auto bg-indigo-500/20 text-indigo-200 text-[10px] font-bold px-2 py-0.5 rounded-full border border-indigo-500/30">
              مع التاريخ
            </span>
          </button>

          <button
            onClick={() => navigateToView('pharmacy')}
            className="w-full text-slate-400 hover:text-white hover:bg-slate-800 px-4 py-2.5 rounded-lg flex items-center gap-3 cursor-pointer text-sm font-semibold transition"
          >
            <ShoppingBag className="w-5 h-5" />
            <span>رابط الصيدليات المباشر</span>
            {cart.length > 0 && (
              <span className="mr-auto bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {cart.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setIsShareModalOpen(true)}
            className="w-full text-slate-400 hover:text-white hover:bg-slate-800 px-4 py-2.5 rounded-lg flex items-center gap-3 cursor-pointer text-sm font-semibold transition"
          >
            <Share2 className="w-5 h-5" />
            <span>روابط السلات</span>
          </button>

          {(currentUser?.role === 'owner' || currentUser?.role === 'super_admin' || currentUser?.role === 'founder' || currentUser?.role === 'warehouse' || currentUser?.founder || currentUser?.role === 'warehouse_manager' || currentUser?.role === 'staff' || currentUser?.role === 'pharmacist_staff') && (
            <button
              onClick={() => setIsApprovalsModalOpen(true)}
              className="w-full text-amber-300 hover:text-white hover:bg-slate-800 px-4 py-2.5 rounded-lg flex items-center gap-3 cursor-pointer text-sm font-semibold transition"
            >
              <ShieldCheck className="w-5 h-5 text-amber-400" />
              <span>تصاريح وموافقات الدخول</span>
              {pendingUsers.length > 0 && (
                <span className="mr-auto bg-amber-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full shadow-xs animate-pulse">
                  {pendingUsers.length}
                </span>
              )}
            </button>
          )}
        </nav>

        {/* Sidebar Status Footer */}
        <div className="p-4 border-t border-slate-800">
          <div className="bg-slate-800 p-3 rounded-xl border border-slate-700/60">
            <p className="text-[10px] text-slate-400 mb-1.5 font-medium">حالة الاتصال</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-400 animate-pulse' : 'bg-amber-400'}`}></span>
                <span className="text-xs font-semibold text-white">
                  {isOnline ? 'متصل (أونلاين)' : 'أوفلاين (محلي)'}
                </span>
              </div>
              {pendingSyncCount > 0 && (
                <button
                  onClick={handleSyncPendingOrders}
                  disabled={!isOnline || isSyncing}
                  className="text-[10px] bg-blue-600 hover:bg-blue-700 text-white px-2 py-0.5 rounded font-bold transition cursor-pointer"
                >
                  {pendingSyncCount} معلق
                </button>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area - Full Width responsive fit without mobile horizontal scroll blowout */}
      <div className="flex-1 flex flex-col min-w-0 w-full max-w-full min-h-screen overflow-x-hidden">
        {/* Header with Back Button and View Navigation */}
        <Header
          currentView={currentView}
          onSelectView={navigateToView}
          canGoBack={viewHistory.length > 0}
          onGoBack={handleGoBack}
          previousViewName={getPreviousViewName(viewHistory[viewHistory.length - 1])}
          newOrdersCount={newOrdersCount}
          isOnline={isOnline}
          pendingSyncCount={pendingSyncCount}
          isSyncing={isSyncing}
          onSync={handleSyncPendingOrders}
          soundEnabled={soundEnabled}
          onToggleSound={() => setSoundEnabled((prev) => !prev)}
          onOpenShareModal={() => setIsShareModalOpen(true)}
          onOpenAddProductModal={() => navigateToView('add_materials')}
          settings={settings}
          cartItemCount={cart.length}
          currentUser={currentUser}
          pendingApprovalsCount={pendingUsers.length}
          onOpenApprovals={() => setIsApprovalsModalOpen(true)}
          onLogout={async () => {
            await signOutFirebase();
            setCurrentUser(null);
            storage.setCurrentUser(null);
            setIsAuthModalOpen(true);
          }}
          onOpenAuth={() => setIsAuthModalOpen(true)}
          onToggleMobileMenu={() => setIsMobileMenuOpen((prev) => !prev)}
        />

        {/* Main View Display - Contained within mobile screen width with instant zero-lag tab switching */}
        <main className="flex-1 w-full max-w-full pb-24 lg:pb-12 overflow-x-hidden">
          <React.Suspense fallback={<ViewLoader />}>
            <div className={currentView === 'warehouse' ? 'block' : 'hidden'} key="view-warehouse">
              <WarehouseDashboard
                orders={orders}
                registeredUsers={registeredUsers}
                currentUser={currentUser}
                operations={operations}
                onUpdateOrderStatus={handleUpdateOrderStatus}
                onUpdateOrderVerification={handleUpdateOrderVerification}
                onUpdateOrder={handleUpdateOrder}
                onAddOrder={handleAddDirectOrder}
                products={products}
                onDeleteOrder={handleDeleteOrder}
                onDeleteOrdersBulk={handleDeleteOrdersBulk}
                onDeletePharmacy={handleDeletePharmacy}
                onOpenShareModalForPharmacy={(pharmacyName) => {
                  setPrefilledPharmacyName(pharmacyName);
                  setIsShareModalOpen(true);
                }}
                settings={settings}
                newOrderAlert={newOrderAlert}
                onDismissNewOrderAlert={() => setNewOrderAlert(null)}
                alerts={alerts}
                onNavigateToInventory={handleNavigateToInventoryWithFilter}
                onOpenApprovals={() => setIsApprovalsModalOpen(true)}
                pendingApprovalsCount={registeredUsers.filter((u) => u.status === 'pending').length}
                initialTab={warehouseInitialTab}
              />
            </div>

            {(visitedViews.has('pharmacy') || currentView === 'pharmacy') && (
              <div className={currentView === 'pharmacy' ? 'block' : 'hidden'} key="view-pharmacy">
                {/* Header preview / return banner when navigated from main navigation */}
                <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white px-4 py-2.5 flex items-center justify-between text-xs font-semibold shadow-inner border-b border-blue-800">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-blue-300" />
                    <span>معاينة بوابة الصيدليات المباشرة • رابط طلب الأدوية للصيدليات</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigateToView('warehouse')}
                    className="bg-white/15 hover:bg-white/25 px-3 py-1 rounded-lg text-white font-bold transition flex items-center gap-1.5 cursor-pointer text-xs"
                  >
                    <span>العودة للوحة الإدارة</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <PharmacyPortal
                  products={products}
                  cart={cart}
                  orders={orders}
                  onAddToCart={handleAddToCart}
                  onUpdateCartQuantity={handleUpdateCartQuantity}
                  onRemoveFromCart={handleRemoveFromCart}
                  onClearCart={handleClearCart}
                  onSubmitOrder={handleSubmitOrder}
                  settings={settings}
                  prefilledPharmacyName={prefilledPharmacyName}
                  currentUser={currentUser}
                  onOpenAuth={() => setIsAuthModalOpen(true)}
                  onDeleteOrder={handleDeleteOrder}
                  onDeleteOrdersBulk={handleDeleteOrdersBulk}
                  onLogout={async () => {
                    await signOutFirebase();
                    localStorage.removeItem('samo_user_session');
                    setCurrentUser(null);
                    storage.setCurrentUser(null);
                    setIsAuthModalOpen(true);
                  }}
                  onSwitchToWarehouse={() => navigateToView('warehouse')}
                  onUpdateSettings={(newSettings) => setSettings(newSettings)}
                />
              </div>
            )}

            {(visitedViews.has('inventory') || currentView === 'inventory') && (
              <div className={currentView === 'inventory' ? 'block' : 'hidden'} key="view-inventory">
                <InventoryManager
                  products={products}
                  onAddProduct={handleAddProduct}
                  onBatchAddProducts={handleBatchAddProducts}
                  onUpdateProduct={handleUpdateProduct}
                  onDeleteProduct={handleDeleteProduct}
                  settings={settings}
                  initialFilter={inventoryInitialFilter}
                />
              </div>
            )}

            {(visitedViews.has('add_materials') || currentView === 'add_materials') && (
              <div className={currentView === 'add_materials' ? 'block' : 'hidden'} key="view-add_materials">
                <AddMaterialsPage
                  products={products}
                  onAddProduct={handleAddProduct}
                  onBatchAddProducts={handleBatchAddProducts}
                  onNavigateBack={() => navigateToView('inventory')}
                  settings={settings}
                />
              </div>
            )}

            {(visitedViews.has('financial_reports') || currentView === 'financial_reports') && (
              <div className={currentView === 'financial_reports' ? 'block' : 'hidden'} key="view-financial_reports">
                <FinancialReportsPage
                  products={products}
                  orders={orders}
                  settings={settings}
                  onNavigateBack={() => navigateToView('warehouse')}
                  onNavigateToInventoryWithFilter={handleNavigateToInventoryWithFilter}
                />
              </div>
            )}
          </React.Suspense>
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (Instant 1-Tap Access on Mobile) */}
      <nav 
        id="mobile-bottom-nav" 
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 lg:hidden px-2 py-1.5 flex items-center justify-around shadow-lg"
      >
        <button
          onClick={() => navigateToView('warehouse')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition cursor-pointer flex-1 ${
            currentView === 'warehouse' ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
          title="لوحة التحكم الرئيسية"
        >
          <div className="relative">
            <LayoutDashboard className="w-5 h-5" />
            {newOrdersCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full ring-2 ring-white"></span>
            )}
          </div>
          <span className="text-[10px] mt-0.5 font-semibold">الرئيسية</span>
        </button>

        <button
          onClick={() => navigateToView('inventory')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition cursor-pointer flex-1 ${
            currentView === 'inventory' ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
          title="إدارة المخزون والمواد"
        >
          <Boxes className="w-5 h-5" />
          <span className="text-[10px] mt-0.5 font-semibold">المخزون</span>
        </button>

        <button
          onClick={() => navigateToView('add_materials')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition cursor-pointer flex-1 ${
            currentView === 'add_materials' ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
          title="إضافة مواد وباركود جديد"
        >
          <PlusCircle className="w-5 h-5 text-emerald-600" />
          <span className="text-[10px] mt-0.5 font-semibold">إضافة مادة</span>
        </button>

        <button
          onClick={() => navigateToView('financial_reports')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition cursor-pointer flex-1 ${
            currentView === 'financial_reports' ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
          title="التقارير المالية والمبيعات"
        >
          <DollarSign className="w-5 h-5 text-amber-600" />
          <span className="text-[10px] mt-0.5 font-semibold">التقارير</span>
        </button>

        <button
          id="btn-bottom-nav-more"
          onClick={() => setIsMobileMenuOpen(true)}
          className="flex flex-col items-center justify-center py-1 px-2 rounded-xl transition cursor-pointer flex-1 text-slate-600 hover:text-slate-900 relative"
          title="عرض كامل القوائم والتبويبات"
        >
          <div className="relative">
            <Menu className="w-5 h-5" />
            {(registeredUsers.filter((u) => u.status === 'pending').length > 0) && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full ring-2 ring-white animate-pulse"></span>
            )}
          </div>
          <span className="text-[10px] mt-0.5 font-bold">القائمة</span>
        </button>
      </nav>

      {/* Mobile Slide-Over Sidebar Drawer (Contains all Navigation Tabs & Options) - Anchored to Far Right (جهة الخطوط أقصى اليمين) */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" dir="rtl">
          {/* Semi-transparent backdrop */}
          <div 
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={() => setIsMobileMenuOpen(false)}
          />

          {/* Drawer Sidebar anchored at the Far Right */}
          <div className="fixed top-0 right-0 w-[310px] max-w-[85vw] bg-slate-900 text-white h-full flex flex-col z-10 shadow-2xl border-l border-slate-800 animate-in slide-in-from-right duration-200">
            {/* Header with Brand & Close Button */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20 shrink-0">
                  <Pill className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold tracking-tight text-white leading-tight">
                    {settings.name || 'مذخر سامو'}
                  </h2>
                  <p className="text-[10px] text-slate-400 font-medium">نظام توزيع الأدوية وإدارة المبيعات</p>
                </div>
              </div>

              <button
                id="btn-close-mobile-sidebar"
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
                title="إغلاق القائمة"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Complete Navigation Tabs */}
            <nav className="flex-1 p-3.5 space-y-1.5 overflow-y-auto">
              <button
                onClick={() => navigateToView('warehouse')}
                className={`w-full px-3.5 py-2.5 rounded-xl flex items-center gap-3 cursor-pointer text-sm font-semibold transition ${
                  currentView === 'warehouse'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <LayoutDashboard className="w-5 h-5 shrink-0" />
                <span>لوحة التحكم والتجهيز</span>
                {newOrdersCount > 0 && (
                  <span className="mr-auto bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {newOrdersCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => navigateToView('inventory')}
                className={`w-full px-3.5 py-2.5 rounded-xl flex items-center gap-3 cursor-pointer text-sm font-semibold transition ${
                  currentView === 'inventory'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Boxes className="w-5 h-5 shrink-0 text-blue-400" />
                <span>المخزون والمواد</span>
              </button>

              <button
                onClick={() => navigateToView('add_materials')}
                className={`w-full px-3.5 py-2.5 rounded-xl flex items-center gap-3 cursor-pointer text-sm font-semibold transition ${
                  currentView === 'add_materials'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <PlusCircle className="w-5 h-5 shrink-0 text-emerald-400" />
                <span>إضافة المواد والباركود</span>
              </button>

              <button
                onClick={() => navigateToView('financial_reports')}
                className={`w-full px-3.5 py-2.5 rounded-xl flex items-center gap-3 cursor-pointer text-sm font-semibold transition ${
                  currentView === 'financial_reports'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <DollarSign className="w-5 h-5 shrink-0 text-amber-400" />
                <span>التقارير المالية والمبيعات</span>
              </button>

              <button
                onClick={() => {
                  setWarehouseInitialTab('new');
                  navigateToView('warehouse');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl flex items-center gap-3 cursor-pointer text-sm font-semibold transition ${
                  currentView === 'warehouse' && warehouseInitialTab === 'new'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Receipt className="w-5 h-5 shrink-0 text-red-400" />
                <span>الطلبات الواردة</span>
                {newOrdersCount > 0 && (
                  <span className="mr-auto bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {newOrdersCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setWarehouseInitialTab('ready');
                  navigateToView('warehouse');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl flex items-center gap-3 cursor-pointer text-sm font-semibold transition ${
                  currentView === 'warehouse' && warehouseInitialTab === 'ready'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <PackageCheck className="w-5 h-5 shrink-0 text-blue-400" />
                <span>الطلبات المجهزة</span>
                {orders.filter(o => o.status === 'ready').length > 0 && (
                  <span className="mr-auto bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {orders.filter(o => o.status === 'ready').length}
                  </span>
                )}
              </button>

              <button
                id="mobile-nav-approved-dispatched-registry"
                onClick={() => {
                  setWarehouseInitialTab('approved_dispatched');
                  navigateToView('warehouse');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl flex items-center gap-3 cursor-pointer text-sm font-semibold transition ${
                  currentView === 'warehouse' && warehouseInitialTab === 'approved_dispatched'
                    ? 'bg-indigo-600 text-white shadow-xs font-bold'
                    : 'text-indigo-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <FileText className="w-5 h-5 shrink-0 text-indigo-400" />
                <span>سجل الصادر والمعتمد</span>
                <span className="mr-auto bg-indigo-500/20 text-indigo-200 text-[10px] font-bold px-2 py-0.5 rounded-full border border-indigo-500/30">
                  مع التاريخ
                </span>
              </button>

              <button
                onClick={() => navigateToView('pharmacy')}
                className="w-full text-slate-300 hover:text-white hover:bg-slate-800 px-3.5 py-2.5 rounded-xl flex items-center gap-3 cursor-pointer text-sm font-semibold transition"
              >
                <ShoppingBag className="w-5 h-5 shrink-0 text-sky-400" />
                <span>رابط الصيدليات المباشر</span>
                {cart.length > 0 && (
                  <span className="mr-auto bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {cart.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setIsShareModalOpen(true);
                  setIsMobileMenuOpen(false);
                }}
                className="w-full text-slate-300 hover:text-white hover:bg-slate-800 px-3.5 py-2.5 rounded-xl flex items-center gap-3 cursor-pointer text-sm font-semibold transition"
              >
                <Share2 className="w-5 h-5 shrink-0 text-indigo-400" />
                <span>روابط السلات ومشاركتها</span>
              </button>

              {(currentUser?.role === 'owner' || currentUser?.role === 'super_admin' || currentUser?.role === 'founder' || currentUser?.role === 'warehouse' || currentUser?.founder || currentUser?.role === 'warehouse_manager' || currentUser?.role === 'staff' || currentUser?.role === 'pharmacist_staff') && (
                <button
                  onClick={() => {
                    setIsApprovalsModalOpen(true);
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full text-amber-300 hover:text-white hover:bg-slate-800 px-3.5 py-2.5 rounded-xl flex items-center gap-3 cursor-pointer text-sm font-semibold transition"
                >
                  <ShieldCheck className="w-5 h-5 shrink-0 text-amber-400" />
                  <span>تصاريح وموافقات الدخول</span>
                  {registeredUsers.filter((u) => u.status === 'pending').length > 0 && (
                    <span className="mr-auto bg-amber-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full shadow-xs">
                      {registeredUsers.filter((u) => u.status === 'pending').length}
                    </span>
                  )}
                </button>
              )}
            </nav>

            {/* Mobile Footer Status & User Info */}
            <div className="p-3.5 border-t border-slate-800 space-y-2">
              {currentUser && (
                <div className="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700/60 flex items-center justify-between">
                  <div className="text-xs">
                    <p className="font-bold text-white truncate max-w-[170px]">{currentUser.pharmacyName || currentUser.name}</p>
                    <p className="text-[10px] text-emerald-400 font-medium">
                      {currentUser.role === 'founder' || currentUser.founder
                        ? 'المؤسس والمدير الأعلى'
                        : currentUser.role === 'warehouse' || currentUser.role === 'owner'
                        ? 'صاحب مذخر'
                        : currentUser.role === 'super_admin'
                        ? 'المدير الأعلى'
                        : currentUser.role === 'warehouse_manager'
                        ? 'مدير المستودع'
                        : currentUser.role === 'staff' || currentUser.role === 'pharmacist_staff'
                        ? 'كادر المذخر'
                        : currentUser.role === 'auditor_readonly'
                        ? 'مدقق حسابات'
                        : 'صيدلية معتمدة'}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      await signOutFirebase();
                      setCurrentUser(null);
                      storage.setCurrentUser(null);
                      setIsMobileMenuOpen(false);
                      setIsAuthModalOpen(true);
                    }}
                    className="p-1.5 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                    title="تسجيل الخروج"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/40 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-400 animate-pulse' : 'bg-amber-400'}`}></span>
                  <span className="text-[11px] font-medium text-slate-300">
                    {isOnline ? 'متصل بالإنترنت' : 'محلي (أوفلاين)'}
                  </span>
                </div>
                {pendingSyncCount > 0 && (
                  <button
                    onClick={handleSyncPendingOrders}
                    disabled={!isOnline || isSyncing}
                    className="text-[10px] bg-blue-600 hover:bg-blue-700 text-white px-2 py-0.5 rounded font-bold transition"
                  >
                    {pendingSyncCount} معلق
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share Link Modal */}
      {isShareModalOpen && (
        <React.Suspense fallback={null}>
          <ShareLinkModal
            isOpen={isShareModalOpen}
            onClose={() => setIsShareModalOpen(false)}
            settings={settings}
            onOpenPharmacyView={(pharmacyName) => {
              if (pharmacyName) setPrefilledPharmacyName(pharmacyName);
              navigateToView('pharmacy');
            }}
          />
        </React.Suspense>
      )}

      {/* Authentication & Access Gate Modal */}
      <AuthModal
        isOpen={isAuthModalOpen || !currentUser || currentUser.status !== 'approved'}
        currentUser={currentUser}
        settings={settings}
        customMessage={authModalCustomMessage}
        canDismiss={Boolean(currentUser && currentUser.status === 'approved' && currentUser.role === 'owner')}
        onClose={() => setIsAuthModalOpen(false)}
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          storage.setCurrentUser(user);
          setAuthModalCustomMessage('');
          setIsAuthModalOpen(false);
          // If approved pharmacy, switch to pharmacy portal view only
          if (user.role === 'pharmacy') {
            setCurrentView('pharmacy');
          } else {
            setCurrentView('warehouse');
          }
          if (user.pharmacyName) {
            setPrefilledPharmacyName(user.pharmacyName);
          }
        }}
        onLogout={() => {
          setCurrentUser(null);
          storage.setCurrentUser(null);
          setIsAuthModalOpen(true);
        }}
      />

      {/* User Approvals Management Modal for Warehouse Owner */}
      {isApprovalsModalOpen && (
        <React.Suspense fallback={null}>
          <UserApprovalsModal
            isOpen={isApprovalsModalOpen}
            onClose={() => setIsApprovalsModalOpen(false)}
            users={registeredUsers}
            onRefreshUsers={syncServerUsers}
            onApproveUser={async (userId, role) => {
              setNewRegistrationAlert((curr) =>
                curr && (curr.id === userId || curr.identifier === userId) ? null : curr
              );
              const user = storage.updateUserStatus(userId, 'approved', role);
              if (user) {
                setRegisteredUsers(storage.getRegisteredUsers());
                if (isOnline) {
                  fetch('/api/auth/approve', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, role }),
                  }).catch(() => {});
                }
              }
            }}
            onRejectUser={async (userId) => {
              setNewRegistrationAlert((curr) =>
                curr && (curr.id === userId || curr.identifier === userId) ? null : curr
              );
              const user = storage.updateUserStatus(userId, 'rejected');
              if (user) {
                setRegisteredUsers(storage.getRegisteredUsers());
                if (isOnline) {
                  fetch('/api/auth/reject', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId }),
                  }).catch(() => {});
                }
              }
            }}
            onUpdateUser={async (updatedUser) => {
              const updated = registeredUsers.map((u) => (u.id === updatedUser.id ? updatedUser : u));
              setRegisteredUsers(updated);
              storage.saveRegisteredUsers(updated);
              if (currentUser?.id === updatedUser.id) {
                setCurrentUser(updatedUser);
                storage.setCurrentUser(updatedUser);
              }
              if (isOnline) {
                fetch('/api/auth/register', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(updatedUser),
                }).catch(() => {});
              }
            }}
            onDeleteUser={async (userId) => {
              const userToDelete = registeredUsers.find((u) => u.id === userId);
              if (userToDelete) {
                storage.recordDeletedUser(userToDelete.id, userToDelete.identifier, userToDelete.pharmacyName);
              }
              storage.deleteUser(userId);
              const remaining = registeredUsers.filter((u) => u.id !== userId);
              setRegisteredUsers(remaining);
              if (currentUser && (currentUser.id === userId || (userToDelete && currentUser.identifier.toLowerCase() === userToDelete.identifier.toLowerCase()))) {
                setCurrentUser(null);
                storage.setCurrentUser(null);
                storage.clearPharmacyProfile();
                setCart([]);
                setAuthModalCustomMessage('تم حذف تصريح حسابك من قبل إدارة المذخر • تم منع الوصول إلى السلة والكتالوج حتى بعد تغيير الرابط.');
                setIsAuthModalOpen(true);
              }
              if (isOnline) {
                fetch(`/api/auth/users/${userId}`, { method: 'DELETE' }).catch(() => {});
              }
            }}
            onAddPreApprovedUser={async (userData) => {
              const newUser: AppUser = {
                ...userData,
                id: `user-${Date.now()}`,
                createdAt: new Date().toISOString(),
              };
              const updated = [newUser, ...registeredUsers];
              setRegisteredUsers(updated);
              storage.saveRegisteredUsers(updated);
              if (isOnline) {
                fetch('/api/auth/register', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(newUser),
                }).then(() => {
                  fetch('/api/auth/approve', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: newUser.id }),
                  }).catch(() => {});
                }).catch(() => {});
              }
            }}
            settings={settings}
            onUpdateSettings={(newSettings) => setSettings(newSettings)}
          />
        </React.Suspense>
      )}

      {/* Offline Status Floating Alert Indicator */}
      <OfflineIndicator />

      {/* Real-time New User Registration Floating Banner */}
      {newRegistrationAlert && (
        <div 
          id="banner-new-user-registration"
          className="fixed top-18 sm:top-20 right-3 left-3 sm:left-auto sm:right-6 sm:w-[420px] z-50 bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border-2 border-amber-500 animate-in slide-in-from-top-4 duration-300 flex flex-col gap-3"
          dir="rtl"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-amber-400">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4 text-amber-400 animate-bounce" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white leading-tight">يوجد طلب تسجيل جديد قيد الانتظار</h3>
                <p className="text-[10px] text-amber-300/90 font-medium">وصل طلب انضمام جديد ويحتاج اعتمادك من لوحة الإدارة</p>
              </div>
            </div>
            <button 
              onClick={() => {
                if (newRegistrationAlert) {
                  storage.markAlertHandled(
                    newRegistrationAlert.id,
                    newRegistrationAlert.identifier,
                    newRegistrationAlert.phone,
                    newRegistrationAlert.email
                  );
                }
                setNewRegistrationAlert(null);
              }} 
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="إغلاق التنبيه نهائياً"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400 font-medium">الاسم:</span>
              <strong className="text-white font-bold">{newRegistrationAlert.name}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 font-medium">المؤسسة / الصيدلية:</span>
              <strong className="text-amber-200 font-bold">{newRegistrationAlert.pharmacyName || 'غير محدد'}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 font-medium">الهاتف:</span>
              <span className="text-slate-200 font-bold" dir="ltr">{newRegistrationAlert.phone || newRegistrationAlert.identifier}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 font-medium">النوع:</span>
              <span className="text-emerald-400 font-bold">
                {newRegistrationAlert.registrationAccountType === 'warehouse_staff' ? 'كادر مذخر' : 'صيدلية عميل'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              id="btn-alert-approve-registration"
              onClick={async () => {
                const targetUser = newRegistrationAlert;
                if (!targetUser) return;
                storage.markAlertHandled(targetUser.id, targetUser.identifier, targetUser.phone, targetUser.email);
                setNewRegistrationAlert(null);
                const role = targetUser.registrationAccountType === 'warehouse_staff' ? 'pharmacist_staff' : 'pharmacy';
                const user = storage.updateUserStatus(targetUser.id, 'approved', role);
                if (user) {
                  setRegisteredUsers(storage.getRegisteredUsers());
                  if (isOnline) {
                    fetch('/api/auth/approve', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        userId: targetUser.id,
                        identifier: targetUser.identifier,
                        phone: targetUser.phone,
                        email: targetUser.email,
                        role,
                      }),
                    }).catch(() => {});
                  }
                }
              }}
              className="flex-1 min-w-[100px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer active:scale-95"
            >
              <CheckCircle className="w-4 h-4 text-white" />
              <span>قبول واعتماد</span>
            </button>
            <button
              id="btn-alert-reject-registration"
              onClick={async () => {
                const targetUser = newRegistrationAlert;
                if (!targetUser) return;
                storage.markAlertHandled(targetUser.id, targetUser.identifier, targetUser.phone, targetUser.email);
                setNewRegistrationAlert(null);
                const user = storage.updateUserStatus(targetUser.id, 'rejected');
                if (user) {
                  setRegisteredUsers(storage.getRegisteredUsers());
                  if (isOnline) {
                    fetch('/api/auth/reject', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        userId: targetUser.id,
                        identifier: targetUser.identifier,
                        phone: targetUser.phone,
                        email: targetUser.email,
                      }),
                    }).catch(() => {});
                  }
                }
              }}
              className="bg-rose-600 hover:bg-rose-500 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer active:scale-95"
            >
              <XCircle className="w-4 h-4 text-white" />
              <span>رفض</span>
            </button>
            <button
              id="btn-alert-review-registration"
              onClick={() => {
                if (newRegistrationAlert) {
                  storage.markAlertHandled(
                    newRegistrationAlert.id,
                    newRegistrationAlert.identifier,
                    newRegistrationAlert.phone,
                    newRegistrationAlert.email
                  );
                }
                setIsApprovalsModalOpen(true);
                setNewRegistrationAlert(null);
              }}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 px-2.5 rounded-xl text-xs font-semibold transition cursor-pointer"
              title="عرض التفاصيل الكاملة"
            >
              مراجعة
            </button>
            <button
              onClick={() => {
                if (newRegistrationAlert) {
                  storage.markAlertHandled(
                    newRegistrationAlert.id,
                    newRegistrationAlert.identifier,
                    newRegistrationAlert.phone,
                    newRegistrationAlert.email
                  );
                }
                setNewRegistrationAlert(null);
              }}
              className="bg-slate-800 hover:bg-slate-700 text-slate-400 py-2 px-2 rounded-xl text-xs transition cursor-pointer"
              title="إغلاق التنبيه نهائياً"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
