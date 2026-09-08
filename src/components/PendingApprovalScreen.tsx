import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  ShieldCheck, 
  RefreshCw, 
  LogOut, 
  Mail, 
  User, 
  AlertCircle,
  Building2,
  Phone,
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import { AppUser, WarehouseSettings } from '../types';
import { subscribeToUser, signOutFirebase } from '../services/firebase';
import { storage } from '../services/storage';

interface PendingApprovalScreenProps {
  user: AppUser;
  settings?: WarehouseSettings;
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
  const [statusNote, setStatusNote] = useState<string>('');

  // Real-time synchronization: Firestore + SSE + Polling for instant seamless transition
  useEffect(() => {
    let isMounted = true;

    const handleApprovalTransition = (approvedUser: AppUser) => {
      if (!isMounted) return;
      const finalUser: AppUser = {
        ...user,
        ...approvedUser,
        status: 'approved',
        role: approvedUser.role && approvedUser.role !== 'pending' ? approvedUser.role : 'pharmacy',
      };
      storage.setCurrentUser(finalUser);
      onApproved(finalUser);
    };

    // 1. Firestore live document listener
    let unsubscribeFirestore = () => {};
    if (user?.id) {
      unsubscribeFirestore = subscribeToUser(user.id, (liveUser) => {
        if (!liveUser) return;
        if (liveUser.status === 'approved') {
          handleApprovalTransition(liveUser);
        }
      });
    }

    // 2. Server-Sent Events (SSE) listener
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/events');
      const handleSseMessage = (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          const target = payload.data || payload;
          if (
            (target.id && user.id && target.id === user.id) ||
            (target.identifier && user.identifier && target.identifier.toLowerCase() === user.identifier.toLowerCase()) ||
            (target.email && user.email && target.email.toLowerCase() === user.email.toLowerCase())
          ) {
            if (target.status === 'approved' || (target.role && target.role !== 'pending')) {
              handleApprovalTransition(target);
            }
          }
        } catch {}
      };

      eventSource.addEventListener('user_approved', handleSseMessage);
      eventSource.addEventListener('user_updated', handleSseMessage);
    } catch {}

    // 3. Fast status check poll every 2.5 seconds
    const pollInterval = setInterval(async () => {
      try {
        const queryParams = new URLSearchParams();
        if (user.id) queryParams.set('id', user.id);
        if (user.identifier) queryParams.set('identifier', user.identifier);
        if (user.email) queryParams.set('email', user.email);

        const res = await fetch(`/api/auth/status?${queryParams.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (data.found && data.user && data.user.status === 'approved') {
            handleApprovalTransition(data.user);
          }
        }
      } catch {}
    }, 2500);

    return () => {
      isMounted = false;
      unsubscribeFirestore();
      if (eventSource) {
        eventSource.close();
      }
      clearInterval(pollInterval);
    };
  }, [user, onApproved]);

  const handleManualRefresh = async () => {
    setIsChecking(true);
    setStatusNote('جاري فحص حالة الحساب في الخادم المركزي وقاعدة البيانات...');
    try {
      const queryParams = new URLSearchParams();
      if (user.id) queryParams.set('id', user.id);
      if (user.identifier) queryParams.set('identifier', user.identifier);
      if (user.email) queryParams.set('email', user.email);

      const res = await fetch(`/api/auth/status?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.found && data.user && data.user.status === 'approved') {
          const finalUser: AppUser = {
            ...user,
            ...data.user,
            status: 'approved',
            role: data.user.role && data.user.role !== 'pending' ? data.user.role : 'pharmacy',
          };
          storage.setCurrentUser(finalUser);
          onApproved(finalUser);
          return;
        }
      }
      setStatusNote('الحساب لا يزال قيد التدقيق والمراجعة من قبل إدارة المذخر. سيتم فتح واجهة الصيدلية تلقائياً فور اعتمادك.');
    } catch {
      setStatusNote('تعذر الاتصال بالخادم حالياً. يرجى المحاولة بعد لحظات.');
    } finally {
      setIsChecking(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutFirebase();
    } catch {}
    storage.setCurrentUser(null);
    onLogout();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Soft background glow */}
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 text-center space-y-6 shadow-xl relative z-10">
        {/* Animated Status Icon */}
        <div className="relative mx-auto w-20 h-20">
          <div className="w-20 h-20 rounded-3xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center shadow-sm shadow-amber-500/10">
            <Clock className="w-10 h-10 animate-pulse" />
          </div>
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center text-white ring-4 ring-white">
            <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
          </div>
        </div>

        {/* Title & Description */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold border border-amber-200">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>طلب الحساب مسجل وقيد المراجعة</span>
          </div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">
            حسابك قيد التدقيق والموافقة
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto">
            مرحباً بك! تم حفظ طلبك بنجاح في نظام مذخر سامو، وهو الآن قيد التدقيق والاعتماد الأمني من قِبل إدارة المذخر المركزية.
          </p>
        </div>

        {/* User Card */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-right space-y-2.5">
          <div className="flex items-center gap-3">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="w-11 h-11 rounded-xl object-cover border border-slate-200 shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm shrink-0 border border-blue-200">
                {user.name ? user.name.charAt(0) : 'U'}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-slate-900 truncate">{user.pharmacyName || user.name || 'حساب صيدلية مسجل'}</div>
              <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                {user.phone ? (
                  <>
                    <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                    <span dir="ltr" className="truncate">{user.phone}</span>
                  </>
                ) : (
                  <>
                    <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                    <span dir="ltr" className="truncate">{user.email || user.identifier}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
            <span>الحالة الحالية:</span>
            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold border border-amber-200">
              قيد الانتظار (Pending)
            </span>
          </div>
        </div>

        {/* Real-time sync note */}
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-right">
          <div className="flex items-start gap-2.5 text-xs text-emerald-800 leading-relaxed font-medium">
            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              تم حفظ تسجيل دخولك على هذا الجهاز. بمجرد موافقة إدارة المذخر، ستفتح لك بوابة الصيدلية فوراً ومباشرة من الرابط دون الحاجة لإعادة تسجيل الدخول!
            </span>
          </div>
        </div>

        {statusNote && (
          <div className="text-xs text-slate-700 bg-slate-100 p-2.5 rounded-xl border border-slate-200 animate-fadeIn">
            {statusNote}
          </div>
        )}

        {/* Controls */}
        <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
          <button
            id="btn-check-pending-status"
            type="button"
            disabled={isChecking}
            onClick={handleManualRefresh}
            className="w-full sm:flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
            <span>تحديث حالة الموافقة</span>
          </button>

          <button
            id="btn-pending-logout"
            type="button"
            onClick={handleSignOut}
            className="w-full sm:w-auto py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 border border-slate-200"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </div>
    </div>
  );
};
