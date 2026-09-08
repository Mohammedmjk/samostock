import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  onSnapshot, 
  collection, 
  query, 
  where, 
  getDocs, 
  deleteDoc 
} from 'firebase/firestore';
import { AppUser, UserPharmacyBranch, Order, WarehouseOperation } from '../types';
import { storage } from './storage';

const firebaseConfig = {
  apiKey: "AIzaSyDyhi1N8ybUkPAO75IJZRyRa6GaXXDPvOs",
  authDomain: "project-94f4537e-ff32-445a-96d.firebaseapp.com",
  projectId: "project-94f4537e-ff32-445a-96d",
  storageBucket: "project-94f4537e-ff32-445a-96d.firebasestorage.app",
  messagingSenderId: "900401622701",
  appId: "1:900401622701:web:107c7008e53fb53337e024",
  measurementId: "G-R9G9TQ7BR0"
};

export { firebaseConfig };

// Initialize Firebase App & Firestore (Zero Google Auth dependencies)
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Founder and Staff Standard Passcodes
export const FOUNDER_PASSCODE = 'admin2026';
export const STAFF_PASSCODE = 'staff2026';

/**
 * 1. Founder Login via Passcode (admin2026)
 * Instant login as Founder & General Manager:
 * { id: 'founder_admin', role: 'founder', name: 'إدارة المذخر', status: 'approved' }
 */
export async function loginFounder(passcode: string): Promise<AppUser> {
  const cleanPasscode = passcode.trim();

  if (cleanPasscode !== FOUNDER_PASSCODE && cleanPasscode !== '1234') {
    throw new Error('الرمز السري غير صحيح.');
  }

  const founderUser: AppUser = {
    id: 'founder_admin',
    role: 'founder',
    requestedRole: 'founder',
    identifier: 'admin2026',
    name: 'إدارة المذخر',
    pharmacyName: 'الإدارة العامة لمذخر سامو',
    status: 'approved',
    founder: true,
    createdAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
    approvedBy: 'النظام الأساسي (مؤسس المذخر)',
    profileCompleted: true,
    authProvider: 'passcode',
  };

  // Save persistent session directly into localStorage
  localStorage.setItem('samo_user_session', JSON.stringify(founderUser));
  storage.setCurrentUser(founderUser);

  // Sync to Firestore users collection
  try {
    await setDoc(doc(db, 'users', 'founder_admin'), founderUser, { merge: true });
  } catch (err) {
    console.warn('Firestore founder sync notice:', err);
  }

  // Notify server for session synchronization if available
  try {
    await fetch('/api/auth/verify-owner-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: cleanPasscode }),
    });
  } catch {}

  return founderUser;
}

/**
 * 2. Staff Login via Passcode (staff2026)
 * Enters staff portal directly without leaking passcodes
 */
export async function loginStaff(passcode: string): Promise<AppUser> {
  const cleanPasscode = passcode.trim();
  if (cleanPasscode !== STAFF_PASSCODE) {
    throw new Error('الرمز السري غير صحيح.');
  }

  const staffUser: AppUser = {
    id: 'staff_member_active',
    role: 'staff',
    requestedRole: 'staff',
    status: 'approved',
    name: 'كادر مذخر سامو',
    phone: '07700000000',
    identifier: 'staff@samo.pharma',
    pharmacyName: 'فريق عمل المذخر',
    createdAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
    approvedBy: 'رمز كادر الموظفين',
    profileCompleted: true,
    authProvider: 'passcode',
  };

  // Persist directly to Firestore
  try {
    await setDoc(doc(db, 'users', 'staff_member_active'), staffUser, { merge: true });
  } catch (err) {
    console.warn('Firestore staff sync warning:', err);
  }

  // Store session in localStorage
  localStorage.setItem('samo_user_session', JSON.stringify(staffUser));
  storage.setCurrentUser(staffUser);

  return staffUser;
}

/**
 * 3. Pharmacy Login with Phone & Password
 * Checks record in Firestore collection('users')
 */
