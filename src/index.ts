import type firebase from "firebase/compat/app";

type Firebase = typeof firebase.default;
type DatabaseEventType = firebase.default.database.EventType;

type FirebaseRESTReponse = { name: string };

const NO_OP = () => {};

export type FirebaseRESTDatabaseSnapshot = {
  key: string | null;
  ref: FirebaseRESTDatabaseReference;
  val: () => unknown;
  exists: () => boolean;
  hasChildren: () => boolean;
};

export type FirebaseRESTDatabaseSuccessCallback = (
  snapshot: FirebaseRESTDatabaseSnapshot,
) => void;
type FirebaseRESTDatabaseErrorCallback = (error: Error) => void;
export type FirebaseRESTDatabaseCompleteCallback = (
  error: Error | null,
) => void;

type FirebaseCompatiblePromise<T> = Omit<
  Promise<T>,
  "finally" | typeof Symbol.toStringTag
>;

export type FirebaseRESTDatabaseQuery = {
  ref: FirebaseRESTDatabaseReference;

  orderByValue: () => FirebaseRESTDatabaseQuery;
  orderByChild: (child: string) => FirebaseRESTDatabaseQuery;
  limitToFirst: (n: number) => FirebaseRESTDatabaseQuery;
  limitToLast: (n: number) => FirebaseRESTDatabaseQuery;
  startAfter: (n: number) => FirebaseRESTDatabaseQuery;
  endBefore: (n: number) => FirebaseRESTDatabaseQuery;

  get: () => Promise<FirebaseRESTDatabaseSnapshot>;
  once: (
    event: DatabaseEventType,
    onSuccess?: FirebaseRESTDatabaseSuccessCallback,
    onError?: FirebaseRESTDatabaseErrorCallback,
  ) => Promise<FirebaseRESTDatabaseSnapshot>;
  on: (
    event: DatabaseEventType,
    onSuccess: FirebaseRESTDatabaseSuccessCallback,
    onError?: FirebaseRESTDatabaseErrorCallback,
  ) => unknown;
  off: (
    event?: DatabaseEventType,
    callback?: FirebaseRESTDatabaseSuccessCallback,
  ) => void;
};

export type FirebaseRESTDatabaseReference = FirebaseRESTDatabaseQuery & {
  key?: string | null;
  parent: FirebaseRESTDatabaseReference | null;
  child: (child: string) => FirebaseRESTDatabaseReference;

  set: (
    value: unknown,
    onComplete?: FirebaseRESTDatabaseCompleteCallback,
  ) => Promise<void>;
  push: (
    value: unknown,
    onComplete?: FirebaseRESTDatabaseCompleteCallback,
  ) => FirebaseCompatiblePromise<FirebaseRESTDatabaseReference>;
  update: (
    value: Record<string, unknown>,
    onComplete?: FirebaseRESTDatabaseCompleteCallback,
  ) => Promise<void>;
  remove: (onComplete?: FirebaseRESTDatabaseCompleteCallback) => Promise<void>;
};

export type FirebaseRESTDatabase = {
  ref: (key: string) => FirebaseRESTDatabaseReference;
  goOnline: () => void;
  goOffline: () => void;
};

export type FirebaseRESTServerValueType = { TIMESTAMP: unknown };

export type FirebaseREST = {
  app: Firebase["app"];
  database: (() => FirebaseRESTDatabase) & {
    ServerValue: FirebaseRESTServerValueType;
  };
  auth: Firebase["auth"];
  storage: Firebase["storage"];
};

const fetchFirebase = async (
  firebase: FirebaseREST,
  url: URL,
  init?: RequestInit,
): Promise<Response> => {
  if (url.pathname === "/.info/connected.json") {
    return new Response("false");
  }

  const idToken = await firebase.auth().currentUser?.getIdToken();
  if (idToken) {
    url.searchParams.set("auth", idToken);
  }

  const response = await fetch(url, init);
  if (response.status >= 400) {
    throw new Error(`Response was not OK. (${response.status})`);
  }
  return response;
};

const sanitiseKey = (key: string) => {
  const result = [""]; // key starts with a slash
  for (const segment of key.split("/")) {
    if (segment) {
      result.push(encodeURIComponent(segment));
    }
  }
  return result.join("/");
};

const createGetDatabaseUrl = (
  firebase: Firebase | FirebaseREST,
): (() => string) => {
  /**
   * Lazy getter so errors only happen when database is used to allow for
   * progressive enhancement.
   */
  let result: string | null | undefined = null;
  return (): string => {
    if (!result) {
      if (result === null) {
        result =
          (firebase.app().options as Record<string, string>)["databaseURL"] ||
          "";
      }
      if (!result) {
        throw new Error("Firebase 'databaseURL' option not provided.");
      }
    }
    return result;
  };
};

