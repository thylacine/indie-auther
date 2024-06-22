'use strict';

const assert = require('assert');
const th = require('../../../src/template/template-helper');

describe('Template Helper', function () {

  describe('escapeCSS', function () {
    it('allows valid', function () {
      const str = 'valid-identifier';
      const result = th.escapeCSS(str);
      assert.strictEqual(result, str);
    });
    it('escapes invalid', function () {
      const str = '(invalid*identifier)';
      const expected = '\\(invalid\\*identifier\\)';
      const result = th.escapeCSS(str);
      assert.strictEqual(result, expected);
    });
  }); // escapeCSS

  describe('scopeCompare', function () {
    let a, b;
    describe('empty app', function () {
      it('sorts by name, first lower', function () {
        a = ['scopeA', { application: '' }];
        b = ['scopeB', { application: '' }];
        const result = th.scopeCompare(a, b);
        assert.strictEqual(result, -1);
      });
      it('sorts by name, first higher', function () {
        a = ['scopeA', { application: '' }];
        b = ['scopeB', { application: '' }];
        const result = th.scopeCompare(b, a);
        assert.strictEqual(result, 1);
      });
      it('sorts by name, equal', function () {
        a = ['scopeA', { application: '' }];
        b = ['scopeA', { application: '' }];
        const result = th.scopeCompare(a, b);
        assert.strictEqual(result, 0);
      });
    });

    describe('equal app', function () {
      it('sorts by name, first lower', function () {
        a = ['scopeA', { application: 'app' }];
        b = ['scopeB', { application: 'app' }];
        const result = th.scopeCompare(a, b);
        assert.strictEqual(result, -1);
      });
      it('sorts by name, first higher', function () {
        a = ['scopeA', { application: 'app' }];
        b = ['scopeB', { application: 'app' }];
        const result = th.scopeCompare(b, a);
        assert.strictEqual(result, 1);
      });
      it('sorts by name, equal', function () {
        a = ['scopeA', { application: 'app' }];
        b = ['scopeA', { application: 'app' }];
        const result = th.scopeCompare(a, b);
        assert.strictEqual(result, 0);
      });
    });

    describe('different app', function () {
      it('sorts by app, first lower', function () {
        a = ['scopeA', { application: 'appA' }];
        b = ['scopeB', { application: 'appB' }];
        const result = th.scopeCompare(a, b);
        assert.strictEqual(result, -1);
      });
      it('sorts by app, first higher', function () {
        a = ['scopeA', { application: 'appA' }];
        b = ['scopeB', { application: 'appB' }];
        const result = th.scopeCompare(b, a);
        assert.strictEqual(result, 1);
      });
      it('sorts by app, empty first', function () {
        a = ['scopeA', { application: '' }];
        b = ['scopeB', { application: 'app' }];
        const result = th.scopeCompare(a, b);
        assert.strictEqual(result, -1);
      });
      it('sorts by app, empty last', function () {
        a = ['scopeA', { application: 'app' }];
        b = ['scopeB', { application: '' }];
        const result = th.scopeCompare(a, b);
        assert.strictEqual(result, 1);
      });
    });
  }); // scopeCompare

  describe('navLinks', function () {
    let pagePathLevel, ctx, options;
    beforeEach(function () {
      pagePathLevel = 1;
      ctx = {};
      options = {
        navLinks: [],
      };
    });
    it('populates navLinks', function () {
      th.navLinks(pagePathLevel, ctx, options);
      assert.strictEqual(options.navLinks.length, 2);
    });
    it('creates and populates navLinks', function () {
      delete options.navLinks;
      th.navLinks(pagePathLevel, ctx, options);
      assert.strictEqual(options.navLinks.length, 2);
    });
    it('populates navLink when on admin', function () {
      options.pageIdentifier = 'admin';
      th.navLinks(pagePathLevel, ctx, options);
      assert.strictEqual(options.navLinks.length, 1);
    });
    it('populates navLink when on ticketProffer', function () {
      options.pageIdentifier = 'ticketProffer';
      th.navLinks(pagePathLevel, ctx, options);
      assert.strictEqual(options.navLinks.length, 1);
    });
  }); // navLinks

}); // Template Helper
