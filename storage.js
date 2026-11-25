const DB_NAME = 'family-expiry-manager';
const DB_VERSION = 1;
const PRODUCT_STORE = 'products';
const SETTINGS_STORE = 'settings';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PRODUCT_STORE)) db.createObjectStore(PRODUCT_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('无法打开本机数据库'));
    request.onblocked = () => reject(new Error('数据库正在被其他页面占用，请关闭重复打开的应用后重试'));
  });
}

async function transaction(storeNames, mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let result;
    try { result = action(tx); } catch (error) { db.close(); reject(error); return; }
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { const error = tx.error; db.close(); reject(error || new Error('本机数据操作失败')); };
    tx.onabort = () => { const error = tx.error; db.close(); reject(error || new Error('本机数据操作已取消')); };
  });
}

export async function getAllProducts() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PRODUCT_STORE, 'readonly');
    const request = tx.objectStore(PRODUCT_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('读取商品失败'));
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error || new Error('读取商品失败')); };
  });
}

export async function saveProduct(product) {
  return transaction([PRODUCT_STORE], 'readwrite', tx => tx.objectStore(PRODUCT_STORE).put(product));
}

export async function deleteProduct(id) {
  return transaction([PRODUCT_STORE], 'readwrite', tx => tx.objectStore(PRODUCT_STORE).delete(id));
}

export async function getSetting(key, fallback) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readonly');
    const request = tx.objectStore(SETTINGS_STORE).get(key);
    request.onsuccess = () => resolve(request.result ? request.result.value : fallback);
    request.onerror = () => reject(request.error || new Error('读取设置失败'));
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error || new Error('读取设置失败')); };
  });
}

export async function setSetting(key, value) {
  return transaction([SETTINGS_STORE], 'readwrite', tx => tx.objectStore(SETTINGS_STORE).put({ key, value }));
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('图片转换失败'));
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(value, type = 'image/jpeg') {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function exportBackup() {
  const [products, profiles, customRules, fridgeItems] = await Promise.all([
    getAllProducts(), getSetting('profiles', null), getSetting('customRules', []), getSetting('fridgeItems', [])
  ]);
  const output = [];
  for (const product of products) {
    const row = { ...product, photos: {} };
    for (const [field, blob] of Object.entries(product.photos || {})) {
      if (typeof blob === 'string' && /^data:image\/[a-z0-9.+-]+;base64,/i.test(blob)) {
        row.photos[field] = { type: blob.slice(5, blob.indexOf(';')), base64: blob.slice(blob.indexOf(',') + 1) };
      } else {
        row.photos[field] = blob instanceof Blob ? { type: blob.type || 'image/jpeg', base64: await blobToBase64(blob) } : null;
      }
    }
    output.push(row);
  }
  return {
    format: 'FAMILY_EXPIRY_MANAGER_PWA_BACKUP',
    version: 1,
    exportedAt: new Date().toISOString(),
    products: output,
    fridgeItems: Array.isArray(fridgeItems) ? fridgeItems : [],
    profiles,
    customRules
  };
}

export async function importBackup(backup) {
  if (!backup || backup.format !== 'FAMILY_EXPIRY_MANAGER_PWA_BACKUP' || !Array.isArray(backup.products)) throw new Error('这不是家庭保质期管家 PWA 的备份文件');
  const products = [];
  const ids = new Set();
  for (const item of backup.products) {
    if (!item || !item.id || !item.name || ids.has(item.id)) throw new Error('备份中存在无效或重复的商品记录');
    ids.add(item.id);
    const product = { ...item, photos: {} };
    for (const [field, value] of Object.entries(item.photos || {})) {
      if (value && typeof value.base64 === 'string') {
        const mime = /^image\/[a-z0-9.+-]+$/i.test(value.type || '') ? value.type : 'image/jpeg';
        product.photos[field] = 'data:' + mime + ';base64,' + value.base64;
      }
      else product.photos[field] = null;
    }
    products.push(product);
  }
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([PRODUCT_STORE, SETTINGS_STORE], 'readwrite');
    const store = tx.objectStore(PRODUCT_STORE);
    store.clear();
    for (const product of products) store.put(product);
    const settings = tx.objectStore(SETTINGS_STORE);
    if (Array.isArray(backup.profiles)) settings.put({ key: 'profiles', value: backup.profiles });
    settings.put({ key: 'customRules', value: Array.isArray(backup.customRules) ? backup.customRules : [] });
    settings.put({ key: 'fridgeItems', value: Array.isArray(backup.fridgeItems) ? backup.fridgeItems : [] });
    tx.oncomplete = () => { db.close(); resolve(products.length); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('恢复数据失败')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('恢复已取消')); };
  });
}