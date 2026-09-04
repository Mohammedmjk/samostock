import React, { useState } from 'react';
import { Product, ProductBatch, InventoryAdjustmentReason, AppUser } from '../types';
import { adjustSpecificBatch } from '../services/batchService';
import { auditService } from '../services/auditService';
import { X, AlertTriangle, CheckCircle2, ShieldAlert, Scale, ClipboardEdit } from 'lucide-react';

interface InventoryAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product;
  currentUser: AppUser | null;
  onProductUpdated: (updatedProduct: Product) => void;
}

const ADJUSTMENT_REASONS: { key: InventoryAdjustmentReason; label: string; icon: string; description: string }[] = [
  { key: 'COUNT_ERROR', label: 'خطأ عد في الجرد الدوري', icon: '📝', description: 'تصحيح الفارق بين الرصيد الدفتري والفعلي' },
  { key: 'DAMAGED', label: 'تلف / كسر / انتهاء صلاحية', icon: '⚠️', description: 'إتلاف عبوات تالفة أو غير صالحة للاستخدام' },
  { key: 'SUPPLIER_RETURN', label: 'إرجاع للشركة الموردة', icon: '📦', description: 'إرجاع تشغيلة أو كميات للشركة المصنعة' },
  { key: 'THEFT_LOSS', label: 'عجز أو فقدان غير مبرر', icon: '🚨', description: 'تسجيل نقص غير مطابق يستوجب المتابعة' },
  { key: 'FOUND_SURPLUS', label: 'فائض جرد تم العثور عليه', icon: '➕', description: 'إضافة كميات فعلية إضافية عثر عليها بالرف' },
  { key: 'SAMPLE_DONATION', label: 'عينات طبية وترويجية', icon: '🧪', description: 'صرف عينات للمندوبين أو الأطباء' },
];

