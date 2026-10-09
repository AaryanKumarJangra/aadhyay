/**
 * Website block registry (docs/redesign/07-CMS.md). The builder's palette, properties panel and defaults are generated
 * from this; the public renderer and the API use the same type list. Adding a block = add it here + render it.
 */
export type FieldType = 'text' | 'textarea' | 'richtext' | 'image' | 'url' | 'select' | 'number' | 'toggle' | 'items' | 'form';
export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  help?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** For `items`: the fields of one item. */
  fields?: FieldDef[];
  /** For `items`: label for the add button and singular noun. */
  itemLabel?: string;
}
export type BlockGroup = 'Layout' | 'Text' | 'Media' | 'Content' | 'Institution' | 'Live data' | 'Forms' | 'Advanced';
export interface BlockDef {
  type: string;
  label: string;
  group: BlockGroup;
  /** Lucide icon name (the web app maps it). */
  icon: string;
  description: string;
  fields: FieldDef[];
  defaults: Record<string, unknown>;
  /** Content comes from live institution data (notices, events …), not typed in. */
  live?: boolean;
  /** Raw HTML: hidden from the palette unless “advanced” is on. */
  advanced?: boolean;
}

const title: FieldDef = { key: 'title', label: 'Section title', type: 'text' };
const subtitle: FieldDef = { key: 'subtitle', label: 'Intro line', type: 'textarea' };
const limit: FieldDef = { key: 'limit', label: 'How many to show', type: 'number' };
const cta = (prefix: string, label: string): FieldDef[] => [{ key: `${prefix}Label`, label: `${label} text`, type: 'text' }, { key: `${prefix}Href`, label: `${label} link`, type: 'url', placeholder: '/admissions' }];

