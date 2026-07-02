import type { PaymentType, RateCard } from "./types";

export interface EntryInput {
  completed_orders: number;
  cod_orders: number;
  distance_km: number;
  penalty: number;
  extra_incentive?: number;
}

export interface CalcResult {
  earnings: number;
  incentive: number;
  penalty: number;
  net: number;
  breakdown: string[];
}

/**
 * Per Order:  Net = Completed Orders × Rate + Incentives − Penalties
 * MG:         Net = Daily MG (if required orders met, else pro-rata)
 *                   + extra orders × incentive − Penalties
 */
export function calculateEarnings(
  paymentType: PaymentType,
  rate: Partial<RateCard>,
  entry: EntryInput
): CalcResult {
  const breakdown: string[] = [];
  let earnings = 0;
  let incentive = entry.extra_incentive ?? 0;
  const penalty = Number(entry.penalty || 0);

  if (paymentType === "per_order") {
    const base = entry.completed_orders * Number(rate.rate_per_order || 0);
    earnings = base;
    breakdown.push(`${entry.completed_orders} orders × \u20B9${rate.rate_per_order || 0} = \u20B9${base}`);

    const km = entry.distance_km * Number(rate.extra_km_rate || 0);
    if (km > 0) { incentive += km; breakdown.push(`${entry.distance_km} km × \u20B9${rate.extra_km_rate} = \u20B9${km}`); }

    const cod = entry.cod_orders * Number(rate.cod_incentive || 0);
    if (cod > 0) { incentive += cod; breakdown.push(`${entry.cod_orders} COD × \u20B9${rate.cod_incentive} = \u20B9${cod}`); }

    const fuel = Number(rate.fuel_allowance || 0);
    if (fuel > 0) { incentive += fuel; breakdown.push(`Fuel allowance \u20B9${fuel}`); }
  } else {
    const dailyMG = Number(rate.daily_mg || 0);
    const required = Number(rate.required_orders || 0);
    if (required > 0 && entry.completed_orders < required) {
      // pro-rata below target
      earnings = Math.round((entry.completed_orders / required) * dailyMG);
      breakdown.push(`${entry.completed_orders}/${required} orders → pro-rata MG \u20B9${earnings}`);
    } else {
      earnings = dailyMG;
      breakdown.push(`MG target met → \u20B9${dailyMG}`);
      const extra = required > 0 ? entry.completed_orders - required : 0;
      if (extra > 0) {
        const extraPay = extra * Number(rate.incentive_per_extra_order || 0);
        incentive += extraPay;
        breakdown.push(`${extra} extra × \u20B9${rate.incentive_per_extra_order} = \u20B9${extraPay}`);
      }
    }
    const cod = entry.cod_orders * Number(rate.cod_incentive || 0);
    if (cod > 0) { incentive += cod; breakdown.push(`${entry.cod_orders} COD × \u20B9${rate.cod_incentive} = \u20B9${cod}`); }
  }

  const attendanceBonus = Number(rate.attendance_bonus || 0);
  if (attendanceBonus > 0) {
    incentive += attendanceBonus;
    breakdown.push(`Attendance bonus \u20B9${attendanceBonus}`);
  }

  if (penalty > 0) breakdown.push(`Penalty −\u20B9${penalty}`);

  const net = earnings + incentive - penalty;
  return { earnings, incentive, penalty, net, breakdown };
}
