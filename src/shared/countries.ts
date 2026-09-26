// Country names as written in the ATR sheet -> ISO 3166-1 alpha-2 codes (lowercase, as used by flag-icons).
const CODES: Record<string, string> = {
  afghanistan: 'af', albania: 'al', algeria: 'dz', andorra: 'ad', angola: 'ao', argentina: 'ar', armenia: 'am',
  australia: 'au', austria: 'at', azerbaijan: 'az', bahrain: 'bh', bangladesh: 'bd', belarus: 'by', belgium: 'be',
  bolivia: 'bo', 'bosnia and herzegovina': 'ba', brazil: 'br', bulgaria: 'bg', cambodia: 'kh', cameroon: 'cm',
  canada: 'ca', chile: 'cl', china: 'cn', colombia: 'co', 'costa rica': 'cr', croatia: 'hr', cuba: 'cu', cyprus: 'cy',
  czechia: 'cz', 'czech republic': 'cz', denmark: 'dk', 'dominican republic': 'do', ecuador: 'ec', egypt: 'eg',
  'el salvador': 'sv', england: 'gb-eng', estonia: 'ee', finland: 'fi', france: 'fr', georgia: 'ge', germany: 'de',
  ghana: 'gh', greece: 'gr', guatemala: 'gt', honduras: 'hn', 'hong kong': 'hk', hungary: 'hu', iceland: 'is',
  india: 'in', indonesia: 'id', iran: 'ir', iraq: 'iq', ireland: 'ie', 'isle of man': 'im', israel: 'il', italy: 'it',
  jamaica: 'jm', japan: 'jp', jordan: 'jo', kazakhstan: 'kz', kenya: 'ke', kosovo: 'xk', kuwait: 'kw',
  kyrgyzstan: 'kg', latvia: 'lv', lebanon: 'lb', libya: 'ly', liechtenstein: 'li', lithuania: 'lt', luxembourg: 'lu',
  macao: 'mo', macau: 'mo', malaysia: 'my', malta: 'mt', mexico: 'mx', moldova: 'md', monaco: 'mc', mongolia: 'mn',
  montenegro: 'me', morocco: 'ma', nepal: 'np', netherlands: 'nl', 'new zealand': 'nz', nicaragua: 'ni',
  nigeria: 'ng', 'north macedonia': 'mk', 'northern mariana islands': 'mp', norway: 'no', oman: 'om',
  pakistan: 'pk', palestine: 'ps', panama: 'pa', paraguay: 'py', peru: 'pe', philippines: 'ph', poland: 'pl',
  portugal: 'pt', 'puerto rico': 'pr', qatar: 'qa', romania: 'ro', russia: 'ru', 'saudi arabia': 'sa',
  scotland: 'gb-sct', serbia: 'rs', singapore: 'sg', slovakia: 'sk', slovenia: 'si', 'south africa': 'za',
  'south korea': 'kr', korea: 'kr', spain: 'es', 'sri lanka': 'lk', sweden: 'se', switzerland: 'ch', syria: 'sy',
  taiwan: 'tw', tajikistan: 'tj', thailand: 'th', tunisia: 'tn', turkey: 'tr', turkiye: 'tr', türkiye: 'tr',
  turkmenistan: 'tm', ukraine: 'ua', 'united arab emirates': 'ae', 'united kingdom': 'gb', uk: 'gb',
  'united states': 'us', usa: 'us', uruguay: 'uy', uzbekistan: 'uz', venezuela: 've', vietnam: 'vn', wales: 'gb-wls',
};

export const countryCode = (country: string): string | null => CODES[country.trim().toLowerCase()] ?? null;

/** Country flag as an emoji ("France" -> 🇫🇷; England, Scotland and Wales use their tag flags). */
export function flagEmoji(country: string): string {
  const code = countryCode(country);
  if (!code) return '';
  const sub = /^gb-(eng|sct|wls)$/.exec(code);
  if (sub) {
    const tag = (s: string) => [...s].map((c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0))).join('');
    return `🏴${tag(`gb${sub[1]}`)}\u{E007F}`;
  }
  if (!/^[a-z]{2}$/.test(code)) return '';
  return [...code.toUpperCase()].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join('');
}

/** Text of the fan flair: "🇫🇷 MarineLorD fan", kept under Reddit's 64 character limit. */
export function fanFlairText(player: string, country: string): string {
  const flag = flagEmoji(country);
  const text = `${flag ? `${flag} ` : ''}${player} fan`;
  return text.length <= 64 ? text : `${player.slice(0, 55)} fan`;
}
