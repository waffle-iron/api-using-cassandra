const test = require('tape');

const config = require('./config');
const DbClient = require('../lib/DbClient');
const Service = require('../lib/service');
const Item = require('../lib/models').Item;

const client = new DbClient(config);
const service = new Service(config);

const before = test;
const after = test;
let Database;

before('before', function (assert) {
  client.connect((err, db) => {
    const dropTable = 'truncate test.Item;';
    db.instance.Item.execute_query(dropTable, null, (err) => {
      Database = db;
      assert.ok(err === null, 'No Service Error');
      assert.end();
    });
  });
});

test('creates an item and returns it', assert => {
  const obj = {
    'name': 'Test 1',
    'description': 'UNITTEST',
    'active': true,
    'list': [
      'something',
      'else'
    ]
  };

  const item = new Item(obj);
  service.create(item, (err, result) => {
    assert.ok(err === null, 'No Service Error');
    assert.ok(result.success, 'Should be success');
    assert.same('Success', result.message, 'Message should be success');
    assert.end();
  });
});

test('list all items', assert => {
  service.list({}, (err, result) => {
    assert.ok(err === null, 'No Service Error');
    assert.ok(result.success, 'Result Should be success');
    assert.same('Success', result.message, 'Message should say Success');
    assert.same(result.data.count, result.data.list.length, 'Count should be valid');
    assert.end();
  });
});

after('after', (assert) => {
  Database.close();
  assert.end();
  process.exit(0);
});
