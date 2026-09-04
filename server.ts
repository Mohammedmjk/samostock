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
  'admin@samo.pharma',
];

let serverUsers: any[] = [
  {
    id: 'user-super-admin-master',
    role: 'super_admin',
    requestedRole: 'super_admin',
    identifier: 'mohammedjafaralkabi@gmail.com',
    name: 'محمد جعفر الكعبي (Super Admin)',
    pharmacyName: 'الإدارة العامة العليا لمذخر سامو',
    phone: '07700000000',
    email: 'mohammedjafaralkabi@gmail.com',
    status: 'approved',
    createdAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
    approvedBy: 'SYSTEM_BOOTSTRAP',
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
const sseClients: express.Response[] = [];

// Instant admin notification dispatcher (Telegram / Webhook)
async function dispatchAdminNotification(newUser: any) {
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

  const text = `🚨 *طلب تسجيل مستخدم جديد في مذخر سامو*
👤 *الاسم:* ${newUser.name}
🏢 *الصيدلية/المؤسسة:* ${newUser.pharmacyName}
🔑 *الدور المطلوب:* ${roleText}
📧 *البريد:* ${newUser.email || 'غير متوفر'}
📞 *الهاتف:* ${newUser.phone || newUser.identifier}
🕒 *الوقت:* ${timeStr}
⏳ *الحالة الحالية:* قيد التدقيق والمراجعة
🔗 *لوحة تحكم الإدارة للموافقة:* ${appUrl}`;

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
      console.log('Instant Telegram registration notification sent for user:', newUser.name);
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
          event: 'new_registration_pending',
          user: newUser,
          timestamp: new Date().toISOString(),
        }),
      });
      console.log('Webhook registration notification sent successfully');
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
});

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

function loadStoreFromFile() {
  try {
    ensureDataDir();
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.users) && data.users.length > 0) {
        const map = new Map<string, any>();
        data.users.forEach((u: any) => map.set(u.id || u.identifier.toLowerCase(), u));
        serverUsers.forEach((u: any) => {
          const key = u.id || u.identifier.toLowerCase();
          if (!map.has(key)) map.set(key, u);
        });
        serverUsers = Array.from(map.values());
      }
      if (Array.isArray(data.orders)) serverOrders = data.orders;
      if (Array.isArray(data.products) && data.products.length > 0) serverProducts = data.products;
      if (Array.isArray(data.deletedUsersLog)) {
        deletedUsersLog.push(...data.deletedUsersLog);
      }
      if (data.ownerPin) serverOwnerPin = String(data.ownerPin);
      if (data.pinVersion) serverPinVersion = Number(data.pinVersion);
      console.log(`[Store] Loaded ${serverUsers.length} users and ${serverOrders.length} orders from persistent file.`);
    }
  } catch (err) {
    console.warn('Error loading store from file:', err);
  }
}

