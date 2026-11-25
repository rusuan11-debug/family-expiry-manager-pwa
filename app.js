import {
  APP_VERSION, CATEGORIES, PHOTO_FIELDS, PHOTO_LABELS,
  todayISO, isValidDate, addDuration, effectiveExpiry, daysRemaining,
  expiryStatus, makeEmptyProduct, validateProduct
} from './core.js';
import {
  getAllProducts, saveProduct, deleteProduct, getSetting, setSetting,
  exportBackup, importBackup
} from './storage.js';

const app = document.querySelector('#app');
const toastElement = document.querySelector('#toast');
const importInput = document.querySelector('#backup-import-input');
const state = {
  products: [], fridgeItems: [],
  tab: 'home', page: 'main',
  filter: '全部', search: '',
  fridgeFilter: '全部', fridgeSearch: '',
  draft: null, fridgeDraft: null,
  objectURLs: new Map(), toastTimer: null, dbReady: false,
  scannerOpen: false, scannerControls: null, barcodeStatus: ''
};

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const unitLabel = unit => ({ days: '天', months: '个月', years: '年' }[unit] || '天');
const FRIDGE_CATEGORIES = ['蔬菜水果', '肉类水产', '乳制品', '熟食剩菜', '其他'];
const STORAGE_MODES = ['冷藏', '冷冻'];

function toast(message, type = 'info') {
  toastElement.textContent = message;
  toastElement.className = 'toast show ' + type;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { toastElement.className = 'toast'; }, 2600);
}

function getPhotoURL(blob) {
  if (typeof blob === 'string' && blob.startsWith('data:image/')) return blob;
  if (!(blob instanceof Blob)) return '';
  if (!state.objectURLs.has(blob)) state.objectURLs.set(blob, URL.createObjectURL(blob));
  return state.objectURLs.get(blob);
}

function revokeUnusedPhotoURLs() {
  const active = new Set();
  for (const product of state.products) {
    const cover = product.photos?.cover;
    if (cover instanceof Blob) active.add(cover);
  }
  if (state.draft?.photos?.cover instanceof Blob) active.add(state.draft.photos.cover);
  for (const [blob, url] of state.objectURLs.entries()) {
    if (!active.has(blob)) {
      URL.revokeObjectURL(url);
      state.objectURLs.delete(blob);
    }
  }
}

async function reloadData() {
  state.products = await getAllProducts();
  state.fridgeItems = await getSetting('fridgeItems', []);
  if (!Array.isArray(state.fridgeItems)) state.fridgeItems = [];
  state.dbReady = true;
  revokeUnusedPhotoURLs();
}

function productCounts() {
  const statuses = state.products.map(product => expiryStatus(product));
  return {
    all: statuses.length,
    soon: statuses.filter(item => item.days !== null && item.days >= 0 && item.days <= 7).length,
    expired: statuses.filter(item => item.days !== null && item.days < 0).length
  };
}

function sortedProducts(products) {
  return [...products].sort((a, b) => {
    const left = daysRemaining(effectiveExpiry(a));
    const right = daysRemaining(effectiveExpiry(b));
    if (left === null && right === null) return String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt));
    if (left === null) return 1;
    if (right === null) return -1;
    return left - right;
  });
}

function fridgeExpiry(item) {
  return item.expiryDate || addDuration(item.storedAt, item.shelfLifeValue, item.shelfLifeUnit);
}

function fridgeStatus(item) {
  const expiry = fridgeExpiry(item);
  if (!expiry) return { key: 'unknown', text: '未填写期限', days: null, expiry: '' };
  const days = daysRemaining(expiry);
  if (days < 0) return { key: 'expired', text: '已过期', days, expiry };
  if (days === 0) return { key: 'today', text: '今天到期', days, expiry };
  if (days <= 3) return { key: 'soon', text: '剩余' + days + '天', days, expiry };
  return { key: 'normal', text: '剩余' + days + '天', days, expiry };
}

function sortedFridgeItems(items) {
  return [...items].sort((a, b) => {
    const left = daysRemaining(fridgeExpiry(a));
    const right = daysRemaining(fridgeExpiry(b));
    if (left === null && right === null) return String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt));
    if (left === null) return 1;
    if (right === null) return -1;
    return left - right;
  });
}

function productPhoto(product, className = 'product-photo') {
  const url = getPhotoURL(product.photos?.cover);
  return url
    ? '<div class="' + className + '"><img src="' + url + '" alt="' + escapeHTML(product.name) + ' 商品照片"></div>'
    : '<div class="' + className + '" aria-label="暂无商品照片">▢</div>';
}

function productCard(product) {
  const status = expiryStatus(product);
  return '<button class="product-card" data-action="detail" data-id="' + escapeHTML(product.id) + '">' +
    productPhoto(product) +
    '<div class="product-main"><div class="product-name">' + escapeHTML(product.name) + '</div>' +
    '<div class="product-meta">' + escapeHTML(product.category) + ' · ' + (product.opened ? '已开封' : '未开封') + '</div></div>' +
    '<span class="pill ' + status.key + '">' + escapeHTML(status.text) + '</span></button>';
}

function fridgeCard(item) {
  const status = fridgeStatus(item);
  return '<button class="product-card" data-action="fridge-detail" data-id="' + escapeHTML(item.id) + '">' +
    '<div class="product-photo fridge-food-icon">' + (item.storageMode === '冷冻' ? '❄' : '🥬') + '</div>' +
    '<div class="product-main"><div class="product-name">' + escapeHTML(item.name) + '</div>' +
    '<div class="product-meta">' + escapeHTML(item.category) + ' · ' + escapeHTML(item.storageMode) + ' · ' + escapeHTML(item.quantity || '1份') + '</div></div>' +
    '<span class="pill ' + status.key + '">' + escapeHTML(status.text) + '</span></button>';
}

