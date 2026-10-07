import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

type Param = string | number | null;

class Statement {
  constructor(private db: DatabaseSync, private sql: string, private params: Param[] = []) {}

  bind(...params: Param[]): Statement {
    return new Statement(this.db, this.sql, params);
  }

  async all() {
    const results = this.db.prepare(this.sql).all(...this.params).map(r => ({ ...r }));
    return { success: true, results, meta: {} };
  }

  async first<T>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.params);
    return row ? ({ ...row } as T) : null;
  }

  async run() {
    const r = this.db.prepare(this.sql).run(...this.params);
    return { success: true, results: [], meta: { changes: Number(r.changes) } };
  }
}

export function createD1() {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('../../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(new URL(f, dir), 'utf8'));
  }
  return {
    raw: db,
    prepare: (sql: string) => new Statement(db, sql),
    batch: async (stmts: Statement[]) => {
      const out = [];
      for (const s of stmts) out.push(await s.run());
      return out;
    },
  };
}
