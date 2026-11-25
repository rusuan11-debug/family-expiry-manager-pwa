import {
  APP_VERSION, CATEGORIES, PHOTO_FIELDS, PHOTO_LABELS, DEFAULT_PROFILES,
  todayISO, isValidDate, addDuration, effectiveExpiry, daysRemaining,
  expiryStatus, parseLabelDates, analyzeIngredients, makeEmptyProduct, validateProduct
} from './core.js';
import {
  getAllProducts, saveProduct, deleteProduct, getSetting, setSetting,
  exportBackup, importBackup
} from './storage.js';

const app = document.querySelector('#app');
const toastElement = document.querySelector('#toast');
const importInput = document.querySelector('#backup-import-input');
const state = {
  products: [], profiles: DEFAULT_PROFILES.map(item => ({ ...item })), customRules: [],
  tab: 'home', page: 'main', filter: '全部', search: '', draft: null,
  dateCandidates: [], objectURLs: new Map(), toastTimer: null, dbReady: false
};

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const unitLabel = unit => ({ days: '天', months: '个月', years: '年' }[unit] || '天');
const iconForCategory = category => ({ '食品饮料': '♜', '母婴用品': '◉', '护肤化妆品': '♧', '日化清洁': '▤' }[category] || '◇');

function toast(message, type = 'info') {
  toastElement.textContent = message;
  toastElement.className = `toast show ${type}`;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { toastElement.className = 'toast'; }, 2600);
}

function getPhotoURL(blob) {
  // iOS PWA: data URLs are more resilient than IndexedDB-stored Blob object URLs.
  if (typeof blob === 'string' && blob.startsWith('data:image/')) return blob;
  if (!(blob instanceof Blob)) return '';
  if (!state.objectURLs.has(blob)) state.objectURLs.set(blob, URL.createObjectURL(blob));
  return state.objectURLs.get(blob);
}

function revokeUnusedPhotoURLs() {
  const active = new Set();
  for (const product of state.products) for (const blob of Object.values(product.photos || {})) if (blob instanceof Blob) active.add(blob);
  if (state.draft) for (const blob of Object.values(state.draft.photos || {})) if (blob instanceof Blob) active.add(blob);
  for (const [blob, url] of state.objectURLs.entries()) {
    if (!active.has(blob)) { URL.revokeObjectURL(url); state.objectURLs.delete(blob); }
  }
}

async function reloadData() {
  state.products = await getAllProducts();
  state.profiles = await getSetting('profiles', DEFAULT_PROFILES.map(item => ({ ...item })));
  state.customRules = await getSetting('customRules', []);
  state.dbReady = true;
  revokeUnusedPhotoURLs();
}

