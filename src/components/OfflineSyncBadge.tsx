import React from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react';

interface OfflineSyncBadgeProps {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  onSync: () => void;
}

export const OfflineSyncBadge: React.FC<OfflineSyncBadgeProps> = ({
  isOnline,
  pendingCount,
  isSyncing,
  onSync,
}) => {
  return (
    <div className="flex items-center gap-1.5">
      {isOnline ? (
        <div 
          className="flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium"
          title="متصل بالإنترنت"
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <Wifi className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden md:inline">أونلاين</span>
        </div>
      ) : (
        <div 
          className="flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full bg-amber-50 border border-amber-300 text-amber-800 text-xs font-medium animate-pulse"
          title="أوفلاين (تخزين محلي)"
        >
          <WifiOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span className="hidden sm:inline">أوفلاين</span>
        </div>
      )}

      {pendingCount > 0 && (
        <button
          id="btn-sync-pending"
          onClick={onSync}
          disabled={!isOnline || isSyncing}
          className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full text-xs font-semibold shadow-xs transition shrink-0 ${
            isOnline
              ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
              : 'bg-slate-200 text-slate-500 cursor-not-allowed'
          }`}
          title={isOnline ? 'مزامنة الطلبات المعلقة مع السيرفر' : 'بانتظار عودة الاتصال للمزامنة'}
        >
          <RefreshCw className={`w-3 h-3 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{pendingCount} معلق</span>
          <span className="sm:hidden text-[10px] font-bold">{pendingCount}</span>
        </button>
      )}
    </div>
  );
};
