import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  CheckCircle2, 
  RefreshCw, 
  LogOut, 
  MapPin, 
  User, 
  Store, 
  Building2, 
  Phone, 
  ShieldCheck,
  Sparkles,
  MessageCircle
} from 'lucide-react';
import { AppUser, WarehouseSettings } from '../types';
import { storage } from '../services/storage';

interface PendingApprovalScreenProps {
  user: AppUser;
  settings: WarehouseSettings;
  onApproved: (updatedUser: AppUser) => void;
  onLogout: () => void;
}

export const PendingApprovalScreen: React.FC<PendingApprovalScreenProps> = ({
  user,
  settings,
  onApproved,
  onLogout,
}) => {
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState<string>('');
  const [checkMessage, setCheckMessage] = useState<string>('');

  const isPharmacy = user.registrationAccountType === 'pharmacy' || user.role === 'pharmacy' || Boolean(user.pharmacyName && user.pharmacyName !== 'مذخر سامو للأدوية');

  // Manual Check Handler
  const handleCheckStatus = async () => {
    setIsChecking(true);
    setCheckMessage('');
    try {
      const cleanId = user.identifier || user.phone || user.email || '';
      const res = await fetch(`/api/auth/status?identifier=${encodeURIComponent(cleanId)}`);
      const data = await res.json();

      if (data.found && data.user) {
        if (data.user.status === 'approved') {
          setCheckMessage('تهانينا! تمت الموافقة على حسابك بنجاح. جاري الدخول...');
          setTimeout(() => {
            onApproved(data.user);
          }, 800);
          return;
        } else if (data.user.status === 'rejected' || data.user.status === 'deactivated') {
          setCheckMessage('تم رفض أو إلغاء تفعيل هذا الطلب من قبل الإدارة.');
        } else {
          setCheckMessage('طلبك لا يزال قيد الانتظار والمراجعة من قبل المشرف العام.');
        }
      } else {
        // Check local storage registered users
        const localUsers = storage.getRegisteredUsers();
        const found = localUsers.find(
          (u) =>
            u.id === user.id ||
            u.identifier.toLowerCase() === cleanId.toLowerCase() ||
            (u.phone && cleanId && u.phone.replace(/[^0-9]/g, '') === cleanId.replace(/[^0-9]/g, ''))
        );
        if (found && found.status === 'approved') {
          setCheckMessage('تمت الموافقة بنجاح! جاري تحويلك...');
          setTimeout(() => {
            onApproved(found);
          }, 800);
          return;
        }
        setCheckMessage('طلبك لا يزال قيد الانتظار والمراجعة.');
      }
    } catch {
      setCheckMessage('تعذر التحقق من الخادم، يرجى المحاولة بعد قليل.');
    } finally {
      setIsChecking(false);
      setLastCheckTime(new Date().toLocaleTimeString('ar-IQ'));
    }
  };

  // Real-time SSE listener for instant unlock when admin clicks "موافقة"
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/events');
      
      es.addEventListener('user_approved', (e: MessageEvent) => {
        try {
          const approvedUser = JSON.parse(e.data) as AppUser;
          const currentIdentifier = (user.identifier || user.phone || user.email || '').toLowerCase();
          const targetIdentifier = (approvedUser.identifier || approvedUser.phone || approvedUser.email || '').toLowerCase();
          
          if (
            approvedUser.id === user.id ||
            (currentIdentifier && targetIdentifier && currentIdentifier === targetIdentifier)
          ) {
            onApproved(approvedUser);
          }
        } catch (err) {
          console.error('Error handling approval SSE:', err);
        }
      });
    } catch {
      // ignore
    }

    // Periodic check every 8 seconds as a reliable background fallback
    const interval = setInterval(() => {
      handleCheckStatus();
    }, 8000);

    return () => {
      es?.close();
      clearInterval(interval);
    };
  }, [user]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 selection:bg-blue-600 selection:text-white" dir="rtl">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Top Header Card */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6 sm:p-7 text-center relative">
          <div className="relative inline-block mb-3">
            <div className="w-16 h-16 bg-amber-500/20 border-2 border-amber-400 rounded-3xl mx-auto flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/20 animate-pulse">
              <Clock className="w-8 h-8 shrink-0" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-amber-500 text-white rounded-full flex items-center justify-center text-xs font-bold ring-4 ring-slate-900">
              ⏳
            </div>
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            طلبك قيد المراجعة والاعتماد
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-2 leading-relaxed max-w-sm mx-auto">
            تم استلام بيانات تسجيلك بنجاح، وحسابك بانتظار موافقة المشرف العام لمذخر سامو
            <span className="text-amber-300 font-bold block mt-0.5">(محمد جعفر الكعبي)</span>
          </p>
        </div>

        {/* Request Details Card */}
        <div className="p-5 sm:p-6 space-y-4">
          
          {/* Account Category Banner */}
          <div className={`p-3.5 rounded-2xl border flex items-center gap-3 ${
            isPharmacy 
              ? 'bg-blue-50/70 border-blue-200 text-blue-950' 
              : 'bg-amber-50/70 border-amber-200 text-amber-950'
          }`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              isPharmacy ? 'bg-blue-600 text-white' : 'bg-amber-500 text-white'
            }`}>
              {isPharmacy ? <Store className="w-5 h-5" /> : <Building2 className="w-5 h-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black">
                  {isPharmacy ? 'نوع الحساب: حساب صيدلية' : 'نوع الحساب: حساب موظف مذخر'}
                </span>
                <span className="text-[10px] bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded-full">
                  قيد الانتظار
                </span>
              </div>
              <p className="text-[11px] text-slate-600 truncate mt-0.5">
                {isPharmacy 
                  ? 'طلب مصادقة للوصول إلى كتالوج الأدوية وطلب المواد مباشرة' 
                  : 'طلب مصادقة للوصول إلى لوحة إدارة المذخر وتجهيز الطلبيات'}
              </p>
            </div>
          </div>

          {/* Submitted Information Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5 text-xs text-slate-700">
            <h4 className="font-black text-slate-900 text-xs border-b border-slate-200 pb-2 flex items-center gap-1.5">
              <User className="w-4 h-4 text-slate-500" />
              <span>البيانات المقدمة في الطلب:</span>
            </h4>

            {isPharmacy && user.pharmacyName && (
              <div className="flex items-center justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">اسم الصيدلية:</span>
                <strong className="text-blue-700 font-black">{user.pharmacyName}</strong>
              </div>
            )}

            {isPharmacy && user.address && (
              <div className="flex items-start justify-between py-1 border-b border-slate-200/60 gap-3">
                <span className="text-slate-500 shrink-0">عنوان الصيدلية:</span>
                <span className="font-medium text-slate-900 text-left" dir="auto">{user.address}</span>
              </div>
            )}

            <div className="flex items-center justify-between py-1 border-b border-slate-200/60">
              <span className="text-slate-500">{isPharmacy ? 'اسم الصيدلاني / المسؤول:' : 'اسم موظف المذخر:'}</span>
              <strong className="text-slate-900">{user.name}</strong>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-slate-500">رقم الهاتف المسجل:</span>
              <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-300" dir="ltr">
                {user.phone || user.identifier}
              </span>
            </div>
          </div>

          {/* Feedback or Notification message */}
          {checkMessage && (
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
              <span>{checkMessage}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={handleCheckStatus}
              disabled={isChecking}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white text-xs font-black rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
              <span>{isChecking ? 'جاري التحقق من الموافقة...' : 'التحقق من حالة الموافقة الآن 🔄'}</span>
            </button>

            {/* WhatsApp Contact with Management */}
            {settings.phone && (
              <a
                href={`https://api.whatsapp.com/send?phone=${settings.phone.replace(/[^0-9]/g, '')}&text=${encodeURIComponent(
                  `السلام عليكم، قمت بتسجيل طلب حساب جديد في مذخر سامو باسم: ${user.name} (${user.pharmacyName || 'موظف مذخر'}). يرجى الموافقة على الحساب وشكراً.`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                <span>إشعار الإدارة عبر الواتساب لتسريع التفعيل</span>
              </a>
            )}

            {/* Logout button to re-register or use another account */}
            <button
              type="button"
              onClick={onLogout}
              className="w-full py-2 text-slate-500 hover:text-slate-800 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer pt-2"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>تسجيل الخروج أو التسجيل بحساب آخر</span>
            </button>
          </div>

          {lastCheckTime && (
            <p className="text-[10px] text-center text-slate-400">
              آخر فحص تلقائي للحالة: {lastCheckTime} • يتم التحديث اللحظي فور قيام الإدارة بالموافقة.
            </p>
          )}

        </div>
      </div>
    </div>
  );
};
