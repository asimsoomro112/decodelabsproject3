/**
 * Schema introspection repository — powers the interactive ER diagram.
 *
 * Read-only: information_schema.columns plus pg_constraint (joined through
 * pg_class / pg_namespace, column lists rebuilt with generate_subscripts so
 * composite keys keep their order) and pg_indexes. The table list is a fixed
 * constant — never user input — so the IN (...) interpolation is safe.
 */
import { query } from '../db.js';

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  isPrimaryKey: boolean;
}

export interface ForeignKeyInfo {
  name: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
  onDelete: string;
}

export interface UniqueInfo {
  name: string;
  columns: string[];
}

export interface CheckInfo {
  name: string;
  definition: string;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface TableSchema {
  name: string;
  columns: ColumnInfo[];
  primaryKey: string[];
  foreignKeys: ForeignKeyInfo[];
  uniques: UniqueInfo[];
  checks: CheckInfo[];
  indexes: IndexInfo[];
}

export interface DatabaseSchema {
  tables: TableSchema[];
}

/** Fixed introspection scope — not user input. */
const TABLES = ['users', 'user_profiles', 'courses', 'enrollments'] as const;
const IN_LIST = TABLES.map((t) => `'${t}'`).join(', ');

interface ColumnRow {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

interface KeyRow {
  name: string;
  table_name: string;
  columns: string[];
}

interface ForeignKeyRow extends KeyRow {
  ref_table: string;
  ref_columns: string[];
  on_delete: string;
}

interface CheckRow {
  name: string;
  table_name: string;
  definition: string;
}

interface IndexRow {
  table_name: string;
  index_name: string;
  is_unique: boolean;
  definition: string;
}

function prettyType(dataType: string): string {
  switch (dataType) {
    case 'timestamp with time zone':
      return 'timestamptz';
    case 'timestamp without time zone':
      return 'timestamp';
    case 'character varying':
      return 'varchar';
    case 'integer':
      return 'int';
    default:
      return dataType;
  }
}

/** Extract the column list from a pg_get_indexdef() definition string. */
function parseIndexColumns(indexdef: string): string[] {
  const match = indexdef.match(/\((.*)\)\s*$/);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

export async function getSchema(): Promise<DatabaseSchema> {
  const [columnsRes, pkRes, fkRes, uniqueRes, checkRes, indexRes] = await Promise.all([
    query<ColumnRow>(
      `SELECT table_name, column_name, data_type, is_nullable, column_default ` +
        `FROM information_schema.columns ` +
        `WHERE table_schema = 'public' AND table_name IN (${IN_LIST}) ` +
        `ORDER BY table_name, ordinal_position`,
    ),
    query<KeyRow>(
      `SELECT con.conname AS name, cls.relname AS table_name, ` +
        `ARRAY_AGG(att.attname ORDER BY k.ord) AS columns ` +
        `FROM pg_constraint con ` +
        `JOIN pg_class cls ON cls.oid = con.conrelid ` +
        `JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace ` +
        `JOIN LATERAL generate_subscripts(con.conkey, 1) AS k(ord) ON true ` +
        `JOIN pg_attribute att ON att.attrelid = cls.oid AND att.attnum = con.conkey[k.ord] ` +
        `WHERE nsp.nspname = 'public' AND con.contype = 'p' AND cls.relname IN (${IN_LIST}) ` +
        `GROUP BY con.conname, cls.relname`,
    ),
    query<ForeignKeyRow>(
      `SELECT con.conname AS name, cls.relname AS table_name, ` +
        `ARRAY_AGG(att.attname ORDER BY k.ord) AS columns, ` +
        `fcls.relname AS ref_table, ` +
        `ARRAY_AGG(fatt.attname ORDER BY k.ord) AS ref_columns, ` +
        `CASE con.confdeltype ` +
        `WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' ` +
        `WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' ELSE 'UNKNOWN' END AS on_delete ` +
        `FROM pg_constraint con ` +
        `JOIN pg_class cls ON cls.oid = con.conrelid ` +
        `JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace ` +
        `JOIN pg_class fcls ON fcls.oid = con.confrelid ` +
        `JOIN LATERAL generate_subscripts(con.conkey, 1) AS k(ord) ON true ` +
        `JOIN pg_attribute att ON att.attrelid = cls.oid AND att.attnum = con.conkey[k.ord] ` +
        `JOIN pg_attribute fatt ON fatt.attrelid = fcls.oid AND fatt.attnum = con.confkey[k.ord] ` +
        `WHERE nsp.nspname = 'public' AND con.contype = 'f' AND cls.relname IN (${IN_LIST}) ` +
        `GROUP BY con.conname, cls.relname, fcls.relname, con.confdeltype ` +
        `ORDER BY cls.relname, con.conname`,
    ),
    query<KeyRow>(
      `SELECT con.conname AS name, cls.relname AS table_name, ` +
        `ARRAY_AGG(att.attname ORDER BY k.ord) AS columns ` +
        `FROM pg_constraint con ` +
        `JOIN pg_class cls ON cls.oid = con.conrelid ` +
        `JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace ` +
        `JOIN LATERAL generate_subscripts(con.conkey, 1) AS k(ord) ON true ` +
        `JOIN pg_attribute att ON att.attrelid = cls.oid AND att.attnum = con.conkey[k.ord] ` +
        `WHERE nsp.nspname = 'public' AND con.contype = 'u' AND cls.relname IN (${IN_LIST}) ` +
        `GROUP BY con.conname, cls.relname`,
    ),
    query<CheckRow>(
      `SELECT con.conname AS name, cls.relname AS table_name, ` +
        `pg_get_constraintdef(con.oid) AS definition ` +
        `FROM pg_constraint con ` +
        `JOIN pg_class cls ON cls.oid = con.conrelid ` +
        `JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace ` +
        `WHERE nsp.nspname = 'public' AND con.contype = 'c' AND cls.relname IN (${IN_LIST}) ` +
        `ORDER BY cls.relname, con.conname`,
    ),
    query<IndexRow>(
      `SELECT cls.relname AS table_name, icls.relname AS index_name, ` +
        `idx.indisunique AS is_unique, pg_get_indexdef(idx.indexrelid) AS definition ` +
        `FROM pg_index idx ` +
        `JOIN pg_class cls ON cls.oid = idx.indrelid ` +
        `JOIN pg_class icls ON icls.oid = idx.indexrelid ` +
        `JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace ` +
        `WHERE nsp.nspname = 'public' AND cls.relname IN (${IN_LIST}) ` +
        `ORDER BY cls.relname, icls.relname`,
    ),
  ]);

  const tables: TableSchema[] = TABLES.map((name) => {
    const pk = pkRes.rows.find((r) => r.table_name === name)?.columns ?? [];
    return {
      name,
      columns: columnsRes.rows
        .filter((c) => c.table_name === name)
        .map((c) => ({
          name: c.column_name,
          type: prettyType(c.data_type),
          nullable: c.is_nullable === 'YES',
          default: c.column_default,
          isPrimaryKey: pk.includes(c.column_name),
        })),
      primaryKey: pk,
      foreignKeys: fkRes.rows
        .filter((r) => r.table_name === name)
        .map((r) => ({
          name: r.name,
          columns: r.columns,
          refTable: r.ref_table,
          refColumns: r.ref_columns,
          onDelete: r.on_delete,
        })),
      uniques: uniqueRes.rows
        .filter((r) => r.table_name === name)
        .map((r) => ({ name: r.name, columns: r.columns })),
      checks: checkRes.rows
        .filter((r) => r.table_name === name)
        .map((r) => ({ name: r.name, definition: r.definition })),
      indexes: indexRes.rows
        .filter((r) => r.table_name === name)
        .map((r) => ({
          name: r.index_name,
          columns: parseIndexColumns(r.definition),
          unique: r.is_unique,
        })),
    };
  });

  return { tables };
}
