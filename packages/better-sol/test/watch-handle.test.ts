import { describe, expect, test } from "bun:test";
import type { SolanaRpcResponse } from "@solana/rpc-types";
import { WatchHandleImpl, type WatchHandle } from "../src/client/watch-handle";

type MockStoreState<T> = SolanaRpcResponse<T> | undefined;

class MockReactiveStore<T> {
  private state: MockStoreState<T>;
  private errorValue: unknown;
  private readonly callbacks: Set<() => void> = new Set();

  constructor() {
    this.state = undefined;
    this.errorValue = undefined;
  }

  public getState(): MockStoreState<T> {
    return this.state;
  }

  public getError(): unknown {
    return this.errorValue;
  }

  public subscribe(callback: () => void): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  public setState(state: MockStoreState<T>): void {
    this.state = state;
    for (const cb of this.callbacks) {
      cb();
    }
  }

  public setError(error: unknown): void {
    this.errorValue = error;
    for (const cb of this.callbacks) {
      cb();
    }
  }
}

function createHandle<T>(): {
  handle: WatchHandle<T>;
  store: MockReactiveStore<T | null>;
  abortController: AbortController;
} {
  const store = new MockReactiveStore<T | null>();
  const abortController = new AbortController();
  const handle = new WatchHandleImpl<T>(store, abortController);
  return { handle, store, abortController };
}

describe("WatchHandle: current", () => {
  test("returns undefined before first update", () => {
    const { handle } = createHandle<{ count: number }>();
    expect(handle.current).toBeUndefined();
  });

  test("returns data after store receives account data", () => {
    const { handle, store } = createHandle<{ count: number }>();
    store.setState({ context: { slot: 1n }, value: { count: 42 } });
    expect(handle.current).toEqual({ count: 42 });
  });

  test("returns null when account does not exist", () => {
    const { handle, store } = createHandle<{ count: number }>();
    store.setState({ context: { slot: 1n }, value: null });
    expect(handle.current).toBeNull();
  });

  test("updates when store receives new data", () => {
    const { handle, store } = createHandle<{ count: number }>();
    store.setState({ context: { slot: 1n }, value: { count: 1 } });
    expect(handle.current).toEqual({ count: 1 });

    store.setState({ context: { slot: 2n }, value: { count: 2 } });
    expect(handle.current).toEqual({ count: 2 });
  });

  test("does not revert to undefined when slot decreases", () => {
    const { handle, store } = createHandle<{ count: number }>();
    store.setState({ context: { slot: 5n }, value: { count: 5 } });
    store.setState({ context: { slot: 3n }, value: { count: 3 } });
    expect(handle.current).toEqual({ count: 3 });
  });
});

describe("WatchHandle: error", () => {
  test("returns undefined when no error has occurred", () => {
    const { handle } = createHandle<{ count: number }>();
    expect(handle.error).toBeUndefined();
  });

  test("returns error after store receives an error", () => {
    const { handle, store } = createHandle<{ count: number }>();
    const error = new Error("connection lost");
    store.setError(error);
    expect(handle.error).toBe(error);
  });

  test("preserves last known value after error", () => {
    const { handle, store } = createHandle<{ count: number }>();
    store.setState({ context: { slot: 1n }, value: { count: 42 } });
    store.setError(new Error("connection lost"));
    expect(handle.current).toEqual({ count: 42 });
    expect(handle.error).toBeInstanceOf(Error);
  });
});