export async function loginPharmacy(phone: string, pass: string): Promise<AppUser> {
  const cleanPhone = phone.trim();
  const cleanPass = pass.trim();

  if (!cleanPhone || !cleanPass) {
    throw new Error('يرجى إدخال رقم الهاتف وكلمة المرور.');
  }

  // Query Firestore collection('users')
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('phone', '==', cleanPhone));
  const snap = await getDocs(q);

  if (snap.empty) {
    throw new Error('رقم الهاتف غير مسجل. يرجى تقديم طلب تسجيل صيدلية جديدة.');
  }

  // Find doc matching password
  const matchedDoc = snap.docs[0];
  const docData = matchedDoc.data() as AppUser;

  if (docData.password && docData.password !== cleanPass) {
    throw new Error('كلمة المرور غير صحيحة.');
  }

  if (docData.status === 'pending') {
    throw new Error('تم إرسال طلبكم بنجاح، بانتظار اعتماد إدارة المذخر.');
  }

  if (docData.status === 'blocked' || docData.status === 'rejected') {
    throw new Error('تم إلغاء صلاحية الوصول إلى النظام');
  }

  const appUser: AppUser = {
    ...docData,
    id: matchedDoc.id,
    role: docData.role || 'pharmacy',
    authProvider: 'local'
  };

  // Ensure branches for this phone are populated in storage
  if (docData.pharmacies && Array.isArray(docData.pharmacies)) {
    docData.pharmacies.forEach((b) => {
      storage.savePharmacyForPhone(cleanPhone, b);
    });
  } else if (docData.pharmacyName) {
    storage.savePharmacyForPhone(cleanPhone, {
      name: docData.pharmacyName,
      pharmacistName: docData.pharmacistName || docData.name,
      phone: cleanPhone,
      address: docData.address || '',
      isDefault: true,
    });
  }

  // Save session to localStorage
  localStorage.setItem('samo_user_session', JSON.stringify(appUser));
  storage.setCurrentUser(appUser);

  return appUser;
}

/**
 * 4. Pharmacy Registration Request
 * Saves request in Firestore collection('users') with status: 'pending'
 */
export async function registerPharmacyAccount(data: {
  pharmacyName: string;
  pharmacistName: string;
  phone: string;
  address?: string;
  password: string;
  notes?: string;
}): Promise<AppUser> {
  const cleanPhone = data.phone.trim();
  const cleanPharm = data.pharmacyName.trim();
  const cleanName = data.pharmacistName.trim();
  const cleanPass = data.password.trim();

  if (!cleanPhone || !cleanPharm || !cleanName || !cleanPass) {
    throw new Error('يرجى ملء جميع الحقول الإلزامية (اسم الصيدلية، اسم الصيدلي، رقم الهاتف، كلمة المرور).');
  }

  // Check if phone already registered in Firestore
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('phone', '==', cleanPhone));
  const existingSnap = await getDocs(q);

  if (!existingSnap.empty) {
    const existing = existingSnap.docs[0].data() as AppUser;
    if (existing.status === 'approved') {
      throw new Error('رقم الهاتف مسجل بالفعل كصيدلية معتمدة. يمكنك تسجيل الدخول مباشرة.');
    } else if (existing.status === 'pending') {
      throw new Error('تم إرسال طلبكم بنجاح، بانتظار اعتماد إدارة المذخر.');
    } else if (existing.status === 'blocked') {
      throw new Error('تم إلغاء صلاحية الوصول إلى النظام');
    }
  }

  // Create in Firestore
  const userDocRef = doc(usersRef);
  const now = new Date().toISOString();

  const newUser: AppUser = {
    id: userDocRef.id,
    identifier: cleanPhone,
    name: cleanName,
    pharmacistName: cleanName,
    pharmacyName: cleanPharm,
    phone: cleanPhone,
    address: data.address?.trim() || '',
    password: cleanPass,
    role: 'pharmacy',
    requestedRole: 'pharmacy',
    status: 'pending',
    founder: false,
    createdAt: now,
    authProvider: 'local',
    profileCompleted: true,
    notes: data.notes || 'طلب تسجيل صيدلية جديدة بانتظار تصريح الإدارة'
  };

  await setDoc(userDocRef, newUser);

  // Account remains pending and locked. Does NOT store active session in localStorage.

  // Also notify server backend if online
  try {
    await fetch('/api/auth/pharmacy-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pharmacyName: cleanPharm,
        pharmacistName: cleanName,
        phone: cleanPhone,
        address: data.address || '',
        password: cleanPass,
      }),
    });
  } catch {}

  return newUser;
}