export const BLOCKS: BlockDef[] = [
  // Layout
  { type: 'heading', label: 'Heading', group: 'Text', icon: 'Heading', description: 'A section heading with optional intro', fields: [{ key: 'text', label: 'Heading', type: 'text' }, { key: 'level', label: 'Size', type: 'select', options: [{ value: 'h2', label: 'Large' }, { value: 'h3', label: 'Medium' }] }, subtitle], defaults: { text: 'Section heading', level: 'h2' } },
  { type: 'spacer', label: 'Spacer', group: 'Layout', icon: 'MoveVertical', description: 'Empty space between sections', fields: [{ key: 'size', label: 'Height', type: 'select', options: [{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }] }], defaults: { size: 'md' } },
  { type: 'split', label: 'Text + image', group: 'Layout', icon: 'Columns2', description: 'Two columns: text beside an image', fields: [{ key: 'heading', label: 'Heading', type: 'text' }, { key: 'html', label: 'Text', type: 'richtext' }, { key: 'imageFileId', label: 'Image', type: 'image' }, { key: 'imageSide', label: 'Image side', type: 'select', options: [{ value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }] }, ...cta('cta', 'Button')], defaults: { heading: 'Why families choose us', html: '<p>Tell your story here.</p>', imageSide: 'right' } },
  // Text
  { type: 'text', label: 'Rich text', group: 'Text', icon: 'AlignLeft', description: 'Paragraphs, lists and links', fields: [{ key: 'html', label: 'Text', type: 'richtext' }], defaults: { html: '<p>Write something here.</p>' } },
  { type: 'quote', label: 'Quote', group: 'Text', icon: 'Quote', description: 'A highlighted quotation', fields: [{ key: 'text', label: 'Quote', type: 'textarea' }, { key: 'author', label: 'Who said it', type: 'text' }], defaults: { text: 'Education is the most powerful weapon which you can use to change the world.', author: 'Nelson Mandela' } },
  // Media
  { type: 'image', label: 'Image', group: 'Media', icon: 'Image', description: 'One image with caption', fields: [{ key: 'fileId', label: 'Image', type: 'image' }, { key: 'alt', label: 'Alt text (for screen readers)', type: 'text' }, { key: 'caption', label: 'Caption', type: 'text' }], defaults: {} },
  { type: 'image-grid', label: 'Image grid', group: 'Media', icon: 'LayoutGrid', description: 'Pick photos from the media library', fields: [title, { key: 'items', label: 'Photos', type: 'items', itemLabel: 'photo', fields: [{ key: 'fileId', label: 'Image', type: 'image' }, { key: 'alt', label: 'Alt text', type: 'text' }] }], defaults: { title: 'Campus life', items: [] } },
  { type: 'video', label: 'Video', group: 'Media', icon: 'Video', description: 'YouTube or Vimeo', fields: [{ key: 'url', label: 'YouTube or Vimeo link', type: 'url', placeholder: 'https://youtu.be/…' }, { key: 'caption', label: 'Caption', type: 'text' }], defaults: {} },
  // Content
  { type: 'hero', label: 'Hero banner', group: 'Content', icon: 'Sparkles', description: 'Big headline with call to action', fields: [{ key: 'heading', label: 'Headline', type: 'text' }, { key: 'subheading', label: 'Sub-headline', type: 'textarea' }, { key: 'imageFileId', label: 'Background image', type: 'image' }, ...cta('cta', 'Primary button'), ...cta('cta2', 'Second button')], defaults: { heading: 'Welcome', subheading: 'Admissions open for the new session', ctaLabel: 'Admission enquiry', ctaHref: '/admissions' } },
  { type: 'features', label: 'Feature cards', group: 'Content', icon: 'LayoutTemplate', description: 'Three or more highlights', fields: [title, subtitle, { key: 'items', label: 'Cards', type: 'items', itemLabel: 'card', fields: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'body', label: 'Text', type: 'textarea' }, { key: 'imageFileId', label: 'Image', type: 'image' }] }], defaults: { title: 'Why us', items: [{ title: 'Experienced teachers', body: '' }, { title: 'Smart classrooms', body: '' }, { title: 'Safe transport', body: '' }] } },
  { type: 'stats', label: 'Stats', group: 'Content', icon: 'BarChart3', description: 'Numbers that build trust', fields: [{ key: 'items', label: 'Numbers', type: 'items', itemLabel: 'number', fields: [{ key: 'value', label: 'Value', type: 'text', placeholder: '1,200+' }, { key: 'label', label: 'Label', type: 'text' }] }], defaults: { items: [{ value: '1,200+', label: 'Students' }, { value: '60', label: 'Teachers' }, { value: '25', label: 'Years' }, { value: '98%', label: 'Board results' }] } },
  { type: 'testimonials', label: 'Testimonials', group: 'Content', icon: 'MessageSquareQuote', description: 'What parents and alumni say', fields: [title, { key: 'items', label: 'Testimonials', type: 'items', itemLabel: 'testimonial', fields: [{ key: 'body', label: 'Quote', type: 'textarea' }, { key: 'name', label: 'Name', type: 'text' }, { key: 'role', label: 'Who they are', type: 'text', placeholder: 'Parent of Class 5 student' }] }], defaults: { title: 'What parents say', items: [] } },
  { type: 'faq', label: 'FAQ', group: 'Content', icon: 'CircleHelp', description: 'Questions and answers (adds FAQ rich results)', fields: [title, { key: 'items', label: 'Questions', type: 'items', itemLabel: 'question', fields: [{ key: 'q', label: 'Question', type: 'text' }, { key: 'a', label: 'Answer', type: 'textarea' }] }], defaults: { title: 'Frequently asked questions', items: [{ q: 'When do admissions open?', a: 'Fill the enquiry form and our team will call you.' }] } },
  { type: 'timeline', label: 'Timeline', group: 'Content', icon: 'Milestone', description: 'Admission steps or history', fields: [title, { key: 'items', label: 'Steps', type: 'items', itemLabel: 'step', fields: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'body', label: 'Detail', type: 'textarea' }] }], defaults: { title: 'Admission process', items: [{ title: 'Enquire', body: 'Fill the form' }, { title: 'Visit', body: 'Tour the campus' }, { title: 'Apply', body: 'Submit documents' }] } },
  { type: 'logos', label: 'Logo cloud', group: 'Content', icon: 'Award', description: 'Affiliations, boards and partners', fields: [title, { key: 'items', label: 'Logos', type: 'items', itemLabel: 'logo', fields: [{ key: 'fileId', label: 'Logo', type: 'image' }, { key: 'name', label: 'Name', type: 'text' }] }], defaults: { title: 'Affiliated with', items: [] } },
  { type: 'faculty', label: 'Team / faculty', group: 'Content', icon: 'Users', description: 'People with photos', fields: [title, { key: 'items', label: 'People', type: 'items', itemLabel: 'person', fields: [{ key: 'name', label: 'Name', type: 'text' }, { key: 'title', label: 'Role', type: 'text' }, { key: 'imageFileId', label: 'Photo', type: 'image' }] }], defaults: { title: 'Our faculty', items: [] } },
  { type: 'pricing', label: 'Fee plans', group: 'Content', icon: 'IndianRupee', description: 'Courses or fee tiers', fields: [title, { key: 'items', label: 'Plans', type: 'items', itemLabel: 'plan', fields: [{ key: 'name', label: 'Name', type: 'text' }, { key: 'price', label: 'Price', type: 'text', placeholder: '₹4,500 / quarter' }, { key: 'body', label: 'What’s included', type: 'textarea' }] }], defaults: { title: 'Fee structure', items: [] } },
  { type: 'cta', label: 'Call to action', group: 'Content', icon: 'MousePointerClick', description: 'One clear next step', fields: [{ key: 'heading', label: 'Heading', type: 'text' }, { key: 'body', label: 'Text', type: 'textarea' }, { key: 'label', label: 'Button text', type: 'text' }, { key: 'href', label: 'Button link', type: 'url', placeholder: '/admissions' }], defaults: { heading: 'Ready to join us?', label: 'Enquire now', href: '/admissions' } },
  // Institution
  { type: 'principal', label: 'Principal’s message', group: 'Institution', icon: 'UserRoundCheck', description: 'Photo, name and message', fields: [{ key: 'name', label: 'Name', type: 'text' }, { key: 'role', label: 'Title', type: 'text' }, { key: 'imageFileId', label: 'Photo', type: 'image' }, { key: 'message', label: 'Message', type: 'textarea' }], defaults: { role: 'Principal', message: 'Welcome to our school…' } },
  { type: 'programmes', label: 'Academic programmes', group: 'Institution', icon: 'GraduationCap', description: 'Classes, streams or courses offered', fields: [title, { key: 'items', label: 'Programmes', type: 'items', itemLabel: 'programme', fields: [{ key: 'title', label: 'Name', type: 'text' }, { key: 'body', label: 'Description', type: 'textarea' }] }], defaults: { title: 'Programmes', items: [{ title: 'Pre-primary', body: 'Nursery to UKG' }, { title: 'Primary', body: 'Class 1 to 5' }, { title: 'Senior secondary', body: 'Science, Commerce, Humanities' }] } },
  { type: 'toppers', label: 'Achievements', group: 'Institution', icon: 'Trophy', description: 'Results and toppers (from gallery posts)', live: true, fields: [title, limit], defaults: { title: 'Our toppers', limit: 8 } },
  { type: 'admission-cta', label: 'Admission banner', group: 'Institution', icon: 'BadgeCheck', description: 'Admissions open — enquire', fields: [{ key: 'session', label: 'Session', type: 'text', placeholder: '2027-28' }, { key: 'body', label: 'Text', type: 'textarea' }], defaults: { session: '', body: 'Limited seats. Book a campus visit today.' } },
  { type: 'fee-cta', label: 'Pay fees online', group: 'Institution', icon: 'CreditCard', description: 'Link parents to online fee payment', fields: [{ key: 'body', label: 'Text', type: 'textarea' }], defaults: { body: 'Pay fees securely by UPI, card or net banking in the Aadhyay app.' } },
  { type: 'contact', label: 'Contact details', group: 'Institution', icon: 'Phone', description: 'Address, phone and email from institution settings', fields: [title], defaults: { title: 'Contact us' } },
  { type: 'map', label: 'Map', group: 'Institution', icon: 'MapPin', description: 'Campus location', fields: [{ key: 'lat', label: 'Latitude', type: 'text' }, { key: 'lng', label: 'Longitude', type: 'text' }], defaults: {} },
  // Live data
  { type: 'notices', label: 'Notices', group: 'Live data', icon: 'Megaphone', description: 'Latest public notices', live: true, fields: [title, limit], defaults: { title: 'Notices', limit: 5 } },
  { type: 'events', label: 'Upcoming events', group: 'Live data', icon: 'CalendarDays', description: 'From the school calendar', live: true, fields: [title, limit], defaults: { title: 'Upcoming events', limit: 3 } },
  { type: 'news', label: 'News & blog', group: 'Live data', icon: 'Newspaper', description: 'Latest posts', live: true, fields: [title, limit, { key: 'kind', label: 'Show', type: 'select', options: [{ value: 'news', label: 'News' }, { value: 'blog', label: 'Blog' }] }], defaults: { title: 'Latest news', limit: 3, kind: 'news' } },
  { type: 'gallery', label: 'Photo gallery', group: 'Live data', icon: 'Images', description: 'From gallery albums', live: true, fields: [title, limit], defaults: { title: 'Gallery', limit: 8 } },
  { type: 'courses', label: 'Courses', group: 'Live data', icon: 'BookOpen', description: 'Published LMS courses', live: true, fields: [title, limit], defaults: { title: 'Courses', limit: 6 } },
  // Forms
  { type: 'form', label: 'Enquiry form', group: 'Forms', icon: 'ClipboardList', description: 'Submissions become admission leads in the CRM', fields: [{ key: 'formKey', label: 'Form', type: 'form' }, { key: 'heading', label: 'Heading', type: 'text' }], defaults: { formKey: 'admission', heading: 'Admission enquiry' } },
  // Advanced
  { type: 'html', label: 'Custom HTML', group: 'Advanced', icon: 'Code', description: 'Sanitised HTML for advanced users', advanced: true, fields: [{ key: 'html', label: 'HTML', type: 'textarea', help: 'Scripts and event handlers are removed. Embeds allowed from YouTube, Vimeo and Google Maps only.' }], defaults: { html: '' } },
];

