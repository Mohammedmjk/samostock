export type OrderStatus = 'new' | 'preparing' | 'ready' | 'delivered' | 'cancelled' | 'rejected';

export interface Product {
  id: string;
  barcode: string;
  barcodeAliases?: string[]; // Multiple barcodes / alternative barcodes for the same product
  tradeNameAr: string;
  tradeNameEn: string;
  scientificName: string;
  category: string;
  manufacturer: string;
  dosageForm: string; // أقراص, كبسول, شراب, حقن, كريم, بخاخ
  strength: string; // 1000mg, 500mg, etc.
  packSize: string; // عبوة 14 قرص, 100 مل, إلخ
  storageCondition: string; // 15-25°C, 2-8°C
  batchNumber: string; // رقم الوجبة / التشغيلة LOT (الدفعة الأقرب انتهاءً)
  expiryDate: string; // YYYY-MM or YYYY-MM-DD
  batches?: ProductBatch[]; // سجل جميع التشغيلات/الوجبات المتوفرة للمنتج (FEFO)
  stockQuantity: number;
  minStockLevel: number;
  wholesalePrice: number; // سعر المفرد / الجملة للصيدلية
  publicPrice?: number; // (تم إلغاؤه - البيع جملة فقط)
  bonusPercentage?: number; // نسبة البونص % (تذوب تلقائياً من السعر الأصلي)
  meltedPrice?: number; // السعر بعد تذويب البونص
  bonusBuyQuantity?: number; // مثال: 10
  bonusFreeQuantity?: number; // مثال: 1 (10+1 مجاناً)
  bonusDescription?: string;
  image?: string;
  description?: string;
  genericName?: string;
  isAvailable: boolean;
  updatedAt?: string;
}

export function calculateMeltedPrice(price: number, bonusPercentage: number = 0): number {
  if (!bonusPercentage || bonusPercentage <= 0) return price;
  return Math.max(0, Math.round(price * (1 - bonusPercentage / 100)));
}

export interface CartItem {
  productId: string;
  product: Product;
  quantity: number;
  bonusQuantity: number;
  bonusPercentage?: number;
  unitPrice: number;
  meltedPrice?: number;
  meltedUnitPrice?: number;
  isBonusMelted?: boolean;
  subtotal: number;
}

export type OrderItemStatus = 'pending' | 'available' | 'unavailable';

export interface OrderItem {
  productId: string;
  tradeNameAr: string;
  tradeNameEn: string;
  dosageForm: string;
  strength: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  bonusQuantity: number;
  bonusPercentage?: number;
  isBonusMelted?: boolean;
  meltedUnitPrice?: number;
  unitPrice: number;
  totalPrice: number;
  preparedQuantity?: number;
  confirmedBatch?: string;
  confirmedExpiry?: string;
  verified: boolean;
  notes?: string;
  status?: OrderItemStatus; // 'available' | 'unavailable'
  unavailableReason?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  createdAt: string;
  pharmacyName: string;
  pharmacistName: string;
  phone: string;
  address: string;
  city?: string;
  currency?: string;
  notes?: string;
  items: OrderItem[];
  totalQuantity: number;
  totalBonus: number;
  totalAmount: number;
  status: OrderStatus;
  rejectionReason?: string;
  preparedAt?: string;
  preparedBy?: string;
  completedAt?: string;
  source: 'online_link' | 'offline_cart' | 'direct' | 'link';
  synced: boolean;
  editedAt?: string;
  editedBy?: string;
  editReason?: string;
  lastUpdatedAt?: string;
}

export interface WarehouseOperation {
  id: string;
  type: 'order_created' | 'order_prepared' | 'order_verified' | 'order_delivered' | 'order_rejected' | 'order_edited' | 'order_deleted' | 'status_changed';
  orderId: string;
  orderNumber: string;
  pharmacyName: string;
  performedBy: string;
  timestamp: string;
  actionTitle?: string;
  details?: string;
  status?: OrderStatus;
  targetStatus?: OrderStatus;
  itemsCount?: number;
  totalQuantity?: number;
  totalAmount?: number;
  items?: OrderItem[];
}

export interface WarehouseSettings {
  name: string;
  pharmacistInCharge: string;
  phone: string;
  whatsappPhone?: string;
  salesPhone?: string;
  supportPhone?: string;
  altPhone: string;
  address: string;
  licenseNumber: string;
  currency: string;
  soundAlertEnabled: boolean;
  minOrderValue?: number;
  passcodeVersion?: number;
}

export interface ShareableCartPayload {
  cartId?: string;
  pharmacyName?: string;
  pharmacistName?: string;
  phone?: string;
  discountRate?: number;
  items?: { productId: string; quantity: number }[];
  expiresAt?: string;
}

export interface RegisteredPharmacy {
  id: string;
  name: string;
  pharmacistName: string;
  phone: string;
  address: string;
  city?: string;
  notes?: string;
  createdAt: string;
  ordersCount?: number;
  totalSpent?: number;
  lastOrderDate?: string;
}

export interface UserPharmacyBranch {
  id: string;
  name: string; // اسم الصيدلية (الفرع)
  pharmacistName?: string; // اسم الموظف / الصيدلي المسؤول
  phone: string; // نفس رقم الهاتف
  address: string; // عنوان الصيدلية
  city?: string;
  notes?: string;
  createdAt?: string;
  isDefault?: boolean;
}

