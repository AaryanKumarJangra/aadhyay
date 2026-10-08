/**
 * Default notification texts (en + hi). Tenants override per event/channel/locale in notification_templates.
 * Variables: {{child}}, {{class}}, {{date}}, {{amount}}, {{institution}}, {{title}}, {{link}}, {{exam}}, {{grade}}, {{days}} …
 * `wa` = Meta template name + ordered body params (templates must be approved in the tenant's WABA; see docs/02 §7.1).
 */
export interface Tpl { title: string; body: string }
export const DEFAULT_TEMPLATES: Record<string, { en: Tpl; hi: Tpl; wa?: { name: string; params: string[]; category: 'utility' | 'marketing' | 'authentication' } }> = {
  'attendance.absent': {
    en: { title: 'Absent today', body: '{{child}} ({{class}}) is marked absent on {{date}}. If this is unexpected, please contact the school.' },
    hi: { title: 'आज अनुपस्थित', body: '{{child}} ({{class}}) {{date}} को अनुपस्थित हैं। कृपया आवश्यक होने पर विद्यालय से संपर्क करें।' },
    wa: { name: 'aad_absent_alert', params: ['child', 'class', 'date', 'institution'], category: 'utility' },
  },
  'attendance.late': {
    en: { title: 'Arrived late', body: '{{child}} arrived late today ({{date}}).' },
    hi: { title: 'देर से पहुँचे', body: '{{child}} आज ({{date}}) देर से पहुँचे।' },
  },
  'attendance.marked': {
    en: { title: 'Reached school', body: '{{child}} reached {{institution}} at {{time}}.' },
    hi: { title: 'विद्यालय पहुँचे', body: '{{child}} {{time}} पर {{institution}} पहुँच गए।' },
  },
  'homework.assigned': {
    en: { title: 'New homework', body: '{{child}}: {{title}} — due {{dueOn}}.' },
    hi: { title: 'नया गृहकार्य', body: '{{child}}: {{title}} — जमा करने की तिथि {{dueOn}}।' },
  },
  'diary.posted': { en: { title: 'Class diary', body: "Today's diary for {{child}} is available." }, hi: { title: 'कक्षा डायरी', body: '{{child}} की आज की डायरी उपलब्ध है।' } },
  'notice.published': { en: { title: '{{title}}', body: '{{body}}' }, hi: { title: '{{title}}', body: '{{body}}' }, wa: { name: 'aad_notice', params: ['title', 'institution'], category: 'utility' } },
  'fee.due_soon': {
    en: { title: 'Fee due soon', body: 'Fee for {{child}} is due on {{dueOn}}. Pay easily in the app.' },
    hi: { title: 'फीस जल्द देय', body: '{{child}} की फीस {{dueOn}} को देय है। ऐप से आसानी से भुगतान करें।' },
  },
  'fee.overdue': {
    en: { title: 'Fee overdue', body: '₹{{amount}} is overdue for {{child}} since {{oldestDue}}. Tap to pay: {{link}}' },
    hi: { title: 'फीस बकाया', body: '{{child}} की ₹{{amount}} फीस {{oldestDue}} से बकाया है। भुगतान करें: {{link}}' },
    wa: { name: 'aad_fee_overdue', params: ['child', 'amount', 'oldestDue', 'institution'], category: 'utility' },
  },
  'fee.paid': {
    en: { title: 'Payment received', body: 'Received ₹{{amount}} for {{child}}. Receipt {{number}}.' },
    hi: { title: 'भुगतान प्राप्त', body: '{{child}} के लिए ₹{{amount}} प्राप्त हुए। रसीद {{number}}।' },
  },
  'exam.result_published': {
    en: { title: 'Result published', body: '{{exam}} result for {{child}}: {{percentage}}% ({{grade}}). Open the app for the report card.' },
    hi: { title: 'परिणाम घोषित', body: '{{child}} का {{exam}} परिणाम: {{percentage}}% ({{grade}})। रिपोर्ट कार्ड ऐप में देखें।' },
    wa: { name: 'aad_result_published', params: ['child', 'exam', 'percentage', 'institution'], category: 'utility' },
  },
  'trip.started': {
    en: { title: 'Bus started', body: 'Bus {{vehicle}} has started ({{direction}}) for {{children}}. Track live: {{link}}' },
    hi: { title: 'बस चल पड़ी', body: '{{children}} की बस {{vehicle}} ({{direction}}) चल पड़ी है। लाइव देखें: {{link}}' },
    wa: { name: 'aad_bus_started', params: ['children', 'vehicle', 'link'], category: 'utility' },
  },
  'trip.near_stop': { en: { title: 'Bus arriving', body: 'Bus {{vehicle}} is about {{eta}} min from {{stop}}.' }, hi: { title: 'बस आने वाली है', body: 'बस {{vehicle}} {{stop}} से लगभग {{eta}} मिनट दूर है।' } },
  'trip.boarded': { en: { title: 'Boarded', body: '{{child}} boarded bus {{vehicle}} at {{time}}.' }, hi: { title: 'बस में बैठे', body: '{{child}} {{time}} पर बस {{vehicle}} में बैठे।' } },
  'trip.dropped': { en: { title: 'Dropped', body: '{{child}} was dropped at {{stop}} at {{time}}.' }, hi: { title: 'उतार दिया', body: '{{child}} को {{time}} पर {{stop}} पर उतारा गया।' } },
  'transport.sos': {
    en: { title: 'SOS — bus {{vehicle}}', body: 'Emergency alert from bus {{vehicle}}. {{note}} The school team has been notified.' },
    hi: { title: 'आपातकाल — बस {{vehicle}}', body: 'बस {{vehicle}} से आपात सूचना। {{note}} विद्यालय टीम को सूचित किया गया है।' },
    wa: { name: 'aad_bus_sos', params: ['vehicle', 'institution'], category: 'utility' },
  },
  'emergency.broadcast': { en: { title: '{{title}}', body: '{{body}}' }, hi: { title: '{{title}}', body: '{{body}}' }, wa: { name: 'aad_emergency', params: ['title', 'institution'], category: 'utility' } },
  'leave.decided': { en: { title: 'Leave {{status}}', body: 'Leave request for {{child}} was {{status}}.' }, hi: { title: 'अवकाश {{status}}', body: '{{child}} का अवकाश अनुरोध {{status}}।' } },
  'ptm.scheduled': { en: { title: 'Parent-teacher meeting', body: 'PTM on {{date}}. {{note}}' }, hi: { title: 'अभिभावक-शिक्षक बैठक', body: 'PTM {{date}} को है। {{note}}' } },
  'billing.renewal_due': {
    en: { title: 'Aadhyay subscription', body: '{{message}}' },
    hi: { title: 'Aadhyay सदस्यता', body: '{{message}}' },
    wa: { name: 'aad_renewal_due', params: ['tenantName', 'days'], category: 'utility' },
  },
  'wallet.low': { en: { title: 'Wallet balance low', body: 'Usage wallet balance is ₹{{balance}}. Top up to keep WhatsApp/SMS alerts running.' }, hi: { title: 'वॉलेट बैलेंस कम', body: 'वॉलेट बैलेंस ₹{{balance}} है। अलर्ट जारी रखने के लिए टॉप-अप करें।' } },
  'leave.requested': { en: { title: 'Leave request', body: 'A new leave request needs your approval.' }, hi: { title: 'अवकाश अनुरोध', body: 'नया अवकाश अनुरोध आपकी स्वीकृति हेतु।' } },
};

export function render(tpl: string, vars: Record<string, unknown>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] === undefined || vars[k] === null ? '' : String(vars[k]))).replace(/\s+\./g, '.').trim();
}
