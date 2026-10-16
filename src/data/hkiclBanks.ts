/** HKICL clearing codes, from HKICL list dated 30.3.2023. */

export interface HkiclBank {
  code: string;
  zh: string;
  en: string;
  originalEn: boolean;
  infra: boolean;
}

export const HKICL_BANKS: HkiclBank[] = [
  { code: "003", zh: "渣打銀行（香港）有限公司", en: "Standard Chartered Bank (Hong Kong) Limited", originalEn: false, infra: false },
  { code: "004", zh: "香港上海滙豐銀行有限公司", en: "The Hongkong and Shanghai Banking Corporation Limited", originalEn: false, infra: false },
  { code: "005", zh: "東方滙理銀行", en: "Crédit Agricole Corporate and Investment Bank", originalEn: false, infra: false },
  { code: "006", zh: "花旗銀行", en: "Citibank, N.A.", originalEn: false, infra: false },
  { code: "007", zh: "摩根大通銀行", en: "JPMorgan Chase Bank, N.A.", originalEn: false, infra: false },
  { code: "008", zh: "國民西敏寺資本市場銀行有限公司", en: "NatWest Markets plc", originalEn: false, infra: false },
  { code: "009", zh: "中國建設銀行（亞洲）股份有限公司", en: "China Construction Bank (Asia) Corporation Limited", originalEn: false, infra: false },
  { code: "012", zh: "中國銀行（香港）有限公司", en: "Bank of China (Hong Kong) Limited", originalEn: false, infra: false },
  { code: "015", zh: "東亞銀行有限公司", en: "The Bank of East Asia, Limited", originalEn: false, infra: false },
  { code: "016", zh: "星展銀行（香港）有限公司", en: "DBS Bank (Hong Kong) Limited", originalEn: false, infra: false },
  { code: "018", zh: "中信銀行國際有限公司", en: "China CITIC Bank International Limited", originalEn: false, infra: false },
  { code: "020", zh: "招商永隆銀行有限公司", en: "CMB Wing Lung Bank Limited", originalEn: false, infra: false },
  { code: "022", zh: "華僑銀行", en: "Oversea-Chinese Banking Corporation Limited (OCBC)", originalEn: false, infra: false },
  { code: "024", zh: "恒生銀行有限公司", en: "Hang Seng Bank Limited", originalEn: false, infra: false },
  { code: "025", zh: "上海商業銀行有限公司", en: "Shanghai Commercial Bank Limited", originalEn: false, infra: false },
  { code: "027", zh: "交通銀行股份有限公司", en: "Bank of Communications Co., Ltd.", originalEn: false, infra: false },
  { code: "028", zh: "大眾銀行（香港）有限公司", en: "Public Bank (Hong Kong) Limited", originalEn: false, infra: false },
  { code: "035", zh: "華僑銀行（香港）有限公司", en: "OCBC Wing Hang Bank Limited", originalEn: false, infra: false },
  { code: "038", zh: "大有銀行有限公司", en: "Tai Yau Bank Limited", originalEn: false, infra: false },
  { code: "039", zh: "集友銀行有限公司", en: "Chiyu Banking Corporation Limited", originalEn: false, infra: false },
  { code: "040", zh: "大新銀行有限公司", en: "Dah Sing Bank Limited", originalEn: false, infra: false },
  { code: "041", zh: "創興銀行有限公司", en: "Chong Hing Bank Limited", originalEn: false, infra: false },
  { code: "043", zh: "南洋商業銀行有限公司", en: "Nanyang Commercial Bank Limited", originalEn: false, infra: false },
  { code: "045", zh: "UCO Bank", en: "UCO Bank", originalEn: true, infra: false },
  { code: "046", zh: "KEB Hana Bank", en: "KEB Hana Bank", originalEn: true, infra: false },
  { code: "047", zh: "三菱UFJ銀行", en: "MUFG Bank, Ltd.", originalEn: false, infra: false },
  { code: "049", zh: "盤谷銀行", en: "Bangkok Bank Public Company Limited", originalEn: false, infra: false },
  { code: "050", zh: "印度海外銀行", en: "Indian Overseas Bank", originalEn: false, infra: false },
  { code: "054", zh: "德意志銀行", en: "Deutsche Bank AG", originalEn: false, infra: false },
  { code: "055", zh: "美國銀行", en: "Bank of America, N.A.", originalEn: false, infra: false },
  { code: "056", zh: "法國巴黎銀行", en: "BNP Paribas", originalEn: false, infra: false },
  { code: "058", zh: "印度銀行", en: "Bank of India", originalEn: false, infra: false },
  { code: "060", zh: "巴基斯坦國民銀行", en: "National Bank of Pakistan", originalEn: false, infra: false },
  { code: "061", zh: "大生銀行有限公司", en: "Tai Sang Bank Limited", originalEn: false, infra: false },
  { code: "063", zh: "馬來亞銀行", en: "Malayan Banking Berhad (Maybank)", originalEn: false, infra: false },
  { code: "065", zh: "三井住友銀行", en: "Sumitomo Mitsui Banking Corporation", originalEn: false, infra: false },
  { code: "066", zh: "印尼國家銀行", en: "PT. Bank Negara Indonesia (Persero) Tbk.", originalEn: false, infra: false },
  { code: "067", zh: "金源銀行有限公司", en: "BDO Unibank, Inc.", originalEn: false, infra: false },
  { code: "071", zh: "大華銀行有限公司", en: "United Overseas Bank Limited (UOB)", originalEn: false, infra: false },
  { code: "072", zh: "中國工商銀行（亞洲）有限公司", en: "Industrial and Commercial Bank of China (Asia) Limited", originalEn: false, infra: false },
  { code: "074", zh: "Barclays Bank PLC.", en: "Barclays Bank PLC.", originalEn: true, infra: false },
  { code: "076", zh: "加拿大豐業銀行", en: "The Bank of Nova Scotia", originalEn: false, infra: false },
  { code: "080", zh: "加拿大皇家銀行", en: "Royal Bank of Canada", originalEn: false, infra: false },
  { code: "081", zh: "法國興業銀行", en: "Société Générale", originalEn: false, infra: false },
  { code: "082", zh: "印度國家銀行", en: "State Bank of India", originalEn: false, infra: false },
  { code: "085", zh: "多倫多多明尼銀行", en: "The Toronto-Dominion Bank (TD)", originalEn: false, infra: false },
  { code: "086", zh: "滿地可銀行", en: "Bank of Montreal (BMO)", originalEn: false, infra: false },
  { code: "092", zh: "加拿大帝國商業銀行", en: "Canadian Imperial Bank of Commerce (CIBC)", originalEn: false, infra: false },
  { code: "103", zh: "瑞士銀行", en: "UBS AG", originalEn: false, infra: false },
  { code: "106", zh: "美國滙豐銀行", en: "HSBC Bank USA, N.A.", originalEn: false, infra: false },
  { code: "109", zh: "瑞穗銀行", en: "Mizuho Bank, Ltd.", originalEn: false, infra: false },
  { code: "113", zh: "德國中央合作銀行", en: "DZ Bank AG (Deutsche Zentral-Genossenschaftsbank)", originalEn: false, infra: false },
  { code: "118", zh: "友利銀行", en: "Woori Bank", originalEn: false, infra: false },
  { code: "119", zh: "Philippine National Bank", en: "Philippine National Bank", originalEn: true, infra: false },
  { code: "128", zh: "富邦銀行（香港）有限公司", en: "Fubon Bank (Hong Kong) Limited", originalEn: false, infra: false },
  { code: "138", zh: "三菱UFJ信託銀行", en: "Mitsubishi UFJ Trust and Banking Corporation", originalEn: false, infra: false },
  { code: "139", zh: "紐約梅隆銀行有限公司", en: "The Bank of New York Mellon", originalEn: false, infra: false },
  { code: "145", zh: "ING Bank N.V.", en: "ING Bank N.V.", originalEn: true, infra: false },
  { code: "147", zh: "西班牙對外銀行", en: "Banco Bilbao Vizcaya Argentaria (BBVA)", originalEn: false, infra: false },
  { code: "150", zh: "澳大利亞國民銀行", en: "National Australia Bank Limited", originalEn: false, infra: false },
  { code: "151", zh: "西太平洋銀行", en: "Westpac Banking Corporation", originalEn: false, infra: false },
  { code: "152", zh: "澳新銀行集團有限公司", en: "Australia and New Zealand Banking Group Limited (ANZ)", originalEn: false, infra: false },
  { code: "153", zh: "澳洲聯邦銀行", en: "Commonwealth Bank of Australia", originalEn: false, infra: false },
  { code: "161", zh: "義大利聯合聖保羅銀行股份有限公司", en: "Intesa Sanpaolo S.p.A.", originalEn: false, infra: false },
  { code: "164", zh: "裕信（德國）銀行股份有限公司", en: "UniCredit Bank AG", originalEn: false, infra: false },
  { code: "170", zh: "千葉銀行", en: "The Chiba Bank, Ltd.", originalEn: false, infra: false },
  { code: "178", zh: "比利時聯合銀行", en: "KBC Bank N.V.", originalEn: false, infra: false },
  { code: "180", zh: "富國銀行香港分行", en: "Wells Fargo Bank, N.A. (Hong Kong Branch)", originalEn: false, infra: false },
  { code: "183", zh: "荷蘭合作銀行", en: "Rabobank (Coöperatieve Rabobank U.A.)", originalEn: false, infra: false },
  { code: "185", zh: "星展銀行香港分行", en: "DBS Bank Ltd. (Hong Kong Branch)", originalEn: false, infra: false },
  { code: "186", zh: "靜岡銀行", en: "The Shizuoka Bank, Ltd.", originalEn: false, infra: false },
  { code: "188", zh: "八十二銀行", en: "The Hachijuni Bank, Ltd.", originalEn: false, infra: false },
  { code: "198", zh: "華南商業銀行股份有限公司", en: "Hua Nan Commercial Bank, Ltd.", originalEn: false, infra: false },
  { code: "199", zh: "滋賀銀行", en: "The Shiga Bank, Ltd.", originalEn: false, infra: false },
  { code: "201", zh: "臺灣銀行股份有限公司", en: "Bank of Taiwan Co., Ltd.", originalEn: false, infra: false },
  { code: "202", zh: "The Chugoku Bank Limited", en: "The Chugoku Bank Limited", originalEn: true, infra: false },
  { code: "203", zh: "第一商業銀行股份有限公司", en: "First Commercial Bank Co., Ltd.", originalEn: false, infra: false },
  { code: "206", zh: "彰化商業銀行股份有限公司", en: "Chang Hwa Commercial Bank, Ltd.", originalEn: false, infra: false },
  { code: "210", zh: "法國外貿銀行", en: "Natixis S.A.", originalEn: false, infra: false },
  { code: "214", zh: "中國工商銀行股份有限公司", en: "Industrial and Commercial Bank of China Limited", originalEn: false, infra: false },
  { code: "220", zh: "美國運通銀行", en: "American Express National Bank", originalEn: false, infra: false },
  { code: "221", zh: "中國建設銀行股份有限公司", en: "China Construction Bank Corporation", originalEn: false, infra: false },
  { code: "222", zh: "中國農業銀行股份有限公司", en: "Agricultural Bank of China Limited", originalEn: false, infra: false },
  { code: "227", zh: "Erste Group Bank AG", en: "Erste Group Bank AG", originalEn: true, infra: false },
  { code: "229", zh: "中國信託商業銀行股份有限公司", en: "CTBC Bank Co., Ltd.", originalEn: false, infra: false },
  { code: "230", zh: "臺灣中小企業銀行股份有限公司", en: "Taiwan Business Bank Co., Ltd.", originalEn: false, infra: false },
  { code: "233", zh: "Credit Suisse AG", en: "Credit Suisse AG", originalEn: true, infra: false },
  { code: "236", zh: "國泰世華商業銀行股份有限公司", en: "Cathay United Bank Co., Ltd.", originalEn: false, infra: false },
  { code: "237", zh: "瑞士豐業銀行股份有限公司", en: "The Bank of Nova Scotia", originalEn: false, infra: false },
  { code: "238", zh: "招商銀行股份有限公司", en: "China Merchants Bank Co., Ltd.", originalEn: false, infra: false },
  { code: "239", zh: "台北富邦商業銀行股份有限公司", en: "Taipei Fubon Commercial Bank Co., Ltd.", originalEn: false, infra: false },
  { code: "241", zh: "永豐商業銀行股份有限公司", en: "Bank SinoPac Co., Ltd.", originalEn: false, infra: false },
  { code: "242", zh: "兆豐國際商業銀行", en: "Mega International Commercial Bank", originalEn: false, infra: false },
  { code: "243", zh: "玉山商業銀行股份有限公司", en: "E.SUN Commercial Bank, Ltd.", originalEn: false, infra: false },
  { code: "245", zh: "台新國際商業銀行股份有限公司", en: "Taishin International Bank Co., Ltd.", originalEn: false, infra: false },
  { code: "248", zh: "豐隆銀行有限公司", en: "Hong Leong Bank Berhad", originalEn: false, infra: false },
  { code: "249", zh: "渣打銀行", en: "Standard Chartered Bank", originalEn: false, infra: false },
  { code: "250", zh: "花旗銀行（香港）有限公司", en: "Citibank (Hong Kong) Limited", originalEn: false, infra: false },
  { code: "251", zh: "ICICI Bank Limited", en: "ICICI Bank Limited", originalEn: true, infra: false },
  { code: "254", zh: "Melli Bank plc", en: "Bank Melli Iran (Melli Bank plc)", originalEn: false, infra: false },
  { code: "258", zh: "華美銀行", en: "East West Bank", originalEn: false, infra: false },
  { code: "260", zh: "遠東國際商業銀行股份有限公司", en: "Far Eastern International Bank Co., Ltd.", originalEn: false, infra: false },
  { code: "263", zh: "國泰銀行", en: "Cathay Bank", originalEn: false, infra: false },
  { code: "264", zh: "台灣土地銀行股份有限公司", en: "Land Bank of Taiwan Co., Ltd.", originalEn: false, infra: false },
  { code: "265", zh: "合作金庫商業銀行股份有限公司", en: "Taiwan Cooperative Bank Co., Ltd.", originalEn: false, infra: false },
  { code: "267", zh: "西班牙桑坦德銀行有限公司", en: "Banco Santander, S.A.", originalEn: false, infra: false },
  { code: "268", zh: "Union Bank of India", en: "Union Bank of India", originalEn: true, infra: false },
  { code: "269", zh: "上海商業儲蓄銀行股份有限公司", en: "Shanghai Commercial & Savings Bank Co., Ltd.", originalEn: false, infra: false },
  { code: "271", zh: "Industrial Bank of Korea", en: "Industrial Bank of Korea (IBK)", originalEn: true, infra: false },
  { code: "272", zh: "新加坡銀行有限公司", en: "Bank of Singapore Limited", originalEn: false, infra: false },
  { code: "273", zh: "Shinhan Bank", en: "Shinhan Bank", originalEn: true, infra: false },
  { code: "274", zh: "王道商業銀行股份有限公司", en: "O-Bank Co., Ltd.", originalEn: false, infra: false },
  { code: "276", zh: "國家開發銀行", en: "China Development Bank", originalEn: false, infra: false },
  { code: "277", zh: "First Abu Dhabi Bank PJSC", en: "First Abu Dhabi Bank PJSC", originalEn: true, infra: false },
  { code: "278", zh: "Bank J. Safra Sarasin Ltd", en: "Bank J. Safra Sarasin Ltd", originalEn: true, infra: false },
  { code: "307", zh: "ABN AMRO Bank N.V.", en: "ABN AMRO Bank N.V.", originalEn: true, infra: false },
  { code: "308", zh: "HDFC Bank Limited", en: "HDFC Bank Limited", originalEn: true, infra: false },
  { code: "309", zh: "Union Bancaire Privée, UBP SA", en: "Union Bancaire Privée, UBP SA", originalEn: true, infra: false },
  { code: "316", zh: "Skandinaviska Enskilda Banken AB", en: "Skandinaviska Enskilda Banken AB (SEB)", originalEn: true, infra: false },
  { code: "320", zh: "Bank Julius Baer & Co. Ltd.", en: "Bank Julius Baer & Co. Ltd.", originalEn: true, infra: false },
  { code: "324", zh: "Credit Industriel et Commercial", en: "Crédit Industriel et Commercial (CIC)", originalEn: false, infra: false },
  { code: "337", zh: "臺灣新光商業銀行股份有限公司", en: "Shin Kong Commercial Bank Co., Ltd.", originalEn: false, infra: false },
  { code: "338", zh: "中國銀行香港分行", en: "Bank of China, Hong Kong Branch", originalEn: false, infra: false },
  { code: "339", zh: "CA Indosuez (Switzerland) SA", en: "CA Indosuez (Switzerland) SA", originalEn: true, infra: false },
  { code: "342", zh: "LGT 皇家銀行（香港）", en: "LGT Bank (Hong Kong) Limited", originalEn: false, infra: false },
  { code: "345", zh: "上海浦東發展銀行股份有限公司", en: "Shanghai Pudong Development Bank Co., Ltd.", originalEn: false, infra: false },
  { code: "353", zh: "中國民生銀行股份有限公司", en: "China Minsheng Banking Corp., Ltd.", originalEn: false, infra: false },
  { code: "359", zh: "廣發銀行股份有限公司", en: "China Guangfa Bank Co., Ltd.", originalEn: false, infra: false },
  { code: "361", zh: "渤海銀行股份有限公司", en: "China Bohai Bank Co., Ltd.", originalEn: false, infra: false },
  { code: "364", zh: "Banque Pictet & Cie SA", en: "Banque Pictet & Cie SA", originalEn: false, infra: false },
  { code: "365", zh: "東莞銀行股份有限公司", en: "Bank of Dongguan Co., Ltd.", originalEn: false, infra: false },
  { code: "368", zh: "中國光大銀行股份有限公司", en: "China Everbright Bank Co., Ltd.", originalEn: false, infra: false },
  { code: "371", zh: "三井住友信託銀行", en: "Sumitomo Mitsui Trust Bank, Limited", originalEn: false, infra: false },
  { code: "372", zh: "上海銀行（香港）有限公司", en: "Bank of Shanghai (Hong Kong) Limited", originalEn: false, infra: false },
  { code: "374", zh: "CIMB Bank Berhad", en: "CIMB Bank Berhad", originalEn: true, infra: false },
  { code: "376", zh: "農協銀行", en: "NongHyup Bank", originalEn: false, infra: false },
  { code: "377", zh: "興業銀行股份有限公司", en: "Industrial Bank Co., Ltd.", originalEn: false, infra: false },
  { code: "378", zh: "元大商業銀行股份有限公司", en: "Yuanta Commercial Bank Co., Ltd.", originalEn: false, infra: false },
  { code: "379", zh: "Mashreq Bank - Public Shareholding Company", en: "Mashreq Bank PSC", originalEn: false, infra: false },
  { code: "381", zh: "Kookmin Bank", en: "Kookmin Bank", originalEn: true, infra: false },
  { code: "382", zh: "交通銀行（香港）有限公司", en: "Bank of Communications (Hong Kong) Limited", originalEn: false, infra: false },
  { code: "383", zh: "浙商銀行股份有限公司", en: "China Zheshang Bank Co., Ltd.", originalEn: false, infra: false },
  { code: "384", zh: "摩根士丹利銀行亞洲有限公司", en: "Morgan Stanley Bank Asia Limited", originalEn: false, infra: false },
  { code: "385", zh: "平安銀行股份有限公司", en: "Ping An Bank Co., Ltd.", originalEn: false, infra: false },
  { code: "386", zh: "華夏銀行股份有限公司", en: "Hua Xia Bank Co., Limited", originalEn: false, infra: false },
  { code: "387", zh: "眾安銀行有限公司", en: "ZA Bank Limited", originalEn: false, infra: false },
  { code: "388", zh: "理慧銀行有限公司", en: "Livi Bank Limited", originalEn: false, infra: false },
  { code: "389", zh: "Mox Bank Limited", en: "Mox Bank Limited", originalEn: true, infra: false },
  { code: "390", zh: "Welab Bank Limited", en: "WeLab Bank Limited", originalEn: false, infra: false },
  { code: "391", zh: "富融銀行有限公司", en: "Fusion Bank Limited", originalEn: false, infra: false },
  { code: "392", zh: "平安壹賬通銀行（香港）有限公司", en: "Ping An OneConnect Bank (Hong Kong) Limited", originalEn: false, infra: false },
  { code: "393", zh: "螞蟻銀行（香港）有限公司", en: "Ant Bank (Hong Kong) Limited", originalEn: false, infra: false },
  { code: "394", zh: "卡塔爾國家銀行", en: "Qatar National Bank (QNB)", originalEn: false, infra: false },
  { code: "395", zh: "天星銀行有限公司", en: "Airstar Bank Limited", originalEn: false, infra: false },
  { code: "802", zh: "Hong Kong Securities Clearing Company Limited", en: "Hong Kong Securities Clearing Company Limited", originalEn: true, infra: true },
  { code: "810", zh: "香港金融管理局-CMU Digital", en: "Hong Kong Monetary Authority - CMU Digital", originalEn: false, infra: true },
  { code: "851", zh: "香港金融管理局-CTB A", en: "Hong Kong Monetary Authority - CTB A", originalEn: false, infra: true },
  { code: "868", zh: "CLS Bank International", en: "CLS Bank International", originalEn: true, infra: true },
];

