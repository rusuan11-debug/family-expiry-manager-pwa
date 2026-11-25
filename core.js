export const APP_VERSION = '1.1.0';
export const CATEGORIES = ['食品饮料', '母婴用品', '护肤化妆品', '日化清洁'];
export const PHOTO_FIELDS = ['cover', 'dateLabel', 'ingredientsLabel'];
export const PHOTO_LABELS = {
  cover: '商品照片',
  dateLabel: '生产日期 / 保质期标签',
  ingredientsLabel: '配料表照片'
};
export const DEFAULT_PROFILES = [
  { id: 'pregnant', label: '孕妇', active: true },
  { id: 'infant', label: '婴幼儿（0–3岁）', active: true },
  { id: 'child', label: '儿童（3–12岁）', active: true }
];

export const DEFAULT_RULES = [
  { id: 'caffeine', keywords: ['咖啡因', '茶碱'], title: '咖啡因相关提示', note: '需结合每份含量、每日总摄入量和年龄判断。孕期及儿童应特别留意总摄入；仅凭配料名称无法判断剂量。', audiences: ['pregnant', 'infant', 'child'], kind: '摄入量核对' },
  { id: 'alcohol', keywords: ['乙醇', '酒精', '食用酒精'], title: '酒精相关提示', note: '需要区分食品摄入与外用产品，并核对含量、使用方式及是否残留；不能只凭成分名称判断适用性。', audiences: ['pregnant', 'infant', 'child'], kind: '使用方式核对' },
  { id: 'retinoid', keywords: ['视黄醇', '维A醇', '维A酸', '视黄醛', '阿达帕林'], title: '维A类成分提示', note: '孕期使用维A类护肤或药用成分前，应先向医生或药师确认；不同成分、浓度和用途不能一概而论。', audiences: ['pregnant'], kind: '孕期重点核对' },
  { id: 'salicylic', keywords: ['水杨酸'], title: '水杨酸相关提示', note: '需要结合浓度、剂型、使用面积、频率和使用人群判断；仅凭配料表不能确认安全性。', audiences: ['pregnant', 'infant', 'child'], kind: '浓度与用法核对' },
  { id: 'benzoyl', keywords: ['过氧化苯甲酰'], title: '过氧化苯甲酰提示', note: '需结合产品类别、浓度、使用部位和年龄；孕期或儿童使用前建议核对医生或药师意见。', audiences: ['pregnant', 'infant', 'child'], kind: '产品用途核对' },
  { id: 'fragrance', keywords: ['香精', '香料', '芳香剂', '香氛'], title: '香精 / 香料提示', note: '部分敏感人群可能出现刺激或过敏反应；需结合产品类型、使用部位和个人反应判断。', audiences: ['infant', 'child'], kind: '敏感风险提示' },
  { id: 'peanut', keywords: ['花生'], title: '花生过敏原提示', note: '属于常见过敏原提示；是否适用需结合家庭成员个人过敏史及标签中的过敏原声明。', audiences: ['infant', 'child'], kind: '过敏原核对' },
  { id: 'milk', keywords: ['牛奶', '乳粉', '乳清', '酪蛋白', '乳清蛋白'], title: '乳类过敏原提示', note: '属于乳类相关过敏原提示；乳糖不耐受与牛奶蛋白过敏并非同一概念，需结合个人情况判断。', audiences: ['infant', 'child'], kind: '过敏原核对' },
  { id: 'egg', keywords: ['鸡蛋', '蛋清', '蛋黄', '蛋粉'], title: '蛋类过敏原提示', note: '属于常见过敏原提示；需结合个人过敏史及产品标签确认。', audiences: ['infant', 'child'], kind: '过敏原核对' },
  { id: 'soy', keywords: ['大豆', '豆粉', '大豆蛋白'], title: '大豆过敏原提示', note: '属于常见过敏原提示；需结合个人过敏史及产品标签确认。', audiences: ['infant', 'child'], kind: '过敏原核对' },
  { id: 'wheat', keywords: ['小麦', '面筋', '麸质'], title: '小麦 / 麸质提示', note: '需结合麸质相关疾病或过敏史判断；不能仅凭成分名称推断所有人都需要避免。', audiences: ['infant', 'child'], kind: '过敏原核对' },
  { id: 'nuts', keywords: ['坚果', '杏仁', '核桃', '腰果', '榛子', '开心果'], title: '坚果过敏原提示', note: '属于常见过敏原提示；婴幼儿添加辅食及有过敏史者应按专业建议处理。', audiences: ['infant', 'child'], kind: '过敏原核对' },
  { id: 'seafood', keywords: ['虾', '蟹', '甲壳类', '鱼类', '鱼肉', '贝类'], title: '水产过敏原提示', note: '属于常见过敏原提示；需结合个人过敏史及产品标签确认。', audiences: ['infant', 'child'], kind: '过敏原核对' },
  { id: 'sesame', keywords: ['芝麻', '芝麻酱'], title: '芝麻相关提示', note: '属于常见过敏原提示；需结合个人过敏史及产品标签确认。', audiences: ['infant', 'child'], kind: '过敏原核对' }
];

