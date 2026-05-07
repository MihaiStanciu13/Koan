// WeakRef polyfill for Hermes — must run before any library code.
if (typeof WeakRef === 'undefined') {
  global.WeakRef = class WeakRef {
    constructor(target) { this._target = target; }
    deref() { return this._target; }
  };
}

require('expo-router/entry');
