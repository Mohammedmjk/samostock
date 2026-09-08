import React, { useState, useEffect } from 'react';
import { Package, Check, X, ArrowUpRight, ArrowDownRight, AlertTriangle } from 'lucide-react';
import { Product } from '../types';

interface QuickQuantityModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onSaveQuantity: (productId: string, newQuantity: number) => void;
}

export const QuickQuantityModal: React.FC<QuickQuantityModalProps> = ({
  isOpen,
  onClose,
  product,
  onSaveQuantity,
}) => {
  const [quantity, setQuantity] = useState<number>(0);

  useEffect(() => {
    if (product) {
      setQuantity(product.stockQuantity);
    }
  }, [product]);

  if (!isOpen || !product) return null;

  const handleAdjust = (delta: number) => {
    setQuantity((prev) => Math.max(0, prev + delta));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveQuantity(product.id, Math.max(0, quantity));
    onClose();
  };

  const diff = quantity - product.stockQuantity;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center text-white">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold">تعديل كمية المخزون</h3>
              <p className="text-[11px] text-slate-300 truncate max-w-[200px]">{product.tradeNameAr}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="p-5 space-y-4 text-xs">
          {/* Current Stock Banner */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-slate-500 text-[11px] block">الرصيد المسجل حالياً:</span>
              <strong className="text-base text-slate-900 font-mono">{product.stockQuantity} علبة</strong>
            </div>
            <div className="text-left">
              <span className="text-slate-500 text-[11px] block">الحد الأدنى للتنبيه:</span>
              <span className="text-xs text-orange-700 font-bold">{product.minStockLevel || 10} علبة</span>
            </div>
          </div>

          {/* New Quantity Input */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-800 block text-xs">الكمية الجديدة بالمخزن:</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                required
                autoFocus
                value={quantity}
                onChange={(e) => setQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-center text-xl font-black text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
              />
              <span className="font-bold text-slate-500 text-sm shrink-0">علبة</span>
            </div>
          </div>

          {/* Quick adjustment buttons */}
          <div className="space-y-1.5">
            <span className="text-[11px] text-slate-500 font-bold block">تعديل سريع (إضافة / خصم):</span>
            <div className="grid grid-cols-4 gap-1.5">
              {[-10, -5, -1, 0, 1, 5, 10, 50].filter(d => d !== 0).map((delta) => (
                <button
                  key={delta}
                  type="button"
                  onClick={() => handleAdjust(delta)}
                  className={`py-1.5 px-2 rounded-lg font-bold text-xs transition border cursor-pointer ${
                    delta > 0
                      ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                      : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-200'
                  }`}
                >
                  {delta > 0 ? `+${delta}` : delta}
                </button>
              ))}
            </div>
          </div>

          {/* Difference notice */}
          {diff !== 0 && (
            <div className={`p-2.5 rounded-xl border flex items-center justify-between text-xs font-bold ${
              diff > 0
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}>
              <span>فارق التعديل:</span>
              <span className="font-mono" dir="ltr">
                {diff > 0 ? `+${diff}` : diff} علبة
              </span>
            </div>
          )}

          {/* Footer actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl font-semibold transition cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>تأكيد تعديل الكمية</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