export function todayISO(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isValidDate(value) {
  if (!value) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function addDuration(dateString, amount, unit) {
  if (!dateString || !isValidDate(dateString) || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return '';
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const count = Math.floor(Number(amount));
  if (unit === 'days') {
    date.setDate(date.getDate() + count);
  } else if (unit === 'months') {
    const targetMonth = date.getMonth() + count;
    const targetYear = date.getFullYear() + Math.floor(targetMonth / 12);
    const normalizedMonth = ((targetMonth % 12) + 12) % 12;
    const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
    date.setFullYear(targetYear, normalizedMonth, Math.min(day, lastDay));
  } else if (unit === 'years') {
    const targetYear = date.getFullYear() + count;
    const lastDay = new Date(targetYear, date.getMonth() + 1, 0).getDate();
    date.setFullYear(targetYear, date.getMonth(), Math.min(day, lastDay));
  } else {
    return '';
  }
  return todayISO(date);
}

export function effectiveExpiry(product) {
  const packageExpiry = product.printedExpiryDate || addDuration(product.productionDate, product.shelfLifeValue, product.shelfLifeUnit);
  const openedExpiry = product.opened && product.openedDate
    ? addDuration(product.openedDate, product.openedShelfLifeValue, product.openedShelfLifeUnit)
    : '';
  if (packageExpiry && openedExpiry) return packageExpiry < openedExpiry ? packageExpiry : openedExpiry;
  return packageExpiry || openedExpiry || '';
}

export function daysRemaining(expiry, now = new Date()) {
  if (!expiry || !isValidDate(expiry)) return null;
  const [year, month, day] = expiry.split('-').map(Number);
  const [todayYear, todayMonth, todayDay] = todayISO(now).split('-').map(Number);
  const dueUTC = Date.UTC(year, month - 1, day);
  const todayUTC = Date.UTC(todayYear, todayMonth - 1, todayDay);
  return Math.round((dueUTC - todayUTC) / 86400000);
}

export function expiryStatus(product, now = new Date()) {
  const expiry = effectiveExpiry(product);
  if (!expiry) return { key: 'unknown', text: '未填写期限', days: null, expiry: '' };
  const days = daysRemaining(expiry, now);
  if (days < 0) return { key: 'expired', text: '已过期', days, expiry };
  if (days === 0) return { key: 'today', text: '今天到期', days, expiry };
  if (days <= 7) return { key: 'soon', text: `剩余${days}天`, days, expiry };
  return { key: 'normal', text: `剩余${days}天`, days, expiry };
}

export function parseLabelDates(text) {
  const input = String(text || '');
  const matches = [];
  const patterns = [
    /(\d{4})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})\s*日?/g,
    /(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)/g
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (!isValidDate(date)) continue;
      const before = input.slice(Math.max(0, match.index - 20), match.index);
      let type = 'unknown';
      if (/生产日期|生产|制造日期|制造|出厂日期/.test(before)) type = 'productionDate';
      else if (/有效期至|保质期至|到期日期|限用日期|失效日期|有效期/.test(before)) type = 'printedExpiryDate';
      if (!matches.some(item => item.date === date)) matches.push({ date, type, context: input.slice(Math.max(0, match.index - 20), Math.min(input.length, match.index + match[0].length + 20)).trim() });
    }
  }
  return matches;
}

export function analyzeIngredients(text, profiles = DEFAULT_PROFILES, customRules = []) {
  const source = String(text || '').toLowerCase();
  if (!source.trim()) return { status: '未录入配料表', level: 'neutral', matches: [], note: '可以拍摄配料表，再使用 iPhone 照片中的实况文本复制文字并粘贴到商品资料。' };
  const activeIds = profiles.filter(profile => profile.active).map(profile => profile.id);
  const matches = [];
  for (const rule of [...DEFAULT_RULES, ...customRules]) {
    const hits = (rule.keywords || []).filter(keyword => keyword && source.includes(String(keyword).toLowerCase()));
    if (!hits.length) continue;
    const audience = profiles.filter(profile => activeIds.includes(profile.id) && (rule.audiences || []).includes(profile.id)).map(profile => profile.label);
    matches.push({ title: rule.title || `成分提示：${hits.join('、')}`, note: rule.note || '请结合产品类别、含量和实际使用方式进一步核对。', kind: rule.kind || '自定义提示', hits, audience });
  }
  if (!matches.length) return { status: '未发现已收录提示项', level: 'caution', matches: [], note: '这不代表产品对孕妇或儿童一定安全。规则库并不完整，仍需核对完整配料表、含量、产品用途和个人过敏史。' };
  return { status: '发现需要核对的成分', level: 'warning', matches, note: '这是本地关键词提示，不是医学诊断或安全保证。未知成分、浓度和实际摄入 / 使用量仍需人工核对。' };
}

export function makeEmptyProduct() {
  return {
    id: globalThis.crypto?.randomUUID?.() || `p_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name: '', brand: '', category: CATEGORIES[0], quantity: '1',
    purchaseDate: todayISO(), productionDate: '', shelfLifeValue: '', shelfLifeUnit: 'months',
    printedExpiryDate: '', opened: false, openedDate: '', openedShelfLifeValue: '', openedShelfLifeUnit: 'days',
    storageLocation: '', ingredientText: '', note: '',
    photos: { cover: null, dateLabel: null, ingredientsLabel: null },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
}

export function validateProduct(product) {
  if (!product || typeof product !== 'object') throw new Error('商品资料格式不正确');
  if (!String(product.name || '').trim()) throw new Error('请填写商品名称');
  if (!CATEGORIES.includes(product.category)) throw new Error('商品分类不正确');
  for (const field of ['purchaseDate', 'productionDate', 'printedExpiryDate', 'openedDate']) {
    if (product[field] && !isValidDate(product[field])) throw new Error(`日期不正确：${field}`);
  }
  for (const field of ['shelfLifeValue', 'openedShelfLifeValue']) {
    if (product[field] !== '' && product[field] != null && (!Number.isFinite(Number(product[field])) || Number(product[field]) <= 0)) throw new Error('保质期时长必须大于 0');
  }
  return true;
}