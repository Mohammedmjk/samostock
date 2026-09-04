import React, { useEffect, useState } from 'react';
import { AppUser } from '../types';
import { storage } from '../services/storage';
import { Clock, ShieldCheck, CheckCircle, RefreshCw, LogOut, Phone, Building2, User, Mail, ShieldAlert } from 'lucide-react';

interface AccountUnderReviewScreenProps {
  user: AppUser;
  onApproved: (updatedUser: AppUser) => void;
  onSignOut: () => void;
}

export const AccountUnderReviewScreen: React.FC<AccountUnderReviewScreenProps> = ({
  user,
  onApproved,
  onSignOut,
}) => {
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('طلبك قيد المراجعة والتدقيق من قبل إدارة المذخر المركزية.');

  const checkStatus = async () => {
    setIsChecking(true);
    try {
      // 1. Check server status
      const cleanId = encodeURIComponent(user.email || user.identifier || user.phone || '');
      const res = await fetch(`/api/auth/status?identifier=${cleanId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.found && data.user) {
          if (data.user.status === 'approved') {
            storage.setCurrentUser(data.user);
            storage.updateUser(data.user);
            onApproved(data.user);
            return;
          } else if (data.user.status === 'rejected' || data.user.status === 'deactivated') {
            setStatusMessage('تم رفض أو إلغاء تنشيط طلب التسجيل من قبل الإدارة. يرجى التواصل هاتفياً مع إدارة المذخر.');
          }
        }
      }

      // 2. Check local storage
      const localUsers = storage.getRegisteredUsers();
      const localMatch = localUsers.find(
        u => u.id === user.id || u.identifier === user.identifier || (user.email && u.email === user.email)
      );
      if (localMatch && localMatch.status === 'approved') {
        storage.setCurrentUser(localMatch);
        onApproved(localMatch);
      }
    } catch (err) {
      console.warn('Status check warning:', err);
    } finally {
      setIsChecking(false);
    }
  };

  // SSE & periodic polling for instantaneous unlocking the moment admin clicks [Approve]
  useEffect(() => {
    const interval = setInterval(() => {
      checkStatus();
    }, 4000);

    // Also connect to SSE
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/events');
      eventSource.addEventListener('user_approved', (e: MessageEvent) => {
        try {
          const approvedUser = JSON.parse(e.data);
          if (
            approvedUser.id === user.id ||
            approvedUser.identifier === user.identifier ||
            (user.email && approvedUser.email === user.email)
          ) {
            storage.setCurrentUser(approvedUser);
            storage.updateUser(approvedUser);
            onApproved(approvedUser);
          }
        } catch {}
      });
    } catch {}

    return () => {
      clearInterval(interval);
      if (eventSource) eventSource.close();
    };
  }, [user]);

  const roleLabelMap: Record<string, string> = {
    super_admin: 'مدير عام متميز (Super Admin)',
    warehouse_manager: 'مدير مستودع ومخازن',
    pharmacist_staff: 'كادر صيدلي وتجهيز',
    auditor_readonly: 'مدقق حسابات (قراءة فقط)',
    pharmacy: 'صيدلية عميل',
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-950/80 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
        {/* Decorative ambient background */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Status Icon */}
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-4">
            <div className="w-20 h-20 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/5">
              <Clock className="w-10 h-10 animate-pulse" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-slate-900 border-2 border-slate-950 flex items-center justify-center text-amber-400">
              <ShieldAlert className="w-3.5 h-3.5" />
            </div>
          </div>

          <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full mb-2">
            قيد الانتظار (Pending)
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-white mb-2">
            تم استلام طلب التسجيل وهو قيد المراجعة من إدارة المذخر
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md leading-relaxed mb-6">
            أهلاً بك يا {user.name}. تم تسجيل بياناتك بنجاح، وسيقوم المشرف العام بمراجعة الطلب والموافقة على الصلاحيات لتتمكن من الوصول للنظام.
          </p>
        </div>

        {/* Applicant Details Summary Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 mb-6 space-y-3">
          <div className="flex items-center justify-between text-xs pb-2.5 border-b border-slate-800 text-slate-300">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-400" />
              المؤسسة / الصيدلية:
            </span>
            <strong className="text-white">{user.pharmacyName}</strong>
          </div>

          <div className="flex items-center justify-between text-xs pb-2.5 border-b border-slate-800 text-slate-300">
            <span className="text-slate-400 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-emerald-400" />
              الدور المطلوب:
            </span>
            <span className="bg-slate-800 text-blue-300 px-2 py-0.5 rounded font-medium text-[11px]">
              {roleLabelMap[user.requestedRole || user.role] || user.role}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs pb-2.5 border-b border-slate-800 text-slate-300">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-purple-400" />
              معرف الدخول:
            </span>
            <strong dir="ltr" className="font-mono text-white text-xs">{user.identifier}</strong>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-300">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              تاريخ تقديم الطلب:
            </span>
            <span dir="ltr" className="font-mono text-slate-400 text-[11px]">
              {new Date(user.createdAt).toLocaleString('ar-IQ')}
            </span>
          </div>
        </div>

        {/* Polling status & Live update hint */}
        <div className="flex items-center justify-between bg-blue-950/40 border border-blue-800/40 rounded-xl px-4 py-3 mb-6 text-xs text-blue-300">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
            </span>
            <span>يتم التحديث المباشر فور اعتماد حسابك</span>
          </div>

          <button
            type="button"
            onClick={checkStatus}
            disabled={isChecking}
            className="text-xs text-blue-400 hover:text-white flex items-center gap-1 cursor-pointer transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
            <span>فحص الآن</span>
          </button>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <button
            type="button"
            onClick={onSignOut}
            className="w-full py-3 rounded-xl border border-slate-800 hover:bg-slate-900 text-slate-300 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>تسجيل الخروج أو الدخول بحساب آخر</span>
          </button>
        </div>
      </div>
    </div>
  );
};
