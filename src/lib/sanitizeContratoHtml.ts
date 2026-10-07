

















import DOMPurify from 'dompurify';



const ALLOWED_TAGS = [
  'a', 'abbr', 'b', 'blockquote', 'br', 'code', 'col', 'colgroup', 'div', 'em',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre',
  's', 'small', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot',
  'th', 'thead', 'tr', 'u', 'ul',
];

const ALLOWED_ATTR = [
  'href', 'target', 'rel', 'src', 'alt', 'title', 'width', 'height',
  'style', 'class', 'colspan', 'rowspan', 'align', 'valign',
];

export function sanitizeContratoHtml(dirty: string): string {
  if (typeof dirty !== 'string') return '';
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,

    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#)/i,

    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'svg', 'math'],
    FORBID_ATTR: ['formaction', 'action', 'srcdoc', 'onclick', 'onerror', 'onload'],

    WHOLE_DOCUMENT: false,

    ADD_ATTR: [],
  });
}

export default sanitizeContratoHtml;
