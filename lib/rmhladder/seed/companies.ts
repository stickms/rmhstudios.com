// lib/rmhladder/seed/companies.ts
export interface SeedCompany {
  name: string;
  industry: string;
  firmType: string;
  priorityLevel: number; // 1 = highest
  usEarlyCareerUrl?: string;
}

const group = (
  names: string[], industry: string, firmType: string, priorityLevel: number,
): SeedCompany[] => names.map((name) => ({ name, industry, firmType, priorityLevel }));

export const SEED_COMPANIES: SeedCompany[] = [
  ...group(['Goldman Sachs', 'JPMorgan Chase', 'Morgan Stanley', 'Bank of America', 'Citi', 'Wells Fargo', 'Barclays', 'UBS', 'Deutsche Bank', 'HSBC', 'RBC Capital Markets', 'TD Securities', 'BMO Capital Markets', 'Scotiabank', 'Nomura', 'Mizuho', 'SMBC', 'MUFG', 'Macquarie'], 'Investment Banking', 'bulge_bracket', 1),
  ...group(['Evercore', 'Lazard', 'Centerview Partners', 'PJT Partners', 'Moelis & Company', 'Perella Weinberg Partners', 'Greenhill', 'Guggenheim Securities', 'Houlihan Lokey', 'Jefferies', 'William Blair', 'Lincoln International', 'Harris Williams', 'Piper Sandler', 'Raymond James', 'Stifel', 'Baird', 'Cowen', 'Rothschild & Co', 'Ducera Partners', 'Solomon Partners', 'LionTree', 'Qatalyst Partners', 'Allen & Company', 'FT Partners', 'Cain Brothers', 'Leerink Partners', 'Cantor Fitzgerald', 'Needham & Company'], 'Investment Banking', 'elite_boutique', 1),
  ...group(['KeyBanc Capital Markets', 'Fifth Third Securities', 'Truist Securities', 'Citizens Bank', 'Regions Securities', 'Huntington Bank', 'Comerica', 'PNC', 'U.S. Bank', 'BOK Financial', 'Wedbush Securities', 'Oppenheimer', 'JMP Securities'], 'Investment Banking', 'middle_market', 2),
  ...group(['Blackstone', 'KKR', 'Apollo', 'Carlyle', 'TPG', 'Ares Management', 'Brookfield', 'Warburg Pincus', 'Silver Lake', 'General Atlantic', 'Advent International', 'Bain Capital', 'Hellman & Friedman', 'Vista Equity Partners', 'Thoma Bravo', 'Clayton Dubilier & Rice', 'EQT', 'CVC Capital Partners', 'Permira', 'Partners Group', 'Leonard Green & Partners', 'Francisco Partners', 'Insight Partners', 'TA Associates', 'Stone Point Capital', 'Clearlake Capital', 'Roark Capital', 'New Mountain Capital', 'Welsh Carson', 'K1 Investment Management', 'H.I.G. Capital', 'GTCR', 'Summit Partners', 'Audax Group', 'Charlesbank Capital Partners', 'Littlejohn & Co.', 'American Securities', 'TowerBrook Capital Partners', 'Court Square Capital', 'L Catterton', 'Searchlight Capital Partners'], 'Private Equity', 'private_equity', 2),
  ...group(['Sequoia Capital', 'Andreessen Horowitz', 'Accel', 'Benchmark', 'Greylock', 'Kleiner Perkins', 'Lightspeed Venture Partners', 'Bessemer Venture Partners', 'General Catalyst', 'Founders Fund', 'Coatue', 'Thrive Capital', 'Tiger Global', 'NEA', 'IVP', 'Menlo Ventures', 'Battery Ventures', 'Khosla Ventures', 'Union Square Ventures', 'First Round Capital', 'Spark Capital', 'Sapphire Ventures', 'Greycroft', 'Redpoint Ventures'], 'Venture Capital', 'venture_capital', 3),
  ...group(['BlackRock', 'Vanguard', 'Fidelity', 'State Street', 'PIMCO', 'Wellington Management', 'T. Rowe Price', 'Capital Group', 'Invesco', 'Franklin Templeton', 'AllianceBernstein', 'Nuveen', 'Northern Trust', 'BNY Mellon', 'Janus Henderson'], 'Asset Management', 'asset_manager', 2),
  ...group(['Bridgewater Associates', 'Citadel', 'Citadel Securities', 'Point72', 'Millennium Management', 'Two Sigma', 'DE Shaw', 'Jane Street', 'Susquehanna International Group', 'Hudson River Trading', 'Optiver', 'IMC Trading', 'DRW', 'Akuna Capital', 'Jump Trading', 'Tower Research Capital'], 'Markets / Sales & Trading', 'hedge_fund_trading', 1),
  ...group(['McKinsey & Company', 'Bain & Company', 'Boston Consulting Group', 'Deloitte', 'PwC', 'EY', 'KPMG', 'Accenture', 'Oliver Wyman', 'Strategy&', 'LEK Consulting', 'Roland Berger', 'Simon-Kucher', 'AlixPartners', 'Alvarez & Marsal', 'FTI Consulting', 'Kearney', 'Booz Allen Hamilton', 'Capgemini', 'IBM Consulting', 'Slalom', 'ZS Associates', 'Guidehouse', 'West Monroe', 'RSM', 'Grant Thornton', 'BDO', 'Protiviti', 'Huron Consulting Group', 'Ankura', 'Berkeley Research Group', 'Charles River Associates', 'Cornerstone Research', 'Analysis Group', 'NERA Economic Consulting', 'Bates White', 'Compass Lexecon'], 'Management Consulting', 'consulting', 1),
  ...group(['Google', 'Microsoft', 'Apple', 'Amazon', 'Meta', 'Netflix', 'Nvidia', 'Salesforce', 'Adobe', 'Oracle', 'IBM', 'Intel', 'AMD', 'Qualcomm', 'Cisco', 'Dell', 'HP', 'ServiceNow', 'Workday', 'Atlassian', 'Snowflake', 'Databricks', 'Palantir', 'Stripe', 'Block', 'PayPal', 'Shopify', 'Uber', 'Lyft', 'Airbnb', 'DoorDash', 'Instacart', 'Coinbase', 'Robinhood', 'Reddit', 'Pinterest', 'Snap', 'Spotify', 'TikTok', 'ByteDance', 'Discord', 'Roblox', 'Epic Games', 'Electronic Arts', 'Unity', 'OpenAI', 'Anthropic', 'Scale AI', 'Anduril', 'Ramp', 'Brex', 'Plaid', 'Figma', 'Canva', 'Dropbox', 'Box', 'Okta', 'Datadog', 'Cloudflare', 'MongoDB', 'Elastic', 'GitHub', 'GitLab', 'Twilio', 'HubSpot', 'Toast', 'Samsara', 'Verkada', 'Rippling', 'Airtable', 'Asana', 'Notion'], 'Technology', 'technology', 1),
  ...group(['Capital One', 'American Express', 'Discover', 'Mastercard', 'Visa', 'Fiserv', 'FIS', 'Global Payments', 'Adyen', 'Affirm', 'SoFi', 'Chime', 'Bloomberg', 'S&P Global', "Moody's", 'Fitch Ratings', 'Morningstar', 'FactSet', 'MSCI', 'Nasdaq', 'NYSE', 'CME Group', 'Cboe', 'ICE', 'MarketAxess'], 'FinTech', 'fintech_data', 2),
  ...group(['Procter & Gamble', 'Unilever', 'Johnson & Johnson', 'PepsiCo', 'Coca-Cola', 'Nike', 'Lululemon', 'Walmart', 'Target', 'Costco', 'Home Depot', "Lowe's", 'General Electric', 'Honeywell', '3M', 'Caterpillar', 'Deere', 'Boeing', 'Lockheed Martin', 'Northrop Grumman', 'RTX', 'General Motors', 'Ford', 'Tesla', 'Rivian', 'Lucid', 'Delta Air Lines', 'United Airlines', 'American Airlines', 'Marriott', 'Hilton', 'Disney', 'Comcast', 'Warner Bros. Discovery', 'Paramount', 'Sony', 'General Mills', 'Cargill', 'Ecolab', 'Medtronic', 'UnitedHealth Group', 'Optum', 'CVS Health', 'Elevance Health', 'Cigna', 'Humana', 'Pfizer', 'Merck', 'Eli Lilly', 'AbbVie', 'Amgen', 'Gilead', 'Moderna'], 'Corporate Strategy', 'corporate', 3),
];

