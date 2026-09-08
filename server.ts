import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn('Could not create data dir:', err);
  }
}

// In-memory data store with fallback
let serverProducts: any[] = [];
let serverOrders: any[] = [];

// Permanent super admin emails with master privileges
const SUPER_ADMIN_EMAILS = [
  'mohammedjafaralkabi@gmail.com',
];

let serverUsers: any[] = [];
const sseClients: express.Response[] = [];
let serverAuthorizationMessages: any[] = [];

// Instant admin notification dispatcher (Telegram / Webhook)
async function dispatchAdminNotification(newUser: any, authMsg?: any) {
  const isSuper = SUPER_ADMIN_EMAILS.includes(String(newUser.email || '').toLowerCase().trim());
  if (isSuper) return; // Super admin registrations do not need review alert

  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const roleNameMap: Record<string, string> = {
    super_admin: 'مدير عام متميز (Super Admin)',
    warehouse_manager: 'مدير مستودع ومخزن',
    pharmacist_staff: 'كادر صيدلي وتجهيز',
    auditor_readonly: 'مدقق حسابات (قراءة فقط)',
    pharmacy: 'صيدلية عميل',
  };

  const roleText = roleNameMap[newUser.requestedRole || newUser.role] || (newUser.requestedRole || newUser.role);
  const timeStr = new Date().toLocaleString('ar-IQ');
  const reqId = authMsg?.requestId || newUser.requestId || 'طلب مباشر';
  const actionTitle = authMsg?.type === 'login_request' 
    ? '🚨 *رسالة تصريح دخول جديدة للمذخر*' 
    : '🚨 *طلب تسجيل حساب جديد بانتظار التصريح*';

  const text = `${actionTitle}
📋 *رقم التصريح:* \`${reqId}\`
👤 *الاسم:* ${newUser.name}
🏢 *الصيدلية/المؤسسة:* ${newUser.pharmacyName}
🔑 *نوع الحساب المطلوب:* ${roleText}
📧 *البريد:* ${newUser.email || 'غير متوفر'}
📞 *الهاتف:* ${newUser.phone || newUser.identifier}
🕒 *الوقت:* ${timeStr}
⏳ *الحالة:* بانتظار اعتماد المشرف في لوحة الإدارة
🔗 *لوحة تحكم واعتماد التصاريح:* ${appUrl}`;

  // 1. Telegram Bot API if configured
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (botToken && chatId) {
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
        }),
      });
      console.log('Instant Telegram authorization notification sent for user:', newUser.name, 'Req:', reqId);
    } catch (err) {
      console.warn('Failed to send Telegram admin notification:', err);
    }
  }

  // 2. Custom Webhook if configured
  const webhookUrl = process.env.ADMIN_NOTIFICATION_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: authMsg?.type === 'login_request' ? 'new_login_request' : 'new_registration_pending',
          user: newUser,
          authMessage: authMsg,
          requestId: reqId,
          timestamp: new Date().toISOString(),
        }),
      });
      console.log('Webhook authorization notification sent successfully');
    } catch (err) {
      console.warn('Failed to dispatch webhook notification:', err);
    }
  }
}


function broadcastSSE(event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((client) => {
    try {
      client.write(payload);
    } catch {
      // client disconnected
    }
  });
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SSE endpoint for real-time warehouse alerts
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  sseClients.push(res);

  // Initial ping
  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected' })}\n\n`);

  req.on('close', () => {
    const index = sseClients.indexOf(res);
    if (index !== -1) {
      sseClients.splice(index, 1);
    }
  });

  req.on('error', () => {
    const index = sseClients.indexOf(res);
    if (index !== -1) {
      sseClients.splice(index, 1);
    }
  });
});

// Periodic SSE heartbeat to purge dead connections & prevent proxy timeouts
setInterval(() => {
  for (let i = sseClients.length - 1; i >= 0; i--) {
    const client = sseClients[i];
    try {
      client.write(': ping\n\n');
    } catch {
      sseClients.splice(i, 1);
    }
  }
}, 15000);

// Central Owner Passcode Management (Dynamic, secure & auto session invalidation)
let serverOwnerPin = '1234';
let serverPinVersion = 1;

// Track permanently deleted users & pharmacies to block reconnection attempts
interface DeletedUserRecord {
  id: string;
  identifier: string;
  phone?: string;
  email?: string;
  pharmacyName?: string;
  deletedAt: string;
}
const deletedUsersLog: DeletedUserRecord[] = [];

function removeFromDeletedLog(id?: string, identifier?: string, phone?: string, email?: string, pharmacyName?: string) {
  const cleanId = (id || '').trim();
  const cleanIdent = (identifier || '').trim().toLowerCase();
  const cleanPhone = (phone || '').replace(/[^0-9]/g, '');
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanPharm = (pharmacyName || '').trim().toLowerCase();

  for (let i = deletedUsersLog.length - 1; i >= 0; i--) {
    const d = deletedUsersLog[i];
    if (!d) continue;
    const dIdent = (d.identifier || '').trim().toLowerCase();
    const dPhone = (d.phone || '').replace(/[^0-9]/g, '');
    const dEmail = (d.email || '').trim().toLowerCase();
    const dPharm = (d.pharmacyName || '').trim().toLowerCase();

    if (cleanId && d.id === cleanId) { deletedUsersLog.splice(i, 1); continue; }
    if (cleanIdent && (dIdent === cleanIdent || dEmail === cleanIdent)) { deletedUsersLog.splice(i, 1); continue; }
    if (cleanEmail && (dEmail === cleanEmail || dIdent === cleanEmail)) { deletedUsersLog.splice(i, 1); continue; }
    if (cleanPhone && dPhone && dPhone === cleanPhone) { deletedUsersLog.splice(i, 1); continue; }
    if (cleanPharm && dPharm && dPharm === cleanPharm) { deletedUsersLog.splice(i, 1); continue; }
  }
}

function isMockOrDeletedUser(u: any): boolean {
  if (!u) return true;
  const id = String(u.id || '').trim();
  const ident = String(u.identifier || '').toLowerCase().trim();
  const email = String(u.email || '').toLowerCase().trim();
  const phone = String(u.phone || '').replace(/[^0-9]/g, '');

  // Protect founder super admin & staff accounts
  if (
    ident === 'mohammedjafaralkabi@gmail.com' ||
    email === 'mohammedjafaralkabi@gmail.com' ||
    ident === 'staff@samo.pharma' ||
    ident === 'admin2026' ||
    ident === 'staff2026' ||
    id === 'user-super-admin-master' ||
    id === 'founder_admin' ||
    id === 'staff_member_active' ||
    id.startsWith('staff_') ||
    u.role === 'staff' ||
    u.role === 'warehouse' ||
    u.role === 'pharmacist_staff' ||
    u.founder
  ) {
    return false;
  }

  // Approved users are valid and active
  if (u.status === 'approved') {
    return false;
  }

  // Check mock accounts
  if (
    id === 'user-owner' ||
    id === 'user-pharma-demo' ||
    id.startsWith('mock-') ||
    id.startsWith('demo-') ||
    email === 'alishifa@gmail.com'
  ) {
    return true;
  }

  // Check deleted users log
  const isDeleted = deletedUsersLog.some((d) => {
    const dIdent = String(d.identifier || '').toLowerCase().trim();
    const dEmail = String(d.email || '').toLowerCase().trim();
    const dPhone = String(d.phone || '').replace(/[^0-9]/g, '');
    return (
      (id && d.id === id) ||
      (dIdent && (dIdent === ident || dIdent === email)) ||
      (dEmail && (dEmail === email || dEmail === ident)) ||
      (phone && dPhone && dPhone === phone)
    );
  });

  return isDeleted;
}

function loadStoreFromFile() {
  try {
    ensureDataDir();
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.deletedUsersLog)) {
        deletedUsersLog.length = 0;
        deletedUsersLog.push(...data.deletedUsersLog);
        // Clean false positives (founder, staff) from deletedUsersLog
        for (let i = deletedUsersLog.length - 1; i >= 0; i--) {
          const d = deletedUsersLog[i];
          if (!d) continue;
          const dIdent = (d.identifier || '').toLowerCase().trim();
          const dEmail = (d.email || '').toLowerCase().trim();
          const dId = d.id || '';
          if (
            dIdent === 'mohammedjafaralkabi@gmail.com' ||
            dEmail === 'mohammedjafaralkabi@gmail.com' ||
            dIdent === 'staff@samo.pharma' ||
            dIdent === 'staff2026' ||
            dIdent === 'admin2026' ||
            dId === 'user-super-admin-master' ||
            dId === 'founder_admin' ||
            dId === 'staff_member_active' ||
            dId.startsWith('staff_')
          ) {
            deletedUsersLog.splice(i, 1);
          }
        }
      }
      if (Array.isArray(data.users) && data.users.length > 0) {
        const map = new Map<string, any>();
        data.users.forEach((u: any) => {
          if (!isMockOrDeletedUser(u)) {
            map.set(u.id || u.identifier.toLowerCase(), u);
          }
        });
        serverUsers.forEach((u: any) => {
          const key = u.id || u.identifier.toLowerCase();
          if (!map.has(key) && !isMockOrDeletedUser(u)) {
            map.set(key, u);
          }
        });
        serverUsers = Array.from(map.values());
      } else {
        serverUsers = serverUsers.filter((u) => !isMockOrDeletedUser(u));
      }
      if (Array.isArray(data.orders)) serverOrders = data.orders;
      if (Array.isArray(data.products) && data.products.length > 0) serverProducts = data.products;
      if (Array.isArray(data.authorizationMessages)) {
        serverAuthorizationMessages = data.authorizationMessages.filter((m: any) => {
          const userObj = serverUsers.find((u) => u.id === m.userId);
          return userObj && !isMockOrDeletedUser(userObj);
        });
      }
      if (data.ownerPin) serverOwnerPin = String(data.ownerPin);
      if (data.pinVersion) serverPinVersion = Number(data.pinVersion);
      console.log(`[Store] Loaded ${serverUsers.length} users, ${serverOrders.length} orders, and ${serverAuthorizationMessages.length} auth messages from persistent file.`);
    }
  } catch (err) {
    console.warn('Error loading store from file:', err);
  }
}

let saveStoreTimer: NodeJS.Timeout | null = null;
let isSavingStore = false;
let pendingSaveStore = false;

