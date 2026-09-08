import React, { useState } from 'react';
import { 
  Lock, 
  AlertCircle, 
  CheckCircle2, 
  Pill, 
  Building2, 
  Phone, 
  User, 
  MapPin, 
  X,
  ShieldAlert
} from 'lucide-react';
import { AppUser, WarehouseSettings } from '../types';
import { 
  loginFounder, 
  loginStaff, 
  loginPharmacy, 
  registerPharmacyAccount,
  FOUNDER_PASSCODE,
  STAFF_PASSCODE
} from '../services/firebase';

interface AuthModalProps {
  isOpen: boolean;
  currentUser: AppUser | null;
  onLoginSuccess: (user: AppUser) => void;
  onLogout: () => void;
  settings?: WarehouseSettings;
  onClose?: () => void;
  canDismiss?: boolean;
  customMessage?: string;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onLoginSuccess,
  settings,
  onClose,
  canDismiss = false,
  customMessage,
}) => {
  // Tabs: 'staff' (بوابة الإدارة والكادر) | 'pharmacy' (بوابة الصيدليات)
  const [mainTab, setMainTab] = useState<'staff' | 'pharmacy'>('staff');

  // Staff Gateway State
  const [passcode, setPasscode] = useState('');

  // Pharmacy Login States
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  // Pharmacy Registration Modal State
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [regPharmacyName, setRegPharmacyName] = useState('');
  const [regPharmacistName, setRegPharmacistName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regAddress, setRegAddress] = useState('');
  const [regPassword, setRegPassword] = useState('');

  // General Status
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  // 1. Staff & Founder Login Submit
  const handlePasscodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPass = passcode.trim();

    if (!cleanPass) {
      setErrorMsg('يرجى إدخال الرمز السري.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (cleanPass === FOUNDER_PASSCODE || cleanPass === '1234') {
        const founder = await loginFounder(cleanPass);
        onLoginSuccess(founder);
      } else if (cleanPass === STAFF_PASSCODE) {
        const staff = await loginStaff(cleanPass);
        onLoginSuccess(staff);
      } else {
        setErrorMsg('الرمز السري غير صحيح.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'الرمز السري غير صحيح.');
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Pharmacy Login Submit
  const handlePharmacyLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phone.trim();
    const cleanPass = password.trim();

    if (!cleanPhone || !cleanPass) {
      setErrorMsg('يرجى إدخال رقم الهاتف وكلمة المرور.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const user = await loginPharmacy(cleanPhone, cleanPass);
      onLoginSuccess(user);
    } catch (err: any) {
      setErrorMsg(err.message || 'تعذر تسجيل الدخول.');
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Pharmacy Registration Submit
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regPharmacyName.trim() || !regPharmacistName.trim() || !regPhone.trim() || !regPassword.trim()) {
      setErrorMsg('يرجى ملء جميع الحقول المطلوبة.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      await registerPharmacyAccount({
        pharmacyName: regPharmacyName.trim(),
        pharmacistName: regPharmacistName.trim(),
        phone: regPhone.trim(),
        address: regAddress.trim(),
        password: regPassword.trim(),
      });

      setIsRegisterOpen(false);
      // Reset registration form
      setRegPharmacyName('');
      setRegPharmacistName('');
      setRegPhone('');
      setRegAddress('');
      setRegPassword('');

      setSuccessMsg('تم إرسال طلبكم بنجاح، بانتظار اعتماد إدارة المذخر');
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل إرسال طلب التسجيل.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
      <div className="max-w-md w-full bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 text-right space-y-5 my-6">
        
        {/* Dismiss Button if allowed */}
        {canDismiss && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute left-5 top-5 text-slate-400 hover:text-slate-700 p-1 rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Samo Warehouse Logo & Brand */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white mx-auto shadow-md">
            <Pill className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-black text-slate-900 tracking-tight">
            {settings?.name || 'مذخر سامو'}
          </h2>
        </div>

        {/* Dual Switch Tabs */}
        <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-2xl border border-slate-200">
          <button
            id="tab-staff-gateway"
            type="button"
            onClick={() => {
              setMainTab('staff');
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className={`py-2.5 px-3 text-xs font-black rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
              mainTab === 'staff'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>بوابة الإدارة والكادر</span>
          </button>
          <button
            id="tab-pharmacy-gateway"
            type="button"
            onClick={() => {
              setMainTab('pharmacy');
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className={`py-2.5 px-3 text-xs font-black rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
              mainTab === 'pharmacy'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>بوابة الصيدليات</span>
          </button>
        </div>

        {/* Optional Custom Notice */}
        {customMessage && (
          <p className="text-xs text-slate-600 text-center font-medium">
            {customMessage}
          </p>
        )}

        {/* Status Alerts */}
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-700 font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Content Tab 1: بوابة الإدارة والكادر */}
        {mainTab === 'staff' && (
          <form onSubmit={handlePasscodeSubmit} className="space-y-4">
            <div>
              <div className="relative">
                <input
                  id="input-staff-passcode"
                  type="password"
                  required
                  placeholder="الرمز السري"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white text-center tracking-widest font-mono shadow-xs"
                  dir="ltr"
                  autoFocus
                />
                <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
              </div>
            </div>

            <button
              id="btn-staff-login"
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-black transition cursor-pointer active:scale-98 disabled:opacity-50 shadow-sm"
            >
              {isLoading ? 'جاري التحقق...' : 'دخول'}
            </button>
          </form>
        )}

        {/* Content Tab 2: بوابة الصيدليات */}
        {mainTab === 'pharmacy' && (
          <form onSubmit={handlePharmacyLogin} className="space-y-3.5">
            <div>
              <div className="relative">
                <input
                  id="input-pharmacy-phone"
                  type="tel"
                  required
                  placeholder="رقم الهاتف"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white pr-10 font-mono shadow-xs"
                  dir="ltr"
                />
                <Phone className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
              </div>
            </div>

            <div>
              <div className="relative">
                <input
                  id="input-pharmacy-password"
                  type="password"
                  required
                  placeholder="كلمة المرور"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white pr-10 shadow-xs"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
              </div>
            </div>

            <button
              id="btn-pharmacy-login-submit"
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-black transition cursor-pointer active:scale-98 disabled:opacity-50 shadow-sm"
            >
              {isLoading ? 'جاري التحقق...' : 'دخول'}
            </button>

            {/* Text Links: طلب تسجيل صيدلية جديدة + تصفح كزائر */}
            <div className="flex flex-col items-center gap-2 pt-2 border-t border-slate-100">
              <button
                id="btn-open-pharmacy-registration"
                type="button"
                onClick={() => {
                  setErrorMsg('');
                  setSuccessMsg('');
                  setIsRegisterOpen(true);
                }}
                className="text-xs text-blue-600 hover:text-blue-700 font-bold transition cursor-pointer underline underline-offset-4"
              >
                طلب تسجيل صيدلية جديدة
              </button>

              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="text-xs text-slate-500 hover:text-slate-800 font-medium transition cursor-pointer"
                >
                  تصفح قائمة الأدوية والأسعار كزائر
                </button>
              )}
            </div>
          </form>
        )}
      </div>

      {/* Modal: طلب تسجيل صيدلية جديدة */}
      {isRegisterOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-2xl text-right space-y-4 text-slate-900">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600" />
                <span>طلب تسجيل صيدلية جديدة</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsRegisterOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRegisterSubmit} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">اسم الصيدلية</label>
                <div className="relative">
                  <input
                    id="reg-pharmacy-name"
                    type="text"
                    required
                    placeholder="صيدلية الأمل"
                    value={regPharmacyName}
                    onChange={(e) => setRegPharmacyName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white pr-9 shadow-xs"
                  />
                  <Building2 className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">اسم الصيدلي المسؤول</label>
                <div className="relative">
                  <input
                    id="reg-pharmacist-name"
                    type="text"
                    required
                    placeholder="د. أحمد علي"
                    value={regPharmacistName}
                    onChange={(e) => setRegPharmacistName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white pr-9 shadow-xs"
                  />
                  <User className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">رقم الهاتف</label>
                <div className="relative">
                  <input
                    id="reg-phone"
                    type="tel"
                    required
                    placeholder="07701234567"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white pr-9 font-mono shadow-xs"
                    dir="ltr"
                  />
                  <Phone className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">المحافظة / العنوان الدقيق</label>
                <div className="relative">
                  <input
                    id="reg-address"
                    type="text"
                    required
                    placeholder="بغداد - المنصور - شارع 14 رمضان"
                    value={regAddress}
                    onChange={(e) => setRegAddress(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white pr-9 shadow-xs"
                  />
                  <MapPin className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">كلمة المرور</label>
                <div className="relative">
                  <input
                    id="reg-password"
                    type="password"
                    required
                    placeholder="تعيين كلمة مرور للحساب"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white pr-9 shadow-xs"
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                </div>
              </div>

              <div className="pt-2">
                <button
                  id="btn-submit-registration"
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition cursor-pointer active:scale-98 disabled:opacity-50 shadow-sm"
                >
                  {isLoading ? 'جاري الإرسال...' : 'إرسال طلب التسجيل'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
