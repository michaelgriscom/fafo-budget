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

type PaypalState =
  | { status: 'pending' }
  | { status: 'disabled' }
  | { status: 'success'; timestamp: string; imported: number }
  | { status: 'error'; timestamp: string; message: string };

let paypalState: PaypalState = { status: 'pending' };

export function getPaypalState(): PaypalState {
  return paypalState;
}

export function setPaypalSuccess(imported: number): void {
  paypalState = { status: 'success', timestamp: new Date().toISOString(), imported };
}

export function setPaypalError(message: string): void {
  paypalState = { status: 'error', timestamp: new Date().toISOString(), message };
}

export function setPaypalDisabled(): void {
  paypalState = { status: 'disabled' };
}