export const HKICL_SETTLEMENT_BANKS = HKICL_BANKS.filter((bank) => !bank.infra);

/** Common short names not present in the HKICL legal titles. */
const BANK_ALIASES: Record<string, string[]> = {
  "003": ["渣打", "scb", "stanchart"],
  "004": ["滙豐", "汇丰", "hsbc"],
  "006": ["花旗", "citi", "citibank"],
  "012": ["中銀", "中银", "中国银行", "中國銀行", "bochk", "boc"],
  "015": ["東亞", "东亚", "bea"],
  "016": ["星展", "dbs"],
  "024": ["恒生", "hangseng"],
  "040": ["大新"],
  "072": ["工銀亞洲", "工银亚洲", "icbca"],
  "250": ["花旗香港"],
};

function simplify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s.'’`,._-]+/g, "")
    .replace(/[（）()]/g, "")
    .replace(/有限公司|股份有限公司|limited|corporation|company|co,?ltd/g, "");
}

function bankNeedles(bank: HkiclBank): string[] {
  return [bank.code, bank.zh, bank.en, ...(BANK_ALIASES[bank.code] ?? [])];
}

export function findBankByCode(code: string): HkiclBank | undefined {
  const trimmed = code.trim();
  if (!/^\d{3}$/.test(trimmed)) return undefined;
  return HKICL_SETTLEMENT_BANKS.find((bank) => bank.code === trimmed);
}

