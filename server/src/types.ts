import type { Address, Hex } from "viem";

export type RoomStatus = "open" | "launching" | "distributing" | "live" | "expired" | "failed";

export type Seat = {
  address: Address;
  depositTx: Hex;
  joinedAt: number;
  status: "in" | "left";
  refundTx?: Hex;
  payoutTx?: Hex;
  payoutAmount?: string;
};

export type Socials = { twitter: string; telegram: string; discord: string; website: string; farcaster: string };

export type Room = {
  id: string;
  index: number;
  wallet: Address;
  createdAt: number;
  creator?: Address;
  /** true until the creator has paid the first seat. Pending coffins are not listed and only the creator can take seat 1. */
  pending?: boolean;
  token: {
    address?: Address;
    name: string;
    symbol: string;
    logo: string;
    description: string;
    socials: Socials;
  };
  target: number;
  seatPriceWei: string;
  deadline?: number;
  status: RoomStatus;
  seats: Seat[];
  processedTxs: Hex[];
  launch?: {
    salt: Hex;
    quoteIn?: string;
    configId?: string;
    txHash?: Hex;
    newToken?: Address;
    curve?: Address;
    tokensBought?: string;
    sharePerSeat?: string;
    /** the platform fee for this coffin. feeWei is the stated fee, takeWei is what was held back (the larger of the fee and the launch costs) */
    fee?: { feeWei: string; takeWei: string; launchFeeWei: string; costWei: string; netWei?: string; treasuryWei?: string; burnWei?: string; treasuryTx?: Hex; burnTx?: Hex; sweptAt?: number };
    attempts: number;
    error?: string;
  };
  buyback: { spentWei: string; tokens: string; runs: number; lastRunAt?: number; lastNote?: string };
  log: { t: number; msg: string }[];
};

export type Burn = { t: number; ethWei: string; tokens: string; buyTx: Hex; burnTx: Hex };
export type Db = { nextIndex: number; rooms: Record<string, Room>; burns?: Burn[] };
