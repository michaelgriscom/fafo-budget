type SyncState =
  | { status: 'pending' }
  | { status: 'disabled' }
  | { status: 'success'; timestamp: string }
  | { status: 'error'; timestamp: string; message: string };

let state: SyncState = { status: 'pending' };

export function getSyncState(): SyncState {
  return state;
}

export function setSyncSuccess(): void {
  state = { status: 'success', timestamp: new Date().toISOString() };
}

export function setSyncError(message: string): void {
  state = { status: 'error', timestamp: new Date().toISOString(), message };
}

export function setSyncDisabled(): void {
  state = { status: 'disabled' };
}
