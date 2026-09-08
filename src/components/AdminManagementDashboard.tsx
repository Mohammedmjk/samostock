import React, { useEffect, useState } from 'react';
import { AppUser, UserRole, UserAccessStatus, SUPER_ADMIN_EMAILS, AuthorizationRequestMessage } from '../types';
import { storage } from '../services/storage';
import { subscribeToAllUsers, blockUserAccount, unblockUserAccount, deleteUserAccount } from '../services/firebase';
import {
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  Users,
  Search,
  CheckCircle2,
  XCircle,
  Bell,
  Send,
  RefreshCw,
  Clock,
  Building2,
  Mail,
  Phone,
  Key,
  Shield,
  AlertTriangle,
  FileSpreadsheet,
  Inbox,
  Store,
  Check,
  Copy,
  Ban,
  Trash2,
  UserCheck2,
  BadgeCheck
} from 'lucide-react';

interface AdminManagementDashboardProps {
  currentUser: AppUser;
  onUserApprovedOrUpdated?: (user: AppUser) => void;
}

const ROLES_INFO: { role: UserRole; label: string; desc: string; badgeColor: string }[] = [
  {
    role: 'super_admin',
    label: 'مدير عام متميز (Super Admin)',
    desc: 'صلاحيات مطلقة: إدارة المستخدمين، التسويات الجردية، إعدادات النظام وتغيير الرمز',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  {
    role: 'warehouse_manager',
    label: 'مدير مستودع ومخازن',
    desc: 'إدارة المخزون، صرف الطلبيات، إضافة وجبات وتشغيلات جديدة، تسوية الجرد بمحضر',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  {
    role: 'pharmacist_staff',
    label: 'كادر صيدلي وتجهيز',
    desc: 'تجهيز الطلبات، مسح الباركود السريع، فحص تواريخ الانتهاء ورصيد التشغيلات',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    role: 'auditor_readonly',
    label: 'مدقق حسابات (قراءة فقط)',
    desc: 'معاينة المخزون والتقارير المالية وحركات التدقيق دون صلاحية الحذف أو التعديل',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
  },
];

export const AdminManagementDashboard: React.FC<AdminManagementDashboardProps> = ({
  currentUser,
  onUserApprovedOrUpdated,
}) => {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [authMessages, setAuthMessages] = useState<AuthorizationRequestMessage[]>([]);
  const [activeTab, setActiveTab] = useState<'pending' | 'authorizations' | 'staff' | 'active' | 'notifications'>('pending');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [notificationTestStatus, setNotificationTestStatus] = useState<{
    running: boolean;
    success?: boolean;
    message?: string;
  }>({ running: false });

  // Modal for changing user role or reviewing
  const [selectedUserForAction, setSelectedUserForAction] = useState<AppUser | null>(null);
  const [assignedRole, setAssignedRole] = useState<UserRole>('pharmacist_staff');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch users and authorization messages in parallel
      const [usersRes, msgsRes] = await Promise.allSettled([
        fetch('/api/auth/users'),
        fetch('/api/auth/authorization-messages'),
      ]);

      if (usersRes.status === 'fulfilled' && usersRes.value.ok) {
        const data = await usersRes.value.json();
        if (Array.isArray(data.users)) {
          setUsers(data.users);
          storage.saveRegisteredUsers(data.users);
        }
      } else {
        setUsers(storage.getRegisteredUsers());
      }

      if (msgsRes.status === 'fulfilled' && msgsRes.value.ok) {
        const data = await msgsRes.value.json();
        if (Array.isArray(data.messages)) {
          setAuthMessages(data.messages);
          storage.saveAuthorizationMessages(data.messages);
        }
      } else {
        setAuthMessages(storage.getAuthorizationMessages());
      }
    } catch (err) {
      console.warn('Error fetching data from server, falling back to storage:', err);
      setUsers(storage.getRegisteredUsers());
      setAuthMessages(storage.getAuthorizationMessages());
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Subscribe to Firestore users collection exclusively
    const unsubscribeFirestore = subscribeToAllUsers((firestoreUsers) => {
      setUsers(firestoreUsers);
    });

    // Listen to real-time events via SSE
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/events');
      
      eventSource.addEventListener('new_user_registration', (e: MessageEvent) => {
        try {
          const newUser = JSON.parse(e.data);
          setUsers(prev => {
            if (prev.some(u => u.id === newUser.id)) return prev;
            return [newUser, ...prev];
          });
        } catch {}
      });

      eventSource.addEventListener('new_authorization_message', (e: MessageEvent) => {
        try {
          const newMsg = JSON.parse(e.data) as AuthorizationRequestMessage;
          setAuthMessages(prev => [newMsg, ...prev.filter(m => m.id !== newMsg.id)]);
          storage.addAuthorizationMessage(newMsg);
        } catch {}
      });

      eventSource.addEventListener('authorization_message_updated', (e: MessageEvent) => {
        try {
          const updatedMsg = JSON.parse(e.data) as AuthorizationRequestMessage;
          setAuthMessages(prev => prev.map(m => (m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m)));
          storage.addAuthorizationMessage(updatedMsg);
        } catch {}
      });

      eventSource.addEventListener('user_updated', (e: MessageEvent) => {
        try {
          const updated = JSON.parse(e.data);
          setUsers(prev => prev.map(u => (u.id === updated.id ? { ...u, ...updated } : u)));
        } catch {}
      });
    } catch {}

    return () => {
      if (eventSource) eventSource.close();
      if (unsubscribeFirestore) unsubscribeFirestore();
    };
  }, []);

  const pendingUsers = users.filter(u => u.status === 'pending');
  const activeUsers = users.filter(u => u.status === 'approved');
  const staffUsers = users.filter(u => 
    u.role === 'pharmacist_staff' || 
    u.requestedRole === 'pharmacist_staff' || 
    u.role === 'warehouse_manager' ||
    (u.pharmacyName && u.pharmacyName.includes('كادر')) ||
    (u.approvedBy && u.approvedBy.includes('staff2026'))
  );
  const pendingAuthMessages = authMessages.filter(m => m.status === 'pending');

  const handleBlockUser = async (user: AppUser) => {
    if (!window.confirm(`هل أنت متأكد من حظر المستخدم: ${user.name}؟ سيتم إنهاء جلسته وطرده فوراً من النظام.`)) {
      return;
    }
    setIsProcessing(true);
    try {
      await blockUserAccount(user.id);
      setUsers(prev => prev.map(u => (u.id === user.id ? { ...u, status: 'blocked' } : u)));
    } catch (err: any) {
      alert(err.message || 'فشل حظر المستخدم');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUnblockUser = async (user: AppUser) => {
    setIsProcessing(true);
    try {
      await unblockUserAccount(user.id);
      setUsers(prev => prev.map(u => (u.id === user.id ? { ...u, status: 'approved' } : u)));
    } catch (err: any) {
      alert(err.message || 'فشل إلغاء الحظر');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteUser = async (user: AppUser) => {
    if (!window.confirm(`تحذير أمني: هل أنت متأكد من طرد وحذف المستخدم: ${user.name} نهائياً من قاعدة البيانات؟ لا يمكن التراجع عن هذا الإجراء.`)) {
      return;
    }
    setIsProcessing(true);
    try {
      await deleteUserAccount(user.id);
      setUsers(prev => prev.filter(u => u.id !== user.id));
    } catch (err: any) {
      alert(err.message || 'فشل حذف المستخدم');
    } finally {
      setIsProcessing(false);
    }
  };

  const copyText = (txt: string, id: string) => {
    try {
      navigator.clipboard.writeText(txt);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  const handleApprove = async (user: AppUser, roleToAssign?: UserRole) => {
    setIsProcessing(true);
    const targetRole = roleToAssign || user.requestedRole || user.role || 'pharmacist_staff';

    try {
      // 1. Call server API
      const res = await fetch('/api/auth/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          identifier: user.identifier,
          role: targetRole,
          approvedBy: currentUser.name || 'Super Admin',
        }),
      });

      let approved = user;
      if (res.ok) {
        const data = await res.json();
        if (data.user) approved = data.user;
      } else {
        // Fallback local update
        const updatedLocal = storage.approveUser(user.id, targetRole, currentUser.name);
        if (updatedLocal) approved = updatedLocal;
      }

      setUsers(prev => prev.map(u => (u.id === user.id ? { ...u, status: 'approved', role: targetRole } : u)));
      setAuthMessages(prev =>
        prev.map(m =>
          m.userId === user.id || m.identifier.toLowerCase() === user.identifier.toLowerCase()
            ? { ...m, status: 'approved', reviewedAt: new Date().toISOString(), reviewedBy: currentUser.name }
            : m
        )
      );
      setSelectedUserForAction(null);
      onUserApprovedOrUpdated?.(approved);
    } catch (err) {
      console.error('Approval failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApproveAuthMessage = async (msg: AuthorizationRequestMessage) => {
    setIsProcessing(true);
    try {
      const targetRole = msg.requestedRole || (msg.pharmacyName ? 'pharmacy' : 'pharmacist_staff');
      const res = await fetch('/api/auth/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: msg.userId,
          identifier: msg.identifier,
          role: targetRole,
          approvedBy: currentUser.name || 'Super Admin',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUsers(prev => prev.map(u => (u.id === data.user.id ? data.user : u)));
          onUserApprovedOrUpdated?.(data.user);
        }
      }

      setAuthMessages(prev =>
        prev.map(m =>
          m.id === msg.id
            ? { ...m, status: 'approved', reviewedAt: new Date().toISOString(), reviewedBy: currentUser.name }
            : m
        )
      );
      storage.updateAuthorizationMessageStatus(msg.id, 'approved', currentUser.name);
    } catch (err) {
      console.error('Approval from message failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectAuthMessage = async (msg: AuthorizationRequestMessage) => {
    if (!window.confirm(`هل أنت متأكد من رفض تصريح المستخدم: ${msg.userName}؟`)) return;
    setIsProcessing(true);
    try {
      await fetch('/api/auth/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: msg.userId,
          identifier: msg.identifier,
          status: 'rejected',
        }),
      });

      setAuthMessages(prev =>
        prev.map(m =>
          m.id === msg.id
            ? { ...m, status: 'rejected', reviewedAt: new Date().toISOString(), reviewedBy: currentUser.name }
            : m
        )
      );
      storage.updateAuthorizationMessageStatus(msg.id, 'rejected', currentUser.name);
    } catch (err) {
      console.error('Reject message error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectOrDeactivate = async (user: AppUser, status: 'rejected' | 'deactivated') => {
    if (!window.confirm(`هل أنت متأكد من ${status === 'rejected' ? 'رفض' : 'تعطيل'} حساب المستخدم: ${user.name}؟`)) {
      return;
    }

    setIsProcessing(true);
    try {
      await fetch('/api/auth/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          identifier: user.identifier,
          status,
        }),
      });

      storage.updateUserStatus(user.id, status);
      setUsers(prev => prev.map(u => (u.id === user.id ? { ...u, status } : u)));
      setAuthMessages(prev =>
        prev.map(m =>
          m.userId === user.id || m.identifier.toLowerCase() === user.identifier.toLowerCase()
            ? { ...m, status: 'rejected', reviewedAt: new Date().toISOString(), reviewedBy: currentUser.name }
            : m
        )
      );
      setSelectedUserForAction(null);
    } catch (err) {
      console.error('Status change error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTestNotification = async () => {
    setNotificationTestStatus({ running: true });
    try {
      const res = await fetch('/api/admin/test-notification', { method: 'POST' });
      const data = await res.json();
      setNotificationTestStatus({
        running: false,
        success: data.success,
        message: data.message || (data.success ? 'تم إرسال الإشعار التجريبي' : 'فشل إرسال الإشعار'),
      });
    } catch (err: any) {
      setNotificationTestStatus({
        running: false,
        success: false,
        message: err.message || 'حدث خطأ بالاتصال بالسيرفر',
      });
    }
  };

  const filteredList = (
    activeTab === 'pending'
      ? pendingUsers
      : activeTab === 'staff'
      ? staffUsers
      : activeTab === 'active'
      ? activeUsers
      : users
  ).filter(u => {
    const matchesSearch =
      !searchQuery ||
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.pharmacyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.identifier.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (u.phone && u.phone.includes(searchQuery));

    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter || u.requestedRole === roleFilter;

    if (activeTab === 'active') {
      return matchesSearch && matchesRole && u.status === 'approved';
    }
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute -left-10 -bottom-10 w-48 h-48 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center shrink-0 shadow-lg shadow-purple-900/30">
              <Shield className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black">لوحة الإشراف العليا وإدارة الصلاحيات (RBAC)</h1>
                <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-bold px-2.5 py-0.5 rounded-full">
                  Super Admin
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                الموافقة على طلبات التسجيل، تخصيص أدوار الكادر، ومراقبة إشعارات التليجرام الفورية
              </p>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3">
            <div className="bg-slate-800/80 border border-slate-700/80 px-4 py-2.5 rounded-2xl text-center min-w-24">
              <span className="text-[11px] text-amber-400 block font-bold">تسجيلات معلقة</span>
              <span className="text-xl font-black text-white font-mono">{pendingUsers.length}</span>
            </div>
            <div className="bg-slate-800/80 border border-slate-700/80 px-4 py-2.5 rounded-2xl text-center min-w-24">
              <span className="text-[11px] text-rose-400 block font-bold">رسائل التصاريح</span>
              <span className="text-xl font-black text-white font-mono">{pendingAuthMessages.length}</span>
            </div>
            <div className="bg-slate-800/80 border border-slate-700/80 px-4 py-2.5 rounded-2xl text-center min-w-24">
              <span className="text-[11px] text-emerald-400 block font-bold">حسابات نشطة</span>
              <span className="text-xl font-black text-white font-mono">{activeUsers.length}</span>
            </div>
            <button
              type="button"
              onClick={loadData}
              disabled={isLoading}
              className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-2xl border border-slate-700 transition cursor-pointer"
              title="تحديث البيانات"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs & Filters */}
      <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-100 pb-4">
          {/* Tabs */}
          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTab('authorizations')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'authorizations'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Inbox className="w-4 h-4" />
              <span>رسائل التصاريح الواردة</span>
              {pendingAuthMessages.length > 0 && (
                <span className="bg-rose-500 text-white text-[11px] px-2 py-0.5 rounded-full font-mono font-black animate-pulse">
                  {pendingAuthMessages.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('pending')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'pending'
                  ? 'bg-amber-500 text-slate-950 shadow-sm shadow-amber-500/20'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>طلبات التسجيل المعلقة</span>
              {pendingUsers.length > 0 && (
                <span className="bg-amber-950 text-amber-300 text-[11px] px-1.5 py-0.2 rounded-full font-mono">
                  {pendingUsers.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('staff')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'staff'
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>كادر الموظفين</span>
              <span className="bg-emerald-950/40 text-emerald-200 text-[11px] px-2 py-0.5 rounded-full font-mono font-bold">
                {staffUsers.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('active')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'active'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Store className="w-4 h-4" />
              <span>جميع الحسابات النشطة ({activeUsers.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('notifications')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'notifications'
                  ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/20'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Bell className="w-4 h-4" />
              <span>إشعارات الإدارة المباشرة</span>
            </button>
          </div>

          {/* Search Bar */}
          {activeTab !== 'notifications' && (
            <div className="w-full sm:w-72 relative">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="بحث بالاسم، الصيدلية، الهاتف..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-3 pr-9 py-2 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            </div>
          )}
        </div>

        {/* Tab Content */}
        {activeTab === 'authorizations' ? (
          <div className="space-y-4">
            {authMessages.length === 0 ? (
              <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-3">
                <Inbox className="w-12 h-12 text-slate-300 stroke-[1.5]" />
                <p className="font-bold text-slate-700">لا توجد رسائل تصاريح واردة حالياً</p>
                <p className="text-xs text-slate-400">
                  عند قيام أي مستخدم بإرسال طلب تصريح تسجيل دخول أو تسجيل حساب، ستصل رسالته هنا فوراً مع إمكانية الاعتماد بضغطة زر.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {authMessages.map(msg => {
                  const isPending = msg.status === 'pending';
                  const isLoginReq = msg.type === 'login_request';

                  return (
                    <div
                      key={msg.id}
                      className={`border rounded-2xl p-4 sm:p-5 transition shadow-2xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                        isPending
                          ? 'bg-blue-50/40 border-blue-200 hover:border-blue-300'
                          : msg.status === 'approved'
                          ? 'bg-white border-emerald-200'
                          : 'bg-white border-slate-200 opacity-70'
                      }`}
                    >
                      {/* Left: Message Information */}
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span
                            className={`text-[11px] font-black px-2.5 py-1 rounded-lg border flex items-center gap-1 ${
                              isLoginReq
                                ? 'bg-blue-100 text-blue-900 border-blue-300'
                                : 'bg-purple-100 text-purple-900 border-purple-300'
                            }`}
                          >
                            <Send className="w-3 h-3" />
                            <span>{isLoginReq ? 'طلب تصريح تسجيل دخول' : 'طلب تسجيل حساب جديد'}</span>
                          </span>

                          <h4 className="font-black text-slate-900 text-sm sm:text-base">{msg.userName}</h4>

                          {/* Reference ID Pill */}
                          <div className="flex items-center gap-1 bg-white border border-slate-200 px-2 py-0.5 rounded-md text-xs font-mono font-bold text-slate-800">
                            <span>{msg.requestId}</span>
                            <button
                              type="button"
                              onClick={() => copyText(msg.requestId, msg.id)}
                              className="text-slate-400 hover:text-slate-700 cursor-pointer"
                              title="نسخ رقم المرجع"
                            >
                              {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>

                          {/* Status Pill */}
                          {isPending ? (
                            <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                              بانتظار الاعتماد
                            </span>
                          ) : msg.status === 'approved' ? (
                            <span className="bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-black px-2 py-0.5 rounded-full">
                              تم منح التصريح ✅
                            </span>
                          ) : (
                            <span className="bg-rose-100 text-rose-900 border border-rose-300 text-[10px] font-black px-2 py-0.5 rounded-full">
                              مرفوض ❌
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-600 pt-1">
                          <div className="flex items-center gap-1.5">
                            <Store className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span className="font-bold text-slate-800 truncate">{msg.pharmacyName || 'مذخر سامو'}</span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span dir="ltr" className="font-mono font-bold">{msg.phone || msg.identifier}</span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span dir="ltr" className="font-mono text-slate-500">
                              {new Date(msg.createdAt).toLocaleString('ar-IQ')}
                            </span>
                          </div>
                        </div>

                        {msg.notes && (
                          <p className="text-[11px] text-slate-500 bg-white/80 p-2 rounded-xl border border-slate-200/80 leading-relaxed">
                            <span className="font-bold text-slate-700">ملاحظات الطلب:</span> {msg.notes}
                          </p>
                        )}
                      </div>

                      {/* Right: Quick Action Buttons */}
                      <div className="flex items-center gap-2 w-full md:w-auto shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 justify-end">
                        {isPending ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleApproveAuthMessage(msg)}
                              disabled={isProcessing}
                              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md shadow-emerald-600/20 transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50 active:scale-98"
                            >
                              <UserCheck className="w-4 h-4" />
                              <span>منح التصريح والموافقة الفورية</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleRejectAuthMessage(msg)}
                              disabled={isProcessing}
                              className="px-3 py-2.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold transition cursor-pointer disabled:opacity-50"
                              title="رفض الطلب"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium">
                            {msg.reviewedBy ? `تم الإجراء بواسطة: ${msg.reviewedBy}` : 'مكتمل'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : activeTab === 'notifications' ? (
          <div className="p-4 sm:p-6 space-y-6">
            <div className="max-w-2xl bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">نظام الإشعار الفوري للمشرف (Instant Admin Dispatch)</h3>
                  <p className="text-xs text-slate-500">
                    يتم إرسال تنبيه مباشر إلى تليجرام أو الـ Webhook فور تقديم أي مستخدم جديد لطلب تسجيل.
                  </p>
                </div>
              </div>

              <div className="text-xs text-slate-600 bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">المتغيرات المتاحة في ملف الإعداد (.env.example):</span>
                  <span className="font-mono text-[11px] bg-slate-100 px-2 py-0.5 rounded text-slate-700">Production Config</span>
                </div>
                <div className="font-mono text-[11px] text-slate-700 space-y-1 bg-slate-50 p-2.5 rounded-lg">
                  <div>TELEGRAM_BOT_TOKEN="your_bot_token"</div>
                  <div>TELEGRAM_CHAT_ID="your_chat_id"</div>
                  <div>ADMIN_NOTIFICATION_WEBHOOK_URL="https://your-webhook-endpoint"</div>
                </div>
                <p className="text-[11px] text-slate-500">
                  يمكن تعيين هذه المتغيرات عبر إعدادات البيئة في السيرفر لتفعيل التوصيل المباشر إلى تليجرام.
                </p>
              </div>

              {/* Test Button */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleTestNotification}
                  disabled={notificationTestStatus.running}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md shadow-purple-600/20 transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>{notificationTestStatus.running ? 'جاري الإرسال...' : 'إرسال إشعار تجريبي الآن'}</span>
                </button>

                {notificationTestStatus.message && (
                  <span
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${
                      notificationTestStatus.success
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}
                  >
                    {notificationTestStatus.message}
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredList.length === 0 ? (
              <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-3">
                <ShieldCheck className="w-12 h-12 text-slate-300 stroke-[1.5]" />
                <p className="font-medium text-slate-600">
                  {activeTab === 'pending' ? 'لا توجد طلبات تسجيل معلقة حالياً.' : 'لا يوجد مستخدمون مطابقون لبحثك.'}
                </p>
                <p className="text-xs text-slate-400">
                  {activeTab === 'pending' ? 'أي طلب تسجيل جديد سيظهر هنا فوراً للإقرار والاعتماد.' : 'يمكنك تعديل كلمات البحث.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {filteredList.map(user => {
                  const isSuper = SUPER_ADMIN_EMAILS.includes(String(user.email || '').toLowerCase().trim());
                  const roleObj = ROLES_INFO.find(r => r.role === (user.role || user.requestedRole)) || ROLES_INFO[2];

                  return (
                    <div
                      key={user.id}
                      className="bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-4 sm:p-5 transition shadow-2xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                    >
                      {/* Left: User Details */}
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h4 className="font-bold text-slate-900 text-sm sm:text-base">{user.name}</h4>
                          {user.requestId && (
                            <span className="font-mono text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200">
                              {user.requestId}
                            </span>
                          )}
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${roleObj.badgeColor}`}
                          >
                            {roleObj.label}
                          </span>
                          {user.status === 'pending' ? (
                            <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-2 py-0.5 rounded-md">
                              قيد المراجعة
                            </span>
                          ) : user.status === 'blocked' ? (
                            <span className="bg-rose-100 text-rose-800 text-[10px] font-extrabold px-2 py-0.5 rounded-md flex items-center gap-1">
                              <Ban className="w-3 h-3" />
                              محظور ومطرود
                            </span>
                          ) : (
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5 rounded-md">
                              معتمد ونشط
                            </span>
                          )}
                          {isSuper && (
                            <span className="bg-purple-100 text-purple-900 text-[10px] font-black px-2 py-0.5 rounded-md">
                              وصول كامل دائم
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-500">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{user.pharmacyName}</span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span dir="ltr" className="font-mono">{user.phone || user.identifier}</span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span dir="ltr" className="font-mono truncate">{user.email || 'غير مسجل'}</span>
                          </div>
                        </div>

                        <div className="text-[11px] text-slate-400 flex items-center gap-2">
                          <span>تاريخ التسجيل: <strong dir="ltr" className="font-mono">{new Date(user.createdAt).toLocaleString('ar-IQ')}</strong></span>
                          {user.approvedAt && (
                            <span>• تاريخ الاعتماد: <strong dir="ltr" className="font-mono">{new Date(user.approvedAt).toLocaleString('ar-IQ')}</strong></span>
                          )}
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 w-full md:w-auto shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 justify-end">
                        {user.status === 'pending' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedUserForAction(user);
                                setAssignedRole(user.requestedRole || 'pharmacist_staff');
                              }}
                              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm shadow-emerald-600/20 flex items-center gap-1.5 cursor-pointer"
                            >
                              <UserCheck className="w-4 h-4" />
                              <span>قبول وتعيين الدور</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleRejectOrDeactivate(user, 'rejected')}
                              className="px-3 py-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold transition cursor-pointer"
                              title="رفض الطلب"
                            >
                              <XCircle className="w-4 h-4" />
                              <span>رفض</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteUser(user)}
                              disabled={isProcessing}
                              className="px-3 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              title="حذف هذا الطلب المعلق نهائياً"
                            >
                              <Trash2 className="w-4 h-4" />
                              <span>حذف</span>
                            </button>
                          </>
                        ) : (
                          <>
                            {!isSuper && (
                              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                {user.status === 'blocked' ? (
                                  <button
                                    type="button"
                                    onClick={() => handleUnblockUser(user)}
                                    disabled={isProcessing}
                                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                    title="إلغاء الحظر وتفعيل الحساب"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>إلغاء الحظر وتفعيل</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleBlockUser(user)}
                                    disabled={isProcessing}
                                    className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                    title="حظر المستخدم وطرده فوراً من النظام"
                                  >
                                    <Ban className="w-3.5 h-3.5 text-rose-600" />
                                    <span>حظر فوري</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(user)}
                                  disabled={isProcessing}
                                  className="px-2.5 py-1.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                  title="طرد وحذف نهائي من قاعدة البيانات"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>طرد وحذف</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedUserForAction(user);
                                    setAssignedRole(user.role);
                                  }}
                                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer flex items-center gap-1"
                                >
                                  <Key className="w-3.5 h-3.5 text-slate-400" />
                                  <span>الدور</span>
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Role Assignment Modal */}
      {selectedUserForAction && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">اعتماد وتعيين صلاحيات المستخدم</h3>
                  <p className="text-xs text-slate-500">{selectedUserForAction.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUserForAction(null)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                اختر الدور والصلاحية المخولة لهذا المستخدم:
              </label>
              <div className="space-y-2">
                {ROLES_INFO.map(r => (
                  <button
                    key={r.role}
                    type="button"
                    onClick={() => setAssignedRole(r.role)}
                    className={`w-full p-3 rounded-2xl border text-right transition cursor-pointer flex flex-col gap-1 ${
                      assignedRole === r.role
                        ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900">{r.label}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${r.badgeColor}`}
                      >
                        {r.role}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">{r.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setSelectedUserForAction(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 transition"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => handleApprove(selectedUserForAction, assignedRole)}
                disabled={isProcessing}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm shadow-blue-600/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isProcessing ? 'جاري الاعتماد...' : 'تأكيد واعتماد الحساب'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
