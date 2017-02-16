const Emitter = require('events').EventEmitter;
const util = require('util');
const bunyan = require('bunyan');
const bformat = require('bunyan-format');
const DbClient = require('./dbClient');
const Model = require('./models');
const dbSeed = require('./seed.json');

const formatted = bformat({ outputMode: 'short', color: true });
const log = bunyan.createLogger({
  name: 'Service',
  level: process.env.LOG_LEVEL || 'info',
  stream: formatted,
  serializers: bunyan.stdSerializers
});


const Service = function (config) {
  Emitter.call(this);
  let self = this;
  let continueWith = null;

  const db = new DbClient(config);
  let Table, closedb = null;


  // Create a Bad Result
  let sendError = (error, message) => {
    const result = Model.Response({message: message});
    log.error(error, 'Service.sendError');

    if (continueWith) { continueWith(null, result); }
  };

  // Create an Okay Result
  let sendData = (data) => {
      const result = Model.Response({success: true, message: 'Success', data: data});
      log.debug(result, 'Service.sendData() received');

      if (continueWith) { continueWith(null, result); }
  };

  let listItem = function ({pageIndex = 0, pageSize = 50} = {}) {
    const message = 'DB List Failure';

    let pageResult = Model.PageResult();
    pageResult.currentPage = pageIndex;
    pageResult.pageSize = pageSize;

    let filter = {
      $limit: pageSize,
      $skip: (pageSize) * pageIndex || 0
    };

    //Math.ceil -- Always rounds up
    pageResult.pages = Math.ceil(pageResult.count / filter.$limit);

    Table.find(filter, {raw: true, allow_filtering: true}, function (err, rows) {
      if (err) return self.emit('send-error', err, message);

      pageResult.count = rows.length;
      for (const row of rows) {
          pageResult.list.push(Model.Item(row));
      }
      return self.emit('send-data', pageResult);
    });

  };

    // CREATE
  let createItem = function (args) {
      const message = 'DB Create Failure';
      let dto = Model.Item(args);
      if (dto.errors() !== null) return self.emit('send-error', dto.errors(), message);

      let row = new Table(dto);
      row.saveAsync()
      .then(() => self.emit('send-data'))
      .catch(err => self.emit('send-error', err, message));
  };

  let seedDB = (eventHandler, args) => {
    const message = 'DB Seed Failure';
    Table.findAsync({})
    .then((result) => {
      if (result.length > 0) return self.emit(eventHandler, args);
      log.debug('Service.openConnection()', 'Data Seeding Required');

      let count = 0;
      function raiseIfCompleted () {
        count++;
        if (count === dbSeed.length) return self.emit(eventHandler, args);
      }

      for (const o of dbSeed) {
        const item = new Model.Item(o);
        const model = new Table(item);
        log.trace('Service.seedData()', model.id);
        model.saveAsync()
        .then(raiseIfCompleted)
        .catch(err => self.emit('send-error', err, message));
      }
    }).catch(err => self.emit('send-error', err, message));
  };


  let openConnection = (eventHandler, args) => {
    const message = 'DB Connection Failure';
    log.debug('Service Connection Initiated');

    db.connect((err, db) => {
      if (err || db.instance.Item === undefined) return self.emit('send-error', err, message);
      closedb = db.close;
      Table = db.instance.Item;
      seedDB(eventHandler, args);
    });
  };

  /////////////////////////////////////////

  self.create = (input, done) => {
    log.debug({input: input}, 'Service.create()');
    continueWith = done;
    openConnection('create-item', input);
  };

  self.list = (input, done) => {
    log.debug({input: input}, 'Service.list()');
    continueWith = done;
    openConnection('list-item', input);
  };

  self.close = () => {
    log.debug('DB Connection Close', 'Service.close()');
    if (closedb) { closedb(); }
  };


  // Event Wireup
  self.on('send-data', sendData);
  self.on('send-error', sendError);
  self.on('create-item', createItem);
  self.on('list-item', listItem);

  return self;
};

util.inherits(Service, Emitter);
module.exports = Service;
