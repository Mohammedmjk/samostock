import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Product, Order, OrderStatus, CartItem, WarehouseSettings, calculateMeltedPrice, AppUser } from './types';
import { storage } from './services/storage';
import { playNewOrderChime, playSuccessChime, playWarningAlertChime } from './services/sound';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { Header } from './components/Header';
import { PharmacyPortal } from './components/PharmacyPortal';
import { WarehouseDashboard } from './components/WarehouseDashboard';
import { InventoryManager, InventoryFilterType } from './components/InventoryManager';
import { AddMaterialsPage } from './components/AddMaterialsPage';
import { FinancialReportsPage } from './components/FinancialReportsPage';
import { ShareLinkModal } from './components/ShareLinkModal';
import { AuthModal } from './components/AuthModal';
import { UserApprovalsModal } from './components/UserApprovalsModal';
import { PendingApprovalScreen } from './components/PendingApprovalScreen';
import { OfflineIndicator } from './components/OfflineIndicator';
import { computeInventoryAlerts } from './services/alertService';
import { initialProducts, initialOrders } from './data/initialProducts';
import { LayoutDashboard, Boxes, Receipt, Share2, ShoppingBag, Pill, ShieldCheck, UserCheck, PlusCircle, DollarSign, BarChart3, TrendingUp, Menu, X, LogOut, AlertCircle, ArrowRight, Bell } from 'lucide-react';

export type AppView = 'warehouse' | 'pharmacy' | 'inventory' | 'add_materials' | 'financial_reports';

