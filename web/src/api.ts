export type Seat = {
  address: string;
  depositTx: string;
  joinedAt: number;
  status: "in" | "left";
  refundTx?: string;
  payoutTx?: string;
  payoutAmount?: string;
};

export type RoomStatus = "open" | "launching" | "distributing" | "live" | "expired" | "failed";

export type Room = {
  id: string;
  wallet: string;
  creator?: string;
  pending?: boolean;
  createdAt: number;
  token: { address?: string; name: string; symbol: string; logo: string; description: string };
  target: number;
  seatPriceWei: string;
  deadline?: number;
  status: RoomStatus;
  seats: Seat[];
  seatsIn: number;
  launch?: { newToken?: string; curve?: string; tokensBought?: string; sharePerSeat?: string; error?: string; txHash?: string; quoteIn?: string };
  buyback: { spentWei: string; tokens: string; runs: number; lastRunAt?: number; lastNote?: string };
  log: { t: number; msg: string }[];
};

export type Config = {
  chainId: number;
  explorer: string;
  factory: string;
  launchFeeWei: string;
  gasPriceWei: string;
  gasLaunch: string;
  gasTransfer: string;
  gasBuffer: number;
  minSeats: number;
  maxSeats: number;
  minSeatWei: string;
  feeBps: number;
};

export type TokenInfo = { address: string; name: string; symbol: string; logo: string; description: string; website: string; twitter: string; openRooms: string[] };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch("/api" + path, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.error ?? `request failed (${r.status})`), { status: r.status });
  return body as T;
}

export const api = {
  config: () => call<Config>("/config"),
  rooms: () => call<{ rooms: Room[] }>("/rooms").then((r) => r.rooms),
  room: (id: string) => call<{ room: Room }>(`/rooms/${id}`).then((r) => r.room),
  token: (address: string) => call<TokenInfo>(`/token/${address}`),
  create: (body: Record<string, unknown>, token: string) =>
    call<{ room: Room; warning?: string }>("/rooms", { method: "POST", body: JSON.stringify(body), headers: { authorization: `Bearer ${token}` } }),
  join: (id: string, txHash: string) =>
    call<{ accepted: boolean; reason?: string; refundTx?: string; room: Room }>(`/rooms/${id}/join`, { method: "POST", body: JSON.stringify({ txHash }) }),
  leave: (id: string, body: { address: string; timestamp?: number; signature?: string }, token = "") =>
    call<{ room: Room }>(`/rooms/${id}/leave`, { method: "POST", body: JSON.stringify(body), headers: token ? { authorization: `Bearer ${token}` } : undefined }),
};
