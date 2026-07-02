# BM Xpress · Rider Payout Console

Production web app for **BM XPRESS LOGISTICS PRIVATE LIMITED** to manage hubs, riders,
daily data entry, MG & per-order earnings, payout requests, attendance and reports.

Built with Next.js 15 (App Router) + Supabase. The Supabase backend (database, auth,
storage, edge functions) is already live — this repository is only the website.

---

## What's inside

**Admin / staff side** (super admin, admin, hub manager, data entry operator)
- Dashboard with live stats and charts
- Hubs — create and manage delivery hubs
- Riders — onboarding with photo & documents, auto rider IDs (BMX-1001…), rate cards
- Daily Data Entry — orders in, net payout calculated automatically
- Pending Data Entry — see who hasn't been entered today (red highlight) + export
- Payouts — approve / reject / mark-paid with reference numbers, bulk approve
- Attendance — daily marking and monthly summary
- Reports — daily earnings, rider-wise, hub-wise, MG vs per-order, payouts (Excel/CSV/PDF)
- Settings — company profile, default payment rules, holidays, staff user management

**Rider side** (mobile-friendly)
- Home — wallet balance, today / week / month earnings, recent history
- Wallet — request a payout (checked against balance), see request history
- Attendance — self check-in / check-out, monthly summary
- Profile — update UPI / bank details, change password

---

## Deploy it (one-time, ~10 minutes)

You do **not** need to touch any code or settings — the Supabase connection is already
built in.

1. **Download & unzip** the project folder from this chat.
2. Open **GitHub Desktop** -> File > Add local repository -> pick the unzipped folder ->
   "create a repository" -> **Publish repository** (keep it Private).
3. Go to **vercel.com** -> Add New… > Project -> Import the repository you just published.
4. Leave every setting as-is and click **Deploy**. (No environment variables needed.)
5. After ~2 minutes Vercel gives you a live URL like `https://bmx-rider-panel.vercel.app`.

That's it — open the URL and log in.

---

## Logging in

- **Admin:** use your email **bidyutali50@gmail.com** and your password on the login page.
  You are set up as **Super Admin**, so you can create every other staff and rider account
  from inside the app (Settings > User Management, and Riders > Onboard rider).
- **Riders & staff** log in with the mobile number or email and the temporary password you
  set for them; they're asked to choose a new password on first login.

---

## Good to know

- All money is calculated on the server rules (rate cards), so data entry can't be fudged.
- Rider documents are stored privately — only staff can view them via secure links.
- Everything updates in real time (new payout requests, notifications) without refreshing.
- If you ever need to change the look or add a feature, just ask.