function navHTML() {
  const tabs = [
    ['home', '⌂', '首页'],
    ['products', '⬡', '商品'],
    ['fridge', '▣', '冰箱'],
    ['settings', '⚙', '设置']
  ];
  return '<nav class="bottom-nav" aria-label="主导航">' + tabs.map(([id, icon, label]) =>
    '<button class="nav-btn ' + (state.tab === id ? 'active' : '') + '" data-action="tab" data-tab="' + id + '">' +
    '<span class="nav-icon">' + icon + '</span>' + label + '</button>'
  ).join('') + '</nav>';
}

function renderHome() {
  const totals = productCounts();
  const nearProducts = sortedProducts(state.products).filter(product => {
    const days = daysRemaining(effectiveExpiry(product));
    return days !== null && days >= -30 && days <= 30;
  }).slice(0, 4);
  const nearFridge = sortedFridgeItems(state.fridgeItems).filter(item => {
    const days = daysRemaining(fridgeExpiry(item));
    return days !== null && days >= -7 && days <= 7;
  }).slice(0, 3);
  return '<div class="subhead">管理家庭购买的商品与冰箱食物</div>' +
    '<div class="stats"><div class="stat"><strong>' + totals.all + '</strong><span>全部商品</span></div>' +
    '<div class="stat soon"><strong>' + totals.soon + '</strong><span>即将到期</span></div>' +
    '<div class="stat expired"><strong>' + totals.expired + '</strong><span>已过期</span></div></div>' +
    '<button class="primary" data-action="add">＋ 添加新商品</button>' +
    '<section class="section"><div class="section-head"><h2>商品分类</h2></div><div class="category-grid">' +
    CATEGORIES.map(category => '<button class="category" data-action="category" data-category="' + escapeHTML(category) + '">' +
      '<div class="ct"><span class="ci">' + ({ '食品饮料': '♜', '母婴用品': '◉', '护肤化妆品': '♧', '日化清洁': '▤' }[category] || '◇') + '</span>' + escapeHTML(category) + '</div>' +
      '<small>查看商品</small><span class="arrow">›</span></button>').join('') +
    '</div></section>' +
    '<section class="section"><div class="section-head"><h2>临近到期商品</h2><button class="link" data-action="tab" data-tab="products">查看全部</button></div>' +
    (nearProducts.length ? '<div class="product-list">' + nearProducts.map(productCard).join('') + '</div>' : '<div class="empty">目前没有30天内到期的商品</div>') +
    '</section>' +
    '<section class="section"><div class="section-head"><h2>冰箱食物</h2><button class="link" data-action="tab" data-tab="fridge">进入冰箱</button></div>' +
    (nearFridge.length ? '<div class="product-list">' + nearFridge.map(fridgeCard).join('') + '</div>' : '<div class="empty">冰箱记录独立管理，添加食物后会在这里显示临近到期项目</div>') +
    '<button class="secondary fridge-quick-add" data-action="fridge-add">＋ 记录冰箱食物</button></section>' +
    '<div class="footer-note">商品与冰箱记录分别保存在本机 · 离线可用</div>';
}

function filteredProducts() {
  const keyword = state.search.trim().toLowerCase();
  return sortedProducts(state.products).filter(product => {
    const categoryMatch = state.filter === '全部' || product.category === state.filter;
    const searchMatch = !keyword || [product.name, product.brand, product.barcode, product.storageLocation, product.ingredientText, product.note]
      .some(value => String(value || '').toLowerCase().includes(keyword));
    return categoryMatch && searchMatch;
  });
}

function renderProducts() {
  const products = filteredProducts();
  return '<div class="page-title"><h1>商品管理</h1><button class="secondary" style="margin-left:auto" data-action="add">＋ 添加商品</button></div>' +
    '<input class="search" id="product-search" type="search" placeholder="搜索商品名称、品牌或条形码" value="' + escapeHTML(state.search) + '" autocomplete="off">' +
    '<div class="chips">' + ['全部', ...CATEGORIES].map(category =>
      '<button class="chip ' + (state.filter === category ? 'active' : '') + '" data-action="filter" data-filter="' + escapeHTML(category) + '">' + escapeHTML(category) + '</button>'
    ).join('') + '</div>' +
    '<div id="product-results">' + (products.length ? '<div class="product-list">' + products.map(productCard).join('') + '</div>' : '<div class="empty">没有找到商品<br>可以调整搜索词或新增商品</div>') + '</div>';
}

function renderFridge() {
  const items = sortedFridgeItems(state.fridgeItems).filter(item => {
    const storageMatch = state.fridgeFilter === '全部' || item.storageMode === state.fridgeFilter;
    const keyword = state.fridgeSearch.trim().toLowerCase();
    const searchMatch = !keyword || [item.name, item.category, item.note].some(value => String(value || '').toLowerCase().includes(keyword));
    return storageMatch && searchMatch;
  });
  const soon = state.fridgeItems.filter(item => {
    const days = daysRemaining(fridgeExpiry(item));
    return days !== null && days >= 0 && days <= 3;
  }).length;
  const expired = state.fridgeItems.filter(item => {
    const days = daysRemaining(fridgeExpiry(item));
    return days !== null && days < 0;
  }).length;
  return '<div class="page-title"><h1>冰箱管理</h1><button class="secondary" style="margin-left:auto" data-action="fridge-add">＋ 添加食物</button></div>' +
    '<div class="stats fridge-stats"><div class="stat"><strong>' + state.fridgeItems.length + '</strong><span>冰箱食物</span></div>' +
    '<div class="stat soon"><strong>' + soon + '</strong><span>3天内到期</span></div>' +
    '<div class="stat expired"><strong>' + expired + '</strong><span>已过期</span></div></div>' +
    '<input class="search" id="fridge-search" type="search" placeholder="搜索冰箱里的食物" value="' + escapeHTML(state.fridgeSearch) + '" autocomplete="off">' +
    '<div class="chips">' + ['全部', ...STORAGE_MODES].map(mode =>
      '<button class="chip ' + (state.fridgeFilter === mode ? 'active' : '') + '" data-action="fridge-filter" data-filter="' + mode + '">' + mode + '</button>'
    ).join('') + '</div>' +
    (items.length ? '<div class="product-list">' + items.map(fridgeCard).join('') + '</div>' :
      '<div class="empty">冰箱里还没有记录<br>点击右上角「添加食物」开始记录</div>') +
    '<div class="notice">冰箱食物与「商品」分开保存。保存期限请结合食物种类、处理方式和实际冷藏温度判断。</div>';
}