describe("WatchHandle: subscribe", () => {
  test("calls callback on each state change", () => {
    const { handle, store } = createHandle<{ count: number }>();
    const values: Array<{ count: number } | null | undefined> = [];

    handle.subscribe(() => {
      values.push(handle.current);
    });

    store.setState({ context: { slot: 1n }, value: { count: 1 } });
    store.setState({ context: { slot: 2n }, value: { count: 2 } });
    store.setState({ context: { slot: 3n }, value: null });

    expect(values).toEqual([
      { count: 1 },
      { count: 2 },
      null,
    ]);
  });

  test("returned function unsubscribes from updates", () => {
    const { handle, store } = createHandle<{ count: number }>();
    const values: Array<{ count: number } | null | undefined> = [];

    const unsub = handle.subscribe(() => {
      values.push(handle.current);
    });

    store.setState({ context: { slot: 1n }, value: { count: 1 } });
    unsub();
    store.setState({ context: { slot: 2n }, value: { count: 2 } });

    expect(values).toEqual([{ count: 1 }]);
  });

  test("supports multiple concurrent subscribers", () => {
    const { handle, store } = createHandle<{ count: number }>();
    const valuesA: Array<{ count: number } | null | undefined> = [];
    const valuesB: Array<{ count: number } | null | undefined> = [];

    const unsubA = handle.subscribe(() => {
      valuesA.push(handle.current);
    });
    handle.subscribe(() => {
      valuesB.push(handle.current);
    });

    store.setState({ context: { slot: 1n }, value: { count: 1 } });

    unsubA();

    store.setState({ context: { slot: 2n }, value: { count: 2 } });

    expect(valuesA).toEqual([{ count: 1 }]);
    expect(valuesB).toEqual([{ count: 1 }, { count: 2 }]);
  });
});

describe("WatchHandle: onChange", () => {
  test("fires callback with data on state change", () => {
    const { handle, store } = createHandle<{ count: number }>();
    const received: Array<{ count: number } | null> = [];

    handle.onChange((data) => {
      received.push(data);
    });

    store.setState({ context: { slot: 1n }, value: { count: 1 } });
    store.setState({ context: { slot: 2n }, value: { count: 2 } });

    expect(received).toEqual([{ count: 1 }, { count: 2 }]);
  });

  test("fires callback with null when account does not exist", () => {
    const { handle, store } = createHandle<{ count: number }>();
    const received: Array<{ count: number } | null> = [];

    handle.onChange((data) => {
      received.push(data);
    });

    store.setState({ context: { slot: 1n }, value: null });

    expect(received).toEqual([null]);
  });

  test("does not fire callback before first state arrives", () => {
    const { handle } = createHandle<{ count: number }>();
    const received: Array<{ count: number } | null> = [];

    handle.onChange((data) => {
      received.push(data);
    });

    expect(received).toEqual([]);
  });

  test("returned function unsubscribes from updates", () => {
    const { handle, store } = createHandle<{ count: number }>();
    const received: Array<{ count: number } | null> = [];

    const unsub = handle.onChange((data) => {
      received.push(data);
    });

    store.setState({ context: { slot: 1n }, value: { count: 1 } });
    unsub();
    store.setState({ context: { slot: 2n }, value: { count: 2 } });

    expect(received).toEqual([{ count: 1 }]);
  });
});

describe("WatchHandle: unsubscribe", () => {
  test("aborts the internal AbortController", () => {
    const { handle, abortController } = createHandle<{ count: number }>();
    expect(abortController.signal.aborted).toBe(false);
    handle.unsubscribe();
    expect(abortController.signal.aborted).toBe(true);
  });

  test("stops all subscribe callbacks", () => {
    const { handle, store } = createHandle<{ count: number }>();
    const values: Array<{ count: number } | null | undefined> = [];

    handle.subscribe(() => {
      values.push(handle.current);
    });

    store.setState({ context: { slot: 1n }, value: { count: 1 } });
    handle.unsubscribe();
    store.setState({ context: { slot: 2n }, value: { count: 2 } });

    expect(values).toEqual([{ count: 1 }]);
  });

  test("stops all onChange callbacks", () => {
    const { handle, store } = createHandle<{ count: number }>();
    const received: Array<{ count: number } | null> = [];

    handle.onChange((data) => {
      received.push(data);
    });

    store.setState({ context: { slot: 1n }, value: { count: 1 } });
    handle.unsubscribe();
    store.setState({ context: { slot: 2n }, value: { count: 2 } });

    expect(received).toEqual([{ count: 1 }]);
  });

  test("is idempotent", () => {
    const { handle, abortController } = createHandle<{ count: number }>();
    handle.unsubscribe();
    expect(abortController.signal.aborted).toBe(true);
    handle.unsubscribe();
    expect(abortController.signal.aborted).toBe(true);
  });
});
