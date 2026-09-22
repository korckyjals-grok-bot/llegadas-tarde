const DB_NAME = "llegadas-tarde";
const DB_VERSION = 1;
const STORE_ROSTER = "roster";
const STORE_LATES = "lates";
const STORE_META = "meta";

/**
 * @returns {Promise<IDBDatabase>}
 */
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_ROSTER)) {
        db.createObjectStore(STORE_ROSTER, { keyPath: "student_id" });
      }
      if (!db.objectStoreNames.contains(STORE_LATES)) {
        const late = db.createObjectStore(STORE_LATES, { keyPath: "id" });
        late.createIndex("dayKey", "dayKey", { unique: false });
        late.createIndex("loggedAt", "loggedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

/**
 * @template T
 * @param {IDBRequest<T>} req
 * @returns {Promise<T>}
 */
function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

/**
 * @param {IDBTransaction} tx
 * @returns {Promise<void>}
 */
function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
  });
}

export async function getAllStudents() {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_ROSTER, "readonly");
    const store = tx.objectStore(STORE_ROSTER);
    const rows = await reqToPromise(store.getAll());
    await txDone(tx);
    return rows;
  } finally {
    db.close();
  }
}

export async function getStudentCount() {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_ROSTER, "readonly");
    const store = tx.objectStore(STORE_ROSTER);
    const count = await reqToPromise(store.count());
    await txDone(tx);
    return count;
  } finally {
    db.close();
  }
}

/**
 * Merge students by student_id (upsert).
 * @param {import("./csv.js").Student[]} students
 */
export async function upsertStudents(students) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_ROSTER, "readwrite");
    const store = tx.objectStore(STORE_ROSTER);
    for (const s of students) {
      store.put(s);
    }
    await txDone(tx);
  } finally {
    db.close();
  }
}

/**
 * Replace entire roster.
 * @param {import("./csv.js").Student[]} students
 */
export async function replaceRoster(students) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_ROSTER, "readwrite");
    const store = tx.objectStore(STORE_ROSTER);
    store.clear();
    for (const s of students) {
      store.put(s);
    }
    await txDone(tx);
  } finally {
    db.close();
  }
}

export async function clearRoster() {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_ROSTER, "readwrite");
    tx.objectStore(STORE_ROSTER).clear();
    await txDone(tx);
  } finally {
    db.close();
  }
}

/**
 * @param {string} dayKey
 * @returns {Promise<import("./reports.js").LateEntry[]>}
 */
export async function getLatesForDay(dayKey) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_LATES, "readonly");
    const idx = tx.objectStore(STORE_LATES).index("dayKey");
    const rows = await reqToPromise(idx.getAll(dayKey));
    await txDone(tx);
    return rows.sort((a, b) => a.loggedAt - b.loggedAt);
  } finally {
    db.close();
  }
}

/**
 * @param {import("./reports.js").LateEntry} entry
 */
export async function addLateEntry(entry) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_LATES, "readwrite");
    tx.objectStore(STORE_LATES).put(entry);
    await txDone(tx);
  } finally {
    db.close();
  }
}

/**
 * @param {string} id
 */
export async function removeLateEntry(id) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_LATES, "readwrite");
    tx.objectStore(STORE_LATES).delete(id);
    await txDone(tx);
  } finally {
    db.close();
  }
}

/**
 * Clear late entries for a day. Does NOT touch roster.
 * @param {string} dayKey
 */
export async function clearLatesForDay(dayKey) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_LATES, "readwrite");
    const store = tx.objectStore(STORE_LATES);
    const idx = store.index("dayKey");
    const keys = await reqToPromise(idx.getAllKeys(dayKey));
    for (const key of keys) {
      store.delete(key);
    }
    await txDone(tx);
  } finally {
    db.close();
  }
}

/**
 * Remove late entries whose dayKey is not today (no long-term storage).
 * @param {string} todayKey
 */
export async function purgeOldLates(todayKey) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_LATES, "readwrite");
    const store = tx.objectStore(STORE_LATES);
    const all = await reqToPromise(store.getAll());
    for (const row of all) {
      if (row.dayKey !== todayKey) {
        store.delete(row.id);
      }
    }
    await txDone(tx);
  } finally {
    db.close();
  }
}

/**
 * @param {string} key
 * @param {unknown} value
 */
export async function setMeta(key, value) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_META, "readwrite");
    tx.objectStore(STORE_META).put({ key, value });
    await txDone(tx);
  } finally {
    db.close();
  }
}

/**
 * @param {string} key
 */
export async function getMeta(key) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_META, "readonly");
    const row = await reqToPromise(tx.objectStore(STORE_META).get(key));
    await txDone(tx);
    return row?.value;
  } finally {
    db.close();
  }
}
