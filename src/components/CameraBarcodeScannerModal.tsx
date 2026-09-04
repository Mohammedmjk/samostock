import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { X, Camera, Zap, RefreshCw, AlertCircle } from 'lucide-react';

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
  const [error, setError] = useState<string | null>(null);
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
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
        const reader = new BrowserMultiFormatReader();
        codeReaderRef.current = reader;

        // Try getting video stream with ideal environment camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!isMounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();

          // Check torch capability
          const track = stream.getVideoTracks()[0];
          const capabilities = (track.getCapabilities?.() as any) || {};
          if (capabilities.torch) {
            setHasTorch(true);
          }

          // Native BarcodeDetector check for highest performance
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
              console.warn('BarcodeDetector initialization skipped, using ZXing reader fallback:', err);
            }
          }

          // ZXing decoding fallback
          reader.decodeFromVideoElement(videoRef.current, (result, err) => {
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
          setError(
            err.name === 'NotAllowedError'
              ? 'يرجى منح صلاحية استخدام الكاميرا لمسح الباركود'
              : 'تعذر الوصول إلى الكاميرا. يرجى التأكد من توصيلها وعدم استخدامها في تطبيق آخر.'
          );
        }
      }
    };

    startScanning();

    return () => {
      isMounted = false;
      stopScan();
    };
  }, [isOpen]);

  const stopScan = () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (codeReaderRef.current) {
        // Stop any active decode
        codeReaderRef.current = null;
      }
    } catch {}
    setIsScanning(false);
    setIsTorchOn(false);
  };

  const handleSuccessfulScan = (barcode: string) => {
    // Play beep
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
    onDetected(barcode);
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-700 flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-800/90 border-b border-slate-700/80 flex items-center justify-between text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
              <Camera className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold">{title}</h3>
              <p className="text-[11px] text-slate-400">وجه الكاميرا نحو باركود علبة الدواء</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasTorch && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`p-2 rounded-xl border transition ${
                  isTorchOn
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-slate-700 text-slate-300 border-slate-600 hover:text-white'
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
            <div className="p-6 text-center text-rose-400 flex flex-col items-center gap-3">
              <AlertCircle className="w-10 h-10" />
              <p className="text-sm font-medium">{error}</p>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  window.location.reload();
                }}
                className="mt-2 text-xs bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl border border-slate-700"
              >
                إعادة المحاولة
              </button>
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
                <div className="w-64 h-40 border-2 border-blue-500/80 rounded-2xl relative shadow-lg">
                  {/* Corner accents */}
                  <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-blue-400 rounded-tl-xl" />
                  <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-blue-400 rounded-tr-xl" />
                  <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-blue-400 rounded-bl-xl" />
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-blue-400 rounded-br-xl" />

                  {/* Red Laser line animation */}
                  <div className="absolute left-2 right-2 top-1/2 h-0.5 bg-rose-500 shadow-sm shadow-rose-500 animate-pulse" />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Bottom Hint */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>يدعم ماسحات الباركود السلكية واللاسلكية تلقائياً</span>
          <span className="font-mono text-[10px] bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-slate-300">
            EAN-13 / Code-128 / QR
          </span>
        </div>
      </div>
    </div>
  );
};