export const InventoryAdjustmentModal: React.FC<InventoryAdjustmentModalProps> = ({
  isOpen,
  onClose,
  product,
  currentUser,
  onProductUpdated,
}) => {
  const batches: ProductBatch[] = product.batches && product.batches.length > 0
    ? product.batches
    : [{ id: 'b-default', batchNumber: product.batchNumber || 'LOT-DEFAULT', expiryDate: product.expiryDate || '2027-12-31', quantity: product.stockQuantity }];

  const [selectedBatchNo, setSelectedBatchNo] = useState<string>(batches[0].batchNumber);
  const currentBatch = batches.find(b => b.batchNumber === selectedBatchNo) || batches[0];
  const [newCount, setNewCount] = useState<number>(currentBatch.quantity);
  const [reason, setReason] = useState<InventoryAdjustmentReason>('COUNT_ERROR');
  const [notes, setNotes] = useState<string>('');
  const [confirmedByAdmin, setConfirmedByAdmin] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen) return null;

  const currentQty = currentBatch.quantity;
  const difference = newCount - currentQty;

  const handleBatchChange = (bNo: string) => {
    setSelectedBatchNo(bNo);
    const b = batches.find(x => x.batchNumber === bNo);
    if (b) {
      setNewCount(b.quantity);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (newCount < 0) {
      setErrorMsg('لا يمكن تعيين رصيد سالب للتشغيلة. الرصيد الأدنى هو 0.');
      return;
    }

    if (difference === 0) {
      setErrorMsg('الرصيد المدخل مطابق للرصيد الحالي، لم يتم إجراء أي تعديل.');
      return;
    }

    if (!notes.trim() || notes.trim().length < 5) {
      setErrorMsg('يرجى كتابة سبب التسوية بالتفصيل (5 أحرف على الأقل) لتوثيقها في سجل التدقيق غير القابل للتعديل.');
      return;
    }

    if (!confirmedByAdmin) {
      setErrorMsg('يجب التأكيد والإقرار بصحة بيانات التسوية الجردية للمتابعة.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Perform batch adjustment strictly
      const result = adjustSpecificBatch(product, selectedBatchNo, newCount);

      // 2. Record immutable audit log
      await auditService.recordLog({
        user: currentUser,
        itemId: product.id,
        itemNameAr: product.tradeNameAr,
        itemNameEn: product.tradeNameEn,
        batchNo: selectedBatchNo,
        actionType: 'ADJUSTMENT',
        qtyBefore: result.qtyBefore,
        qtyAfter: result.qtyAfter,
        notes: `[تسوية جردية: ${ADJUSTMENT_REASONS.find(r => r.key === reason)?.label}] - ${notes.trim()}`,
        adjustmentReason: reason,
        referenceId: `ADJ-${Date.now().toString().slice(-6)}`,
      });

      onProductUpdated(result.updatedProduct);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'حدث خطأ أثناء حفظ التسوية الجردية');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-6">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">تسوية مخزنية جردية معتمدة</h3>
              <p className="text-xs text-slate-400">توثيق مباشر غير قابل للتعديل في سجل الرقابة</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-5">
          {/* Product Summary */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-500">المادة الدوائية:</span>
              <span dir="ltr" className="font-mono text-xs text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                {product.barcode}
              </span>
            </div>
            <h4 className="font-bold text-slate-900 text-base">{product.tradeNameAr}</h4>
            <p className="text-xs text-slate-500">{product.dosageForm} {product.strength} - {product.manufacturer}</p>
          </div>

          {/* Batch Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              اختر رقم الوجبة / التشغيلة (Batch LOT) المراد تسويتها:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {batches.map(b => (
                <button
                  key={b.batchNumber}
                  type="button"
                  onClick={() => handleBatchChange(b.batchNumber)}
                  className={`p-3 rounded-xl border text-right transition cursor-pointer flex flex-col justify-between ${
                    selectedBatchNo === b.batchNumber
                      ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span dir="ltr" className="font-mono font-bold text-xs text-slate-800">{b.batchNumber}</span>
                    <span className="text-[11px] font-bold text-blue-700">{b.quantity} عبوة</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                    <span>الصلاحية:</span>
                    <span dir="ltr" className="font-mono">{b.expiryDate}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Quantity Adjustment Comparison */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 grid grid-cols-3 gap-3 text-center">
            <div>
              <span className="text-[11px] text-slate-500 block mb-1">الرصيد الدفتري الحالي</span>
              <span className="text-lg font-extrabold text-slate-800 font-mono">{currentQty}</span>
            </div>

            <div className="border-x border-slate-200 px-2">
              <span className="text-[11px] font-bold text-blue-700 block mb-1">الرصيد الفعلي بعد العد</span>
              <input
                type="number"
                min="0"
                value={newCount}
                onChange={e => setNewCount(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full text-center text-xl font-black text-blue-600 bg-white border border-blue-300 rounded-xl py-1 focus:ring-2 focus:ring-blue-500 focus:outline-hidden font-mono"
              />
            </div>

            <div>
              <span className="text-[11px] text-slate-500 block mb-1">الفارق الجردي (Delta)</span>
              <span
                dir="ltr"
                className={`text-lg font-black font-mono block ${
                  difference > 0 ? 'text-emerald-600' : difference < 0 ? 'text-rose-600' : 'text-slate-500'
                }`}
              >
                {difference > 0 ? `+${difference}` : difference}
              </span>
            </div>
          </div>

          {/* Reason Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              سبب التسوية الجردية (إلزامي للرقابة):
            </label>
            <select
              value={reason}
              onChange={e => setReason(e.target.value as InventoryAdjustmentReason)}
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            >
              {ADJUSTMENT_REASONS.map(r => (
                <option key={r.key} value={r.key}>
                  {r.icon} {r.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              {ADJUSTMENT_REASONS.find(r => r.key === reason)?.description}
            </p>
          </div>

          {/* Mandatory Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              ملاحظات وتفاصيل الجرد / رقم محضر الإتلاف أو الفحص:
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="اكتب توضيحاً دقيقاً لسبب تعديل الرصيد، واسم الفريق أو المفتش المسؤول..."
              className="w-full bg-white border border-slate-300 rounded-xl p-3 text-sm text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              required
            />
          </div>

          {/* Confirmation Checkbox */}
          <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-2xl flex items-start gap-3">
            <input
              type="checkbox"
              id="confirm-adj"
              checked={confirmedByAdmin}
              onChange={e => setConfirmedByAdmin(e.target.checked)}
              className="mt-1 w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="confirm-adj" className="text-xs text-amber-900 cursor-pointer font-medium leading-relaxed">
              أقر بصفتي مسؤولاً عن النظام بأن هذا الجرد تم فعلياً في المستودع، وأدرك أن هذه العملية ستسجل في سجل التدقيق باسمي مع التاريخ والتوقيت بصورة قطعية.
            </label>
          </div>

          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-xs font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-100 transition cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting || difference === 0 || !confirmedByAdmin}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-md shadow-blue-600/20 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'جاري التوثيق...' : 'اعتماد وحفظ التسوية'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
