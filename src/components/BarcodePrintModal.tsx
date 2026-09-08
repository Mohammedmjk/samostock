import React, { useState, useEffect, useRef } from 'react';
import { 
  Printer, 
  X, 
  Settings2, 
  Check, 
  Layers, 
  Copy, 
  Maximize2, 
  Eye, 
  HelpCircle,
  Sparkles,
  FileText
} from 'lucide-react';
import { Product, WarehouseSettings } from '../types';
import { renderBarcodeToSvg } from '../services/barcodeService';

export interface BarcodePrintItem {
  product: Product;
  copies: number;
}

interface BarcodePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  productsToPrint: BarcodePrintItem[];
  settings: WarehouseSettings;
}

type LabelSizePreset = '50x25' | '40x30' | '60x40' | '38x25' | 'a4';

export const BarcodePrintModal: React.FC<BarcodePrintModalProps> = ({
  isOpen,
  onClose,
  productsToPrint,
  settings,
}) => {
  const [labelSize, setLabelSize] = useState<LabelSizePreset>('50x25');
  const [showWarehouseName, setShowWarehouseName] = useState(true);
  const [showTradeAr, setShowTradeAr] = useState(true);
  const [showTradeEn, setShowTradeEn] = useState(true);
  const [showScientific, setShowScientific] = useState(false);
  const [showBatch, setShowBatch] = useState(true);
  const [showExpiry, setShowExpiry] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [customCopies, setCustomCopies] = useState<Record<string, number>>({});
  const [isCopied, setIsCopied] = useState(false);

  // References for live preview SVGs
  const previewSvgRef = useRef<SVGSVGElement | null>(null);

  // Get first product for preview
  const previewItem = productsToPrint[0];

  // Initialize copies map
  useEffect(() => {
    const initialCopies: Record<string, number> = {};
    productsToPrint.forEach((item) => {
      initialCopies[item.product.id] = item.copies || 1;
    });
    setCustomCopies(initialCopies);
  }, [productsToPrint]);

  // Render preview barcode
  useEffect(() => {
    if (previewItem && previewItem.product.barcode && previewSvgRef.current) {
      renderBarcodeToSvg(previewSvgRef.current, previewItem.product.barcode, {
        height: labelSize === '38x25' ? 28 : labelSize === '50x25' ? 34 : 44,
        width: labelSize === '38x25' ? 1.2 : 1.4,
        fontSize: 10,
        margin: 1,
      });
    }
  }, [previewItem, labelSize]);

  if (!isOpen || productsToPrint.length === 0) return null;

  const totalLabelsCount = productsToPrint.reduce((acc, item) => {
    return acc + (customCopies[item.product.id] ?? item.copies ?? 1);
  }, 0);

  const handlePrint = () => {
    window.print();
  };

  const handleSetStockCopies = (productId: string, stock: number) => {
    setCustomCopies((prev) => ({
      ...prev,
      [productId]: Math.max(1, stock),
    }));
  };

  const handleCopyBarcode = (code: string) => {
    navigator.clipboard.writeText(code);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Dimensions in mm
  const getDimensions = () => {
    switch (labelSize) {
      case '38x25':
        return { width: '38mm', height: '25mm', class: 'w-[144px] h-[95px]' };
      case '40x30':
        return { width: '40mm', height: '30mm', class: 'w-[152px] h-[114px]' };
      case '60x40':
        return { width: '60mm', height: '40mm', class: 'w-[228px] h-[152px]' };
      case 'a4':
        return { width: '70mm', height: '35mm', class: 'w-[264px] h-[132px]' };
      case '50x25':
      default:
        return { width: '50mm', height: '25mm', class: 'w-[190px] h-[95px]' };
    }
  };

  const currentDim = getDimensions();

  return (
    <>
      {/* Print-specific style tag injected for device printers */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #barcode-print-container, #barcode-print-container * {
            visibility: visible !important;
          }
          #barcode-print-container {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
          }
          .barcode-label-item {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: always !important;
            margin: 0 auto !important;
            box-shadow: none !important;
            border: 1px dashed #ccc !important;
          }
          @page {
            size: ${labelSize === 'a4' ? 'A4' : `${currentDim.width} ${currentDim.height}`};
            margin: 0;
          }
        }
      `}</style>

      {/* Screen Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-5 backdrop-blur-xs overflow-y-auto no-print">
        <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[92vh]">
          {/* Header */}
          <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs">
                <Printer className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold flex items-center gap-2">
                  <span>طباعة ملصقات الباركود</span>
                  <span className="text-xs bg-blue-500/30 text-blue-300 px-2 py-0.5 rounded-full font-mono font-normal">
                    {totalLabelsCount} ملصق
                  </span>
                </h3>
                <p className="text-xs text-slate-300">
                  متوافق مع طابعات الملصقات الحرارية المعرفة بالجهاز (Zebra / Xprinter / TSC / Bixolon) والطابعات العادية
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5 text-slate-800 text-xs">
            {/* Top row: Settings & Live Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left Column (Settings): 7 cols */}
              <div className="lg:col-span-7 space-y-4">
                {/* Preset size selection */}
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                      <Settings2 className="w-4 h-4 text-blue-600" />
                      <span>مقاس ملصق الباركود (ورق الطابعة):</span>
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {currentDim.width} × {currentDim.height}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { id: '50x25', label: '50 × 25 مم (قياسي حراري)', desc: 'الأكثر شيوعاً للمستودعات' },
                      { id: '40x30', label: '40 × 30 مم (مربع حراري)', desc: 'ملصق صيدلاني متوسط' },
                      { id: '60x40', label: '60 × 40 مم (كبير مفصل)', desc: 'يتسع للتركيب العلمي' },
                      { id: '38x25', label: '38 × 25 مم (صغير)', desc: 'للعلب الصغيرة والأمبولات' },
                      { id: 'a4', label: 'ورق A4 متعدد', desc: 'طابعات ليزر مكتبية' },
                    ].map((sz) => (
                      <button
                        key={sz.id}
                        type="button"
                        onClick={() => setLabelSize(sz.id as LabelSizePreset)}
                        className={`p-2 rounded-xl text-right transition border cursor-pointer ${
                          labelSize === sz.id
                            ? 'bg-blue-50 border-blue-500 text-blue-900 shadow-2xs'
                            : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <div className="font-bold text-xs">{sz.label}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{sz.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Display options checkboxes */}
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                  <span className="font-bold text-slate-800 text-xs block mb-1">
                    البيانات المعروضة على ملصق الباركود:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showWarehouseName}
                        onChange={(e) => setShowWarehouseName(e.target.checked)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span>اسم المذخر ({settings.name})</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showTradeAr}
                        onChange={(e) => setShowTradeAr(e.target.checked)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span>الاسم التجاري (عربي)</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showTradeEn}
                        onChange={(e) => setShowTradeEn(e.target.checked)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span>الاسم الإنجليزي</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showBatch}
                        onChange={(e) => setShowBatch(e.target.checked)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span>رقم الوجبة (Batch)</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showExpiry}
                        onChange={(e) => setShowExpiry(e.target.checked)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span>تاريخ الصلاحية (EXP)</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showPrice}
                        onChange={(e) => setShowPrice(e.target.checked)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span>سعر الجملة للصيدلية</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showScientific}
                        onChange={(e) => setShowScientific(e.target.checked)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span>الاسم والتركيب العلمي</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Right Column (Live Label Preview): 5 cols */}
              <div className="lg:col-span-5 flex flex-col items-center justify-center p-4 bg-slate-100 rounded-2xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 mb-2 flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5 text-blue-600" />
                  <span>معاينة حية للملصق الفعلي (طابعة حرارية)</span>
                </div>

                {/* The visual sticker label */}
                {previewItem && (
                  <div
                    className={`bg-white rounded-lg p-2.5 shadow-md border border-slate-300 flex flex-col justify-between items-center text-center overflow-hidden transition-all select-none ${
                      labelSize === '60x40' ? 'w-[240px] min-h-[160px]' : 'w-[220px] min-h-[125px]'
                    }`}
                  >
                    {/* Header: Warehouse & Price */}
                    <div className="w-full flex items-center justify-between border-b border-dashed border-slate-200 pb-1 text-[10px]">
                      {showWarehouseName ? (
                        <span className="font-bold text-slate-800 truncate">{settings.name}</span>
                      ) : (
                        <span></span>
                      )}
                      {showPrice && (
                        <span className="font-black text-slate-900 font-mono">
                          {(previewItem.product?.wholesalePrice ?? 0).toLocaleString()} {settings.currency}
                        </span>
                      )}
                    </div>

                    {/* Names */}
                    <div className="my-1 w-full">
                      {showTradeAr && (
                        <div className="font-bold text-slate-900 text-xs truncate">
                          {previewItem.product.tradeNameAr}
                        </div>
                      )}
                      {showTradeEn && (
                        <div className="text-[10px] text-slate-600 font-mono truncate" dir="ltr">
                          {previewItem.product.tradeNameEn}
                        </div>
                      )}
                      {showScientific && (
                        <div className="text-[9px] text-blue-700 font-mono truncate" dir="ltr">
                          {previewItem.product.scientificName}
                        </div>
                      )}
                    </div>

                    {/* Barcode Graphic */}
                    <div className="w-full flex flex-col items-center justify-center py-0.5">
                      <svg ref={previewSvgRef} className="max-w-full h-auto" />
                    </div>

                    {/* Footer: Batch & Expiry */}
                    <div className="w-full flex items-center justify-between pt-1 border-t border-dashed border-slate-200 text-[9px] font-mono">
                      {showBatch && (
                        <span className="text-slate-700">
                          LOT: <strong className="font-bold">{previewItem.product.batchNumber}</strong>
                        </span>
                      )}
                      {showExpiry && (
                        <span className="text-slate-900 font-bold">
                          EXP: {previewItem.product.expiryDate}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-3 flex items-center gap-2">
                  {previewItem && (
                    <button
                      type="button"
                      onClick={() => handleCopyBarcode(previewItem.product.barcode)}
                      className="px-2.5 py-1 bg-white hover:bg-slate-200 border border-slate-300 rounded-lg text-[11px] font-medium transition flex items-center gap-1 text-slate-700"
                    >
                      <Copy className="w-3 h-3 text-slate-500" />
                      <span>{isCopied ? 'تم نسخ رمز الباركود!' : 'نسخ رقم الباركود'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* List of items to print & quantity per product */}
            <div className="space-y-2 pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-blue-600" />
                  <span>قائمة المواد وعدد النسخ المطلوب طباعتها ({productsToPrint.length} صنف):</span>
                </span>
                <span className="text-xs text-slate-500">
                  إجمالي الملصقات: <strong className="text-blue-700 font-mono font-bold text-sm">{totalLabelsCount}</strong>
                </span>
              </div>

              <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl bg-slate-50/50">
                {productsToPrint.map(({ product }) => {
                  const copies = customCopies[product.id] ?? 1;
                  return (
                    <div key={product.id} className="p-2.5 flex items-center justify-between gap-3 bg-white hover:bg-slate-50 transition text-xs">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-900 truncate">{product.tradeNameAr}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2">
                          <span className="font-mono">{product.tradeNameEn}</span>
                          <span>•</span>
                          <span className="font-mono text-blue-700 font-semibold">{product.barcode || 'بدون باركود'}</span>
                          <span>•</span>
                          <span>الرصيد: {product.stockQuantity} علبة</span>
                        </div>
                      </div>

                      {/* Number of copies input & quick buttons */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleSetStockCopies(product.id, product.stockQuantity)}
                          className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-[10px] font-bold transition"
                          title="طباعة ملصق لكل علبة متوفرة بالمخزن"
                        >
                          مطابقة المخزون ({product.stockQuantity})
                        </button>

                        <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden bg-white">
                          <button
                            type="button"
                            onClick={() =>
                              setCustomCopies((prev) => ({
                                ...prev,
                                [product.id]: Math.max(1, (prev[product.id] || 1) - 1),
                              }))
                            }
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            max="5000"
                            value={copies}
                            onChange={(e) =>
                              setCustomCopies((prev) => ({
                                ...prev,
                                [product.id]: Math.max(1, parseInt(e.target.value) || 1),
                              }))
                            }
                            className="w-12 py-1 text-center font-bold text-slate-800 text-xs focus:outline-hidden"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setCustomCopies((prev) => ({
                                ...prev,
                                [product.id]: (prev[product.id] || 1) + 1,
                              }))
                            }
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
                          >
                            +
                          </button>
                        </div>
                        <span className="text-[11px] text-slate-500">ملصق</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Note about system printers */}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 flex items-start gap-2 leading-relaxed">
              <HelpCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <strong>كيف تتم الطباعة على الطابعة المعرفة بالجهاز؟</strong>
                <p className="mt-0.5 text-amber-800">
                  عند الضغط على الزر أدناه، ستفتح نافذة طباعة جهازك الرسمية. يمكنك اختيار أي طابعة ملصقات حرارية معرفة بنظام التشغيل لديك (مثل Xprinter، Zebra، TSC، Bixolon، إلخ) أو طابعة مكتبية عادية، وسيتم تنسيق الملصق بأعلى دقة تلقائياً دون أي حواف غير مرغوبة.
                </p>
              </div>
            </div>
          </div>

          {/* Footer Controls */}
          <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl font-semibold transition cursor-pointer text-xs"
            >
              إغلاق
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md hover:shadow-lg transition cursor-pointer flex items-center gap-2 text-xs sm:text-sm active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة {totalLabelsCount} ملصق الآن عبر الطابعة المعرفة</span>
            </button>
          </div>
        </div>
      </div>

      {/* Hidden Print Container specifically targeted by CSS @media print */}
      <div id="barcode-print-container" className="hidden print:block">
        {productsToPrint.flatMap(({ product }) => {
          const count = customCopies[product.id] ?? 1;
          return Array.from({ length: count }).map((_, index) => (
            <PrintLabelItem
              key={`${product.id}-${index}`}
              product={product}
              settings={settings}
              labelSize={labelSize}
              showWarehouseName={showWarehouseName}
              showTradeAr={showTradeAr}
              showTradeEn={showTradeEn}
              showScientific={showScientific}
              showBatch={showBatch}
              showExpiry={showExpiry}
              showPrice={showPrice}
            />
          ));
        })}
      </div>
    </>
  );
};

// Isolated Label Element for Print Container
interface PrintLabelItemProps {
  product: Product;
  settings: WarehouseSettings;
  labelSize: LabelSizePreset;
  showWarehouseName: boolean;
  showTradeAr: boolean;
  showTradeEn: boolean;
  showScientific: boolean;
  showBatch: boolean;
  showExpiry: boolean;
  showPrice: boolean;
}

const PrintLabelItem: React.FC<PrintLabelItemProps> = ({
  product,
  settings,
  labelSize,
  showWarehouseName,
  showTradeAr,
  showTradeEn,
  showScientific,
  showBatch,
  showExpiry,
  showPrice,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (svgRef.current && product.barcode) {
      renderBarcodeToSvg(svgRef.current, product.barcode, {
        height: labelSize === '38x25' ? 24 : labelSize === '50x25' ? 30 : 38,
        width: labelSize === '38x25' ? 1.1 : 1.3,
        fontSize: 9,
        margin: 1,
      });
    }
  }, [product.barcode, labelSize]);

  // Size styling in print
  const getStyle = () => {
    switch (labelSize) {
      case '38x25':
        return { width: '38mm', height: '25mm', padding: '1mm' };
      case '40x30':
        return { width: '40mm', height: '30mm', padding: '1.5mm' };
      case '60x40':
        return { width: '60mm', height: '40mm', padding: '2mm' };
      case 'a4':
        return { width: '70mm', height: '35mm', padding: '2mm' };
      case '50x25':
      default:
        return { width: '50mm', height: '25mm', padding: '1.5mm' };
    }
  };

  return (
    <div
      className="barcode-label-item bg-white flex flex-col justify-between items-center text-center overflow-hidden box-border font-sans"
      style={getStyle()}
    >
      {/* Top row */}
      <div className="w-full flex items-center justify-between text-[8px] font-bold border-b border-black pb-0.5 leading-none">
        {showWarehouseName ? (
          <span className="truncate">{settings.name}</span>
        ) : (
          <span></span>
        )}
        {showPrice && (
          <span className="font-mono">
            {(product?.wholesalePrice ?? 0).toLocaleString()} {settings.currency}
          </span>
        )}
      </div>

      {/* Names */}
      <div className="w-full my-0.5 leading-tight">
        {showTradeAr && (
          <div className="font-black text-[9px] truncate text-black">{product.tradeNameAr}</div>
        )}
        {showTradeEn && (
          <div className="text-[7.5px] font-mono text-black truncate" dir="ltr">
            {product.tradeNameEn}
          </div>
        )}
        {showScientific && (
          <div className="text-[7px] font-mono text-black truncate" dir="ltr">
            {product.scientificName}
          </div>
        )}
      </div>

      {/* Barcode SVG */}
      <div className="w-full flex flex-col items-center justify-center my-0.5">
        <svg ref={svgRef} className="max-w-full h-auto" />
      </div>

      {/* Bottom row: Batch & Expiry */}
      <div className="w-full flex items-center justify-between text-[7.5px] font-mono font-bold border-t border-black pt-0.5 leading-none">
        {showBatch && <span>LOT: {product.batchNumber}</span>}
        {showExpiry && <span>EXP: {product.expiryDate}</span>}
      </div>
    </div>
  );
};
