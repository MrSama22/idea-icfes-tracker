// IndexedDB mínimo (clave → valor) para guardar cartillas y páginas, que no caben en localStorage.
const DB_NAME = "idea-icfes";
const STORES = ["cartillas", "paginas"] as const;
type StoreName = (typeof STORES)[number];

let dbp: Promise<IDBDatabase> | null = null;
function abrir() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s);
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbp;
}

function tx<T>(s: StoreName, modo: IDBTransactionMode, f: (o: IDBObjectStore) => IDBRequest<T>) {
  return abrir().then(
    (db) =>
      new Promise<T>((res, rej) => {
        const t = db.transaction(s, modo);
        const r = f(t.objectStore(s));
        t.oncomplete = () => res(r.result);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      }),
  );
}

export const idb = {
  get: <T>(s: StoreName, k: string) => tx<T | undefined>(s, "readonly", (o) => o.get(k) as IDBRequest<T | undefined>),
  set: (s: StoreName, k: string, v: unknown) => tx(s, "readwrite", (o) => o.put(v, k)),
  del: (s: StoreName, k: string) => tx(s, "readwrite", (o) => o.delete(k)),
  all: <T>(s: StoreName) => tx<T[]>(s, "readonly", (o) => o.getAll() as IDBRequest<T[]>),
  keys: (s: StoreName) => tx<IDBValidKey[]>(s, "readonly", (o) => o.getAllKeys()),
  delPrefijo: async (s: StoreName, p: string) => {
    const ks = await idb.keys(s);
    await Promise.all(ks.filter((k) => String(k).startsWith(p)).map((k) => idb.del(s, String(k))));
  },
};
