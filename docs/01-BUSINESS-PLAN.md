# 01 — Business Plan, Pricing & Cost Model

> All amounts in **INR**. Every price shows the **ex-GST** amount and the **incl. 18% GST** amount. Vendor costs were checked on **2026-10-07** (see §14 Cost sources); re-check before purchase. This is a planning document, not tax or legal advice; confirm tax items with a Chartered Accountant.

---

## 1. Summary

**Aadhyay** is one multi-tenant platform that runs a whole institution: students, academics, attendance, fees, exams, transport with live bus tracking, HR, library, hostel, CRM, website and SEO, LMS. It also includes a **free, unlimited, end-to-end-encrypted messenger** (chat, voice and video calls) for everyone, plus an **optional official WhatsApp channel** billed at Meta cost + GST + a small fee.

| Item | Decision |
|------|----------|
| Segments | K-12 schools (first), coaching centres, colleges, private institutes, creator-educators |
| Launch geography | Delhi NCR (Delhi, Noida, Greater Noida, Ghaziabad, Gurugram, Faridabad) + West UP (Meerut, Muzaffarnagar, Saharanpur, Bulandshahr, Hapur, Baghpat, Moradabad, Aligarh, Bijnor) |
| Team | 2 founders (no salaries; paid from the 20% profit share) |
| Funding | ₹0 seed; free tiers until the first payment; every later expense paid from collections |
| Profit rule | Net profit after all costs and income tax → **80% reinvested** in the company, **20% to founders** |
| Spend rule | Monthly expenses may never exceed **60% of the trailing-3-month average net collections** (§9). This rules out "income ₹50k, expenses ₹1 lakh". |
| Apps | One **common app** "Aadhyay" (pick institution → login), plus paid **white-label flavours** per institution |
| Messaging | Aadhyay Messenger free for all; WhatsApp official API optional and pass-through |

---

## 2. Market (Delhi NCR + West UP focus)

What institutions pay today (public research, Oct 2026):

| Player | Typical price signal | Our gap to exploit |
|--------|---------------------|--------------------|
| Entry school SaaS (<200 students) | ₹12,000–₹30,000 / year | We are at or below this, with more modules |
| Mid-tier (200–800 students) | ₹25,000–₹90,000 / year | Same range, plus CRM, website, messenger and bus tracking |
| Fedena | ₹60,000–₹1,10,000 / year (mid-size) | Dated UX, weak communication automation |
| Entab CampusCare | ₹1.5–8 lakh / year (large) | Too expensive for small and mid schools |
| Teachmint | ≈₹100–300 per student per year | ERP depth still maturing |
| Classplus (coaching) | From ≈₹15,000 / year | App sits under the vendor's account |
| Graphy (creators) | ≈₹4,000–₹15,000 / month | Not built for physical institutions |

**Why our region first:** dense clusters of 300–1,500-student CBSE and UP-Board schools in Meerut, Ghaziabad, Noida and Muzaffarnagar; heavy school-bus use (so bus tracking sells); parents are WhatsApp-native (so the messenger plus WhatsApp sells); and the founders can do in-person demos within a day's travel.

---

## 3. Pricing philosophy

1. **Small and mid institutions pay a fair, low price.** Per-student pricing with a low monthly floor.
2. **Large institutions pay more absolute rupees for premium value**: Enterprise plan, SLA, dedicated account manager, dedicated database, custom domain bundles. This is where we keep a higher margin.
3. **Usage that costs us money is pass-through from a prepaid wallet** (WhatsApp, SMS, AI voice, video streaming), so usage can never create a loss.
4. **Yearly billing = pay 10 months, get 12.** Quarterly billing is at list price.
5. **All prices live in the control-plane price book**, each with a list value, minimum and maximum. Account managers set the exact price inside the range; anything outside the range needs Super Admin approval and is logged.
6. **GST**: Aadhyay registers for GST voluntarily from the first invoice. This gives proper tax invoices and lets us claim ITC on our cloud and Meta bills. Schools are often GST-exempt and can't claim ITC, so we always show the **incl. GST** price to them, never hide it.

