import React, { useState, useEffect } from 'react';
import { Phone, MessageSquare, Building2, MapPin, Check, X, AlertCircle } from 'lucide-react';
import { WarehouseSettings } from '../types';
import { storage } from '../services/storage';

interface EditContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: WarehouseSettings;
  onUpdateSettings: (newSettings: WarehouseSettings) => void;
}

export const EditContactModal: React.FC<EditContactModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  const [phone, setPhone] = useState(settings.phone || '07700000000');
  const [supportPhone, setSupportPhone] = useState(settings.supportPhone || settings.phone || '07700000000');
  const [salesPhone, setSalesPhone] = useState(settings.salesPhone || settings.phone || '07700000000');
  const [whatsappPhone, setWhatsappPhone] = useState(settings.whatsappPhone || settings.phone || '07700000000');
  const [altPhone, setAltPhone] = useState(settings.altPhone || '');
  const [name, setName] = useState(settings.name || 'مذخر سامو للأدوية');
  const [address, setAddress] = useState(settings.address || '');
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPhone(settings.phone || '07700000000');
      setSupportPhone(settings.supportPhone || settings.phone || '07700000000');
      setSalesPhone(settings.salesPhone || settings.phone || '07700000000');
      setWhatsappPhone(settings.whatsappPhone || settings.phone || '07700000000');
      setAltPhone(settings.altPhone || '');
      setName(settings.name || 'مذخر سامو للأدوية');
      setAddress(settings.address || '');
      setSavedSuccess(false);
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: WarehouseSettings = {
      ...settings,
      phone: phone.trim(),
      supportPhone: supportPhone.trim() || phone.trim(),
      salesPhone: salesPhone.trim() || phone.trim(),
      whatsappPhone: whatsappPhone.trim() || phone.trim(),
      altPhone: altPhone.trim(),
      name: name.trim(),
      address: address.trim(),
    };

    storage.saveSettings(updated);
    onUpdateSettings(updated);
    setSavedSuccess(true);
    setTimeout(() => {
      onClose();
    }, 1000);
  };

  const cleanWaNumber = (whatsappPhone || phone).replace(/[^0-9]/g, '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">تعديل أرقام الاستفسار والواتساب</h2>
              <p className="text-xs text-slate-300 mt-0.5">تحديث رقم الهاتف والتواصل المعروض للصيدليات وفي الفواتير</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {savedSuccess && (
            <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 p-3 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 animate-in fade-in">
              <Check className="w-5 h-5 text-emerald-600" />
              <span>تم حفظ وتحديث الأرقام بنجاح! سيتم تطبيقها في كامل التطبيق.</span>
            </div>
          )}

          {/* Primary Phone */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-blue-600" />
              <span>رقم الهاتف المعتمد للاستفسارات والمبيعات (الرئيسي)</span>
              <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              placeholder="مثال: 07700000000 أو 07800000000"
              dir="ltr"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition text-right"
            />
            <p className="text-[11px] text-slate-500 mt-1">يظهر هذا الرقم في ترويسة بوابة الصيدليات وفي أسفل الفواتير المطبوعة.</p>
          </div>

          {/* Support Phone & Sales Phone Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-blue-500" />
                <span>رقم الدعم الفني والمساعدة</span>
              </label>
              <input
                type="text"
                value={supportPhone}
                onChange={(e) => setSupportPhone(e.target.value)}
                placeholder="مثال: 07700000000"
                dir="ltr"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition text-right"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                <span>رقم قسم المبيعات والحسابات</span>
              </label>
              <input
                type="text"
                value={salesPhone}
                onChange={(e) => setSalesPhone(e.target.value)}
                placeholder="مثال: 07700000000"
                dir="ltr"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:bg-white transition text-right"
              />
            </div>
          </div>

          {/* WhatsApp Phone */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
              <span>رقم الواتساب لاستلام الطلبات وتأكيد الرموز</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
                placeholder="مثال: 07700000000"
                dir="ltr"
                className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:bg-white transition text-right"
              />
              <button
                type="button"
                onClick={() => setWhatsappPhone(phone)}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer"
                title="استخدام نفس رقم الهاتف الرئيسي"
              >
                نفس الرقم
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              الرقم الذي تُرسل إليه سلات الشراء ورسائل طلب التوثيق عبر تطبيق الواتساب.
            </p>
          </div>

          {/* Alt Phone */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              <span>رقم هاتف بديل / إضافي (اختياري)</span>
            </label>
            <input
              type="text"
              value={altPhone}
              onChange={(e) => setAltPhone(e.target.value)}
              placeholder="مثال: 07800000000"
              dir="ltr"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition text-right"
            />
          </div>

          {/* Warehouse Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span>اسم المذخر أو المستودع</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مذخر سامو للأدوية"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
            />
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              <span>العنوان وموقع المذخر</span>
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="مثال: بغداد - الحارثية / شارع الصناعة"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
            {cleanWaNumber && (
              <a
                href={`https://api.whatsapp.com/send?phone=${cleanWaNumber}&text=${encodeURIComponent('تجربة رقم الواتساب المعتمد لمذخر سامو')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl border border-emerald-200 flex items-center gap-1.5 transition"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>تجربة رقم الواتساب</span>
              </a>
            )}

            <div className="flex items-center gap-2 mr-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs transition cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>حفظ الأرقام الآن</span>
              </button>
            </div>
          </div>
        </form>

      </div>
    </div>
  );
};
