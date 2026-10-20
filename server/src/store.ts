import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DATA_DIR } from "./config.js";
import type { Burn, Db, Room } from "./types.js";

const file = resolve(DATA_DIR, "deadroom.json");
let db: Db = { nextIndex: 0, rooms: {} };
let timer: NodeJS.Timeout | undefined;
let lastError: string | undefined;
let lastSaveAt: number | undefined;

export function loadDb() {
  for (const f of [file, file + ".bak"]) {
    try {
      if (existsSync(f)) {
        db = JSON.parse(readFileSync(f, "utf8")) as Db;
        if (f !== file) console.warn("WARNING: the main database file was unreadable, loaded the backup copy instead.");
        return;
      }
    } catch (e) {
      console.error(`could not read ${f}:`, e);
    }
  }
}

function write() {
  try {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = file + ".tmp";
    writeFileSync(tmp, JSON.stringify(db));
    if (existsSync(file)) copyFileSync(file, file + ".bak"); // the last good copy, in case this one is ever bad
    renameSync(tmp, file);
    lastSaveAt = Date.now();
    lastError = undefined;
  } catch (e) {
    lastError = String(e);
    console.error("db save failed:", e);
  }
}

export function save() {
  clearTimeout(timer);
  timer = setTimeout(write, 200);
}

export function flush() {
  clearTimeout(timer);
  write();
}

export const allRooms = () => Object.values(db.rooms);
export const getBurns = (): Burn[] => db.burns ?? [];
export const addBurn = (b: Burn) => {
  (db.burns ??= []).push(b);
  save();
};
export const getRoom = (id: string): Room | undefined => db.rooms[id];
export const putRoom = (room: Room) => {
  db.rooms[room.id] = room;
  save();
};
export const takeIndex = () => {
  const i = db.nextIndex++;
  save();
  return i;
};
export const storageInfo = () => ({ file, rooms: Object.keys(db.rooms).length, lastSaveAt, error: lastError });
