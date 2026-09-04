import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      id="pwa-offline-indicator"
      className="fixed bottom-16 sm:bottom-4 left-4 right-4 sm:right-auto sm:max-w-md z-50 flex items-center gap-3 rounded-2xl bg-slate-900/95 backdrop-blur-md px-4 py-3 text-xs font-bold text-white shadow-2xl border border-amber-500/40 animate-in fade-in slide-in-from-bottom-2"
      role="status"
      aria-live="polite"
    >
      <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
        <WifiOff className="w-4 h-4 animate-pulse" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-amber-400 font-extrabold text-[11px]">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
          <span>وضع غير متصل بالإنترنت (Offline)</span>
        </div>
        <p className="text-[11px] text-slate-300 font-medium leading-tight mt-0.5">
          التطبيق يعمل بكامل طاقته ومخزونك محفوظ محلياً. ستتم المزامنة تلقائياً عند عودة الاتصال.
        </p>
      </div>
    </div>
  );
};