function counts() {
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

function productPhoto(product, className = 'product-photo') {
  const blob = product.photos?.cover;
  const url = getPhotoURL(blob);
  return url
    ? `<div class="${className}"><img src="${url}" alt="${escapeHTML(product.name)} 商品照片"></div>`
    : `<div class="${className}" aria-label="暂无商品照片">▢</div>`;
}

function productCard(product) {
  const status = expiryStatus(product);
  return `<button class="product-card" data-action="detail" data-id="${escapeHTML(product.id)}">
    ${productPhoto(product)}
    <div class="product-main"><div class="product-name">${escapeHTML(product.name)}</div>
      <div class="product-meta">${escapeHTML(product.category)} · ${product.opened ? '已开封' : '未开封'}${product.storageLocation ? ` · ${escapeHTML(product.storageLocation)}` : ''}</div>
    </div><span class="pill ${status.key}">${escapeHTML(status.text)}</span>
  </button>`;
}

function navHTML() {
  return `<nav class="bottom-nav" aria-label="主导航">
    <button class="nav-btn ${state.tab === 'home' ? 'active' : ''}" data-action="tab" data-tab="home"><span class="nav-icon">⌂</span>首页</button>
    <button class="nav-btn ${state.tab === 'products' ? 'active' : ''}" data-action="tab" data-tab="products"><span class="nav-icon">⬡</span>商品</button>
    <button class="nav-btn ${state.tab === 'family' ? 'active' : ''}" data-action="tab" data-tab="family"><span class="nav-icon">♧</span>家庭</button>
  </nav>`;
}

function renderHome() {
  const totals = counts();
  const near = sortedProducts(state.products).filter(product => {
    const days = daysRemaining(effectiveExpiry(product));
    return days !== null && days >= -30 && days <= 30;
  }).slice(0, 5);
  return `<div class="subhead">管理家庭购买的商品与有效期</div>
    <div class="stats">
      <div class="stat"><strong>${totals.all}</strong><span>全部商品</span></div>
      <div class="stat soon"><strong>${totals.soon}</strong><span>即将到期</span></div>
      <div class="stat expired"><strong>${totals.expired}</strong><span>已过期</span></div>
    </div>
    <button class="primary" data-action="add">＋ 添加新商品</button>
    <section class="section"><div class="section-head"><h2>商品分类</h2></div>
      <div class="category-grid">${CATEGORIES.map(category => `<button class="category" data-action="category" data-category="${escapeHTML(category)}">
        <div class="ct"><span class="ci">${iconForCategory(category)}</span>${escapeHTML(category)}</div><small>查看商品</small><span class="arrow">›</span>
      </button>`).join('')}</div>
    </section>
    <section class="section"><div class="section-head"><h2>临近到期商品</h2><button class="link" data-action="tab" data-tab="products">查看全部</button></div>
      ${near.length ? `<div class="product-list">${near.map(productCard).join('')}</div>` : `<div class="empty">目前没有30天内到期的商品<br>添加商品后会在这里显示</div>`}
    </section>
    <div class="footer-note">本机保存 · 离线可用 · 不上传商品资料</div>`;
}

function filteredProducts() {
  const keyword = state.search.trim().toLowerCase();
  return sortedProducts(state.products).filter(product => {
    const categoryMatch = state.filter === '全部' || product.category === state.filter;
    const searchMatch = !keyword || [product.name, product.brand, product.storageLocation, product.ingredientText, product.note].some(value => String(value || '').toLowerCase().includes(keyword));
    return categoryMatch && searchMatch;
  });
}

function renderProducts() {
  const products = filteredProducts();
  return `<div class="page-title"><h1>商品管理</h1><button class="secondary" style="margin-left:auto" data-action="add">＋ 添加商品</button></div>
    <input class="search" id="product-search" type="search" placeholder="搜索商品名称、品牌、存放位置" value="${escapeHTML(state.search)}" autocomplete="off">
    <div class="chips">${['全部', ...CATEGORIES].map(category => `<button class="chip ${state.filter === category ? 'active' : ''}" data-action="filter" data-filter="${escapeHTML(category)}">${escapeHTML(category)}</button>`).join('')}</div>
    <div id="product-results">${products.length ? `<div class="product-list">${products.map(productCard).join('')}</div>` : `<div class="empty">没有找到商品<br>可以调整搜索词或新增商品</div>`}</div>`;
}

function renderFamily() {
  const profileRows = state.profiles.map(profile => `<div class="switch-row"><div><strong>${escapeHTML(profile.label)}</strong><div class="hint">用于成分提示结果筛选，不代表医疗判断</div></div>
    <button class="switch ${profile.active ? 'on' : ''}" role="switch" aria-checked="${!!profile.active}" data-action="profile" data-id="${escapeHTML(profile.id)}"></button></div>`).join('');
  const customRules = state.customRules.map(rule => `<div class="modal-row"><strong>${escapeHTML(rule.title)}</strong><div class="hint">${escapeHTML(rule.note)}</div><button class="link" data-action="delete-rule" data-id="${escapeHTML(rule.id)}">删除自定义提示</button></div>`).join('');
  return `<div class="page-title"><h1>家庭与设置</h1></div>
    <section class="panel"><div class="form-section-title">适用人群</div>${profileRows}
      <div class="notice">成分分析只根据本地关键词规则给出核对提示，不会判断“绝对安全”。婴幼儿月龄、剂量、产品剂型、接触方式和个体过敏史都可能改变结论。</div>
    </section>
    <section class="panel"><div class="form-section-title">数据备份</div>
      <p class="hint">备份文件包含商品资料、商品照片、家庭关注人群和自定义规则。建议定期导出到 iPhone“文件”或其他安全位置。</p>
      <div class="actions"><button class="secondary" data-action="export">导出完整备份</button><button class="secondary" data-action="import">从备份恢复</button></div>
      <div class="notice">恢复备份会替换当前本机商品数据。建议先导出当前备份。备份文件请自行妥善保管。</div>
    </section>
    <section class="panel"><div class="form-section-title">自定义成分提示</div>
      <div class="field"><label for="rule-keyword">成分关键词</label><input id="rule-keyword" placeholder="例如：需要特别留意的成分"></div>
      <div class="field"><label for="rule-note">核对说明</label><textarea id="rule-note" placeholder="写明需要核对的原因、含量或使用方式"></textarea></div>
      <button class="secondary" style="width:100%" data-action="add-rule">保存自定义提示</button>
      <div style="margin-top:12px">${customRules || `<div class="hint">暂时没有自定义规则。内置提示规则 ${13} 条。</div>`}</div>
    </section>
    <section class="panel"><div class="form-section-title">应用信息</div>
      <div class="detail-line"><span>版本</span><span>V${APP_VERSION}</span></div>
      <div class="detail-line"><span>运行方式</span><span>iPhone 主屏幕网页 App</span></div>
      <div class="detail-line"><span>数据位置</span><span>本机浏览器数据库</span></div>
      <div class="notice">商品文字和照片保存在这台 iPhone 的浏览器本地数据库，不会上传 GitHub。清除 Safari 网站数据、卸载/移除网页 App 或更换设备可能导致数据丢失，请定期导出备份。</div>
      <div class="install-hint"><span>ⓘ</span><span><b>安装到主屏幕：</b>在 Safari 打开应用网址，点“分享”→“添加到主屏幕”→“添加”。之后点击桌面图标即可打开。</span></div>
    </section>`;
}

function renderPhotoBlock(field) {
  const blob = state.draft.photos?.[field];
  const url = getPhotoURL(blob);
  const hasImage = Boolean(url);
  return `<div class="photo-block"><div class="photo-head"><span>${PHOTO_LABELS[field]}</span><span class="hint">${hasImage ? '已添加' : '未添加'}</span></div>
    <div class="photo-preview">${hasImage ? `<img src="${url}" alt="${PHOTO_LABELS[field]}">` : '照片预览'}</div>
    <div class="photo-buttons">
      <label class="secondary photo-picker-label" for="camera-${field}">📷 拍照</label>
      <label class="secondary photo-picker-label" for="gallery-${field}">▧ 从相册导入</label>
    </div>
    <input class="visually-hidden" id="camera-${field}" type="file" accept="image/*" capture="environment" data-photo-input="${field}">
    <input class="visually-hidden" id="gallery-${field}" type="file" accept="image/*" data-photo-input="${field}">
    ${hasImage && field !== 'cover' ? `<button type="button" class="secondary photo-scan-again" data-action="scan-photo" data-field="${field}">🔎 重新识别这张照片</button>` : ''}
    <div class="hint ocr-progress" id="ocr-status-${field}" aria-live="polite"></div>
    ${hasImage ? `<button type="button" class="link" data-action="remove-photo" data-field="${field}">移除照片</button>` : ''}
  </div>`;
}

function renderAnalysis(result) {
  return `<strong>${escapeHTML(result.status)}</strong>
    ${result.matches.map(match => `<div class="analysis-item"><strong>${escapeHTML(match.title)} · ${escapeHTML(match.kind)}</strong>
      <div>匹配词：${escapeHTML(match.hits.join('、'))}</div><div>${escapeHTML(match.note)}</div>
      ${match.audience.length ? `<div class="hint">当前关注对象：${escapeHTML(match.audience.join('、'))}</div>` : ''}
    </div>`).join('')}
    <div class="hint">${escapeHTML(result.note)}</div>`;
}

function formValue(id, value, type = 'text', placeholder = '') {
  return `<div class="field"><label for="field-${id}">${id === 'name' ? '商品名称（必填）' : ''}</label><input id="field-${id}" type="${type}" value="${escapeHTML(value)}" placeholder="${escapeHTML(placeholder)}"></div>`;
}

function renderForm() {
  const product = state.draft;
  const expiry = effectiveExpiry(product);
  return `<div class="page-title"><button class="back" data-action="back">‹</button><h1>${state.products.some(item => item.id === product.id) ? '编辑商品' : '添加新商品'}</h1></div>
    <form id="product-form">
      <section class="form-card"><div class="form-section-title">商品基本信息</div>
        <div class="field"><label for="field-name">商品名称（必填）</label><input id="field-name" name="name" required maxlength="80" value="${escapeHTML(product.name)}" placeholder="例如：纯牛奶"></div>
        <div class="field"><label for="field-brand">品牌</label><input id="field-brand" name="brand" maxlength="80" value="${escapeHTML(product.brand)}" placeholder="选填"></div>
        <div class="field"><label for="field-category">商品分类</label><select id="field-category" name="category">${CATEGORIES.map(category => `<option value="${escapeHTML(category)}" ${product.category === category ? 'selected' : ''}>${escapeHTML(category)}</option>`).join('')}</select></div>
        <div class="field"><label for="field-quantity">数量</label><input id="field-quantity" name="quantity" value="${escapeHTML(product.quantity)}" placeholder="例如：2盒"></div>
        <div class="two">
          <div class="field"><label for="field-purchaseDate">购买日期</label><input id="field-purchaseDate" name="purchaseDate" type="date" value="${escapeHTML(product.purchaseDate)}"></div>
          <div class="field"><label for="field-productionDate">生产日期</label><input id="field-productionDate" name="productionDate" type="date" value="${escapeHTML(product.productionDate)}"></div>
        </div>
        <div class="field"><label>保质期时长（根据生产日期推算）</label><div class="three"><input id="field-shelfLifeValue" name="shelfLifeValue" type="number" min="1" step="1" value="${escapeHTML(product.shelfLifeValue)}" placeholder="数值"><select id="field-shelfLifeUnit" name="shelfLifeUnit"><option value="days" ${product.shelfLifeUnit === 'days' ? 'selected' : ''}>天</option><option value="months" ${product.shelfLifeUnit === 'months' ? 'selected' : ''}>个月</option><option value="years" ${product.shelfLifeUnit === 'years' ? 'selected' : ''}>年</option></select></div></div>
        <div class="field"><label for="field-printedExpiryDate">包装标注到期日期（优先采用）</label><input id="field-printedExpiryDate" name="printedExpiryDate" type="date" value="${escapeHTML(product.printedExpiryDate)}"></div>
        <div class="field"><label>当前计算到期日</label><div id="expiry-preview" class="notice">${expiry ? escapeHTML(expiry) : '填写包装到期日期，或生产日期和保质期时长后自动计算。'}</div></div>
        <div class="switch-row"><strong>商品是否已开封</strong><button type="button" class="switch ${product.opened ? 'on' : ''}" role="switch" aria-checked="${!!product.opened}" data-action="toggle-opened"></button></div>
        <div id="opened-fields" class="${product.opened ? '' : 'visually-hidden'}">
          <div class="two"><div class="field"><label for="field-openedDate">开封日期</label><input id="field-openedDate" name="openedDate" type="date" value="${escapeHTML(product.openedDate)}"></div><div class="field"><label for="field-openedShelfLifeValue">开封后期限</label><input id="field-openedShelfLifeValue" name="openedShelfLifeValue" type="number" min="1" step="1" value="${escapeHTML(product.openedShelfLifeValue)}" placeholder="数值"></div></div>
          <div class="field"><label for="field-openedShelfLifeUnit">开封后期限单位</label><select id="field-openedShelfLifeUnit" name="openedShelfLifeUnit"><option value="days" ${product.openedShelfLifeUnit === 'days' ? 'selected' : ''}>天</option><option value="months" ${product.openedShelfLifeUnit === 'months' ? 'selected' : ''}>个月</option><option value="years" ${product.openedShelfLifeUnit === 'years' ? 'selected' : ''}>年</option></select></div>
        </div>
        <div class="field"><label for="field-storageLocation">存放位置</label><input id="field-storageLocation" name="storageLocation" value="${escapeHTML(product.storageLocation)}" placeholder="例如：冰箱冷藏层"></div>
        <div class="field"><label for="field-note">备注</label><textarea id="field-note" name="note" placeholder="其他需要记录的信息">${escapeHTML(product.note)}</textarea></div>
      </section>
      <section class="form-card"><div class="form-section-title">商品照片</div>
        ${PHOTO_FIELDS.map(renderPhotoBlock).join('')}
      </section>
      <section class="form-card"><div class="form-section-title">配料表与适用性提示</div>
        <div class="field"><label for="field-ingredientText">配料表文字</label><textarea id="field-ingredientText" name="ingredientText" placeholder="可手动输入，或从照片中复制文字后粘贴">${escapeHTML(product.ingredientText)}</textarea></div>
        <div class="field"><label for="field-labelText">标签文字（用于提取日期候选）</label><textarea id="field-labelText" placeholder="在 iPhone 照片中长按标签文字，使用实况文本复制，再粘贴到这里"></textarea></div>
        <button class="secondary" type="button" data-action="parse-label">提取日期候选</button>
        <div id="date-candidates" class="hint"></div>
        <div id="analysis-preview" class="analysis-box">${renderAnalysis(analyzeIngredients(product.ingredientText, state.profiles, state.customRules))}</div>
        <div class="hint">拍摄或导入日期标签和配料表照片后，会尝试用手机本地 OCR 自动填入文字、日期和保质期时长。首次需要联网下载本地识别模型，识别可能出错，务必核对后再保存；失败时可使用 iPhone 实况文本复制文字作为备用方式。</div>
      </section>
      <div class="actions"><button class="secondary" type="button" data-action="back">取消</button><button class="primary" type="submit">保存商品</button></div>
    </form>
    <div class="footer-note">商品资料和照片仅保存在这台 iPhone 的本机数据库。</div>`;
}

function renderDetail(product) {
  const status = expiryStatus(product);
  const analysis = analyzeIngredients(product.ingredientText, state.profiles, state.customRules);
  const photo = (field, label) => {
    const url = getPhotoURL(product.photos?.[field]);
    return url ? `<div class="detail-photo"><img src="${url}" alt="${label}"><small>${label}</small></div>` : '';
  };
  return `<div class="page-title"><button class="back" data-action="back">‹</button><h1>${escapeHTML(product.name)}</h1></div>
    <section class="detail-card"><div class="detail-photo-grid">${PHOTO_FIELDS.map(field => photo(field, PHOTO_LABELS[field])).join('')}</div>
      ${detailLine('商品分类', product.category)}${detailLine('品牌 / 数量', `${product.brand || '未填写'} · ${product.quantity || '未填写'}`)}
      ${detailLine('购买日期', product.purchaseDate || '未填写')}${detailLine('生产日期', product.productionDate || '未填写')}
      ${detailLine('包装到期日期', product.printedExpiryDate || '未填写')}
      ${detailLine('保质期推算', product.shelfLifeValue ? `${product.shelfLifeValue} ${unitLabel(product.shelfLifeUnit)}` : '未填写')}
      ${detailLine('开封状态', product.opened ? '已开封' : '未开封')}
      ${detailLine('开封日期 / 开封后期限', product.opened ? `${product.openedDate || '未填写'} · ${product.openedShelfLifeValue ? `${product.openedShelfLifeValue} ${unitLabel(product.openedShelfLifeUnit)}` : '未填写'}` : '—')}
      ${detailLine('最终计算到期日', status.expiry || '未填写')}
      <div class="detail-line"><span>到期状态</span><span class="pill ${status.key}">${escapeHTML(status.text)}</span></div>
      ${detailLine('存放位置', product.storageLocation || '未填写')}${detailLine('备注', product.note || '无')}
    </section>
    <section class="detail-card"><div class="form-section-title">配料表文字</div><div class="small" style="white-space:pre-wrap;line-height:1.6">${escapeHTML(product.ingredientText || '尚未录入')}</div><div class="analysis-box">${renderAnalysis(analysis)}</div></section>
    <div class="actions"><button class="secondary" data-action="back">返回</button><button class="secondary" data-action="edit" data-id="${escapeHTML(product.id)}">编辑商品</button><button class="danger-btn" data-action="delete" data-id="${escapeHTML(product.id)}">删除</button></div>
    <div class="footer-note">成分提示仅供核对，不替代医生、药师或产品标签说明。</div>`;
}

function detailLine(label, value) {
  return `<div class="detail-line"><span>${escapeHTML(label)}</span><span>${escapeHTML(value)}</span></div>`;
}

function render() {
  if (!state.dbReady) return;
  let content;
  if (state.page === 'form') content = renderForm();
  else if (state.page === 'detail') {
    const product = state.products.find(item => item.id === state.detailId);
    content = product ? renderDetail(product) : `<div class="empty">商品不存在或已删除。<button class="secondary" data-action="back">返回</button></div>`;
  } else {
    content = state.tab === 'home' ? renderHome() : state.tab === 'products' ? renderProducts() : renderFamily();
    content += navHTML();
  }
  app.innerHTML = content;
  revokeUnusedPhotoURLs();
}

function syncDraftFromForm() {
  if (!state.draft) return;
  const get = name => document.querySelector(`[name="${name}"]`)?.value ?? state.draft[name] ?? '';
  const names = ['name', 'brand', 'category', 'quantity', 'purchaseDate', 'productionDate', 'shelfLifeValue', 'shelfLifeUnit', 'printedExpiryDate', 'openedDate', 'openedShelfLifeValue', 'openedShelfLifeUnit', 'storageLocation', 'note', 'ingredientText'];
  for (const name of names) state.draft[name] = get(name);
  state.draft.opened = !!state.draft.opened;
}

function updateLivePreviews() {
  if (state.page !== 'form' || !state.draft) return;
  syncDraftFromForm();
  const preview = document.querySelector('#expiry-preview');
  if (preview) preview.textContent = effectiveExpiry(state.draft) || '填写包装到期日期，或生产日期和保质期时长后自动计算。';
  const analysis = document.querySelector('#analysis-preview');
  if (analysis) analysis.innerHTML = renderAnalysis(analyzeIngredients(state.draft.ingredientText, state.profiles, state.customRules));
}

function openForm(product = null) {
  state.draft = product
    ? { ...product, photos: { ...(product.photos || {}) } }
    : makeEmptyProduct();
  state.page = 'form';
  render();
  window.scrollTo(0, 0);
}

function goBack() {
  state.page = 'main';
  state.draft = null;
  state.detailId = null;
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
  // Some iOS camera/Photos pickers return File.type == '' for HEIC/JPEG.
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

async function scanPhoto(field, source) {
  if (!source) return;
  const status = document.querySelector(`#ocr-status-${field}`);
  if (status) status.textContent = '正在本机识别图片文字，首次识别可能需要下载并初始化中文识别模型…';
  try {
    const { recognizeImageLocal } = await import('./ocr.js');
    const text = (await recognizeImageLocal(source, message => {
      const el = document.querySelector(`#ocr-status-${field}`);
      if (el) el.textContent = message;
    })).trim();
    if (!text) throw new Error('没有识别到清晰文字，请靠近标签重新拍照');
    if (field === 'ingredientsLabel') {
      if (state.page !== 'form' || !state.draft) return;
      const input = document.querySelector('[name="ingredientText"]');
      if (input) input.value = text;
      updateLivePreviews();
      const el = document.querySelector(`#ocr-status-${field}`);
      if (el) el.textContent = '已识别配料表并填入文字，请核对后保存商品。';
      toast('配料表已自动填入，请核对文字', 'success');
    } else if (field === 'dateLabel') {
      if (state.page !== 'form' || !state.draft) return;
      const input = document.querySelector('#field-labelText');
      if (input) input.value = text;
      parseLabelText();
      const candidates = parseLabelDates(text);
      for (const [type, label] of [['productionDate','生产日期'],['printedExpiryDate','到期日期']]) {
        const dated = candidates.filter(item => item.type === type);
        if (dated.length === 1) {
          const sameType = candidates.filter(item => item.date === dated[0].date);
          if (sameType.length === 1) {
            const control = document.querySelector(`[name="${type}"]`);
            if (control) control.value = dated[0].date;
          }
        }
      }
      const expiryLength = text.match(/保\s*质\s*期\s*(?:为|是|:|：)?\s*(\d{1,4})\s*(个月|月|天|日|年)/);
      if (expiryLength) {
        const num = document.querySelector('[name="shelfLifeValue"]');
        const unit = document.querySelector('[name="shelfLifeUnit"]');
        if (num && unit) { num.value = expiryLength[1]; unit.value = expiryLength[2].startsWith('月') ? 'months' : expiryLength[2] === '年' ? 'years' : 'days'; }
      }
      updateLivePreviews();
      const status = document.querySelector(`#ocr-status-${field}`);
      if (status) status.textContent = candidates.length ? '已识别并尝试填入日期；下面保留候选项，请按原包装逐项核对。' : '已识别文字，但未找到明确日期，请核对后手动填写。';
      toast('日期标签已识别，请核对日期和保质期', 'success');
    }
  } catch (error) {
    const el = document.querySelector(`#ocr-status-${field}`);
    if (el) el.textContent = '自动识别未成功：' + (error.message || String(error)) + '。照片保留；也可在 iPhone“照片”中用实况文本复制后粘贴。';
    toast('图片已添加；OCR 未成功，请看照片下方提示', 'warning');
  }
}

async function handlePhotoInput(input) {
  const field = input.dataset.photoInput;
  const file = input.files?.[0];
  if (!file) return;
  try {
    syncDraftFromForm();
    // Saving a small JPEG data URL avoids historic iOS IndexedDB Blob quirks.
    const photo = await compressImage(file);
    if (!state.draft) return;
    state.draft.photos[field] = photo;
    render();
    toast(`${PHOTO_LABELS[field]}已添加，点击“保存商品”后正式保存`, 'success');
    if (field === 'dateLabel' || field === 'ingredientsLabel') await scanPhoto(field, photo);
  } catch (error) {
    toast(`照片添加失败：${error.message}`, 'error');
  } finally {
    input.value = '';
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
    if (!saved || PHOTO_FIELDS.some(field => { const expected = state.draft.photos?.[field] ?? null; const actual = saved.photos?.[field] ?? null; return typeof expected === 'string' ? actual !== expected : expected === null ? actual !== null : !(actual instanceof Blob); })) {
      throw new Error('商品或照片写入后校验失败；请保持应用打开并重试');
    }
    state.page = 'main';
    state.tab = 'products';
    state.filter = '全部';
    state.search = '';
    state.draft = null;
    render();
    toast('商品已保存到本机', 'success');
  } catch (error) {
    toast(error.message || '保存失败，请重试', 'error');
  }
}

async function removeProduct(id) {
  const product = state.products.find(item => item.id === id);
  if (!product) return;
  if (!confirm(`确定删除「${product.name}」吗？删除后无法撤销。建议先导出备份。`)) return;
  try {
    await deleteProduct(id);
    await reloadData();
    state.page = 'main';
    state.detailId = null;
    render();
    toast('商品已删除', 'success');
  } catch (error) {
    toast(`删除失败：${error.message}`, 'error');
  }
}

function parseLabelText() {
  syncDraftFromForm();
  const text = document.querySelector('#field-labelText')?.value || '';
  const candidates = parseLabelDates(text);
  state.dateCandidates = candidates;
  const root = document.querySelector('#date-candidates');
  if (!root) return;
  if (!candidates.length) {
    root.textContent = '没有识别到标准日期，请检查复制的文字或手动填写日期。';
    return;
  }
  root.innerHTML = `<div class="form-section-title">识别到的日期候选（请人工核对）</div>${candidates.map((candidate, index) => `<div class="modal-row"><strong>${escapeHTML(candidate.date)}</strong><div class="hint">${escapeHTML(candidate.context)}</div><div class="actions" style="margin-top:6px"><button class="secondary" data-action="assign-date" data-index="${index}" data-field="productionDate">设为生产日期</button><button class="secondary" data-action="assign-date" data-index="${index}" data-field="printedExpiryDate">设为到期日期</button></div></div>`).join('')}`;
}

function assignDate(index, field) {
  const candidate = state.dateCandidates[index];
  if (!candidate) return;
  const input = document.querySelector(`[name="${field}"]`);
  if (input) input.value = candidate.date;
  updateLivePreviews();
  toast(`已填入${field === 'productionDate' ? '生产日期' : '到期日期'}，请核对`, 'success');
}

async function exportData() {
  try {
    const backup = await exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const file = new File([blob], `家庭保质期管家备份_${todayISO()}.json`, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], title: '家庭保质期管家备份' });
    } else {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.name;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast('备份文件已生成，请保存到“文件”', 'success');
    }
  } catch (error) {
    if (error.name !== 'AbortError') toast(`备份失败：${error.message}`, 'error');
  }
}

