/** Shared helpers for building the local mirror of the D1 database. */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SCHEMA_PATH = path.resolve(here, '../../../worker/sql/0000_schema.sql');
export const DATA_DIR = path.resolve(here, '../../data');
export const LOCAL_DB = path.join(DATA_DIR, 'local.db');

export function readSchema() {
  return fs.readFileSync(SCHEMA_PATH, 'utf8');
}

export function openLocal({ fresh = false } = {}) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fresh && fs.existsSync(LOCAL_DB)) fs.rmSync(LOCAL_DB);
  const db = new DatabaseSync(LOCAL_DB);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(readSchema());
  return db;
}

export function floatsToBlob(arr) {
  const f = arr instanceof Float32Array ? arr : Float32Array.from(arr);
  return Buffer.from(f.buffer, f.byteOffset, f.byteLength);
}

export function blobToFloats(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
}
