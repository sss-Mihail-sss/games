export type TransportState = "connecting" | "open" | "closed";

export interface Transport {
  readonly state: TransportState;
  send(type: string, payload: unknown): void;
  sendBytes(data: Uint8Array): void;
  on(type: string, handler: (payload: unknown) => void): () => void;
  onBytes(handler: (data: Uint8Array) => void): () => void;
  close(): void;
}
