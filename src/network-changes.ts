// Changes of the device's network, for every screen that waits for the
// connection (the stored copy in screens/Shell.tsx, screens/Offline.tsx).
//
// expo-network on iOS keeps one NWPathMonitor per app and cancels it when
// the last listener goes (OnStopObserving); a cancelled NWPathMonitor never
// starts again, so every listener added after that hears nothing (#353:
// the stored page shown a second time never heard the network come back).
// The app therefore listens to expo-network once, for good, and hands the
// changes on to its own listeners.
export type NetworkChange = { isConnected?: boolean | null; isInternetReachable?: boolean | null };
type Listener = (state: NetworkChange) => void;

export class NetworkFanOut {
  private listeners = new Set<Listener>();
  private subscribed = false;

  constructor(private readonly subscribe: (listener: Listener) => unknown) {}

  // Returns the function that removes the listener (the native listener stays).
  add(listener: Listener): () => void {
    if (!this.subscribed) {
      this.subscribed = true;
      this.subscribe((state) => {
        for (const each of [...this.listeners]) {
          try {
            each(state);
          } catch {}
        }
      });
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get size() {
    return this.listeners.size;
  }
}

// Whether the network lets the instance be tried at all.
export const networkConnected = (state: NetworkChange) => !!state.isConnected && state.isInternetReachable !== false;

let shared: NetworkFanOut | null = null;
export function onNetworkChange(listener: Listener): () => void {
  if (!shared) {
    // Loaded here, not at the top: the tests run this module without the native one.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Network = require("expo-network") as typeof import("expo-network");
    shared = new NetworkFanOut((each) => Network.addNetworkStateListener(each));
  }
  return shared.add(listener);
}
