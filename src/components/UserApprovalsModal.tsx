import React, { useState, useEffect } from 'react';
import { 
  Users, 
  CheckCircle, 
  XCircle, 
  Clock, 
  ShieldCheck, 
  Phone, 
  Mail, 
  Building2, 
  AlertCircle, 
  Plus, 
  KeyRound, 
  Search,
  Trash2,
  Lock,
  MessageSquare,
  Check,
  MapPin,
  Edit3,
  ArrowLeftRight,
  RefreshCw
} from 'lucide-react';
import { AppUser, WarehouseSettings } from '../types';
import { storage } from '../services/storage';

interface UserApprovalsModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: AppUser[];
  onApproveUser: (userId: string, role?: 'pharmacy' | 'owner' | 'super_admin') => void;
  onRejectUser: (userId: string) => void;
  onDeleteUser: (userId: string) => void;
  onAddPreApprovedUser: (userData: Omit<AppUser, 'id' | 'createdAt'>) => void;
  onUpdateUser?: (updatedUser: AppUser) => void;
  onRefreshUsers?: () => Promise<void> | void;
  settings?: WarehouseSettings;
  onUpdateSettings?: (newSettings: WarehouseSettings) => void;
}

export const UserApprovalsModal: React.FC<UserApprovalsModalProps> = ({
  isOpen,
  onClose,
  users,
  onApproveUser,
  onRejectUser,
  onDeleteUser,
  onAddPreApprovedUser,
  onUpdateUser,
  onRefreshUsers,
  settings: initialSettings,
  onUpdateSettings,
}) => {
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'add_new' | 'pin_settings' | 'contact_settings'>('pending');
  const [approvedFilter, setApprovedFilter] = useState<'all' | 'owner' | 'pharmacy'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Automatically refresh latest registration requests from server when modal opens
  useEffect(() => {
    if (isOpen && onRefreshUsers) {
      setIsRefreshing(true);
      Promise.resolve(onRefreshUsers()).finally(() => {
        setIsRefreshing(false);
      });
    }
  }, [isOpen, onRefreshUsers]);

  const handleManualRefresh = async () => {
    if (!onRefreshUsers || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefreshUsers();
    } finally {
      setIsRefreshing(false);
    }
  };
  
  // New User form (Pharmacy or Warehouse Owner)
  const [newRole, setNewRole] = useState<'pharmacy' | 'owner'>('pharmacy');
  const [newPharmacyName, setNewPharmacyName] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [newIdentifier, setNewIdentifier] = useState('');
  const [newAddress, setNewAddress] = useState('');

  // PIN change
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [pinFeedback, setPinFeedback] = useState('');

  // Contact / Phone settings state
  const currentSettings = initialSettings || storage.getSettings();
  const [editPhone, setEditPhone] = useState(currentSettings.phone || '07700000000');
  const [editSupportPhone, setEditSupportPhone] = useState(currentSettings.supportPhone || currentSettings.phone || '07700000000');
  const [editSalesPhone, setEditSalesPhone] = useState(currentSettings.salesPhone || currentSettings.phone || '07700000000');
  const [editWhatsapp, setEditWhatsapp] = useState(currentSettings.whatsappPhone || currentSettings.phone || '07700000000');
  const [editAltPhone, setEditAltPhone] = useState(currentSettings.altPhone || '');
  const [editName, setEditName] = useState(currentSettings.name || 'مذخر سامو للأدوية');
  const [editAddress, setEditAddress] = useState(currentSettings.address || '');
  const [contactFeedback, setContactFeedback] = useState('');

  // Editing User State
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [editUserIdentifier, setEditUserIdentifier] = useState('');
  const [editUserPharmacyName, setEditUserPharmacyName] = useState('');
  const [editUserName, setEditUserName] = useState('');
  const [editUserAddress, setEditUserAddress] = useState('');
  const [editUserRole, setEditUserRole] = useState<'pharmacy' | 'owner'>('pharmacy');
  const [editUserStatus, setEditUserStatus] = useState<'approved' | 'pending' | 'rejected'>('approved');

  const handleStartEdit = (u: AppUser) => {
    setEditingUser(u);
    setEditUserIdentifier(u.phone || u.identifier || u.email || '');
    setEditUserPharmacyName(u.pharmacyName || '');
    setEditUserName(u.name || '');
    setEditUserAddress(u.address || '');
    setEditUserRole(u.role || 'pharmacy');
    setEditUserStatus(u.status || 'approved');
  };

  const handleSaveEditUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    const cleanId = editUserIdentifier.trim();
    const isEmail = cleanId.includes('@');
    const updated: AppUser = {
      ...editingUser,
      identifier: cleanId,
      phone: isEmail ? '' : cleanId,
      email: isEmail ? cleanId : '',
      pharmacyName: editUserPharmacyName.trim(),
      name: editUserName.trim(),
      address: editUserAddress.trim(),
      role: editUserRole,
      status: editUserStatus,
    };
    if (onUpdateUser) {
      onUpdateUser(updated);
    }
    setEditingUser(null);
  };

  // Reset or initialize values when modal opens or settings change
  useEffect(() => {
    if (initialSettings) {
      setEditPhone(initialSettings.phone || '07700000000');
      setEditSupportPhone(initialSettings.supportPhone || initialSettings.phone || '07700000000');
      setEditSalesPhone(initialSettings.salesPhone || initialSettings.phone || '07700000000');
      setEditWhatsapp(initialSettings.whatsappPhone || initialSettings.phone || '07700000000');
      setEditAltPhone(initialSettings.altPhone || '');
      setEditName(initialSettings.name || 'مذخر سامو للأدوية');
      setEditAddress(initialSettings.address || '');
    }
  }, [initialSettings, isOpen]);

  const handleUpdateContactSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: WarehouseSettings = {
      ...(initialSettings || storage.getSettings()),
      phone: editPhone.trim(),
      supportPhone: editSupportPhone.trim() || editPhone.trim(),
      salesPhone: editSalesPhone.trim() || editPhone.trim(),
      whatsappPhone: editWhatsapp.trim() || editPhone.trim(),
      altPhone: editAltPhone.trim(),
      name: editName.trim(),
      address: editAddress.trim(),
    };
    storage.saveSettings(updated);
    if (onUpdateSettings) {
      onUpdateSettings(updated);
    }
    setContactFeedback('تم حفظ أرقام الاستفسارات والدعم والواتساب بنجاح!');
    setTimeout(() => {
      setContactFeedback('');
    }, 3000);
  };

  if (!isOpen) return null;

  const pendingUsers = users.filter((u) => u.status === 'pending');
  const pendingOwners = pendingUsers.filter(
    (u) => u.requestedRole === 'owner' || u.requestedRole === 'super_admin' || u.role === 'owner' || u.role === 'super_admin'
  );

  const allApprovedUsers = users.filter((u) => u.status === 'approved');
  const approvedOwners = allApprovedUsers.filter(
    (u) => u.role === 'owner' || u.role === 'super_admin' || u.founder
  );
  const approvedPharmacies = allApprovedUsers.filter(
    (u) => u.role !== 'owner' && u.role !== 'super_admin' && !u.founder
  );

  const filteredApproved = allApprovedUsers.filter((u) => {
    if (approvedFilter === 'owner' && !(u.role === 'owner' || u.role === 'super_admin' || u.founder)) return false;
    if (approvedFilter === 'pharmacy' && (u.role === 'owner' || u.role === 'super_admin' || u.founder)) return false;
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    return (
      (u.pharmacyName && u.pharmacyName.toLowerCase().includes(q)) ||
      (u.name && u.name.toLowerCase().includes(q)) ||
      (u.identifier && u.identifier.toLowerCase().includes(q)) ||
      (u.phone && u.phone.includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q))
    );
  });

  const handleCreatePreApproved = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPharmacyName.trim() || !newIdentifier.trim()) return;

    onAddPreApprovedUser({
      role: newRole,
      requestedRole: newRole,
      identifier: newIdentifier.trim(),
      name: newContactName.trim() || (newRole === 'owner' ? 'صاحب مذخر معتمد' : 'صيدلي مسؤول'),
      pharmacyName: newPharmacyName.trim(),
      phone: newIdentifier.trim(),
      email: newIdentifier.includes('@') ? newIdentifier.trim() : '',
      address: newAddress.trim(),
      status: 'approved',
      approvedAt: new Date().toISOString(),
    });

    setNewPharmacyName('');
    setNewContactName('');
    setNewIdentifier('');
    setNewAddress('');
    setActiveTab('approved');
  };

  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinFeedback('');

    if (newPinInput.length < 4) {
      setPinFeedback('الرمز الجديد يجب أن يتكون من 4 أرقام أو أحرف على الأقل');
      return;
    }

    try {
      const res = await fetch('/api/auth/update-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPin: currentPinInput,
          newPin: newPinInput,
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        if (data.version) {
          storage.setOwnerPasscodeVersion(data.version);
          const curr = storage.getCurrentUser();
          if (curr && (curr.role === 'owner' || curr.role === 'super_admin')) {
            const updatedOwner = { ...curr, passcodeVersion: data.version };
            storage.setCurrentUser(updatedOwner);
            if (onUpdateUser) {
              onUpdateUser(updatedOwner);
            }
          }
        }
        storage.setOwnerPIN(newPinInput);
        setPinFeedback('تم تحديث رمز المرور بنجاح وإلغاء جميع الجلسات القديمة تلقائياً! أي دخول كصاحب متجر سيتطلب الرمز الجديد.');
        setCurrentPinInput('');
        setNewPinInput('');
      } else {
        setPinFeedback(data.error || 'رمز المرور الحالي غير صحيح');
      }
    } catch {
      // Fallback
      const storedPin = storage.getOwnerPIN();
      if (currentPinInput !== storedPin && currentPinInput !== '1234') {
        setPinFeedback('رمز المرور الحالي غير صحيح');
        return;
      }
      const newVer = (storage.getOwnerPasscodeVersion() || 1) + 1;
      storage.setOwnerPasscodeVersion(newVer);
      const curr = storage.getCurrentUser();
      if (curr && (curr.role === 'owner' || curr.role === 'super_admin')) {
        const updatedOwner = { ...curr, passcodeVersion: newVer };
        storage.setCurrentUser(updatedOwner);
        if (onUpdateUser) {
          onUpdateUser(updatedOwner);
        }
      }
      storage.setOwnerPIN(newPinInput);
      setPinFeedback('تم تحديث رمز المرور بنجاح وإلغاء الجلسات السابقة!');
      setCurrentPinInput('');
      setNewPinInput('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">إدارة تصاريح الدخول وموافقة الصيدليات</h2>
              <p className="text-xs text-slate-400">حماية أسعار المذخر والتحكم في من يحق له مشاهدة المواد والطلب</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onRefreshUsers && (
              <button
                type="button"
                id="btn-refresh-user-approvals"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold border border-slate-700 transition cursor-pointer disabled:opacity-50 active:scale-95"
                title="تحديث ومزامنة طلبات التسجيل من الخادم الآن"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
                <span className="hidden sm:inline">تحديث الطلبات</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-4 pt-2 gap-2 text-xs font-bold shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('pending')}
            className={`pb-3 px-3 border-b-2 flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'pending'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>طلبات الانضمام والتصاريح</span>
            {pendingUsers.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center gap-1">
                <span>{pendingUsers.length}</span>
                {pendingOwners.length > 0 && (
                  <span className="bg-amber-700 px-1 rounded text-[9px]">👑 {pendingOwners.length} مذخر</span>
                )}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('approved')}
            className={`pb-3 px-3 border-b-2 flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'approved'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>التصريحات المعتمدة ({allApprovedUsers.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('add_new')}
            className={`pb-3 px-3 border-b-2 flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'add_new'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>إضافة تصريح مسبق</span>
          </button>

          <button
            onClick={() => setActiveTab('pin_settings')}
            className={`pb-3 px-3 border-b-2 flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'pin_settings'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>رمز مرور المذخر (PIN)</span>
          </button>

          <button
            onClick={() => setActiveTab('contact_settings')}
            className={`pb-3 px-3 border-b-2 flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'contact_settings'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Phone className="w-4 h-4 text-emerald-600" />
            <span>أرقام الاستفسار والواتساب</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          
          {/* 1. Pending Requests */}
          {activeTab === 'pending' && (
            <div>
              {pendingUsers.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <CheckCircle className="w-12 h-12 text-emerald-500/50 mx-auto mb-2" />
                  <p className="font-bold text-slate-600 text-sm">لا توجد طلبات انضمام معلقة حالياً</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    عندما يسجل أي مستخدم أو صيدلية جديدة من هاتف آخر ستظهر لك هنا فوراً لتأكيد التفعيل
                  </p>
                  {onRefreshUsers && (
                    <button
                      type="button"
                      onClick={handleManualRefresh}
                      disabled={isRefreshing}
                      className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold border border-blue-200 transition cursor-pointer active:scale-95"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                      <span>{isRefreshing ? 'جارِ فحص الخادم...' : 'فحص وتحديث الطلبات من الخادم الآن'}</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between">
                    <span className="font-bold">
                      يوجد {pendingUsers.length} طلب بانتظار موافقتك الصريحة لتفعيل حساباتهم:
                    </span>
                    <span className="text-[11px] text-amber-700 sm:hidden flex items-center gap-1 font-bold">
                      <ArrowLeftRight className="w-3 h-3 shrink-0" />
                      اسحب لليمين واليسار
                    </span>
                  </div>

                  {pendingUsers.map((user) => {
                    const isStaffOrOwner = user.registrationAccountType === 'warehouse_staff' || user.requestedRole === 'owner' || user.requestedRole === 'super_admin' || user.role === 'owner' || user.role === 'super_admin';
                    return (
                      <div
                        key={user.id}
                        className={`rounded-xl shadow-xs overflow-x-auto touch-pan-x border-2 ${
                          isStaffOrOwner ? 'bg-amber-50/50 border-amber-400' : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="min-w-[560px] p-3.5 sm:p-4 flex items-center justify-between gap-4">
                          <div className="space-y-1.5 shrink-0 max-w-[320px]">
                            <div className="flex items-center gap-2">
                              {isStaffOrOwner ? (
                                <span className="px-2 py-0.5 bg-amber-500 text-white text-[10px] font-black rounded-md shrink-0 flex items-center gap-1 shadow-xs">
                                  <span>🏢 طلب حساب موظف مذخر</span>
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-blue-600 text-white text-[10px] font-black rounded-md shrink-0 flex items-center gap-1 shadow-xs">
                                  <span>🏥 طلب حساب صيدلية</span>
                                </span>
                              )}
                              <h4 className="font-bold text-slate-900 text-sm sm:text-base truncate">
                                {user.pharmacyName || user.name || 'حساب جديد'}
                              </h4>
                            </div>
                            <div className="space-y-1 text-xs text-slate-700">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-500 font-medium">الاسم الكامل:</span>
                                <strong className="text-slate-900">{user.name}</strong>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-slate-500 font-medium">رقم الهاتف / الحساب:</span>
                                <span className="font-mono text-blue-700 font-black bg-blue-50 px-2 py-0.5 rounded border border-blue-200" dir="ltr">
                                  {user.phone || user.identifier}
                                </span>
                              </div>
                              {user.pharmacyName && (
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-500 font-medium">اسم الصيدلية:</span>
                                  <span className="font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                    {user.pharmacyName}
                                  </span>
                                </div>
                              )}
                              {user.address && (
                                <div className="flex items-center gap-1.5 text-slate-600">
                                  <span>📍 العنوان:</span>
                                  <span className="font-medium text-slate-800">{user.address}</span>
                                </div>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400">
                              تاريخ تقديم الطلب: {new Date(user.createdAt).toLocaleString('ar-IQ')}
                            </p>
                          </div>

                          {/* Action buttons at end - always visible and scrollable */}
                          <div className="flex items-center gap-2 shrink-0 pr-3 border-r border-slate-200">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(user)}
                              className="px-2.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer shrink-0 whitespace-nowrap active:scale-95 shadow-2xs"
                              title="تعديل البيانات"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>تعديل</span>
                            </button>

                            {isStaffOrOwner ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => onApproveUser(user.id, 'owner')}
                                  className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer shrink-0 whitespace-nowrap active:scale-95"
                                  title="تفعيل بصلاحيات موظف المذخر"
                                >
                                  <span>🏢 قبول كموظف مذخر</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onApproveUser(user.id, 'pharmacy')}
                                  className="px-2.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 shadow-2xs cursor-pointer shrink-0 whitespace-nowrap active:scale-95"
                                  title="تفعيل كصيدلية فقط"
                                >
                                  <span>تفعيل كصيدلية</span>
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onApproveUser(user.id, 'pharmacy')}
                                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer shrink-0 whitespace-nowrap active:scale-95"
                              >
                                <CheckCircle className="w-4 h-4" />
                                <span>قبول وتفعيل الصيدلية</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => onRejectUser(user.id)}
                              className="px-2.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer shrink-0 whitespace-nowrap active:scale-95 shadow-2xs"
                            >
                              <XCircle className="w-4 h-4" />
                              <span>رفض</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 2. Approved Users */}
          {activeTab === 'approved' && (
            <div className="space-y-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="بحث باسم الصيدلية أو صاحب المذخر أو رقم الهاتف..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:bg-white"
                />
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              </div>

              {/* Sub-filter pills for owners vs pharmacies */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
                <button
                  type="button"
                  onClick={() => setApprovedFilter('all')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition shrink-0 cursor-pointer ${
                    approvedFilter === 'all'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  الكل ({allApprovedUsers.length})
                </button>
                <button
                  type="button"
                  onClick={() => setApprovedFilter('owner')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                    approvedFilter === 'owner'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  <span>👑 أصحاب المذخر والإدارة</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-black/10 text-[10px] font-mono">{approvedOwners.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setApprovedFilter('pharmacy')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                    approvedFilter === 'pharmacy'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-blue-50 text-blue-900 border border-blue-200 hover:bg-blue-100'
                  }`}
                >
                  <span>🏥 الصيدليات المعتمدة</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-black/10 text-[10px] font-mono">{approvedPharmacies.length}</span>
                </button>
              </div>

              {filteredApproved.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  لا توجد تصريحات مطابقة للبحث أو الفلتر
                </div>
              ) : (
                <div className="space-y-2.5">
                  {/* Visual hint for mobile horizontal scroll */}
                  <div className="flex items-center justify-between px-2.5 py-1.5 bg-blue-50/80 border border-blue-200/80 rounded-xl text-[11px] text-blue-800 font-medium">
                    <span className="flex items-center gap-1.5 font-bold">
                      <ArrowLeftRight className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      يمكنك تمرير البطاقات لليمين واليسار (↔) للوصول لكافة أزرار الإجراءات
                    </span>
                    <span className="text-blue-600 font-bold shrink-0">{filteredApproved.length} تصريح نشط</span>
                  </div>

                  {/* Horizontally scrollable cards with end buttons guaranteed visible */}
                  {filteredApproved.map((user) => {
                    const isFounder = Boolean(
                      user.founder ||
                      user.identifier.toLowerCase() === 'mohammedjafaralkabi@gmail.com' ||
                      (user.email && user.email.toLowerCase() === 'mohammedjafaralkabi@gmail.com')
                    );
                    const isOwner = Boolean(isFounder || user.role === 'owner' || user.role === 'super_admin');

                    return (
                      <div
                        key={user.id}
                        className={`rounded-xl shadow-xs overflow-x-auto touch-pan-x border-2 ${
                          isFounder
                            ? 'border-amber-400 bg-amber-50/30'
                            : isOwner
                            ? 'border-indigo-200 bg-indigo-50/20'
                            : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="min-w-[560px] p-3 sm:p-3.5 flex items-center justify-between gap-4">
                          {/* Right: User / Pharmacy Data */}
                          <div className="space-y-1 min-w-[280px] shrink-0">
                            <div className="flex items-center gap-2">
                              {isFounder ? (
                                <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-md font-black shrink-0 shadow-xs flex items-center gap-1">
                                  <span>👑 المؤسس والمشرف العام</span>
                                </span>
                              ) : isOwner ? (
                                <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-md font-black shrink-0 shadow-xs flex items-center gap-1">
                                  <span>👑 صاحب مذخر / إدارة</span>
                                </span>
                              ) : (
                                <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold border border-emerald-200 shrink-0">
                                  صيدلية معتمدة
                                </span>
                              )}
                              <h4 className="font-bold text-slate-900 text-xs sm:text-sm">
                                {user.pharmacyName || (isFounder ? 'الإدارة العامة العليا لمذخر سامو' : 'مذخر سامو')}
                              </h4>
                            </div>
                            <div className="flex items-center gap-2.5 text-xs text-slate-600 flex-wrap">
                              <span className="font-medium">الاسم: <strong className="text-slate-800">{user.name || 'غير محدد'}</strong></span>
                              <span className="font-mono text-blue-700 font-bold bg-blue-50/80 px-1.5 py-0.5 rounded" dir="ltr">
                                {user.phone || user.identifier}
                              </span>
                              {user.email && (
                                <span className="font-mono text-slate-500 text-[11px]" dir="ltr">
                                  {user.email}
                                </span>
                              )}
                              {user.address && <span className="text-slate-500 font-medium">📍 {user.address}</span>}
                            </div>
                            {isFounder && (
                              <p className="text-[10px] text-amber-800 font-black">
                                ✨ حساب دائم ومحصن: صلاحيات عليا غير قابلة للحذف أو الإيقاف أو التجميد
                              </p>
                            )}
                          </div>

                          {/* Left: Action Buttons at the end - Always accessible and scrollable */}
                          <div className="flex items-center gap-2 shrink-0 pr-3 border-r border-slate-200">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(user)}
                              className="px-3 py-1.5 text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap shadow-2xs active:scale-95"
                              title="تعديل الأرقام والبيانات"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                              <span>تعديل</span>
                            </button>

                            {!isFounder ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => onRejectUser(user.id)}
                                  className="px-3 py-1.5 text-xs text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap shadow-2xs active:scale-95"
                                  title="إيقاف تصريح الحساب مؤقتاً"
                                >
                                  <span>إيقاف التصريح</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDeleteUser(user.id)}
                                  className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 border border-slate-200 transition cursor-pointer shrink-0 shadow-2xs active:scale-95"
                                  title="حذف من السجل"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <span className="text-[10px] text-amber-700 font-bold px-2 py-1 bg-amber-100/80 rounded-md border border-amber-300">
                                محصن أمنياً
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 3. Add Pre-Approved User (Pharmacy or Warehouse Owner) */}
          {activeTab === 'add_new' && (
            <form onSubmit={handleCreatePreApproved} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-slate-800">
                  إضافة تصريح معتمد مسبقاً (دخول مباشر بدون انتظار)
                </h3>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">نوع التصريح:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewRole('pharmacy')}
                    className={`py-2 px-3 rounded-xl border-2 text-xs font-black transition cursor-pointer flex items-center justify-center gap-2 ${
                      newRole === 'pharmacy'
                        ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span>🏥 صاحب صيدلية معتمدة</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewRole('owner')}
                    className={`py-2 px-3 rounded-xl border-2 text-xs font-black transition cursor-pointer flex items-center justify-center gap-2 ${
                      newRole === 'owner'
                        ? 'border-amber-500 bg-amber-50 text-amber-900 shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span>👑 صاحب مذخر / مسؤول إدارة</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {newRole === 'owner' ? 'المسمى الإداري أو المذخر *' : 'اسم الصيدلية *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={newRole === 'owner' ? 'مثال: إدارة مذخر سامو' : 'مثال: صيدلية بابل'}
                  value={newPharmacyName}
                  onChange={(e) => setNewPharmacyName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-bold"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {newRole === 'owner' ? 'اسم المسؤول / صاحب المذخر' : 'اسم الصيدلاني / المسؤول'}
                  </label>
                  <input
                    type="text"
                    placeholder={newRole === 'owner' ? 'مثال: د. محمد' : 'مثال: د. أحمد'}
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف أو الإيميل (Gmail) *</label>
                  <input
                    type="text"
                    required
                    placeholder="07700000000 أو example@gmail.com"
                    value={newIdentifier}
                    onChange={(e) => setNewIdentifier(e.target.value)}
                    dir="ltr"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">العنوان</label>
                <input
                  type="text"
                  placeholder="المدينة / المنطقة"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
                />
              </div>
              <button
                type="submit"
                className={`w-full py-2.5 text-white rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer shadow-xs transition ${
                  newRole === 'owner' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                <CheckCircle className="w-4 h-4" />
                <span>
                  {newRole === 'owner' ? 'حفظ وتفعيل كصاحب مذخر معتمد' : 'حفظ وتفعيل كصيدلية معتمدة'}
                </span>
              </button>
            </form>
          )}

          {/* 4. PIN Settings */}
          {activeTab === 'pin_settings' && (
            <form onSubmit={handleUpdatePin} className="max-w-md mx-auto bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3.5">
              <div className="flex items-center gap-2 text-slate-800">
                <Lock className="w-5 h-5 text-blue-600" />
                <h3 className="text-xs font-black">تغيير رمز المرور السري لصاحب المذخر</h3>
              </div>
              <p className="text-[11px] text-slate-500">
                رمز المرور هذا يمنع أي شخص غريب من الدخول إلى لوحة المذخر وتجهيز الطلبيات والموافقة على المستخدمين.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رمز المرور الحالي</label>
                <input
                  type="password"
                  required
                  placeholder="الافتراضي: 1234"
                  value={currentPinInput}
                  onChange={(e) => setCurrentPinInput(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رمز المرور الجديد (PIN)</label>
                <input
                  type="password"
                  required
                  placeholder="أدخل رمز مرور جديد قوي"
                  value={newPinInput}
                  onChange={(e) => setNewPinInput(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                />
              </div>

              {pinFeedback && (
                <div className={`p-2 rounded-lg text-xs font-bold ${pinFeedback.includes('نجاح') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                  {pinFeedback}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs transition cursor-pointer"
              >
                حفظ الرمز الجديد
              </button>
            </form>
          )}

          {/* 5. Contact & WhatsApp Numbers Settings */}
          {activeTab === 'contact_settings' && (
            <form onSubmit={handleUpdateContactSettings} className="space-y-4 max-w-md mx-auto py-2">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl mx-auto flex items-center justify-center">
                  <Phone className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">تعديل أرقام الاستفسارات والواتساب المعتمدة</h3>
                <p className="text-xs text-slate-500">
                  يمكنك هنا تعديل الرقم الظاهر في الاستفسارات، ورقم الواتساب المعتمد لاستلام الطلبات وتأكيد الرموز.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  رقم الهاتف المعتمد للاستفسارات (الظاهر في الترويسة)
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: 07700000000"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  dir="ltr"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-right"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    هاتف الدعم الفني والمساعدة
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: 07700000000"
                    value={editSupportPhone}
                    onChange={(e) => setEditSupportPhone(e.target.value)}
                    dir="ltr"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-right"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    هاتف قسم المبيعات والحسابات
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: 07700000000"
                    value={editSalesPhone}
                    onChange={(e) => setEditSalesPhone(e.target.value)}
                    dir="ltr"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-right"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  رقم الواتساب المعتمد (لتلقي السلات وتأكيدات الرموز)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="مثال: 07700000000"
                    value={editWhatsapp}
                    onChange={(e) => setEditWhatsapp(e.target.value)}
                    dir="ltr"
                    className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-right"
                  />
                  <button
                    type="button"
                    onClick={() => setEditWhatsapp(editPhone)}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer"
                  >
                    نفس الهاتف
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  رقم هاتف بديل / إضافي
                </label>
                <input
                  type="text"
                  placeholder="مثال: 07800000000"
                  value={editAltPhone}
                  onChange={(e) => setEditAltPhone(e.target.value)}
                  dir="ltr"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-right"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  اسم المذخر
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  العنوان والتفاصيل
                </label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold"
                />
              </div>

              {contactFeedback && (
                <div className="p-2.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>{contactFeedback}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow-xs"
              >
                <Check className="w-4 h-4" />
                <span>حفظ وتحديث الأرقام المعتمدة</span>
              </button>
            </form>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold transition cursor-pointer"
          >
            إغلاق النافذة
          </button>
        </div>

      </div>

      {/* Editing User Details & Phone Number Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-bold">تعديل أرقام وبيانات الحساب</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditUser} className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  رقم الهاتف أو الجيميل للتعريف *
                </label>
                <input
                  type="text"
                  required
                  value={editUserIdentifier}
                  onChange={(e) => setEditUserIdentifier(e.target.value)}
                  dir="ltr"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  اسم الصيدلية / الحساب *
                </label>
                <input
                  type="text"
                  required
                  value={editUserPharmacyName}
                  onChange={(e) => setEditUserPharmacyName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  اسم الصيدلاني / المسؤول
                </label>
                <input
                  type="text"
                  value={editUserName}
                  onChange={(e) => setEditUserName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  العنوان / المدينة
                </label>
                <input
                  type="text"
                  value={editUserAddress}
                  onChange={(e) => setEditUserAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نوع الحساب</label>
                  <select
                    value={editUserRole}
                    onChange={(e) => setEditUserRole(e.target.value as 'pharmacy' | 'owner')}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                  >
                    <option value="pharmacy">صاحب صيدلية</option>
                    <option value="owner">صاحب مذخر</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">حالة التصريح</label>
                  <select
                    value={editUserStatus}
                    onChange={(e) => setEditUserStatus(e.target.value as 'approved' | 'pending' | 'rejected')}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                  >
                    <option value="approved">معتمد ومصرح</option>
                    <option value="pending">معلق بانتظار الموافقة</option>
                    <option value="rejected">موقوف / مرفوض</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>حفظ وتحديث البيانات</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