function renderSettings() {
  return '<div class="page-title"><h1>设置</h1></div>' +
    '<section class="panel"><div class="form-section-title">数据备份与恢复</div>' +
    '<p class="hint">备份包含商品资料、商品照片和冰箱食物记录。建议定期导出到 iPhone「文件」中妥善保存。</p>' +
    '<div class="actions"><button class="secondary" data-action="export">导出完整备份</button><button class="secondary" data-action="import">从备份恢复</button></div>' +
    '<div class="notice">恢复备份会替换当前本机的商品和冰箱记录。建议先导出当前备份。不要把备份文件上传到公开 GitHub 仓库。</div></section>' +
    '<div class="footer-note">商品和冰箱资料保存在这台 iPhone 的本地数据库，不会上传商品资料。</div>';
}

function renderPhotoBlock() {
  const url = getPhotoURL(state.draft.photos?.cover);
  return '<div class="photo-block"><div class="photo-head"><span>商品照片</span><span class="hint">' + (url ? '已添加' : '未添加') + '</span></div>' +
    '<div class="photo-preview">' + (url ? '<img src="' + url + '" alt="商品照片">' : '商品照片预览') + '</div>' +
    '<div class="photo-buttons">' +
    '<label class="secondary photo-picker-label" for="camera-cover">📷 拍照</label>' +
    '<label class="secondary photo-picker-label" for="gallery-cover">▧ 从相册导入</label></div>' +
    '<input class="visually-hidden" id="camera-cover" type="file" accept="image/*" capture="environment" data-photo-input="cover">' +
    '<input class="visually-hidden" id="gallery-cover" type="file" accept="image/*" data-photo-input="cover">' +
    (url ? '<button type="button" class="link" data-action="remove-photo">移除照片</button>' : '') + '</div>';
}

function renderBarcodeScanner() {
  if (!state.scannerOpen) return '';
  return '<div class="modal-backdrop"><div class="modal scanner-modal"><h3>扫描商品条形码</h3>' +
    '<div class="scanner-frame"><video id="barcode-video" autoplay playsinline muted></video><span class="scanner-line"></span></div>' +
    '<p>将商品包装上的条形码放入框内，识别成功后会自动查询商品资料。</p>' +
    '<button class="secondary" style="width:100%" data-action="close-scanner">关闭扫描</button></div></div>';
}

