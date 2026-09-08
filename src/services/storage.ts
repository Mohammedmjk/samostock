import { Product, Order, WarehouseSettings, CartItem, AppUser, UserRole, AuthorizationRequestMessage, UserPharmacyBranch } from '../types';
import { initialProducts, initialOrders, initialWarehouseSettings } from '../data/initialProducts';
import { cacheProductsOffline, cacheOrdersOffline } from './db';

const STORAGE_KEYS = {
  PRODUCTS: 'samo_warehouse_products_v3',
  ORDERS: 'samo_warehouse_orders_v3',
  SETTINGS: 'samo_warehouse_settings_v3',
  PENDING_SYNC: 'samo_warehouse_pending_sync_v3',
  PHARMACY_PROFILE: 'samo_warehouse_pharmacy_profile_v3',
  CURRENT_USER: 'samo_warehouse_current_user_v3',
  SESSION: 'samo_user_session',
  REGISTERED_USERS: 'samo_warehouse_registered_users_v3',
  OWNER_PIN: 'samo_warehouse_owner_pin_v3',
  AUTHORIZATION_MESSAGES: 'samo_warehouse_auth_messages_v3',
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

  getPharmaciesForPhone(phone?: string): UserPharmacyBranch[] {
    try {
      const cleanPhone = (phone || '').trim().replace(/[^0-9]/g, '');
      const allPharmaciesMap: Record<string, UserPharmacyBranch[]> = JSON.parse(
        localStorage.getItem('samo_user_pharmacy_branches_v1') || '{}'
      );
      const list: UserPharmacyBranch[] = cleanPhone && allPharmaciesMap[cleanPhone] ? [...allPharmaciesMap[cleanPhone]] : [];

      // Also incorporate current logged-in user's pharmacies if attached
      const currentUser = this.getCurrentUser();
      if (currentUser?.pharmacies && Array.isArray(currentUser.pharmacies)) {
        currentUser.pharmacies.forEach((p) => {
          if (!list.some((item) => item.id === p.id || item.name.trim().toLowerCase() === p.name.trim().toLowerCase())) {
            list.push(p);
          }
        });
      }

      // Check registered users for any other records with this phone number
      if (cleanPhone) {
        const regUsers = this.getRegisteredUsers();
        regUsers.forEach((u) => {
          const uPhone = (u.phone || u.identifier || '').replace(/[^0-9]/g, '');
          if (uPhone && uPhone === cleanPhone && u.pharmacyName) {
            if (!list.some((item) => item.name.trim().toLowerCase() === u.pharmacyName.trim().toLowerCase())) {
              list.push({
                id: `branch-reg-${u.id}`,
                name: u.pharmacyName,
                pharmacistName: u.name || u.pharmacistName,
                phone: u.phone || phone || '',
                address: u.address || '',
                isDefault: list.length === 0,
                createdAt: u.createdAt || new Date().toISOString(),
              });
            }
          }
        });
      }

      // If still empty, seed with current profile or current user
      if (list.length === 0) {
        const saved = this.getSavedPharmacyProfile();
        if (saved.name) {
          list.push({
            id: `branch-default-${Date.now()}`,
            name: saved.name,
            pharmacistName: saved.pharmacist,
            phone: saved.phone || phone || '',
            address: saved.address,
            isDefault: true,
            createdAt: new Date().toISOString(),
          });
        } else if (currentUser?.pharmacyName) {
          list.push({
            id: `branch-${currentUser.id || Date.now()}`,
            name: currentUser.pharmacyName,
            pharmacistName: currentUser.name || currentUser.pharmacistName,
            phone: currentUser.phone || phone || '',
            address: currentUser.address || '',
            isDefault: true,
            createdAt: currentUser.createdAt || new Date().toISOString(),
          });
        }
      }

      return list;
    } catch {
      return [];
    }
  },

  savePharmacyForPhone(phone: string, branch: Omit<UserPharmacyBranch, 'id'> & { id?: string }): UserPharmacyBranch {
    const cleanPhone = (phone || '').trim().replace(/[^0-9]/g, '');
    const newBranch: UserPharmacyBranch = {
      id: branch.id || `branch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: branch.name.trim(),
      pharmacistName: branch.pharmacistName?.trim(),
      phone: (branch.phone || phone || '').trim(),
      address: branch.address?.trim() || '',
      city: branch.city?.trim() || '',
      notes: branch.notes?.trim() || '',
      createdAt: branch.createdAt || new Date().toISOString(),
      isDefault: branch.isDefault || false,
    };

    try {
      const allPharmaciesMap: Record<string, UserPharmacyBranch[]> = JSON.parse(
        localStorage.getItem('samo_user_pharmacy_branches_v1') || '{}'
      );
      const list = allPharmaciesMap[cleanPhone] || [];
      const existingIdx = list.findIndex(
        (b) => b.id === newBranch.id || b.name.trim().toLowerCase() === newBranch.name.toLowerCase()
      );
      if (existingIdx !== -1) {
        list[existingIdx] = { ...list[existingIdx], ...newBranch };
      } else {
        list.push(newBranch);
      }
      allPharmaciesMap[cleanPhone] = list;
      localStorage.setItem('samo_user_pharmacy_branches_v1', JSON.stringify(allPharmaciesMap));

      // Update current user session
      const currentUser = this.getCurrentUser();
      if (currentUser && (currentUser.phone?.replace(/[^0-9]/g, '') === cleanPhone || currentUser.identifier === phone)) {
        const updatedUser: AppUser = {
          ...currentUser,
          pharmacyName: newBranch.name,
          pharmacistName: newBranch.pharmacistName || currentUser.pharmacistName,
          address: newBranch.address || currentUser.address,
          pharmacies: list,
          activePharmacyId: newBranch.id,
        };
        this.setCurrentUser(updatedUser);
      }

      // Update active pharmacy profile
      this.savePharmacyProfile({
        name: newBranch.name,
        pharmacist: newBranch.pharmacistName || '',
        phone: newBranch.phone || phone,
        address: newBranch.address,
      });
    } catch (e) {
      console.error('Error saving pharmacy branch:', e);
    }

    return newBranch;
  },

  setActivePharmacyForPhone(phone: string, branchId: string): UserPharmacyBranch | null {
    const list = this.getPharmaciesForPhone(phone);
    const selected = list.find((b) => b.id === branchId);
    if (!selected) return null;

    try {
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      if (cleanPhone) {
        localStorage.setItem(`samo_active_branch_${cleanPhone}`, branchId);
      }
      this.savePharmacyProfile({
        name: selected.name,
        pharmacist: selected.pharmacistName || '',
        phone: selected.phone || phone,
        address: selected.address,
      });

      const currentUser = this.getCurrentUser();
      if (currentUser) {
        const updatedUser: AppUser = {
          ...currentUser,
          pharmacyName: selected.name,
          pharmacistName: selected.pharmacistName || currentUser.pharmacistName,
          address: selected.address || currentUser.address,
          activePharmacyId: selected.id,
        };
        this.setCurrentUser(updatedUser);
      }
    } catch (e) {
      console.error('Error setting active branch:', e);
    }

    return selected;
  },

  deletePharmacyBranch(phone: string, branchId: string): boolean {
    try {
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      const allPharmaciesMap: Record<string, UserPharmacyBranch[]> = JSON.parse(
        localStorage.getItem('samo_user_pharmacy_branches_v1') || '{}'
      );
      if (allPharmaciesMap[cleanPhone]) {
        allPharmaciesMap[cleanPhone] = allPharmaciesMap[cleanPhone].filter((b) => b.id !== branchId);
        localStorage.setItem('samo_user_pharmacy_branches_v1', JSON.stringify(allPharmaciesMap));
        return true;
      }
    } catch {}
    return false;
  },

  deleteOrder(orderId: string) {
    this.trackDeletedOrder(orderId);
    const orders = this.getOrders().filter(o => o.id !== orderId);
    this.saveOrders(orders);
    const pending = this.getPendingSyncOrders().filter(o => o.id !== orderId);
    localStorage.setItem(STORAGE_KEYS.PENDING_SYNC, JSON.stringify(pending));
  },

  deleteOrders(orderIds: string[]) {
    orderIds.forEach(id => this.trackDeletedOrder(id));
    const idSet = new Set(orderIds);
    const orders = this.getOrders().filter(o => !idSet.has(o.id));
    this.saveOrders(orders);
    const pending = this.getPendingSyncOrders().filter(o => !idSet.has(o.id));
    localStorage.setItem(STORAGE_KEYS.PENDING_SYNC, JSON.stringify(pending));
  },

  getDeletedOrderIds(): string[] {
    try {
      const key = 'samo_warehouse_deleted_orders_v3';
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      return [];
    }
  },

  trackDeletedOrder(orderId: string) {
    try {
      const key = 'samo_warehouse_deleted_orders_v3';
      const existing: string[] = JSON.parse(localStorage.getItem(key) || '[]');
      if (!existing.includes(orderId)) {
        existing.push(orderId);
        if (existing.length > 500) existing.splice(0, existing.length - 500);
        localStorage.setItem(key, JSON.stringify(existing));
      }
    } catch {}
  },

  isOrderDeleted(orderId: string): boolean {
    try {
      const key = 'samo_warehouse_deleted_orders_v3';
      const existing: string[] = JSON.parse(localStorage.getItem(key) || '[]');
      return existing.includes(orderId);
    } catch {
      return false;
    }
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
      const cleanId = (id || '').trim();
      // Founder & master staff are immune to deletion or blocking
      if (
        cleanIdent === 'mohammedjafaralkabi@gmail.com' ||
        cleanIdent === 'staff@samo.pharma' ||
        cleanIdent === 'admin2026' ||
        cleanIdent === 'staff2026' ||
        cleanId === 'user-super-admin-master' ||
        cleanId === 'founder_admin'
      ) return;

      const deletedListKey = 'samo_warehouse_deleted_users_records_v3';
      const list: any[] = JSON.parse(localStorage.getItem(deletedListKey) || '[]');
      list.push({ id: cleanId, identifier: cleanIdent, pharmacyName: (pharmacyName || '').trim(), timestamp: Date.now() });
      localStorage.setItem(deletedListKey, JSON.stringify(list));
    } catch {}
  },

  removeDeletedUser(id?: string, identifier?: string, pharmacyName?: string, phone?: string) {
    try {
      const cleanId = (id || '').trim();
      const cleanIdent = (identifier || '').trim().toLowerCase();
      const cleanPharm = (pharmacyName || '').trim().toLowerCase();
      const cleanPhone = (phone || '').replace(/[^0-9]/g, '');

      const deletedListKey = 'samo_warehouse_deleted_users_records_v3';
      const list: any[] = JSON.parse(localStorage.getItem(deletedListKey) || '[]');
      const filtered = list.filter(item => {
        if (!item) return false;
        if (cleanId && item.id === cleanId) return false;
        if (cleanIdent && item.identifier && item.identifier.toLowerCase() === cleanIdent) return false;
        if (cleanPharm && item.pharmacyName && item.pharmacyName.toLowerCase() === cleanPharm) return false;
        if (cleanPhone && item.phone && item.phone.replace(/[^0-9]/g, '') === cleanPhone) return false;
        return true;
      });
      localStorage.setItem(deletedListKey, JSON.stringify(filtered));

      if (cleanPharm) {
        this.removeDeletedPharmacy(cleanPharm);
      }
    } catch {}
  },

  removeDeletedPharmacy(pharmacyName: string) {
    try {
      const clean = pharmacyName.trim().toLowerCase();
      if (!clean) return;
      const key = 'samo_warehouse_deleted_pharmacies_v3';
      const deleted: string[] = JSON.parse(localStorage.getItem(key) || '[]');
      const filtered = deleted.filter(p => p.trim().toLowerCase() !== clean);
      localStorage.setItem(key, JSON.stringify(filtered));
    } catch {}
  },

  isUserDeleted(id?: string, identifier?: string, pharmacyName?: string): boolean {
    try {
      const cleanIdent = (identifier || '').trim().toLowerCase();
      const cleanId = (id || '').trim();
      const cleanPharm = (pharmacyName || '').trim().toLowerCase();

      // Founder, master credentials, and staff passcode accounts are immune to deletion
      if (
        cleanIdent === 'mohammedjafaralkabi@gmail.com' ||
        cleanIdent === 'staff@samo.pharma' ||
        cleanIdent === 'admin2026' ||
        cleanIdent === 'staff2026' ||
        cleanId === 'user-super-admin-master' ||
        cleanId === 'founder_admin' ||
        cleanId.startsWith('staff_')
      ) {
        return false;
      }

      // If user is currently approved in registered users, they are active and NOT deleted
      const registered = this.getRegisteredUsers();
      const activeUser = registered.find(u =>
        (cleanId && u.id === cleanId) ||
        (cleanIdent && u.identifier && u.identifier.toLowerCase() === cleanIdent) ||
        (cleanIdent && u.email && u.email.toLowerCase() === cleanIdent)
      );
      if (activeUser && activeUser.status === 'approved') {
        return false;
      }

      const deletedListKey = 'samo_warehouse_deleted_users_records_v3';
      const list: any[] = JSON.parse(localStorage.getItem(deletedListKey) || '[]');

      const matchedInDeletedUsers = list.some(item => 
        (cleanId && item.id && item.id === cleanId) ||
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

  validateSession(user: AppUser | null): { valid: boolean; reason?: 'none' | 'deleted' | 'unapproved' | 'blocked' | 'pin_changed' } {
    if (!user) return { valid: false, reason: 'none' };

    try {
      const uId = String(user.id || '');
      const uIdent = String(user.identifier || '').toLowerCase().trim();
      const uEmail = String(user.email || '').toLowerCase().trim();

      // Founder & Passcode-authenticated Staff bypass all deletion/blocking checks
      if (
        user.founder ||
        user.role === 'founder' ||
        user.authProvider === 'passcode' ||
        user.role === 'staff' ||
        user.role === 'pharmacist_staff' ||
        user.role === 'warehouse' ||
        uId === 'founder_admin' ||
        uId.startsWith('staff_') ||
        uIdent === 'mohammedjafaralkabi@gmail.com' ||
        uIdent === 'staff@samo.pharma' ||
        uEmail === 'mohammedjafaralkabi@gmail.com'
      ) {
        return { valid: true };
      }

    // 1. Is user deleted? (Only for genuinely deleted accounts)
    if (this.isUserDeleted(user.id, user.identifier, user.pharmacyName)) {
      this.setCurrentUser(null);
      this.clearPharmacyProfile();
      return { valid: false, reason: 'deleted' };
    }

    // 2. Is user rejected, deactivated, or blocked?
    if (user.status === 'blocked') {
      this.setCurrentUser(null);
      return { valid: false, reason: 'blocked' };
    }
    if (user.status === 'rejected' || user.status === 'deactivated') {
      return { valid: false, reason: 'unapproved' };
    }

    // Check if registered users store has newer status for this user
    try {
      const registered = this.getRegisteredUsers();
      const existing = registered.find(
        u =>
          (u.id && u.id === user.id) ||
          (u.identifier && user.identifier && u.identifier.toLowerCase() === user.identifier.toLowerCase()) ||
          (u.email && user.email && u.email.toLowerCase() === user.email.toLowerCase()) ||
          (u.phone && user.phone && u.phone.replace(/[^0-9]/g, '') === user.phone.replace(/[^0-9]/g, ''))
      );
      if (existing) {
        if (existing.status === 'blocked') {
          this.setCurrentUser(null);
          return { valid: false, reason: 'blocked' };
        }
        if (existing.status === 'rejected' || existing.status === 'deactivated') {
          return { valid: false, reason: 'unapproved' };
        }
        // Auto-upgrade status if approved in registered users
        if (existing.status === 'approved') {
          user.status = 'approved';
          if (existing.role && existing.role !== 'pending') {
            user.role = existing.role;
          }
          this.removeDeletedUser(user.id, user.identifier, user.pharmacyName, user.phone);
          this.setCurrentUser(user);
        }
      }
    } catch {}

    // 3. If owner / super_admin: check passcodeVersion!
    if (user.role === 'owner' || user.role === 'super_admin') {
      const currentPinVer = this.getOwnerPasscodeVersion();
      if (currentPinVer > 0 && (!user.passcodeVersion || user.passcodeVersion < currentPinVer)) {
        this.setCurrentUser(null);
        return { valid: false, reason: 'pin_changed' };
      }
    }

    return { valid: true };
    } catch {
      return { valid: true };
    }
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

  // User Authentication & Access Control (Persistent Sessions)
  getCurrentUser(): AppUser | null {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('samo_logged_out_flag');
      }
      const data = localStorage.getItem(STORAGE_KEYS.SESSION) || localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      if (!data) {
        // Auto-initialize Founder & General Manager session so the warehouse system works immediately
        const defaultFounder: AppUser = {
          id: 'founder_admin',
          role: 'founder',
          requestedRole: 'founder',
          identifier: 'admin2026',
          email: 'mohammedjafaralkabi@gmail.com',
          name: 'محمد جعفر الكعبي (إدارة المذخر)',
          pharmacyName: 'الإدارة العامة لمذخر سامو',
          status: 'approved',
          founder: true,
          createdAt: new Date().toISOString(),
          approvedAt: new Date().toISOString(),
          approvedBy: 'النظام الأساسي (مؤسس المذخر)',
          profileCompleted: true,
          authProvider: 'passcode',
        };
        const json = JSON.stringify(defaultFounder);
        localStorage.setItem(STORAGE_KEYS.SESSION, json);
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, json);
        return defaultFounder;
      }
      const user: AppUser = JSON.parse(data);
      if (!user) return null;

      // Protected Founder check - Founder can never be locked out or blocked
      if (
        user.id === 'founder_admin' ||
        user.role === 'founder' ||
        user.founder ||
        (user.identifier && user.identifier.toLowerCase() === 'mohammedjafaralkabi@gmail.com') ||
        (user.email && user.email.toLowerCase() === 'mohammedjafaralkabi@gmail.com')
      ) {
        user.status = 'approved';
        user.role = 'founder';
        user.founder = true;
        return user;
      }

      // If user status is blocked, immediately clear session and return null
      if (user.status === 'blocked' || user.status === 'rejected') {
        localStorage.removeItem(STORAGE_KEYS.SESSION);
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
        return null;
      }

      return user;
    } catch {
      return null;
    }
  },

  setCurrentUser(user: AppUser | null) {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('samo_logged_out_flag');
      }
      if (user) {
        const json = JSON.stringify(user);
        localStorage.setItem(STORAGE_KEYS.SESSION, json);
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, json);
      } else {
        localStorage.removeItem(STORAGE_KEYS.SESSION);
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      }
    } catch (e) {
      console.error('Error saving current user:', e);
    }
  },

  blockUser(userId: string) {
    const users = this.getRegisteredUsers();
    const target = users.find(u => u.id === userId);
    if (target) {
      target.status = 'blocked';
      this.saveRegisteredUsers(users);
    }
    const current = this.getCurrentUser();
    if (current && current.id === userId) {
      this.setCurrentUser(null);
    }
  },

  unblockUser(userId: string) {
    const users = this.getRegisteredUsers();
    const target = users.find(u => u.id === userId);
    if (target) {
      target.status = 'approved';
      this.saveRegisteredUsers(users);
      this.removeDeletedUser(target.id, target.identifier, target.pharmacyName, target.phone);
    } else {
      this.removeDeletedUser(userId);
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
      users = [];
    }

    if (!Array.isArray(users)) {
      users = [];
    }

    // Filter out any obsolete mock accounts and permanently deleted accounts
    users = users.filter(u => {
      if (!u) return false;
      const id = u.id || '';
      const email = (u.email || u.identifier || '').toLowerCase().trim();
      // Founder is always kept
      if (id === 'user-super-admin-master' || email === 'mohammedjafaralkabi@gmail.com' || u.founder) {
        return true;
      }
      // Filter out demo/mock accounts
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
      // Filter out deleted users
      if (this.isUserDeleted(u.id, u.identifier, u.pharmacyName)) {
        return false;
      }
      return true;
    });

    return users;
  },

  saveRegisteredUsers(users: AppUser[]) {
    try {
      // Filter out mock accounts before persisting
      const cleanUsers = users.filter(u => {
        if (!u) return false;
        const id = u.id || '';
        const email = (u.email || u.identifier || '').toLowerCase().trim();
        if (id === 'user-super-admin-master' || email === 'mohammedjafaralkabi@gmail.com' || u.founder) {
          return true;
        }
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
        return !this.isUserDeleted(u.id, u.identifier, u.pharmacyName);
      });
      localStorage.setItem(STORAGE_KEYS.REGISTERED_USERS, JSON.stringify(cleanUsers));
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
      this.removeDeletedUser(users[idx].id, users[idx].identifier, users[idx].pharmacyName, users[idx].phone);
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
    if (status === 'approved') {
      this.removeDeletedUser(userId);
    }
    const users = this.getRegisteredUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx !== -1) {
      users[idx] = {
        ...users[idx],
        status,
        role: role || users[idx].role,
        approvedAt: status === 'approved' ? new Date().toISOString() : users[idx].approvedAt,
      };
      if (status === 'approved') {
        this.removeDeletedUser(users[idx].id, users[idx].identifier, users[idx].pharmacyName, users[idx].phone);
      }
      this.saveRegisteredUsers(users);
      // If current user is updated, sync
      const current = this.getCurrentUser();
      if (current && current.id === userId) {
        this.setCurrentUser(users[idx]);
      }
      return users[idx];
    } else {
      const newUser: AppUser = {
        id: userId,
        identifier: userId,
        name: 'مستخدم معتمد',
        pharmacyName: '',
        role: role || 'pharmacy',
        status,
        approvedAt: status === 'approved' ? new Date().toISOString() : undefined,
        createdAt: new Date().toISOString(),
      };
      users.push(newUser);
      this.saveRegisteredUsers(users);
      return newUser;
    }
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
  },

  addOrder(newOrder: Order): Order {
    const orders = this.getOrders();
    // Prevent duplicate if already added
    const existingIndex = orders.findIndex((o) => o.id === newOrder.id);
    if (existingIndex !== -1) {
      orders[existingIndex] = newOrder;
    } else {
      orders.unshift(newOrder);
    }
    this.saveOrders(orders);
    return newOrder;
  },

  getAuthorizationMessages(): AuthorizationRequestMessage[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.AUTHORIZATION_MESSAGES);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('Error reading authorization messages:', e);
    }
    return [];
  },

  saveAuthorizationMessages(messages: AuthorizationRequestMessage[]) {
    try {
      localStorage.setItem(STORAGE_KEYS.AUTHORIZATION_MESSAGES, JSON.stringify(messages));
    } catch (e) {
      console.error('Error saving authorization messages:', e);
    }
  },

  addAuthorizationMessage(msg: AuthorizationRequestMessage) {
    const list = this.getAuthorizationMessages();
    const existingIndex = list.findIndex(m => m.id === msg.id || m.requestId === msg.requestId || m.userId === msg.userId);
    if (existingIndex >= 0) {
      list[existingIndex] = { ...list[existingIndex], ...msg };
    } else {
      list.unshift(msg);
    }
    this.saveAuthorizationMessages(list);
  },

  updateAuthorizationMessageStatus(
    idOrUserId: string,
    status: 'approved' | 'rejected',
    approvedBy?: string
  ) {
    const list = this.getAuthorizationMessages();
    let changed = false;
    const updated = list.map(m => {
      if (m.id === idOrUserId || m.userId === idOrUserId || m.requestId === idOrUserId) {
        changed = true;
        return {
          ...m,
          status,
          approvedAt: new Date().toISOString(),
          approvedBy: approvedBy || 'إدارة مذخر سامو'
        };
      }
      return m;
    });
    if (changed) {
      this.saveAuthorizationMessages(updated);
    }
    return updated;
  },

  // Handled registration alerts tracking (prevents notifications from recurring after approval/rejection)
  getHandledAlertIds(): string[] {
    try {
      return JSON.parse(localStorage.getItem('samo_handled_registration_alerts_v1') || '[]');
    } catch {
      return [];
    }
  },

  markAlertHandled(...keys: (string | undefined)[]) {
    try {
      const current = this.getHandledAlertIds();
      const set = new Set(current);
      keys.forEach(k => {
        if (k && typeof k === 'string' && k.trim()) {
          set.add(k.trim().toLowerCase());
        }
      });
      localStorage.setItem('samo_handled_registration_alerts_v1', JSON.stringify(Array.from(set)));
    } catch {}
  },

  isAlertHandled(...keys: (string | undefined)[]): boolean {
    try {
      const current = new Set(this.getHandledAlertIds());
      return keys.some(k => k && typeof k === 'string' && k.trim() && current.has(k.trim().toLowerCase()));
    } catch {
      return false;
    }
  }
};
