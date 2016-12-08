'use strict';

module.exports = fn => (...args) => fn(...args).catch(args[2]);