async function restoreData(file) {
  if (!file) return;
  if (!confirm('恢复备份会替换这台 iPhone 当前保存的全部商品资料和照片。请确认已经导出当前数据。是否继续？')) return;
  try {
    const backup = JSON.parse(await file.text());
    const count = await importBackup(backup);
    await reloadData();
    state.page = 'main';
    state.tab = 'home';
    render();
    toast(`恢复成功：${count} 件商品`, 'success');
  } catch (error) {
    toast(`恢复失败：${error.message}`, 'error');
  } finally {
    importInput.value = '';
  }
}

async function toggleProfile(id) {
  const profile = state.profiles.find(item => item.id === id);
  if (!profile) return;
  profile.active = !profile.active;
  await setSetting('profiles', state.profiles);
  render();
}

async function addCustomRule() {
  const keyword = document.querySelector('#rule-keyword')?.value.trim() || '';
  const note = document.querySelector('#rule-note')?.value.trim() || '';
  if (keyword.length < 2 || note.length < 4) { toast('关键词至少2个字，说明至少4个字', 'warning'); return; }
  state.customRules.push({ id: `custom_${Date.now()}`, keywords: [keyword], title: `自定义成分提示：${keyword}`, note, audiences: state.profiles.filter(item => item.active).map(item => item.id), kind: '自定义提示' });
  await setSetting('customRules', state.customRules);
  render();
  toast('自定义提示已保存', 'success');
}

