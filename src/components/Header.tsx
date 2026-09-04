import React from 'react';
import { 
  Building2, 
  ShoppingBag, 
  Package, 
  Share2, 
  Volume2, 
  VolumeX, 
  PlusCircle, 
  Pill,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  UserCheck,
  LogOut,
  Lock,
  User,
  Menu
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { OfflineSyncBadge } from './OfflineSyncBadge';
import { WarehouseSettings, AppUser } from '../types';

interface HeaderProps {
  currentView: 'warehouse' | 'pharmacy' | 'inventory' | 'add_materials' | 'financial_reports';
  onSelectView: (view: 'warehouse' | 'pharmacy' | 'inventory' | 'add_materials' | 'financial_reports') => void;
  newOrdersCount: number;
  isOnline: boolean;
  pendingSyncCount: number;
  isSyncing: boolean;
  onSync: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenShareModal: () => void;
  onOpenAddProductModal: () => void;
  settings: WarehouseSettings;
  cartItemCount: number;
  alertsCount?: number;
  onOpenNotificationCenter?: () => void;
  canGoBack?: boolean;
  onGoBack?: () => void;
  previousViewName?: string;
  currentUser?: AppUser | null;
  pendingApprovalsCount?: number;
  onOpenApprovals?: () => void;
  onLogout?: () => void;
  onOpenAuth?: () => void;
  onToggleMobileMenu?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onSelectView,
  newOrdersCount,
  isOnline,
  pendingSyncCount,
  isSyncing,
  onSync,
  soundEnabled,
  onToggleSound,
  onOpenShareModal,
  onOpenAddProductModal,
  settings,
  cartItemCount,
  alertsCount = 0,
  onOpenNotificationCenter,
  canGoBack = false,
  onGoBack,
  previousViewName = '',
  currentUser,
  pendingApprovalsCount = 0,
  onOpenApprovals,
  onLogout,
  onOpenAuth,
  onToggleMobileMenu,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs w-full max-w-full overflow-hidden">
      {/* Top Header Bar */}
      <div className="w-full max-w-full px-2.5 sm:px-6">
        <div className="flex items-center justify-between min-h-14 sm:min-h-16 py-1 gap-1.5 sm:gap-4 w-full min-w-0">
          {/* Edge Right (RTL): Menu Toggle, Back button & Brand Logo */}
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 shrink">
            {/* Mobile Hamburger Menu Toggle Button */}
            {onToggleMobileMenu && (
              <button
                id="btn-toggle-mobile-sidebar"
                type="button"
                onClick={onToggleMobileMenu}
                className="lg:hidden p-1.5 sm:p-2 rounded-xl text-slate-700 hover:text-blue-600 hover:bg-slate-100 transition cursor-pointer relative shrink-0 flex items-center justify-center border border-slate-200 shadow-xs active:scale-95"
                title="القائمة الجانبية والتبويبات"
                aria-label="فتح القائمة والتبويبات"
              >
                <Menu className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                {(newOrdersCount > 0 || pendingApprovalsCount > 0) && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white"></span>
                )}
              </button>
            )}

            {canGoBack && onGoBack && (
              <button
                id="btn-header-back"
                onClick={onGoBack}
                className="flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs sm:text-sm font-bold transition shadow-xs cursor-pointer group shrink-0 active:scale-95"
                title={`رجوع إلى ${previousViewName || 'التبويب السابق'}`}
              >
                <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 group-hover:-translate-x-0.5 transition-transform shrink-0" />
                <span>رجوع</span>
                {previousViewName && (
                  <span className="hidden md:inline text-blue-600/80 font-medium text-xs">
                    ({previousViewName})
                  </span>
                )}
              </button>
            )}

            <div 
              onClick={() => onSelectView('warehouse')}
              className="flex items-center gap-1.5 sm:gap-2.5 cursor-pointer group select-none min-w-0 shrink"
            >
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20 group-hover:scale-105 transition shrink-0">
                <Pill className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
              </div>
              <div className="text-right min-w-0">
                <h1 className="text-xs sm:text-base md:text-lg font-black text-slate-900 leading-tight truncate max-w-[85px] xs:max-w-[120px] sm:max-w-none">
                  {settings.name || 'مذخر سامو'}
                </h1>
                <p className="hidden sm:block text-[10px] text-slate-500 font-semibold truncate">إدارة المستودع والمبيعات</p>
              </div>
            </div>
          </div>

          {/* Edge Left (RTL): Action Buttons & Utilities */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Security & Access Management button for Owner and Super Admin */}
            {(currentUser?.role === 'owner' || currentUser?.role === 'super_admin' || currentUser?.founder || currentUser?.role === 'warehouse_manager') && onOpenApprovals && (
              <button
                id="btn-open-user-approvals"
                onClick={onOpenApprovals}
                className="relative flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-gradient-to-r from-slate-900 to-blue-950 hover:from-slate-800 hover:to-blue-900 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs transition cursor-pointer shrink-0 active:scale-95 border border-slate-700/60"
                title="إدارة موافقات وتصاريح الدخول"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="inline font-bold">تصاريح الموافقات</span>
                {pendingApprovalsCount > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 bg-amber-500 text-slate-950 text-[10px] font-black rounded-full flex items-center justify-center animate-pulse shrink-0">
                    {pendingApprovalsCount}
                  </span>
                )}
              </button>
            )}

            {/* Profile / Logout */}
            {currentUser ? (
              <div className="flex items-center gap-1 shrink-0 bg-slate-50 px-1 sm:px-2 py-1 rounded-xl border border-slate-200">
                <div className="hidden md:flex flex-col text-left text-xs font-semibold leading-tight">
                  <span className="text-slate-800 font-bold max-w-[110px] truncate">{currentUser.pharmacyName || currentUser.name}</span>
                  <span className="text-[10px] text-emerald-600 font-bold">
                    {currentUser.role === 'super_admin' ? 'المدير الأعلى' : currentUser.role === 'owner' ? 'صاحب المذخر' : currentUser.role === 'warehouse_manager' ? 'مدير المستودع' : 'صيدلية معتمدة'}
                  </span>
                </div>
                {onLogout && (
                  <button
                    onClick={onLogout}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer shrink-0"
                    title="تسجيل الخروج"
                  >
                    <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  </button>
                )}
              </div>
            ) : (
              onOpenAuth && (
                <button
                  onClick={onOpenAuth}
                  className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer border border-slate-300 shrink-0"
                  title="تسجيل الدخول"
                >
                  <Lock className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                  <span>دخول</span>
                </button>
              )
            )}

            {/* Share link button */}
            <button
              id="btn-open-share-link"
              onClick={onOpenShareModal}
              className="flex items-center gap-1 p-1.5 sm:px-3 sm:py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs transition cursor-pointer shrink-0 active:scale-95"
              title="مشاركة رابط السلة والكتالوج للصيدليات"
            >
              <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="hidden sm:inline">رابط السلة</span>
            </button>

            {/* Sound alert toggle */}
            <button
              id="btn-toggle-sound"
              onClick={onToggleSound}
              className={`p-1.5 sm:p-2 rounded-xl border transition cursor-pointer shrink-0 active:scale-95 ${
                soundEnabled
                  ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                  : 'bg-slate-100 border-slate-200 text-slate-400 hover:bg-slate-200'
              }`}
              title={soundEnabled ? 'صوت التنبيه مفعل' : 'صوت التنبيه صامت'}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" /> : <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />}
            </button>

            {/* Offline/Online badge */}
            <div className="shrink-0">
              <OfflineSyncBadge
                isOnline={isOnline}
                pendingCount={pendingSyncCount}
                isSyncing={isSyncing}
                onSync={onSync}
              />
            </div>

            {/* PWA Install */}
            <div className="hidden sm:block shrink-0">
              <PWAInstallButton />
            </div>
          </div>
        </div>
      </div>

      {/* Persistent Horizontal Navigation Bar (ثابتة في الأعلى وسريعة التنقل بين التبويبات) */}
      <nav 
        id="header-horizontal-tabs"
        className="w-full max-w-full bg-slate-50/90 border-t border-slate-200/80 px-2 sm:px-6 py-1.5 overflow-x-auto no-scrollbar scroll-smooth flex items-center gap-1.5 select-none touch-pan-x"
      >
        <button
          onClick={() => onSelectView('warehouse')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition shrink-0 cursor-pointer whitespace-nowrap ${
            currentView === 'warehouse'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
          }`}
        >
          <Building2 className="w-3.5 h-3.5 shrink-0" />
          <span>لوحة التحكم والتجهيز</span>
          {newOrdersCount > 0 && (
            <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full">
              {newOrdersCount}
            </span>
          )}
        </button>

        <button
          onClick={() => onSelectView('inventory')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition shrink-0 cursor-pointer whitespace-nowrap ${
            currentView === 'inventory'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
          }`}
        >
          <Package className="w-3.5 h-3.5 shrink-0" />
          <span>المخزون والمواد</span>
        </button>

        <button
          onClick={() => onSelectView('add_materials')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition shrink-0 cursor-pointer whitespace-nowrap ${
            currentView === 'add_materials'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
          }`}
        >
          <PlusCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>إضافة المواد والباركود</span>
        </button>

        <button
          onClick={() => onSelectView('financial_reports')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition shrink-0 cursor-pointer whitespace-nowrap ${
            currentView === 'financial_reports'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span>التقارير المالية والمبيعات</span>
        </button>

        <button
          onClick={() => onSelectView('pharmacy')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition shrink-0 cursor-pointer whitespace-nowrap ${
            currentView === 'pharmacy'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <span>بوابة الصيدليات</span>
          {cartItemCount > 0 && (
            <span className="bg-blue-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full">
              {cartItemCount}
            </span>
          )}
        </button>

        {(currentUser?.role === 'owner' || currentUser?.role === 'super_admin' || currentUser?.founder || currentUser?.role === 'warehouse_manager') && onOpenApprovals && (
          <button
            onClick={onOpenApprovals}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition shrink-0 cursor-pointer whitespace-nowrap text-amber-900 bg-amber-100/80 hover:bg-amber-200/80 border border-amber-300"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-amber-700 shrink-0" />
            <span>تصاريح الموافقات</span>
            {pendingApprovalsCount > 0 && (
              <span className="bg-amber-500 text-slate-950 text-[10px] font-black px-1.5 py-0.2 rounded-full">
                {pendingApprovalsCount}
              </span>
            )}
          </button>
        )}
      </nav>
    </header>
  );
};