function renderForm() {
  const product = state.draft;
  const expiry = effectiveExpiry(product);
  return '<div class="page-title"><button class="back" data-action="back">‹</button><h1>' +
    (state.products.some(item => item.id === product.id) ? '编辑商品' : '添加新商品') + '</h1></div>' +
    '<form id="product-form">' +
    '<section class="form-card"><div class="form-section-title">商品基本信息</div>' +
    '<div class="barcode-row"><div class="field barcode-field"><label for="field-barcode">商品条形码</label><input id="field-barcode" name="barcode" inputmode="numeric" autocomplete="off" value="' + escapeHTML(product.barcode || '') + '" placeholder="扫描或输入条形码"></div>' +
    '<button type="button" class="secondary scan-button" data-action="scan-barcode">▥ 扫码</button></div>' +
    '<button type="button" class="secondary lookup-button" data-action="lookup-barcode">查询商品资料</button>' +
    '<div id="barcode-status" class="hint" aria-live="polite">' + escapeHTML(state.barcodeStatus || '扫描后尝试从开放商品数据库读取名称、品牌、配料和营养资料。') + '</div>' +
    '<div class="field"><label for="field-name">商品名称（必填）</label><input id="field-name" name="name" required maxlength="80" value="' + escapeHTML(product.name) + '" placeholder="例如：纯牛奶"></div>' +
    '<div class="field"><label for="field-brand">品牌</label><input id="field-brand" name="brand" maxlength="80" value="' + escapeHTML(product.brand) + '" placeholder="选填"></div>' +
    '<div class="field"><label for="field-category">商品分类</label><select id="field-category" name="category">' +
    CATEGORIES.map(category => '<option value="' + escapeHTML(category) + '" ' + (product.category === category ? 'selected' : '') + '>' + escapeHTML(category) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label for="field-quantity">数量</label><input id="field-quantity" name="quantity" value="' + escapeHTML(product.quantity) + '" placeholder="例如：2盒"></div>' +
    '<div class="two"><div class="field"><label for="field-purchaseDate">购买日期</label><input id="field-purchaseDate" name="purchaseDate" type="date" value="' + escapeHTML(product.purchaseDate) + '"></div>' +
    '<div class="field"><label for="field-productionDate">生产日期</label><input id="field-productionDate" name="productionDate" type="date" value="' + escapeHTML(product.productionDate) + '"></div></div>' +
    '<div class="field"><label>保质期时长（根据生产日期推算）</label><div class="three"><input id="field-shelfLifeValue" name="shelfLifeValue" type="number" min="1" step="1" value="' + escapeHTML(product.shelfLifeValue) + '" placeholder="数值">' +
    '<select id="field-shelfLifeUnit" name="shelfLifeUnit"><option value="days" ' + (product.shelfLifeUnit === 'days' ? 'selected' : '') + '>天</option><option value="months" ' + (product.shelfLifeUnit === 'months' ? 'selected' : '') + '>个月</option><option value="years" ' + (product.shelfLifeUnit === 'years' ? 'selected' : '') + '>年</option></select></div></div>' +
    '<div class="field"><label for="field-printedExpiryDate">包装标注到期日期（优先采用）</label><input id="field-printedExpiryDate" name="printedExpiryDate" type="date" value="' + escapeHTML(product.printedExpiryDate) + '"></div>' +
    '<div class="field"><label>当前计算到期日</label><div id="expiry-preview" class="notice">' + (expiry ? escapeHTML(expiry) : '填写包装到期日期，或生产日期和保质期时长后自动计算。') + '</div></div>' +
    '<div class="switch-row"><strong>商品是否已开封</strong><button type="button" class="switch ' + (product.opened ? 'on' : '') + '" role="switch" aria-checked="' + (!!product.opened) + '" data-action="toggle-opened"></button></div>' +
    '<div id="opened-fields" class="' + (product.opened ? '' : 'visually-hidden') + '">' +
    '<div class="two"><div class="field"><label for="field-openedDate">开封日期</label><input id="field-openedDate" name="openedDate" type="date" value="' + escapeHTML(product.openedDate) + '"></div>' +
    '<div class="field"><label for="field-openedShelfLifeValue">开封后期限</label><input id="field-openedShelfLifeValue" name="openedShelfLifeValue" type="number" min="1" step="1" value="' + escapeHTML(product.openedShelfLifeValue) + '" placeholder="数值"></div></div>' +
    '<div class="field"><label for="field-openedShelfLifeUnit">开封后期限单位</label><select id="field-openedShelfLifeUnit" name="openedShelfLifeUnit"><option value="days" ' + (product.openedShelfLifeUnit === 'days' ? 'selected' : '') + '>天</option><option value="months" ' + (product.openedShelfLifeUnit === 'months' ? 'selected' : '') + '>个月</option><option value="years" ' + (product.openedShelfLifeUnit === 'years' ? 'selected' : '') + '>年</option></select></div></div>' +
    '<div class="field"><label for="field-storageLocation">存放位置</label><input id="field-storageLocation" name="storageLocation" value="' + escapeHTML(product.storageLocation) + '" placeholder="例如：橱柜、冰箱"></div>' +
    '<div class="field"><label for="field-note">备注</label><textarea id="field-note" name="note" placeholder="其他需要记录的信息">' + escapeHTML(product.note) + '</textarea></div></section>' +
    '<section class="form-card"><div class="form-section-title">商品照片</div>' + renderPhotoBlock() + '</section>' +
    '<section class="form-card"><div class="form-section-title">商品配料与营养资料</div>' +
    '<div class="field"><label for="field-ingredientText">配料表（条码数据库资料，可修改）</label><textarea id="field-ingredientText" name="ingredientText" placeholder="扫描条形码后尝试自动导入；也可以手动填写">' + escapeHTML(product.ingredientText || '') + '</textarea></div>' +
    '<div class="field"><label for="field-allergensText">过敏原信息</label><textarea id="field-allergensText" name="allergensText" placeholder="数据库有资料时自动导入">' + escapeHTML(product.allergensText || '') + '</textarea></div>' +
    '<div class="detail-line"><span>营养资料</span><span>' + escapeHTML(product.nutritionSummary || '尚未获取') + '</span></div>' +
    '<div class="hint">条码数据库资料可能缺失或不准确，保存前请与商品包装核对。条码查询会向 Open Food Facts 发送商品条形码，不会上传你的商品照片或本地记录。</div>' +
    '</section><div class="actions"><button class="secondary" type="button" data-action="back">取消</button><button class="primary" type="submit">保存商品</button></div></form>' +
    '<div class="footer-note">商品资料和照片仅保存在这台 iPhone 的本机数据库。</div>';
}

function renderFridgeForm() {
  const item = state.fridgeDraft;
  const computed = item.expiryDate || addDuration(item.storedAt, item.shelfLifeValue, item.shelfLifeUnit);
  return '<div class="page-title"><button class="back" data-action="back">‹</button><h1>' +
    (state.fridgeItems.some(row => row.id === item.id) ? '编辑冰箱食物' : '记录冰箱食物') + '</h1></div>' +
    '<form id="fridge-form"><section class="form-card"><div class="form-section-title">食物信息</div>' +
    '<div class="field"><label for="fridge-name">食物名称（必填）</label><input id="fridge-name" name="name" required maxlength="80" value="' + escapeHTML(item.name) + '" placeholder="例如：草莓、牛肉、剩菜"></div>' +
    '<div class="field"><label for="fridge-category">食物分类</label><select id="fridge-category" name="category">' +
    FRIDGE_CATEGORIES.map(category => '<option value="' + category + '" ' + (item.category === category ? 'selected' : '') + '>' + category + '</option>').join('') + '</select></div>' +
    '<div class="field"><label for="fridge-storageMode">存放方式</label><select id="fridge-storageMode" name="storageMode">' +
    STORAGE_MODES.map(mode => '<option value="' + mode + '" ' + (item.storageMode === mode ? 'selected' : '') + '>' + mode + '</option>').join('') + '</select></div>' +
    '<div class="field"><label for="fridge-quantity">数量</label><input id="fridge-quantity" name="quantity" value="' + escapeHTML(item.quantity || '1份') + '" placeholder="例如：2盒、500克"></div>' +
    '<div class="field"><label for="fridge-storedAt">放入冰箱日期</label><input id="fridge-storedAt" name="storedAt" type="date" value="' + escapeHTML(item.storedAt || todayISO()) + '"></div>' +
    '<div class="field"><label>预计保存期限（从放入日期计算）</label><div class="three"><input id="fridge-shelfLifeValue" name="shelfLifeValue" type="number" min="1" step="1" value="' + escapeHTML(item.shelfLifeValue || '') + '" placeholder="数值">' +
    '<select id="fridge-shelfLifeUnit" name="shelfLifeUnit"><option value="days" ' + (item.shelfLifeUnit === 'days' ? 'selected' : '') + '>天</option><option value="months" ' + (item.shelfLifeUnit === 'months' ? 'selected' : '') + '>个月</option></select></div></div>' +
    '<div class="field"><label for="fridge-expiryDate">预计食用期限 / 到期日（可直接填写）</label><input id="fridge-expiryDate" name="expiryDate" type="date" value="' + escapeHTML(item.expiryDate || '') + '"></div>' +
    '<div class="field"><label>预计到期日</label><div id="fridge-expiry-preview" class="notice">' + (computed || '填写保存期限，或直接填写到期日。') + '</div></div>' +
    '<div class="field"><label for="fridge-note">备注</label><textarea id="fridge-note" name="note" placeholder="例如：已清洗、已切开、密封保存">' + escapeHTML(item.note || '') + '</textarea></div>' +
    '</section><div class="actions"><button class="secondary" type="button" data-action="back">取消</button><button class="primary" type="submit">保存冰箱记录</button></div></form>';
}

function renderDetail(product) {
  const status = expiryStatus(product);
  const url = getPhotoURL(product.photos?.cover);
  return '<div class="page-title"><button class="back" data-action="back">‹</button><h1>' + escapeHTML(product.name) + '</h1></div>' +
    '<section class="detail-card">' + (url ? '<div class="detail-photo-grid"><div class="detail-photo"><img src="' + url + '" alt="商品照片"><small>商品照片</small></div></div>' : '') +
    detailLine('商品分类', product.category) + detailLine('品牌 / 数量', (product.brand || '未填写') + ' · ' + (product.quantity || '未填写')) +
    detailLine('商品条形码', product.barcode || '未录入') + detailLine('购买日期', product.purchaseDate || '未填写') +
    detailLine('生产日期', product.productionDate || '未填写') + detailLine('包装到期日期', product.printedExpiryDate || '未填写') +
    detailLine('保质期推算', product.shelfLifeValue ? product.shelfLifeValue + ' ' + unitLabel(product.shelfLifeUnit) : '未填写') +
    detailLine('开封状态', product.opened ? '已开封' : '未开封') +
    detailLine('开封日期 / 开封后期限', product.opened ? (product.openedDate || '未填写') + ' · ' + (product.openedShelfLifeValue ? product.openedShelfLifeValue + ' ' + unitLabel(product.openedShelfLifeUnit) : '未填写') : '—') +
    detailLine('最终计算到期日', status.expiry || '未填写') +
    '<div class="detail-line"><span>到期状态</span><span class="pill ' + status.key + '">' + escapeHTML(status.text) + '</span></div>' +
    detailLine('存放位置', product.storageLocation || '未填写') + detailLine('备注', product.note || '无') +
    detailLine('资料来源', product.dataSource || '手动录入') + '</section>' +
    '<section class="detail-card"><div class="form-section-title">配料表</div><div class="detail-copy">' + escapeHTML(product.ingredientText || '数据库暂无配料表资料') + '</div>' +
    '<div class="form-section-title detail-subtitle">过敏原</div><div class="detail-copy">' + escapeHTML(product.allergensText || '数据库暂无过敏原资料') + '</div>' +
    '<div class="form-section-title detail-subtitle">营养资料</div><div class="detail-copy">' + escapeHTML(product.nutritionSummary || '数据库暂无营养资料') + '</div>' +
    '<div class="hint">以上资料来自开放商品数据库或手动录入，可能不完整；请以商品包装标签为准。</div></section>' +
    '<div class="actions"><button class="secondary" data-action="back">返回</button><button class="secondary" data-action="edit" data-id="' + escapeHTML(product.id) + '">编辑商品</button><button class="danger-btn" data-action="delete" data-id="' + escapeHTML(product.id) + '">删除</button></div>';
}

function renderFridgeDetail(item) {
  const status = fridgeStatus(item);
  return '<div class="page-title"><button class="back" data-action="back">‹</button><h1>' + escapeHTML(item.name) + '</h1></div>' +
    '<section class="detail-card">' + detailLine('食物分类', item.category) +
    detailLine('存放方式', item.storageMode) + detailLine('数量', item.quantity || '未填写') +
    detailLine('放入冰箱日期', item.storedAt || '未填写') +
    detailLine('保存期限', item.shelfLifeValue ? item.shelfLifeValue + ' ' + unitLabel(item.shelfLifeUnit) : '未填写') +
    detailLine('预计到期日', status.expiry || '未填写') +
    '<div class="detail-line"><span>到期状态</span><span class="pill ' + status.key + '">' + escapeHTML(status.text) + '</span></div>' +
    detailLine('备注', item.note || '无') + '</section>' +
    '<div class="actions"><button class="secondary" data-action="back">返回</button><button class="secondary" data-action="fridge-edit" data-id="' + escapeHTML(item.id) + '">编辑记录</button><button class="danger-btn" data-action="fridge-delete" data-id="' + escapeHTML(item.id) + '">删除</button></div>' +
    '<div class="notice">冰箱食物的安全保存时间受食物种类、烹饪方式、包装和冰箱实际温度影响。本记录仅作家庭管理提醒，不代替食品安全判断。</div>';
}

function detailLine(label, value) {
  return '<div class="detail-line"><span>' + escapeHTML(label) + '</span><span>' + escapeHTML(value) + '</span></div>';
}

function render() {
  if (!state.dbReady) return;
  let content;
  if (state.page === 'form') content = renderForm();
  else if (state.page === 'detail') {
    const product = state.products.find(item => item.id === state.detailId);
    content = product ? renderDetail(product) : '<div class="empty">商品不存在或已删除。<button class="secondary" data-action="back">返回</button></div>';
  } else if (state.page === 'fridge-form') content = renderFridgeForm();
  else if (state.page === 'fridge-detail') {
    const item = state.fridgeItems.find(row => row.id === state.fridgeDetailId);
    content = item ? renderFridgeDetail(item) : '<div class="empty">冰箱记录不存在或已删除。<button class="secondary" data-action="back">返回</button></div>';
  } else {
    content = state.tab === 'home' ? renderHome()
      : state.tab === 'products' ? renderProducts()
      : state.tab === 'fridge' ? renderFridge()
      : renderSettings();
    content += navHTML();
  }
  if (state.scannerOpen) content += renderBarcodeScanner();
  app.innerHTML = content;
  revokeUnusedPhotoURLs();
}

function syncDraftFromForm() {
  if (!state.draft) return;
  const get = name => document.querySelector('[name="' + name + '"]')?.value ?? state.draft[name] ?? '';
  const names = ['barcode', 'name', 'brand', 'category', 'quantity', 'purchaseDate', 'productionDate', 'shelfLifeValue', 'shelfLifeUnit', 'printedExpiryDate', 'openedDate', 'openedShelfLifeValue', 'openedShelfLifeUnit', 'storageLocation', 'note', 'ingredientText', 'allergensText'];
  for (const name of names) state.draft[name] = get(name);
  state.draft.opened = !!state.draft.opened;
}

function updateLivePreviews() {
  if (state.page !== 'form' || !state.draft) return;
  syncDraftFromForm();
  const preview = document.querySelector('#expiry-preview');
  if (preview) preview.textContent = effectiveExpiry(state.draft) || '填写包装到期日期，或生产日期和保质期时长后自动计算。';
}

function updateFridgePreview() {
  if (state.page !== 'fridge-form' || !state.fridgeDraft) return;
  const get = name => document.querySelector('[name="' + name + '"]')?.value ?? state.fridgeDraft[name] ?? '';
  const item = {
    storedAt: get('storedAt'), shelfLifeValue: get('shelfLifeValue'),
    shelfLifeUnit: get('shelfLifeUnit'), expiryDate: get('expiryDate')
  };
  const preview = document.querySelector('#fridge-expiry-preview');
  if (preview) preview.textContent = fridgeExpiry(item) || '填写保存期限，或直接填写到期日。';
}

function openForm(product = null) {
  state.draft = product
    ? { ...product, photos: { ...(product.photos || {}) } }
    : makeEmptyProduct();
  state.barcodeStatus = '';
  state.page = 'form';
  render();
  window.scrollTo(0, 0);
}

function makeEmptyFridgeItem() {
  return {
    id: globalThis.crypto?.randomUUID?.() || 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
    name: '', category: FRIDGE_CATEGORIES[0], storageMode: '冷藏',
    quantity: '1份', storedAt: todayISO(), shelfLifeValue: '', shelfLifeUnit: 'days',
    expiryDate: '', note: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
}

function openFridgeForm(item = null) {
  state.fridgeDraft = item ? { ...item } : makeEmptyFridgeItem();
  state.page = 'fridge-form';
  render();
  window.scrollTo(0, 0);
}

function goBack() {
  closeBarcodeScanner(false);
  state.page = 'main';
  state.draft = null;
  state.fridgeDraft = null;
  state.detailId = null;
  state.fridgeDetailId = null;
  state.barcodeStatus = '';
  render();
}

function fileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('无法读取选中的照片'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

function decodePhoto(dataURL) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('无法解码这张照片，请在 iPhone 照片中转存为 JPEG 后重试'));
    image.src = dataURL;
  });
}

