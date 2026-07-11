export type Role = "super_admin" | "admin" | "hub_manager" | "data_entry" | "rider";
export type PaymentType = "per_order" | "mg";
export type PayoutStatus = "pending" | "approved" | "rejected" | "paid";
export type AttendanceStatus = "present" | "absent" | "late" | "half_day";

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  phone: string | null;
  email: string | null;
  rider_code: string | null;
  client_rider_ref?: string | null;
  photo_url: string | null;
  aadhaar_number: string | null;
  pan_number: string | null;
  dl_number: string | null;
  vehicle_type: string | null;
  vehicle_number: string | null;
  joining_date: string | null;
  bank_name: string | null;
  account_number: string | null;
  ifsc: string | null;
  upi_id: string | null;
  emergency_contact: string | null;
  address: string | null;
  aadhaar_url: string | null;
  pan_url: string | null;
  dl_url: string | null;
  rider_type: PaymentType | null;
  hub_id: string | null;
  active: boolean;
  first_login: boolean;
  created_at: string;
  hubs?: Hub | null;
}

export interface Hub {
  latitude?: number | null;
  longitude?: number | null;
  geofence_radius_m?: number | null;
  geofence_enabled?: boolean | null;
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  manager_id: string | null;
  contact_number: string | null;
  status: "active" | "inactive";
  created_at: string;
}

export interface RateCard {
  id: string;
  rider_id: string;
  payment_type: PaymentType;
  rate_per_order: number;
  extra_km_rate: number;
  cod_incentive: number;
  fuel_allowance: number;
  weekly_bonus: number;
  monthly_bonus: number;
  daily_mg: number;
  monthly_mg: number;
  required_orders: number;
  working_hours: number;
  incentive_per_extra_order: number;
  overtime_rate: number;
  attendance_bonus: number;
  penalty_rate: number;
  effective_date: string;
}

export interface DataEntry {
  id: string;
  entry_date: string;
  hub_id: string | null;
  rider_id: string;
  entered_by: string | null;
  payment_type: PaymentType | null;
  total_orders: number;
  completed_orders: number;
  cancelled_orders: number;
  cod_orders: number;
  distance_km: number;
  earnings: number;
  incentive: number;
  extra_incentive?: number;
  penalty: number;
  net_amount: number;
  remarks: string | null;
  created_at: string;
  profiles?: Partial<Profile> | null;
  hubs?: Partial<Hub> | null;
}

export interface PayoutRequest {
  id: string;
  rider_id: string;
  amount: number;
  note: string | null;
  status: PayoutStatus;
  method: "bank" | "upi";
  processed_by: string | null;
  processed_at: string | null;
  paid_at: string | null;
  reference_number: string | null;
  admin_remarks: string | null;
  created_at: string;
  profiles?: Partial<Profile> | null;
}

export interface Attendance {
  id: string;
  rider_id: string;
  att_date: string;
  check_in: string | null;
  check_out: string | null;
  status: AttendanceStatus;
  remarks: string | null;
  profiles?: Partial<Profile> | null;
}

export interface Notification {
  id: string;
  user_id: string | null;
  audience: "user" | "staff";
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
}

export interface RiderWallet {
  rider_id: string;
  total_earned: number;
  total_paid: number;
  pending_amount: number;
  adjustments: number;
  wallet_balance: number;
}

export interface WalletAdjustment {
  id: string;
  rider_id: string;
  amount: number;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export const STAFF_ROLES: Role[] = ["super_admin", "admin", "hub_manager", "data_entry"];
export const ADMIN_ROLES: Role[] = ["super_admin", "admin"];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  hub_manager: "Hub Manager",
  data_entry: "Data Entry Operator",
  rider: "Rider",
};
