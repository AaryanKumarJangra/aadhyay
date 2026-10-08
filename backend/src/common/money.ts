/** GST split. Intra-state (same state code) → CGST 9% + SGST 9%; inter-state → IGST 18%. Amounts in paise. */
export function gstSplit(subtotalPaise: number, supplierState: string, placeOfSupply: string, rate = 0.18) {
  const tax = Math.round(subtotalPaise * rate);
  if (supplierState === placeOfSupply) {
    const half = Math.floor(tax / 2);
    return { cgstPaise: half, sgstPaise: tax - half, igstPaise: 0, taxPaise: tax, totalPaise: subtotalPaise + tax };
  }
  return { cgstPaise: 0, sgstPaise: 0, igstPaise: tax, taxPaise: tax, totalPaise: subtotalPaise + tax };
}
export const rupees = (p: number) => (p / 100).toFixed(2);
/** Indian financial year label for a date, e.g. 2026-27. */
export function financialYear(d = new Date()) {
  const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}