export default function App() {
  const isOnline = useOnlineStatus();

  // Primary data state
  const [products, setProducts] = useState<Product[]>(() => storage.getProducts());
  const [orders, setOrders] = useState<Order[]>(() => storage.getOrders());
  const [settings, setSettings] = useState<WarehouseSettings>(() => storage.getSettings());
  const [cart, setCart] = useState<CartItem[]>([]);
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
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isApprovalsModalOpen, setIsApprovalsModalOpen] = useState<boolean>(false);
  const [authModalCustomMessage, setAuthModalCustomMessage] = useState<string>('');
  const [newRegistrationAlert, setNewRegistrationAlert] = useState<AppUser | null>(null);

  // Compute live alerts for out-of-stock and near-expiry items
  const alerts = useMemo(() => computeInventoryAlerts(products), [products]);

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

  // Validate on mount, currentUser change, tab focus, and storage changes
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
  }, [verifyCurrentSession, currentUser]);

  // Initial seed and server sync (deferred non-blocking so initial open is blazing fast)
  useEffect(() => {
    if (!isOnline) return;

    // Seed server store after initial render has completed
    const seedTimer = setTimeout(() => {
      fetch('/api/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products, orders, users: registeredUsers }),
      }).catch(() => {
        // Server might be starting up, safe to ignore
      });
    }, 1200);

    return () => clearTimeout(seedTimer);
  }, [isOnline]);

  // Live synchronization of registered users and approval status from backend server
  const syncServerUsers = useCallback(async (isInitial = false) => {
    try {
      const res = await fetch('/api/auth/users', {
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.users)) {
          setRegisteredUsers((prev) => {
            const userMap = new Map<string, AppUser>();
            // Add server users first (server is the single source of truth)
            data.users.forEach((u: AppUser) => {
              const key = u.id || (u.identifier ? u.identifier.toLowerCase() : '');
              if (key) userMap.set(key, u);
            });
            // Keep any local pending user that might not have synced yet
            prev.forEach((u) => {
              const key = u.id || (u.identifier ? u.identifier.toLowerCase() : '');
              if (key && !userMap.has(key)) {
                userMap.set(key, u);
              }
            });
            const merged = Array.from(userMap.values());

            // Check if there is a newly arrived pending user for notification
            if (!isInitial) {
              const prevPendingIds = new Set(prev.filter((u) => u.status === 'pending').map((u) => u.id));
              const newlyPending = merged.find((u) => u.status === 'pending' && !prevPendingIds.has(u.id));
              if (newlyPending) {
                setNewRegistrationAlert(newlyPending);
                if (soundEnabled) {
                  playWarningAlertChime();
                }
              }
            }

            storage.saveRegisteredUsers(merged);
            return merged;
          });
        }
      }
    } catch (err) {
      console.warn('Failed to sync users from server:', err);
    }
  }, [soundEnabled]);

  // Initial user sync and continuous background polling interval across all devices
  useEffect(() => {
    if (!isOnline) return;

    // Run immediately on load
    syncServerUsers(true);

    // Continuous polling interval every 6 seconds to ensure requests are never missed across mobile devices
    const pollInterval = setInterval(() => {
      syncServerUsers(false);
    }, 6000);

    // Also trigger on window focus and screen wake
    const handleFocusSync = () => {
      if (document.visibilityState === 'visible') {
        syncServerUsers(false);
      }
    };
    window.addEventListener('focus', handleFocusSync);
    document.addEventListener('visibilitychange', handleFocusSync);

    return () => {
      clearInterval(pollInterval);
      window.removeEventListener('focus', handleFocusSync);
      document.removeEventListener('visibilitychange', handleFocusSync);
    };
  }, [isOnline, syncServerUsers]);

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
          setNewRegistrationAlert(incomingUser);
          if (soundEnabled) {
            playWarningAlertChime();
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
          if (updatedUser.status === 'pending') {
            setNewRegistrationAlert(updatedUser);
            if (soundEnabled) {
              playWarningAlertChime();
            }
          }
        } catch {}
      });

      eventSource.addEventListener('user_approved', (e) => {
        try {
          const approvedUser: AppUser = JSON.parse(e.data);
          setRegisteredUsers((prev) => {
            const updated = prev.map((u) => (u.id === approvedUser.id ? approvedUser : u));
            storage.saveRegisteredUsers(updated);
            return updated;
          });
          // Dispatch window event for modal listeners
          window.dispatchEvent(new MessageEvent('sse_user_approved', { data: e.data }));
          // If current logged-in user was approved
          setCurrentUser((curr) => {
            if (curr && (curr.id === approvedUser.id || curr.identifier === approvedUser.identifier)) {
              storage.setCurrentUser(approvedUser);
              return approvedUser;
            }
            return curr;
          });
        } catch {}
      });

      eventSource.addEventListener('user_rejected', (e) => {
        try {
          const rejectedUser: AppUser = JSON.parse(e.data);
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
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status, rejectionReason: rejectionReason || o.rejectionReason } : o))
    );
    if (isOnline) {
      fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, rejectionReason }),
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
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id === orderId) {
          return {
            ...o,
            items: updatedItems,
            status: status || o.status,
            preparedBy: preparedBy || o.preparedBy,
            preparedAt: status === 'ready' ? new Date().toISOString() : o.preparedAt,
          };
        }
        return o;
      })
    );

    playSuccessChime();

    if (isOnline) {
      fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: updatedItems,
          status: status,
          preparedBy: preparedBy,
        }),
      }).catch(() => {});
    }
  };

  // Delete Order with persistence and real-time backend sync
  const handleDeleteOrder = async (orderId: string) => {
    storage.deleteOrder(orderId);
    if (isOnline) {
      try {
        await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });
      } catch (err) {
        console.warn('Backend delete order failed:', err);
      }
    }
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
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

  // 1. Permanently deleted / banned account check
  const isUserPermanentlyDeleted = Boolean(
    currentUser && (
      storage.isUserDeleted(currentUser.id, currentUser.identifier, currentUser.pharmacyName) ||
      (currentUser.pharmacyName && storage.isPharmacyDeleted(currentUser.pharmacyName)) ||
      (prefilledPharmacyName && (storage.isPharmacyDeleted(prefilledPharmacyName) || storage.isUserDeleted(undefined, undefined, prefilledPharmacyName)))
    )
  );

  if (isUserPermanentlyDeleted) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-6 text-center space-y-4 shadow-2xl border border-rose-200">
          <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl mx-auto flex items-center justify-center">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-black text-slate-900">تم حظر الوصول</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            تم حذف تصريح هذا الحساب أو الصيدلية نهائياً من قبل إدارة المذخر • تم منع الدخول للنظام.
          </p>
          <button
            type="button"
            onClick={() => {
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

  // 2. Unauthenticated User Gate: Anyone opening the link MUST register or log in!
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-3 sm:p-4">
        <AuthModal
          isOpen={true}
          currentUser={null}
          settings={settings}
          canDismiss={false}
          customMessage="مرحباً بك في مذخر سامو للأدوية • يرجى تسجيل الدخول أو تسجيل حساب جديد (صيدلية أو موظف مذخر)"
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
          onLogout={() => {
            setCurrentUser(null);
            storage.setCurrentUser(null);
          }}
        />
      </div>
    );
  }

  // 3. Pending Approval Screen: If account is pending review from Mohammed Jafar Alkabi
  if (currentUser.status === 'pending') {
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
        onLogout={() => {
          setCurrentUser(null);
          storage.setCurrentUser(null);
        }}
      />
    );
  }

  // 4. Rejected or Deactivated User Screen
  if (currentUser.status === 'rejected' || currentUser.status === 'deactivated') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-6 text-center space-y-4 shadow-2xl border border-rose-200">
          <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl mx-auto flex items-center justify-center">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-black text-slate-900">طلب الحساب غير مفعل</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            تم رفض أو إلغاء تنشيط هذا الحساب من قبل إدارة مذخر سامو. يرجى التواصل مع المشرف العام.
          </p>
          <button
            type="button"
            onClick={() => {
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

  // 5. Approved Pharmacy Portal View
  if (currentUser.role === 'pharmacy') {
    return (
      <>
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
          onLogout={() => {
            setCurrentUser(null);
            storage.setCurrentUser(null);
          }}
          onSwitchToWarehouse={undefined}
          onUpdateSettings={(newSettings) => setSettings(newSettings)}
        />
        <OfflineIndicator />
      </>
    );
  }

  // 6. Approved Warehouse Staff / Manager / Owner / Super Admin Gate
  const currentPinVersion = storage.getOwnerPasscodeVersion();
  const isFounderUser = Boolean(
    currentUser &&
    (currentUser.founder ||
      currentUser.identifier.toLowerCase() === 'mohammedjafaralkabi@gmail.com' ||
      (currentUser.email && currentUser.email.toLowerCase() === 'mohammedjafaralkabi@gmail.com'))
  );
  const isOwnerAuthorized = Boolean(
    isFounderUser ||
    (currentUser &&
      (currentUser.role === 'owner' ||
        currentUser.role === 'super_admin' ||
        currentUser.role === 'warehouse_manager' ||
        currentUser.role === 'pharmacist_staff') &&
      currentUser.status === 'approved' &&
      !storage.isUserDeleted(currentUser.id, currentUser.identifier, currentUser.pharmacyName) &&
      (currentPinVersion === 0 || (currentUser.passcodeVersion && currentUser.passcodeVersion >= currentPinVersion)))
  );

  if (!isOwnerAuthorized) {
    const isPinOutdated = Boolean(
      !isFounderUser &&
      currentUser &&
      (currentUser.role === 'owner' || currentUser.role === 'super_admin') &&
      currentPinVersion > 0 &&
      (!currentUser.passcodeVersion || currentUser.passcodeVersion < currentPinVersion)
    );

    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <AuthModal
          isOpen={true}
          currentUser={currentUser}
          settings={settings}
          canDismiss={false}
          customMessage={
            isPinOutdated
              ? "تم تغيير رمز المرور السري للمذخر • تم إبطال الجلسة ويجب إدخال الرمز الجديد للمتابعة كصاحب متجر"
              : (authModalCustomMessage || "لوحة تحكم المذخر والمخزون محمية • يتطلب تصريح معتمد بالرمز السري")
          }
          onLoginSuccess={(user) => {
            setCurrentUser(user);
            storage.setCurrentUser(user);
            setAuthModalCustomMessage('');
            if (user.role === 'pharmacy') {
              setCurrentView('pharmacy');
            } else {
              setCurrentView('warehouse');
            }
          }}
          onLogout={() => {
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
            onClick={() => navigateToView('warehouse')}
            className="w-full text-slate-400 hover:text-white hover:bg-slate-800 px-4 py-2.5 rounded-lg flex items-center gap-3 cursor-pointer text-sm font-semibold transition"
          >
            <Receipt className="w-5 h-5" />
            <span>الطلبات الواردة</span>
            {newOrdersCount > 0 && (
              <span className="mr-auto bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {newOrdersCount}
              </span>
            )}
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

          {(currentUser?.role === 'owner' || currentUser?.role === 'super_admin' || currentUser?.founder) && (
            <button
              onClick={() => setIsApprovalsModalOpen(true)}
              className="w-full text-amber-300 hover:text-white hover:bg-slate-800 px-4 py-2.5 rounded-lg flex items-center gap-3 cursor-pointer text-sm font-semibold transition"
            >
              <ShieldCheck className="w-5 h-5 text-amber-400" />
              <span>تصاريح وموافقات الدخول</span>
              {registeredUsers.filter((u) => u.status === 'pending').length > 0 && (
                <span className="mr-auto bg-amber-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full shadow-xs">
                  {registeredUsers.filter((u) => u.status === 'pending').length}
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
          pendingApprovalsCount={registeredUsers.filter((u) => u.status === 'pending').length}
          onOpenApprovals={() => setIsApprovalsModalOpen(true)}
          onLogout={() => {
            setCurrentUser(null);
            storage.setCurrentUser(null);
            setIsAuthModalOpen(true);
          }}
          onOpenAuth={() => setIsAuthModalOpen(true)}
          onToggleMobileMenu={() => setIsMobileMenuOpen((prev) => !prev)}
        />

        {/* Main View Display - Contained within mobile screen width with instant zero-lag tab switching */}
        <main className="flex-1 w-full max-w-full pb-24 lg:pb-12 overflow-x-hidden">
          <div className={currentView === 'warehouse' ? 'block' : 'hidden'} key="view-warehouse">
            <WarehouseDashboard
              orders={orders}
              onUpdateOrderStatus={handleUpdateOrderStatus}
              onUpdateOrderVerification={handleUpdateOrderVerification}
              onDeleteOrder={handleDeleteOrder}
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
            />
          </div>

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
                onClick={() => navigateToView('warehouse')}
                className="w-full text-slate-300 hover:text-white hover:bg-slate-800 px-3.5 py-2.5 rounded-xl flex items-center gap-3 cursor-pointer text-sm font-semibold transition"
              >
                <Receipt className="w-5 h-5 shrink-0 text-purple-400" />
                <span>الطلبات الواردة</span>
                {newOrdersCount > 0 && (
                  <span className="mr-auto bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {newOrdersCount}
                  </span>
                )}
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

              {(currentUser?.role === 'owner' || currentUser?.role === 'super_admin' || currentUser?.founder || currentUser?.role === 'warehouse_manager') && (
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
                      {currentUser.role === 'super_admin' ? 'المدير الأعلى' : currentUser.role === 'owner' ? 'صاحب المذخر' : currentUser.role === 'warehouse_manager' ? 'مدير المستودع' : 'صيدلية معتمدة'}
                    </p>
                  </div>
                  <button
                    onClick={() => {
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
      <ShareLinkModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        settings={settings}
        onOpenPharmacyView={(pharmacyName) => {
          if (pharmacyName) setPrefilledPharmacyName(pharmacyName);
          navigateToView('pharmacy');
        }}
      />

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
      <UserApprovalsModal
        isOpen={isApprovalsModalOpen}
        onClose={() => setIsApprovalsModalOpen(false)}
        users={registeredUsers}
        onRefreshUsers={syncServerUsers}
        onApproveUser={async (userId, role) => {
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
                <h3 className="font-bold text-sm text-white leading-tight">طلب تسجيل جديد بانتظار الموافقة!</h3>
                <p className="text-[10px] text-amber-300/90 font-medium">تم تسجيل مستخدم جديد من جهاز آخر ويحتاج تصريحك</p>
              </div>
            </div>
            <button 
              onClick={() => setNewRegistrationAlert(null)} 
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="إغلاق التنبيه"
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

          <div className="flex items-center gap-2">
            <button
              id="btn-alert-review-registration"
              onClick={() => {
                setIsApprovalsModalOpen(true);
                setNewRegistrationAlert(null);
              }}
              className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer active:scale-95"
            >
              <ShieldCheck className="w-4 h-4 text-slate-950" />
              <span>مراجعة واعتماد الطلب فوراً</span>
            </button>
            <button
              onClick={() => setNewRegistrationAlert(null)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 px-3 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