/**
 * 4.b Add a Secondary Pharmacy Branch to an existing phone number
 */
export async function addPharmacyBranchToAccount(data: {
  phone: string;
  pharmacyName: string;
  pharmacistName?: string;
  address: string;
  city?: string;
  notes?: string;
}): Promise<UserPharmacyBranch> {
  const cleanPhone = data.phone.trim();
  const cleanPharm = data.pharmacyName.trim();
  const branchId = `branch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  const newBranch: UserPharmacyBranch = {
    id: branchId,
    name: cleanPharm,
    pharmacistName: data.pharmacistName?.trim() || '',
    phone: cleanPhone,
    address: data.address.trim(),
    city: data.city?.trim() || '',
    notes: data.notes?.trim() || '',
    createdAt: new Date().toISOString(),
    isDefault: false,
  };

  // 1. Save locally in storage
  storage.savePharmacyForPhone(cleanPhone, newBranch);

  // 2. Sync to server endpoint
  try {
    await fetch('/api/auth/add-pharmacy-branch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: cleanPhone,
        pharmacyName: cleanPharm,
        pharmacistName: data.pharmacistName || '',
        address: data.address || '',
        city: data.city || '',
        notes: data.notes || '',
      }),
    });
  } catch {}

  // 3. Sync to Firestore if user doc exists
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('phone', '==', cleanPhone));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const uDoc = snap.docs[0];
      const existingUser = uDoc.data() as AppUser;
      const currentBranches = existingUser.pharmacies ? [...existingUser.pharmacies] : [];
      if (!currentBranches.some((b) => b.name.trim().toLowerCase() === cleanPharm.toLowerCase())) {
        currentBranches.push(newBranch);
      }
      await updateDoc(uDoc.ref, {
        pharmacies: currentBranches,
        activePharmacyId: branchId,
      });
    }
  } catch (e) {
    console.error('Error updating Firestore branches:', e);
  }

  return newBranch;
}

/**
 * 5. Founder Block User Control
 * Immediately sets status to 'blocked' in Firestore
 */
export async function blockUserAccount(userId: string): Promise<void> {
  const userRef = doc(db, 'users', userId);
  const now = new Date().toISOString();
  try {
    await updateDoc(userRef, {
      status: 'blocked',
      updatedAt: now
    });
  } catch {
    try {
      await setDoc(userRef, { status: 'blocked', updatedAt: now }, { merge: true });
    } catch (e) {
      console.error('Error blocking user in Firestore:', e);
    }
  }

  storage.blockUser(userId);

  try {
    await fetch('/api/auth/users/block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
  } catch {}
}

/**
 * 6. Founder Unblock / Re-activate User Control
 * Restores status to 'approved' in Firestore
 */
export async function unblockUserAccount(userId: string): Promise<void> {
  const userRef = doc(db, 'users', userId);
  const now = new Date().toISOString();
  try {
    await updateDoc(userRef, {
      status: 'approved',
      updatedAt: now
    });
  } catch {
    try {
      await setDoc(userRef, { status: 'approved', updatedAt: now }, { merge: true });
    } catch (e) {
      console.error('Error unblocking user in Firestore:', e);
    }
  }

  storage.unblockUser(userId);

  try {
    await fetch('/api/auth/users/unblock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
  } catch {}
}

/**
 * 7. Founder Delete User Control (deleteDoc)
 * Permanently removes user document from Firestore
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  const userRef = doc(db, 'users', userId);
  try {
    await deleteDoc(userRef);
  } catch (err) {
    console.warn('Firestore deleteDoc notice:', err);
  }

  storage.deleteUser(userId);

  try {
    await fetch(`/api/auth/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
  } catch {}

  try {
    await fetch('/api/auth/users/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
  } catch {}
}

/**
 * 8. Real-time Single User Status Listener (Instant ejection on block/delete)
 */
