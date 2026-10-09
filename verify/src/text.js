// Makes text from outside safe to print.
//
// The report shows text that other people control: a record title chosen by
// the record owner, dates and status from TrustChain's endpoint, the record ID
// from the chain, and error messages from RPC servers. A terminal acts on some
// characters instead of printing them. A line break, a carriage return or an
// escape sequence could draw a fake PASS line or hide a real FAIL line. So every
// such character is shown as a visible \uXXXX escape instead.

// Code point ranges, written as numbers so this file stays plain ASCII.
// U+061C, U+200E, U+200F and U+202A to U+202E, U+2066 to U+2069 are the
// bidirectional marks and overrides. U+2028 and U+2029 are the line and
// paragraph separators.
const FORMAT_CHARS = [[0x061c, 0x061c], [0x200e, 0x200f], [0x2028, 0x2029], [0x202a, 0x202e], [0x2066, 0x2069]];

function hex4(n) {
  return '\\u' + n.toString(16).padStart(4, '0');
}

function charClass(ranges) {
  return new RegExp('[' + ranges.map(([from, to]) => hex4(from) + '-' + hex4(to)).join('') + ']', 'g');
}

// C0 controls (including line feed, carriage return, ESC and BEL), DEL, C1
// controls, the Unicode line and paragraph separators, and the bidirectional
// formatting characters that can reorder what is shown on screen.
const TERMINAL_UNSAFE = charClass([[0x00, 0x1f], [0x7f, 0x9f], ...FORMAT_CHARS]);

// The same set without C0. JSON.stringify already escapes C0 controls inside
// strings, and the line breaks between JSON lines must stay.
const JSON_UNSAFE = charClass([[0x7f, 0x9f], ...FORMAT_CHARS]);

function toEscape(char) {
  return '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0');
}

/**
 * Replaces every character a terminal could act on with a visible \uXXXX escape.
 * @param {unknown} text
 * @returns {string}
 */
export function escapeControl(text) {
  return String(text).replace(TERMINAL_UNSAFE, toEscape);
}

/**
 * Same idea for JSON text made by JSON.stringify. The result is still valid
 * JSON and parses back to the same values.
 * @param {string} json
 * @returns {string}
 */
export function escapeJsonText(json) {
  return json.replace(JSON_UNSAFE, toEscape);
}

/**
 * Shortens an RPC URL to its scheme and host before it is printed. Hosted RPCs
 * often put an API key in the path or the query, and people paste the output
 * into bug reports.
 * @param {string} url
 * @returns {string}
 */
export function redactUrl(url) {
  try {
    const u = new URL(url);
    const hasMore = (u.pathname && u.pathname !== '/') || u.search || u.username || u.password;
    return hasMore ? `${u.origin}/...` : u.origin;
  } catch {
    return '(not a valid URL)';
  }
}
