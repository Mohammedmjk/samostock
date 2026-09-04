import { StockAuditLog, AuditActionType, InventoryAdjustmentReason, AppUser } from '../types';
import { db } from './db';

const STORAGE_KEY_AUDIT_LOGS = 'samo_stock_audit_logs_v1';

export const auditService = {
  /**
   * Records an immutable audit log entry
   */
  async recordLog(entry: {
    user?: AppUser | null;
    itemId: string;
    itemNameAr: string;
    itemNameEn?: string;
    batchNo: string;
    actionType: AuditActionType;
    qtyBefore: number;
    qtyAfter: number;
    notes: string;
    adjustmentReason?: InventoryAdjustmentReason;
    referenceId?: string;
  }): Promise<StockAuditLog> {
    const changeQty = entry.qtyAfter - entry.qtyBefore;
    const log: StockAuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      userId: entry.user?.id || 'system',
      userName: entry.user?.name || 'النظام المركزي',
      userRole: entry.user?.role || 'warehouse_manager',
      itemId: entry.itemId,
      itemNameAr: entry.itemNameAr,
      itemNameEn: entry.itemNameEn,
      batchNo: entry.batchNo || 'N/A',
      actionType: entry.actionType,
      qtyBefore: entry.qtyBefore,
      qtyAfter: entry.qtyAfter,
      changeQty,
      notes: entry.notes || '',
      adjustmentReason: entry.adjustmentReason,
      referenceId: entry.referenceId,
    };

    // Save to IndexedDB
    try {
      await db.auditLogs.put(log);
    } catch (err) {
      console.warn('Could not save audit log to IndexedDB:', err);
    }

    // Save to localStorage as redundancy
    try {
      const existing = this.getLogsFromLocalStorage();
      existing.unshift(log);
      // Keep most recent 1000 logs in localStorage
      localStorage.setItem(STORAGE_KEY_AUDIT_LOGS, JSON.stringify(existing.slice(0, 1000)));
    } catch (err) {
      console.error('Error writing audit log to localStorage:', err);
    }

    return log;
  },

  getLogsFromLocalStorage(): StockAuditLog[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY_AUDIT_LOGS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  async getAllLogs(): Promise<StockAuditLog[]> {
    try {
      const dbLogs = await db.auditLogs.reverse().toArray();
      if (dbLogs && dbLogs.length > 0) {
        return dbLogs;
      }
    } catch (err) {
      console.warn('Could not read audit logs from IndexedDB, falling back:', err);
    }
    return this.getLogsFromLocalStorage();
  },

  async getLogsByProduct(productId: string): Promise<StockAuditLog[]> {
    const all = await this.getAllLogs();
    return all.filter(l => l.itemId === productId);
  },

  exportToCSV(logs: StockAuditLog[]): string {
    const headers = [
      'التاريخ والوقت',
      'نوع العملية',
      'المادة',
      'رقم الوجبة',
      'الكمية قبل',
      'الكمية بعد',
      'التغيير',
      'المستخدم المسؤول',
      'الصلاحية',
      'سبب التسوية / الملاحظات',
      'رقم المرجع'
    ];

    const rows = logs.map(l => [
      l.timestamp,
      l.actionType,
      `"${(l.itemNameAr || '').replace(/"/g, '""')}"`,
      `"${(l.batchNo || '').replace(/"/g, '""')}"`,
      l.qtyBefore,
      l.qtyAfter,
      l.changeQty > 0 ? `+${l.changeQty}` : l.changeQty,
      `"${(l.userName || '').replace(/"/g, '""')}"`,
      l.userRole,
      `"${(l.notes || l.adjustmentReason || '').replace(/"/g, '""')}"`,
      `"${(l.referenceId || '').replace(/"/g, '""')}"`
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
};
