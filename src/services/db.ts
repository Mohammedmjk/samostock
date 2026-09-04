import Dexie, { Table } from 'dexie';
import { Product, Order, StockAuditLog } from '../types';

export interface PendingOutboundEdit {
  id: string;
  type: 'PRODUCT_UPDATE' | 'ORDER_CREATE' | 'ORDER_UPDATE' | 'STOCK_ADJUSTMENT' | 'AUDIT_LOG';
  payload: any;
  timestamp: string;
  retries: number;
}

export class SamoStockDatabase extends Dexie {
  products!: Table<Product, string>;
  orders!: Table<Order, string>;
  auditLogs!: Table<StockAuditLog, string>;
  pendingEdits!: Table<PendingOutboundEdit, string>;

  constructor() {
    super('SamoStockDB');
    this.version(1).stores({
      products: 'id, barcode, tradeNameAr, tradeNameEn, category, batchNumber, expiryDate, stockQuantity',
      orders: 'id, orderNumber, status, createdAt, pharmacyName',
      auditLogs: 'id, timestamp, itemId, batchNo, actionType, userId',
      pendingEdits: 'id, type, timestamp',
    });
  }
}

export const db = new SamoStockDatabase();

/**
 * Cache products list into IndexedDB for lightning-fast offline browsing
 */
export async function cacheProductsOffline(products: Product[]): Promise<void> {
  try {
    await db.transaction('rw', db.products, async () => {
      await db.products.clear();
      await db.products.bulkPut(products);
    });
  } catch (err) {
    console.warn('Could not cache products to IndexedDB:', err);
  }
}

/**
 * Retrieve offline products from IndexedDB
 */
export async function getCachedProducts(): Promise<Product[]> {
  try {
    return await db.products.toArray();
  } catch (err) {
    console.warn('Could not read products from IndexedDB:', err);
    return [];
  }
}

/**
 * Cache orders into IndexedDB
 */
export async function cacheOrdersOffline(orders: Order[]): Promise<void> {
  try {
    await db.transaction('rw', db.orders, async () => {
      await db.orders.clear();
      await db.orders.bulkPut(orders);
    });
  } catch (err) {
    console.warn('Could not cache orders to IndexedDB:', err);
  }
}

/**
 * Retrieve offline orders
 */
export async function getCachedOrders(): Promise<Order[]> {
  try {
    return await db.orders.toArray();
  } catch (err) {
    console.warn('Could not read orders from IndexedDB:', err);
    return [];
  }
}

/**
 * Queue an outbound edit when offline
 */
export async function queueOutboundEdit(
  type: PendingOutboundEdit['type'],
  payload: any
): Promise<string> {
  const id = `edit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const item: PendingOutboundEdit = {
    id,
    type,
    payload,
    timestamp: new Date().toISOString(),
    retries: 0,
  };
  try {
    await db.pendingEdits.put(item);
  } catch (err) {
    console.warn('Could not queue outbound edit in IndexedDB:', err);
  }
  return id;
}

export async function getPendingEdits(): Promise<PendingOutboundEdit[]> {
  try {
    return await db.pendingEdits.toArray();
  } catch {
    return [];
  }
}

export async function removePendingEdit(id: string): Promise<void> {
  try {
    await db.pendingEdits.delete(id);
  } catch {}
}