---

## 4. Price list — schools, colleges, private institutes

### 4.1 Plans (per **active** student per month)

| | **Essential** | **Professional** | **Enterprise** |
|---|---|---|---|
| Price / student / month (ex GST) | ₹6 | ₹10 | ₹15 |
| Incl. GST | ₹7.08 | ₹11.80 | ₹17.70 |
| Minimum per month (ex GST) | ₹1,199 | ₹2,999 | ₹7,999 |
| Minimum incl. GST | ₹1,415 | ₹3,539 | ₹9,439 |
| Price range in price book (ex GST) | ₹5–₹8 | ₹8–₹13 | ₹13–₹20 |
| Core: SIS, academics, timetable, calendar, attendance (manual/QR), homework, exams + report cards, certificates/ID cards, fees + online payments, front office, communication engine, **Aadhyay Messenger**, common app (parent/student/teacher/driver), website on subdomain, standard reports, compliance exports | ✅ | ✅ | ✅ |
| Lesson plans, CBSE/HPC report cards, online exams, LMS, live classes, accounts, HR & payroll, library, inventory, behaviour, alumni, CV builder, CRM, transport (driver-app tracking), custom report builder | Add-ons | ✅ | ✅ |
| Multi-branch, hostel, BI dashboards, AI copilot (with credits), SSO, IP allow-list, custom domain (BYO), priority support, 99.9% SLA, dedicated account manager | Add-ons | Some add-ons | ✅ |
| Support | Chat + email, business hours | Phone + chat, extended hours | Dedicated manager, priority SLA |

### 4.2 Strength bands — setup fee and volume discount

| Band | Active students | Setup fee (one-time, ex GST) | Incl. GST | Subscription volume discount |
|------|-----------------|------------------------------|-----------|------------------------------|
| S1 | up to 300 | ₹4,999 | ₹5,899 | — |
| S2 | 301–750 | ₹9,999 | ₹11,799 | — |
| S3 | 751–1,500 | ₹19,999 | ₹23,599 | — |
| S4 | 1,501–3,000 | ₹34,999 | ₹41,299 | 10% |
| S5 | 3,001–6,000 | ₹54,999 | ₹64,899 | 15% |
| S6 | 6,000+ / university / multi-campus | Custom (min ₹99,999) | — | Custom contract |

Early-conversion offer: pay before day 60 of the trial and get **50% off the setup fee**.

### 4.3 Worked examples (yearly billing = 10 months)

| Institution | Choice | Year-1 ex GST | Year-1 incl. GST | Effective ₹/student/yr |
|-------------|--------|---------------|------------------|------------------------|
| School, 150 students | Essential (floor ₹1,199 × 10) + setup ₹4,999 | ₹16,989 | ₹20,047 | ₹113 |
| School, 250 students | Essential (250 × ₹6 × 10) + setup ₹4,999 | ₹19,999 | ₹23,599 | ₹80 |
| School, 600 students | Essential (600 × ₹6 × 10) + setup ₹9,999 | ₹45,999 | ₹54,279 | ₹77 |
| CBSE school, 800 students | Professional (800 × ₹10 × 10) + setup ₹19,999 | ₹99,999 | ₹1,17,999 | ₹125 |
| School, 2,000 students | Professional, 10% off (₹1,80,000) + setup ₹34,999 | ₹2,14,999 | ₹2,53,699 | ₹107 |
| Group, 2,500 students, 3 branches | Enterprise, 10% off (₹3,37,500) + setup ₹34,999 | ₹3,72,499 | ₹4,39,549 | ₹149 |
| College, 4,000 students | Professional + College pack (₹13), 15% off + setup ₹54,999 | ₹4,96,999 | ₹5,86,459 | ₹124 |

Year 2 onwards = subscription only (no setup fee).

---

## 5. Price list — coaching centres and creators