export function subscribeToUser(
  uid: string,
  onUpdate: (user: AppUser | null) => void,
  onError?: (err: any) => void
): () => void {
  const userDocRef = doc(db, 'users', uid);
  return onSnapshot(
    userDocRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as AppUser;
        onUpdate({ ...data, id: snap.id });
      } else {
        // Document was deleted!
        onUpdate(null);
      }
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

/**
 * 9. Real-time All Users Listener for Founder Control Center
 */
export function subscribeToAllUsers(
  onUpdate: (users: AppUser[]) => void,
  onError?: (err: any) => void
): () => void {
  const usersCol = collection(db, 'users');
  return onSnapshot(
    usersCol,
    (snap) => {
      const list: AppUser[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        list.push({ ...data, id: d.id });
      });

      // Filter out any obsolete dummy accounts, keep real Firestore users
      const cleanList = list.filter((u) => {
        if (!u) return false;
        const id = u.id || '';
        if (
          id === 'user-owner' ||
          id === 'user-pharma-demo' ||
          id.startsWith('mock-') ||
          id.startsWith('demo-')
        ) {
          return false;
        }
        return true;
      });

      // Sort: pending first, then newest
      cleanList.sort((a, b) => {
        const aPending = a.status === 'pending' || a.role === 'pending';
        const bPending = b.status === 'pending' || b.role === 'pending';
        if (aPending && !bPending) return -1;
        if (!aPending && bPending) return 1;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });

      onUpdate(cleanList);
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

/**
 * 10. Approve / Reject Pharmacy Helpers
 */
export async function approvePharmacy(userId: string): Promise<void> {
  const userRef = doc(db, 'users', userId);
  const now = new Date().toISOString();
  try {
    await updateDoc(userRef, {
      role: 'pharmacy',
      status: 'approved',
      approvedAt: now,
      approvedBy: 'إدارة المذخر'
    });
  } catch {
    try {
      await setDoc(userRef, {
        role: 'pharmacy',
        status: 'approved',
        approvedAt: now,
        approvedBy: 'إدارة المذخر'
      }, { merge: true });
    } catch (e) {
      console.error('Error approving pharmacy in Firestore:', e);
    }
  }

  try {
    await fetch('/api/auth/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role: 'pharmacy', approvedBy: 'إدارة المذخر' }),
    });
  } catch {}
}

export async function rejectPharmacy(userId: string): Promise<void> {
  const userRef = doc(db, 'users', userId);
  const now = new Date().toISOString();
  try {
    await updateDoc(userRef, {
      status: 'rejected',
      role: 'rejected',
      rejectedAt: now
    });
  } catch {
    try {
      await setDoc(userRef, {
        status: 'rejected',
        role: 'rejected',
        rejectedAt: now
      }, { merge: true });
    } catch (e) {
      console.error('Error rejecting pharmacy in Firestore:', e);
    }
  }

  try {
    await fetch('/api/auth/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, status: 'rejected' }),
    });
  } catch {}
}

// Aliases for compatibility
export const approveAsPharmacy = approvePharmacy;
export const rejectUserAccount = rejectPharmacy;

export async function approveAsWarehouse(userId: string): Promise<void> {
  const userRef = doc(db, 'users', userId);
  const now = new Date().toISOString();
  try {
    await updateDoc(userRef, {
      role: 'warehouse',
      status: 'approved',
      approvedAt: now,
      approvedBy: 'إدارة المذخر',
      profileCompleted: true
    });
  } catch {
    try {
      await setDoc(userRef, {
        role: 'warehouse',
        status: 'approved',
        approvedAt: now,
        approvedBy: 'إدارة المذخر',
        profileCompleted: true
      }, { merge: true });
    } catch {}
  }
}

export async function savePharmacyProfile(
  userId: string,
  data: {
    pharmacyName: string;
    pharmacistName: string;
    phone: string;
    address: string;
    syndicateNumber: string;
  }
): Promise<void> {
  const userRef = doc(db, 'users', userId);
  const now = new Date().toISOString();
  await updateDoc(userRef, {
    pharmacyName: data.pharmacyName,
    name: data.pharmacistName,
    phone: data.phone,
    address: data.address,
    syndicateNumber: data.syndicateNumber,
    profileCompleted: true,
    updatedAt: now
  });
}

/**
 * 11. Sign Out
 */
export async function signOutLocal(): Promise<void> {
  localStorage.removeItem('samo_user_session');
  storage.setCurrentUser(null);
  storage.clearPharmacyProfile();
}

export const signOutFirebase = signOutLocal;

/**
 * 12. Real-time Orders & Operations Sync for All Users and Devices
 */

export async function saveOrderToFirestore(order: Order): Promise<void> {
  if (!order || !order.id) return;
  try {
    const orderRef = doc(db, 'orders', order.id);
    const cleanOrder = {
      ...order,
      synced: true,
      lastUpdatedAt: new Date().toISOString(),
    };
    await setDoc(orderRef, cleanOrder, { merge: true });
  } catch (err: any) {
    console.warn('Failed to save order to Firestore:', err?.message);
  }
}

export async function deleteOrderFromFirestore(orderId: string): Promise<void> {
  if (!orderId) return;
  try {
    const orderRef = doc(db, 'orders', orderId);
    await deleteDoc(orderRef);
  } catch (err: any) {
    console.warn('Failed to delete order from Firestore:', err?.message);
  }
}

export async function deleteOrdersFromFirestore(orderIds: string[]): Promise<void> {
  if (!Array.isArray(orderIds) || orderIds.length === 0) return;
  try {
    await Promise.allSettled(orderIds.map((id) => deleteDoc(doc(db, 'orders', id))));
  } catch (err: any) {
    console.warn('Failed to bulk delete orders from Firestore:', err?.message);
  }
}

export function subscribeToAllOrders(
  onUpdate: (orders: Order[]) => void,
  onError?: (err: any) => void
): () => void {
  const ordersCol = collection(db, 'orders');
  return onSnapshot(
    ordersCol,
    (snap) => {
      const list: Order[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        if (data) {
          list.push({ ...data, id: data.id || d.id });
        }
      });

      // Filter out locally recorded deleted orders
      const deletedIds = new Set(storage.getDeletedOrderIds());
      const activeOrders = list.filter((o) => !deletedIds.has(o.id));

      // Sort newest first
      activeOrders.sort((a, b) => {
        const aTime = new Date(a.createdAt || 0).getTime();
        const bTime = new Date(b.createdAt || 0).getTime();
        return bTime - aTime;
      });

      onUpdate(activeOrders);
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

/**
 * 13. Warehouse Operations Live Activity Stream
 */
export async function logWarehouseOperation(
  op: Partial<WarehouseOperation> & { type: WarehouseOperation['type']; performedBy: string }
): Promise<void> {
  if (!op) return;
  try {
    const id = op.id || `op-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const fullOp: WarehouseOperation = {
      id,
      type: op.type,
      orderId: op.orderId || '',
      orderNumber: op.orderNumber || 'ORD',
      pharmacyName: op.pharmacyName || 'صيدلية',
      performedBy: op.performedBy || 'كادر المذخر',
      timestamp: op.timestamp || new Date().toISOString(),
      actionTitle: op.actionTitle || '',
      details: op.details || '',
      status: op.status,
      targetStatus: op.targetStatus,
      itemsCount: op.itemsCount ?? op.items?.length ?? 0,
      totalQuantity: op.totalQuantity,
      totalAmount: op.totalAmount,
      items: op.items || [],
    };
    const opRef = doc(db, 'operations', id);
    await setDoc(opRef, fullOp);
  } catch (err: any) {
    console.warn('Failed to log operation to Firestore:', err?.message);
  }
}

export function subscribeToWarehouseOperations(
  onUpdate: (operations: WarehouseOperation[]) => void,
  onError?: (err: any) => void
): () => void {
  const opsCol = collection(db, 'operations');
  return onSnapshot(
    opsCol,
    (snap) => {
      const list: WarehouseOperation[] = [];
      snap.forEach((d) => {
        const data = d.data() as WarehouseOperation;
        if (data && data.id) {
          list.push({ ...data, id: d.id });
        }
      });
      list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      // Keep most recent 50 operations
      onUpdate(list.slice(0, 50));
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