export const createFirebaseREST = (
  firebase: Firebase | FirebaseREST,
): FirebaseREST => {
  const getDatabaseURL = createGetDatabaseUrl(firebase);

  const fetchCache: Partial<
    Record<string, Promise<FirebaseRESTDatabaseSnapshot>>
  > = {};

  /**
   * Keep timeout low to avoid showing stale data. Mutations need to trigger
   * caches to revalidate to provide a higher cache timeout.
   */
  const fetchCacheTimeout = 2_000;

  const ServerValue: FirebaseRESTServerValueType = {
    TIMESTAMP: { ".sv": "timestamp" },
  };

  const fetchSnapshot = async (
    firebase: FirebaseREST,
    url: URL,
  ): Promise<FirebaseRESTDatabaseSnapshot> => {
    if (url.searchParams.size > 0 && !url.searchParams.has("orderBy")) {
      url.searchParams.set("orderBy", '"$key"');
    }
    const response = await fetchFirebase(firebase, url);
    const value = await response.json();
    const key = url.pathname.slice(0, -5);
    return {
      key,
      ref: ref(key),
      val: () => value,
      exists: () => value !== null,
      hasChildren: () => Boolean(value && typeof value === "object"),
    };
  };

  const ref = (key: string = "/"): FirebaseRESTDatabaseReference => {
    key = sanitiseKey(key);
    const url = new URL(`${key}.json`, getDatabaseURL());

    const child = (childKey: string) => {
      return ref(`${key}/${childKey}`);
    };

    const orderByValue = () => {
      url.searchParams.set("orderBy", '"$value"');
      return selfRef;
    };
    const orderByChild = (childKey: string) => {
      url.searchParams.set("orderBy", childKey);
      return selfRef;
    };
    const limitToFirst = (n: number) => {
      url.searchParams.set("limitToFirst", `${n}`);
      return selfRef;
    };
    const limitToLast = (n: number) => {
      url.searchParams.set("limitToLast", `${n}`);
      return selfRef;
    };
    const startAfter = (n: number) => {
      url.searchParams.set("startAfter", `${n}`);
      return selfRef;
    };
    const endBefore = (n: number) => {
      url.searchParams.set("endBefore", `${n}`);
      return selfRef;
    };

    const get: FirebaseRESTDatabaseQuery["get"] = () => {
      const cacheKey = url.href;
      const snapshotPromise = fetchCache[cacheKey]
        ? fetchCache[cacheKey]
        : fetchSnapshot(firebase, url);

      if (!fetchCache[cacheKey]) {
        fetchCache[cacheKey] = snapshotPromise;
        setTimeout(() => {
          delete fetchCache[cacheKey];
        }, fetchCacheTimeout);
      }
      return snapshotPromise;
    };

    const once: FirebaseRESTDatabaseQuery["once"] = async (
      event,
      onSuccess,
      onError,
    ) => {
      try {
        if (event === "value") {
          const snapshot = await get();
          if (onSuccess) {
            onSuccess(snapshot);
          }
          return snapshot;
        }
        throw new Error("Unsupported firebase database once event.");
      } catch (error) {
        if (onError) {
          onError(error as Error);
        }
        throw error;
      }
    };

    const on: FirebaseRESTDatabaseQuery["on"] = async (
      event,
      onSuccess,
      onError,
    ) => {
      try {
        if (event === "value") {
          onSuccess(await get());
          return;
        }
        if (
          event === "child_added" ||
          event === "child_changed" ||
          event === "child_removed"
        ) {
          // These are real-time events so no-op.
          // "value" should always be used to get initial state
          return;
        }
        throw new Error("Unsupported firebase database on event.");
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.error("firebase-rest.database.on", error);
        }
        if (onError) {
          onError(error as Error);
        }
      }
    };

    const set: FirebaseRESTDatabaseReference["set"] = async (
      value,
      onComplete,
    ) => {
      try {
        await fetchFirebase(firebase, url, {
          method: "PUT",
          body: JSON.stringify(value),
        });
        if (onComplete) {
          onComplete(null);
        }
      } catch (error) {
        if (onComplete) {
          onComplete(error as Error);
        }
        throw error;
      }
    };

    const push: FirebaseRESTDatabaseReference["push"] = async (
      value,
      onComplete,
    ) => {
      try {
        const response = await fetchFirebase(firebase, url, {
          method: "POST",
          body: JSON.stringify(value),
        });
        if (onComplete) {
          onComplete(null);
        }
        return child(((await response.json()) as FirebaseRESTReponse).name);
      } catch (error) {
        if (onComplete) {
          onComplete(error as Error);
        }
        throw error;
      }
    };

    const update: FirebaseRESTDatabaseReference["update"] = async (
      value,
      onComplete = NO_OP,
    ) => {
      try {
        await fetchFirebase(firebase, url, {
          method: "PATCH",
          body: JSON.stringify(value),
        });
        if (onComplete) {
          onComplete(null);
        }
      } catch (error) {
        if (onComplete) {
          onComplete(error as Error);
        }
        throw error;
      }
    };

    const remove: FirebaseRESTDatabaseReference["remove"] = async (
      onComplete = NO_OP,
    ) => {
      try {
        await fetchFirebase(firebase, url, {
          method: "DELETE",
        });
        if (onComplete) {
          onComplete(null);
        }
      } catch (error) {
        if (onComplete) {
          onComplete(error as Error);
        }
        throw error;
      }
    };

    const selfRef: FirebaseRESTDatabaseReference = {
      key,
      get ref() {
        return selfRef;
      },
      get parent() {
        return key === "/" ? null : ref(key.split("/").slice(0, -1).join("/"));
      },
      child,
      orderByValue,
      orderByChild,
      limitToFirst,
      limitToLast,
      startAfter,
      endBefore,
      get,
      once,
      on,
      off: NO_OP,
      set,
      push,
      update,
      remove,
    };

    return selfRef;
  };

  const database = {
    ref,
    goOnline: NO_OP,
    goOffline: NO_OP,
  };

  return {
    app: firebase.app,
    database: Object.assign(() => database, { ServerValue }),
    auth: firebase.auth,
    storage: firebase.storage,
  };
};
