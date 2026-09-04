import { useEffect, useRef } from 'react';

interface UseHardwareBarcodeScannerOptions {
  onScan: (barcode: string) => void;
  enabled?: boolean;
  minBarcodeLength?: number;
  maxKeyIntervalMs?: number;
  enableSound?: boolean;
}

/**
 * Hook to natively capture barcode scans from USB / Bluetooth HID barcode readers
 * without interfering with regular user typing or stealing focus.
 */
export function useHardwareBarcodeScanner({
  onScan,
  enabled = true,
  minBarcodeLength = 3,
  maxKeyIntervalMs = 55, // External scanners transmit characters in < 20-50ms
  enableSound = true,
}: UseHardwareBarcodeScannerOptions) {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const isScannerBurstRef = useRef<boolean>(false);

  // Play audio beep upon successful scan
  const playBeep = () => {
    if (!enableSound) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, audioCtx.currentTime); // High pitch crisp beep
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.08);
    } catch {}
  };

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore modifier keys
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(e.key)) {
        return;
      }

      const now = Date.now();
      const timeSinceLastKey = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Check if keystroke is part of a high-speed scanner burst
      if (timeSinceLastKey <= maxKeyIntervalMs) {
        isScannerBurstRef.current = true;
      } else if (timeSinceLastKey > 150) {
        // Reset if human typing pause
        bufferRef.current = '';
        isScannerBurstRef.current = false;
      }

      // Enter key indicates end of barcode transmission from scanner
      if (e.key === 'Enter') {
        const barcode = bufferRef.current.trim();
        if (barcode.length >= minBarcodeLength && isScannerBurstRef.current) {
          // Prevent form submission or newline
          e.preventDefault();
          e.stopPropagation();
          playBeep();
          onScan(barcode);
        }
        bufferRef.current = '';
        isScannerBurstRef.current = false;
        return;
      }

      // Collect alphanumeric and standard barcode characters
      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [enabled, onScan, minBarcodeLength, maxKeyIntervalMs, enableSound]);
}
