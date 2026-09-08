import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReset = () => {
    try {
      localStorage.removeItem('samo_logged_out_flag');
      localStorage.removeItem('samo_user_session');
      localStorage.removeItem('samo_warehouse_current_user_v3');
      localStorage.removeItem('samo_warehouse_session_v3');
    } catch {
      // ignore
    }
    window.location.reload();
  };

  private handleHardReset = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // ignore
    }
    window.location.reload();
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" dir="rtl">
          <div className="max-w-lg w-full bg-white rounded-3xl p-6 sm:p-8 text-center shadow-xl border border-slate-200 space-y-5">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl mx-auto flex items-center justify-center shadow-inner">
              <AlertTriangle className="w-8 h-8 text-blue-600" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-black text-slate-900">مذخر سامو للأدوية</h2>
              <p className="text-sm font-bold text-slate-700">حدث تنبيه أثناء معالجة الشاشة</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                يمكنك تحديث الصفحة أو مسح الذاكرة المؤقتة لاستعادة عمل النظام بالكامل فوراً.
              </p>
            </div>

            {this.state.error && (
              <div className="text-right bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-mono text-rose-600 max-h-36 overflow-auto">
                <p className="font-bold text-slate-700 mb-1">تفاصيل الخطأ:</p>
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={this.handleReset}
                className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 transition cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>إعادة تحميل لوحة التحكم</span>
              </button>

              <button
                type="button"
                onClick={this.handleHardReset}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] text-slate-700 rounded-xl font-medium text-xs transition cursor-pointer"
              >
                مسح البيانات المخزنة مؤقتاً والبدء من جديد
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
