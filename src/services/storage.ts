import { Product, Order, WarehouseSettings, CartItem, AppUser, UserRole } from '../types';
import { initialProducts, initialOrders, initialWarehouseSettings } from '../data/initialProducts';
import { cacheProductsOffline, cacheOrdersOffline } from './db';

const STORAGE_KEYS = {
  PRODUCTS: 'samo_warehouse_products_v3',
  ORDERS: 'samo_warehouse_orders_v3',
  SETTINGS: 'samo_warehouse_settings_v3',
  PENDING_SYNC: 'samo_warehouse_pending_sync_v3',
  PHARMACY_PROFILE: 'samo_warehouse_pharmacy_profile_v3',
  CURRENT_USER: 'samo_warehouse_current_user_v3',
  REGISTERED_USERS: 'samo_warehouse_registered_users_v3',
  OWNER_PIN: 'samo_warehouse_owner_pin_v3',
};

// Cleanup any old legacy demo data
try {
  localStorage.removeItem('pharmastock_products_v1');
  localStorage.removeItem('pharmastock_orders_v1');
  localStorage.removeItem('pharmastock_settings_v1');
  localStorage.removeItem('pharmastock_pending_sync_v1');
} catch {
  // ignore in SSR or restricted environments
}

export const storage = {
  getProducts(): Product[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('Error reading products from storage:', e);
    }
    this.saveProducts(initialProducts);
    return initialProducts;
  },

  saveProducts(products: Product[]) {
    try {
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
      // Asynchronously mirror into IndexedDB for offline resilience
      cacheProductsOffline(products);
    } catch (e) {
      console.error('Error saving products:', e);
    }
  },

  getOrders(): Order[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ORDERS);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('Error reading orders from storage:', e);
    }
    this.saveOrders(initialOrders);
    return initialOrders;
  },

  saveOrders(orders: Order[]) {
    try {
      localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
      // Asynchronously mirror into IndexedDB for offline resilience
      cacheOrdersOffline(orders);
    } catch (e) {
      console.error('Error saving orders:', e);
    }
  },

  getSettings(): WarehouseSettings {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (data) {
        return { ...initialWarehouseSettings, ...JSON.parse(data) };
      }
    } catch (e) {
      console.error('Error reading settings:', e);
    }
    return initialWarehouseSettings;
  },

  saveSettings(settings: WarehouseSettings) {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.error('Error saving settings:', e);
    }
  },

  getPendingSyncOrders(): Order[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PENDING_SYNC);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  addPendingSyncOrder(order: Order) {
    const queue = this.getPendingSyncOrders();
    queue.push(order);
    localStorage.setItem(STORAGE_KEYS.PENDING_SYNC, JSON.stringify(queue));
  },

  clearPendingSyncOrders() {
    localStorage.setItem(STORAGE_KEYS.PENDING_SYNC, JSON.stringify([]));
  },

  getSavedPharmacyProfile(): { name: string; pharmacist: string; phone: string; address: string } {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PHARMACY_PROFILE);
      return data ? JSON.parse(data) : { name: '', pharmacist: '', phone: '', address: '' };
    } catch {
      return { name: '', pharmacist: '', phone: '', address: '' };
    }
  },

  savePharmacyProfile(profile: { name: string; pharmacist: string; phone: string; address: string }) {
    try {
      localStorage.setItem(STORAGE_KEYS.PHARMACY_PROFILE, JSON.stringify(profile));
    } catch (e) {
      console.error('Error saving profile:', e);
    }
  },

  clearPharmacyProfile() {
    try {
      localStorage.removeItem(STORAGE_KEYS.PHARMACY_PROFILE);
      localStorage.removeItem('samo_pharmacy_my_orders_v3');
      localStorage.removeItem('samo_pharmacy_cart_v3');
    } catch (e) {
      console.error('Error clearing pharmacy profile:', e);
    }
  },

  deleteOrder(orderId: string) {
    const orders = this.getOrders().filter(o => o.id !== orderId);
    this.saveOrders(orders);
    const pending = this.getPendingSyncOrders().filter(o => o.id !== orderId);
    localStorage.setItem(STORAGE_KEYS.PENDING_SYNC, JSON.stringify(pending));
  },

  deletePharmacy(pharmacyName: string, deleteOrders: boolean = false) {
    const normalized = pharmacyName.trim().toLowerCase();
    if (deleteOrders) {
      const remainingOrders = this.getOrders().filter(
        o => (o.pharmacyName || '').trim().toLowerCase() !== normalized
      );
      this.saveOrders(remainingOrders);
      const remainingPending = this.getPendingSyncOrders().filter(
        o => (o.pharmacyName || '').trim().toLowerCase() !== normalized
      );
      localStorage.setItem(STORAGE_KEYS.PENDING_SYNC, JSON.stringify(remainingPending));
    }
    // Track deleted pharmacies list to exclude from directory
    try {
      const deletedKey = 'samo_warehouse_deleted_pharmacies_v3';
      const existing: string[] = JSON.parse(localStorage.getItem(deletedKey) || '[]');
      if (!existing.includes(pharmacyName.trim())) {
        existing.push(pharmacyName.trim());
        localStorage.setItem(deletedKey, JSON.stringify(existing));
      }
    } catch {}

    // Invalidate users associated with this deleted pharmacy
    const users = this.getRegisteredUsers();
    const matchingUsers = users.filter(
      u => (u.pharmacyName || '').trim().toLowerCase() === normalized
    );
    matchingUsers.forEach(u => {
      this.recordDeletedUser(u.id, u.identifier, u.pharmacyName);
    });

    const remainingUsers = users.filter(
      u => (u.pharmacyName || '').trim().toLowerCase() !== normalized
    );
    this.saveRegisteredUsers(remainingUsers);

    const current = this.getCurrentUser();
    if (current && (current.pharmacyName || '').trim().toLowerCase() === normalized) {
      this.setCurrentUser(null);
      this.clearPharmacyProfile();
    }
  },

  isPharmacyDeleted(pharmacyName?: string): boolean {
    if (!pharmacyName) return false;
    const clean = pharmacyName.trim().toLowerCase();
    const deleted = this.getDeletedPharmacies().map(p => p.trim().toLowerCase());
    if (deleted.includes(clean)) return true;
    return this.isUserDeleted(undefined, undefined, pharmacyName);
  },

  deleteUser(userId: string) {
    if (userId === 'user-super-admin-master') return;
    const users = this.getRegisteredUsers();
    const deleted = users.find(u => u.id === userId);
    if (deleted && (deleted.identifier.toLowerCase() === 'mohammedjafaralkabi@gmail.com' || deleted.founder)) {
      return;
    }
    const remaining = users.filter(u => u.id !== userId);
    this.saveRegisteredUsers(remaining);

    // Record in deleted users blacklist
    if (deleted) {
      this.recordDeletedUser(deleted.id, deleted.identifier, deleted.pharmacyName);
    }

    const current = this.getCurrentUser();
    if (current && (current.id === userId || (deleted && current.identifier === deleted.identifier))) {
      this.setCurrentUser(null);
      this.clearPharmacyProfile();
    }
  },

  recordDeletedUser(id: string, identifier?: string, pharmacyName?: string) {
    try {
      const cleanIdent = (identifier || '').trim().toLowerCase();
      if (cleanIdent === 'mohammedjafaralkabi@gmail.com' || id === 'user-super-admin-master') return;
      const deletedListKey = 'samo_warehouse_deleted_users_records_v3';
      const list: any[] = JSON.parse(localStorage.getItem(deletedListKey) || '[]');
      list.push({ id, identifier, pharmacyName, timestamp: Date.now() });
      localStorage.setItem(deletedListKey, JSON.stringify(list));
    } catch {}
  },

  isUserDeleted(id?: string, identifier?: string, pharmacyName?: string): boolean {
    try {
      const cleanIdent = (identifier || '').trim().toLowerCase();
      const cleanId = (id || '').trim();
      // Founder is immune to deletion or blocking
      if (cleanIdent === 'mohammedjafaralkabi@gmail.com' || cleanId === 'user-super-admin-master') {
        return false;
      }

      const deletedListKey = 'samo_warehouse_deleted_users_records_v3';
      const list: any[] = JSON.parse(localStorage.getItem(deletedListKey) || '[]');
      const cleanPharm = (pharmacyName || '').trim().toLowerCase();

      const matchedInDeletedUsers = list.some(item => 
        (cleanId && item.id === cleanId) ||
        (cleanIdent && item.identifier && item.identifier.toLowerCase() === cleanIdent) ||
        (cleanPharm && item.pharmacyName && item.pharmacyName.toLowerCase() === cleanPharm)
      );
      if (matchedInDeletedUsers) return true;

      const deletedPharmacies = this.getDeletedPharmacies().map(p => p.trim().toLowerCase());
      if (cleanPharm && deletedPharmacies.includes(cleanPharm)) return true;

      return false;
    } catch {
      return false;
    }
  },

  validateSession(user: AppUser | null): { valid: boolean; reason?: 'none' | 'deleted' | 'unapproved' | 'pin_changed' } {
    if (!user) return { valid: false, reason: 'none' };

    // Founder bypasses all approval & pin checks: never blocked or unapproved!
    if (
      user.founder ||
      user.identifier.toLowerCase() === 'mohammedjafaralkabi@gmail.com' ||
      (user.email && user.email.toLowerCase() === 'mohammedjafaralkabi@gmail.com')
    ) {
      return { valid: true };
    }

    // 1. Is user deleted?
    if (this.isUserDeleted(user.id, user.identifier, user.pharmacyName)) {
      this.setCurrentUser(null);
      this.clearPharmacyProfile();
      return { valid: false, reason: 'deleted' };
    }

    // 2. Is user in registered users and approved?
    const registered = this.getRegisteredUsers();
    const existing = registered.find(
      u => u.id === user.id || u.identifier.toLowerCase() === user.identifier.toLowerCase()
    );
    if (!existing || existing.status !== 'approved') {
      this.setCurrentUser(null);
      return { valid: false, reason: 'unapproved' };
    }

    // 3. If owner / super_admin: check passcodeVersion!
    if (user.role === 'owner' || user.role === 'super_admin') {
      const currentPinVer = this.getOwnerPasscodeVersion();
      if (currentPinVer > 0 && (!user.passcodeVersion || user.passcodeVersion < currentPinVer)) {
        this.setCurrentUser(null);
        return { valid: false, reason: 'pin_changed' };
      }
    }

    return { valid: true };
  },

  getDeletedPharmacies(): string[] {
    try {
      return JSON.parse(localStorage.getItem('samo_warehouse_deleted_pharmacies_v3') || '[]');
    } catch {
      return [];
    }
  },

  // Generate shareable cart/catalog link
  createShareLink(pharmacyName?: string, prefillCart?: CartItem[]): string {
    const base = window.location.origin + window.location.pathname;
    const params = new URLSearchParams();
    params.set('view', 'pharmacy');
    if (pharmacyName) {
      params.set('pharmacy', encodeURIComponent(pharmacyName));
    }
    if (prefillCart && prefillCart.length > 0) {
      const minimalItems = prefillCart.map(c => ({ id: c.productId, q: c.quantity }));
      params.set('cart', encodeURIComponent(JSON.stringify(minimalItems)));
    }
    return `${base}?${params.toString()}`;
  },

  // User Authentication & Access Control
  getCurrentUser(): AppUser | null {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      if (!data) return null;
      const user: AppUser = JSON.parse(data);
      if (
        user &&
        (user.founder ||
         (user.identifier && user.identifier.toLowerCase() === 'mohammedjafaralkabi@gmail.com') ||
         (user.email && user.email.toLowerCase() === 'mohammedjafaralkabi@gmail.com'))
      ) {
        user.status = 'approved';
        user.role = 'super_admin';
        user.founder = true;
      }
      return user;
    } catch {
      return null;
    }
  },

  setCurrentUser(user: AppUser | null) {
    try {
      if (user) {
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
      } else {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      }
    } catch (e) {
      console.error('Error saving current user:', e);
    }
  },

  getRegisteredUsers(): AppUser[] {
    let users: AppUser[] = [];
    try {
      const data = localStorage.getItem(STORAGE_KEYS.REGISTERED_USERS);
      if (data) {
        users = JSON.parse(data);
      }
    } catch {
      // fallback
    }

    if (!Array.isArray(users) || users.length === 0) {
      users = [
        {
          id: 'user-super-admin-master',
          role: 'super_admin',
          requestedRole: 'super_admin',
          identifier: 'mohammedjafaralkabi@gmail.com',
          name: 'محمد جعفر الكعبي (المؤسس والمشرف العام)',
          pharmacyName: 'الإدارة العامة العليا لمذخر سامو',
          phone: '07700000000',
          email: 'mohammedjafaralkabi@gmail.com',
          status: 'approved',
          founder: true,
          createdAt: new Date().toISOString(),
          approvedAt: new Date().toISOString(),
          approvedBy: 'SYSTEM_FOUNDER',
        },
        {
          id: 'user-owner',
          role: 'super_admin',
          requestedRole: 'super_admin',
          identifier: 'admin@samo.pharma',
          name: 'صاحب المذخر',
          pharmacyName: 'إدارة مذخر سامو',
          phone: '07700000000',
          email: 'admin@samo.pharma',
          status: 'approved',
          createdAt: new Date().toISOString(),
          approvedAt: new Date().toISOString(),
          approvedBy: 'SYSTEM_BOOTSTRAP',
        },
        {
          id: 'user-pharma-demo',
          role: 'pharmacist_staff',
          requestedRole: 'pharmacist_staff',
          identifier: '07712345678',
          name: 'د. علي حسين',
          pharmacyName: 'صيدلية الشفاء المركزية',
          phone: '07712345678',
          email: 'alishifa@gmail.com',
          status: 'approved',
          createdAt: new Date().toISOString(),
          approvedAt: new Date().toISOString(),
        }
      ];
    }

    // Always ensure founder account is approved and never pending or missing
    const founderIdx = users.findIndex(
      u => u.identifier.toLowerCase() === 'mohammedjafaralkabi@gmail.com' ||
           (u.email && u.email.toLowerCase() === 'mohammedjafaralkabi@gmail.com')
    );
    const founderUser: AppUser = {
      id: founderIdx !== -1 ? users[founderIdx].id : 'user-super-admin-master',
      role: 'super_admin',
      requestedRole: 'super_admin',
      identifier: 'mohammedjafaralkabi@gmail.com',
      name: 'محمد جعفر الكعبي (المؤسس والمشرف العام)',
      pharmacyName: 'الإدارة العامة العليا لمذخر سامو',
      phone: '07700000000',
      email: 'mohammedjafaralkabi@gmail.com',
      status: 'approved',
      founder: true,
      createdAt: founderIdx !== -1 ? users[founderIdx].createdAt : new Date().toISOString(),
      approvedAt: new Date().toISOString(),
      approvedBy: 'SYSTEM_FOUNDER',
    };

    if (founderIdx !== -1) {
      users[founderIdx] = { ...users[founderIdx], ...founderUser, status: 'approved', role: 'super_admin', founder: true };
    } else {
      users.unshift(founderUser);
    }

    return users;
  },

  saveRegisteredUsers(users: AppUser[]) {
    try {
      localStorage.setItem(STORAGE_KEYS.REGISTERED_USERS, JSON.stringify(users));
    } catch (e) {
      console.error('Error saving registered users:', e);
    }
  },

  approveUser(userId: string, role?: UserRole, approvedBy?: string): AppUser | null {
    const users = this.getRegisteredUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx !== -1) {
      users[idx] = {
        ...users[idx],
        status: 'approved',
        role: role || users[idx].requestedRole || users[idx].role,
        approvedAt: new Date().toISOString(),
        approvedBy: approvedBy || 'super_admin',
      };
      this.saveRegisteredUsers(users);
      const current = this.getCurrentUser();
      if (current && current.id === userId) {
        this.setCurrentUser(users[idx]);
      }
      return users[idx];
    }
    return null;
  },

  updateUserStatus(userId: string, status: 'approved' | 'rejected' | 'pending' | 'deactivated', role?: UserRole): AppUser | null {
    const users = this.getRegisteredUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx !== -1) {
      users[idx] = {
        ...users[idx],
        status,
        role: role || users[idx].role,
        approvedAt: status === 'approved' ? new Date().toISOString() : users[idx].approvedAt,
      };
      this.saveRegisteredUsers(users);
      // If current user is updated, sync
      const current = this.getCurrentUser();
      if (current && current.id === userId) {
        this.setCurrentUser(users[idx]);
      }
      return users[idx];
    }
    return null;
  },

  updateUser(user: AppUser): AppUser {
    const users = this.getRegisteredUsers();
    const idx = users.findIndex(u => u.id === user.id);
    if (idx !== -1) {
      users[idx] = { ...users[idx], ...user };
      this.saveRegisteredUsers(users);
    } else {
      users.unshift(user);
      this.saveRegisteredUsers(users);
    }
    const current = this.getCurrentUser();
    if (current && (current.id === user.id || current.identifier === user.identifier)) {
      this.setCurrentUser({ ...current, ...user });
    }
    return user;
  },

  getOwnerPIN(): string {
    try {
      return localStorage.getItem(STORAGE_KEYS.OWNER_PIN) || '1234';
    } catch {
      return '1234';
    }
  },

  setOwnerPIN(pin: string) {
    try {
      localStorage.setItem(STORAGE_KEYS.OWNER_PIN, pin);
    } catch {}
  },

  getOwnerPasscodeVersion(): number {
    try {
      return parseInt(localStorage.getItem('samo_owner_passcode_ver') || '0', 10);
    } catch {
      return 0;
    }
  },

  setOwnerPasscodeVersion(version: number) {
    try {
      localStorage.setItem('samo_owner_passcode_ver', String(version));
    } catch {}
  },

  // Shared Cart Storage & Synchronization (per pharmacy)
  getSharedCart(pharmacyName: string): CartItem[] {
    if (!pharmacyName) return [];
    try {
      const key = `samo_shared_cart_${encodeURIComponent(pharmacyName.trim().toLowerCase())}`;
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveSharedCart(pharmacyName: string, items: CartItem[], updatedBy?: string) {
    if (!pharmacyName) return;
    try {
      const key = `samo_shared_cart_${encodeURIComponent(pharmacyName.trim().toLowerCase())}`;
      localStorage.setItem(key, JSON.stringify(items));
      // Asynchronously sync to server
      this.pushSharedCartToServer(pharmacyName, items, updatedBy).catch(() => {});
    } catch (e) {
      console.error('Error saving shared cart:', e);
    }
  },

  clearSharedCart(pharmacyName: string) {
    if (!pharmacyName) return;
    try {
      const key = `samo_shared_cart_${encodeURIComponent(pharmacyName.trim().toLowerCase())}`;
      localStorage.removeItem(key);
      fetch(`/api/cart?pharmacy=${encodeURIComponent(pharmacyName)}`, { method: 'DELETE' }).catch(() => {});
    } catch {}
  },

  async syncSharedCartFromServer(pharmacyName: string): Promise<CartItem[]> {
    if (!pharmacyName) return [];
    try {
      const res = await fetch(`/api/cart?pharmacy=${encodeURIComponent(pharmacyName)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.items)) {
          const key = `samo_shared_cart_${encodeURIComponent(pharmacyName.trim().toLowerCase())}`;
          localStorage.setItem(key, JSON.stringify(data.items));
          return data.items;
        }
      }
    } catch {
      // Offline fallback
    }
    return this.getSharedCart(pharmacyName);
  },

  async pushSharedCartToServer(pharmacyName: string, items: CartItem[], updatedBy?: string): Promise<void> {
    if (!pharmacyName) return;
    try {
      await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pharmacyName,
          items,
          updatedBy,
          mode: 'replace',
        }),
      });
    } catch {
      // ignore offline
    }
  },

  // Merge items into an existing pending order or create a new order
  createOrMergeOrder(orderData: Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'status'> & { id?: string; orderNumber?: string }): Order {
    const orders = this.getOrders();
    const cleanPharm = orderData.pharmacyName.trim().toLowerCase();

    // Check if there is an unconfirmed pending order for this pharmacy
    const pendingIndex = orders.findIndex(
      (o) => o.pharmacyName.trim().toLowerCase() === cleanPharm && (o.status === 'new' || o.status === 'pending')
    );

    if (pendingIndex !== -1) {
      const existing = orders[pendingIndex];
      const mergedItems = [...existing.items];

      orderData.items.forEach((newItem) => {
        const existIdx = mergedItems.findIndex((it) => it.productId === newItem.productId);
        if (existIdx !== -1) {
          const prev = mergedItems[existIdx];
          const newQty = prev.quantity + newItem.quantity;
          const newBonus = (prev.bonusQuantity || 0) + (newItem.bonusQuantity || 0);
          mergedItems[existIdx] = {
            ...prev,
            quantity: newQty,
            bonusQuantity: newBonus,
            totalPrice: newQty * (newItem.unitPrice || prev.unitPrice || 0),
          };
        } else {
          mergedItems.push(newItem);
        }
      });

      const totalQty = mergedItems.reduce((sum, it) => sum + (it.quantity || 0), 0);
      const totalBonus = mergedItems.reduce((sum, it) => sum + (it.bonusQuantity || 0), 0);
      const totalAmount = mergedItems.reduce((sum, it) => sum + (it.totalPrice || 0), 0);
      const mergedNotes = [existing.notes, orderData.notes].filter(Boolean).join(' | ');

      const updatedOrder: Order = {
        ...existing,
        items: mergedItems,
        totalQuantity: totalQty,
        totalBonus: totalBonus,
        totalAmount: totalAmount,
        notes: mergedNotes,
        phone: orderData.phone || existing.phone,
        address: orderData.address || existing.address,
        pharmacistName: orderData.pharmacistName
          ? existing.pharmacistName.includes(orderData.pharmacistName)
            ? existing.pharmacistName
            : `${existing.pharmacistName} و ${orderData.pharmacistName}`
          : existing.pharmacistName,
      };

      orders[pendingIndex] = updatedOrder;
      this.saveOrders(orders);
      this.clearSharedCart(orderData.pharmacyName);
      return updatedOrder;
    }

    // Otherwise create new order
    const newOrder: Order = {
      ...orderData,
      id: orderData.id || `ord-${Date.now()}`,
      orderNumber: orderData.orderNumber || `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
      createdAt: new Date().toISOString(),
      status: 'new',
    };

    orders.unshift(newOrder);
    this.saveOrders(orders);
    this.clearSharedCart(orderData.pharmacyName);
    return newOrder;
  }
};
