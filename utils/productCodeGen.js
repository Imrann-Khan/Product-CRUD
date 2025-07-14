import crypto from 'crypto';

export function generateProductCode(productName) {
  const lower = productName.toLowerCase();
  let maxLen = 0, substrings = [];

  for (let i = 0; i < lower.length; i++) {
    let j = i;
    while (j + 1 < lower.length && lower[j] < lower[j + 1]) j++;
    const len = j - i + 1;
    if (len > maxLen) { maxLen = len; substrings = [{ str: lower.slice(i, j + 1), start: i }]; }
    else if (len === maxLen) substrings.push({ str: lower.slice(i, j + 1), start: i });
    i = j;
  }

  const concat = substrings.map(s => s.str).join('');
  const first = substrings[0].start;
  const last = first + maxLen - 1;
  const hash = crypto.createHash('sha1').update(productName).digest('hex').slice(0, 8);

  return `${hash}-${first}${concat}${last}`;
}
