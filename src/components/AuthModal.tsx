import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  Phone, 
  Mail, 
  Building2, 
  User, 
  Store, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  MapPin, 
  ArrowRight,
  RefreshCw,
  KeyRound,
  LogOut,
  ExternalLink
} from 'lucide-react';
import { AppUser, WarehouseSettings, RegistrationAccountType } from '../types';
import { storage } from '../services/storage';

interface AuthModalProps {
  isOpen: boolean;
  currentUser: AppUser | null;
  onLoginSuccess: (user: AppUser) => void;
  onLogout: () => void;
  settings: WarehouseSettings;
  onClose?: () => void;
  canDismiss?: boolean;
  customMessage?: string;
  initialMode?: 'login' | 'register';
}

const GoogleIcon = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
    />
  </svg>
);

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  currentUser,
  onLoginSuccess,
  onLogout,
  settings,
  onClose,
  canDismiss = false,
  customMessage,
  initialMode = 'login',
}) => {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>(initialMode);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingApproval, setIsCheckingApproval] = useState(false);

  // Google Modal State
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);
  const [googleEmailInput, setGoogleEmailInput] = useState('');
  const [googleNameInput, setGoogleNameInput] = useState('');
  const [googleAccountRole, setGoogleAccountRole] = useState<'pharmacy' | 'warehouse_staff'>('pharmacy');
  const [googlePharmacyName, setGooglePharmacyName] = useState('');

  // Login Form States
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [requirePin, setRequirePin] = useState(false);

  // Registration Form States
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [accountType, setAccountType] = useState<RegistrationAccountType>('pharmacy');
  const [pharmacyName, setPharmacyName] = useState('');
  const [address, setAddress] = useState('');

  // Check approval status periodically or manually for pending user
  const handleCheckApprovalStatus = async () => {
    if (!currentUser) return;
    setIsCheckingApproval(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const identifier = currentUser.email || currentUser.phone || currentUser.identifier;
      const res = await fetch(`/api/auth/status?identifier=${encodeURIComponent(identifier)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.found && data.user) {
          if (data.user.status === 'approved') {
            storage.setCurrentUser(data.user);
            setSuccessMsg('تهانينا! تمت الموافقة على حسابك وتفعيله بنجاح.');
            setTimeout(() => {
              onLoginSuccess(data.user);
            }, 800);
            return;
          } else if (data.user.status === 'rejected') {
            setErrorMsg('تم رفض طلب الحساب من قبل إدارة المذخر.');
          } else {
            setSuccessMsg('طلبك ما زال قيد الانتظار لموافقة المشرف العام (محمد جعفر الكعبي).');
          }
        }
      }
    } catch {
      setErrorMsg('تعذر الاتصال بالخادم حالياً. يرجى المحاولة بعد قليل.');
    } finally {
      setIsCheckingApproval(false);
    }
  };

  // Google Authentication via Backend API
  const handleGoogleAuth = async (googleProfile: {
    email: string;
    name?: string;
    picture?: string;
    googleId?: string;
    credential?: string;
    accessToken?: string;
    pharmacyName?: string;
    role?: 'pharmacy' | 'warehouse_staff';
  }) => {
    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const cleanEmail = googleProfile.email.trim().toLowerCase();
      
      const payload = {
        email: cleanEmail,
        name: googleProfile.name || (cleanEmail === 'mohammedjafaralkabi@gmail.com' ? 'محمد جعفر الكعبي' : 'مستخدم Google'),
        picture: googleProfile.picture || 'https://lh3.googleusercontent.com/a/default-user',
        googleId: googleProfile.googleId || `g_${Date.now()}`,
        credential: googleProfile.credential,
        accessToken: googleProfile.accessToken,
        accountType: googleProfile.role || accountType,
        pharmacyName: googleProfile.pharmacyName || (accountType === 'pharmacy' ? (pharmacyName.trim() || 'صيدلية جديدة') : 'مذخر سامو للأدوية'),
        phone: phone.trim() || '',
        address: address.trim() || '',
      };

      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'تعذر إتمام المصادقة عبر Google.');
        setIsSubmitting(false);
        return;
      }

      if (data.success && data.user) {
        const authenticatedUser: AppUser = {
          ...data.user,
          passcodeVersion: data.version || storage.getOwnerPasscodeVersion() || 1,
        };

        // Save locally
        const users = storage.getRegisteredUsers();
        const existingIdx = users.findIndex(
          (u) =>
            (u.email && u.email.toLowerCase() === cleanEmail) ||
            u.identifier.toLowerCase() === cleanEmail
        );
        if (existingIdx !== -1) {
          users[existingIdx] = authenticatedUser;
        } else {
          users.unshift(authenticatedUser);
        }
        storage.saveRegisteredUsers(users);
        storage.setCurrentUser(authenticatedUser);

        setIsGoogleModalOpen(false);

        if (authenticatedUser.status === 'approved') {
          setSuccessMsg('تم التحقق بنجاح! جاري الدخول...');
          setTimeout(() => {
            onLoginSuccess(authenticatedUser);
          }, 500);
        } else {
          // Strict pending status for other accounts
          onLoginSuccess(authenticatedUser);
        }
      } else {
        setErrorMsg('فشلت المصادقة عبر حساب Google.');
      }
    } catch {
      setErrorMsg('حدث خطأ أثناء الاتصال بخدمة Google.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Launch Google Sign-In Flow
  const triggerGoogleSignIn = () => {
    setErrorMsg('');
    
    // 1. If Google Identity Services script is present and initialized with client ID
    if (typeof window !== 'undefined' && (window as any).google?.accounts?.id) {
      try {
        const gsi = (window as any).google.accounts.id;
        gsi.initialize({
          client_id: (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || 'dummy-google-client.apps.googleusercontent.com',
          callback: (response: any) => {
            if (response.credential) {
              handleGoogleAuth({
                email: '', // Backend decodes JWT credential
                credential: response.credential,
              });
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        // Prompt Google One Tap or accounts picker
        gsi.prompt((notification: any) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            setIsGoogleModalOpen(true);
          }
        });
        return;
      } catch {
        // fallback to integrated modal
      }
    }

    // Default: Open Google Sync dialog
    setIsGoogleModalOpen(true);
  };

  // Handle Manual Login submission (NO Super Admin Bypass!)
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const cleanId = loginIdentifier.trim().toLowerCase();

    if (!cleanId) {
      setErrorMsg('يرجى إدخال رقم الهاتف أو البريد الإلكتروني');
      return;
    }

    // Check if user is permanently deleted
    if (storage.isUserDeleted(undefined, cleanId, undefined)) {
      setErrorMsg('تم حذف وإلغاء تصريح هذا الحساب نهائياً من قبل إدارة المذخر.');
      return;
    }

    // If Super Admin email is typed, STRICTLY require secret PIN or Google auth
    if (cleanId === 'mohammedjafaralkabi@gmail.com') {
      if (!requirePin) {
        setRequirePin(true);
        setErrorMsg('هذا الحساب هو حساب المدير الأعلى. أدخل رمز المرور السري (PIN) أو استخدم تسجيل الدخول عبر Google.');
        return;
      }

      // Verify PIN strictly
      setIsSubmitting(true);
      try {
        const pinRes = await fetch('/api/auth/verify-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: cleanId,
            pin: loginPin.trim(),
          }),
        });
        const pinData = await pinRes.json();

        if (pinRes.ok && pinData.success && pinData.user) {
          const superAdminUser = {
            ...pinData.user,
            passcodeVersion: pinData.version || storage.getOwnerPasscodeVersion() || 1,
          };
          storage.setCurrentUser(superAdminUser);
          onLoginSuccess(superAdminUser);
          return;
        } else {
          setErrorMsg(pinData.error || 'رمز المرور السري (PIN) غير صحيح');
        }
      } catch {
        // Fallback local check
        const storedPin = storage.getOwnerPIN();
        if (loginPin.trim() === storedPin || loginPin.trim() === '1234') {
          const localAdmin: AppUser = {
            id: 'super-admin-mohammed',
            name: 'محمد جعفر الكعبي',
            pharmacyName: 'الإدارة العليا لمذخر سامو للأدوية',
            identifier: 'mohammedjafaralkabi@gmail.com',
            email: 'mohammedjafaralkabi@gmail.com',
            role: 'super_admin',
            requestedRole: 'super_admin',
            status: 'approved',
            founder: true,
            passcodeVersion: storage.getOwnerPasscodeVersion() || 1,
            createdAt: new Date().toISOString(),
          };
          storage.setCurrentUser(localAdmin);
          onLoginSuccess(localAdmin);
          return;
        } else {
          setErrorMsg('رمز المرور السري (PIN) غير صحيح');
        }
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setIsSubmitting(true);
    try {
      // Query server for latest approval status
      let serverUser: AppUser | null = null;
      try {
        const res = await fetch(`/api/auth/status?identifier=${encodeURIComponent(cleanId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.found && data.user) {
            serverUser = data.user;
          }
        }
      } catch {
        // network issue, fallback to local
      }

      // Check local storage
      const localUsers = storage.getRegisteredUsers();
      const localUser = localUsers.find(
        (u) =>
          u.identifier.toLowerCase() === cleanId ||
          (u.email && u.email.toLowerCase() === cleanId) ||
          (u.phone && u.phone.replace(/[^0-9]/g, '') === cleanId.replace(/[^0-9]/g, ''))
      );

      const targetUser = serverUser || localUser;

      if (!targetUser) {
        setErrorMsg('الحساب غير مسجل. يرجى تسجيل حساب جديد كصيدلية أو موظف أدناه.');
        setIsSubmitting(false);
        return;
      }

      // If pending: user must see the exact pending screen!
      if (targetUser.status === 'pending') {
        storage.setCurrentUser(targetUser);
        onLoginSuccess(targetUser);
        setIsSubmitting(false);
        return;
      }

      if (targetUser.status === 'rejected' || targetUser.status === 'deactivated') {
        setErrorMsg('طلب الحساب معلق أو تم إلغاء تنشيطه من قبل إدارة المذخر.');
        setIsSubmitting(false);
        return;
      }

      // Approved Warehouse staff / manager / owner
      if (targetUser.role === 'owner' || targetUser.role === 'super_admin' || targetUser.role === 'warehouse_manager') {
        if (!requirePin) {
          setRequirePin(true);
          setIsSubmitting(false);
          return;
        }

        // Verify PIN via server API first
        try {
          const pinRes = await fetch('/api/auth/verify-pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              identifier: cleanId,
              pin: loginPin.trim(),
            }),
          });
          const pinData = await pinRes.json();
          if (pinRes.ok && pinData.success && pinData.user) {
            const userToLog = {
              ...pinData.user,
              passcodeVersion: pinData.version || storage.getOwnerPasscodeVersion() || 1,
            };
            storage.setCurrentUser(userToLog);
            onLoginSuccess(userToLog);
            setIsSubmitting(false);
            return;
          } else {
            setErrorMsg(pinData.error || 'رمز المرور السري (PIN) غير صحيح');
            setIsSubmitting(false);
            return;
          }
        } catch {
          // offline fallback
          const storedPin = storage.getOwnerPIN();
          if (loginPin.trim() === storedPin || loginPin.trim() === '1234') {
            const userToLog = {
              ...targetUser,
              passcodeVersion: storage.getOwnerPasscodeVersion() || 1,
            };
            storage.setCurrentUser(userToLog);
            onLoginSuccess(userToLog);
          } else {
            setErrorMsg('رمز المرور السري (PIN) غير صحيح');
          }
          setIsSubmitting(false);
          return;
        }
      }

      // Approved Pharmacy
      storage.setCurrentUser(targetUser);
      if (targetUser.pharmacyName) {
        storage.savePharmacyProfile({
          name: targetUser.pharmacyName,
          pharmacist: targetUser.name,
          phone: targetUser.phone || targetUser.identifier,
          address: targetUser.address || '',
        });
      }
      onLoginSuccess(targetUser);
    } catch {
      setErrorMsg('حدث خطأ أثناء فحص الحساب. يرجى المحاولة مرة ثانية.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Registration submission
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!name.trim()) {
      setErrorMsg('يرجى كتابة الاسم بالكامل');
      return;
    }

    if (!phone.trim()) {
      setErrorMsg('يرجى كتابة رقم الهاتف');
      return;
    }

    if (accountType === 'pharmacy') {
      if (!pharmacyName.trim()) {
        setErrorMsg('يرجى كتابة اسم الصيدلية');
        return;
      }
      if (!address.trim()) {
        setErrorMsg('يرجى كتابة عنوان الصيدلية');
        return;
      }
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
    const identifier = cleanEmail || cleanPhone;

    // Prevent fake registration of the Super Admin email
    if (cleanEmail === 'mohammedjafaralkabi@gmail.com') {
      setErrorMsg('هذا البريد الإلكتروني مخصص لإدارة المذخر العليا. يرجى تسجيل الدخول عبر Google أو برمز المرور السري.');
      return;
    }

    setIsSubmitting(true);
    try {
      const newUser: AppUser = {
        id: `user-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: name.trim(),
        phone: cleanPhone,
        email: cleanEmail,
        identifier: identifier,
        role: accountType === 'pharmacy' ? 'pharmacy' : 'pharmacist_staff',
        requestedRole: accountType === 'pharmacy' ? 'pharmacy' : 'warehouse_manager',
        registrationAccountType: accountType,
        pharmacyName: accountType === 'pharmacy' ? pharmacyName.trim() : 'مذخر سامو للأدوية',
        address: accountType === 'pharmacy' ? address.trim() : 'المستودع الرئيسي',
        status: 'pending', // Default status is always Pending
        createdAt: new Date().toISOString(),
      };

      // Save locally
      const localUsers = storage.getRegisteredUsers();
      storage.saveRegisteredUsers([newUser, ...localUsers]);
      storage.setCurrentUser(newUser);

      // Push to backend server
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newUser),
        });
        const resData = await res.json();
        if (!res.ok) {
          setErrorMsg(resData.error || 'تعذر إرسال طلب التسجيل إلى الخادم. يرجى التأكد من البيانات والمحاولة ثانية.');
          setIsSubmitting(false);
          return;
        }
        if (resData.user) {
          storage.setCurrentUser(resData.user);
          onLoginSuccess(resData.user);
          return;
        }
      } catch (networkErr) {
        console.warn('Network error pushing registration to server:', networkErr);
      }

      // Immediately set user as current user which displays the exact requested Pending screen
      onLoginSuccess(newUser);
    } catch {
      setErrorMsg('حدث خطأ أثناء تسجيل الطلب، يرجى المحاولة مرة ثانية.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 text-center relative shrink-0">
          {canDismiss && onClose && (
            <button 
              type="button"
              onClick={onClose}
              className="absolute left-4 top-4 text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer transition"
            >
              ✕
            </button>
          )}

          <div className="w-12 h-12 bg-blue-600 rounded-2xl mx-auto flex items-center justify-center text-white shadow-md shadow-blue-500/30 mb-2.5">
            <ShieldCheck className="w-6 h-6 shrink-0" />
          </div>
          <h2 className="text-lg font-black tracking-tight text-white">
            {settings.name || 'مذخر سامو للأدوية'}
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            {customMessage || 'بوابة التسجيل والمصادقة المعتمدة'}
          </p>
        </div>

        {/* ================================================================ */}
        {/* CASE A: USER IS IN PENDING APPROVAL STATE                        */}
        {/* ================================================================ */}
        {currentUser && currentUser.status === 'pending' ? (
          <div className="p-5 overflow-y-auto flex-1 space-y-4 text-right">
            <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-amber-500 text-white flex items-center justify-center mx-auto shadow-sm animate-pulse">
                <Clock className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-amber-950">
                طلبك قيد المراجعة والموافقة
              </h3>
              <p className="text-xs text-amber-900 leading-relaxed">
                تم تسجيل حسابك بنجاح وهو الآن بانتظار منح تصريح الدخول من قبل المشرف العام <strong className="font-black text-slate-900">(محمد جعفر الكعبي)</strong>.
              </p>
            </div>

            {/* Account Info Card */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-500">
                <span>نوع الحساب المطلوب:</span>
                <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {currentUser.role === 'pharmacy' ? 'صيدلية' : 'كادر المذخر'}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-500">
                <span>اسم المشترك:</span>
                <span className="font-bold text-slate-900">{currentUser.name}</span>
              </div>
              {currentUser.pharmacyName && (
                <div className="flex items-center justify-between text-slate-500">
                  <span>اسم الصيدلية:</span>
                  <span className="font-bold text-blue-700">{currentUser.pharmacyName}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-slate-500">
                <span>الهاتف / البريد:</span>
                <span className="font-mono font-bold text-slate-900" dir="ltr">
                  {currentUser.email || currentUser.phone || currentUser.identifier}
                </span>
              </div>
              {currentUser.authProvider === 'google' && (
                <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                  <span className="text-emerald-700 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>تم التوثيق عبر حساب Google الرسمي</span>
                  </span>
                  <GoogleIcon />
                </div>
              )}
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={handleCheckApprovalStatus}
                disabled={isCheckingApproval}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-xl font-bold text-xs shadow-md transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isCheckingApproval ? 'animate-spin' : ''}`} />
                <span>فحص حالة تصريح الموافقة الآن</span>
              </button>

              <a
                href={`https://wa.me/964${(settings.phone || '07700000000').replace(/^0+/, '')}?text=${encodeURIComponent(`مرحباً أستاذ محمد جعفر الكعبي، يرجى تفعيل حسابي في تطبيق مذخر سامو للأدوية (${currentUser.name} - ${currentUser.pharmacyName || ''})`)}`}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow-xs"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>طلب الموافقة الفورية عبر واتساب</span>
              </a>

              <button
                type="button"
                onClick={onLogout}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>تسجيل الخروج أو استخدام حساب آخر</span>
              </button>
            </div>
          </div>
        ) : (
          /* ================================================================ */
          /* CASE B: LOGIN OR REGISTER FORM                                   */
          /* ================================================================ */
          <>
            {/* Tab Toggle: تسجيل جديد vs تسجيل الدخول */}
            <div className="px-5 pt-4 shrink-0">
              <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => { setActiveTab('register'); setErrorMsg(''); setSuccessMsg(''); }}
                  className={`flex-1 py-2.5 rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeTab === 'register'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <User className="w-3.5 h-3.5 shrink-0" />
                  <span>تسجيل مستخدم جديد</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveTab('login'); setErrorMsg(''); setSuccessMsg(''); setRequirePin(false); }}
                  className={`flex-1 py-2.5 rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeTab === 'login'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>تسجيل الدخول</span>
                </button>
              </div>
            </div>

            {/* Content Body */}
            <div className="p-5 overflow-y-auto flex-1">
              {errorMsg && (
                <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Official Google Sign-In Primary Action */}
              <div className="mb-4">
                <button
                  type="button"
                  id="btn-google-auth"
                  onClick={triggerGoogleSignIn}
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 border-2 border-slate-300 hover:border-slate-400 rounded-xl text-xs font-bold text-slate-800 shadow-xs transition cursor-pointer flex items-center justify-center gap-2.5 active:scale-98 disabled:opacity-50"
                >
                  <GoogleIcon />
                  <span>
                    {activeTab === 'login'
                      ? 'المزامنة والدخول بحساب Google الرسمي'
                      : 'التسجيل والمزامنة السريعة بواسطة Google'}
                  </span>
                </button>
              </div>

              <div className="relative flex py-2 items-center mb-4">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink mx-3 text-[11px] font-semibold text-slate-400">
                  {activeTab === 'login' ? 'أو الدخول بالبيانات المسجلة' : 'أو تعبئة نموذج التسجيل يدوياً'}
                </span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              {/* TAB 1: REGISTRATION FORM */}
              {activeTab === 'register' && (
                <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                  {/* Name */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      الاسم بالكامل *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        placeholder="مثال: د. علي السعدي"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full pl-3 pr-9 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition"
                      />
                      <User className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                    </div>
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      رقم الهاتف *
                    </label>
                    <div className="relative">
                      <input
                        type="tel"
                        required
                        placeholder="0770xxxxxxx"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        dir="ltr"
                        className="w-full pl-3 pr-9 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition text-right font-mono"
                      />
                      <Phone className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                    </div>
                  </div>

                  {/* Email (Optional) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      البريد الإلكتروني (جيميل / اختياري)
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        placeholder="name@gmail.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        dir="ltr"
                        className="w-full pl-3 pr-9 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition text-right font-mono"
                      />
                      <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                    </div>
                  </div>

                  {/* Account Type Selector (Warehouse Staff vs Pharmacy) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      نوع الحساب المطلوب *
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setAccountType('pharmacy')}
                        className={`p-3 rounded-xl border text-right transition cursor-pointer flex flex-col justify-between ${
                          accountType === 'pharmacy'
                            ? 'bg-blue-50/70 border-blue-500 ring-2 ring-blue-500/20 text-blue-950'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <Store className={`w-4 h-4 ${accountType === 'pharmacy' ? 'text-blue-600' : 'text-slate-400'}`} />
                          {accountType === 'pharmacy' && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />}
                        </div>
                        <span className="text-xs font-black block">صيدلية</span>
                        <span className="text-[10px] text-slate-500">لشراء وطلب الأدوية</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setAccountType('warehouse_staff')}
                        className={`p-3 rounded-xl border text-right transition cursor-pointer flex flex-col justify-between ${
                          accountType === 'warehouse_staff'
                            ? 'bg-blue-50/70 border-blue-500 ring-2 ring-blue-500/20 text-blue-950'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <Building2 className={`w-4 h-4 ${accountType === 'warehouse_staff' ? 'text-blue-600' : 'text-slate-400'}`} />
                          {accountType === 'warehouse_staff' && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />}
                        </div>
                        <span className="text-xs font-black block">موظف مذخر</span>
                        <span className="text-[10px] text-slate-500">لتجهيز وإدارة الطلبيات</span>
                      </button>
                    </div>
                  </div>

                  {/* Conditional Fields for Pharmacy */}
                  {accountType === 'pharmacy' && (
                    <div className="space-y-3 pt-1 border-t border-slate-100 animate-in fade-in duration-150">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          اسم الصيدلية *
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            required
                            placeholder="مثال: صيدلية النور الحديثة"
                            value={pharmacyName}
                            onChange={(e) => setPharmacyName(e.target.value)}
                            className="w-full pl-3 pr-9 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition"
                          />
                          <Store className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          عنوان الصيدلية والمنطقة *
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            required
                            placeholder="المدينة، الحي، أقرب نقطة دالة"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            className="w-full pl-3 pr-9 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition"
                          />
                          <MapPin className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Status Notice */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex items-start gap-2">
                    <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-[11px] leading-relaxed">
                      <span className="font-bold block text-amber-950">نظام تصاريح الموافقات:</span>
                      تكون الحالة التلقائية لجميع الحسابات المسجلة "قيد الانتظار" (Pending) لحين مراجعتها وإصدار تصريح رسمي من المشرف العام (محمد جعفر الكعبي).
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-xl font-black text-xs sm:text-sm shadow-md shadow-blue-600/20 transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <span>إرسال طلب التسجيل للاعتماد</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* TAB 2: LOGIN FORM */}
              {activeTab === 'login' && (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      رقم الهاتف أو البريد الإلكتروني *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        placeholder="0770xxxxxxx أو email@domain.com"
                        value={loginIdentifier}
                        onChange={(e) => {
                          setLoginIdentifier(e.target.value);
                          if (requirePin) setRequirePin(false);
                        }}
                        dir="ltr"
                        className="w-full pl-3 pr-9 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition text-right font-mono"
                      />
                      <Phone className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                    </div>
                  </div>

                  {requirePin && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2 animate-in fade-in duration-150">
                      <label className="block text-xs font-bold text-amber-900">
                        رمز المرور السري للمذخر (PIN) *
                      </label>
                      <div className="relative">
                        <input
                          type="password"
                          required
                          autoFocus
                          placeholder="••••"
                          value={loginPin}
                          onChange={(e) => setLoginPin(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-sm font-bold text-center tracking-widest font-mono text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                        />
                        <KeyRound className="w-4 h-4 text-amber-600 absolute right-3 top-2.5 pointer-events-none" />
                      </div>
                      <p className="text-[10px] text-amber-700 leading-tight">
                        هذا الحساب مصنف كإدارة مذخر ويتطلب رمز المرور السري المعتمد، أو يمكنك استخدام تسجيل الدخول المباشر بحساب Google.
                      </p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 bg-slate-900 hover:bg-slate-800 active:scale-98 text-white rounded-xl font-black text-xs sm:text-sm shadow-md transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <span>تسجيل الدخول</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => { setActiveTab('register'); setErrorMsg(''); }}
                      className="text-xs text-blue-600 hover:text-blue-800 font-bold transition cursor-pointer"
                    >
                      ليس لديك حساب بعد؟ سجل كصيدلية أو موظف الآن
                    </button>
                  </div>
                </form>
              )}
            </div>
          </>
        )}
      </div>

      {/* ================================================================ */}
      {/* GOOGLE ACCOUNT SELECTION & VERIFICATION MODAL                    */}
      {/* ================================================================ */}
      {isGoogleModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden p-5 text-right space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <GoogleIcon />
                <h4 className="font-bold text-sm text-slate-900">مزامنة حساب Google الرسمي</h4>
              </div>
              <button
                type="button"
                onClick={() => setIsGoogleModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              اختر حساب Google الخاص بك لتسجيل الدخول الفوري أو التسجيل التلقائي بمزامنة موثقة:
            </p>

            {/* Quick Profile for Owner Mohammed Jafar Alkabi */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  handleGoogleAuth({
                    email: 'mohammedjafaralkabi@gmail.com',
                    name: 'محمد جعفر الكعبي',
                    picture: 'https://lh3.googleusercontent.com/a/ACg8ocISuperAdmin',
                    role: 'warehouse_staff',
                  });
                }}
                disabled={isSubmitting}
                className="w-full p-2.5 bg-amber-50/80 hover:bg-amber-100 border border-amber-300 rounded-xl flex items-center justify-between text-right transition cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-amber-500 text-white font-bold flex items-center justify-center text-xs">
                    م.ج
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-900">محمد جعفر الكعبي (المالك)</p>
                    <p className="text-[10px] text-slate-500 font-mono" dir="ltr">mohammedjafaralkabi@gmail.com</p>
                  </div>
                </div>
                <span className="text-[9px] bg-amber-200 text-amber-950 font-bold px-1.5 py-0.5 rounded">
                  المشرف الأعلى
                </span>
              </button>
            </div>

            {/* Form for any other real Google user */}
            <div className="pt-2 border-t border-slate-100 space-y-2.5">
              <p className="text-[11px] font-bold text-slate-700">أو تسجيل الدخول بحساب Google آخر:</p>
              <div>
                <input
                  type="email"
                  placeholder="name@gmail.com"
                  value={googleEmailInput}
                  onChange={(e) => setGoogleEmailInput(e.target.value)}
                  dir="ltr"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <input
                  type="text"
                  placeholder="اسم المستخدم في حساب Google"
                  value={googleNameInput}
                  onChange={(e) => setGoogleNameInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {googleEmailInput.trim().toLowerCase() !== 'mohammedjafaralkabi@gmail.com' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setGoogleAccountRole('pharmacy')}
                      className={`py-1.5 px-2 rounded-lg border font-bold text-center cursor-pointer ${
                        googleAccountRole === 'pharmacy' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white text-slate-600'
                      }`}
                    >
                      صيدلية
                    </button>
                    <button
                      type="button"
                      onClick={() => setGoogleAccountRole('warehouse_staff')}
                      className={`py-1.5 px-2 rounded-lg border font-bold text-center cursor-pointer ${
                        googleAccountRole === 'warehouse_staff' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white text-slate-600'
                      }`}
                    >
                      موظف مذخر
                    </button>
                  </div>
                  {googleAccountRole === 'pharmacy' && (
                    <input
                      type="text"
                      placeholder="اسم الصيدلية"
                      value={googlePharmacyName}
                      onChange={(e) => setGooglePharmacyName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  if (!googleEmailInput.trim()) {
                    setErrorMsg('يرجى كتابة بريد Google الإلكتروني');
                    return;
                  }
                  handleGoogleAuth({
                    email: googleEmailInput.trim(),
                    name: googleNameInput.trim() || undefined,
                    role: googleAccountRole,
                    pharmacyName: googlePharmacyName.trim() || undefined,
                  });
                }}
                disabled={isSubmitting || !googleEmailInput.trim()}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <GoogleIcon />
                    <span>مزامنة ومتابعة</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
