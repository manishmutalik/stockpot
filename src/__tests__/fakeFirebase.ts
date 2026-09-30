/**
 * A tiny in-memory stand-in for src/firebase.ts, just big enough to run the
 * whole app in a test: email/password auth, document and collection reads and
 * writes, batches, and live onSnapshot listeners.
 */
type Data = Record<string, any>;
type Listener = { path: string; kind: 'collection' | 'doc'; cb: (snap: any) => void };

export function createFakeFirebase() {
  const store = new Map<string, Data>(); // full doc path -> data
  const listeners = new Set<Listener>();
  const authListeners = new Set<(u: any) => void>();
  const auth: { currentUser: any } = { currentUser: null };
  const calls = { failNextCreateUser: null as null | Error };

  const ref = (path: string) => ({ path, id: path.split('/').pop()! });
  const join = (parts: any[]) => parts.filter(p => typeof p === 'string').join('/');
  const isDirectChild = (parent: string, key: string) => key.startsWith(parent + '/') && !key.slice(parent.length + 1).includes('/');

  const snapshotFor = (l: Listener) => {
    if (l.kind === 'doc') {
      const data = store.get(l.path);
      return { exists: () => data !== undefined, data: () => data, id: l.path.split('/').pop(), metadata: { hasPendingWrites: false, fromCache: false } };
    }
    const docs = [...store.entries()].filter(([k]) => isDirectChild(l.path, k)).map(([k, v]) => ({ id: k.split('/').pop(), data: () => v }));
    return { docs, empty: docs.length === 0, size: docs.length, forEach: (fn: any) => docs.forEach(fn), metadata: { hasPendingWrites: false, fromCache: false } };
  };
  const notify = (changedPath: string) => {
    listeners.forEach(l => {
      const parent = changedPath.slice(0, changedPath.lastIndexOf('/'));
      if ((l.kind === 'doc' && l.path === changedPath) || (l.kind === 'collection' && l.path === parent)) l.cb(snapshotFor(l));
    });
  };
  const write = (path: string, data: Data, merge = false) => {
    store.set(path, merge ? { ...(store.get(path) || {}), ...data } : { ...data });
    notify(path);
  };

  return {
    store, auth, calls,
    reset: () => { store.clear(); listeners.clear(); authListeners.clear(); auth.currentUser = null; calls.failNextCreateUser = null; },
    module: {
      auth,
      db: {},
      googleProvider: {},
      signInWithPopup: async () => { throw new Error('popup blocked in tests'); },
      signOut: async () => { auth.currentUser = null; authListeners.forEach(cb => cb(null)); },
      onAuthStateChanged: (_a: any, cb: (u: any) => void) => {
        authListeners.add(cb);
        setTimeout(() => cb(auth.currentUser), 0);
        return () => authListeners.delete(cb);
      },
      createUserWithEmailAndPassword: async (_a: any, email: string) => {
        if (calls.failNextCreateUser) { const e = calls.failNextCreateUser; calls.failNextCreateUser = null; throw e; }
        const user = { uid: `uid_${store.size}_${Date.now()}`, email, displayName: null, getIdToken: async () => 'test-token' };
        auth.currentUser = user;
        authListeners.forEach(cb => cb(user));
        return { user };
      },
      signInWithEmailAndPassword: async () => { throw Object.assign(new Error('nope'), { code: 'auth/invalid-credential' }); },
      updateProfile: async (user: any, patch: Data) => { Object.assign(user, patch); authListeners.forEach(cb => cb(user)); },
      collection: (_db: any, ...parts: string[]) => ({ ...ref(join(parts)), type: 'collection' }),
      doc: (_db: any, ...parts: string[]) => ({ ...ref(join(parts)), type: 'document' }),
      getDoc: async (r: any) => { const d = store.get(r.path); return { exists: () => d !== undefined, data: () => d, id: r.id }; },
      getDocs: async (r: any) => snapshotFor({ path: r.path, kind: 'collection', cb: () => {} }),
      setDoc: async (r: any, data: Data, opts?: { merge?: boolean }) => write(r.path, data, !!opts?.merge),
      addDoc: async (r: any, data: Data) => { const id = `auto_${store.size}`; write(`${r.path}/${id}`, data); return { id }; },
      deleteDoc: async (r: any) => { store.delete(r.path); notify(r.path); },
      onSnapshot: (r: any, cb: (s: any) => void) => {
        const l: Listener = { path: r.path, kind: r.type === 'collection' ? 'collection' : 'doc', cb };
        listeners.add(l);
        setTimeout(() => cb(snapshotFor(l)), 0);
        return () => listeners.delete(l);
      },
      query: (r: any) => r, where: () => ({}), orderBy: () => ({}), limit: () => ({}),
      increment: (n: number) => ({ __increment: n }),
      writeBatch: () => {
        const ops: (() => void)[] = [];
        return {
          set: (r: any, data: Data, opts?: any) => { ops.push(() => write(r.path, data, !!opts?.merge)); },
          update: (r: any, data: Data) => { ops.push(() => write(r.path, data, true)); },
          delete: (r: any) => { ops.push(() => { store.delete(r.path); notify(r.path); }); },
          commit: async () => { ops.forEach(op => op()); },
        };
      },
    },
  };
}
