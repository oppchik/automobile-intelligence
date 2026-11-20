/** Single source of truth for downstream MVP calculations. */
export function integrateMvp(calculation, estimate, market, variantIndex) {
  if (!calculation) return null;
  const variants = calculation.variants.map((v, i) => {
    const total = estimate?.variants?.[i]?.amounts?.total;
    if (!Number.isFinite(total) || total < 0) return { ...v };
    // Backend reconstructs cost from parts_cost + labor_cost + diagnostic + contingency.
    // Update the serialized components too, not only the frontend cost field.
    const original = Number(v.cost);
    const delta = total - original;
    const partsCost = Number(v.parts_cost ?? v.partsCost ?? 0) + delta;
    return { ...v, cost: total, parts_cost: partsCost, partsCost };
  });
  const marketReady = Number.isFinite(market?.as_is?.estimate) &&
    Number.isFinite(market?.after_repair?.estimate) &&
    market.as_is.estimate >= 0 && market.after_repair.estimate >= 0;
  return {
    ...calculation, variants,
    as_is_value: marketReady ? market.as_is.estimate : calculation.as_is_value,
    after_value: marketReady ? market.after_repair.estimate : calculation.after_value,
    mvp_source: marketReady ? 'local_demo_listings' : 'original_demo_engine',
    mvp_repair_cost: variants[variantIndex]?.cost ?? null,
  };
}