async function deleteCustomRule(id) {
  state.customRules = state.customRules.filter(item => item.id !== id);
  await setSetting('customRules', state.customRules);
  render();
  toast('自定义提示已删除', 'success');
}

app.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'tab') { state.tab = button.dataset.tab; state.page = 'main'; state.draft = null; render(); }
  else if (action === 'add') openForm();
  else if (action === 'category') { state.tab = 'products'; state.page = 'main'; state.filter = button.dataset.category; state.search = ''; render(); }
  else if (action === 'filter') { state.filter = button.dataset.filter; render(); }
  else if (action === 'detail') { state.detailId = button.dataset.id; state.page = 'detail'; render(); }
  else if (action === 'back') goBack();
  else if (action === 'edit') { const product = state.products.find(item => item.id === button.dataset.id); if (product) openForm(product); }
  else if (action === 'delete') await removeProduct(button.dataset.id);
  else if (action === 'camera' || action === 'gallery') {
    syncDraftFromForm();
    document.querySelector(`#${action}-${button.dataset.field}`)?.click();
  }
  else if (action === 'scan-photo') { syncDraftFromForm(); await scanPhoto(button.dataset.field, state.draft.photos?.[button.dataset.field]); }
  else if (action === 'remove-photo') { syncDraftFromForm(); state.draft.photos[button.dataset.field] = null; render(); }
  else if (action === 'toggle-opened') { syncDraftFromForm(); state.draft.opened = !state.draft.opened; render(); }
  else if (action === 'parse-label') parseLabelText();
  else if (action === 'assign-date') assignDate(Number(button.dataset.index), button.dataset.field);
  else if (action === 'profile') await toggleProfile(button.dataset.id);
  else if (action === 'export') await exportData();
  else if (action === 'import') importInput.click();
  else if (action === 'add-rule') await addCustomRule();
  else if (action === 'delete-rule') await deleteCustomRule(button.dataset.id);
});

app.addEventListener('input', event => {
  if (event.target.id === 'product-search') {
    state.search = event.target.value;
    const root = document.querySelector('#product-results');
    const products = filteredProducts();
    if (root) root.innerHTML = products.length ? `<div class="product-list">${products.map(productCard).join('')}</div>` : `<div class="empty">没有找到商品<br>可以调整搜索词或新增商品</div>`;
    return;
  }
  if (event.target.closest('#product-form')) updateLivePreviews();
});

app.addEventListener('change', async event => {
  if (event.target.matches('[data-photo-input]')) await handlePhotoInput(event.target);
  else if (event.target.closest('#product-form')) updateLivePreviews();
});

app.addEventListener('submit', saveDraft);
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
    app.innerHTML = `<div class="empty"><strong>应用暂时无法启动</strong><br>${escapeHTML(error.message)}<br><br>请使用 iPhone Safari 打开应用网址，不要使用微信内置浏览器。</div>`;
  }
}

window.addEventListener('beforeunload', () => {
  for (const url of state.objectURLs.values()) URL.revokeObjectURL(url);
});

init();