import { Product } from '../types';
import * as XLSX from 'xlsx';

export interface ExpiryAlertItem {
  product: Product;
  monthsRemaining: number;
  daysRemaining: number;
  status: 'expired' | 'critical' | 'near';
  statusLabel: string;
}

export interface StockAlertItem {
  product: Product;
  stockQuantity: number;
  minStockLevel: number;
  status: 'out_of_stock' | 'low_stock';
  statusLabel: string;
}

export interface InventoryAlertSummary {
  outOfStock: StockAlertItem[]; // stockQuantity === 0
  lowStock: StockAlertItem[]; // 0 < stockQuantity <= minStockLevel
  expired: ExpiryAlertItem[]; // expired
  criticalExpiry: ExpiryAlertItem[]; // <= 3 months
  nearExpiry: ExpiryAlertItem[]; // 3 < months <= 6
  totalStockAlerts: number;
  totalExpiryAlerts: number;
  totalAlerts: number;
}

/**
 * Parses expiry date string (YYYY-MM or YYYY-MM-DD) and calculates remaining duration
 */
export function calculateExpiryDetails(expiryDate: string, referenceDate = new Date()) {
  if (!expiryDate || typeof expiryDate !== 'string') {
    return {
      monthsRemaining: 999,
      daysRemaining: 9999,
      status: 'valid' as const,
      statusLabel: 'صالح',
    };
  }

  const clean = expiryDate.trim();
  const parts = clean.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1] || '1', 10);
  const day = parts[2] ? parseInt(parts[2], 10) : undefined;

  if (isNaN(year) || isNaN(month)) {
    return {
      monthsRemaining: 999,
      daysRemaining: 9999,
      status: 'valid' as const,
      statusLabel: 'صالح',
    };
  }

  // If day is not provided, pharmaceutical convention considers product valid until end of that month
  const targetDate = day
    ? new Date(year, month - 1, day, 23, 59, 59)
    : new Date(year, month, 0, 23, 59, 59);

  const diffMs = targetDate.getTime() - referenceDate.getTime();
  const daysRemaining = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Months difference calculation
  const monthsRemaining =
    (year - referenceDate.getFullYear()) * 12 + (month - 1 - referenceDate.getMonth());

  if (daysRemaining < 0) {
    return {
      monthsRemaining,
      daysRemaining,
      status: 'expired' as const,
      statusLabel: 'منتهي الصلاحية',
    };
  }

  if (monthsRemaining <= 3 || daysRemaining <= 90) {
    return {
      monthsRemaining,
      daysRemaining,
      status: 'critical' as const,
      statusLabel: 'قريب جداً (أقل من 3 أشهر)',
    };
  }

  if (monthsRemaining <= 6 || daysRemaining <= 180) {
    return {
      monthsRemaining,
      daysRemaining,
      status: 'near' as const,
      statusLabel: 'قريب الانتهاء (3 إلى 6 أشهر)',
    };
  }

  return {
    monthsRemaining,
    daysRemaining,
    status: 'valid' as const,
    statusLabel: 'صالح',
  };
}

/**
 * Calculates stock level urgency
 */
export function calculateStockDetails(product: Product) {
  const qty = typeof product.stockQuantity === 'number' ? product.stockQuantity : 0;
  const minLevel = typeof product.minStockLevel === 'number' ? product.minStockLevel : 10;

  if (qty <= 0) {
    return {
      status: 'out_of_stock' as const,
      statusLabel: 'نفذ من المخزن (0 علبة)',
    };
  }

  if (qty <= minLevel) {
    return {
      status: 'low_stock' as const,
      statusLabel: `مخزون حرج (متبقي ${qty} علبة - الحد الأدنى: ${minLevel})`,
    };
  }

  return {
    status: 'in_stock' as const,
    statusLabel: 'متوفر',
  };
}

/**
 * Scans all warehouse products and aggregates stock-out and near-expiry alerts
 */
export function computeInventoryAlerts(products: Product[]): InventoryAlertSummary {
  const outOfStock: StockAlertItem[] = [];
  const lowStock: StockAlertItem[] = [];
  const expired: ExpiryAlertItem[] = [];
  const criticalExpiry: ExpiryAlertItem[] = [];
  const nearExpiry: ExpiryAlertItem[] = [];

  const now = new Date();

  products.forEach((product) => {
    // 1. Stock check
    const stock = calculateStockDetails(product);
    if (stock.status === 'out_of_stock') {
      outOfStock.push({
        product,
        stockQuantity: product.stockQuantity || 0,
        minStockLevel: product.minStockLevel || 10,
        status: 'out_of_stock',
        statusLabel: stock.statusLabel,
      });
    } else if (stock.status === 'low_stock') {
      lowStock.push({
        product,
        stockQuantity: product.stockQuantity,
        minStockLevel: product.minStockLevel || 10,
        status: 'low_stock',
        statusLabel: stock.statusLabel,
      });
    }

    // 2. Expiry check
    const expiry = calculateExpiryDetails(product.expiryDate, now);
    if (expiry.status === 'expired') {
      expired.push({
        product,
        monthsRemaining: expiry.monthsRemaining,
        daysRemaining: expiry.daysRemaining,
        status: 'expired',
        statusLabel: expiry.statusLabel,
      });
    } else if (expiry.status === 'critical') {
      criticalExpiry.push({
        product,
        monthsRemaining: expiry.monthsRemaining,
        daysRemaining: expiry.daysRemaining,
        status: 'critical',
        statusLabel: expiry.statusLabel,
      });
    } else if (expiry.status === 'near') {
      nearExpiry.push({
        product,
        monthsRemaining: expiry.monthsRemaining,
        daysRemaining: expiry.daysRemaining,
        status: 'near',
        statusLabel: expiry.statusLabel,
      });
    }
  });

  const totalStockAlerts = outOfStock.length + lowStock.length;
  const totalExpiryAlerts = expired.length + criticalExpiry.length + nearExpiry.length;
  const totalAlerts = totalStockAlerts + totalExpiryAlerts;

  return {
    outOfStock,
    lowStock,
    expired,
    criticalExpiry,
    nearExpiry,
    totalStockAlerts,
    totalExpiryAlerts,
    totalAlerts,
  };
}

