import React, { useState, useEffect, useRef } from 'react';
import { 
  Barcode as BarcodeIcon, 
  Sparkles, 
  Check, 
  X, 
  Printer, 
  Copy, 
  AlertCircle,
  RefreshCw 
} from 'lucide-react';
import { Product } from '../types';
import { generateUniqueBarcode, renderBarcodeToSvg, isValidBarcodeString } from '../services/barcodeService';

interface QuickBarcodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  allProducts: Product[];
  onSaveBarcode: (productId: string, newBarcode: string) => void;
  onOpenPrint: (product: Product) => void;
}

export const QuickBarcodeModal: React.FC<QuickBarcodeModalProps> = ({
  isOpen,
  onClose,
  product,
  allProducts,
  onSaveBarcode,
  onOpenPrint,
}) => {
  const [barcodeValue, setBarcodeValue] = useState('');
  const [copied, setCopied] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const previewSvgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (product) {
      setBarcodeValue(product.barcode || '');
      setValidationError(null);
    }
  }, [product]);

  // Render preview barcode
  useEffect(() => {
    if (barcodeValue && previewSvgRef.current) {
      renderBarcodeToSvg(previewSvgRef.current, barcodeValue, {
        height: 48,
        width: 1.6,
        fontSize: 12,
        margin: 4,
      });
    }
  }, [barcodeValue]);

  if (!isOpen || !product) return null;

  const handleGenerateNew = () => {
    const generated = generateUniqueBarcode(allProducts);
    setBarcodeValue(generated);
    setValidationError(null);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = barcodeValue.trim();
    if (!clean) {
      setValidationError('يرجى إدخال رمز الباركود أو الضغط على توليد باركود تلقائي');
      return;
    }
    if (!isValidBarcodeString(clean)) {
      setValidationError('رمز الباركود يجب أن يحتوي على 3 أحرف/أرقام على الأقل');
      return;
    }

    // Check collision with another product
    const duplicate = allProducts.find(
      (p) => p.id !== product.id && (p.barcode === clean || p.barcodeAliases?.includes(clean))
    );
    if (duplicate) {
      setValidationError(`هذا الباركود مسجل مسبقاً لمادة أخرى: (${duplicate.tradeNameAr})`);
      return;
    }

    onSaveBarcode(product.id, clean);
    onClose();
  };

  const handleCopy = () => {
    if (!barcodeValue) return;
    navigator.clipboard.writeText(barcodeValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white">
              <BarcodeIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold">إدارة وتوليد الباركود</h3>
              <p className="text-[11px] text-slate-300 truncate max-w-[240px]">{product.tradeNameAr}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="p-5 space-y-4 text-xs">
          {/* Product info banner */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
            <div className="font-bold text-slate-900 text-sm">{product.tradeNameAr}</div>
            <div className="text-slate-500 font-mono text-[11px]" dir="ltr">{product.tradeNameEn}</div>
            <div className="text-[11px] text-slate-600 flex items-center gap-2 pt-1 border-t border-slate-200">
              <span>رقم الوجبة: <strong className="font-mono">{product.batchNumber}</strong></span>
              <span>•</span>
              <span>الصلاحية: <strong className="font-mono">{product.expiryDate}</strong></span>
            </div>
          </div>

          {/* Barcode input & Generator Button */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-800">رمز الباركود الحالي / الجديد:</label>
              <button
                type="button"
                onClick={handleGenerateNew}
                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer border border-blue-200"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>توليد باركود تلقائي</span>
              </button>
            </div>

            <div className="relative flex items-center">
              <input
                type="text"
                value={barcodeValue}
                onChange={(e) => {
                  setBarcodeValue(e.target.value);
                  setValidationError(null);
                }}
                placeholder="أدخل رمز الباركود أو اضغط توليد..."
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono text-sm font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                dir="ltr"
              />
              {barcodeValue && (
                <button
                  type="button"
                  onClick={handleCopy}
                  className="absolute left-2 text-slate-400 hover:text-slate-600 p-1"
                  title="نسخ الباركود"
                >
                  <Copy className="w-4 h-4" />
                </button>
              )}
            </div>
            {copied && <p className="text-[11px] text-emerald-600 font-bold">تم نسخ الرمز إلى الحافظة بنجاح!</p>}
            {validationError && (
              <p className="text-[11px] text-rose-600 font-bold flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{validationError}</span>
              </p>
            )}
          </div>

          {/* Real-time Barcode Visual Preview */}
          <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 flex flex-col items-center justify-center min-h-[90px]">
            <div className="text-[10px] text-slate-500 font-bold mb-1">المعاينة المباشرة لخطوط الباركود:</div>
            {barcodeValue ? (
              <div className="bg-white p-2 rounded-lg shadow-2xs border border-slate-200 max-w-full overflow-hidden">
                <svg ref={previewSvgRef} className="max-w-full h-auto" />
              </div>
            ) : (
              <div className="text-slate-400 text-xs italic">أدخل رمزاً أو اضغط توليد لمعاينة الباركود</div>
            )}
          </div>

          {/* Action buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
            {product.barcode ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPrint(product);
                }}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4 text-slate-600" />
                <span>طباعة ملصق</span>
              </button>
            ) : (
              <div></div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl font-semibold transition cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>حفظ الباركود</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
