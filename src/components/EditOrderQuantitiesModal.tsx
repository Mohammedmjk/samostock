import React, { useState, useMemo } from 'react';
import {
  X,
  Edit3,
  Plus,
  Minus,
  Trash2,
  Save,
  Package,
  CheckCircle2,
  AlertTriangle,
  Search,
  ArrowRight,
  Calculator,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { Order, OrderItem, Product } from '../types';

interface EditOrderQuantitiesModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order;
  products?: Product[];
  currency: string;
  onSaveOrder: (updatedOrder: Order) => void;
}

export const EditOrderQuantitiesModal: React.FC<EditOrderQuantitiesModalProps> = ({
  isOpen,
  onClose,
  order,
  products = [],
  currency,
  onSaveOrder,
}) => {
  // Local editable copy of items
  const [items, setItems] = useState<OrderItem[]>(() =>
    order.items.map((it) => ({ ...it }))
  );
  const [editReason, setEditReason] = useState(order.editReason || '');
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [candidateQuantities, setCandidateQuantities] = useState<Record<string, number>>({});

  const getCandidateQuantity = (productId: string) => {
    return candidateQuantities[productId] !== undefined ? candidateQuantities[productId] : 1;
  };

  const setCandidateQuantity = (productId: string, qty: number) => {
    const safeQty = Math.max(1, isNaN(qty) ? 1 : Math.floor(qty));
    setCandidateQuantities((prev) => ({
      ...prev,
      [productId]: safeQty,
    }));
  };

  // Quick lookup for product stock
  const productStockMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => {
      map.set(p.id, p);
    });
    return map;
  }, [products]);

  // Recalculate totals
  const totalQuantity = useMemo(() => {
    return items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
  }, [items]);

  const totalBonus = useMemo(() => {
    return items.reduce((sum, it) => sum + (Number(it.bonusQuantity) || 0), 0);
  }, [items]);

  const totalAmount = useMemo(() => {
    return items.reduce((sum, it) => sum + (Number(it.totalPrice) || 0), 0);
  }, [items]);

  // Differences compared to original
  const deltaQuantity = totalQuantity - order.totalQuantity;
  const deltaBonus = totalBonus - order.totalBonus;
  const deltaAmount = totalAmount - order.totalAmount;

  // Handle single item quantity change
  const handleQuantityChange = (productId: string, newQty: number) => {
    const validQty = Math.max(0, Math.floor(newQty));
    setItems((prev) =>
      prev.map((it) => {
        if (it.productId === productId) {
          const effectivePrice = it.isBonusMelted && it.meltedUnitPrice ? it.meltedUnitPrice : it.unitPrice;
          const newTotalPrice = validQty * effectivePrice;

          // Auto-adjust bonus if product has bonus definition
          let newBonus = it.bonusQuantity;
          const prod = productStockMap.get(productId);
          if (prod && prod.bonusBuyQuantity && prod.bonusFreeQuantity) {
            newBonus = Math.floor(validQty / prod.bonusBuyQuantity) * prod.bonusFreeQuantity;
          } else if (order.items.find((orig) => orig.productId === productId)?.quantity) {
            // Keep proportional bonus if original had one
            const origItem = order.items.find((orig) => orig.productId === productId)!;
            if (origItem.quantity > 0 && origItem.bonusQuantity > 0) {
              const ratio = origItem.bonusQuantity / origItem.quantity;
              newBonus = Math.round(validQty * ratio);
            }
          }

          return {
            ...it,
            quantity: validQty,
            bonusQuantity: newBonus,
            totalPrice: newTotalPrice,
          };
        }
        return it;
      })
    );
  };

  // Handle single item bonus change
  const handleBonusChange = (productId: string, newBonus: number) => {
    const validBonus = Math.max(0, Math.floor(newBonus));
    setItems((prev) =>
      prev.map((it) => {
        if (it.productId === productId) {
          return {
            ...it,
            bonusQuantity: validBonus,
          };
        }
        return it;
      })
    );
  };

  // Quick increment/decrement helper
  const handleDelta = (productId: string, delta: number) => {
    const currentItem = items.find((i) => i.productId === productId);
    if (!currentItem) return;
    handleQuantityChange(productId, currentItem.quantity + delta);
  };

  // Remove item
  const handleRemoveItem = (productId: string) => {
    const target = items.find((i) => i.productId === productId);
    if (!target) return;
    if (items.length <= 1) {
      if (!confirm('هذه هي المادة الوحيدة بالطلبية، هل ترغب بحذفها حقاً؟ (ستصبح الطلبية فارغة)')) {
        return;
      }
    }
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  };

  // Reset items back to original order
  const handleResetToOriginal = () => {
    if (confirm('هل ترغب بإلغاء التعديلات والعودة للكميات الأصلية كما أرسلتها الصيدلية؟')) {
      setItems(order.items.map((it) => ({ ...it })));
      setEditReason('');
    }
  };

  // Filter available products for adding to order
  const availableProductsToAdd = useMemo(() => {
    if (!showAddProduct) return [];
    const term = productSearchTerm.trim().toLowerCase();
    const existingIds = new Set(items.map((it) => it.productId));

    return products
      .filter((p) => !existingIds.has(p.id))
      .filter((p) => {
        if (!term) return true;
        return (
          p.tradeNameAr.toLowerCase().includes(term) ||
          p.tradeNameEn.toLowerCase().includes(term) ||
          (p.barcode && p.barcode.includes(term)) ||
          p.scientificName.toLowerCase().includes(term)
        );
      })
      .slice(0, 15);
  }, [showAddProduct, productSearchTerm, products, items]);

  // Add a product from inventory into the order
  const handleAddProductToOrder = (prod: Product, initialQty: number = 1) => {
    const effectivePrice = prod.bonusPercentage && prod.bonusPercentage > 0
      ? prod.wholesalePrice * (1 - prod.bonusPercentage / 100)
      : prod.wholesalePrice;

    const qty = Math.max(1, isNaN(initialQty) ? 1 : Math.floor(initialQty));
    const defaultBonus = prod.bonusBuyQuantity && prod.bonusFreeQuantity && qty >= prod.bonusBuyQuantity
      ? Math.floor(qty / prod.bonusBuyQuantity) * prod.bonusFreeQuantity
      : 0;

    const newItem: OrderItem = {
      productId: prod.id,
      tradeNameAr: prod.tradeNameAr,
      tradeNameEn: prod.tradeNameEn,
      dosageForm: prod.dosageForm,
      strength: prod.strength,
      batchNumber: prod.batchNumber,
      expiryDate: prod.expiryDate,
      quantity: qty,
      bonusQuantity: defaultBonus,
      bonusPercentage: prod.bonusPercentage,
      isBonusMelted: Boolean(prod.bonusPercentage && prod.bonusPercentage > 0),
      meltedUnitPrice: prod.bonusPercentage && prod.bonusPercentage > 0 ? effectivePrice : undefined,
      unitPrice: prod.wholesalePrice,
      totalPrice: qty * effectivePrice,
      verified: false,
      status: 'available',
    };

    setItems((prev) => [...prev, newItem]);
    setCandidateQuantities((prev) => ({ ...prev, [prod.id]: 1 }));
    setShowAddProduct(false);
    setProductSearchTerm('');
  };

  // Save changes
  const handleSave = () => {
    if (items.length === 0) {
      alert('لا يمكن حفظ طلبية فارغة بدون أي مواد!');
      return;
    }

    const updatedOrder: Order = {
      ...order,
      items,
      totalQuantity,
      totalBonus,
      totalAmount,
      editedAt: new Date().toISOString(),
      editReason: editReason.trim() || order.editReason || 'تم تعديل الكميات بواسطة إدارة المخزن',
    };

    onSaveOrder(updatedOrder);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 600);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black">
                  تعديل كميات وبونص الطلبية
                </h3>
                <span className="text-xs bg-slate-800 text-amber-300 px-2.5 py-0.5 rounded-full font-mono font-bold">
                  {order.orderNumber}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 flex items-center gap-2">
                <span>الصيدلية: <strong>{order.pharmacyName}</strong></span>
                <span>•</span>
                <span>الصيدلي: {order.pharmacistName}</span>
                <span>•</span>
                <span>{new Date(order.createdAt).toLocaleDateString('ar-IQ')}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Informative Banner */}
        <div className="bg-amber-50 px-5 py-2.5 border-b border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              يمكنك زيادة أو تقليص عدد العلب لكل مادة، أو تعديل البونص، أو حذف مادة تعذر تجهيزها. سيتم إعادة احتساب إجمالي الفاتورة تلقائياً.
            </span>
          </div>

          <button
            type="button"
            onClick={handleResetToOriginal}
            className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer shadow-2xs"
            title="إعادة تعيين الكميات كما أرسلتها الصيدلية أول مرة"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>استعادة الأصل</span>
          </button>
        </div>

        {/* Main Body - Scrollable Items List */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* Items Table */}
          <div className="rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            <table className="w-full text-xs text-right">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 select-none">
                  <th className="p-3 w-8 text-center">#</th>
                  <th className="p-3">المادة الدوائية والمواصفات</th>
                  <th className="p-3 text-center">الرصيد بالمخزن</th>
                  <th className="p-3 text-center min-w-[170px]">الكمية المطلوبة</th>
                  <th className="p-3 text-center min-w-[120px]">البونص المجاني</th>
                  <th className="p-3 text-center">سعر المفرد</th>
                  <th className="p-3 text-center">الإجمالي</th>
                  <th className="p-3 w-10 text-center">حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      <Package className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                      <p className="font-bold">لا توجد مواد في هذه الطلبية حالياً</p>
                    </td>
                  </tr>
                ) : (
                  items.map((item, idx) => {
                    const originalItem = order.items.find((orig) => orig.productId === item.productId);
                    const isQtyChanged = originalItem && originalItem.quantity !== item.quantity;
                    const isBonusChanged = originalItem && originalItem.bonusQuantity !== item.bonusQuantity;
                    const stockProduct = productStockMap.get(item.productId);
                    const availableStock = stockProduct ? stockProduct.stockQuantity : null;
                    const isOverStock = availableStock !== null && item.quantity + item.bonusQuantity > availableStock;

                    return (
                      <tr
                        key={item.productId}
                        className={`hover:bg-slate-50/80 transition ${
                          isQtyChanged ? 'bg-amber-50/30' : ''
                        }`}
                      >
                        {/* Index */}
                        <td className="p-3 text-center text-slate-400 font-mono font-semibold">
                          {idx + 1}
                        </td>

                        {/* Product Info */}
                        <td className="p-3">
                          <span className="font-bold text-slate-900 block text-[13px]">
                            {item.tradeNameAr}
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono" dir="ltr">
                            {item.tradeNameEn} {item.strength ? `• ${item.strength}` : ''} {item.dosageForm ? `• ${item.dosageForm}` : ''}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                            <span>وجبة: {item.confirmedBatch || item.batchNumber}</span>
                            <span>•</span>
                            <span>صلاحية: {item.confirmedExpiry || item.expiryDate}</span>
                          </div>
                        </td>

                        {/* Available Warehouse Stock */}
                        <td className="p-3 text-center">
                          {availableStock !== null ? (
                            <span
                              className={`px-2 py-1 rounded-lg text-xs font-mono font-bold inline-block ${
                                availableStock <= 0
                                  ? 'bg-rose-100 text-rose-800'
                                  : isOverStock
                                  ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-400'
                                  : 'bg-slate-100 text-slate-800'
                              }`}
                              title={isOverStock ? 'الكمية المطلوبة تفوق الرصيد الحالي بالمخزن!' : 'الرصيد الفعلي المتوفر بالمستودع'}
                            >
                              {availableStock} علبة
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">—</span>
                          )}
                        </td>

                        {/* Editable Quantity */}
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {/* Decrement by 1 */}
                            <button
                              type="button"
                              onClick={() => handleDelta(item.productId, -1)}
                              disabled={item.quantity <= 0}
                              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-700 font-bold text-sm flex items-center justify-center border border-slate-200 active:scale-95 disabled:opacity-40 transition cursor-pointer"
                              title="إنقاص علبة (-1)"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>

                            {/* Direct Input */}
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={item.quantity === 0 ? '' : item.quantity}
                              onChange={(e) =>
                                handleQuantityChange(
                                  item.productId,
                                  e.target.value === '' ? 0 : parseInt(e.target.value) || 0
                                )
                              }
                              className={`w-16 py-1 text-center font-mono font-black text-sm rounded-lg border-2 focus:outline-hidden transition ${
                                isQtyChanged
                                  ? 'bg-amber-50 border-amber-400 text-amber-950 ring-2 ring-amber-200'
                                  : 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'
                              }`}
                            />

                            {/* Increment by 1 */}
                            <button
                              type="button"
                              onClick={() => handleDelta(item.productId, 1)}
                              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-700 font-bold text-sm flex items-center justify-center border border-slate-200 active:scale-95 transition cursor-pointer"
                              title="زيادة علبة (+1)"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>

                            {/* Quick +5 button */}
                            <button
                              type="button"
                              onClick={() => handleDelta(item.productId, 5)}
                              className="px-1.5 py-1 rounded-md bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-700 font-mono font-bold text-[10px] border border-slate-200 transition cursor-pointer"
                              title="إضافة 5 علب سريعة"
                            >
                              +5
                            </button>
                          </div>

                          {/* Original Quantity Reminder */}
                          {originalItem && (
                            <div className="text-[10px] text-slate-400 mt-1">
                              الأصل: <span className="font-mono font-semibold">{originalItem.quantity}</span>
                              {isQtyChanged && (
                                <span className={`mr-1 font-bold ${item.quantity > originalItem.quantity ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  ({item.quantity > originalItem.quantity ? `+${item.quantity - originalItem.quantity}` : item.quantity - originalItem.quantity})
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Editable Bonus */}
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleBonusChange(item.productId, item.bonusQuantity - 1)}
                              disabled={item.bonusQuantity <= 0}
                              className="w-6 h-6 rounded-md bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-700 text-xs flex items-center justify-center border border-slate-200 active:scale-95 disabled:opacity-40 transition cursor-pointer"
                              title="إنقاص بونص (-1)"
                            >
                              -
                            </button>

                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={item.bonusQuantity === 0 ? '' : item.bonusQuantity}
                              onChange={(e) =>
                                handleBonusChange(
                                  item.productId,
                                  e.target.value === '' ? 0 : parseInt(e.target.value) || 0
                                )
                              }
                              placeholder="0"
                              className={`w-12 py-0.5 text-center font-mono font-bold text-xs rounded-md border focus:outline-hidden transition ${
                                isBonusChanged
                                  ? 'bg-amber-100 border-amber-400 text-amber-900'
                                  : item.bonusQuantity > 0
                                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                                  : 'bg-white border-slate-200 text-slate-600'
                              }`}
                            />

                            <button
                              type="button"
                              onClick={() => handleBonusChange(item.productId, item.bonusQuantity + 1)}
                              className="w-6 h-6 rounded-md bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-700 text-xs flex items-center justify-center border border-slate-200 active:scale-95 transition cursor-pointer"
                              title="زيادة بونص (+1)"
                            >
                              +
                            </button>
                          </div>
                          {originalItem && isBonusChanged && (
                            <div className="text-[10px] text-amber-700 font-semibold mt-0.5">
                              (الأصل: {originalItem.bonusQuantity})
                            </div>
                          )}
                        </td>

                        {/* Unit Price */}
                        <td className="p-3 text-center font-mono font-semibold text-slate-700">
                          {item.unitPrice.toLocaleString()} {currency}
                        </td>

                        {/* Total Price */}
                        <td className="p-3 text-center font-mono font-bold text-blue-700 text-[13px]">
                          {item.totalPrice.toLocaleString()} {currency}
                        </td>

                        {/* Remove item button */}
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.productId)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition cursor-pointer"
                            title="حذف هذه المادة من الطلبية"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Add Product from Inventory Section */}
          <div className="border border-dashed border-slate-300 rounded-xl p-3 bg-slate-50/70">
            {!showAddProduct ? (
              <button
                type="button"
                onClick={() => setShowAddProduct(true)}
                className="w-full py-2 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-blue-700 font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة دواء / مادة أخرى لهذه الطلبية من المخزن</span>
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    اختر مادة من المخزن لإضافتها إلى الطلبية:
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddProduct(false);
                      setProductSearchTerm('');
                    }}
                    className="text-xs text-slate-500 hover:text-slate-800 font-semibold"
                  >
                    إلغاء الإضافة
                  </button>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="ابحث باسم الدواء التجاري، العلمي، أو الباركود..."
                    value={productSearchTerm}
                    onChange={(e) => setProductSearchTerm(e.target.value)}
                    className="w-full pl-3 pr-9 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:outline-hidden focus:border-blue-600"
                    autoFocus
                  />
                </div>

                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 bg-white rounded-xl border border-slate-200">
                  {availableProductsToAdd.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      لا توجد أدوية مطابقة أو جميع الأدوية مضافة بالفعل
                    </div>
                  ) : (
                    availableProductsToAdd.map((prod) => {
                      const currentQty = getCandidateQuantity(prod.id);
                      return (
                        <div
                          key={prod.id}
                          className="p-2.5 hover:bg-blue-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition rounded-lg"
                        >
                          <div>
                            <span className="font-bold text-slate-900 block">
                              {prod.tradeNameAr} ({prod.dosageForm} {prod.strength})
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono" dir="ltr">
                              {prod.tradeNameEn} • السعر: {prod.wholesalePrice.toLocaleString()} {currency} • الرصيد: {prod.stockQuantity} علبة
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex items-center gap-1 bg-slate-100 border border-slate-300 rounded-lg p-0.5 shadow-2xs">
                              <span className="text-[10px] font-bold text-slate-500 pr-1">العدد:</span>
                              <button
                                type="button"
                                onClick={() => setCandidateQuantity(prod.id, currentQty - 1)}
                                disabled={currentQty <= 1}
                                className="w-5 h-5 rounded bg-white hover:bg-slate-200 disabled:opacity-30 text-slate-700 flex items-center justify-center font-bold text-xs cursor-pointer shadow-2xs"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <input
                                type="number"
                                min="1"
                                max={prod.stockQuantity && prod.stockQuantity > 0 ? prod.stockQuantity : undefined}
                                value={currentQty}
                                onChange={(e) => setCandidateQuantity(prod.id, parseInt(e.target.value) || 1)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleAddProductToOrder(prod, currentQty);
                                  }
                                }}
                                className="w-11 text-center text-xs font-mono font-bold text-slate-800 bg-white border border-slate-200 rounded py-0.5 focus:outline-hidden"
                              />
                              <button
                                type="button"
                                onClick={() => setCandidateQuantity(prod.id, currentQty + 1)}
                                className="w-5 h-5 rounded bg-white hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs cursor-pointer shadow-2xs"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleAddProductToOrder(prod, currentQty)}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>إضافة ({currentQty}) للطلب</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Edit Reason / Notes */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
            <label className="block text-xs font-bold text-slate-700">
              سبب التعديل أو ملاحظة للصيدلية (اختياري):
            </label>
            <input
              type="text"
              placeholder="مثال: تم تخفيض كمية الباراسيتول بناءً على اتصال الصيدلية، أو لعدم توفر الرصيد الكافي..."
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:outline-hidden focus:border-blue-600"
            />
            {/* Quick Chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-slate-400">خيارات سريعة:</span>
              {[
                'تم التعديل بناءً على اتصال هاتفي مع الصيدلية',
                'تعديل الكمية حسب الرصيد الفعلي المتوفر بالمخزن',
                'تعديل الحصة المقررة من الوكيل',
                'تمت إضافة مواد إضافية بطلب من الصيدلي',
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setEditReason(chip)}
                  className="px-2 py-0.5 rounded-md bg-white hover:bg-slate-200 text-slate-600 text-[10px] border border-slate-200 transition cursor-pointer"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer / Summary Bar & Action Buttons */}
        <div className="px-5 py-4 bg-slate-900 text-white border-t border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shrink-0">
          {/* Totals & Deltas Comparison */}
          <div className="flex items-center gap-4 sm:gap-6 flex-wrap text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">إجمالي العلب:</span>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-black font-mono text-white">
                  {totalQuantity} علبة
                </span>
                {deltaQuantity !== 0 && (
                  <span
                    className={`text-xs font-mono font-bold px-1.5 py-0.2 rounded ${
                      deltaQuantity > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                    }`}
                  >
                    {deltaQuantity > 0 ? `+${deltaQuantity}` : deltaQuantity}
                  </span>
                )}
              </div>
            </div>

            <div className="h-7 w-px bg-slate-800 hidden sm:block"></div>

            <div>
              <span className="text-slate-400 block text-[11px]">إجمالي البونص:</span>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-black font-mono text-amber-400">
                  {totalBonus} مجاني
                </span>
                {deltaBonus !== 0 && (
                  <span
                    className={`text-xs font-mono font-bold px-1.5 py-0.2 rounded ${
                      deltaBonus > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                    }`}
                  >
                    {deltaBonus > 0 ? `+${deltaBonus}` : deltaBonus}
                  </span>
                )}
              </div>
            </div>

            <div className="h-7 w-px bg-slate-800 hidden sm:block"></div>

            <div>
              <span className="text-slate-400 block text-[11px]">المبلغ الإجمالي الجديد:</span>
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-black font-mono text-blue-400">
                  {totalAmount.toLocaleString()} {currency}
                </span>
                {deltaAmount !== 0 && (
                  <span
                    className={`text-xs font-mono font-bold px-1.5 py-0.2 rounded ${
                      deltaAmount > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                    }`}
                  >
                    {deltaAmount > 0 ? `+${deltaAmount.toLocaleString()}` : deltaAmount.toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              إلغاء
            </button>

            <button
              type="button"
              onClick={handleSave}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-md ${
                savedSuccess
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black'
              }`}
            >
              {savedSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  <span>تم حفظ التعديلات!</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>حفظ التعديلات واعتماد الطلبية</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
