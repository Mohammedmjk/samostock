import React, { useState, useEffect } from 'react';
import { 
  Users, 
  CheckCircle, 
  XCircle, 
  Clock, 
  ShieldCheck, 
  Building2, 
  Search, 
  Trash2, 
  Pill, 
  UserCheck, 
  UserX, 
  RefreshCw,
  Phone,
  MapPin,
  X,
  Ban,
  Calendar,
  AlertTriangle,
  Sparkles,
  Shield,
  Check
} from 'lucide-react';
import { AppUser } from '../types';
import { storage } from '../services/storage';
import { 
  subscribeToAllUsers,
  approvePharmacy, 
  rejectPharmacy, 
  blockUserAccount, 
  unblockUserAccount, 
  deleteUserAccount 
} from '../services/firebase';

interface UserApprovalsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: AppUser | null;
  users?: AppUser[];
  onRefreshUsers?: () => void;
  onApproveUser?: (userId: string, role: 'pharmacy' | 'warehouse') => Promise<void> | void;
  onRejectUser?: (userId: string) => Promise<void> | void;
  onDeleteUser?: (userId: string) => Promise<void> | void;
  onUpdateUser?: (updatedUser: AppUser) => Promise<void> | void;
  onAddPreApprovedUser?: (user: any) => void;
  settings?: any;
  onUpdateSettings?: (newSettings: any) => void;
}

