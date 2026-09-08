import JsBarcode from 'jsbarcode';
import { Product } from '../types';

/**
 * Generates a unique 13-digit EAN-13 compatible barcode for pharmaceutical products
 * avoiding duplicates among existing inventory products.
 */
export function generateUniqueBarcode(existingProducts: Product[]): string {
  let newBarcode = '';
  let isDuplicate = true;
  let attempts = 0;

  // Set of all existing barcodes for O(1) lookup
  const existingSet = new Set<string>();
  existingProducts.forEach((p) => {
    if (p.barcode) existingSet.add(p.barcode.trim());
    if (p.barcodeAliases) {
      p.barcodeAliases.forEach((alias) => existingSet.add(alias.trim()));
    }
  });

  while (isDuplicate && attempts < 100) {
    // 625 is standard Jordan/Iraq pharmaceutical prefix, or 628 (regional)
    const prefix = '628';
    const randomPart = Math.floor(100000000 + Math.random() * 900000000).toString();
    const code12 = (prefix + randomPart).slice(0, 12);

    // Calculate EAN-13 check digit
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(code12[i], 10);
      sum += i % 2 === 0 ? digit : digit * 3;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    newBarcode = code12 + checkDigit;

    if (!existingSet.has(newBarcode)) {
      isDuplicate = false;
    }
    attempts++;
  }

  return newBarcode;
}

/**
 * Checks if a string is a valid numeric or alphanumeric barcode
 */
export function isValidBarcodeString(code: string): boolean {
  if (!code) return false;
  const trimmed = code.trim();
  return trimmed.length >= 3 && trimmed.length <= 48;
}

/**
 * Renders a barcode cleanly into an SVG element using JsBarcode
 */
export function renderBarcodeToSvg(
  svgElement: SVGSVGElement | null,
  value: string,
  options?: {
    format?: 'CODE128' | 'EAN13' | 'UPC' | 'pharmacode';
    width?: number;
    height?: number;
    displayValue?: boolean;
    fontSize?: number;
    margin?: number;
  }
): void {
  if (!svgElement || !value) return;

  try {
    const cleanValue = value.trim();
    // Decide format: If valid 13 digits, use EAN13, otherwise CODE128 for flexible alphanumeric
    const is13Digits = /^\d{13}$/.test(cleanValue);
    const chosenFormat = options?.format || (is13Digits ? 'EAN13' : 'CODE128');

    JsBarcode(svgElement, cleanValue, {
      format: chosenFormat,
      width: options?.width ?? 1.5,
      height: options?.height ?? 40,
      displayValue: options?.displayValue ?? true,
      fontSize: options?.fontSize ?? 12,
      margin: options?.margin ?? 2,
      textMargin: 2,
      font: 'monospace',
      background: 'transparent',
      lineColor: '#000000',
    });
  } catch {
    // Fallback to CODE128 if EAN-13 check digit fails
    try {
      JsBarcode(svgElement, value.trim(), {
        format: 'CODE128',
        width: options?.width ?? 1.5,
        height: options?.height ?? 40,
        displayValue: options?.displayValue ?? true,
        fontSize: options?.fontSize ?? 12,
        margin: options?.margin ?? 2,
        textMargin: 2,
        font: 'monospace',
        background: 'transparent',
        lineColor: '#000000',
      });
    } catch (e2) {
      console.warn('Barcode rendering error:', e2);
    }
  }
}
