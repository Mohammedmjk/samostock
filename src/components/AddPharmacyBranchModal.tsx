import React, { useState } from 'react';
import { Building, Phone, User, MapPin, X, Check, Plus } from 'lucide-react';

interface AddPharmacyBranchModalProps {
  isOpen: boolean;
  onClose: () => void;
  userPhone: string;
  defaultPharmacistName?: string;
  onAddBranch: (branchData: {
    name: string;
    pharmacistName: string;
    address: string;
    notes?: string;
  }) => void;
}

export const AddPharmacyBranchModal: React.FC<AddPharmacyBranchModalProps> = ({
  isOpen,
  onClose,
  userPhone,
  defaultPharmacistName = '',
  onAddBranch,
}) => {
  const [branchName, setBranchName] = useState('');
  const [pharmacistName, setPharmacistName] = useState(defaultPharmacistName);
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: { [key: string]: string } = {};
    if (!branchName.trim()) newErrors.branchName = 'يرجى كتابة اسم الصيدلية الثانية';
    if (!pharmacistName.trim()) newErrors.pharmacistName = 'يرجى كتابة اسم الصيدلي / الموظف المسؤول';
    if (!address.trim()) newErrors.address = 'يرجى إدخال عنوان وموقع الصيدلية';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onAddBranch({
      name: branchName.trim(),
      pharmacistName: pharmacistName.trim(),
      address: address.trim(),
      notes: notes.trim(),
    });

    // Reset fields
    setBranchName('');
    setAddress('');
    setNotes('');
    setErrors({});
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl relative text-right space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">إضافة صيدلية ثانية لنفس الرقم</h3>
              <p className="text-[11px] text-slate-500">
                يمكنك إضافة فرع أو صيدلية ثانية والتبديل بينهما فوراً عند الطلب
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Phone Info Banner */}
        <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="text-slate-700">رقم الهاتف المرتبط:</span>
          </div>
          <span className="font-mono font-bold text-blue-950 text-xs bg-white px-2 py-0.5 rounded border border-blue-200" dir="ltr">
            {userPhone || 'نفس رقم حسابك الحالي'}
          </span>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              اسم الصيدلية الجديدة / الفرع الثاني <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Building className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                placeholder="مثال: صيدلية الشفاء - الفرع الثاني"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                className={`w-full pr-9 pl-3 py-2 text-xs rounded-xl border ${
                  errors.branchName ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                } focus:outline-hidden focus:border-blue-500`}
              />
            </div>
            {errors.branchName && (
              <span className="text-[11px] text-rose-600 mt-1 block">{errors.branchName}</span>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              اسم الصيدلي / الموظف المسؤول بهذا الفرع <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                placeholder="اسم الموظف أو الصيدلي في هذا الفرع"
                value={pharmacistName}
                onChange={(e) => setPharmacistName(e.target.value)}
                className={`w-full pr-9 pl-3 py-2 text-xs rounded-xl border ${
                  errors.pharmacistName ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                } focus:outline-hidden focus:border-blue-500`}
              />
            </div>
            {errors.pharmacistName && (
              <span className="text-[11px] text-rose-600 mt-1 block">{errors.pharmacistName}</span>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              عنوان الصيدلية والمنطقة <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                placeholder="المدينة - المنطقة - الشارع - أقرب نقطة دالة"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className={`w-full pr-9 pl-3 py-2 text-xs rounded-xl border ${
                  errors.address ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                } focus:outline-hidden focus:border-blue-500`}
              />
            </div>
            {errors.address && (
              <span className="text-[11px] text-rose-600 mt-1 block">{errors.address}</span>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              ملاحظات أو تفاصيل للتسليم (اختياري)
            </label>
            <textarea
              rows={2}
              placeholder="أي ملاحظات خاصة بالتوصيل أو دوام الصيدلية..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>حفظ واختيار هذه الصيدلية للطلب</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
