import Dexie, { type Table } from "dexie";

type LocalAudioRow = {
  entryId: string;
  blob: Blob;
  name: string;
  mime: string;
};

class PageAudioDatabase extends Dexie {
  audio!: Table<LocalAudioRow, string>;

  constructor() {
    super("wings-page-audio");
    this.version(1).stores({ audio: "entryId" });
  }
}

let database: PageAudioDatabase | null | undefined;

function db(): PageAudioDatabase | null {
  if (database !== undefined) return database;
  try {
    database = typeof indexedDB === "undefined" ? null : new PageAudioDatabase();
  } catch {
    database = null;
  }
  return database;
}

export async function saveLocalPageAudio(entryId: string, file: File): Promise<void> {
  const instance = db();
  if (!instance) throw new Error("This browser can't store audio on the device.");
  await instance.audio.put({ entryId, blob: file, name: file.name, mime: file.type });
}

export async function readLocalPageAudio(entryId: string): Promise<Blob | null> {
  const instance = db();
  if (!instance) return null;
  const row = await instance.audio.get(entryId);
  return row?.blob ?? null;
}