async function compressImage(file) {
  if (!file || !file.size) throw new Error('未收到照片文件，请再试一次');
  const ext = (file.name || '').toLowerCase();
  if (file.type && !file.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(ext)) {
    throw new Error('请选择图片，不能选择其他文件');
  }
  let original = await fileAsDataURL(file);
  if (!original.startsWith('data:image/')) {
    const mime = /\.png$/i.test(ext) ? 'image/png' : /\.heic$/i.test(ext) ? 'image/heic' : 'image/jpeg';
    original = 'data:' + mime + ';base64,' + original.split(',')[1];
  }
  const image = await decodePhoto(original);
  const side = Math.max(image.naturalWidth, image.naturalHeight);
  if (!side) throw new Error('照片尺寸异常');
  const scale = Math.min(1, 1400 / side);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('无法处理这张照片');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const output = canvas.toDataURL('image/jpeg', 0.79);
  if (!output.startsWith('data:image/jpeg;base64,') || output.length < 100) throw new Error('图片转换失败');
  return output;
}

async function handlePhotoInput(input) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    syncDraftFromForm();
    const photo = await compressImage(file);
    if (!state.draft) return;
    state.draft.photos = { ...(state.draft.photos || {}), cover: photo };
    render();
    toast('商品照片已添加，点击“保存商品”后正式保存', 'success');
  } catch (error) {
    toast('照片添加失败：' + (error.message || String(error)), 'error');
  } finally {
    input.value = '';
  }
}

