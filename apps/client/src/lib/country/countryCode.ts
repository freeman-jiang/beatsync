// country code regex
const CC_REGEX = /^[a-z]{2}$/i;

// flag emoji use 2 regional indicator symbols, and each symbol is 2 chars
const FLAG_LENGTH = 4;

// offset between uppercase ascii and regional indicator symbols
const OFFSET = 127397;

/**
 * convert country code to corresponding flag emoji
 */
export function countryCodeEmoji(cc: string): string {
  if (!CC_REGEX.test(cc)) {
    const type = typeof cc;
    throw new TypeError(
      `cc argument must be an ISO 3166-1 alpha-2 string, but got '${
        type === "string" ? cc : type
      }' instead.`
    );
  }

  const codePoints = [...cc.toUpperCase()].map((c) => {
    const codePoint = c.codePointAt(0);
    if (codePoint === undefined) {
      throw new Error(`Invalid character: ${c}`);
    }
    return codePoint + OFFSET;
  });
  return String.fromCodePoint(...codePoints);
}

/**
 * convert flag emoji to corresponding country code
 */
export function emojiCountryCode(flag: string): string {
  if (flag.length !== FLAG_LENGTH) {
    const type = typeof flag;
    throw new TypeError(
      `flag argument must be a flag emoji, but got '${
        type === "string" ? flag : type
      }' instead.`
    );
  }

  const codePoints = [...flag].map((c) => {
    const codePoint = c.codePointAt(0);
    if (codePoint === undefined) {
      throw new Error(`Invalid character: ${c}`);
    }
    return codePoint - OFFSET;
  });
  return String.fromCodePoint(...codePoints);
}

export default countryCodeEmoji;