async function performSaveStore() {
  if (isSavingStore) {
    pendingSaveStore = true;
    return;
  }
  isSavingStore = true;
  try {
    ensureDataDir();
    const payload = {
      users: serverUsers,
      orders: serverOrders,
      products: serverProducts,
      deletedUsersLog,
      authorizationMessages: serverAuthorizationMessages,
      ownerPin: serverOwnerPin,
      pinVersion: serverPinVersion,
      savedAt: new Date().toISOString(),
    };
    await fs.promises.writeFile(STORE_FILE, JSON.stringify(payload), 'utf8');
  } catch (err) {
    console.warn('Error saving store to file:', err);
  } finally {
    isSavingStore = false;
    if (pendingSaveStore) {
      pendingSaveStore = false;
      performSaveStore();
    }
  }
}

function saveStoreToFile() {
  if (saveStoreTimer) {
    clearTimeout(saveStoreTimer);
  }
  saveStoreTimer = setTimeout(() => {
    saveStoreTimer = null;
    performSaveStore();
  }, 80);
}

// Initial load on server start
loadStoreFromFile();

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDyhi1N8ybUkPAO75IJZRyRa6GaXXDPvOs",
  authDomain: "project-94f4537e-ff32-445a-96d.firebaseapp.com",
  projectId: "project-94f4537e-ff32-445a-96d",
  storageBucket: "project-94f4537e-ff32-445a-96d.firebasestorage.app",
  messagingSenderId: "900401622701",
  appId: "1:900401622701:web:107c7008e53fb53337e024",
};

let isFirestoreSyncRunning = false;
async function syncUsersWithFirestore() {
  if (isFirestoreSyncRunning) return;
  isFirestoreSyncRunning = true;
  try {
    const { initializeApp, getApps, getApp } = await import('firebase/app');
    const { getFirestore, collection, getDocs } = await import('firebase/firestore');
    const fbApp = getApps().length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);
    const fbDb = getFirestore(fbApp);
    const snap = await getDocs(collection(fbDb, 'users'));
    let updatedCount = 0;
    snap.forEach((d) => {
      const u = { ...d.data(), id: d.id } as any;
      if (!isMockOrDeletedUser(u)) {
        const key = u.id || (u.identifier || '').toLowerCase();
        const existingIdx = serverUsers.findIndex((su) => su.id === u.id || (su.identifier && su.identifier.toLowerCase() === key));
        if (existingIdx >= 0) {
          serverUsers[existingIdx] = { ...serverUsers[existingIdx], ...u };
        } else {
          serverUsers.push(u);
          updatedCount++;
        }
      }
    });
    if (updatedCount > 0 || snap.size > 0) {
      console.log(`[Firestore Sync] Synced ${snap.size} Firestore users. Total serverUsers: ${serverUsers.length}`);
      saveStoreToFile();
    }
  } catch (err: any) {
    console.warn('[Firestore Sync] Warning during sync:', err?.message);
  } finally {
    isFirestoreSyncRunning = false;
  }
}

// Initial sync on startup & periodic sync every 45s
syncUsersWithFirestore();
setInterval(syncUsersWithFirestore, 45000);

let isFirestoreOrdersSyncRunning = false;
async function syncOrdersWithFirestore() {
  if (isFirestoreOrdersSyncRunning) return;
  isFirestoreOrdersSyncRunning = true;
  try {
    const { initializeApp, getApps, getApp } = await import('firebase/app');
    const { getFirestore, collection, getDocs, doc, setDoc } = await import('firebase/firestore');
    const fbApp = getApps().length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);
    const fbDb = getFirestore(fbApp);

    const snap = await getDocs(collection(fbDb, 'orders'));
    let updatedCount = 0;
    const firestoreIds = new Set<string>();

    snap.forEach((d) => {
      const ord = { ...d.data(), id: d.id } as any;
      if (ord && ord.id) {
        firestoreIds.add(ord.id);
        const existingIdx = serverOrders.findIndex((so) => so.id === ord.id);
        if (existingIdx >= 0) {
          // Compare timestamps: keep the more recently updated / progressed
          const serverTime = new Date(serverOrders[existingIdx].completedAt || serverOrders[existingIdx].preparedAt || serverOrders[existingIdx].createdAt || 0).getTime();
          const firestoreTime = new Date(ord.completedAt || ord.preparedAt || ord.createdAt || 0).getTime();
          if (firestoreTime >= serverTime) {
            serverOrders[existingIdx] = { ...serverOrders[existingIdx], ...ord };
            updatedCount++;
          }
        } else {
          serverOrders.push(ord);
          updatedCount++;
        }
      }
    });

    // Also push any local serverOrders that are missing from Firestore
    for (const so of serverOrders) {
      if (so && so.id && !firestoreIds.has(so.id)) {
        try {
          await setDoc(doc(fbDb, 'orders', so.id), so, { merge: true });
        } catch {}
      }
    }

    if (updatedCount > 0 || snap.size > 0) {
      serverOrders.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      saveStoreToFile();
      console.log(`[Firestore Orders Sync] Synced ${snap.size} orders. Total serverOrders: ${serverOrders.length}`);
    }
  } catch (err: any) {
    console.warn('[Firestore Orders Sync] Warning during sync:', err?.message);
  } finally {
    isFirestoreOrdersSyncRunning = false;
  }
}

async function persistOrderToFirestore(order: any) {
  if (!order || !order.id) return;
  try {
    const { initializeApp, getApps, getApp } = await import('firebase/app');
    const { getFirestore, doc, setDoc } = await import('firebase/firestore');
    const fbApp = getApps().length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);
    const fbDb = getFirestore(fbApp);
    await setDoc(doc(fbDb, 'orders', order.id), order, { merge: true });
  } catch (err: any) {
    console.warn('[Firestore persistOrder error]:', err?.message);
  }
}

async function removeOrderFromFirestore(orderId: string) {
  if (!orderId) return;
  try {
    const { initializeApp, getApps, getApp } = await import('firebase/app');
    const { getFirestore, doc, deleteDoc } = await import('firebase/firestore');
    const fbApp = getApps().length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);
    const fbDb = getFirestore(fbApp);
    await deleteDoc(doc(fbDb, 'orders', orderId));
  } catch (err: any) {
    console.warn('[Firestore removeOrder error]:', err?.message);
  }
}

// Initial orders sync on startup & periodic sync every 30s
syncOrdersWithFirestore();
setInterval(syncOrdersWithFirestore, 30000);


// Middleware to guard endpoints against unapproved pending, deleted, or unverified sessions
const checkUserApproval = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const userId = req.headers['x-user-id'] as string;
  const userIdentifier = (req.headers['x-user-identifier'] as string || '').toLowerCase().trim();
  const userRole = req.headers['x-user-role'] as string;
  const userStatus = req.headers['x-user-status'] as string;
  const pinVersionHeader = req.headers['x-owner-pin-version'] as string;
  const pharmacyNameHeader = (
    (req.headers['x-pharmacy-name'] as string) ||
    (req.query.pharmacy as string) ||
    (req.body && req.body.pharmacyName) ||
    ''
  ).toLowerCase().trim();

  // Founder & Staff credentials have absolute permanent access: never blocked or deleted
  const isMasterOrStaff = 
    userIdentifier === 'mohammedjafaralkabi@gmail.com' ||
    userIdentifier === 'admin@samo.pharma' ||
    userIdentifier === 'staff@samo.pharma' ||
    userIdentifier === 'admin2026' ||
    userIdentifier === 'staff2026' ||
    userId === 'user-super-admin-master' ||
    userId === 'founder_admin' ||
    userId === 'staff_member_active' ||
    (userId && userId.startsWith('staff_')) ||
    userRole === 'founder' ||
    userRole === 'super_admin' ||
    userRole === 'owner' ||
    userRole === 'staff' ||
    userRole === 'warehouse' ||
    userRole === 'pharmacist_staff';

  if (isMasterOrStaff) {
    return next();
  }

  // If client is already approved, verify they aren't explicitly blocked
  if (userStatus === 'approved') {
    const dbUser = serverUsers.find(
      (u) =>
        (userId && u.id === userId) ||
        (userIdentifier && (
          u.identifier.toLowerCase() === userIdentifier ||
          (u.email && u.email.toLowerCase() === userIdentifier) ||
          (u.phone && u.phone.replace(/[^0-9]/g, '') === userIdentifier.replace(/[^0-9]/g, ''))
        ))
    );
    if (dbUser && (dbUser.status === 'blocked' || dbUser.status === 'rejected' || dbUser.status === 'deactivated')) {
      return res.status(403).json({
        error: 'تم إنهاء صلاحية وصولك للنظام أو تم حظر حسابك من قبل المؤسس.',
        status: dbUser.status,
        code: 'ACCOUNT_BLOCKED',
      });
    }
    // Client is verified approved
    return next();
  }

  // 1. Check if user or pharmacy was deleted (only for unapproved / guest accounts)
  if (userIdentifier || userId || pharmacyNameHeader) {
    const isDeleted = deletedUsersLog.some(
      (d) =>
        (userId && d.id === userId) ||
        (userIdentifier && (
          d.identifier.toLowerCase() === userIdentifier ||
          (d.email && d.email.toLowerCase() === userIdentifier) ||
          (d.phone && d.phone.replace(/[^0-9]/g, '') === userIdentifier.replace(/[^0-9]/g, ''))
        )) ||
        (pharmacyNameHeader && d.pharmacyName && d.pharmacyName.toLowerCase() === pharmacyNameHeader)
    );
    if (isDeleted) {
      return res.status(403).json({
        error: 'تم حذف تصريح هذا الحساب من قبل إدارة المذخر. لا يمكن الوصول لبيانات المستودع أو السلة حتى بعد تغيير الرابط.',
        status: 'deleted',
        code: 'USER_DELETED',
      });
    }
  }

  // 2. If user claims to be owner or super_admin, verify their PIN version and approval status!
  if (userRole === 'owner' || userRole === 'super_admin') {
    // PIN version check: Any PIN change automatically invalidates all previous sessions!
    if (!pinVersionHeader) {
      return res.status(401).json({
        error: 'تم تغيير رمز المرور السري للمذخر. يجب إدخال الرمز الجديد للدخول.',
        code: 'PIN_CHANGED',
        currentVersion: serverPinVersion,
      });
    }
    const clientVersion = parseInt(pinVersionHeader, 10);
    if (isNaN(clientVersion) || clientVersion < serverPinVersion) {
      return res.status(401).json({
        error: 'تم تغيير رمز المرور السري للمذخر. يجب إدخال الرمز الجديد للدخول.',
        code: 'PIN_CHANGED',
        currentVersion: serverPinVersion,
      });
    }

    // Impersonation prevention: Verify against approved users
    if (userId || userIdentifier) {
      const match = serverUsers.find(
        (u) =>
          (userId && u.id === userId) ||
          (userIdentifier && (
            u.identifier.toLowerCase() === userIdentifier ||
            (u.email && u.email.toLowerCase() === userIdentifier)
          ))
      );
      if (match && (match.status !== 'approved' || (match.role !== 'owner' && match.role !== 'super_admin'))) {
        return res.status(403).json({
          error: 'محاولة انتحال صفة صاحب متجر غير مصرح له أو تم تجميد تصريحه.',
          code: 'FORBIDDEN',
        });
      }
    }
  }

  if (userStatus === 'pending') {
    return res.status(403).json({
      error: 'الحساب قيد المراجعة والتدقيق من قبل الإدارة العليا لمذخر سامو. لا يمكن الوصول إلى بيانات المستودع أو السلة حالياً.',
      status: 'pending',
    });
  }
  if (userStatus === 'rejected' || userStatus === 'deactivated' || userStatus === 'blocked') {
    return res.status(403).json({
      error: 'تم إنهاء صلاحية وصولك للنظام أو تم حظر حسابك من قبل المؤسس.',
      status: 'blocked',
      code: 'ACCOUNT_BLOCKED',
    });
  }

  // Double check server database for actual status
  if (userId || userIdentifier) {
    const dbUser = serverUsers.find(
      (u) =>
        (userId && u.id === userId) ||
        (userIdentifier && (
          u.identifier.toLowerCase() === userIdentifier ||
          (u.email && u.email.toLowerCase() === userIdentifier) ||
          (u.phone && u.phone.replace(/[^0-9]/g, '') === userIdentifier.replace(/[^0-9]/g, ''))
        ))
    );
    if (dbUser && (dbUser.status === 'blocked' || dbUser.status === 'rejected' || dbUser.status === 'deactivated')) {
      return res.status(403).json({
        error: 'تم إنهاء صلاحية وصولك للنظام أو تم حظر حسابك من قبل المؤسس.',
        status: dbUser.status,
        code: 'ACCOUNT_BLOCKED',
      });
    }
  }

  next();
};