export const UserApprovalsModal: React.FC<UserApprovalsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  users: _propsUsers,
  onRefreshUsers,
  onApproveUser,
  onRejectUser,
  onDeleteUser,
  onUpdateUser,
  onAddPreApprovedUser,
  settings,
  onUpdateSettings,
}) => {
  const [users, setUsers] = useState<AppUser[]>(_propsUsers || []);
  const [activeTab, setActiveTab] = useState<'pharmacies' | 'staff'>('pharmacies');
  const [pharmacySubFilter, setPharmacySubFilter] = useState<'pending' | 'approved' | 'blocked'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Live real-time Firestore synchronization for collection('users')
  useEffect(() => {
    if (!isOpen) return;

    if (onRefreshUsers) {
      onRefreshUsers();
    }

    // Subscribe to Firestore users collection
    const unsubscribe = subscribeToAllUsers((liveUsers) => {
      setUsers(liveUsers);
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen, onRefreshUsers]);

  if (!isOpen) return null;

  // Filter out founder from the general management lists
  const managedUsers = users.filter((u) => {
    if (!u) return false;
    if (u.id === 'founder_admin' || u.role === 'founder' || u.founder) return false;
    return true;
  });

  // Pharmacies
  const allPharmacies = managedUsers.filter((u) => u.role === 'pharmacy' || (!u.role && u.pharmacyName));
  const pendingPharmacies = allPharmacies.filter((u) => u.status === 'pending' || u.role === 'pending');
  const approvedPharmacies = allPharmacies.filter((u) => u.status === 'approved');
  const blockedPharmacies = allPharmacies.filter((u) => u.status === 'blocked' || u.status === 'rejected');

  // Staff members
  const staffMembers = managedUsers.filter(
    (u) => u.role === 'staff' || u.role === 'pharmacist_staff' || u.role === 'warehouse_manager'
  );

  // Search filtering
  const matchesSearch = (u: AppUser) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      (u.name && u.name.toLowerCase().includes(term)) ||
      (u.pharmacyName && u.pharmacyName.toLowerCase().includes(term)) ||
      (u.phone && u.phone.includes(term)) ||
      (u.identifier && u.identifier.includes(term)) ||
      (u.address && u.address.toLowerCase().includes(term))
    );
  };

  const displayedPharmacies = (
    pharmacySubFilter === 'pending'
      ? pendingPharmacies
      : pharmacySubFilter === 'approved'
      ? approvedPharmacies
      : blockedPharmacies
  ).filter(matchesSearch);

  const displayedStaff = staffMembers.filter(matchesSearch);

  // Actions
  const handleApprovePharmacy = async (userId: string, name: string) => {
    setIsProcessing(userId);
    try {
      const targetUser = users.find((u) => u.id === userId);
      // 1. Firebase update
      try {
        await approvePharmacy(userId);
      } catch (err) {
        console.warn('Firebase approval sync:', err);
      }

      // 2. Storage update & mark alert handled
      storage.updateUserStatus(userId, 'approved', 'pharmacy');
      storage.markAlertHandled(userId, targetUser?.identifier, targetUser?.phone, targetUser?.email);

      // 3. Update server
      fetch('/api/auth/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          identifier: targetUser?.identifier,
          pharmacyName: targetUser?.pharmacyName || name,
          phone: targetUser?.phone,
          role: 'pharmacy',
          approvedBy: currentUser?.name || 'إدارة المذخر',
        }),
      }).catch(() => {});

      // 4. Invoke callback if provided
      if (onApproveUser) {
        await onApproveUser(userId, 'pharmacy');
      }

      // 5. Update local state immediately
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, status: 'approved', role: 'pharmacy', approvedAt: new Date().toISOString() }
            : u
        )
      );

      setActionSuccess(`تم اعتماد صيدلية "${name}" بنجاح. أصبحت قادرة على الدخول والطلب مباشرة.`);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (e: any) {
      alert(e.message || 'فشل اعتماد الصيدلية.');
    } finally {
      setIsProcessing(null);
    }
  };

  const handleRejectPharmacy = async (userId: string, name: string) => {
    if (!window.confirm(`هل أنت متأكد من رفض طلب صيدلية "${name}"؟`)) return;
    setIsProcessing(userId);
    try {
      const targetUser = users.find((u) => u.id === userId);
      // 1. Firebase update
      try {
        await rejectPharmacy(userId);
      } catch (err) {
        console.warn('Firebase reject sync:', err);
      }

      // 2. Storage update & mark alert handled
      storage.updateUserStatus(userId, 'rejected');
      storage.markAlertHandled(userId, targetUser?.identifier, targetUser?.phone, targetUser?.email);

      // 3. Update server
      fetch('/api/auth/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          identifier: targetUser?.identifier,
          status: 'rejected',
          phone: targetUser?.phone,
          approvedBy: currentUser?.name || 'إدارة المذخر',
        }),
      }).catch(() => {});

      // 4. Invoke callback if provided
      if (onRejectUser) {
        await onRejectUser(userId);
      }

      // 5. Update local state immediately
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, status: 'rejected' } : u
        )
      );

      setActionSuccess(`تم رفض طلب صيدلية "${name}".`);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (e: any) {
      alert(e.message || 'فشل رفض الطلب.');
    } finally {
      setIsProcessing(null);
    }
  };

  const handleBlockUser = async (userId: string, name: string, isStaff: boolean) => {
    const promptText = isStaff
      ? `هل أنت متأكد من طرد وحظر الموظف "${name}"؟ سيتم إخراجه وفسخ جلسته في جهازه فوراً.`
      : `هل أنت متأكد من تجميد وحظر حساب صيدلية "${name}"؟ سيتم منعه من دخول السلة أو إنشاء طلبيات.`;
    
    if (!window.confirm(promptText)) return;

    setIsProcessing(userId);
    try {
      await blockUserAccount(userId);
      storage.blockUser(userId);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, status: 'blocked' } : u))
      );
      setActionSuccess(`تم حظر "${name}" بنجاح وسيتم طرده من الجلسة في جهازه فوراً.`);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (e: any) {
      alert(e.message || 'فشل الحظر.');
    } finally {
      setIsProcessing(null);
    }
  };

  const handleUnblockUser = async (userId: string, name: string) => {
    setIsProcessing(userId);
    try {
      await unblockUserAccount(userId);
      storage.unblockUser(userId);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, status: 'approved' } : u))
      );
      setActionSuccess(`تمت إعادة تفعيل حساب "${name}" بنجاح.`);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (e: any) {
      alert(e.message || 'فشل إعادة التفعيل.');
    } finally {
      setIsProcessing(null);
    }
  };

  const handleDeleteUser = async (userId: string, name: string) => {
    if (!window.confirm(`هل أنت متأكد من الحذف النهائي لمستند "${name}" كلياً؟ لا يمكن التراجع.`)) return;

    setIsProcessing(userId);
    try {
      const targetUser = users.find((u) => u.id === userId);
      try {
        await deleteUserAccount(userId);
      } catch (err) {
        console.warn('Firebase delete user sync:', err);
      }

      if (targetUser) {
        storage.recordDeletedUser(targetUser.id, targetUser.identifier, targetUser.pharmacyName);
      }
      storage.deleteUser(userId);
      storage.markAlertHandled(userId, targetUser?.identifier, targetUser?.phone, targetUser?.email);

      fetch(`/api/auth/users/${userId}`, { method: 'DELETE' }).catch(() => {});

      if (onDeleteUser) {
        await onDeleteUser(userId);
      }

      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setActionSuccess(`تم حذف مستند "${name}" نهائياً من قاعدة البيانات.`);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (e: any) {
      alert(e.message || 'فشل الحذف.');
    } finally {
      setIsProcessing(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
      <div className="max-w-4xl w-full bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Top Header */}
        <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                <span>لوحة تحكم المؤسس المركزية</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-bold border border-emerald-400/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  ربط حي ومباشر (Firestore)
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                إدارة طلبات واعتماد الصيدليات ومراقبة وحظر كادر الموظفين في الوقت الحقيقي
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (onRefreshUsers) onRefreshUsers();
              }}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer flex items-center gap-1.5 text-xs font-bold"
              title="تحديث البيانات"
            >
              <RefreshCw className="w-4 h-4 text-blue-400" />
              <span className="hidden sm:inline">تحديث</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Success Alert */}
        {actionSuccess && (
          <div className="bg-emerald-50 text-emerald-800 border-b border-emerald-200 px-6 py-2.5 text-xs font-bold flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{actionSuccess}</span>
            </div>
            <button
              onClick={() => setActionSuccess(null)}
              className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Navigation Tabs & Search */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          
          {/* Main Tabs */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              id="tab-founder-pharmacies"
              type="button"
              onClick={() => setActiveTab('pharmacies')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition cursor-pointer ${
                activeTab === 'pharmacies'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>الصيدليات المسجلة والطلبات</span>
              {pendingPharmacies.length > 0 && (
                <span className="bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded-full text-[10px] font-black">
                  {pendingPharmacies.length}
                </span>
              )}
            </button>

            <button
              id="tab-founder-staff"
              type="button"
              onClick={() => setActiveTab('staff')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition cursor-pointer ${
                activeTab === 'staff'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>فريق العمل والموظفين</span>
              <span className="bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded-full text-[10px] font-black">
                {staffMembers.length}
              </span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <input
              id="input-founder-search"
              type="text"
              placeholder="بحث بالاسم، الصيدلية، الهاتف..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 pr-9 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          </div>
        </div>

        {/* Tab 1: Pharmacies Management */}
        {activeTab === 'pharmacies' && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Sub-filter pills */}
            <div className="px-5 py-2.5 bg-slate-100/70 border-b border-slate-200 flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-bold text-[11px] ml-1">عرض الصيدليات:</span>
              <button
                id="btn-filter-pharmacy-pending"
                type="button"
                onClick={() => setPharmacySubFilter('pending')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  pharmacySubFilter === 'pending'
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>طلبات معلقة</span>
                <span className="text-[10px] font-mono">({pendingPharmacies.length})</span>
              </button>

              <button
                id="btn-filter-pharmacy-approved"
                type="button"
                onClick={() => setPharmacySubFilter('approved')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  pharmacySubFilter === 'approved'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-200'
                }`}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>صيدليات معتمدة نشطة</span>
                <span className="text-[10px] font-mono">({approvedPharmacies.length})</span>
              </button>

              <button
                id="btn-filter-pharmacy-blocked"
                type="button"
                onClick={() => setPharmacySubFilter('blocked')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  pharmacySubFilter === 'blocked'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Ban className="w-3.5 h-3.5" />
                <span>محظورة أو مرفوضة</span>
                <span className="text-[10px] font-mono">({blockedPharmacies.length})</span>
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
              {displayedPharmacies.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <Building2 className="w-12 h-12 mx-auto text-slate-300 stroke-1" />
                  <p className="text-sm font-bold text-slate-600">لا توجد سجلات صيدليات مطابقة في هذا القسم</p>
                  <p className="text-xs text-slate-400">أي طلب تسجيل جديد يظهر هنا فوراً وبشكل حي عبر Firestore</p>
                </div>
              ) : (
                displayedPharmacies.map((pharmacy) => {
                  const isProcessingThis = isProcessing === pharmacy.id;
                  const isPending = pharmacy.status === 'pending' || pharmacy.role === 'pending';
                  const isApproved = pharmacy.status === 'approved';
                  const isBlocked = pharmacy.status === 'blocked' || pharmacy.status === 'rejected';

                  return (
                    <div
                      key={pharmacy.id}
                      className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 hover:border-blue-300 transition shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                    >
                      {/* Pharmacy Info */}
                      <div className="flex items-start gap-3.5 min-w-0 flex-1">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                          isPending
                            ? 'bg-amber-100 text-amber-700'
                            : isApproved
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-rose-100 text-rose-700'
                        }`}>
                          <Building2 className="w-5 h-5" />
                        </div>

                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm sm:text-base font-black text-slate-900">
                              {pharmacy.pharmacyName || pharmacy.name}
                            </h3>
                            {isPending && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-300">
                                بانتظار الاعتماد
                              </span>
                            )}
                            {isApproved && (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-300">
                                معتمدة ونشطة
                              </span>
                            )}
                            {isBlocked && (
                              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold border border-rose-300">
                                محظورة / مجمدة
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
                            {pharmacy.pharmacistName && (
                              <span className="font-semibold text-slate-700">الصيدلي: {pharmacy.pharmacistName}</span>
                            )}
                            {pharmacy.phone && (
                              <span className="flex items-center gap-1 font-mono font-bold text-blue-700" dir="ltr">
                                <Phone className="w-3.5 h-3.5 text-slate-400" />
                                {pharmacy.phone}
                              </span>
                            )}
                            {pharmacy.address && (
                              <span className="flex items-center gap-1 text-slate-500">
                                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                {pharmacy.address}
                              </span>
                            )}
                            {pharmacy.createdAt && (
                              <span className="flex items-center gap-1 text-slate-400 text-[11px]">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                {new Date(pharmacy.createdAt).toLocaleDateString('ar-IQ')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                        {isPending && (
                          <>
                            <button
                              id={`btn-approve-pharmacy-${pharmacy.id}`}
                              type="button"
                              disabled={isProcessingThis}
                              onClick={() => handleApprovePharmacy(pharmacy.id, pharmacy.pharmacyName || pharmacy.name)}
                              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>موافقة واعتماد</span>
                            </button>
                            <button
                              id={`btn-reject-pharmacy-${pharmacy.id}`}
                              type="button"
                              disabled={isProcessingThis}
                              onClick={() => handleRejectPharmacy(pharmacy.id, pharmacy.pharmacyName || pharmacy.name)}
                              className="px-3 py-2 bg-slate-100 hover:bg-rose-50 text-rose-600 hover:text-rose-700 rounded-xl text-xs font-bold transition cursor-pointer border border-slate-200 hover:border-rose-200 active:scale-95 disabled:opacity-50"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>رفض</span>
                            </button>
                          </>
                        )}

                        {isApproved && (
                          <button
                            id={`btn-block-pharmacy-${pharmacy.id}`}
                            type="button"
                            disabled={isProcessingThis}
                            onClick={() => handleBlockUser(pharmacy.id, pharmacy.pharmacyName || pharmacy.name, false)}
                            className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-bold transition cursor-pointer border border-amber-300 flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                            title="تجميد وحظر الحساب"
                          >
                            <Ban className="w-3.5 h-3.5 text-amber-600" />
                            <span>تجميد / حظر</span>
                          </button>
                        )}

                        {isBlocked && (
                          <button
                            id={`btn-unblock-pharmacy-${pharmacy.id}`}
                            type="button"
                            disabled={isProcessingThis}
                            onClick={() => handleUnblockUser(pharmacy.id, pharmacy.pharmacyName || pharmacy.name)}
                            className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold transition cursor-pointer border border-emerald-300 flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                          >
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                            <span>إعادة تفعيل</span>
                          </button>
                        )}

                        <button
                          id={`btn-delete-pharmacy-${pharmacy.id}`}
                          type="button"
                          disabled={isProcessingThis}
                          onClick={() => handleDeleteUser(pharmacy.id, pharmacy.pharmacyName || pharmacy.name)}
                          className="p-2 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition cursor-pointer"
                          title="حذف نهائي من Firestore"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Staff Management */}
        {activeTab === 'staff' && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-3">
              {displayedStaff.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <Users className="w-12 h-12 mx-auto text-slate-300 stroke-1" />
                  <p className="text-sm font-bold text-slate-600">لا يوجد موظفون مسجلون حالياً</p>
                  <p className="text-xs text-slate-400">
                    عند قيام أي موظف بإدخال رمز الكادر المعتمد لأول مرة، يظهر اسمه وهاتفه هنا مباشرة
                  </p>
                </div>
              ) : (
                displayedStaff.map((staff) => {
                  const isProcessingThis = isProcessing === staff.id;
                  const isBlocked = staff.status === 'blocked' || staff.status === 'rejected';

                  return (
                    <div
                      key={staff.id}
                      className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 hover:border-blue-300 transition shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                    >
                      {/* Staff Info */}
                      <div className="flex items-start gap-3.5 min-w-0 flex-1">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                          isBlocked
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          <Users className="w-5 h-5" />
                        </div>

                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm sm:text-base font-black text-slate-900">
                              {staff.name}
                            </h3>
                            {isBlocked ? (
                              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold border border-rose-300">
                                مطرود / محظور من النظام
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-300">
                                كادر نشط ومعتمد
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
                            {staff.phone && (
                              <span className="flex items-center gap-1 font-mono font-bold text-blue-700" dir="ltr">
                                <Phone className="w-3.5 h-3.5 text-slate-400" />
                                {staff.phone}
                              </span>
                            )}
                            {staff.createdAt && (
                              <span className="flex items-center gap-1 text-slate-400 text-[11px]">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                تاريخ الانضمام: {new Date(staff.createdAt).toLocaleDateString('ar-IQ')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                        {!isBlocked ? (
                          <button
                            id={`btn-block-staff-${staff.id}`}
                            type="button"
                            disabled={isProcessingThis}
                            onClick={() => handleBlockUser(staff.id, staff.name, true)}
                            className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition cursor-pointer border border-rose-300 flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                            title="طرد وحظر الموظف من جلسة جهازه فوراً"
                          >
                            <Ban className="w-3.5 h-3.5 text-rose-600" />
                            <span>طرد / حظر الموظف</span>
                          </button>
                        ) : (
                          <button
                            id={`btn-unblock-staff-${staff.id}`}
                            type="button"
                            disabled={isProcessingThis}
                            onClick={() => handleUnblockUser(staff.id, staff.name)}
                            className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold transition cursor-pointer border border-emerald-300 flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                          >
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                            <span>إعادة تفعيل</span>
                          </button>
                        )}

                        <button
                          id={`btn-delete-staff-${staff.id}`}
                          type="button"
                          disabled={isProcessingThis}
                          onClick={() => handleDeleteUser(staff.id, staff.name)}
                          className="p-2 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition cursor-pointer"
                          title="حذف نهائي من Firestore"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-1 text-[11px]">
            <Shield className="w-3.5 h-3.5 text-blue-600" />
            <span>لوحة تحكم المؤسس - حظر الموظف أو الصيدلية يؤدي لطردهم لحظياً عبر onSnapshot</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition cursor-pointer"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};
