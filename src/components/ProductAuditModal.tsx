import React, { useEffect, useState } from 'react';
import { Product, StockAuditLog } from '../types';
import { auditService } from '../services/auditService';
import { X, History, ArrowDownRight, ArrowUpRight, RefreshCw, FileSpreadsheet, ShieldCheck, Filter } from 'lucide-react';

interface ProductAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product;
}

export const ProductAuditModal: React.FC<ProductAuditModalProps> = ({
  isOpen,
  onClose,
  product,
}) => {
  const [logs, setLogs] = useState<StockAuditLog[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [filterAction, setFilterAction] = useState<string>('ALL');

  useEffect(() => {
    if (!isOpen) return;

    const loadLogs = async () => {
      setIsLoading(true);
      try {
        const history = await auditService.getLogsByProduct(product.id);
        setLogs(history);
      } catch (err) {
        console.error('Error loading product audit history:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadLogs();
  }, [isOpen, product.id]);

  if (!isOpen) return null;

  const filteredLogs = logs.filter(l => filterAction === 'ALL' || l.actionType === filterAction);

  const getActionBadge = (type: string) => {
    switch (type) {
      case 'ENTRY':
        return <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2 py-0.5 rounded-md">إدخال مخزني</span>;
      case 'DISPATCH':
        return <span className="bg-blue-100 text-blue-800 text-[11px] font-bold px-2 py-0.5 rounded-md">صرف وتجهيز</span>;
      case 'ADJUSTMENT':
        return <span className="bg-amber-100 text-amber-800 text-[11px] font-bold px-2 py-0.5 rounded-md">تسوية جردية</span>;
      case 'RETURN':
        return <span className="bg-purple-100 text-purple-800 text-[11px] font-bold px-2 py-0.5 rounded-md">إرجاع</span>;
      case 'EXPIRY_DISCARD':
        return <span className="bg-rose-100 text-rose-800 text-[11px] font-bold px-2 py-0.5 rounded-md">إتلاف منتهي</span>;
      default:
        return <span className="bg-slate-100 text-slate-800 text-[11px] font-bold px-2 py-0.5 rounded-md">{type}</span>;
    }
  };

  const handleExportCSV = () => {
    const csv = auditService.exportToCSV(filteredLogs);
    const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Audit_Log_${product.barcode}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-6 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base">سجل التدقيق والحركات المخزنية (Audit Trail)</h3>
                <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  غير قابل للتعديل
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {product.tradeNameAr} | باركود: <span dir="ltr" className="font-mono">{product.barcode}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={filteredLogs.length === 0}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40"
              title="تصدير السجل إلى ملف Excel/CSV"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">تصدير CSV</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0 text-xs">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-bold text-slate-600">تصفية حسب نوع الحركة:</span>
            <select
              value={filterAction}
              onChange={e => setFilterAction(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-700 font-medium focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">جميع العمليات ({logs.length})</option>
              <option value="ENTRY">إدخال بضاعة</option>
              <option value="DISPATCH">صرف وتجهيز</option>
              <option value="ADJUSTMENT">تسوية جردية</option>
              <option value="RETURN">إرجاع</option>
            </select>
          </div>

          <span className="text-slate-500 font-medium">
            الرصيد الكلي الحالي: <strong className="text-slate-800 font-mono font-bold text-sm">{product.stockQuantity}</strong> عبوة
          </span>
        </div>

        {/* Content Table / List */}
        <div className="p-6 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
              <span>جاري استرجاع قيود التدقيق...</span>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-3">
              <History className="w-12 h-12 text-slate-300 stroke-[1.5]" />
              <p className="font-medium text-slate-600">لا توجد حركات مخزنية مسجلة لهذه المادة بعد.</p>
              <p className="text-xs text-slate-400">يتم توثيق كل عملية إدخال، صرف، أو تسوية تلقائياً.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredLogs.map(log => (
                <div
                  key={log.id}
                  className="bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-4 transition shadow-2xs space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      {getActionBadge(log.actionType)}
                      <span className="text-xs text-slate-400 font-mono" dir="ltr">
                        {new Date(log.timestamp).toLocaleString('ar-IQ')}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-xs text-slate-500">قبل: {log.qtyBefore}</span>
                      <span className="text-slate-300">→</span>
                      <span className="text-xs text-slate-500">بعد: {log.qtyAfter}</span>
                      <span
                        dir="ltr"
                        className={`text-xs font-black px-2 py-0.5 rounded-md ${
                          log.changeQty > 0
                            ? 'bg-emerald-50 text-emerald-700'
                            : log.changeQty < 0
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {log.changeQty > 0 ? `+${log.changeQty}` : log.changeQty}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <div>
                      <span className="text-slate-400 ml-1">التشغيلة:</span>
                      <span dir="ltr" className="font-mono font-bold text-slate-800">{log.batchNo}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 ml-1">المسؤول:</span>
                      <span className="font-semibold text-slate-800">{log.userName}</span>
                      <span className="text-[10px] text-slate-400 font-mono mr-1">({log.userRole})</span>
                    </div>
                  </div>

                  {log.notes && (
                    <p className="text-xs text-slate-600 pr-1 border-r-2 border-slate-300">
                      {log.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 text-center text-xs text-slate-500 shrink-0">
          سجل الحركات محمي بنظام التحقق الداخلي لضمان مطابقة معايير الرقابة الدوائية GxP
        </div>
      </div>
    </div>
  );
};
