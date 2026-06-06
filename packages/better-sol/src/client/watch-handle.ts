import type { createReactiveStoreWithInitialValueAndSlotTracking } from "@solana/kit";
type SlotTrackingStore<T> = ReturnType<typeof createReactiveStoreWithInitialValueAndSlotTracking<unknown, unknown, T>>;

export interface WatchHandle<T> {
  readonly current: T | null | undefined;
  readonly error: unknown;
  subscribe(callback: () => void): () => void;
  onChange(callback: (data: T | null) => void): () => void;
  unsubscribe(): void;
}

export class WatchHandleImpl<T> implements WatchHandle<T> {
  private readonly store: SlotTrackingStore<T | null>;
  private readonly abortController: AbortController;
  private unsubscribes: readonly (() => void)[] = [];

  constructor(
    store: SlotTrackingStore<T | null>,
    abortController: AbortController,
  ) {
    this.store = store;
    this.abortController = abortController;
  }

  public get current(): T | null | undefined {
    const state = this.store.getState();
    if (state === undefined) return undefined;
    return state.value;
  }

  public get error(): unknown {
    return this.store.getError();
  }

  public subscribe(callback: () => void): () => void {
    const unsub = this.store.subscribe(callback);
    this.unsubscribes = [...this.unsubscribes, unsub];
    return unsub;
  }

  public onChange(callback: (data: T | null) => void): () => void {
    const unsub = this.store.subscribe(() => {
      const state = this.store.getState();
      if (state !== undefined) {
        callback(state.value);
      }
    });
    this.unsubscribes = [...this.unsubscribes, unsub];
    return unsub;
  }

  public unsubscribe(): void {
    for (const unsub of this.unsubscribes) {
      unsub();
    }
    this.unsubscribes = [];
    this.abortController.abort();
  }
}