export const BLOCK_INDEX: ReadonlyMap<string, BlockDef> = new Map(BLOCKS.map((b) => [b.type, b]));

/** Visual settings every block has (no raw CSS for normal users). */
export interface BlockStyle {
  padding?: 'none' | 'sm' | 'md' | 'lg';
  background?: 'none' | 'muted' | 'brand-soft' | 'brand' | 'dark';
  align?: 'left' | 'center';
  width?: 'narrow' | 'normal' | 'wide';
  hideOn?: 'none' | 'mobile' | 'desktop';
  anchor?: string;
}
export const STYLE_FIELDS: FieldDef[] = [
  { key: 'background', label: 'Background', type: 'select', options: [{ value: 'none', label: 'None' }, { value: 'muted', label: 'Soft grey' }, { value: 'brand-soft', label: 'Brand tint' }, { value: 'brand', label: 'Brand colour' }, { value: 'dark', label: 'Dark' }] },
  { key: 'padding', label: 'Spacing', type: 'select', options: [{ value: 'md', label: 'Normal' }, { value: 'sm', label: 'Compact' }, { value: 'lg', label: 'Roomy' }, { value: 'none', label: 'None' }] },
  { key: 'width', label: 'Content width', type: 'select', options: [{ value: 'normal', label: 'Normal' }, { value: 'narrow', label: 'Narrow' }, { value: 'wide', label: 'Wide' }] },
  { key: 'align', label: 'Alignment', type: 'select', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }] },
  { key: 'hideOn', label: 'Visibility', type: 'select', options: [{ value: 'none', label: 'Show everywhere' }, { value: 'mobile', label: 'Hide on phones' }, { value: 'desktop', label: 'Hide on desktop' }] },
  { key: 'anchor', label: 'Anchor id (for #links)', type: 'text', placeholder: 'admissions' },
];