function nutritionSummary(nutriments = {}) {
  const fields = [
    ['能量', 'energy-kcal_100g', 'kcal/100g'],
    ['脂肪', 'fat_100g', 'g/100g'],
    ['糖', 'sugars_100g', 'g/100g'],
    ['钠', 'sodium_100g', 'mg/100g'],
    ['蛋白质', 'proteins_100g', 'g/100g']
  ];
  const values = fields.filter(([, key]) => nutriments[key] !== undefined && nutriments[key] !== null && nutriments[key] !== '')
    .map(([label, key, unit]) => label + ' ' + nutriments[key] + ' ' + unit);
  return values.join('；');
}

async function lookupBarcode(rawCode) {
  const code = String(rawCode || '').replace(/\D/g, '');
  if (!/^\d{8,14}$/.test(code)) {
    toast('条形码应为8至14位数字，请检查后重试', 'warning');
    return;
  }
  if (!state.draft) return;
  const changedCode = String(state.draft.barcode || '') !== code;
  state.draft.barcode = code;
  state.barcodeStatus = '正在查询 Open Food Facts 商品数据库…';
  render();
  try {
    const fields = 'code,product_name,product_name_zh,brands,quantity,ingredients_text,ingredients_text_zh,allergens,nutriments,product_type';
    const url = 'https://world.openfoodfacts.org/api/v3.6/product/' + encodeURIComponent(code) + '.json?fields=' + encodeURIComponent(fields);
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('商品数据库暂时无法访问（HTTP ' + response.status + '）');
    const data = await response.json();
    const found = data && data.product && (data.status === 1 || data.status === 'success' || data.status === undefined);
    if (!found) {
      state.barcodeStatus = '数据库暂未收录这个条形码。可以继续手动填写商品名称和资料。';
      render();
      toast('未找到商品资料，可以手动录入', 'warning');
      return;
    }
    const item = data.product;
    const productName = item.product_name_zh || item.product_name || item.generic_name_zh || item.generic_name || '';
    if (changedCode || !state.draft.name) state.draft.name = productName || state.draft.name;
    if (changedCode || !state.draft.brand) state.draft.brand = item.brands || state.draft.brand;
    if (changedCode || !state.draft.quantity || state.draft.quantity === '1') state.draft.quantity = item.quantity || state.draft.quantity;
    const ingredients = item.ingredients_text_zh || item.ingredients_text || '';
    const allergens = item.allergens || (Array.isArray(item.allergens_tags) ? item.allergens_tags.join('、') : '');
    if (changedCode || !state.draft.ingredientText) state.draft.ingredientText = ingredients;
    if (changedCode || !state.draft.allergensText) state.draft.allergensText = allergens;
    const summary = nutritionSummary(item.nutriments || {});
    if (changedCode || !state.draft.nutritionSummary) state.draft.nutritionSummary = summary;
    state.draft.dataSource = 'Open Food Facts';
    state.draft.externalDataRetrievedAt = new Date().toISOString();
    state.barcodeStatus = '已找到商品资料。请核对名称、配料和营养信息，再保存。';
    render();
    toast('商品资料已导入，请核对', 'success');
  } catch (error) {
    state.barcodeStatus = '查询失败：' + (error.message || String(error)) + '。可以稍后重试或手动填写。';
    render();
    toast('条码查询失败', 'warning');
  }
}

