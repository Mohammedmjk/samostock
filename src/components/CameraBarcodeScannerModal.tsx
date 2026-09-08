import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { X, Camera, Zap, RefreshCw, AlertCircle, Upload, Check, Smartphone } from 'lucide-react';

interface CameraBarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDetected: (barcode: string) => void;
  title?: string;
}

export const CameraBarcodeScannerModal: React.FC<CameraBarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onDetected,
  title = 'مسح الباركود عبر الكاميرا',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [manualCode, setManualCode] = useState<string>('');
  const [isProcessingImage, setIsProcessingImage] = useState<boolean>(false);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!isOpen) {
      stopScan();
      return;
    }

    let isMounted = true;
    setError(null);
    setIsScanning(true);

    const startScanning = async () => {
      try {
        stopScan();

        const reader = new BrowserMultiFormatReader();
        codeReaderRef.current = reader;

        if (!navigator?.mediaDevices?.getUserMedia) {
          throw new Error('NOT_SUPPORTED');
        }

        // Try getting video stream with ideal environment camera
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: facingMode },
            },
            audio: false,
          });
        } catch (initialErr) {
          // Fallback to basic video constraint if complex constraint fails on some mobile devices
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        if (!isMounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          videoRef.current.setAttribute('autoplay', 'true');
          videoRef.current.setAttribute('muted', 'true');

          try {
            await videoRef.current.play();
          } catch (playErr) {
            console.warn('Autoplay error:', playErr);
          }

          // Check torch capability
          try {
            const track = stream.getVideoTracks()[0];
            const capabilities = (track.getCapabilities?.() as any) || {};
            if (capabilities.torch) {
              setHasTorch(true);
            }
          } catch {}

          // Native BarcodeDetector check for fastest mobile performance
          if ('BarcodeDetector' in window) {
            try {
              const barcodeDetector = new (window as any).BarcodeDetector({
                formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e'],
              });

              let scanningActive = true;
              const detectLoop = async () => {
                if (!scanningActive || !videoRef.current) return;
                try {
                  const barcodes = await barcodeDetector.detect(videoRef.current);
                  if (barcodes.length > 0) {
                    const raw = barcodes[0].rawValue;
                    if (raw) {
                      handleSuccessfulScan(raw);
                      return;
                    }
                  }
                } catch {}
                if (scanningActive) {
                  requestAnimationFrame(detectLoop);
                }
              };
              detectLoop();

              return () => {
                scanningActive = false;
              };
            } catch (err) {
              console.warn('BarcodeDetector skipped, using ZXing reader fallback:', err);
            }
          }

          // ZXing decoding fallback
          reader.decodeFromVideoElement(videoRef.current, (result) => {
            if (result) {
              const text = result.getText();
              if (text) {
                handleSuccessfulScan(text);
              }
            }
          });
        }
      } catch (err: any) {
        console.error('Camera access error:', err);
        if (isMounted) {
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setError('يرجى منح إذن استخدام الكاميرا من إعدادات المتصفح لمسح الباركود مباشرة، أو استخدم خيار التقاط الصورة أدناه.');
          } else if (err.message === 'NOT_SUPPORTED') {
            setError('متصفحك لا يدعم البث المباشر للكاميرا داخل هذه الصفحة. يمكنك التقاط صورة للباركود مباشرة عبر الزر أدناه.');
          } else {
            setError('تعذر تشغيل كاميرا الجهاز مباشرة. يمكنك استخدام زر التقاط صورة أو إدخال الباركود يدوياً.');
          }
        }
      }
    };

    startScanning();

    return () => {
      isMounted = false;
      stopScan();
    };
  }, [isOpen, facingMode]);

  const stopScan = () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (codeReaderRef.current) {
        codeReaderRef.current = null;
      }
    } catch {}
    setIsScanning(false);
    setIsTorchOn(false);
  };

  const handleSuccessfulScan = (barcode: string) => {
    const clean = String(barcode || '').trim();
    if (!clean) return;

    // Play pleasant confirmation beep
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.1);
    } catch {}

    stopScan();
    onDetected(clean);
    onClose();
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      try {
        const nextState = !isTorchOn;
        await track.applyConstraints({
          advanced: [{ torch: nextState } as any],
        });
        setIsTorchOn(nextState);
      } catch (e) {
        console.warn('Torch toggle failed:', e);
      }
    }
  };

  const toggleCameraFacing = () => {
    setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Process captured/uploaded photo of a barcode
  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingImage(true);
    setError(null);

    try {
      const imgUrl = URL.createObjectURL(file);
      const img = new Image();

      img.onload = async () => {
        try {
          // 1. Try BarcodeDetector first
          if ('BarcodeDetector' in window) {
            try {
              const detector = new (window as any).BarcodeDetector({
                formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e'],
              });
              const barcodes = await detector.detect(img);
              if (barcodes.length > 0 && barcodes[0].rawValue) {
                handleSuccessfulScan(barcodes[0].rawValue);
                URL.revokeObjectURL(imgUrl);
                setIsProcessingImage(false);
                return;
              }
            } catch {}
          }

          // 2. Fallback to ZXing
          const reader = new BrowserMultiFormatReader();
          const result = await reader.decodeFromImageUrl(imgUrl);
          if (result && result.getText()) {
            handleSuccessfulScan(result.getText());
          } else {
            setError('لم يتم العثور على باركود مقروء في الصورة. يرجى توجيه الكاميرا بشكل مستقيم مع إضاءة جيدة أو كتابة الرقم.');
          }
        } catch (decodeErr) {
          setError('تعذر قراءة الباركود من الصورة. يرجى التأكد من وضوح خطوط الباركود أو إدخال الرقم يدوياً.');
        } finally {
          URL.revokeObjectURL(imgUrl);
          setIsProcessingImage(false);
        }
      };

      img.onerror = () => {
        setError('تعذر فتح الصورة المحددة');
        URL.revokeObjectURL(imgUrl);
        setIsProcessingImage(false);
      };

      img.src = imgUrl;
    } catch (err) {
      setError('حدث خطأ أثناء معالجة الصورة');
      setIsProcessingImage(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-700 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 bg-slate-800/95 border-b border-slate-700/80 flex items-center justify-between text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-xs shrink-0">
              <Camera className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">{title}</h3>
              <p className="text-[11px] text-slate-300">كاميرا الموبايل وماسح الباركود التلقائي</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Flip Camera */}
            <button
              type="button"
              onClick={toggleCameraFacing}
              className="p-2 rounded-xl bg-slate-700/80 text-slate-300 border border-slate-600 hover:text-white transition"
              title="تبديل الكاميرا (أمامية / خلفية)"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {hasTorch && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`p-2 rounded-xl border transition ${
                  isTorchOn
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-slate-700/80 text-slate-300 border-slate-600 hover:text-white'
                }`}
                title={isTorchOn ? 'إطفاء الفلاش' : 'تشغيل الفلاش'}
              >
                <Zap className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                stopScan();
                onClose();
              }}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700/60 transition"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Video Viewport with Scan Reticle */}
        <div className="relative w-full aspect-4/3 bg-black flex items-center justify-center overflow-hidden">
          {error ? (
            <div className="p-5 text-center text-rose-300 flex flex-col items-center gap-2.5 max-w-sm">
              <AlertCircle className="w-9 h-9 text-rose-400" />
              <p className="text-xs sm:text-sm font-medium leading-relaxed">{error}</p>
              
              <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
                  }}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-3.5 py-2 rounded-xl border border-slate-700 font-semibold transition"
                >
                  إعادة تجربة الكاميرا
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 transition shadow-xs"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>التقاط صورة بكاميرا الهاتف</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
              />

              {/* Scanning Crosshair & Frame */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-64 h-36 border-2 border-blue-500/80 rounded-2xl relative shadow-lg">
                  {/* Corner accents */}
                  <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-blue-400 rounded-tl-xl" />
                  <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-blue-400 rounded-tr-xl" />
                  <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-blue-400 rounded-bl-xl" />
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-blue-400 rounded-br-xl" />

                  {/* Red Laser line animation */}
                  <div className="absolute left-2 right-2 top-1/2 h-0.5 bg-rose-500 shadow-sm shadow-rose-500 animate-pulse" />
                </div>
              </div>

              {isProcessingImage && (
                <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center text-white text-xs gap-2">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span>جاري تحليل الباركود...</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Quick Options: Photo Capture Fallback & Manual Input */}
        <div className="p-3.5 bg-slate-800/90 border-t border-slate-700/80 space-y-2.5">
          {/* Hidden File Input for Direct Camera Capture */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImageFile}
            className="hidden"
          />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 py-2 px-3 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition border border-slate-600 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-blue-400" />
              <span>التقاط / رفع صورة باركود</span>
            </button>
          </div>

          {/* Manual Barcode Input Fallback */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (manualCode.trim()) {
                handleSuccessfulScan(manualCode.trim());
              }
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="أو أدخل رقم الباركود يدوياً هنا..."
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-blue-500 transition text-right"
              dir="ltr"
            />
            <button
              type="submit"
              disabled={!manualCode.trim()}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition shrink-0 cursor-pointer flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" />
              <span>تطبيق</span>
            </button>
          </form>
        </div>

        {/* Bottom Bar */}
        <div className="px-4 py-2.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <span>يدعم جميع باركودات الأدوية والأجهزة الذكية</span>
          <span className="font-mono text-[10px] bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-slate-300">
            EAN-13 / Code-128 / QR
          </span>
        </div>
      </div>
    </div>
  );
};
