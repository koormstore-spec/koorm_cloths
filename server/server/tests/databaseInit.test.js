jest.mock('mysql2/promise', () => ({ createConnection: jest.fn() }));
const mysql = require('mysql2/promise');
const { initializeDatabase } = require('../config/databaseInit');

const tables = ['reviews', 'store_reviews'];
const columns = ['admin_reply', 'admin_reply_at'];

test.each([false, true])('upgrades review reply columns safely (already present: %s)', async present => {
  const existing = new Set(present ? tables.flatMap(table => columns.map(column => `${table}.${column}`)) : []);
  const connection = {
    query: jest.fn(async (sql, params) => {
      if (sql.includes('information_schema.columns')) {
        const isReplyColumn = tables.includes(params[0]) && columns.includes(params[1]);
        return [[{ columnCount: isReplyColumn ? Number(existing.has(params.join('.'))) : 1 }]];
      }
      const added = sql.match(/ALTER TABLE `(reviews|store_reviews)` ADD COLUMN `(admin_reply|admin_reply_at)`/);
      if (added) existing.add(`${added[1]}.${added[2]}`);
      return [[]];
    }),
    end: jest.fn(),
  };
  mysql.createConnection.mockResolvedValue(connection);
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  try {
    await initializeDatabase();
    const alterations = () => connection.query.mock.calls.filter(([sql]) => /ALTER TABLE `(reviews|store_reviews)` ADD COLUMN/.test(sql));
    expect(alterations()).toHaveLength(present ? 0 : 4);
    for (const table of tables) {
      for (const column of columns) expect(existing.has(`${table}.${column}`)).toBe(true);
    }
    // Restarting against the upgraded database must not try adding columns again.
    connection.query.mockClear();
    await initializeDatabase();
    expect(alterations()).toHaveLength(0);
    expect(connection.end).toHaveBeenCalledTimes(2);
  } finally {
    log.mockRestore();
  }
});