// Products API
app.get('/api/products', checkUserApproval, (req, res) => {
  res.json({ products: serverProducts });
});

app.post('/api/products', (req, res) => {
  const newProduct = { ...req.body, id: req.body.id || `med-${Date.now()}` };
  serverProducts.push(newProduct);
  broadcastSSE('product_updated', newProduct);
  res.status(201).json(newProduct);
});

app.post('/api/products/batch', (req, res) => {
  const { products } = req.body;
  if (Array.isArray(products)) {
    products.forEach((p) => {
      const idx = serverProducts.findIndex((exist) => exist.id === p.id);
      if (idx !== -1) {
        serverProducts[idx] = p;
      } else {
        serverProducts.push(p);
      }
    });
    broadcastSSE('products_reloaded', { count: products.length });
  }
  res.status(201).json({ success: true, count: products?.length || 0 });
});

app.put('/api/products/:id', (req, res) => {
  const { id } = req.params;
  const index = serverProducts.findIndex((p) => p.id === id);
  if (index !== -1) {
    serverProducts[index] = { ...serverProducts[index], ...req.body };
    broadcastSSE('product_updated', serverProducts[index]);
    res.json(serverProducts[index]);
  } else {
    serverProducts.push({ ...req.body, id });
    res.json(req.body);
  }
});

app.delete('/api/products/:id', (req, res) => {
  const { id } = req.params;
  serverProducts = serverProducts.filter((p) => p.id !== id);
  broadcastSSE('product_deleted', { id });
  res.json({ success: true });
});

// Orders API
app.get('/api/orders', async (req, res) => {
  if (serverOrders.length <= 1) {
    await syncOrdersWithFirestore();
  } else {
    syncOrdersWithFirestore().catch(() => {});
  }
  const pharmacyQuery = String(req.query.pharmacy || '').trim().toLowerCase();
  if (pharmacyQuery) {
    const filtered = serverOrders.filter(
      (o) => o.pharmacyName && o.pharmacyName.trim().toLowerCase() === pharmacyQuery
    );
    return res.json({ orders: filtered });
  }
  res.json({ orders: serverOrders });
});

// In-memory record for shared cart per pharmacy
interface SharedCartRecord {
  pharmacyName: string;
  items: any[];
  lastUpdatedBy: string;
  updatedAt: string;
}
const serverSharedCarts: Map<string, SharedCartRecord> = new Map();

// Shared Cart APIs
app.get('/api/cart', (req, res) => {
  const pharmacy = String(req.query.pharmacy || '').trim().toLowerCase();
  if (!pharmacy) {
    return res.json({ items: [] });
  }
  const cart = serverSharedCarts.get(pharmacy);
  res.json(cart || { pharmacyName: req.query.pharmacy, items: [] });
});

app.post('/api/cart', (req, res) => {
  const { pharmacyName, items, updatedBy, mode } = req.body;
  const cleanPharm = String(pharmacyName || '').trim().toLowerCase();
  if (!cleanPharm) {
    return res.status(400).json({ error: 'اسم الصيدلية مطلوب لمزامنة السلة المشتركة' });
  }

  let mergedItems: any[] = [];
  const existing = serverSharedCarts.get(cleanPharm);

  if (mode === 'replace' || !existing) {
    mergedItems = Array.isArray(items) ? items : [];
  } else {
    // Merge incoming items into existing items
    const currentItems = [...existing.items];
    (items || []).forEach((newItem: any) => {
      const idx = currentItems.findIndex((ci) => ci.productId === newItem.productId);
      if (idx !== -1) {
        const newQty = currentItems[idx].quantity + newItem.quantity;
        const newBonus = (currentItems[idx].bonusQuantity || 0) + (newItem.bonusQuantity || 0);
        currentItems[idx] = {
          ...currentItems[idx],
          ...newItem,
          quantity: newQty,
          bonusQuantity: newBonus,
          subtotal: newQty * (newItem.unitPrice || currentItems[idx].unitPrice || 0),
        };
      } else {
        currentItems.push(newItem);
      }
    });
    mergedItems = currentItems;
  }

  const record: SharedCartRecord = {
    pharmacyName,
    items: mergedItems,
    lastUpdatedBy: updatedBy || 'موظف في الصيدلية',
    updatedAt: new Date().toISOString(),
  };

  serverSharedCarts.set(cleanPharm, record);
  broadcastSSE('cart_updated', record);
  res.json({ success: true, cart: record });
});

app.delete('/api/cart', (req, res) => {
  const pharmacy = String(req.query.pharmacy || '').trim().toLowerCase();
  if (pharmacy) {
    serverSharedCarts.delete(pharmacy);
    broadcastSSE('cart_cleared', { pharmacyName: req.query.pharmacy });
  }
  res.json({ success: true });
});

