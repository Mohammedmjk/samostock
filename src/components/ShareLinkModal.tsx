import React, { useState } from 'react';
import { 
  Share2, 
  Copy, 
  Check, 
  ExternalLink, 
  MessageSquare, 
  QrCode, 
  Sparkles,
  Building,
  Smartphone
} from 'lucide-react';
import { WarehouseSettings } from '../types';

interface ShareLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: WarehouseSettings;
  onOpenPharmacyView: (pharmacyName?: string) => void;
}

export const ShareLinkModal: React.FC<ShareLinkModalProps> = ({
  isOpen,
  onClose,
  settings,
  onOpenPharmacyView,
}) => {
  const [targetPharmacy, setTargetPharmacy] = useState('');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // Build the shareable URL
  const baseUrl = window.location.origin + window.location.pathname;
  const shareUrl = targetPharmacy.trim()
    ? `${baseUrl}?view=pharmacy&pharmacy=${encodeURIComponent(targetPharmacy.trim())}`
    : `${baseUrl}?view=pharmacy`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShareWhatsApp = () => {
    const message = `مرحباً دكتور، رابط كتالوج وسلة طلبات الأدوية الخاصة بـ *${settings.name}*:\n` +
      `يمكنك اختيار الأدوية المطلوبة مع عروض البونص وسنستلم إشعاراً فورياً لتجهيز الطلبية وفحص تواريخ الصلاحية:\n${shareUrl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-xl space-y-5 animate-in zoom-in-95 duration-150 text-slate-900">
        <div className="flex items-start justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                مشاركة رابط السلة والكتالوج للصيدليات
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                أرسل هذا الرابط لأي صيدلية عبر واتساب لتختار الأدوية مباشرة.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Target pharmacy input */}
        <div className="space-y-1.5 text-xs">
          <label className="block font-semibold text-slate-700 flex items-center gap-1.5">
            <Building className="w-4 h-4 text-blue-600" />
            تخصيص الرابط لصيدلية معينة (اختياري):
          </label>
          <input
            type="text"
            placeholder="مثال: صيدلية الأمل الحديثة"
            value={targetPharmacy}
            onChange={(e) => setTargetPharmacy(e.target.value)}
            className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-blue-500 text-xs font-semibold"
          />
          <span className="text-[11px] text-slate-400 block">
            إذا قمت بكتابة اسم الصيدلية، فسيظهر اسمها تلقائياً في السلة عندما تفتح الرابط.
          </span>
        </div>

        {/* Generated URL Box */}
        <div className="space-y-1.5 text-xs">
          <label className="block font-semibold text-slate-700">رابط الطلب المباشر:</label>
          <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-1 bg-transparent border-none text-xs font-mono text-slate-700 focus:outline-hidden px-1"
              dir="ltr"
            />
            <button
              onClick={handleCopy}
              className={`px-3 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-1 transition cursor-pointer ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>تم النسخ!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>نسخ الرابط</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Instant Sharing Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <button
            onClick={handleShareWhatsApp}
            className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
          >
            <MessageSquare className="w-4 h-4" />
            <span>إرسال عبر واتساب الآن</span>
          </button>

          <button
            onClick={() => {
              onOpenPharmacyView(targetPharmacy.trim());
              onClose();
            }}
            className="py-2.5 px-4 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <ExternalLink className="w-4 h-4 text-blue-600" />
            <span>تجربة فتح بوابة الصيدلية</span>
          </button>
        </div>

        {/* How it works note */}
        <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3 text-xs text-slate-800 space-y-1">
          <span className="font-bold flex items-center gap-1.5 text-emerald-900">
            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
            دخول مباشر وفوري بدون تسجيل أو انتظار:
          </span>
          <p className="text-[11px] leading-relaxed text-emerald-800">
            تم إزالة شرط تسجيل الدخول والحسابات — أي صيدلية تملك هذا الرابط ستدخل فوراً إلى الكتالوج، تختار الأدوية والكميات المطلوبة وعروض البونص، وترسل الطلب مباشرة إلى المذخر بنقرة واحدة.
          </p>
        </div>
      </div>
    </div>
  );
};
