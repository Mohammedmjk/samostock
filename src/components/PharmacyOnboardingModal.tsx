import React, { useState } from 'react';
import { Building2, User, Phone, MapPin, Award, CheckCircle2, ShieldCheck, Pill } from 'lucide-react';
import { AppUser } from '../types';
import { savePharmacyProfile } from '../services/firebase';
import { storage } from '../services/storage';

interface PharmacyOnboardingModalProps {
  user: AppUser;
  onCompleted: (updatedUser: AppUser) => void;
  onLogout: () => void;
}

export const PharmacyOnboardingModal: React.FC<PharmacyOnboardingModalProps> = ({
  user,
  onCompleted,
  onLogout,
}) => {
  const [pharmacyName, setPharmacyName] = useState(user.pharmacyName || '');
  const [pharmacistName, setPharmacistName] = useState(user.name && user.name !== 'مستخدم جديد' ? user.name : '');
  const [phone, setPhone] = useState(user.phone || '');
  const [address, setAddress] = useState(user.address || '');
  const [syndicateNumber, setSyndicateNumber] = useState(user.syndicateNumber || '');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!pharmacyName.trim()) {
      setErrorMsg('يرجى إدخال اسم الصيدلية');
      return;
    }
    if (!pharmacistName.trim()) {
      setErrorMsg('يرجى إدخال اسم الصيدلي المسؤول');
      return;
    }
    if (!phone.trim() || phone.trim().length < 9) {
      setErrorMsg('يرجى إدخال رقم هاتف صحيح للتواصل واستلام الطلبيات');
      return;
    }
    if (!address.trim()) {
      setErrorMsg('يرجى إدخال العنوان الدقيق وموقع الصيدلية');
      return;
    }
    if (!syndicateNumber.trim()) {
      setErrorMsg('يرجى إدخال رقم هوية نقابة الصيادلة للتحقق المهني');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Save to Firebase Firestore
      await savePharmacyProfile(user.id, {
        pharmacyName: pharmacyName.trim(),
        pharmacistName: pharmacistName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        syndicateNumber: syndicateNumber.trim()
      });

      const updatedUser: AppUser = {
        ...user,
        pharmacyName: pharmacyName.trim(),
        name: pharmacistName.trim(),
        pharmacistName: pharmacistName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        syndicateNumber: syndicateNumber.trim(),
        profileCompleted: true
      };

      // 2. Save locally for fast offline access
      storage.setCurrentUser(updatedUser);
      storage.savePharmacyProfile({
        name: pharmacyName.trim(),
        pharmacist: pharmacistName.trim(),
        phone: phone.trim(),
        address: address.trim()
      });

      onCompleted(updatedUser);
    } catch (err: any) {
      console.error('Failed to save profile:', err);
      // Fallback local save if offline
      const updatedUser: AppUser = {
        ...user,
        pharmacyName: pharmacyName.trim(),
        name: pharmacistName.trim(),
        pharmacistName: pharmacistName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        syndicateNumber: syndicateNumber.trim(),
        profileCompleted: true
      };
      storage.setCurrentUser(updatedUser);
      onCompleted(updatedUser);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="max-w-lg w-full bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100 text-right space-y-6 my-auto">
        {/* Header Badge */}
        <div className="flex items-center gap-3.5 pb-4 border-b border-slate-100">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 shadow-sm border border-emerald-100">
            <Pill className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-black mb-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              تم قبول الحساب بنجاح
            </div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">استكمال بيانات الصيدلية (لمرة واحدة)</h2>
            <p className="text-xs text-slate-500 mt-0.5">يرجى ملء البيانات التالية لربط حسابك وفتح بوابة التسوق والطلبيات</p>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-2">
            <span>⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Pharmacy Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-600" />
              <span>اسم الصيدلية الرسمي</span>
              <span className="text-rose-500">*</span>
            </label>
            <input
              id="input-onboarding-pharmacy-name"
              type="text"
              required
              value={pharmacyName}
              onChange={(e) => setPharmacyName(e.target.value)}
              placeholder="مثال: صيدلية النور المركزية"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
            />
          </div>

          {/* Pharmacist Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-blue-600" />
              <span>اسم الصيدلي المسؤول</span>
              <span className="text-rose-500">*</span>
            </label>
            <input
              id="input-onboarding-pharmacist-name"
              type="text"
              required
              value={pharmacistName}
              onChange={(e) => setPharmacistName(e.target.value)}
              placeholder="مثال: د. سيف عبد الله"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
            />
          </div>

          {/* Phone Number */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-blue-600" />
              <span>رقم الهاتف المعتمد للطلبيات</span>
              <span className="text-rose-500">*</span>
            </label>
            <input
              id="input-onboarding-phone"
              type="tel"
              dir="ltr"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0770xxxxxxx"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition text-right"
            />
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-blue-600" />
              <span>العنوان الدقيق (المحافظة / المنطقة / أقرب نقطة دالة)</span>
              <span className="text-rose-500">*</span>
            </label>
            <input
              id="input-onboarding-address"
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="مثال: بغداد - الكرادة خارج - قرب ساحة الواثق"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
            />
          </div>

          {/* Syndicate Number */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-blue-600" />
              <span>رقم هوية نقابة الصيادلة</span>
              <span className="text-rose-500">*</span>
            </label>
            <input
              id="input-onboarding-syndicate"
              type="text"
              required
              value={syndicateNumber}
              onChange={(e) => setSyndicateNumber(e.target.value)}
              placeholder="مثال: 12490"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
            />
          </div>

          <div className="pt-3 flex items-center gap-3">
            <button
              id="btn-submit-pharmacy-onboarding"
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-500/20 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>جاري الحفظ والتسجيل...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>حفظ البيانات وفتح بوابة الأدوية</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              تسجيل خروج
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