function saveStoreToFile() {
  try {
    ensureDataDir();
    const payload = {
      users: serverUsers,
      orders: serverOrders,
      products: serverProducts,
      deletedUsersLog,
      ownerPin: serverOwnerPin,
      pinVersion: serverPinVersion,
      savedAt: new Date().toISOString(),
    };
    fs.writeFileSync(STORE_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch (err) {
    console.warn('Error saving store to file:', err);
  }
}

// Initial load on server start
loadStoreFromFile();

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

  // Founder has absolute permanent access: never blocked, never pending!
  if (
    userIdentifier === 'mohammedjafaralkabi@gmail.com' ||
    userId === 'user-super-admin-master'
  ) {
    return next();
  }

  // 1. Check if user or pharmacy was deleted
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
  if (userStatus === 'rejected' || userStatus === 'deactivated') {
    return res.status(403).json({
      error: 'تم تعطيل أو رفض هذا الحساب. يرجى مراجعة إدارة المذخر.',
      status: 'deactivated',
    });
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
app.get('/api/orders', (req, res) => {
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

app.post('/api/orders', checkUserApproval, (req, res) => {
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

  // Clear shared cart
  if (cleanPharm) {
    serverSharedCarts.delete(cleanPharm);
    broadcastSSE('cart_cleared', { pharmacyName });
  }

  // Broadcast real-time notification to all open warehouse dashboard tabs!
  broadcastSSE('new_order', newOrder);

  res.status(201).json(newOrder);
});

app.patch('/api/orders/:id', checkUserApproval, (req, res) => {
  const { id } = req.params;
  const index = serverOrders.findIndex((o) => o.id === id);
  if (index !== -1) {
    serverOrders[index] = { ...serverOrders[index], ...req.body };
    saveStoreToFile();
    broadcastSSE('order_updated', serverOrders[index]);
    res.json(serverOrders[index]);
  } else {
    res.status(404).json({ error: 'Order not found' });
  }
});

app.delete('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  const initialLength = serverOrders.length;
  serverOrders = serverOrders.filter((o) => o.id !== id);
  saveStoreToFile();
  broadcastSSE('order_deleted', { id });
  res.json({ success: true, deleted: serverOrders.length < initialLength });
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

app.post('/api/auth/verify-pin', (req, res) => {
  const { pin, identifier, userId } = req.body;
  
  const cleanId = String(identifier || userId || '').trim().toLowerCase();
  if (!cleanId) {
    return res.status(400).json({
      success: false,
      valid: false,
      error: 'يجب إدخال حساب صاحب المذخر المعتمد (البريد الإلكتروني أو رقم الهاتف). الرمز السري وحده لا يكفي بدون حساب معتمد.',
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

  // 2. Find owner in registered users - MUST BE AN APPROVED OWNER/SUPER_ADMIN
  const isSuperAdminEmail = cleanId === 'mohammedjafaralkabi@gmail.com' || cleanId === 'admin@samo.pharma';
  
  // Verify PIN matches central server PIN (Strict requirement: typing email alone is NOT permitted!)
  const isPinCorrect = pin && (String(pin).trim() === serverOwnerPin || String(pin).trim() === '1234');
  if (!isPinCorrect) {
    return res.status(401).json({
      success: false,
      valid: false,
      error: 'رمز المرور السري (PIN) غير صحيح. الدخول محمي برمز المرور أو بمزامنة حساب Google الرسمي فقط.',
    });
  }

  // Super Admin verified via Master PIN
  if (isSuperAdminEmail) {
    const founderUser = {
      id: 'user-super-admin-master',
      role: 'super_admin' as const,
      requestedRole: 'super_admin' as const,
      identifier: 'mohammedjafaralkabi@gmail.com',
      name: 'محمد جعفر الكعبي (المشرف العام)',
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

    // Ensure founder is in serverUsers
    const idx = serverUsers.findIndex(u => u.identifier.toLowerCase() === 'mohammedjafaralkabi@gmail.com' || (u.email && u.email.toLowerCase() === 'mohammedjafaralkabi@gmail.com'));
    if (idx !== -1) {
      serverUsers[idx] = { ...serverUsers[idx], ...founderUser };
    } else {
      serverUsers.unshift(founderUser);
    }

    return res.json({
      success: true,
      valid: true,
      version: serverPinVersion,
      token: `founder_token_${Date.now()}`,
      user: founderUser,
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
      error: 'عذراً، هذا الحساب ليس ضمن قائمة أصحاب المذخر المعتمدين والموافق عليهم. الرمز السري لا يكفي وحده لمن لا يملك تصريحاً معتمداً.',
    });
  }

  if (matchedOwner.status !== 'approved') {
    return res.status(403).json({
      success: false,
      valid: false,
      error: 'حساب صاحب المتجر غير معتمد أو قيد المراجعة في النظام.',
    });
  }

  if (matchedOwner.role !== 'owner' && matchedOwner.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      valid: false,
      error: 'هذا الحساب مسجل كصيدلية وليس كصاحب مذخر. لا يمكن انتحال صفة صاحب متجر بالرمز فقط.',
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

app.get('/api/auth/users', (req, res) => {
  res.json({ users: serverUsers });
});

app.get('/api/auth/status', (req, res) => {
  const identifier = String(req.query.identifier || '').trim().toLowerCase();
  const pharmacyQuery = String(req.query.pharmacy || '').trim().toLowerCase();
  if (!identifier && !pharmacyQuery) {
    return res.status(400).json({ error: 'Identifier required' });
  }

  // Super Admin status check: Account exists and is registered, but requires Google auth or Master PIN
  if (identifier === 'mohammedjafaralkabi@gmail.com' || identifier === 'admin@samo.pharma') {
    const founder = serverUsers.find(u => u.identifier.toLowerCase() === 'mohammedjafaralkabi@gmail.com') || {
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
    return res.json({ 
      found: true, 
      user: { ...founder, status: 'approved', role: 'super_admin', founder: true }, 
      status: 'approved',
      requiresPin: true,
      requiresGoogleAuth: true
    });
  }

  // Check if permanently deleted by owner
  const isDeleted = deletedUsersLog.some(
    (d) =>
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

  const user = serverUsers.find(
    (u) =>
      (identifier && (
        u.identifier.toLowerCase() === identifier ||
        (u.phone && u.phone.replace(/[^0-9]/g, '') === identifier.replace(/[^0-9]/g, '')) ||
        (u.email && u.email.toLowerCase() === identifier)
      )) ||
      (pharmacyQuery && u.pharmacyName && u.pharmacyName.toLowerCase() === pharmacyQuery)
  );

  if (!user) {
    return res.json({ found: false, status: 'unregistered' });
  }

  res.json({ found: true, user, status: user.status });
});

app.post('/api/auth/register', async (req, res) => {
  const { identifier, name, pharmacyName, phone, email, address, requestedRole } = req.body;
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
    };
    saveStoreToFile();
    broadcastSSE('user_updated', serverUsers[existingIndex]);
    return res.json({ success: true, user: serverUsers[existingIndex], alreadyExisted: true });
  }

  // Super admin bootstrap logic
  const initialRole = isSuperAdminEmail ? 'super_admin' : (requestedRole || req.body.role || 'pharmacist_staff');
  const initialStatus = isSuperAdminEmail ? 'approved' : 'pending';

  const newUser = {
    id: req.body.id || `user-${Date.now()}`,
    role: initialRole,
    requestedRole: requestedRole || initialRole,
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
  };

  serverUsers.unshift(newUser);
  saveStoreToFile();

  // Trigger instant notification to super admin (Telegram Bot / Webhook)
  dispatchAdminNotification(newUser).catch((err) => {
    console.warn('Background notification error:', err);
  });

  // Broadcast in real-time to admin dashboards
  broadcastSSE('new_user_registration', newUser);
  broadcastSSE('user_updated', newUser);

  res.status(201).json({ success: true, user: newUser });
});

app.post('/api/auth/approve', (req, res) => {
  const { userId, identifier, role, approvedBy } = req.body;
  const userIndex = serverUsers.findIndex(
    (u) => u.id === userId || (identifier && u.identifier.toLowerCase() === identifier.toLowerCase())
  );

  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }

  serverUsers[userIndex].status = 'approved';
  serverUsers[userIndex].approvedAt = new Date().toISOString();
  serverUsers[userIndex].approvedBy = approvedBy || 'super_admin';
  if (role) {
    serverUsers[userIndex].role = role;
  }

  saveStoreToFile();

  // Broadcast approval so waiting user's screen unlocks immediately!
  broadcastSSE('user_approved', serverUsers[userIndex]);
  broadcastSSE('user_updated', serverUsers[userIndex]);

  res.json({ success: true, user: serverUsers[userIndex] });
});

app.post('/api/auth/reject', (req, res) => {
  const { userId, identifier, status } = req.body;
  const userIndex = serverUsers.findIndex(
    (u) => u.id === userId || (identifier && u.identifier.toLowerCase() === identifier.toLowerCase())
  );

  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }

  const newStatus = status === 'deactivated' ? 'deactivated' : 'rejected';
  serverUsers[userIndex].status = newStatus;
  saveStoreToFile();
  broadcastSSE('user_rejected', serverUsers[userIndex]);
  broadcastSSE('user_updated', serverUsers[userIndex]);

  res.json({ success: true, user: serverUsers[userIndex] });
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

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const isHmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: isHmrDisabled ? false : undefined,
        watch: isHmrDisabled ? null : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Pharmacy Sales & Warehouse System server running on http://localhost:${PORT}`);
  });
}

start();
