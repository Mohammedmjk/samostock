import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        id="btn-pwa-install"
        onClick={install}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg border border-teal-200 transition shadow-xs"
        title="تثبيت التطبيق على جهازك للعمل بدون إنترنت"
      >
        <Download className="w-3.5 h-3.5 text-teal-600" />
        <span>تثبيت التطبيق (PWA)</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          id="btn-pwa-install-ios"
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg border border-teal-200 transition shadow-xs"
          title="تثبيت التطبيق على الآيفون"
        >
          <Smartphone className="w-3.5 h-3.5 text-teal-600" />
          <span>تثبيت على iPhone</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl text-slate-800 animate-in fade-in zoom-in duration-150">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-teal-600" />
                  تثبيت التطبيق على iPhone / iPad
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-full"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
                <div className="flex items-start gap-2.5">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-100 text-teal-800 font-bold flex items-center justify-center text-xs">
                    1
                  </span>
                  <p>
                    اضغط على زر <strong>المشاركة (Share)</strong> في شريط متصفح سفاري بالأسفل.
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-100 text-teal-800 font-bold flex items-center justify-center text-xs">
                    2
                  </span>
                  <p>
                    مرر للأسفل واضغط على <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-100 text-teal-800 font-bold flex items-center justify-center text-xs">
                    3
                  </span>
                  <p>
                    سيعمل النظام كتطبيق مستقل وسريع حتى في حال انقطاع الإنترنت!
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition"
              >
                حسناً، فهمت
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