export function searchSettlementBanks(query: string, limit = 12): HkiclBank[] {
  const raw = query.trim();
  if (!raw) return HKICL_SETTLEMENT_BANKS.slice(0, limit);
  const q = raw.toLowerCase();
  const compact = simplify(raw);
  const digits = raw.replace(/\D/g, "");
  const scored = HKICL_SETTLEMENT_BANKS.map((bank) => {
    const zh = simplify(bank.zh);
    const en = simplify(bank.en);
    const aliases = (BANK_ALIASES[bank.code] ?? []).map(simplify);
    let score = 0;
    if (bank.code === raw || bank.code === digits) score = 100;
    else if (digits.length > 0 && /^\d+$/.test(raw) && bank.code.startsWith(digits)) score = 85;
    else if (zh === compact || en === compact || aliases.includes(compact)) score = 95;
    else if (aliases.some((alias) => alias === compact || compact === alias)) score = 90;
    else if (zh.startsWith(compact) || en.startsWith(compact) || aliases.some((alias) => alias.startsWith(compact))) score = 70;
    else if (zh.includes(compact) || en.includes(compact) || aliases.some((alias) => alias.includes(compact))) score = 40;
    else if (bankNeedles(bank).some((needle) => needle.toLowerCase().includes(q))) score = 30;
    return { bank, score };
  }).filter((row) => row.score > 0);
  scored.sort((a, b) => b.score - a.score || a.bank.code.localeCompare(b.bank.code));
  return scored.slice(0, limit).map((row) => row.bank);
}

/** Complete name / alias / 3-digit code only. Prefixes must not autofill, or backspace cannot edit the legal title. */
export function pickUniqueBank(query: string): HkiclBank | undefined {
  const raw = query.trim();
  if (!raw) return undefined;
  const digits = raw.replace(/\s/g, "");
  if (/^\d{3}$/.test(digits)) return findBankByCode(digits);
  const compact = simplify(raw);
  if (!compact) return undefined;
  const legalExact = HKICL_SETTLEMENT_BANKS.filter(
    (bank) => simplify(bank.zh) === compact || simplify(bank.en) === compact
  );
  if (legalExact.length === 1) return legalExact[0];
  const aliasExact = HKICL_SETTLEMENT_BANKS.filter((bank) =>
    (BANK_ALIASES[bank.code] ?? []).map(simplify).includes(compact)
  );
  if (aliasExact.length === 1) return aliasExact[0];
  return undefined;
}

export function matchedBank(name: string, code: string): HkiclBank | undefined {
  const byCode = findBankByCode(code);
  if (byCode && name.trim() === byCode.zh) return byCode;
  return undefined;
}