| Plan | Price / month (ex GST) | Incl. GST | Includes | Active learner limit |
|------|------------------------|-----------|----------|----------------------|
| Creator Starter | ₹999 | ₹1,179 | Storefront website, courses, notes, tests, payments at 0% platform commission, community, certificates, Messenger | 300 |
| Coaching Growth | ₹3,999 | ₹4,719 | Starter + batches, attendance, fees, live classes, test series with ranks, CRM, common app | 2,000 |
| Coaching Pro | ₹9,999 | ₹11,799 | Growth + multi-centre, DRM video, AI doubt assistant, advanced analytics | 10,000 |
| Beyond limit | ₹2 per extra active learner per month | ₹2.36 | Same | — |
| Setup | Creator ₹0 (self-serve); Coaching ₹3,999 | ₹4,719 | Migration and training | — |

Video storage and streaming are billed from the wallet at provider cost + 15%.

---

## 6. Add-on price list (ex GST; add 18% GST on invoice)

| Add-on | Price | Notes |
|--------|-------|-------|
| Transport GPS hardware integration | ₹199 per vehicle / month | Driver-app tracking is free on Professional and above; this add-on is for AIS-140 devices. Hardware and SIM quoted separately. |
| Device attendance (RFID / face / biometric) | ₹1 per student / month | Hardware at cost or via partners; installation charged once |
| College pack (CBCS, university exams, NAAC/NIRF/AISHE, placements) | ₹3 per student / month | Any plan |
| Hostel | ₹1 per student / month | Included in Enterprise |
| Extra branch | ₹1,499 per branch / month | Included in Enterprise |
| HR & payroll on Essential | ₹399 / month + ₹12 per staff / month | Included in Professional and above |
| AI copilot on Essential / Professional | ₹799 / month incl. credits | Extra credits from wallet |
| **WhatsApp Channel (official Meta Cloud API)** | One-time onboarding ₹1,999 + **Meta's rate + ₹0.04 per message** + 18% GST on the total | Template builder, Flow builder and inbox included. See §7. |
| SMS (DLT) | ₹0.20 per SMS | OTP and fallback only |
| AI voice agent | ₹7 per connected minute; 1,000-minute pack ₹5,999 | Wallet |
| Extra storage | ₹129 per 25 GB / month | Base quota: 200 MB per active student |
| Custom domain — bring your own | ₹1,999 / year | Included in Enterprise |
| Custom domain — managed (single) | ₹2,999 / year + registrar cost at actuals | Registered in the institution's name |
| Growth bundle (managed domain + SEO setup + 5 landing pages + monthly SEO report) | ₹8,999 / year | |
| **White-label app flavour — Android** | ₹9,999 one-time + ₹799 / month | Own name, icon, package id, signing key. Published on the institution's Google Play account (one-time US$25 Google fee paid by the institution) or on ours. |
| **White-label app flavour — iOS** | +₹9,999 one-time | Apple requires the institution's own Apple Developer account (US$99/year, paid by the institution) for white-label apps (App Store guideline 4.2.6). |
| Data entry / migration from paper | ₹3 per student record | Optional service |
| Custom development | Quoted | Prefer configuration over custom code |

**Common app is free.** Any institution that doesn't want its own flavour uses the "Aadhyay" app: the user selects their institution, logs in, and gets the institution's logo and colours at runtime.

---

## 7. Messaging: what costs what, and who pays

### 7.1 Channels

| Channel | Cost to Aadhyay | Price to institution | Notes |
|---------|-----------------|----------------------|-------|
| App push (FCM / APNs / Web Push) | ₹0 | Free, unlimited | Default for every routine alert |
| **Aadhyay Messenger** (chat, voice, video, E2EE) | Server and bandwidth only (§10.3) | **Free and unlimited for everyone**, including people with no institution | Our own protocol; no Meta involvement |
| WhatsApp official — utility | Meta ≈₹0.115 + 18% GST | Meta rate + ₹0.04 + GST = (0.115+0.04)×1.18 ≈ **₹0.183** per message | Free inside an open 24-hour service window |
| WhatsApp official — marketing | Meta ≈₹0.8631 + GST | (0.8631+0.04)×1.18 ≈ **₹1.066** per message | Admissions campaigns to leads only |
| WhatsApp official — authentication | Meta ≈₹0.115 + GST | Same as utility | OTP |
| WhatsApp service replies (user-initiated) | ₹0 | ₹0 | Always free |
| SMS (DLT) | ≈₹0.11–₹0.25 | ₹0.20 + GST | OTP and fallback only |
| Email | ₹0 (free tier) → ≈₹0.009 each at volume | Free | Receipts, reports |

