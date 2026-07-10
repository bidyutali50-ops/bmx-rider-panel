import type { PaymentType, RateCard } from "./types";

export interface EntryInput {
  completed_orders: number;
  cod_orders: number;
  distance_km: number;
  penalty: number;
  extra_incentive?: number;
}

export interface BreakdownLine {
  label: string;
  value: number;
  /** true for lines that reduce the payout */
  negative?: boolean;
}

export interface CalcResult {
  earnings: number;
  incentive: number;
  penalty: number;
  net: number;
  breakdown: BreakdownLine[];
  /** Rate-card problems that stop the amount from responding to orders */
  warnings: string[];
}

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Per Order:  Net = Completed Orders x Rate + Incentives - Penalties
 * MG:         Net = Daily MG (pro-rata if below required orders)
 *                   + extra orders x incentive + COD - Penalties
 */
export function calculateEarnings(
  paymentType: PaymentType,
  rate: Partial<RateCard>,
  entry: EntryInput
): CalcResult {
  const breakdown: BreakdownLine[] = [];
  const warnings: string[] = [];

  const completed = n(entry.completed_orders);
  const codOrders = n(entry.cod_orders);
  const km = n(entry.distance_km);
  const penalty = n(entry.penalty);

  let earnings = 0;
  let incentive = n(entry.extra_incentive);

  if (incentive > 0) breakdown.push({ label: "Extra incentive", value: incentive });

  if (paymentType === "per_order") {
    const perOrder = n(rate.rate_per_order);
    if (perOrder <= 0) {
      warnings.push("Rate per order is \u20B90 \u2014 set it on the rider's Rate Card, otherwise earnings stay zero.");
    }

    earnings = round2(completed * perOrder);
    breakdown.push({ label: `${completed} orders \u00D7 \u20B9${perOrder}`, value: earnings });

    const kmRate = n(rate.extra_km_rate);
    const kmPay = round2(km * kmRate);
    if (kmPay > 0) { incentive += kmPay; breakdown.push({ label: `${km} km \u00D7 \u20B9${kmRate}`, value: kmPay }); }

    const codRate = n(rate.cod_incentive);
    const cod = round2(codOrders * codRate);
    if (cod > 0) { incentive += cod; breakdown.push({ label: `${codOrders} COD \u00D7 \u20B9${codRate}`, value: cod }); }

    const fuel = n(rate.fuel_allowance);
    if (fuel > 0) { incentive += fuel; breakdown.push({ label: "Fuel allowance", value: fuel }); }
  } else {
    const dailyMG = n(rate.daily_mg);
    const required = n(rate.required_orders);

    if (dailyMG <= 0) warnings.push("Daily MG is \u20B90 \u2014 set it on the rider's Rate Card.");
    if (required <= 0) {
      warnings.push("Required orders per day is 0, so the full MG is paid no matter how many orders are done. Set a target on the Rate Card to enable pro-rata pay and extra-order incentives.");
    }

    if (required > 0 && completed < required) {
      earnings = round2((completed / required) * dailyMG);
      breakdown.push({ label: `${completed}/${required} orders \u2192 pro-rata MG`, value: earnings });
    } else {
      earnings = dailyMG;
      breakdown.push({ label: required > 0 ? `MG target met (${required} orders)` : "Daily MG", value: dailyMG });

      const extra = required > 0 ? completed - required : 0;
      if (extra > 0) {
        const perExtra = n(rate.incentive_per_extra_order);
        if (perExtra <= 0) {
          warnings.push(`${extra} extra order(s) earn nothing \u2014 "Incentive per extra order" is \u20B90 on the Rate Card.`);
        } else {
          const extraPay = round2(extra * perExtra);
          incentive += extraPay;
          breakdown.push({ label: `${extra} extra \u00D7 \u20B9${perExtra}`, value: extraPay });
        }
      }
    }

    const codRate = n(rate.cod_incentive);
    const cod = round2(codOrders * codRate);
    if (cod > 0) { incentive += cod; breakdown.push({ label: `${codOrders} COD \u00D7 \u20B9${codRate}`, value: cod }); }
  }

  const attendanceBonus = n(rate.attendance_bonus);
  if (attendanceBonus > 0) {
    incentive += attendanceBonus;
    breakdown.push({ label: "Attendance bonus", value: attendanceBonus });
  }

  if (penalty > 0) breakdown.push({ label: "Penalty", value: penalty, negative: true });

  incentive = round2(incentive);
  earnings = round2(earnings);
  const net = round2(earnings + incentive - penalty);

  return { earnings, incentive, penalty, net, breakdown, warnings };
}