export type UserAccessStatus = 'pending' | 'approved' | 'rejected' | 'deactivated' | 'blocked' | 'deleted';

export type UserRole = 
  | 'founder'
  | 'staff'
  | 'warehouse'
  | 'pharmacy'
  | 'pending'
  | 'super_admin'
  | 'warehouse_manager'
  | 'pharmacist_staff'
  | 'auditor_readonly'
  | 'owner'
  | 'rejected';

// Permanent super admin emails with bootstrap master access
export const SUPER_ADMIN_EMAILS: string[] = [
  'mohammedjafaralkabi@gmail.com',
  'admin@samo.pharma',
];

export function isSuperAdminEmail(email?: string): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return clean === 'mohammedjafaralkabi@gmail.com' || clean === 'admin@samo.pharma';
}

export type RegistrationAccountType = 'warehouse_staff' | 'pharmacy';

export interface AuthorizationRequestMessage {
  id: string;
  requestId: string; // e.g. REQ-73821
  userId: string;
  type: 'login_request' | 'new_registration';
  userName: string;
  pharmacyName: string;
  identifier: string; // phone or email
  phone?: string;
  email?: string;
  role: UserRole;
  requestedRole: UserRole;
  registrationAccountType?: RegistrationAccountType;
  address?: string;
  notes?: string;
  status: UserAccessStatus;
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  reviewedBy?: string;
  rejectionReason?: string;
}

export interface AppUser {
  id: string;
  role: UserRole;
  requestedRole?: UserRole;
  registrationAccountType?: RegistrationAccountType;
  identifier: string; // phone or email
  name: string; // User or Pharmacist full name
  pharmacyName: string; // Facility/Pharmacy or Warehouse Dept
  pharmacistName?: string;
  syndicateNumber?: string; // رقم نقابة الصيادلة
  profileCompleted?: boolean;
  phone?: string;
  email?: string;
  password?: string;
  address?: string;
  status: UserAccessStatus;
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  notes?: string;
  ipAddress?: string;
  passcodeVersion?: number;
  founder?: boolean;
  avatarUrl?: string;
  authProvider?: 'google' | 'phone_pin' | 'local' | 'form' | 'passcode';
  googleId?: string;
  requestId?: string;
  pharmacies?: UserPharmacyBranch[];
  activePharmacyId?: string;
}

// Product Batch tracking for FEFO (First Expired, First Out)
export interface ProductBatch {
  id: string;
  batchNumber: string;
  expiryDate: string; // YYYY-MM-DD or YYYY-MM
  quantity: number;
  receivedDate?: string;
  costPrice?: number;
  location?: string; // Shelf or aisle code e.g. "A-12"
}

// FEFO Visual Expiry Status Category
export type FEFOStatus = 'critical_90' | 'warning_180' | 'valid_normal';

export interface FEFOAnalysis {
  status: FEFOStatus;
  daysRemaining: number;
  badgeLabel: string;
  badgeClass: string;
}

export function calculateFEFOAnalysis(expiryDateStr?: string): FEFOAnalysis {
  if (!expiryDateStr) {
    return {
      status: 'valid_normal',
      daysRemaining: 999,
      badgeLabel: 'صالح',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
  }

  // Parse YYYY-MM or YYYY-MM-DD
  let targetDate = new Date(expiryDateStr);
  if (expiryDateStr.length === 7) {
    // YYYY-MM -> end of month
    const [y, m] = expiryDateStr.split('-').map(Number);
    targetDate = new Date(y, m, 0); // last day of that month
  }

  const now = new Date();
  const diffTime = targetDate.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (daysRemaining <= 90) {
    return {
      status: 'critical_90',
      daysRemaining,
      badgeLabel: daysRemaining < 0 ? 'منتهي الصلاحية' : `قريب النفاذ (${daysRemaining} يوم)`,
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 font-bold',
    };
  } else if (daysRemaining <= 180) {
    return {
      status: 'warning_180',
      daysRemaining,
      badgeLabel: `تنبيه نفاذ (${daysRemaining} يوم)`,
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200 font-medium',
    };
  } else {
    return {
      status: 'valid_normal',
      daysRemaining,
      badgeLabel: `صالح (${daysRemaining} يوم)`,
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
  }
}

// Immutable Stock Audit Log Record
export type AuditActionType = 'ENTRY' | 'DISPATCH' | 'ADJUSTMENT' | 'RETURN' | 'EXPIRY_DISCARD';

export type InventoryAdjustmentReason = 
  | 'DAMAGED' 
  | 'COUNT_ERROR' 
  | 'SUPPLIER_RETURN' 
  | 'THEFT_LOSS' 
  | 'SAMPLE_DONATION' 
  | 'FOUND_SURPLUS';

export interface StockAuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  itemId: string;
  itemNameAr: string;
  itemNameEn?: string;
  batchNo: string;
  actionType: AuditActionType;
  qtyBefore: number;
  qtyAfter: number;
  changeQty: number; // positive or negative
  notes: string;
  adjustmentReason?: InventoryAdjustmentReason;
  referenceId?: string; // Order Number, Delivery Note, etc.
}