### 7.2 Where to use WhatsApp vs Aadhyay vs both (the default routing policy)

The rule is **"App first, WhatsApp only where it adds value or where the person has no app."** Each institution can change this per event type in Settings → Communication → Routing.

| Event | Aadhyay app (push + Messenger) | WhatsApp (if Channel enabled) | Why |
|-------|-------------------------------|-------------------------------|-----|
| Login OTP | — (user not logged in) | ✅ authentication template on **Aadhyay's own number** (cost absorbed by Aadhyay) | Cheaper and more reliable than SMS; SMS fallback |
| Parent–teacher chat | ✅ only | ❌ | Free, private (teacher's number stays hidden), E2EE, moderated |
| Staff internal chat and calls | ✅ only | ❌ | Free |
| Daily attendance: present / arrival | ✅ only | ❌ | High volume, low urgency |
| Absence alert | ✅ | ✅ **fallback only** if the parent hasn't opened the app in 7 days | Important but frequent |
| Homework, diary, timetable, notices | ✅ only | ❌ | Routine |
| Fee due reminder (before due date) | ✅ | ❌ | Routine |
| Fee overdue (after due date) | ✅ | ✅ both, with payment link | Money matters; highest ROI |
| Fee receipt | ✅ (PDF) | Optional | |
| Exam results / report card published | ✅ | ✅ both (one summary message) | High importance, low frequency |
| Bus trip started + live link | ✅ live map in app | ✅ **only for parents without the app** | Daily volume is huge, so keep it in-app |
| Bus near stop / child boarded / dropped | ✅ only | ❌ | Real-time, in-app |
| SOS / emergency / rain holiday | ✅ | ✅ both (+ SMS if undelivered in 2 min) | Safety |
| PTM / event invite | ✅ | Optional | |
| Admission enquiry follow-up (leads) | ❌ (lead has no app) | ✅ (marketing / utility) | Leads are outside the system |
| Renewal notices to institutions (Aadhyay → customer) | ✅ in-app banner | ✅ on Aadhyay's number | Our own billing |

**Effect:** a 1,000-student school that uses WhatsApp for everything would spend about ₹4,000/month on Meta fees. With this routing, typical spend is **₹300–₹900/month**, paid from their wallet.

### 7.3 Multi-child families (applies to every channel)
- Messages are **per student**: a parent with 2 children gets 2 separate messages for per-child events (attendance, fees, results), each clearly labelled with the child's name and class.
- **Bus links:** if both children ride the **same bus on the same trip**, the parent gets **one** link showing both children (and both stops if they differ). If they ride **different buses**, the parent gets **one link per bus**.
- Institution-wide notices (holiday, circular) go **once per parent**, not once per child.

---

## 8. Trial and lifecycle (commercial rules)

| Rule | Value |
|------|-------|
| Free trial | 90 days, all Enterprise features, up to 2 branches, 5 GB storage, wallet starter credit ₹100 |
| Day-60 | Automatic ROI report sent to the owner |
| Renewal alerts | From 15 days before expiry: email + WhatsApp (Aadhyay's number) + in-app banner on every admin login; pop-up from T-3 |
| Grace | 30 days after expiry, everything works with a red banner |
| Suspended | After grace: admin sees only Pay Now + Export Data; staff see "service paused"; parents and students see a neutral message; automations stop (warning sent 7 days before) |
| Data retention | 12 months after suspension (cold storage after 90 days), with final notices at 30/7/1 days; then permanent deletion plus a deletion certificate |
| Trial-only data | Deleted 6 months after trial end if never converted |

---

## 9. Cash discipline (the "never spend more than we earn" rules)

1. **Spend ceiling:** total monthly expenses ≤ **60%** of the trailing-3-month average **net collections** (collections minus GST payable). The control plane shows this as a live gauge and blocks new recurring vendor subscriptions above it, unless a founder overrides it with a written reason.
2. **Stage gates for infrastructure:** move up a hosting stage (§10.1) only when the tenant count for that stage is reached **and** the spend ceiling allows it.
3. **Usage is always prepaid.** WhatsApp, SMS, AI voice and video run from the institution wallet. Wallet at ₹0 means automatic fallback to free channels (push / Messenger); it never sends on credit.
4. **GST cash is not our money.** Every GST collection is moved to a separate "GST reserve" bank account on the day it's received and paid by the 20th of the next month (GSTR-3B).
5. **Income-tax reserve:** keep 26% of each month's profit aside for advance-tax instalments.
6. **Profit distribution:** each quarter, after the GST and income-tax reserves and a 3-month operating buffer are funded, distributable net profit is split **80% reinvest / 20% founders**. If the buffer isn't full, the founders' 20% is deferred (not lost) to the next quarter.
7. **First hire rule:** hire only when (a) the spend ceiling allows the full annual cost and (b) the role is listed in §11.

---

## 10. Cost model

### 10.1 Infrastructure by stage (monthly, ex GST — we claim ITC on the GST)

| Stage | Trigger | Setup | Monthly cost |
|-------|---------|-------|--------------|
| **0 — Build & pilots** | Before first payment | Oracle Cloud Always Free ARM VM (up to 4 OCPU / 24 GB / 200 GB / 10 TB egress) in Mumbai or Hyderabad; PostgreSQL + Redis + coturn + LiveKit in Docker on the same VM; Cloudflare Free (DNS, CDN, SSL, WAF); Cloudflare R2 free 10 GB; Resend free (3,000 emails/month); FCM free; GitHub free | **₹0** (+ domain renewal ≈₹100/month equivalent) |
| **A — First clients** | 1st payment → 10 tenants | Move to **E2E Networks Delhi NCR**: 1 × E1LC-4.12GB (4 vCPU, 12 GB) app + realtime ₹1,788; 1 × E1LC-2.6GB (2 vCPU, 6 GB) PostgreSQL ₹894; object storage ₹625 (250 GB); Google Play one-time US$25 ≈₹2,200 (amortised); Apple Developer US$99/yr ≈₹725/month; tools ≈₹500 | **≈₹4,600** |
| **B — Early** | 11–49 tenants | 2 × app nodes ₹3,576; dedicated-CPU DB SDC3-4.30GB ₹6,954; storage ≈₹1,600; Resend Pro US$20 ≈₹1,760; Apple ₹725; CA / compliance ≈₹3,000; misc ≈₹1,500 | **≈₹19,100** |
| **C — Growth** | 50–199 tenants | 3–4 app/worker nodes, primary + replica DB, dedicated realtime node, backups to a second region (Chennai), monitoring; **+1 support executive (₹20,000)**; from 100 tenants **+1 support (₹20,000) +1 developer (₹50,000)** | **≈₹75,000 → ≈₹1,45,000** |
| **D — Scale** | 200+ tenants | HA Postgres cluster, autoscaling, dedicated messaging/realtime services, 2–3 more hires | **≈₹2,20,000+** |

### 10.2 Variable cost per paying tenant (monthly)
| Item | Cost |
|------|------|
| Payment gateway on our subscription collections | ≈2% of the amount |
| Platform OTP on Aadhyay's WhatsApp number (absorbed) | ≈₹50 |
| Incremental compute and storage | ≈₹150 |
| **Total** | ≈₹200 + 2% |

### 10.3 Free unlimited Messenger: how we keep it cheap without user-facing limits
"Unlimited" is a product promise. These **engineering** choices keep it affordable without capping users:
1. **Text** is tiny (≈1 KB per message): 10 lakh messages ≈ 1 GB.
2. **Media** is compressed on the device (images to WebP/AVIF at about 200 KB, video to H.264 720p). Files are encrypted and stored on object storage **only until every recipient device has downloaded them, or 30 days, whichever comes first** (the same model WhatsApp uses). Users keep their own copies on their devices and can back up to their own Google Drive or iCloud. Standing storage ≈ 50 GB per 1,000 active users ≈ **₹125/month**.
3. **1:1 calls are peer-to-peer** (WebRTC). Only about 15% need a TURN relay (self-hosted coturn on our VM). Group calls use self-hosted LiveKit SFU. Estimate: about 100 GB relay traffic per 1,000 active users per month, covered by included VM bandwidth at Stages 0–B.
4. **Anti-abuse, not caps:** rate limits only for spam patterns (for example, more than 60 new-contact messages per minute), with report/block buttons. Normal users never hit them.
5. **Monitoring:** cost per 1,000 free users is a KPI on the control plane. If it goes above ₹500/month, founders review it.

---

## 11. P&L scenarios (monthly, steady state)

**Assumptions (change these in the control-plane model):** average school subscription ₹50,000/year ex GST; average setup ₹10,000 with 50% of tenants new each year; usage margin ≈₹150/tenant/month; variable cost ₹200 + 2%; fixed cost by stage per §10.1; company form **Private Limited** with income tax ≈**25.17%** (Sec. 115BAA; confirm with a CA). GST is excluded from the P&L because it is collected and paid through.

| Paying tenants | Revenue / month | Variable | Fixed | Profit before tax | Tax (25.17%) | **Net profit** | **80% reinvest** | **20% founders** |
|---|---|---|---|---|---|---|---|---|
| 1 | ₹4,733 | ₹292 | ₹4,632 | ₹-190 | ₹0 | ₹-190 | — | — |
| 3 | ₹14,200 | ₹875 | ₹4,632 | ₹8,693 | ₹2,188 | ₹6,505 | ₹5,204 | ₹1,301 |
| 5 | ₹23,667 | ₹1,458 | ₹4,632 | ₹17,576 | ₹4,424 | ₹13,152 | ₹10,522 | ₹2,630 |
| 10 | ₹47,333 | ₹2,917 | ₹4,632 | ₹39,785 | ₹10,014 | ₹29,771 | ₹23,817 | ₹5,954 |
| 25 | ₹1,18,333 | ₹7,292 | ₹19,140 | ₹91,902 | ₹23,132 | ₹68,770 | ₹55,016 | ₹13,754 |
| 50 | ₹2,36,667 | ₹14,583 | ₹75,000 | ₹1,47,084 | ₹37,021 | ₹1,10,063 | ₹88,050 | ₹22,013 |
| 100 | ₹4,73,333 | ₹29,167 | ₹1,45,000 | ₹2,99,167 | ₹75,300 | ₹2,23,866 | ₹1,79,093 | ₹44,773 |
| 200 | ₹9,46,667 | ₹58,333 | ₹2,20,000 | ₹6,68,333 | ₹1,68,220 | ₹5,00,114 | ₹4,00,091 | ₹1,00,023 |

- **Break-even is at about 2 paying schools** at Stage A. Stage 0 costs ₹0, so there is no loss before the first client.
- Infrastructure stays under 10% of revenue at every stage. People are the main cost from Stage C, and hires are gated by §9.
- **The founders' 20% is small early on by design.** Reinvestment funds the first support and developer hires, which is what unlocks growth past 50 tenants.

### 11.1 Cash timeline with a 90-day trial and ₹0 seed
Month 0–3: build + pilots on Stage 0 (₹0). Month 3–4: first conversions (early-conversion offer brings setup fees in before day 60). Revenue arrives before any Stage A spend, because Stage A is triggered **by** the first payment.

---

## 12. Go-to-market (Delhi NCR + West UP)

| Step | Action |
|------|--------|
| Ideal first customer | Private CBSE / UP-Board schools, 300–1,500 students, running buses, in Meerut, Ghaziabad, Noida, Greater Noida, Muzaffarnagar, Hapur. Second: coaching centres in Meerut, Noida Sector-62 and Delhi (Mukherjee Nagar, Laxmi Nagar) with a YouTube or Instagram audience. |
| Pilot offer | 3–5 pilot schools: full 90-day trial, free data migration, founders on call; in exchange, a testimonial and referrals |
| Field sales | Visit and demo on a tablet; set up the trial during the visit (self-serve signup takes under 10 minutes) |
| Dogfooding | Use Aadhyay's own CRM + WhatsApp Channel to run our sales pipeline |
| Associations | Private school associations in Meerut, Ghaziabad and Noida; principal meet-ups; education expos at Pragati Maidan |
| Partners | Local IT vendors, uniform/book suppliers and GPS/RFID installers, at 15% first-year commission |
| Content and SEO | Hindi + English landing pages ("school ERP Meerut", "school app Ghaziabad"), free tools (fee calculator, timetable maker, report-card templates) on aadhyay.com |
| Referral | An institution that refers an institution gets 1 quarter free; "Powered by Aadhyay" on free subdomain websites |
| Parent virality | Free Messenger for everyone means parents invite relatives and other parents, and every install is a brand touchpoint |

---

## 13. KPIs and risk register

| KPI | Target |
|-----|--------|
| Trial → paid conversion | ≥ 30% |
| Logo churn | < 10% / year |
| Parent app weekly active | ≥ 60% |
| Fees collected online | ≥ 50% |
| Infra cost / revenue | < 10% |
| Messenger cost per 1,000 free users | < ₹500 / month |
| Expenses / trailing net collections | ≤ 60% (hard rule) |

| Risk | Mitigation |
|------|-----------|
| Free unlimited Messenger cost spike | §10.3 design, monitoring KPI, P2P-first calls, media expiry after delivery |
| Meta price changes | Pass-through pricing from the price book; routing is app-first |
| DPDP Act compliance (children's data) | Consent records, purpose tags, rights console, DPA with every tenant |
| E2EE implementation bugs | Use audited primitives (@noble libraries), the published Signal spec, an external security review before public launch |
| Free-tier VM reclaimed (Oracle idle policy) | Daily off-site backups to R2; one-command redeploy with Docker; move to Stage A at first payment |
| 2-person key-person risk | These docs + TASKS.md; everything in git; infra as code |
| Low conversion | Guided onboarding, day-60 ROI report, early-conversion discount |

---

## 14. Cost sources (checked 2026-10-07 — re-verify before purchase)

| Item | Value used | Source |
|------|-----------|--------|
| WhatsApp India rates | Marketing ₹0.8631, utility ≈₹0.115, authentication ≈₹0.115, effective 1 Jan 2026; 18% GST applies; utility free inside the 24-hour window | montymobile.com WhatsApp India INR rates 2026; founder's master plan (Oct 2026) |
| E2E Networks (Delhi NCR & Chennai) | E1LC-2.6GB ₹894.02/month; E1LC-4.12GB ₹1,788.05/month; SDC3-4.30GB ₹6,954/month; object storage ₹625/month up to 250 GB then ₹2.5/GB; prices exclude 18% GST | e2enetworks.com/pricing |
| Oracle Cloud Always Free | Up to 4 OCPU / 24 GB ARM, 200 GB storage, 10 TB egress/month; idle instances may be reclaimed; regional capacity varies | space-node.net Oracle free VPS guide 2026 |
| SMS, email, R2, Resend, Neon/Supabase, voice AI, market prices | As listed in the founder's Institution OS master plan (researched Oct 2026) | Master plan Appendix D |
| Google Play developer fee | US$25 one-time | Google Play Console |
| Apple Developer Program | US$99/year | Apple Developer |
| Exchange rate | 1 USD ≈ ₹88 | Master plan assumption |
