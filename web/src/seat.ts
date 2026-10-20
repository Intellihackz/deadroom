import { api, type Room } from "./api";
import { ensureChain, sendEth } from "./wallet";

export type SeatResult = { accepted: boolean; reason?: string; refundTx?: string; room: Room };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Tell the server about a payment to the coffin wallet. The chain can be a few seconds behind, so retry while it says "not yet". */
export async function reportJoin(roomId: string, txHash: string): Promise<SeatResult> {
  for (let i = 0; i < 12; i++) {
    try {
      return await api.join(roomId, txHash);
    } catch (e: any) {
      if (e.status !== 409) throw e;
      await sleep(2000);
    }
  }
  throw new Error("The transaction has not shown up yet. Paste its hash on the coffin page to claim the seat.");
}

/** Pay one seat from the connected wallet and claim it. Used by the join button and by digging up a coffin. */
export async function payForSeat(room: Pick<Room, "id" | "wallet" | "seatPriceWei">, account: string, explorer: string, onStatus: (text: string) => void): Promise<SeatResult> {
  await ensureChain(explorer);
  onStatus("Confirm the transfer in your wallet…");
  const txHash = await sendEth(account, room.wallet, BigInt(room.seatPriceWei));
  onStatus("Sent. Waiting for the chain…");
  return reportJoin(room.id, txHash);
}