function closeBarcodeScanner(shouldRender = true) {
  try { state.scannerControls?.stop?.(); } catch (_) {}
  state.scannerControls = null;
  state.scannerOpen = false;
  if (shouldRender) render();
}

async function startBarcodeScan() {
  if (!state.draft) return;
  syncDraftFromForm();
  state.scannerOpen = true;
  render();
  try {
    const video = document.querySelector('#barcode-video');
    const scannerModule = await import('./barcode.bundle.js?v=1.2.0');
    state.scannerControls = await scannerModule.startBarcodeScanner(video, code => {
      closeBarcodeScanner(false);
      if (!state.draft) return;
      state.draft.barcode = code;
      state.barcodeStatus = '已识别条形码：' + code + '，正在查询商品资料…';
      render();
      lookupBarcode(code);
    }, error => {
      console.warn('Barcode scan error', error);
    });
  } catch (error) {
    closeBarcodeScanner();
    toast('无法启动扫码：' + (error.message || String(error)) + '。请检查 Safari 相机权限，也可以手动输入条形码。', 'error');
  }
}

async function saveDraft(event) {
  event?.preventDefault();
  syncDraftFromForm();
  try {
    validateProduct(state.draft);
    state.draft.updatedAt = new Date().toISOString();
    await saveProduct(state.draft);
    await reloadData();
    const saved = state.products.find(item => item.id === state.draft.id);
    const expected = state.draft.photos?.cover ?? null;
    const actual = saved?.photos?.cover ?? null;
    if (!saved || (typeof expected === 'string' ? actual !== expected : expected === null ? actual !== null : !(actual instanceof Blob))) {
      throw new Error('商品或商品照片写入后校验失败；请保持应用打开并重试');
    }
    state.page = 'main';
    state.tab = 'products';
    state.filter = '全部';
    state.search = '';
    state.draft = null;
    state.barcodeStatus = '';
    render();
    toast('商品已保存到本机', 'success');
  } catch (error) {
    toast(error.message || '保存失败，请重试', 'error');
  }
}

async function removeProduct(id) {
  const product = state.products.find(item => item.id === id);
  if (!product) return;
  if (!confirm('确定删除「' + product.name + '」吗？删除后无法撤销。建议先导出备份。')) return;
  try {
    await deleteProduct(id);
    await reloadData();
    state.page = 'main';
    state.detailId = null;
    render();
    toast('商品已删除', 'success');
  } catch (error) {
    toast('删除失败：' + error.message, 'error');
  }
}

async function saveFridgeDraft(event) {
  event?.preventDefault();
  if (!state.fridgeDraft) return;
  const get = name => document.querySelector('#fridge-form [name="' + name + '"]')?.value ?? '';
  const item = state.fridgeDraft;
  item.name = get('name').trim();
  item.category = get('category');
  item.storageMode = get('storageMode');
  item.quantity = get('quantity').trim() || '1份';
  item.storedAt = get('storedAt');
  item.shelfLifeValue = get('shelfLifeValue');
  item.shelfLifeUnit = get('shelfLifeUnit');
  item.expiryDate = get('expiryDate');
  item.note = get('note').trim();
  if (!item.name) { toast('请填写食物名称', 'warning'); return; }
  if (item.storedAt && !isValidDate(item.storedAt)) { toast('放入日期不正确', 'warning'); return; }
  if (item.expiryDate && !isValidDate(item.expiryDate)) { toast('到期日期不正确', 'warning'); return; }
  if (item.shelfLifeValue && (!Number.isFinite(Number(item.shelfLifeValue)) || Number(item.shelfLifeValue) <= 0)) {
    toast('保存期限必须大于0', 'warning'); return;
  }
  item.updatedAt = new Date().toISOString();
  const index = state.fridgeItems.findIndex(row => row.id === item.id);
  const next = [...state.fridgeItems];
  if (index >= 0) next[index] = { ...item };
  else next.push({ ...item });
  try {
    await setSetting('fridgeItems', next);
    state.fridgeItems = next;
    state.fridgeDraft = null;
    state.page = 'main';
    state.tab = 'fridge';
    render();
    toast('冰箱食物已保存', 'success');
  } catch (error) {
    toast('保存失败：' + error.message, 'error');
  }
}

