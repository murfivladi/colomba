import mysql from 'mysql2/promise';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { config } from './config.js';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      ...config.db,
      waitForConnections: true,
      connectionLimit: 10,
      charset: 'utf8mb4',
      timezone: 'Z',
      dateStrings: false,
      multipleStatements: false,
      supportBigNumbers: true,
      bigNumberStrings: false,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) await pool.end();
  pool = null;
}

type Exec = Pool | PoolConnection;
export type Row = RowDataPacket & Record<string, any>;

export async function q<T = Row>(sql: string, params: unknown[] = [], conn?: Exec): Promise<T[]> {
  const [rows] = await (conn ?? getPool()).query<RowDataPacket[]>(sql, params);
  return rows as unknown as T[];
}

export async function one<T = Row>(sql: string, params: unknown[] = [], conn?: Exec): Promise<T | null> {
  const rows = await q<T>(sql, params, conn);
  return rows[0] ?? null;
}

export async function exec(sql: string, params: unknown[] = [], conn?: Exec): Promise<ResultSetHeader> {
  const [res] = await (conn ?? getPool()).query<ResultSetHeader>(sql, params);
  return res;
}

export async function tx<T>(fn: (c: PoolConnection) => Promise<T>): Promise<T> {
  const c = await getPool().getConnection();
  try {
    await c.beginTransaction();
    const r = await fn(c);
    await c.commit();
    return r;
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}

/** POINT из lon/lat для вставки: ST_GeomFromText(?) */
export function pointWkt(lon: number, lat: number): string {
  return `POINT(${lon} ${lat})`;
}

export function toDate(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  return v instanceof Date ? v : new Date(String(v));
}
