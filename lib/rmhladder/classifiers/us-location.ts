export interface LocationInput {
  locationRaw?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}
export interface LocationResult {
  isUS: boolean | null;
  confidence: number;
  city: string | null;
  state: string | null;
  remoteStatus: 'onsite' | 'hybrid' | 'remote_us';
}

const STATE_NAMES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO',
  connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
  illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
  pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
  tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
  'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC',
};
const STATE_ABBREVS = new Set(Object.values(STATE_NAMES));
const US_COUNTRY = /^(us|usa|u\.s\.?a?\.?|united states( of america)?)$/i;
// word-bounded so "Indianapolis" doesn't match "india"
const NON_US_COUNTRY_HINT = /\b(kingdom|canada|india|singapore|australia|germany|france|japan|china|ireland|switzerland|mexico|brazil|poland|hong ?kong)\b/i;
// spec's 28 preferred locations get a confidence boost when matched
export const PREFERRED_CITIES = new Set([
  'new york', 'charlotte', 'chicago', 'san francisco', 'los angeles', 'boston', 'washington',
  'minneapolis', 'dallas', 'houston', 'atlanta', 'miami', 'seattle', 'austin', 'denver',
  'philadelphia', 'nashville', 'phoenix', 'salt lake city', 'raleigh', 'jersey city',
  'stamford', 'menlo park', 'palo alto', 'mountain view', 'san jose',
]);
const NON_US_CITIES = /\b(london|toronto|vancouver|montreal|paris|frankfurt|dublin|zurich|geneva|mumbai|bangalore|bengaluru|singapore|sydney|tokyo|hong ?kong|shanghai|beijing|warsaw|madrid|milan|amsterdam|tel aviv|mexico city|s[aã]o paulo)\b/i;

export function classifyUSLocation(input: LocationInput): LocationResult {
  const raw = (input.locationRaw ?? '').trim();
  const lower = raw.toLowerCase();
  let remoteStatus: LocationResult['remoteStatus'] = 'onsite';
  if (/\bhybrid\b/i.test(raw)) remoteStatus = 'hybrid';
  else if (/\bremote\b/i.test(raw)) remoteStatus = 'remote_us'; // US-ness still checked below

  // 1. Explicit country field
  if (input.country) {
    if (US_COUNTRY.test(input.country.trim())) {
      const parsed = parseCityState(raw, input.city, input.state);
      return { isUS: true, confidence: 95, remoteStatus, ...parsed };
    }
    return { isUS: false, confidence: 95, city: null, state: null, remoteStatus };
  }
  // 2. Non-US signals in raw string
  if (NON_US_CITIES.test(lower) || NON_US_COUNTRY_HINT.test(lower)) {
    return { isUS: false, confidence: 85, city: null, state: null, remoteStatus };
  }
  // 3. Remote + US markers
  if (remoteStatus === 'remote_us') {
    if (/\b(us|usa|united states)\b/i.test(lower) || !raw.replace(/remote|[-()]/gi, '').trim()) {
      return { isUS: /\b(us|usa|united states)\b/i.test(lower) ? true : null,
               confidence: /\b(us|usa|united states)\b/i.test(lower) ? 85 : 40,
               city: null, state: null, remoteStatus };
    }
  }
  // 4. City, ST / City, StateName patterns
  const parsed = parseCityState(raw, input.city, input.state);
  if (parsed.state) {
    const conf = parsed.city && PREFERRED_CITIES.has(parsed.city.toLowerCase()) ? 90 : 80;
    return { isUS: true, confidence: conf, remoteStatus, ...parsed };
  }
  // 5. Unclear
  return { isUS: null, confidence: 30, city: parsed.city, state: null, remoteStatus };
}

function parseCityState(
  raw: string,
  cityField?: string | null,
  stateField?: string | null,
): { city: string | null; state: string | null } {
  let state = stateField?.trim().toUpperCase() ?? null;
  if (state && !STATE_ABBREVS.has(state)) state = STATE_NAMES[state.toLowerCase()] ?? null;
  let city = cityField?.trim() ?? null;
  if (!state) {
    const cleaned = raw.replace(/\b(hybrid|remote)\b\s*[-–]?\s*/gi, '');
    const m = cleaned.match(/([A-Za-z .']+?),\s*([A-Za-z .]+)$/);
    if (m) {
      const cand = m[2].trim();
      const abbr = cand.toUpperCase();
      if (STATE_ABBREVS.has(abbr)) state = abbr;
      else if (STATE_NAMES[cand.toLowerCase()]) state = STATE_NAMES[cand.toLowerCase()];
      if (state && !city) city = m[1].trim();
    }
  }
  return { city, state };
}
