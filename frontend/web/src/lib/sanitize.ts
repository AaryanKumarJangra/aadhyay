import 'server-only';
import sanitizeHtml from 'sanitize-html';

/**
 * Tenant-authored HTML (CMS rich text / html blocks) is rendered on public sites, so it is sanitised with an
 * allow-list: no scripts, no event handlers, no javascript:/data: URLs, iframes only from known video hosts.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'blockquote', 'pre', 'code', 'span', 'div', 'section',
    'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'small', 'mark', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'a', 'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'iframe',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    iframe: ['src', 'title', 'width', 'height', 'allow', 'allowfullscreen', 'loading'],
    th: ['colspan', 'rowspan', 'scope'], td: ['colspan', 'rowspan'],
    '*': ['class', 'id', 'lang', 'dir'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowedIframeHostnames: ['www.youtube.com', 'www.youtube-nocookie.com', 'player.vimeo.com', 'www.google.com'],
  transformTags: {
    a: (tag, attribs) => ({ tagName: 'a', attribs: attribs.target === '_blank' ? { ...attribs, rel: 'noopener noreferrer' } : attribs }),
  },
};

export const sanitize = (html: string) => sanitizeHtml(html, OPTIONS);

/** JSON for <script type="application/ld+json">: escape "<" so tenant data cannot close the script tag. */
export const jsonLd = (value: unknown) => JSON.stringify(value ?? {}).replace(/</g, '\\u003c');