async function removeFridgeItem(id) {
  const item = state.fridgeItems.find(row => row.id === id);
  if (!item || !confirm('确定删除冰箱记录「' + item.name + '」吗？')) return;
  const next = state.fridgeItems.filter(row => row.id !== id);
  try {
    await setSetting('fridgeItems', next);
    state.fridgeItems = next;
    state.page = 'main';
    state.tab = 'fridge';
    state.fridgeDetailId = null;
    render();
    toast('冰箱记录已删除', 'success');
  } catch (error) {
    toast('删除失败：' + error.message, 'error');
  }
}

async function exportData() {
  try {
    const backup = await exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const file = new File([blob], '家庭保质期管家完整备份_' + todayISO() + '.json', { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], title: '家庭保质期管家完整备份' });
    } else {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.name;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast('完整备份已生成，请保存到“文件”', 'success');
    }
  } catch (error) {
    if (error.name !== 'AbortError') toast('备份失败：' + error.message, 'error');
  }
}

async function restoreData(file) {
  if (!file) return;
  if (!confirm('恢复备份会替换这台 iPhone 当前保存的商品和冰箱记录。请确认已经导出当前数据。是否继续？')) return;
  try {
    const backup = JSON.parse(await file.text());
    const count = await importBackup(backup);
    await reloadData();
    state.page = 'main';
    state.tab = 'home';
    render();
    toast('恢复成功：' + count + ' 件商品、' + state.fridgeItems.length + ' 条冰箱记录', 'success');
  } catch (error) {
    toast('恢复失败：' + error.message, 'error');
  } finally {
    importInput.value = '';
  }
}

app.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'tab') {
    closeBarcodeScanner(false);
    state.tab = button.dataset.tab;
    state.page = 'main';
    state.draft = null;
    state.fridgeDraft = null;
    render();
  } else if (action === 'add') openForm();
  else if (action === 'category') { state.tab = 'products'; state.page = 'main'; state.filter = button.dataset.category; state.search = ''; render(); }
  else if (action === 'filter') { state.filter = button.dataset.filter; render(); }
  else if (action === 'detail') { state.detailId = button.dataset.id; state.page = 'detail'; render(); }
  else if (action === 'back') goBack();
  else if (action === 'edit') { const product = state.products.find(item => item.id === button.dataset.id); if (product) openForm(product); }
  else if (action === 'delete') await removeProduct(button.dataset.id);
  else if (action === 'scan-barcode') await startBarcodeScan();
  else if (action === 'lookup-barcode') { syncDraftFromForm(); await lookupBarcode(document.querySelector('#field-barcode')?.value); }
  else if (action === 'close-scanner') closeBarcodeScanner();
  else if (action === 'remove-photo') { syncDraftFromForm(); state.draft.photos = { ...(state.draft.photos || {}), cover: null }; render(); }
  else if (action === 'toggle-opened') { syncDraftFromForm(); state.draft.opened = !state.draft.opened; render(); }
  else if (action === 'fridge-add') openFridgeForm();
  else if (action === 'fridge-filter') { state.fridgeFilter = button.dataset.filter; render(); }
  else if (action === 'fridge-detail') { state.fridgeDetailId = button.dataset.id; state.page = 'fridge-detail'; render(); }
  else if (action === 'fridge-edit') { const item = state.fridgeItems.find(row => row.id === button.dataset.id); if (item) openFridgeForm(item); }
  else if (action === 'fridge-delete') await removeFridgeItem(button.dataset.id);
  else if (action === 'export') await exportData();
  else if (action === 'import') importInput.click();
});

app.addEventListener('input', event => {
  if (event.target.id === 'product-search') {
    state.search = event.target.value;
    const root = document.querySelector('#product-results');
    const products = filteredProducts();
    if (root) root.innerHTML = products.length ? '<div class="product-list">' + products.map(productCard).join('') + '</div>' : '<div class="empty">没有找到商品<br>可以调整搜索词或新增商品</div>';
    return;
  }
  if (event.target.id === 'fridge-search') {
    state.fridgeSearch = event.target.value;
    const root = document.querySelector('.fridge-results');
    if (root) {
      const items = sortedFridgeItems(state.fridgeItems).filter(item => {
        const storageMatch = state.fridgeFilter === '全部' || item.storageMode === state.fridgeFilter;
        const keyword = state.fridgeSearch.trim().toLowerCase();
        return storageMatch && (!keyword || [item.name, item.category, item.note].some(value => String(value || '').toLowerCase().includes(keyword)));
      });
      root.innerHTML = items.length ? '<div class="product-list">' + items.map(fridgeCard).join('') + '</div>' : '<div class="empty">没有找到冰箱食物</div>';
    }
    return;
  }
  if (event.target.closest('#product-form')) updateLivePreviews();
  if (event.target.closest('#fridge-form')) updateFridgePreview();
});

app.addEventListener('change', async event => {
  if (event.target.matches('[data-photo-input]')) await handlePhotoInput(event.target);
  else if (event.target.closest('#product-form')) updateLivePreviews();
  else if (event.target.closest('#fridge-form')) updateFridgePreview();
});

app.addEventListener('submit', async event => {
  if (event.target.id === 'fridge-form') await saveFridgeDraft(event);
  else if (event.target.id === 'product-form') await saveDraft(event);
});
importInput.addEventListener('change', () => restoreData(importInput.files?.[0]));

async function init() {
  try {
    if (!('indexedDB' in window)) throw new Error('当前浏览器不支持本地数据库');
    await reloadData();
    render();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').catch(error => console.warn('离线缓存注册失败', error));
    }
  } catch (error) {
    app.innerHTML = '<div class="empty"><strong>应用暂时无法启动</strong><br>' + escapeHTML(error.message) + '<br><br>请使用 iPhone Safari 打开应用网址，不要使用微信内置浏览器。</div>';
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.scannerOpen) closeBarcodeScanner(false);
});
window.addEventListener('beforeunload', () => {
  closeBarcodeScanner(false);
  for (const url of state.objectURLs.values()) URL.revokeObjectURL(url);
});

init();