// Manual early-career page URLs for firms unlikely to be on API job boards (verified in Plan 2).
export const MANUAL_EARLY_CAREER_URLS: Record<string, string> = {
  'Goldman Sachs': 'https://www.goldmansachs.com/careers/students',
  'JPMorgan Chase': 'https://careers.jpmorgan.com/us/en/students',
  'Morgan Stanley': 'https://www.morganstanley.com/careers/students-graduates',
  'Bank of America': 'https://campus.bankofamerica.com',
  'Citi': 'https://jobs.citi.com/students-and-graduates',
  'Wells Fargo': 'https://www.wellsfargojobs.com/en/early-careers/',
  'Barclays': 'https://search.jobs.barclays/early-careers',
  'UBS': 'https://www.ubs.com/global/en/careers/graduates.html',
  'Evercore': 'https://www.evercore.com/join-our-team/campus-recruiting/',
  'Lazard': 'https://www.lazard.com/careers/students-graduates/',
  'Centerview Partners': 'https://www.centerviewpartners.com/careers',
  'PJT Partners': 'https://www.pjtpartners.com/careers/campus-opportunities',
  'Moelis & Company': 'https://www.moelis.com/careers/students/',
  'Jefferies': 'https://www.jefferies.com/careers/early-careers/',
  'Houlihan Lokey': 'https://hl.com/careers/campus-recruiting/',
  'McKinsey & Company': 'https://www.mckinsey.com/careers/students',
  'Bain & Company': 'https://www.bain.com/careers/roles/students-grads/',
  'Boston Consulting Group': 'https://careers.bcg.com/students',
  'Deloitte': 'https://www2.deloitte.com/us/en/pages/careers/articles/join-deloitte-students.html',
  'PwC': 'https://www.pwc.com/us/en/careers/university-relations.html',
  'EY': 'https://www.ey.com/en_us/careers/students',
  'KPMG': 'https://kpmg.com/us/en/careers-and-culture/university-careers.html',
  'BlackRock': 'https://careers.blackrock.com/early-careers/',
  'Blackstone': 'https://www.blackstone.com/careers/students/',
  'Citadel': 'https://www.citadel.com/careers/students/',
  'Point72': 'https://careers.point72.com/students',
  'Jane Street': 'https://www.janestreet.com/join-jane-street/internships/',
  'DE Shaw': 'https://www.deshaw.com/careers/internships',
  'Two Sigma': 'https://careers.twosigma.com/careers/SearchJobs/internship',
  'Bridgewater Associates': 'https://www.bridgewater.com/working-at-bridgewater/campus',
  'Capital One': 'https://campus.capitalone.com',
  'American Express': 'https://www.americanexpress.com/en-us/careers/students/',
};
