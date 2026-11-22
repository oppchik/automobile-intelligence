// Replace a calculated part only when its normalized name matches the selected offer.
// Unmatched offers remain visible, but do not silently increase the estimate.
export const normalizePartName = (name) => String(name || '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function applySelectedParts(estimate, selectedParts = []) {
  if (!estimate?.variants) return { estimate, replacements: [], unmatched: selectedParts };
  const baseParts = estimate.variants[0]?.parts || [];
  const matched = selectedParts.map((offer) => ({ offer, match: baseParts.find((part) => normalizePartName(part.name) === normalizePartName(offer.name)) })).filter((x) => x.match);
  const unmatched = selectedParts.filter((offer) => !matched.some((x) => x.offer.key === offer.key));
  // One offer per named position; the latest choice wins.
  const byName = new Map(matched.map(({ offer, match }) => [normalizePartName(match.name), offer]));
  const variants = estimate.variants.map((variant) => {
    let difference = 0;
    const parts = variant.parts.map((part) => {
      const offer = byName.get(normalizePartName(part.name));
      if (!offer) return part;
      const amount = Math.round(Number(offer.price) * (Number(offer.quantity) || 1));
      if (!Number.isFinite(amount) || amount < 0) return part;
      difference += amount - part.amount;
      return { ...part, base_price: Number(offer.price), amount, condition: offer.condition, seller: offer.seller, oem: offer.oem, selected_offer: true };
    });
    const amounts = { ...variant.amounts, parts: variant.amounts.parts + difference };
    // Contingency is a fraction of parts + labor in the existing estimate model.
    amounts.contingency = Math.round((amounts.parts + amounts.labor) * estimate.contingency_rate);
    amounts.total = amounts.parts + amounts.labor + amounts.diagnostic + amounts.contingency;
    return { ...variant, parts, amounts };
  });
  const dealerTotal = variants.find((v) => v.key === 'dealer')?.amounts.total ?? variants[0].amounts.total;
  for (const v of variants) {
    v.savings_vs_dealer = Math.max(0, dealerTotal - v.amounts.total);
    v.savings_percent = dealerTotal ? v.savings_vs_dealer / dealerTotal * 100 : 0;
  }
  const cheapest = variants.reduce((a, b) => a.amounts.total <= b.amounts.total ? a : b).key;
  return { estimate: { ...estimate, variants, cheapest }, replacements: [...byName.values()], unmatched };
}
