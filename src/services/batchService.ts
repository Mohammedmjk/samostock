import { Product, ProductBatch, calculateFEFOAnalysis } from '../types';

/**
 * Ensures a product has a valid, non-empty list of batches.
 * Synchronizes aggregate stockQuantity and earliest expiry date.
 */
export function normalizeProductBatches(product: Product): Product {
  const existingBatches: ProductBatch[] = Array.isArray(product.batches) && product.batches.length > 0
    ? [...product.batches]
    : [
        {
          id: `batch-${product.id}-initial`,
          batchNumber: product.batchNumber || 'LOT-DEFAULT',
          expiryDate: product.expiryDate || '2027-12-31',
          quantity: Math.max(0, product.stockQuantity || 0),
          receivedDate: product.updatedAt || new Date().toISOString().split('T')[0],
        },
      ];

  // Sort batches by FEFO (earliest expiry first)
  const sortedBatches = sortBatchesFEFO(existingBatches);
  
  // Total stock is the sum of valid batch quantities
  const totalStock = sortedBatches.reduce((sum, b) => sum + Math.max(0, b.quantity), 0);

  // Earliest active batch with quantity > 0, or first batch
  const activeBatch = sortedBatches.find(b => b.quantity > 0) || sortedBatches[0];

  return {
    ...product,
    batches: sortedBatches,
    stockQuantity: totalStock,
    batchNumber: activeBatch ? activeBatch.batchNumber : (product.batchNumber || 'N/A'),
    expiryDate: activeBatch ? activeBatch.expiryDate : (product.expiryDate || '2027-12-31'),
    isAvailable: totalStock > 0,
  };
}

/**
 * Sorts batches according to FEFO (First Expired, First Out)
 */
export function sortBatchesFEFO(batches: ProductBatch[]): ProductBatch[] {
  return [...batches].sort((a, b) => {
    const dateA = a.expiryDate || '9999-12-31';
    const dateB = b.expiryDate || '9999-12-31';
    return dateA.localeCompare(dateB);
  });
}

/**
 * Analyzes FEFO status, days until expiration, and risk classification
 */
export function analyzeFEFOStatus(productOrExpiry?: Product | string) {
  if (!productOrExpiry) return calculateFEFOAnalysis();
  const expiry = typeof productOrExpiry === 'string' ? productOrExpiry : productOrExpiry.expiryDate;
  return calculateFEFOAnalysis(expiry);
}

export interface FEFODispatchResult {
  success: boolean;
  updatedBatches: ProductBatch[];
  allocatedBatches: {
    batchNumber: string;
    expiryDate: string;
    quantity: number;
  }[];
  newTotalStock: number;
  error?: string;
}

/**
 * Enforces FEFO dispatch: deducts stock strictly from the earliest expiring batch(es).
 * Rejects negative stock and refuses dispatches exceeding current stock.
 */
export function dispatchFEFO(product: Product, requestedQty: number): FEFODispatchResult {
  if (requestedQty <= 0) {
    return {
      success: false,
      updatedBatches: product.batches || [],
      allocatedBatches: [],
      newTotalStock: product.stockQuantity,
      error: 'كمية الصرف المطلوبة يجب أن تكون أكبر من صفر.',
    };
  }

  const normalized = normalizeProductBatches(product);
  const currentTotal = normalized.stockQuantity;

  if (requestedQty > currentTotal) {
    return {
      success: false,
      updatedBatches: normalized.batches || [],
      allocatedBatches: [],
      newTotalStock: currentTotal,
      error: `الكمية المطلوبة (${requestedQty}) تتجاوز الرصيد الإجمالي المتوفر في المستودع (${currentTotal}). لا يسمح بالرصيد السالب!`,
    };
  }

  let remainingToFulfill = requestedQty;
  const updatedBatches: ProductBatch[] = [];
  const allocatedBatches: { batchNumber: string; expiryDate: string; quantity: number }[] = [];

  // Iterate over sorted FEFO batches
  for (const batch of normalized.batches!) {
    if (remainingToFulfill <= 0) {
      updatedBatches.push({ ...batch });
      continue;
    }

    if (batch.quantity <= 0) {
      updatedBatches.push({ ...batch });
      continue;
    }

    const alloc = Math.min(batch.quantity, remainingToFulfill);
    allocatedBatches.push({
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate,
      quantity: alloc,
    });

    updatedBatches.push({
      ...batch,
      quantity: batch.quantity - alloc,
    });

    remainingToFulfill -= alloc;
  }

  if (remainingToFulfill > 0) {
    return {
      success: false,
      updatedBatches: normalized.batches!,
      allocatedBatches: [],
      newTotalStock: currentTotal,
      error: 'تعذر تخصيص الدفعات بالشكل المطلوب لعدم كفاية رصيد التشغيلات النشطة.',
    };
  }

  const newTotalStock = updatedBatches.reduce((sum, b) => sum + Math.max(0, b.quantity), 0);

  return {
    success: true,
    updatedBatches: sortBatchesFEFO(updatedBatches),
    allocatedBatches,
    newTotalStock,
  };
}