/** SEO checklist used by the builder's score (0–100). */
export function seoScore(p: { title: string; slug: string; seo: { title?: string; description?: string; ogImageFileId?: string; noindex?: boolean }; blocks: { type: string; props?: Record<string, unknown> }[] }) {
  const t = p.seo.title ?? p.title;
  const d = p.seo.description ?? '';
  const checks = [
    { ok: t.length >= 20 && t.length <= 60, label: 'Title is 20–60 characters', weight: 20 },
    { ok: d.length >= 70 && d.length <= 160, label: 'Description is 70–160 characters', weight: 20 },
    { ok: p.blocks.some((b) => b.type === 'hero' || b.type === 'heading'), label: 'Page has a main heading', weight: 15 },
    { ok: !p.blocks.some((b) => (b.type === 'image' && b.props?.fileId && !b.props?.alt)), label: 'Every image has alt text', weight: 15 },
    { ok: !!p.seo.ogImageFileId, label: 'Social share image is set', weight: 10 },
    { ok: /^[a-z0-9-/]*$/.test(p.slug) && p.slug.length <= 60, label: 'Short, readable URL', weight: 10 },
    { ok: !p.seo.noindex, label: 'Visible to search engines', weight: 10 },
  ];
  return { score: checks.reduce((s, c) => s + (c.ok ? c.weight : 0), 0), checks };
}