/**
 * Generates and downloads an Excel spreadsheet report of all stock-out and near-expiry alerts
 */
export function exportAlertsReportToExcel(alerts: InventoryAlertSummary, warehouseName = 'مذخر سامو') {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Stock alerts (Out of stock & Low stock)
  const stockHeaders = [
    'ت',
    'نوع التنبيه',
    'اسم الدواء التجاري',
    'الاسم العلمي / الإنجليزي',
    'الباركود',
    'رقم الوجبة Batch',
    'الكمية الحالية',
    'الحد الأدنى المطلوب',
    'سعر الجملة',
    'الشركة المصنعة',
  ];

  const stockRows: any[] = [];
  let sIdx = 1;

  alerts.outOfStock.forEach((item) => {
    stockRows.push([
      sIdx++,
      'نفذ بالكامل (0 علبة)',
      item.product.tradeNameAr,
      item.product.tradeNameEn || item.product.scientificName,
      item.product.barcode,
      item.product.batchNumber,
      0,
      item.product.minStockLevel || 10,
      item.product.wholesalePrice,
      item.product.manufacturer,
    ]);
  });

  alerts.lowStock.forEach((item) => {
    stockRows.push([
      sIdx++,
      'مخزون حرج (قريب النفاذ)',
      item.product.tradeNameAr,
      item.product.tradeNameEn || item.product.scientificName,
      item.product.barcode,
      item.product.batchNumber,
      item.product.stockQuantity,
      item.product.minStockLevel || 10,
      item.product.wholesalePrice,
      item.product.manufacturer,
    ]);
  });

  const wsStock = XLSX.utils.aoa_to_sheet([stockHeaders, ...stockRows]);
  wsStock['!cols'] = [
    { wch: 6 },
    { wch: 24 },
    { wch: 30 },
    { wch: 26 },
    { wch: 18 },
    { wch: 16 },
    { wch: 14 },
    { wch: 18 },
    { wch: 14 },
    { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsStock, 'تنبيهات_النفاذ_والمخزون');

  // Sheet 2: Expiry alerts (Expired, Critical < 3 months, Near < 6 months)
  const expHeaders = [
    'ت',
    'حالة الصلاحية',
    'اسم الدواء التجاري',
    'الاسم العلمي / الإنجليزي',
    'رقم الوجبة Batch',
    'تاريخ الصلاحية والاكسباير',
    'المدة المتبقية',
    'الكمية المتوفرة بالمخزن',
    'سعر الجملة',
    'الشركة المصنعة',
  ];

  const expRows: any[] = [];
  let eIdx = 1;

  alerts.expired.forEach((item) => {
    expRows.push([
      eIdx++,
      'منتهي الصلاحية',
      item.product.tradeNameAr,
      item.product.tradeNameEn || item.product.scientificName,
      item.product.batchNumber,
      item.product.expiryDate,
      `منتهي منذ ${Math.abs(item.daysRemaining)} يوم`,
      item.product.stockQuantity,
      item.product.wholesalePrice,
      item.product.manufacturer,
    ]);
  });

  alerts.criticalExpiry.forEach((item) => {
    expRows.push([
      eIdx++,
      'قريب جداً (أقل من 3 أشهر)',
      item.product.tradeNameAr,
      item.product.tradeNameEn || item.product.scientificName,
      item.product.batchNumber,
      item.product.expiryDate,
      `متبقي قرابة ${item.daysRemaining} يوم (~${Math.max(1, item.monthsRemaining)} شهر)`,
      item.product.stockQuantity,
      item.product.wholesalePrice,
      item.product.manufacturer,
    ]);
  });

  alerts.nearExpiry.forEach((item) => {
    expRows.push([
      eIdx++,
      'قريب الانتهاء (3 إلى 6 أشهر)',
      item.product.tradeNameAr,
      item.product.tradeNameEn || item.product.scientificName,
      item.product.batchNumber,
      item.product.expiryDate,
      `متبقي قرابة ${item.daysRemaining} يوم (~${item.monthsRemaining} أشهر)`,
      item.product.stockQuantity,
      item.product.wholesalePrice,
      item.product.manufacturer,
    ]);
  });

  const wsExp = XLSX.utils.aoa_to_sheet([expHeaders, ...expRows]);
  wsExp['!cols'] = [
    { wch: 6 },
    { wch: 26 },
    { wch: 30 },
    { wch: 26 },
    { wch: 16 },
    { wch: 22 },
    { wch: 24 },
    { wch: 20 },
    { wch: 14 },
    { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsExp, 'تنبيهات_قريبة_الصلاحية');

  const todayStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `تقرير_إشعارات_النفاذ_وقريبة_الصلاحية_${warehouseName}_${todayStr}.xlsx`);
}