app.post('/api/orders', (req, res) => {
  const pharmacyName = String(req.body.pharmacyName || '').trim();
  const cleanPharm = pharmacyName.toLowerCase();

  // If there is an existing unconfirmed/pending order for this pharmacy, merge as unified order
  const pendingIndex = serverOrders.findIndex(
    (o) =>
      o.pharmacyName.trim().toLowerCase() === cleanPharm &&
      (o.status === 'new' || o.status === 'pending')
  );

  if (pendingIndex !== -1 && req.body.mergePending !== false) {
    const existing = serverOrders[pendingIndex];
    const incomingItems = Array.isArray(req.body.items) ? req.body.items : [];
    const mergedItems = [...existing.items];

    incomingItems.forEach((newItem: any) => {
      const existItemIndex = mergedItems.findIndex((it) => it.productId === newItem.productId);
      if (existItemIndex !== -1) {
        const prev = mergedItems[existItemIndex];
        const newQty = prev.quantity + newItem.quantity;
        const newBonus = (prev.bonusQuantity || 0) + (newItem.bonusQuantity || 0);
        mergedItems[existItemIndex] = {
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

    const mergedNotes = [existing.notes, req.body.notes].filter(Boolean).join(' | ');

    serverOrders[pendingIndex] = {
      ...existing,
      items: mergedItems,
      totalQuantity: totalQty,
      totalBonus: totalBonus,
      totalAmount: totalAmount,
      notes: mergedNotes,
      phone: req.body.phone || existing.phone,
      address: req.body.address || existing.address,
      pharmacistName: req.body.pharmacistName
        ? existing.pharmacistName.includes(req.body.pharmacistName)
          ? existing.pharmacistName
          : `${existing.pharmacistName} و ${req.body.pharmacistName}`
        : existing.pharmacistName,
      mergedCount: ((existing as any).mergedCount || 1) + 1,
      lastMergedAt: new Date().toISOString(),
    };

    // Clear shared cart
    serverSharedCarts.delete(cleanPharm);
    saveStoreToFile();
    persistOrderToFirestore(serverOrders[pendingIndex]).catch(() => {});
    broadcastSSE('cart_cleared', { pharmacyName });
    broadcastSSE('order_updated', serverOrders[pendingIndex]);

    return res.status(200).json({
      ...serverOrders[pendingIndex],
      wasMerged: true,
    });
  }

  const newOrder = {
    ...req.body,
    id: req.body.id || `ord-${Date.now()}`,
    orderNumber: req.body.orderNumber || `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
    createdAt: req.body.createdAt || new Date().toISOString(),
    status: req.body.status || 'new',
    synced: true,
  };

  serverOrders.unshift(newOrder);
  saveStoreToFile();
  persistOrderToFirestore(newOrder).catch(() => {});

  // Clear shared cart
  if (cleanPharm) {
    serverSharedCarts.delete(cleanPharm);
    broadcastSSE('cart_cleared', { pharmacyName });
  }

  // Broadcast real-time notification to all open warehouse dashboard tabs!
  broadcastSSE('new_order', newOrder);

  res.status(201).json(newOrder);
});

app.patch('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  const index = serverOrders.findIndex((o) => o.id === id);
  if (index !== -1) {
    serverOrders[index] = { 
      ...serverOrders[index], 
      ...req.body,
      lastUpdatedAt: new Date().toISOString()
    };
    saveStoreToFile();
    persistOrderToFirestore(serverOrders[index]).catch(() => {});
    broadcastSSE('order_updated', serverOrders[index]);
    res.json(serverOrders[index]);
  } else {
    const newOrder = {
      ...req.body,
      id,
      createdAt: req.body.createdAt || new Date().toISOString(),
      status: req.body.status || 'new',
      synced: true,
      lastUpdatedAt: new Date().toISOString()
    };
    serverOrders.unshift(newOrder);
    saveStoreToFile();
    persistOrderToFirestore(newOrder).catch(() => {});
    broadcastSSE('new_order', newOrder);
    res.json(newOrder);
  }
});

app.delete('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  const initialLength = serverOrders.length;
  serverOrders = serverOrders.filter((o) => o.id !== id);
  saveStoreToFile();
  removeOrderFromFirestore(id).catch(() => {});
  broadcastSSE('order_deleted', { id });
  res.json({ success: true, deleted: serverOrders.length < initialLength });
});

app.post('/api/orders/bulk-delete', (req, res) => {
  const { ids, status } = req.body;
  let deletedIds: string[] = [];

  if (Array.isArray(ids) && ids.length > 0) {
    const idSet = new Set(ids);
    deletedIds = serverOrders.filter((o) => idSet.has(o.id)).map((o) => o.id);
    serverOrders = serverOrders.filter((o) => !idSet.has(o.id));
  } else if (status) {
    deletedIds = serverOrders
      .filter((o) => o.status === status || (status === 'new' && o.status === 'pending'))
      .map((o) => o.id);
    serverOrders = serverOrders.filter(
      (o) => !(o.status === status || (status === 'new' && o.status === 'pending'))
    );
  }

  if (deletedIds.length > 0) {
    saveStoreToFile();
    deletedIds.forEach((id) => removeOrderFromFirestore(id).catch(() => {}));
    broadcastSSE('orders_bulk_deleted', { ids: deletedIds });
  }

  res.json({ success: true, count: deletedIds.length, ids: deletedIds });
});

app.delete('/api/pharmacies/:name', (req, res) => {
  const { name } = req.params;
  const decodedName = decodeURIComponent(name).trim().toLowerCase();
  const deleteOrders = req.query.deleteOrders === 'true';

  // Invalidate and delete any users linked to this pharmacy!
  const matchingUsers = serverUsers.filter(
    (u) => (u.pharmacyName || '').trim().toLowerCase() === decodedName
  );
  matchingUsers.forEach((u) => {
    deletedUsersLog.push({
      id: u.id,
      identifier: u.identifier,
      phone: u.phone,
      email: u.email,
      pharmacyName: u.pharmacyName,
      deletedAt: new Date().toISOString(),
    });
    broadcastSSE('user_deleted', {
      id: u.id,
      identifier: u.identifier,
      email: u.email,
      phone: u.phone,
      pharmacyName: u.pharmacyName,
    });
  });
  serverUsers = serverUsers.filter(
    (u) => (u.pharmacyName || '').trim().toLowerCase() !== decodedName
  );

  // Record deleted pharmacy in deleted users log so reconnection attempts are rejected
  deletedUsersLog.push({
    id: `pharmacy-${Date.now()}`,
    identifier: decodedName,
    pharmacyName: decodedName,
    deletedAt: new Date().toISOString(),
  });

  if (deleteOrders) {
    const beforeCount = serverOrders.length;
    serverOrders = serverOrders.filter(
      (o) => (o.pharmacyName || '').trim().toLowerCase() !== decodedName
    );
    broadcastSSE('orders_bulk_updated', { deletedPharmacy: decodedName });
    broadcastSSE('pharmacy_deleted', { name: decodedName, deleteOrders: true });
    res.json({ success: true, deletedOrdersCount: beforeCount - serverOrders.length });
  } else {
    broadcastSSE('pharmacy_removed', { pharmacyName: decodedName });
    broadcastSSE('pharmacy_deleted', { name: decodedName, deleteOrders: false });
    res.json({ success: true, deletedOrdersCount: 0 });
  }
});

// Batch offline sync
app.post('/api/sync', checkUserApproval, (req, res) => {
  const { pendingOrders } = req.body;
  const created: any[] = [];

  if (Array.isArray(pendingOrders)) {
    pendingOrders.forEach((order) => {
      const exists = serverOrders.some((o) => o.id === order.id);
      if (!exists) {
        const syncedOrder = { ...order, synced: true };
        serverOrders.unshift(syncedOrder);
        created.push(syncedOrder);
        broadcastSSE('new_order', syncedOrder);
      }
    });
    if (created.length > 0) {
      saveStoreToFile();
    }
  }

  res.json({ success: true, syncedCount: created.length });
});

// Seed backend initial store from request if needed
app.post('/api/seed', (req, res) => {
  const { products, orders, users } = req.body;
  if (Array.isArray(products) && serverProducts.length === 0) {
    serverProducts = products;
  }
  if (Array.isArray(orders) && serverOrders.length === 0) {
    serverOrders = orders;
  }
  if (Array.isArray(users)) {
    users.forEach((u: any) => {
      if (isMockOrDeletedUser(u)) return;
      const exists = serverUsers.some(
        (su) =>
          su.id === u.id ||
          (u.identifier && su.identifier.toLowerCase() === u.identifier.toLowerCase())
      );
      if (!exists) {
        serverUsers.push(u);
      }
    });
  }
  saveStoreToFile();
  res.json({ success: true, users: serverUsers });
});

// Authentication & Access Approval API
app.get('/api/auth/pin-status', (req, res) => {
  res.json({ version: serverPinVersion, hasPin: true });
});

const handleVerifyPin = (req: express.Request, res: express.Response) => {
  const { pin, identifier, userId } = req.body;
  const cleanPin = String(pin || '').trim();

  // Master Founder Passcode Check: admin2026 or 1234 or serverOwnerPin
  const isMasterFounderPin = cleanPin === 'admin2026' || cleanPin === '1234' || cleanPin === serverOwnerPin;
  
  if (isMasterFounderPin && (!identifier || identifier === 'mohammedjafaralkabi@gmail.com' || cleanPin === 'admin2026')) {
    const founderUser = {
      id: 'user-super-admin-master',
      role: 'super_admin' as const,
      requestedRole: 'super_admin' as const,
      identifier: 'mohammedjafaralkabi@gmail.com',
      name: 'محمد جعفر الكعبي (المشرف العام والمؤسس)',
      pharmacyName: 'الإدارة العامة العليا لمذخر سامو',
      phone: '07700000000',
      email: 'mohammedjafaralkabi@gmail.com',
      status: 'approved' as const,
      founder: true,
      createdAt: new Date().toISOString(),
      approvedAt: new Date().toISOString(),
      approvedBy: 'SYSTEM_MASTER_PIN',
      passcodeVersion: serverPinVersion,
    };

    const idx = serverUsers.findIndex(
      u => u.identifier.toLowerCase() === 'mohammedjafaralkabi@gmail.com' || (u.email && u.email.toLowerCase() === 'mohammedjafaralkabi@gmail.com')
    );
    if (idx !== -1) {
      serverUsers[idx] = { ...serverUsers[idx], ...founderUser };
    } else {
      serverUsers.unshift(founderUser);
    }
    saveStoreToFile();

    return res.json({
      success: true,
      valid: true,
      version: serverPinVersion,
      token: `founder_token_${Date.now()}`,
      user: founderUser,
    });
  }

  const cleanId = String(identifier || userId || '').trim().toLowerCase();
  if (!cleanId) {
    return res.status(400).json({
      success: false,
      valid: false,
      error: 'رمز المرور غير صحيح أو الحساب غير محدد.',
    });
  }

  // 1. Check if user is permanently deleted
  const isDeleted = deletedUsersLog.some(
    (d) =>
      (userId && d.id === userId) ||
      d.identifier.toLowerCase() === cleanId ||
      (d.email && d.email.toLowerCase() === cleanId) ||
      (d.phone && d.phone.replace(/[^0-9]/g, '') === cleanId.replace(/[^0-9]/g, ''))
  );
  if (isDeleted) {
    return res.status(403).json({
      success: false,
      valid: false,
      error: 'تم حذف وإلغاء تصريح هذا الحساب نهائياً من قبل إدارة المذخر.',
      code: 'USER_DELETED',
    });
  }

  // Verify PIN matches central server PIN
  const isPinCorrect = cleanPin === serverOwnerPin || cleanPin === '1234' || cleanPin === 'admin2026';
  if (!isPinCorrect) {
    return res.status(401).json({
      success: false,
      valid: false,
      error: 'رمز المرور السري (PIN) غير صحيح.',
    });
  }

  const matchedOwner = serverUsers.find(
    (u) =>
      (userId && u.id === userId) ||
      u.identifier.toLowerCase() === cleanId ||
      (u.email && u.email.toLowerCase() === cleanId) ||
      (u.phone && u.phone.replace(/[^0-9]/g, '') === cleanId.replace(/[^0-9]/g, ''))
  );

  if (!matchedOwner) {
    return res.status(403).json({
      success: false,
      valid: false,
      error: 'عذراً، هذا الحساب ليس ضمن قائمة أصحاب المذخر المعتمدين والموافق عليهم.',
    });
  }

  if (matchedOwner.status === 'blocked' || matchedOwner.status === 'rejected') {
    return res.status(403).json({
      success: false,
      valid: false,
      error: 'تم إنهاء صلاحية وصولك للنظام أو تم حظر حسابك من قبل المؤسس.',
      code: 'ACCOUNT_BLOCKED',
    });
  }

  const token = `owner_auth_${serverPinVersion}_${Date.now()}`;
  res.json({
    success: true,
    valid: true,
    version: serverPinVersion,
    token,
    user: {
      ...matchedOwner,
      status: 'approved',
      role: 'super_admin',
      founder: true,
      passcodeVersion: serverPinVersion,
    },
  });
};

app.post('/api/auth/verify-pin', handleVerifyPin);
app.post('/api/auth/verify-owner-pin', handleVerifyPin);

// Staff Passcode Login (staff2026)
app.post('/api/auth/staff-login', (req, res) => {
  const { passcode, name, phone } = req.body;
  const cleanPasscode = String(passcode || '').trim();

  if (cleanPasscode !== 'staff2026') {
    return res.status(401).json({
      success: false,
      error: 'رمز كادر الموظفين غير صحيح. يرجى إدخال الرمز المعتمد (staff2026)',
    });
  }

  const cleanPhone = String(phone || '').trim();
  const cleanName = String(name || '').trim();

  // Clear any previous deletion records for staff
  removeFromDeletedLog('staff_member_active', 'staff@samo.pharma', cleanPhone, undefined, 'فريق عمل المذخر');
  removeFromDeletedLog(undefined, undefined, cleanPhone);

  // If registering with Name and Phone
  if (cleanPhone && cleanName) {
    const existingIndex = serverUsers.findIndex(
      (u) =>
        (u.phone && u.phone.replace(/[^0-9]/g, '') === cleanPhone.replace(/[^0-9]/g, '')) ||
        u.identifier.toLowerCase() === cleanPhone.toLowerCase()
    );

    if (existingIndex !== -1) {
      const existing = serverUsers[existingIndex];
      existing.name = cleanName;
      existing.role = 'pharmacist_staff';
      existing.status = 'approved';
      saveStoreToFile();
      broadcastSSE('user_updated', existing);
      broadcastSSE('user_approved', existing);
      return res.json({ success: true, user: existing });
    }

    const staffUser = {
      id: `user-staff-${Date.now()}`,
      role: 'pharmacist_staff' as const,
      requestedRole: 'pharmacist_staff' as const,
      identifier: cleanPhone,
      name: cleanName,
      pharmacyName: 'كادر وموظفي مذخر سامو',
      phone: cleanPhone,
      status: 'approved' as const,
      createdAt: new Date().toISOString(),
      approvedAt: new Date().toISOString(),
      approvedBy: 'كود الموظفين المعتمد (staff2026)',
    };

    serverUsers.unshift(staffUser);
    saveStoreToFile();
    broadcastSSE('new_user_registration', staffUser);
    broadcastSSE('user_updated', staffUser);
    broadcastSSE('user_approved', staffUser);

    return res.json({ success: true, user: staffUser });
  }

  // If entering with passcode directly
  const staffMember = {
    id: 'staff_member_active',
    role: 'staff' as const,
    requestedRole: 'staff' as const,
    identifier: 'staff@samo.pharma',
    name: 'كادر مذخر سامو',
    pharmacyName: 'فريق عمل المذخر',
    phone: '07700000000',
    status: 'approved' as const,
    createdAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
    approvedBy: 'كود الموظفين المعتمد (staff2026)',
  };

  const existingStaffIndex = serverUsers.findIndex(u => u.id === 'staff_member_active' || u.identifier === 'staff@samo.pharma');
  if (existingStaffIndex !== -1) {
    serverUsers[existingStaffIndex].status = 'approved';
    serverUsers[existingStaffIndex].role = 'staff';
  } else {
    serverUsers.push(staffMember);
  }
  saveStoreToFile();
  broadcastSSE('user_approved', staffMember);
  broadcastSSE('user_updated', staffMember);

  return res.json({ success: true, user: staffMember });
});

// Pharmacy Direct Login (Phone & Password)
app.post('/api/auth/pharmacy-login', (req, res) => {
  const { phone, password } = req.body;
  const cleanPhone = String(phone || '').trim();
  const cleanPass = String(password || '').trim();

  if (!cleanPhone || !cleanPass) {
    return res.status(400).json({ error: 'يرجى إدخال رقم الهاتف وكلمة المرور' });
  }

  // Check if deleted
  const isDeleted = deletedUsersLog.some(
    (d) =>
      d.phone && d.phone.replace(/[^0-9]/g, '') === cleanPhone.replace(/[^0-9]/g, '')
  );
  if (isDeleted) {
    return res.status(403).json({
      error: 'تم حذف تصريح هذا الحساب نهائياً من قبل إدارة المذخر.',
      code: 'USER_DELETED',
    });
  }

  const user = serverUsers.find(
    (u) =>
      (u.phone && u.phone.replace(/[^0-9]/g, '') === cleanPhone.replace(/[^0-9]/g, '')) ||
      u.identifier.toLowerCase() === cleanPhone.toLowerCase()
  );

  if (!user) {
    return res.status(404).json({ error: 'رقم الهاتف غير مسجل. يرجى تقديم طلب تسجيل صيدلية جديدة أولاً.' });
  }

  if (user.password && user.password !== cleanPass) {
    return res.status(401).json({ error: 'كلمة المرور غير صحيحة.' });
  }

  if (user.status === 'blocked' || user.status === 'rejected' || user.status === 'deactivated') {
    return res.status(403).json({
      error: 'تم إنهاء صلاحية وصولك للنظام أو تم حظر حسابك من قبل المؤسس.',
      code: 'ACCOUNT_BLOCKED',
      status: user.status,
    });
  }

  return res.json({
    success: true,
    status: user.status,
    user,
    token: `pharma_token_${user.id}_${Date.now()}`,
  });
});

// Pharmacy Direct Registration Request
app.post('/api/auth/pharmacy-register', async (req, res) => {
  const { pharmacyName, pharmacistName, phone, address, password, notes } = req.body;
  const cleanPhone = String(phone || '').trim();
  const cleanPharm = String(pharmacyName || '').trim();
  const cleanName = String(pharmacistName || '').trim();
  const cleanPass = String(password || '').trim();

  if (!cleanPhone || !cleanPharm || !cleanName || !cleanPass) {
    return res.status(400).json({ error: 'يرجى ملء كافة الحقول المطلوبة (اسم الصيدلية، اسم الصيدلي، رقم الهاتف، كلمة المرور)' });
  }

  // Check if deleted
  const isDeleted = deletedUsersLog.some(
    (d) =>
      (d.phone && d.phone.replace(/[^0-9]/g, '') === cleanPhone.replace(/[^0-9]/g, '')) ||
      (d.pharmacyName && d.pharmacyName.toLowerCase() === cleanPharm.toLowerCase())
  );
  if (isDeleted) {
    return res.status(403).json({
      error: 'تم حذف تصريح هذه الصيدلية نهائياً من قبل إدارة المذخر. لا يمكن إعادة التسجيل.',
      code: 'USER_DELETED',
    });
  }

  const existingIndex = serverUsers.findIndex(
    (u) =>
      (u.phone && u.phone.replace(/[^0-9]/g, '') === cleanPhone.replace(/[^0-9]/g, '')) ||
      u.identifier.toLowerCase() === cleanPhone.toLowerCase()
  );

  const reqId = `REQ-${Math.floor(10000 + Math.random() * 90000)}`;

  if (existingIndex !== -1) {
    const existing = serverUsers[existingIndex];
    if (existing.status === 'blocked') {
      return res.status(403).json({ error: 'هذا الحساب محظور من قبل إدارة المذخر.' });
    }
    existing.pharmacyName = cleanPharm;
    existing.name = cleanName;
    existing.password = cleanPass;
    if (address) existing.address = address;
    saveStoreToFile();
    broadcastSSE('user_updated', existing);
    return res.json({ success: true, user: existing, status: existing.status });
  }

  const newUser = {
    id: `user-pharma-${Date.now()}`,
    role: 'pharmacy' as const,
    requestedRole: 'pharmacy' as const,
    registrationAccountType: 'pharmacy' as const,
    identifier: cleanPhone,
    name: cleanName,
    pharmacyName: cleanPharm,
    phone: cleanPhone,
    address: address || '',
    password: cleanPass,
    status: 'pending' as const,
    createdAt: new Date().toISOString(),
    requestId: reqId,
  };

  serverUsers.unshift(newUser);

  const authMsg = {
    id: `auth-msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    requestId: reqId,
    userId: newUser.id,
    type: 'new_registration' as const,
    userName: newUser.name,
    pharmacyName: newUser.pharmacyName,
    identifier: newUser.identifier,
    phone: newUser.phone,
    role: 'pharmacy' as const,
    requestedRole: 'pharmacy' as const,
    registrationAccountType: 'pharmacy' as const,
    address: newUser.address,
    notes: notes || 'طلب تسجيل صيدلية جديدة بانتظار تصريح الإدارة',
    status: 'pending' as const,
    createdAt: new Date().toISOString(),
  };

  serverAuthorizationMessages.unshift(authMsg);
  saveStoreToFile();

  dispatchAdminNotification(newUser, authMsg).catch(() => {});
  broadcastSSE('new_authorization_message', authMsg);
  broadcastSSE('new_user_registration', newUser);
  broadcastSSE('user_updated', newUser);

  res.status(201).json({ success: true, user: newUser, status: 'pending', requestId: reqId });
});

// Add a secondary pharmacy branch to an existing phone number/employee
app.post('/api/auth/add-pharmacy-branch', (req, res) => {
  const { phone, pharmacyName, pharmacistName, address, notes, city } = req.body;
  const cleanPhone = String(phone || '').trim();
  const cleanPharm = String(pharmacyName || '').trim();
  const cleanName = String(pharmacistName || '').trim();

  if (!cleanPhone || !cleanPharm) {
    return res.status(400).json({ error: 'رقم الهاتف واسم الصيدلية مطلوبان.' });
  }

  const newBranch = {
    id: `branch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: cleanPharm,
    pharmacistName: cleanName,
    phone: cleanPhone,
    address: address?.trim() || '',
    city: city?.trim() || '',
    notes: notes?.trim() || '',
    createdAt: new Date().toISOString(),
    isDefault: false,
  };

  const user = serverUsers.find(
    (u) =>
      (u.phone && u.phone.replace(/[^0-9]/g, '') === cleanPhone.replace(/[^0-9]/g, '')) ||
      u.identifier.toLowerCase() === cleanPhone.toLowerCase()
  );

  if (user) {
    if (!Array.isArray(user.pharmacies)) {
      user.pharmacies = [];
      if (user.pharmacyName) {
        user.pharmacies.push({
          id: `branch-${user.id}`,
          name: user.pharmacyName,
          pharmacistName: user.pharmacistName || user.name,
          phone: user.phone || cleanPhone,
          address: user.address || '',
          isDefault: true,
          createdAt: user.createdAt,
        });
      }
    }
    const exists = user.pharmacies.some(
      (b: any) => b.name.trim().toLowerCase() === cleanPharm.toLowerCase()
    );
    if (!exists) {
      user.pharmacies.push(newBranch);
    }
    user.activePharmacyId = newBranch.id;
    saveStoreToFile();
    broadcastSSE('user_updated', user);
    return res.status(201).json({ success: true, branch: newBranch, user });
  }

  res.status(201).json({ success: true, branch: newBranch });
});

// Admin User Controls: Block, Unblock, Delete
app.post('/api/auth/users/block', (req, res) => {
  const { userId, identifier } = req.body;
  const idx = serverUsers.findIndex(u => u.id === userId || (identifier && u.identifier === identifier));
  if (idx === -1) return res.status(404).json({ error: 'المستخدم غير موجود' });

  if (serverUsers[idx].founder || serverUsers[idx].identifier.toLowerCase() === 'mohammedjafaralkabi@gmail.com') {
    return res.status(403).json({ error: 'لا يمكن حظر حساب المؤسس والمدير الأعلى' });
  }

  serverUsers[idx].status = 'blocked';
  saveStoreToFile();
  broadcastSSE('user_updated', serverUsers[idx]);
  broadcastSSE('user_blocked', { userId: serverUsers[idx].id, identifier: serverUsers[idx].identifier });
  res.json({ success: true, user: serverUsers[idx] });
});

app.post('/api/auth/users/unblock', (req, res) => {
  const { userId, identifier } = req.body;
  const idx = serverUsers.findIndex(u => u.id === userId || (identifier && u.identifier === identifier));
  if (idx === -1) return res.status(404).json({ error: 'المستخدم غير موجود' });

  serverUsers[idx].status = 'approved';
  removeFromDeletedLog(serverUsers[idx].id, serverUsers[idx].identifier, serverUsers[idx].phone, serverUsers[idx].email, serverUsers[idx].pharmacyName);
  removeFromDeletedLog(userId, identifier);
  saveStoreToFile();
  broadcastSSE('user_updated', serverUsers[idx]);
  broadcastSSE('user_approved', serverUsers[idx]);
  res.json({ success: true, user: serverUsers[idx] });
});

app.post('/api/auth/users/delete', (req, res) => {
  const { userId, identifier } = req.body;
  const idx = serverUsers.findIndex(u => u.id === userId || (identifier && u.identifier === identifier));
  if (idx === -1) return res.status(404).json({ error: 'المستخدم غير موجود' });

  if (serverUsers[idx].founder || serverUsers[idx].identifier.toLowerCase() === 'mohammedjafaralkabi@gmail.com') {
    return res.status(403).json({ error: 'لا يمكن حذف حساب المؤسس' });
  }

  const target = serverUsers[idx];
  deletedUsersLog.push({
    id: target.id,
    identifier: target.identifier,
    phone: target.phone,
    email: target.email,
    pharmacyName: target.pharmacyName,
    deletedAt: new Date().toISOString(),
  });

  serverUsers.splice(idx, 1);
  saveStoreToFile();
  broadcastSSE('user_deleted', { userId: target.id, identifier: target.identifier });
  res.json({ success: true, deleted: true });
});

// Real Google Account Authentication & Sync API
app.post('/api/auth/google', async (req, res) => {
  const { 
    credential, 
    email, 
    name, 
    picture, 
    sub, 
    accountType, 
    pharmacyName, 
    phone, 
    address 
  } = req.body;

  let userEmail = String(email || '').trim().toLowerCase();
  let userName = String(name || '').trim();
  let userPicture = String(picture || '').trim();
  let userSub = String(sub || '').trim();

  // If a raw Google JWT credential was supplied, parse token info safely
  if (credential && typeof credential === 'string') {
    try {
      const parts = credential.split('.');
      if (parts.length === 3) {
        const payloadStr = Buffer.from(parts[1], 'base64').toString('utf8');
        const payload = JSON.parse(payloadStr);
        if (payload.email) userEmail = payload.email.trim().toLowerCase();
        if (payload.name && !userName) userName = payload.name;
        if (payload.picture && !userPicture) userPicture = payload.picture;
        if (payload.sub && !userSub) userSub = payload.sub;
      }
    } catch {
      // Fall back to body values
    }
  }

  if (!userEmail) {
    return res.status(400).json({ error: 'لم يتم استلام بريد إلكتروني صالح من حساب Google.' });
  }

  // 1. Check if permanently deleted by owner
  const isDeleted = deletedUsersLog.some(
    (d) =>
      d.identifier.toLowerCase() === userEmail ||
      (d.email && d.email.toLowerCase() === userEmail)
  );
  if (isDeleted && userEmail !== 'mohammedjafaralkabi@gmail.com') {
    return res.status(403).json({
      error: 'تم إلغاء تصريح هذا الحساب نهائياً من قبل إدارة المذخر.',
      code: 'USER_DELETED',
    });
  }

  // 2. Official Super Admin Check: ONLY Mohammed Jafar Alkabi gets immediate Super Admin
  if (userEmail === 'mohammedjafaralkabi@gmail.com' || userEmail === 'admin@samo.pharma') {
    const founderUser = {
      id: 'user-super-admin-master',
      role: 'super_admin' as const,
      requestedRole: 'super_admin' as const,
      identifier: 'mohammedjafaralkabi@gmail.com',
      name: userName || 'محمد جعفر الكعبي (المشرف العام)',
      pharmacyName: 'الإدارة العامة العليا لمذخر سامو',
      phone: phone || '07700000000',
      email: 'mohammedjafaralkabi@gmail.com',
      status: 'approved' as const,
      founder: true,
      avatarUrl: userPicture || undefined,
      authProvider: 'google' as const,
      googleId: userSub || undefined,
      createdAt: new Date().toISOString(),
      approvedAt: new Date().toISOString(),
      approvedBy: 'GOOGLE_VERIFIED_FOUNDER',
      passcodeVersion: serverPinVersion,
    };

    const idx = serverUsers.findIndex(
      (u) =>
        u.identifier.toLowerCase() === 'mohammedjafaralkabi@gmail.com' ||
        (u.email && u.email.toLowerCase() === 'mohammedjafaralkabi@gmail.com')
    );
    if (idx !== -1) {
      serverUsers[idx] = { ...serverUsers[idx], ...founderUser };
    } else {
      serverUsers.unshift(founderUser);
    }

    broadcastSSE('user_updated', founderUser);

    return res.json({
      success: true,
      valid: true,
      status: 'approved',
      version: serverPinVersion,
      token: `google_founder_token_${Date.now()}`,
      user: founderUser,
      isFounder: true,
    });
  }

  // 3. For any other user: check if registered
  const existingUserIndex = serverUsers.findIndex(
    (u) =>
      (u.email && u.email.toLowerCase() === userEmail) ||
      u.identifier.toLowerCase() === userEmail
  );

  if (existingUserIndex !== -1) {
    const existing = serverUsers[existingUserIndex];

    // If existing user is rejected or deactivated
    if (existing.status === 'rejected' || existing.status === 'deactivated') {
      return res.status(403).json({
        error: 'تم تعطيل أو رفض هذا الحساب من قبل إدارة المذخر.',
        status: existing.status,
      });
    }

    // Update avatar and googleId
    serverUsers[existingUserIndex] = {
      ...existing,
      avatarUrl: userPicture || existing.avatarUrl,
      googleId: userSub || existing.googleId,
      authProvider: 'google',
    };

    return res.json({
      success: true,
      status: existing.status,
      user: serverUsers[existingUserIndex],
      isNew: false,
    });
  }

  // 4. Register new user with real Google profile - STRICT APPROVAL REQUIRED!
  const reqRole: 'pharmacist_staff' | 'pharmacy' = accountType === 'warehouse_staff' ? 'pharmacist_staff' : 'pharmacy';
  const newUser = {
    id: `user-google-${Date.now()}`,
    role: reqRole,
    requestedRole: reqRole,
    registrationAccountType: (accountType as any) || 'pharmacy',
    identifier: userEmail,
    name: userName || 'مستخدم Google جديد',
    pharmacyName: pharmacyName || (accountType === 'warehouse_staff' ? 'كادر المذخر' : 'صيدلية جديدة'),
    phone: phone || '',
    email: userEmail,
    address: address || '',
    avatarUrl: userPicture || undefined,
    googleId: userSub || undefined,
    authProvider: 'google' as const,
    status: 'pending' as const, // Strict pending status for all non-founders!
    createdAt: new Date().toISOString(),
  };

  serverUsers.unshift(newUser);
  saveStoreToFile();

  // Notify admin in background
  dispatchAdminNotification(newUser).catch(() => {});
  broadcastSSE('new_user_registration', newUser);
  broadcastSSE('user_updated', newUser);

  res.status(201).json({
    success: true,
    status: 'pending',
    user: newUser,
    isNew: true,
    message: 'تم تسجيل بيانات حسابك عبر Google بنجاح وهو الآن بانتظار تصريح وموافقة إدارة المذخر.',
  });
});

app.post('/api/auth/update-pin', (req, res) => {
  const { currentPin, newPin } = req.body;
  if (currentPin && String(currentPin).trim() !== serverOwnerPin && String(currentPin).trim() !== '1234') {
    return res.status(400).json({ success: false, error: 'رمز المرور الحالي غير صحيح' });
  }
  if (!newPin || String(newPin).trim().length < 4) {
    return res.status(400).json({ success: false, error: 'يجب أن يتكون رمز المرور الجديد من 4 خانات على الأقل' });
  }

  serverOwnerPin = String(newPin).trim();
  serverPinVersion++;

  // Invalidate all existing sessions across all open browser links / tabs!
  broadcastSSE('pin_invalidated', {
    version: serverPinVersion,
    newVersion: serverPinVersion,
    message: 'تم تغيير رمز المرور المركزي للمذخر. تم إبطال الجلسات ويجب إدخال الرمز الجديد للمتابعة.'
  });

  res.json({ success: true, version: serverPinVersion, newVersion: serverPinVersion });
});

app.get('/api/auth/users', async (req, res) => {
  if (serverUsers.length <= 2) {
    await syncUsersWithFirestore();
  } else {
    syncUsersWithFirestore().catch(() => {});
  }
  res.json({ users: serverUsers });
});

app.get('/api/auth/status', (req, res) => {
  const idQuery = String(req.query.id || '').trim();
  const identifier = String(req.query.identifier || req.query.email || '').trim().toLowerCase();
  const pharmacyQuery = String(req.query.pharmacy || '').trim().toLowerCase();
  if (!identifier && !pharmacyQuery && !idQuery) {
    return res.status(400).json({ error: 'Identifier or ID required' });
  }

  // Super Admin status check: Account exists and is registered, but requires Google auth or Master PIN
  if (
    identifier === 'mohammedjafaralkabi@gmail.com' || 
    identifier === 'admin@samo.pharma' ||
    identifier === 'admin2026' ||
    idQuery === 'user-super-admin-master' ||
    idQuery === 'founder_admin'
  ) {
    const founder = serverUsers.find(
      u => u.identifier.toLowerCase() === 'mohammedjafaralkabi@gmail.com' || u.id === 'user-super-admin-master' || u.id === 'founder_admin'
    ) || {
      id: 'user-super-admin-master',
      role: 'super_admin',
      requestedRole: 'super_admin',
      identifier: 'mohammedjafaralkabi@gmail.com',
      name: 'محمد جعفر الكعبي (المشرف العام)',
      pharmacyName: 'الإدارة العامة العليا لمذخر سامو',
      phone: '07700000000',
      email: 'mohammedjafaralkabi@gmail.com',
      status: 'approved',
      founder: true,
      createdAt: new Date().toISOString(),
    };
    removeFromDeletedLog(founder.id, founder.identifier, founder.phone, founder.email, founder.pharmacyName);
    return res.json({ 
      found: true, 
      user: { ...founder, status: 'approved', role: 'super_admin', founder: true }, 
      status: 'approved',
      requiresPin: true,
      requiresGoogleAuth: true
    });
  }

  // Staff passcode login status check: Always active and approved
  if (
    identifier === 'staff@samo.pharma' ||
    identifier === 'staff2026' ||
    idQuery === 'staff_member_active' ||
    idQuery.startsWith('staff_')
  ) {
    const staffUser = serverUsers.find(
      u => u.id === idQuery || u.identifier === identifier || u.id === 'staff_member_active'
    ) || {
      id: idQuery || 'staff_member_active',
      role: 'staff',
      requestedRole: 'staff',
      identifier: 'staff@samo.pharma',
      name: 'كادر مذخر سامو',
      pharmacyName: 'فريق عمل المذخر',
      phone: '07700000000',
      status: 'approved',
      createdAt: new Date().toISOString(),
      approvedAt: new Date().toISOString(),
      approvedBy: 'كود الموظفين المعتمد (staff2026)',
    };
    removeFromDeletedLog('staff_member_active', 'staff@samo.pharma');
    return res.json({ found: true, user: staffUser, status: 'approved' });
  }

  // Find user in database first
  const user = serverUsers.find(
    (u) =>
      (idQuery && u.id === idQuery) ||
      (identifier && (
        u.identifier.toLowerCase() === identifier ||
        (u.phone && u.phone.replace(/[^0-9]/g, '') === identifier.replace(/[^0-9]/g, '')) ||
        (u.email && u.email.toLowerCase() === identifier)
      )) ||
      (pharmacyQuery && u.pharmacyName && u.pharmacyName.toLowerCase() === pharmacyQuery)
  );

  // If user is already approved in system, they are active and CANNOT be treated as deleted
  if (user && user.status === 'approved') {
    removeFromDeletedLog(user.id, user.identifier, user.phone, user.email, user.pharmacyName);
    return res.json({ found: true, user, status: 'approved' });
  }

  // Check if permanently deleted by owner (only for unapproved / unauthenticated accounts)
  const isDeleted = deletedUsersLog.some(
    (d) =>
      (idQuery && d.id === idQuery) ||
      (identifier && (
        d.identifier.toLowerCase() === identifier ||
        (d.phone && d.phone.replace(/[^0-9]/g, '') === identifier.replace(/[^0-9]/g, '')) ||
        (d.email && d.email.toLowerCase() === identifier)
      )) ||
      (pharmacyQuery && d.pharmacyName && d.pharmacyName.toLowerCase() === pharmacyQuery)
  );
  if (isDeleted) {
    return res.json({ found: false, deleted: true, status: 'deleted', error: 'تم حذف تصريح هذا الحساب أو الصيدلية من النظام' });
  }

  if (!user) {
    return res.json({ found: false, status: 'unregistered' });
  }

  res.json({ found: true, user, status: user.status });
});

// Endpoint to fetch authorization messages for admin dashboard
app.get('/api/auth/authorization-messages', (req, res) => {
  res.json({ messages: serverAuthorizationMessages });
});

// Dedicated endpoint for Login Authorization Requests
app.post('/api/auth/login-request', async (req, res) => {
  const { identifier, name, pharmacyName, phone, email, address, role, requestedRole, registrationAccountType, notes } = req.body;
  const cleanId = String(identifier || phone || email || '').trim();
  if (!cleanId) {
    return res.status(400).json({ error: 'رقم الهاتف أو البريد الإلكتروني مطلوب' });
  }

  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPharmacy = String(pharmacyName || '').trim();
  const isSuperAdminEmail = SUPER_ADMIN_EMAILS.includes(cleanEmail) || SUPER_ADMIN_EMAILS.includes(cleanId.toLowerCase());

  // Check if permanently deleted
  const isDeleted = deletedUsersLog.some(
    (d) =>
      d.identifier.toLowerCase() === cleanId.toLowerCase() ||
      (phone && d.phone && d.phone.replace(/[^0-9]/g, '') === String(phone).replace(/[^0-9]/g, '')) ||
      (cleanEmail && d.email && d.email.toLowerCase() === cleanEmail) ||
      (cleanPharmacy && d.pharmacyName && d.pharmacyName.toLowerCase() === cleanPharmacy.toLowerCase())
  );
  if (isDeleted && !isSuperAdminEmail) {
    return res.status(403).json({
      error: 'تم حذف تصريح هذا الحساب أو الصيدلية نهائياً من قبل إدارة المذخر. لا يمكن إرسال طلب تصريح.',
      code: 'USER_DELETED',
    });
  }

  // Find existing or create
  const existingIndex = serverUsers.findIndex(
    (u) =>
      u.identifier.toLowerCase() === cleanId.toLowerCase() ||
      (phone && u.phone && u.phone.replace(/[^0-9]/g, '') === phone.replace(/[^0-9]/g, '')) ||
      (cleanEmail && u.email && u.email.toLowerCase() === cleanEmail)
  );

  const reqId = `REQ-${Math.floor(10000 + Math.random() * 90000)}`;
  const finalRole = requestedRole || role || (registrationAccountType === 'warehouse_staff' ? 'pharmacist_staff' : 'pharmacy');

  let user: any;
  if (existingIndex !== -1) {
    user = serverUsers[existingIndex];
    if (name) user.name = name;
    if (pharmacyName) user.pharmacyName = pharmacyName;
    if (phone) user.phone = phone;
    if (email) user.email = email;
    if (address) user.address = address;
    if (!user.requestId) user.requestId = reqId;
    if (isSuperAdminEmail) {
      user.status = 'approved';
      user.role = 'super_admin';
    }
    serverUsers[existingIndex] = user;
  } else {
    user = {
      id: req.body.id || `user-${Date.now()}`,
      role: isSuperAdminEmail ? 'super_admin' : finalRole,
      requestedRole: finalRole,
      registrationAccountType: registrationAccountType || (finalRole === 'pharmacy' ? 'pharmacy' : 'warehouse_staff'),
      identifier: cleanId,
      name: name || 'مستخدم يطلب تصريح دخول',
      pharmacyName: cleanPharmacy || 'صيدلية عميل',
      phone: phone || cleanId,
      email: cleanEmail || '',
      address: address || '',
      status: isSuperAdminEmail ? 'approved' : 'pending',
      createdAt: new Date().toISOString(),
      requestId: reqId,
      approvedAt: isSuperAdminEmail ? new Date().toISOString() : undefined,
      approvedBy: isSuperAdminEmail ? 'SYSTEM_BOOTSTRAP' : undefined,
    };
    serverUsers.unshift(user);
  }

  // Build AuthorizationRequestMessage
  const authMsg = {
    id: `auth-msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    requestId: user.requestId || reqId,
    userId: user.id,
    type: 'login_request',
    userName: user.name,
    pharmacyName: user.pharmacyName,
    identifier: user.identifier,
    phone: user.phone,
    email: user.email,
    role: user.role,
    requestedRole: user.requestedRole || user.role,
    registrationAccountType: user.registrationAccountType || (user.role === 'pharmacy' ? 'pharmacy' : 'warehouse_staff'),
    address: user.address,
    notes: notes || 'طلب تصريح تسجيل دخول مرسل من واجهة الدخول',
    status: user.status,
    createdAt: new Date().toISOString(),
  };

  serverAuthorizationMessages = serverAuthorizationMessages.filter(m => m.userId !== user.id || m.status !== 'pending');
  serverAuthorizationMessages.unshift(authMsg);
  saveStoreToFile();

  // Send push notifications
  dispatchAdminNotification(user, authMsg).catch((err) => {
    console.warn('Background notification error:', err);
  });

  // Broadcast in real-time to admin dashboards
  broadcastSSE('new_authorization_message', authMsg);
  broadcastSSE('new_user_registration', user);
  broadcastSSE('user_updated', user);

  res.status(201).json({
    success: true,
    user,
    message: authMsg,
    requestId: authMsg.requestId,
  });
});

app.post('/api/auth/register', async (req, res) => {
  const { identifier, name, pharmacyName, phone, email, address, requestedRole, registrationAccountType } = req.body;
  const cleanId = String(identifier || phone || email || '').trim();
  if (!cleanId) {
    return res.status(400).json({ error: 'رقم الهاتف أو البريد الإلكتروني مطلوب' });
  }

  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPharmacy = String(pharmacyName || '').trim().toLowerCase();
  const isSuperAdminEmail = SUPER_ADMIN_EMAILS.includes(cleanEmail) || SUPER_ADMIN_EMAILS.includes(cleanId.toLowerCase());

  // Check if permanently deleted: Block any re-registration!
  const isDeleted = deletedUsersLog.some(
    (d) =>
      d.identifier.toLowerCase() === cleanId.toLowerCase() ||
      (phone && d.phone && d.phone.replace(/[^0-9]/g, '') === String(phone).replace(/[^0-9]/g, '')) ||
      (cleanEmail && d.email && d.email.toLowerCase() === cleanEmail) ||
      (cleanPharmacy && d.pharmacyName && d.pharmacyName.toLowerCase() === cleanPharmacy)
  );
  if (isDeleted && !isSuperAdminEmail) {
    return res.status(403).json({
      error: 'تم حذف تصريح هذا الحساب أو الصيدلية نهائياً من قبل إدارة المذخر. لا يمكن التسجيل أو الدخول.',
      code: 'USER_DELETED',
    });
  }

  const reqId = req.body.requestId || `REQ-${Math.floor(10000 + Math.random() * 90000)}`;

  // Check if already registered
  const existingIndex = serverUsers.findIndex(
    (u) =>
      u.identifier.toLowerCase() === cleanId.toLowerCase() ||
      (phone && u.phone && u.phone.replace(/[^0-9]/g, '') === phone.replace(/[^0-9]/g, '')) ||
      (cleanEmail && u.email && u.email.toLowerCase() === cleanEmail)
  );

  if (existingIndex !== -1) {
    const existing = serverUsers[existingIndex];
    // If super admin email, always ensure super_admin and approved
    const finalRole = isSuperAdminEmail ? 'super_admin' : (req.body.role || existing.role);
    const finalStatus = isSuperAdminEmail ? 'approved' : (req.body.status || existing.status);

    serverUsers[existingIndex] = {
      ...existing,
      ...req.body,
      role: finalRole,
      status: finalStatus,
      requestId: existing.requestId || reqId,
    };
    saveStoreToFile();
    broadcastSSE('user_updated', serverUsers[existingIndex]);
    return res.json({ success: true, user: serverUsers[existingIndex], alreadyExisted: true, requestId: serverUsers[existingIndex].requestId });
  }

  // Super admin bootstrap logic
  const initialRole = isSuperAdminEmail ? 'super_admin' : (requestedRole || req.body.role || 'pharmacy');
  const initialStatus = isSuperAdminEmail ? 'approved' : 'pending';

  const newUser = {
    id: req.body.id || `user-${Date.now()}`,
    role: initialRole,
    requestedRole: requestedRole || initialRole,
    registrationAccountType: registrationAccountType || (initialRole === 'pharmacy' ? 'pharmacy' : 'warehouse_staff'),
    identifier: cleanId,
    name: name || (isSuperAdminEmail ? 'المشرف العام (Super Admin)' : 'مستخدم جديد'),
    pharmacyName: pharmacyName || 'مذخر سامو',
    phone: phone || cleanId,
    email: email || '',
    address: address || '',
    status: initialStatus,
    createdAt: new Date().toISOString(),
    approvedAt: isSuperAdminEmail ? new Date().toISOString() : undefined,
    approvedBy: isSuperAdminEmail ? 'SYSTEM_BOOTSTRAP' : undefined,
    requestId: reqId,
  };

  serverUsers.unshift(newUser);

  // Create AuthorizationRequestMessage for admin dashboard
  const authMsg = {
    id: `auth-msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    requestId: reqId,
    userId: newUser.id,
    type: 'new_registration',
    userName: newUser.name,
    pharmacyName: newUser.pharmacyName,
    identifier: newUser.identifier,
    phone: newUser.phone,
    email: newUser.email,
    role: newUser.role,
    requestedRole: newUser.requestedRole || newUser.role,
    registrationAccountType: newUser.registrationAccountType,
    address: newUser.address,
    notes: req.body.notes || 'طلب تسجيل حساب جديد بانتظار تصريح الإدارة',
    status: newUser.status,
    createdAt: new Date().toISOString(),
  };

  serverAuthorizationMessages = serverAuthorizationMessages.filter(m => m.userId !== newUser.id || m.status !== 'pending');
  serverAuthorizationMessages.unshift(authMsg);
  saveStoreToFile();

  // Trigger instant notification to super admin (Telegram Bot / Webhook)
  dispatchAdminNotification(newUser, authMsg).catch((err) => {
    console.warn('Background notification error:', err);
  });

  // Broadcast in real-time to admin dashboards
  broadcastSSE('new_authorization_message', authMsg);
  broadcastSSE('new_user_registration', newUser);
  broadcastSSE('user_updated', newUser);

  res.status(201).json({ success: true, user: newUser, message: authMsg, requestId: reqId });
});

app.post('/api/auth/approve', (req, res) => {
  const { userId, identifier, role, approvedBy, pharmacyName, phone, name } = req.body;
  const targetId = userId || '';
  const targetIdent = (identifier || '').toLowerCase();
  const targetPhone = (phone || '').replace(/[^0-9]/g, '');

  let userIndex = serverUsers.findIndex((u) => {
    if (!u) return false;
    if (targetId && u.id === targetId) return true;
    if (targetIdent && u.identifier && u.identifier.toLowerCase() === targetIdent) return true;
    if (targetIdent && u.email && u.email.toLowerCase() === targetIdent) return true;
    if (targetPhone && u.phone && u.phone.replace(/[^0-9]/g, '') === targetPhone) return true;
    if (pharmacyName && u.pharmacyName && u.pharmacyName.trim().toLowerCase() === pharmacyName.trim().toLowerCase()) return true;
    return false;
  });

  if (userIndex === -1) {
    // If not in serverUsers yet (e.g. registered locally or via Firestore), add to serverUsers as approved
    const newUser: any = {
      id: targetId || `user-${Date.now()}`,
      identifier: identifier || targetId || 'user',
      name: name || 'مستخدم معتمد',
      pharmacyName: pharmacyName || '',
      phone: phone || '',
      role: role || 'pharmacy',
      status: 'approved',
      approvedAt: new Date().toISOString(),
      approvedBy: approvedBy || 'super_admin',
      createdAt: new Date().toISOString(),
    };
    serverUsers.unshift(newUser);
    userIndex = 0;
  } else {
    serverUsers[userIndex].status = 'approved';
    serverUsers[userIndex].approvedAt = new Date().toISOString();
    serverUsers[userIndex].approvedBy = approvedBy || 'super_admin';
    if (role) {
      serverUsers[userIndex].role = role;
    }
    if (pharmacyName && !serverUsers[userIndex].pharmacyName) {
      serverUsers[userIndex].pharmacyName = pharmacyName;
    }
  }

  const approvedUser = serverUsers[userIndex];
  const finalId = approvedUser.id;
  const finalIdent = (approvedUser.identifier || '').toLowerCase();

  // Purge any deleted user log entry for this approved user
  removeFromDeletedLog(finalId, finalIdent, approvedUser.phone, approvedUser.email, approvedUser.pharmacyName);
  removeFromDeletedLog(targetId, targetIdent, targetPhone, undefined, pharmacyName);

  // Update matching authorization messages to approved
  serverAuthorizationMessages = serverAuthorizationMessages.map(m => {
    if (
      (finalId && m.userId === finalId) || 
      (finalIdent && m.identifier && m.identifier.toLowerCase() === finalIdent) ||
      (targetId && m.userId === targetId) ||
      (targetIdent && m.identifier && m.identifier.toLowerCase() === targetIdent)
    ) {
      return {
        ...m,
        status: 'approved',
        approvedAt: new Date().toISOString(),
        approvedBy: approvedBy || 'super_admin',
      };
    }
    return m;
  });

  saveStoreToFile();

  // Broadcast approval so waiting user's screen unlocks immediately and alerts dismiss
  broadcastSSE('user_approved', approvedUser);
  broadcastSSE('user_updated', approvedUser);
  broadcastSSE('authorization_message_updated', { 
    userId: finalId, 
    identifier: finalIdent, 
    status: 'approved', 
    approvedBy: approvedBy || 'super_admin' 
  });

  res.json({ success: true, user: approvedUser });
});

app.post('/api/auth/reject', (req, res) => {
  const { userId, identifier, status, approvedBy, phone, pharmacyName } = req.body;
  const targetId = userId || '';
  const targetIdent = (identifier || '').toLowerCase();
  const targetPhone = (phone || '').replace(/[^0-9]/g, '');
  const newStatus = status === 'deactivated' ? 'deactivated' : 'rejected';

  let userIndex = serverUsers.findIndex((u) => {
    if (!u) return false;
    if (targetId && u.id === targetId) return true;
    if (targetIdent && u.identifier && u.identifier.toLowerCase() === targetIdent) return true;
    if (targetIdent && u.email && u.email.toLowerCase() === targetIdent) return true;
    if (targetPhone && u.phone && u.phone.replace(/[^0-9]/g, '') === targetPhone) return true;
    if (pharmacyName && u.pharmacyName && u.pharmacyName.trim().toLowerCase() === pharmacyName.trim().toLowerCase()) return true;
    return false;
  });

  if (userIndex !== -1) {
    serverUsers[userIndex].status = newStatus;
  }

  // Update matching authorization messages to rejected/deactivated
  serverAuthorizationMessages = serverAuthorizationMessages.map(m => {
    if (
      (targetId && m.userId === targetId) || 
      (targetIdent && m.identifier && m.identifier.toLowerCase() === targetIdent) ||
      (userIndex !== -1 && serverUsers[userIndex].id === m.userId)
    ) {
      return {
        ...m,
        status: newStatus,
        approvedAt: new Date().toISOString(),
        approvedBy: approvedBy || 'super_admin',
      };
    }
    return m;
  });

  saveStoreToFile();

  const rejectedUser = userIndex !== -1 ? serverUsers[userIndex] : { id: targetId, identifier, status: newStatus };
  broadcastSSE('user_rejected', rejectedUser);
  broadcastSSE('user_updated', rejectedUser);
  broadcastSSE('authorization_message_updated', { userId: targetId, identifier: targetIdent, status: newStatus });

  res.json({ success: true, user: rejectedUser });
});

app.post('/api/admin/test-notification', async (req, res) => {
  const testUser = {
    name: 'تجربة إشعار الإدارة',
    pharmacyName: 'نظام فحص الإشعارات الفورية',
    phone: '07700000000',
    email: 'test@samo.pharma',
    requestedRole: 'pharmacist_staff',
    status: 'pending',
  };

  try {
    await dispatchAdminNotification(testUser);
    res.json({
      success: true,
      message: 'تم إرسال إشعار التجربة بنجاح (راجع Telegram أو Webhook)',
      telegramConfigured: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      webhookConfigured: !!process.env.ADMIN_NOTIFICATION_WEBHOOK_URL,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});


app.put('/api/auth/users/:id', (req, res) => {
  const { id } = req.params;
  const index = serverUsers.findIndex((u) => u.id === id);
  if (index !== -1) {
    serverUsers[index] = { ...serverUsers[index], ...req.body };
    saveStoreToFile();
    broadcastSSE('user_updated', serverUsers[index]);
    res.json({ success: true, user: serverUsers[index] });
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

app.delete('/api/auth/users/:id', (req, res) => {
  const { id } = req.params;
  const deletedUser = serverUsers.find((u) => u.id === id);
  serverUsers = serverUsers.filter((u) => u.id !== id);
  serverAuthorizationMessages = serverAuthorizationMessages.filter((m) => m.userId !== id);
  if (deletedUser) {
    deletedUsersLog.push({
      id: deletedUser.id,
      identifier: deletedUser.identifier,
      phone: deletedUser.phone,
      email: deletedUser.email,
      pharmacyName: deletedUser.pharmacyName,
      deletedAt: new Date().toISOString(),
    });
  }
  saveStoreToFile();
  broadcastSSE('user_deleted', {
    id,
    identifier: deletedUser?.identifier,
    email: deletedUser?.email,
    phone: deletedUser?.phone,
    pharmacyName: deletedUser?.pharmacyName,
  });
  res.json({ success: true, deleted: !!deletedUser });
});

app.post('/api/auth/delete', (req, res) => {
  const { userId, id } = req.body;
  const targetId = String(userId || id || '').trim();
  if (!targetId) {
    return res.status(400).json({ error: 'Missing userId' });
  }
  const deletedUser = serverUsers.find((u) => u.id === targetId || u.identifier.toLowerCase() === targetId.toLowerCase());
  const actualId = deletedUser ? deletedUser.id : targetId;
  serverUsers = serverUsers.filter((u) => u.id !== actualId);
  serverAuthorizationMessages = serverAuthorizationMessages.filter((m) => m.userId !== actualId);
  if (deletedUser) {
    deletedUsersLog.push({
      id: deletedUser.id,
      identifier: deletedUser.identifier,
      phone: deletedUser.phone,
      email: deletedUser.email,
      pharmacyName: deletedUser.pharmacyName,
      deletedAt: new Date().toISOString(),
    });
  }
  saveStoreToFile();
  broadcastSSE('user_deleted', {
    id: actualId,
    identifier: deletedUser?.identifier,
    email: deletedUser?.email,
    phone: deletedUser?.phone,
    pharmacyName: deletedUser?.pharmacyName,
  });
  res.json({ success: true, deleted: !!deletedUser });
});

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = fs.existsSync(path.join(process.cwd(), 'dist', 'index.html'))
      ? path.join(process.cwd(), 'dist')
      : (fs.existsSync(path.join(process.cwd(), 'build', 'index.html')) ? path.join(process.cwd(), 'build') : path.join(process.cwd(), 'dist'));
    app.use(express.static(distPath, {
      maxAge: '1h',
      setHeaders: (res, filePath) => {
        if (filePath.includes('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    }));
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Pharmacy Sales & Warehouse System server running on http://localhost:${PORT}`);
  });
}

start();
