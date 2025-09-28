import { suite } from 'uvu';
import * as assert from 'uvu/assert';
import navaid from '../src/index.js';

global.history = {};

const API = suite('exports');

API('exports', () => {
    assert.type(navaid, 'function', 'exports a function');
});

API('new Navaid()', () => {
    let foo = new navaid();
    assert.type(foo.route, 'function');
    assert.type(foo.format, 'function');
    assert.type(foo.listen, 'function');
});

API('Navaid()', () => {
    let bar = navaid();
    assert.type(bar.route, 'function');
    assert.type(bar.format, 'function');
    assert.type(bar.listen, 'function');
});

API.run();

// ---

const format = suite('$.format');

format('empty base', () => {
	let foo = navaid();
	assert.is(foo.format(''), '');
	assert.is(foo.format('/'), '/');
	assert.is(foo.format('foo/bar/'), '/foo/bar');
	assert.is(foo.format('foo/bar'), '/foo/bar');
	assert.is(foo.format('/foobar'), '/foobar');
	assert.is(foo.format('foobar'), '/foobar');
});

format('base with leading slash', () => {
	let bar = navaid([], { base: '/hello' });
	assert.is(bar.format('/hello/world'), '/world');
	assert.is(bar.format('hello/world'), '/world');
	assert.is(bar.format('/world'), false);
	assert.is(bar.format('/hello/'), '/');
	assert.is(bar.format('hello/'), '/');
	assert.is(bar.format('/hello'), '/');
	assert.is(bar.format('hello'), '/');
});

format('base without leading slash', () => {
	let baz = new navaid([], { base: 'hello' });
	assert.is(baz.format('/hello/world'), '/world');
	assert.is(baz.format('hello/world'), '/world');
	assert.is(baz.format('/hello.123'), false);
	assert.is(baz.format('/world'), false);
	assert.is(baz.format('/hello/'), '/');
	assert.is(baz.format('hello/'), '/');
	assert.is(baz.format('/hello'), '/');
	assert.is(baz.format('hello'), '/');
});

format('base with trailing slash', () => {
	let bat = navaid([], { base: 'hello/' });
	assert.is(bat.format('/hello/world'), '/world');
	assert.is(bat.format('hello/world'), '/world');
	assert.is(bat.format('/hello.123'), false);
	assert.is(bat.format('/world'), false);
	assert.is(bat.format('/hello/'), '/');
	assert.is(bat.format('hello/'), '/');
	assert.is(bat.format('/hello'), '/');
	assert.is(bat.format('hello'), '/');
});

format('base with leading and trailing slash', () => {
	let quz = new navaid([], { base: '/hello/' });
	assert.is(quz.format('/hello/world'), '/world');
	assert.is(quz.format('hello/world'), '/world');
	assert.is(quz.format('/hello.123'), false);
	assert.is(quz.format('/world'), false);
	assert.is(quz.format('/hello/'), '/');
	assert.is(quz.format('hello/'), '/');
	assert.is(quz.format('/hello'), '/');
	assert.is(quz.format('hello'), '/');
});

format('base = "/" only', () => {
	let qut = navaid([], { base: '/' });
	assert.is(qut.format('/hello/world'), '/hello/world');
	assert.is(qut.format('hello/world'), '/hello/world');
	assert.is(qut.format('/world'), '/world');
	assert.is(qut.format('/'), '/');
});

format('base with nested path', () => {
	let qar = new navaid([], { base: '/hello/there' });
	assert.is(qar.format('hello/there/world/'), '/world');
	assert.is(qar.format('/hello/there/world/'), '/world');
	assert.is(qar.format('/hello/there/world?foo=bar'), '/world?foo=bar');
	assert.is(qar.format('/hello/there'), '/');
	assert.is(qar.format('hello/there'), '/');
	assert.is(qar.format('/world'), false);
	assert.is(qar.format('/'), false);
});

format.run();

// ---

//

const route = suite('$.route');

route('$.route history interactions', () => {
    let pushes = [], replaces = [];
    history.pushState = uri => pushes.push(uri);
    history.replaceState = uri => replaces.push(uri);

    let ctx = navaid([
        ['/foo'],
        ['/bar'],
    ]);

    // Fresh route pushes
    ctx.route('/foo');
    assert.is(pushes.length, 1, '~> pushState("/foo")');
    assert.is(replaces.length, 0, '~> no replaceState calls');

    // Without an exposed $.run to update current state, a repeat still pushes
    ctx.route('/foo');
    assert.is(pushes.length, 2, '~> pushState("/foo") again');
    assert.is(replaces.length, 0, '~> still no replaceState calls');

    // Explicit replace flag uses replaceState
    ctx.route('/bar', true);
    assert.is(replaces.length, 1, '~> replaceState("/bar") with explicit flag');
});

route.run();

// ---

const match = suite('$.match');

match('returns null when no route matches', () => {
    const ctx = navaid([
        ['/'],
        ['users/:name'],
    ]);
    const res = ctx.match('/nope');
    assert.is(res, null);
});

match('string patterns with named params', () => {
    const ctx = navaid([
        ['users/:name'],
        ['/foo/books/:genre/:title?'],
    ]);

    let r1 = ctx.match('/users/Bob');
    assert.ok(r1, 'matched users route');
    assert.is(r1.route[0], 'users/:name');
    assert.equal(r1.params, { name: 'Bob' });

    let r2 = ctx.match('/foo/books/kids/narnia');
    assert.ok(r2, 'matched books route');
    assert.is(r2.route[0], '/foo/books/:genre/:title?');
    assert.equal(r2.params, { genre: 'kids', title: 'narnia' });
});

match('wildcard captures as "*"', () => {
    const ctx = navaid([
        ['foo/bar/*'],
    ]);
    let res = ctx.match('/foo/bar/baz/bat');
    assert.ok(res, 'matched wildcard route');
    assert.is(res.route[0], 'foo/bar/*');
    assert.equal(res.params, { ['*']: 'baz/bat' });
});

match('RegExp routes with named groups', () => {
    const ctx = navaid([
        [/^\/articles\/(?<year>[0-9]{4})$/],
    ]);
    let res = ctx.match('/articles/2024');
    assert.ok(res, 'matched regex route');
    assert.ok(res.route[0] instanceof RegExp, 'route source is RegExp');
    assert.equal(res.params, { year: '2024' });
});

match('RegExp alternation without named groups', () => {
    const ctx = navaid([
        [/about\/(contact|team)/],
    ]);
    let a = ctx.match('/about/contact');
    let b = ctx.match('/about/team');
    assert.ok(a && b, 'matched both alternation variants');
    assert.is(Object.keys(a.params).length, 0, 'no params for unnamed groups');
});

match('use with base via $.format', () => {
    const ctx = navaid([
        ['/'],
        ['users/:name'],
    ], { base: '/hello/world' });

    let formatted = ctx.format('/hello/world/users/Ada');
    assert.is(formatted, '/users/Ada');
    let res = ctx.match(formatted);
    assert.ok(res, 'matched after formatting');
    assert.equal(res.params, { name: 'Ada' });
});

match.run();