/**
 * Adds a new lot/batch to a product or increments an existing lot.
 */
export function addOrUpdateBatch(
  product: Product,
  newBatch: {
    batchNumber: string;
    expiryDate: string;
    quantity: number;
    costPrice?: number;
    location?: string;
  }
): Product {
  const normalized = normalizeProductBatches(product);
  const batches = [...(normalized.batches || [])];

  const existingIdx = batches.findIndex(
    b => b.batchNumber.trim().toUpperCase() === newBatch.batchNumber.trim().toUpperCase()
  );

  if (existingIdx !== -1) {
    batches[existingIdx] = {
      ...batches[existingIdx],
      quantity: batches[existingIdx].quantity + Math.max(0, newBatch.quantity),
      expiryDate: newBatch.expiryDate || batches[existingIdx].expiryDate,
      costPrice: newBatch.costPrice ?? batches[existingIdx].costPrice,
      location: newBatch.location ?? batches[existingIdx].location,
    };
  } else {
    batches.push({
      id: `batch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      batchNumber: newBatch.batchNumber.trim().toUpperCase(),
      expiryDate: newBatch.expiryDate,
      quantity: Math.max(0, newBatch.quantity),
      receivedDate: new Date().toISOString().split('T')[0],
      costPrice: newBatch.costPrice,
      location: newBatch.location,
    });
  }

  const sorted = sortBatchesFEFO(batches);
  const totalStock = sorted.reduce((sum, b) => sum + b.quantity, 0);
  const primaryBatch = sorted.find(b => b.quantity > 0) || sorted[0];

  return {
    ...normalized,
    batches: sorted,
    stockQuantity: totalStock,
    batchNumber: primaryBatch.batchNumber,
    expiryDate: primaryBatch.expiryDate,
    isAvailable: totalStock > 0,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Adjusts a specific batch's stock strictly, isolating discrepancies.
 */
export function adjustSpecificBatch(
  product: Product,
  batchNumber: string,
  newQuantity: number
): { updatedProduct: Product; qtyBefore: number; qtyAfter: number; changeQty: number } {
  const normalized = normalizeProductBatches(product);
  const batches = [...(normalized.batches || [])];

  const idx = batches.findIndex(
    b => b.batchNumber.trim().toUpperCase() === batchNumber.trim().toUpperCase()
  );

  let qtyBefore = 0;
  const safeNewQty = Math.max(0, newQuantity);

  if (idx !== -1) {
    qtyBefore = batches[idx].quantity;
    batches[idx] = {
      ...batches[idx],
      quantity: safeNewQty,
    };
  } else {
    batches.push({
      id: `batch-${Date.now()}`,
      batchNumber: batchNumber.trim().toUpperCase(),
      expiryDate: normalized.expiryDate || '2027-12-31',
      quantity: safeNewQty,
      receivedDate: new Date().toISOString().split('T')[0],
    });
  }

  const sorted = sortBatchesFEFO(batches);
  const newTotalStock = sorted.reduce((sum, b) => sum + b.quantity, 0);
  const primaryBatch = sorted.find(b => b.quantity > 0) || sorted[0];

  const updatedProduct: Product = {
    ...normalized,
    batches: sorted,
    stockQuantity: newTotalStock,
    batchNumber: primaryBatch ? primaryBatch.batchNumber : 'N/A',
    expiryDate: primaryBatch ? primaryBatch.expiryDate : '2027-12-31',
    isAvailable: newTotalStock > 0,
    updatedAt: new Date().toISOString(),
  };

  return {
    updatedProduct,
    qtyBefore,
    qtyAfter: safeNewQty,
    changeQty: safeNewQty - qtyBefore,
  };
}
