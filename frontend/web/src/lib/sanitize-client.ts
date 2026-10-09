'use client';
/**
 * Browser-side allow-list sanitiser for previewing tenant HTML in the builder canvas (the public site uses the
 * server-side sanitize-html with the same policy). Drops scripts, event handlers, styles and unsafe URLs.
 */
const TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'P', 'BR', 'HR', 'BLOCKQUOTE', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'SMALL', 'MARK', 'UL', 'OL', 'LI', 'A', 'IMG', 'FIGURE', 'FIGCAPTION', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'SPAN', 'DIV', 'IFRAME', 'CODE', 'PRE', 'SUB', 'SUP']);
const ATTRS: Record<string, string[]> = { A: ['href', 'title', 'target', 'rel'], IMG: ['src', 'alt', 'width', 'height', 'loading'], IFRAME: ['src', 'title', 'width', 'height', 'allow', 'allowfullscreen', 'loading'], TH: ['colspan', 'rowspan', 'scope'], TD: ['colspan', 'rowspan'] };
const IFRAME_HOSTS = ['www.youtube.com', 'www.youtube-nocookie.com', 'player.vimeo.com', 'www.google.com'];
const safeUrl = (v: string, tag: string) => {
  try {
    const u = new URL(v, 'https://example.invalid');
    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(u.protocol)) return false;
    return tag !== 'IFRAME' || IFRAME_HOSTS.includes(u.hostname);
  } catch { return false; }
};

export function sanitizeClient(html: string): string {
  if (typeof window === 'undefined') return '';
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  // Depth-first: clean descendants before deciding about the parent, so anything lifted out of an unwrapped
  // element has already been sanitised.
  const walk = (el: Element) => {
    for (const child of [...el.children]) {
      walk(child);
      const tag = child.tagName.toUpperCase();
      if (!TAGS.has(tag)) { child.replaceWith(...(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'NOSCRIPT', 'SVG', 'MATH'].includes(tag) ? [] : [...child.childNodes])); continue; }
      for (const a of [...child.attributes]) {
        const ok = (ATTRS[tag] ?? []).includes(a.name) || a.name === 'class' || a.name === 'id';
        if (!ok || ((a.name === 'href' || a.name === 'src') && !safeUrl(a.value, tag))) child.removeAttribute(a.name);
      }
      if (tag === 'A' && child.getAttribute('target') === '_blank') child.setAttribute('rel', 'noopener noreferrer');
    }
  };
  const root = doc.body.firstElementChild!;
  walk(root);
  return root.innerHTML;
}
