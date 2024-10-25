
(function(l, r) { if (!l || l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (self.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(self.document);
var app = (function () {
    'use strict';

    function noop$1() { }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    let src_url_equal_anchor;
    function src_url_equal(element_src, url) {
        if (!src_url_equal_anchor) {
            src_url_equal_anchor = document.createElement('a');
        }
        src_url_equal_anchor.href = url;
        return element_src === src_url_equal_anchor.href;
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function validate_store(store, name) {
        if (store != null && typeof store.subscribe !== 'function') {
            throw new Error(`'${name}' is not a store with a 'subscribe' method`);
        }
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop$1;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function get_store_value(store) {
        let value;
        subscribe(store, _ => value = _)();
        return value;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function set_store_value(store, ret, value) {
        store.set(value);
        return ret;
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);
    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function to_number(value) {
        return value === '' ? null : +value;
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    function set_style(node, key, value, important) {
        if (value == null) {
            node.style.removeProperty(key);
        }
        else {
            node.style.setProperty(key, value, important ? 'important' : '');
        }
    }
    function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, bubbles, cancelable, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    /**
     * The `onMount` function schedules a callback to run as soon as the component has been mounted to the DOM.
     * It must be called during the component's initialisation (but doesn't need to live *inside* the component;
     * it can be called from an external module).
     *
     * `onMount` does not run inside a [server-side component](/docs#run-time-server-side-component-api).
     *
     * https://svelte.dev/docs#run-time-svelte-onmount
     */
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    /**
     * Schedules a callback to run immediately before the component is unmounted.
     *
     * Out of `onMount`, `beforeUpdate`, `afterUpdate` and `onDestroy`, this is the
     * only one that runs inside a server-side component.
     *
     * https://svelte.dev/docs#run-time-svelte-ondestroy
     */
    function onDestroy(fn) {
        get_current_component().$$.on_destroy.push(fn);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    let render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = /* @__PURE__ */ Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        // Do not reenter flush while dirty components are updated, as this can
        // result in an infinite loop. Instead, let the inner flush handle it.
        // Reentrancy is ok afterwards for bindings etc.
        if (flushidx !== 0) {
            return;
        }
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            try {
                while (flushidx < dirty_components.length) {
                    const component = dirty_components[flushidx];
                    flushidx++;
                    set_current_component(component);
                    update(component.$$);
                }
            }
            catch (e) {
                // reset dirty state to not end up in a deadlocked state and then rethrow
                dirty_components.length = 0;
                flushidx = 0;
                throw e;
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    /**
     * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
     */
    function flush_render_callbacks(fns) {
        const filtered = [];
        const targets = [];
        render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
        targets.forEach((c) => c());
        render_callbacks = filtered;
    }
    const outroing = new Set();
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
                // if the component was destroyed immediately
                // it will update the `$$.on_destroy` reference to `null`.
                // the destructured on_destroy may still reference to the old array
                if (component.$$.on_destroy) {
                    component.$$.on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            flush_render_callbacks($$.after_update);
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: [],
            // state
            props,
            update: noop$1,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop$1;
        }
        $on(type, callback) {
            if (!is_function(callback)) {
                return noop$1;
            }
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.59.2' }, detail), { bubbles: true }));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation, has_stop_immediate_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        if (has_stop_immediate_propagation)
            modifiers.push('stopImmediatePropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function prop_dev(node, property, value) {
        node[property] = value;
        dispatch_dev('SvelteDOMSetProperty', { node, property, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.data === data)
            return;
        dispatch_dev('SvelteDOMSetData', { node: text, data });
        text.data = data;
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    const subscriber_queue = [];
    /**
     * Creates a `Readable` store that allows reading by subscription.
     * @param value initial value
     * @param {StartStopNotifier} [start]
     */
    function readable(value, start) {
        return {
            subscribe: writable(value, start).subscribe
        };
    }
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=} start
     */
    function writable(value, start = noop$1) {
        let stop;
        const subscribers = new Set();
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (const subscriber of subscribers) {
                        subscriber[1]();
                        subscriber_queue.push(subscriber, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop$1) {
            const subscriber = [run, invalidate];
            subscribers.add(subscriber);
            if (subscribers.size === 1) {
                stop = start(set) || noop$1;
            }
            run(value);
            return () => {
                subscribers.delete(subscriber);
                if (subscribers.size === 0 && stop) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }
    function derived(stores, fn, initial_value) {
        const single = !Array.isArray(stores);
        const stores_array = single
            ? [stores]
            : stores;
        const auto = fn.length < 2;
        return readable(initial_value, (set) => {
            let started = false;
            const values = [];
            let pending = 0;
            let cleanup = noop$1;
            const sync = () => {
                if (pending) {
                    return;
                }
                cleanup();
                const result = fn(single ? values[0] : values, set);
                if (auto) {
                    set(result);
                }
                else {
                    cleanup = is_function(result) ? result : noop$1;
                }
            };
            const unsubscribers = stores_array.map((store, i) => subscribe(store, (value) => {
                values[i] = value;
                pending &= ~(1 << i);
                if (started) {
                    sync();
                }
            }, () => {
                pending |= (1 << i);
            }));
            started = true;
            sync();
            return function stop() {
                run_all(unsubscribers);
                cleanup();
                // We need to set this to false because callbacks can still happen despite having unsubscribed:
                // Callbacks might already be placed in the queue which doesn't know it should no longer
                // invoke this derived store.
                started = false;
            };
        });
    }

    function number$2(n) {
        if (!Number.isSafeInteger(n) || n < 0)
            throw new Error(`Wrong positive integer: ${n}`);
    }
    function bytes$2(b, ...lengths) {
        if (!(b instanceof Uint8Array))
            throw new Error('Expected Uint8Array');
        if (lengths.length > 0 && !lengths.includes(b.length))
            throw new Error(`Expected Uint8Array of length ${lengths}, not of length=${b.length}`);
    }
    function hash$1(hash) {
        if (typeof hash !== 'function' || typeof hash.create !== 'function')
            throw new Error('Hash should be wrapped by utils.wrapConstructor');
        number$2(hash.outputLen);
        number$2(hash.blockLen);
    }
    function exists$1(instance, checkFinished = true) {
        if (instance.destroyed)
            throw new Error('Hash instance has been destroyed');
        if (checkFinished && instance.finished)
            throw new Error('Hash#digest() has already been called');
    }
    function output$1(out, instance) {
        bytes$2(out);
        const min = instance.outputLen;
        if (out.length < min) {
            throw new Error(`digestInto() expects output buffer of length at least ${min}`);
        }
    }

    const crypto$1 = typeof globalThis === 'object' && 'crypto' in globalThis ? globalThis.crypto : undefined;

    /*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    // We use WebCrypto aka globalThis.crypto, which exists in browsers and node.js 16+.
    // node.js versions earlier than v19 don't declare it in global scope.
    // For node.js, package.json#exports field mapping rewrites import
    // from `crypto` to `cryptoNode`, which imports native module.
    // Makes the utils un-importable in browsers without a bundler.
    // Once node.js 18 is deprecated, we can just drop the import.
    const u8a$2 = (a) => a instanceof Uint8Array;
    // Cast array to view
    const createView$1 = (arr) => new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
    // The rotate right (circular right shift) operation for uint32
    const rotr$1 = (word, shift) => (word << (32 - shift)) | (word >>> shift);
    // big-endian hardware is rare. Just in case someone still decides to run hashes:
    // early-throw an error because we don't support BE yet.
    const isLE$2 = new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44;
    if (!isLE$2)
        throw new Error('Non little-endian hardware is not supported');
    /**
     * @example utf8ToBytes('abc') // new Uint8Array([97, 98, 99])
     */
    function utf8ToBytes$2(str) {
        if (typeof str !== 'string')
            throw new Error(`utf8ToBytes expected string, got ${typeof str}`);
        return new Uint8Array(new TextEncoder().encode(str)); // https://bugzil.la/1681809
    }
    /**
     * Normalizes (non-hex) string or Uint8Array to Uint8Array.
     * Warning: when Uint8Array is passed, it would NOT get copied.
     * Keep in mind for future mutable operations.
     */
    function toBytes$1(data) {
        if (typeof data === 'string')
            data = utf8ToBytes$2(data);
        if (!u8a$2(data))
            throw new Error(`expected Uint8Array, got ${typeof data}`);
        return data;
    }
    /**
     * Copies several Uint8Arrays into one.
     */
    function concatBytes$2(...arrays) {
        const r = new Uint8Array(arrays.reduce((sum, a) => sum + a.length, 0));
        let pad = 0; // walk through each item, ensure they have proper type
        arrays.forEach((a) => {
            if (!u8a$2(a))
                throw new Error('Uint8Array expected');
            r.set(a, pad);
            pad += a.length;
        });
        return r;
    }
    // For runtime check if class implements interface
    let Hash$1 = class Hash {
        // Safe version that clones internal state
        clone() {
            return this._cloneInto();
        }
    };
    function wrapConstructor$1(hashCons) {
        const hashC = (msg) => hashCons().update(toBytes$1(msg)).digest();
        const tmp = hashCons();
        hashC.outputLen = tmp.outputLen;
        hashC.blockLen = tmp.blockLen;
        hashC.create = () => hashCons();
        return hashC;
    }
    /**
     * Secure PRNG. Uses `crypto.getRandomValues`, which defers to OS.
     */
    function randomBytes$1(bytesLength = 32) {
        if (crypto$1 && typeof crypto$1.getRandomValues === 'function') {
            return crypto$1.getRandomValues(new Uint8Array(bytesLength));
        }
        throw new Error('crypto.getRandomValues must be defined');
    }

    // Polyfill for Safari 14
    function setBigUint64$1(view, byteOffset, value, isLE) {
        if (typeof view.setBigUint64 === 'function')
            return view.setBigUint64(byteOffset, value, isLE);
        const _32n = BigInt(32);
        const _u32_max = BigInt(0xffffffff);
        const wh = Number((value >> _32n) & _u32_max);
        const wl = Number(value & _u32_max);
        const h = isLE ? 4 : 0;
        const l = isLE ? 0 : 4;
        view.setUint32(byteOffset + h, wh, isLE);
        view.setUint32(byteOffset + l, wl, isLE);
    }
    // Base SHA2 class (RFC 6234)
    let SHA2$1 = class SHA2 extends Hash$1 {
        constructor(blockLen, outputLen, padOffset, isLE) {
            super();
            this.blockLen = blockLen;
            this.outputLen = outputLen;
            this.padOffset = padOffset;
            this.isLE = isLE;
            this.finished = false;
            this.length = 0;
            this.pos = 0;
            this.destroyed = false;
            this.buffer = new Uint8Array(blockLen);
            this.view = createView$1(this.buffer);
        }
        update(data) {
            exists$1(this);
            const { view, buffer, blockLen } = this;
            data = toBytes$1(data);
            const len = data.length;
            for (let pos = 0; pos < len;) {
                const take = Math.min(blockLen - this.pos, len - pos);
                // Fast path: we have at least one block in input, cast it to view and process
                if (take === blockLen) {
                    const dataView = createView$1(data);
                    for (; blockLen <= len - pos; pos += blockLen)
                        this.process(dataView, pos);
                    continue;
                }
                buffer.set(data.subarray(pos, pos + take), this.pos);
                this.pos += take;
                pos += take;
                if (this.pos === blockLen) {
                    this.process(view, 0);
                    this.pos = 0;
                }
            }
            this.length += data.length;
            this.roundClean();
            return this;
        }
        digestInto(out) {
            exists$1(this);
            output$1(out, this);
            this.finished = true;
            // Padding
            // We can avoid allocation of buffer for padding completely if it
            // was previously not allocated here. But it won't change performance.
            const { buffer, view, blockLen, isLE } = this;
            let { pos } = this;
            // append the bit '1' to the message
            buffer[pos++] = 0b10000000;
            this.buffer.subarray(pos).fill(0);
            // we have less than padOffset left in buffer, so we cannot put length in current block, need process it and pad again
            if (this.padOffset > blockLen - pos) {
                this.process(view, 0);
                pos = 0;
            }
            // Pad until full block byte with zeros
            for (let i = pos; i < blockLen; i++)
                buffer[i] = 0;
            // Note: sha512 requires length to be 128bit integer, but length in JS will overflow before that
            // You need to write around 2 exabytes (u64_max / 8 / (1024**6)) for this to happen.
            // So we just write lowest 64 bits of that value.
            setBigUint64$1(view, blockLen - 8, BigInt(this.length * 8), isLE);
            this.process(view, 0);
            const oview = createView$1(out);
            const len = this.outputLen;
            // NOTE: we do division by 4 later, which should be fused in single op with modulo by JIT
            if (len % 4)
                throw new Error('_sha2: outputLen should be aligned to 32bit');
            const outLen = len / 4;
            const state = this.get();
            if (outLen > state.length)
                throw new Error('_sha2: outputLen bigger than state');
            for (let i = 0; i < outLen; i++)
                oview.setUint32(4 * i, state[i], isLE);
        }
        digest() {
            const { buffer, outputLen } = this;
            this.digestInto(buffer);
            const res = buffer.slice(0, outputLen);
            this.destroy();
            return res;
        }
        _cloneInto(to) {
            to || (to = new this.constructor());
            to.set(...this.get());
            const { blockLen, buffer, length, finished, destroyed, pos } = this;
            to.length = length;
            to.pos = pos;
            to.finished = finished;
            to.destroyed = destroyed;
            if (length % blockLen)
                to.buffer.set(buffer);
            return to;
        }
    };

    // SHA2-256 need to try 2^128 hashes to execute birthday attack.
    // BTC network is doing 2^67 hashes/sec as per early 2023.
    // Choice: a ? b : c
    const Chi$1 = (a, b, c) => (a & b) ^ (~a & c);
    // Majority function, true if any two inpust is true
    const Maj$1 = (a, b, c) => (a & b) ^ (a & c) ^ (b & c);
    // Round constants:
    // first 32 bits of the fractional parts of the cube roots of the first 64 primes 2..311)
    // prettier-ignore
    const SHA256_K$1 = /* @__PURE__ */ new Uint32Array([
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ]);
    // Initial state (first 32 bits of the fractional parts of the square roots of the first 8 primes 2..19):
    // prettier-ignore
    const IV$1 = /* @__PURE__ */ new Uint32Array([
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ]);
    // Temporary buffer, not used to store anything between runs
    // Named this way because it matches specification.
    const SHA256_W$1 = /* @__PURE__ */ new Uint32Array(64);
    let SHA256$1 = class SHA256 extends SHA2$1 {
        constructor() {
            super(64, 32, 8, false);
            // We cannot use array here since array allows indexing by variable
            // which means optimizer/compiler cannot use registers.
            this.A = IV$1[0] | 0;
            this.B = IV$1[1] | 0;
            this.C = IV$1[2] | 0;
            this.D = IV$1[3] | 0;
            this.E = IV$1[4] | 0;
            this.F = IV$1[5] | 0;
            this.G = IV$1[6] | 0;
            this.H = IV$1[7] | 0;
        }
        get() {
            const { A, B, C, D, E, F, G, H } = this;
            return [A, B, C, D, E, F, G, H];
        }
        // prettier-ignore
        set(A, B, C, D, E, F, G, H) {
            this.A = A | 0;
            this.B = B | 0;
            this.C = C | 0;
            this.D = D | 0;
            this.E = E | 0;
            this.F = F | 0;
            this.G = G | 0;
            this.H = H | 0;
        }
        process(view, offset) {
            // Extend the first 16 words into the remaining 48 words w[16..63] of the message schedule array
            for (let i = 0; i < 16; i++, offset += 4)
                SHA256_W$1[i] = view.getUint32(offset, false);
            for (let i = 16; i < 64; i++) {
                const W15 = SHA256_W$1[i - 15];
                const W2 = SHA256_W$1[i - 2];
                const s0 = rotr$1(W15, 7) ^ rotr$1(W15, 18) ^ (W15 >>> 3);
                const s1 = rotr$1(W2, 17) ^ rotr$1(W2, 19) ^ (W2 >>> 10);
                SHA256_W$1[i] = (s1 + SHA256_W$1[i - 7] + s0 + SHA256_W$1[i - 16]) | 0;
            }
            // Compression function main loop, 64 rounds
            let { A, B, C, D, E, F, G, H } = this;
            for (let i = 0; i < 64; i++) {
                const sigma1 = rotr$1(E, 6) ^ rotr$1(E, 11) ^ rotr$1(E, 25);
                const T1 = (H + sigma1 + Chi$1(E, F, G) + SHA256_K$1[i] + SHA256_W$1[i]) | 0;
                const sigma0 = rotr$1(A, 2) ^ rotr$1(A, 13) ^ rotr$1(A, 22);
                const T2 = (sigma0 + Maj$1(A, B, C)) | 0;
                H = G;
                G = F;
                F = E;
                E = (D + T1) | 0;
                D = C;
                C = B;
                B = A;
                A = (T1 + T2) | 0;
            }
            // Add the compressed chunk to the current hash value
            A = (A + this.A) | 0;
            B = (B + this.B) | 0;
            C = (C + this.C) | 0;
            D = (D + this.D) | 0;
            E = (E + this.E) | 0;
            F = (F + this.F) | 0;
            G = (G + this.G) | 0;
            H = (H + this.H) | 0;
            this.set(A, B, C, D, E, F, G, H);
        }
        roundClean() {
            SHA256_W$1.fill(0);
        }
        destroy() {
            this.set(0, 0, 0, 0, 0, 0, 0, 0);
            this.buffer.fill(0);
        }
    };
    /**
     * SHA2-256 hash function
     * @param message - data that would be hashed
     */
    const sha256$1 = /* @__PURE__ */ wrapConstructor$1(() => new SHA256$1());

    /*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    // 100 lines of code in the file are duplicated from noble-hashes (utils).
    // This is OK: `abstract` directory does not use noble-hashes.
    // User may opt-in into using different hashing library. This way, noble-hashes
    // won't be included into their bundle.
    const _0n$4 = BigInt(0);
    const _1n$4 = BigInt(1);
    const _2n$2 = BigInt(2);
    const u8a$1 = (a) => a instanceof Uint8Array;
    const hexes$1 = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
    /**
     * @example bytesToHex(Uint8Array.from([0xca, 0xfe, 0x01, 0x23])) // 'cafe0123'
     */
    function bytesToHex$1(bytes) {
        if (!u8a$1(bytes))
            throw new Error('Uint8Array expected');
        // pre-caching improves the speed 6x
        let hex = '';
        for (let i = 0; i < bytes.length; i++) {
            hex += hexes$1[bytes[i]];
        }
        return hex;
    }
    function numberToHexUnpadded(num) {
        const hex = num.toString(16);
        return hex.length & 1 ? `0${hex}` : hex;
    }
    function hexToNumber(hex) {
        if (typeof hex !== 'string')
            throw new Error('hex string expected, got ' + typeof hex);
        // Big Endian
        return BigInt(hex === '' ? '0' : `0x${hex}`);
    }
    /**
     * @example hexToBytes('cafe0123') // Uint8Array.from([0xca, 0xfe, 0x01, 0x23])
     */
    function hexToBytes$1(hex) {
        if (typeof hex !== 'string')
            throw new Error('hex string expected, got ' + typeof hex);
        const len = hex.length;
        if (len % 2)
            throw new Error('padded hex string expected, got unpadded hex of length ' + len);
        const array = new Uint8Array(len / 2);
        for (let i = 0; i < array.length; i++) {
            const j = i * 2;
            const hexByte = hex.slice(j, j + 2);
            const byte = Number.parseInt(hexByte, 16);
            if (Number.isNaN(byte) || byte < 0)
                throw new Error('Invalid byte sequence');
            array[i] = byte;
        }
        return array;
    }
    // BE: Big Endian, LE: Little Endian
    function bytesToNumberBE(bytes) {
        return hexToNumber(bytesToHex$1(bytes));
    }
    function bytesToNumberLE(bytes) {
        if (!u8a$1(bytes))
            throw new Error('Uint8Array expected');
        return hexToNumber(bytesToHex$1(Uint8Array.from(bytes).reverse()));
    }
    function numberToBytesBE(n, len) {
        return hexToBytes$1(n.toString(16).padStart(len * 2, '0'));
    }
    function numberToBytesLE(n, len) {
        return numberToBytesBE(n, len).reverse();
    }
    // Unpadded, rarely used
    function numberToVarBytesBE(n) {
        return hexToBytes$1(numberToHexUnpadded(n));
    }
    /**
     * Takes hex string or Uint8Array, converts to Uint8Array.
     * Validates output length.
     * Will throw error for other types.
     * @param title descriptive title for an error e.g. 'private key'
     * @param hex hex string or Uint8Array
     * @param expectedLength optional, will compare to result array's length
     * @returns
     */
    function ensureBytes(title, hex, expectedLength) {
        let res;
        if (typeof hex === 'string') {
            try {
                res = hexToBytes$1(hex);
            }
            catch (e) {
                throw new Error(`${title} must be valid hex string, got "${hex}". Cause: ${e}`);
            }
        }
        else if (u8a$1(hex)) {
            // Uint8Array.from() instead of hash.slice() because node.js Buffer
            // is instance of Uint8Array, and its slice() creates **mutable** copy
            res = Uint8Array.from(hex);
        }
        else {
            throw new Error(`${title} must be hex string or Uint8Array`);
        }
        const len = res.length;
        if (typeof expectedLength === 'number' && len !== expectedLength)
            throw new Error(`${title} expected ${expectedLength} bytes, got ${len}`);
        return res;
    }
    /**
     * Copies several Uint8Arrays into one.
     */
    function concatBytes$1(...arrays) {
        const r = new Uint8Array(arrays.reduce((sum, a) => sum + a.length, 0));
        let pad = 0; // walk through each item, ensure they have proper type
        arrays.forEach((a) => {
            if (!u8a$1(a))
                throw new Error('Uint8Array expected');
            r.set(a, pad);
            pad += a.length;
        });
        return r;
    }
    function equalBytes$1(b1, b2) {
        // We don't care about timing attacks here
        if (b1.length !== b2.length)
            return false;
        for (let i = 0; i < b1.length; i++)
            if (b1[i] !== b2[i])
                return false;
        return true;
    }
    /**
     * @example utf8ToBytes('abc') // new Uint8Array([97, 98, 99])
     */
    function utf8ToBytes$1(str) {
        if (typeof str !== 'string')
            throw new Error(`utf8ToBytes expected string, got ${typeof str}`);
        return new Uint8Array(new TextEncoder().encode(str)); // https://bugzil.la/1681809
    }
    // Bit operations
    /**
     * Calculates amount of bits in a bigint.
     * Same as `n.toString(2).length`
     */
    function bitLen(n) {
        let len;
        for (len = 0; n > _0n$4; n >>= _1n$4, len += 1)
            ;
        return len;
    }
    /**
     * Gets single bit at position.
     * NOTE: first bit position is 0 (same as arrays)
     * Same as `!!+Array.from(n.toString(2)).reverse()[pos]`
     */
    function bitGet(n, pos) {
        return (n >> BigInt(pos)) & _1n$4;
    }
    /**
     * Sets single bit at position.
     */
    const bitSet = (n, pos, value) => {
        return n | ((value ? _1n$4 : _0n$4) << BigInt(pos));
    };
    /**
     * Calculate mask for N bits. Not using ** operator with bigints because of old engines.
     * Same as BigInt(`0b${Array(i).fill('1').join('')}`)
     */
    const bitMask = (n) => (_2n$2 << BigInt(n - 1)) - _1n$4;
    // DRBG
    const u8n = (data) => new Uint8Array(data); // creates Uint8Array
    const u8fr = (arr) => Uint8Array.from(arr); // another shortcut
    /**
     * Minimal HMAC-DRBG from NIST 800-90 for RFC6979 sigs.
     * @returns function that will call DRBG until 2nd arg returns something meaningful
     * @example
     *   const drbg = createHmacDRBG<Key>(32, 32, hmac);
     *   drbg(seed, bytesToKey); // bytesToKey must return Key or undefined
     */
    function createHmacDrbg(hashLen, qByteLen, hmacFn) {
        if (typeof hashLen !== 'number' || hashLen < 2)
            throw new Error('hashLen must be a number');
        if (typeof qByteLen !== 'number' || qByteLen < 2)
            throw new Error('qByteLen must be a number');
        if (typeof hmacFn !== 'function')
            throw new Error('hmacFn must be a function');
        // Step B, Step C: set hashLen to 8*ceil(hlen/8)
        let v = u8n(hashLen); // Minimal non-full-spec HMAC-DRBG from NIST 800-90 for RFC6979 sigs.
        let k = u8n(hashLen); // Steps B and C of RFC6979 3.2: set hashLen, in our case always same
        let i = 0; // Iterations counter, will throw when over 1000
        const reset = () => {
            v.fill(1);
            k.fill(0);
            i = 0;
        };
        const h = (...b) => hmacFn(k, v, ...b); // hmac(k)(v, ...values)
        const reseed = (seed = u8n()) => {
            // HMAC-DRBG reseed() function. Steps D-G
            k = h(u8fr([0x00]), seed); // k = hmac(k || v || 0x00 || seed)
            v = h(); // v = hmac(k || v)
            if (seed.length === 0)
                return;
            k = h(u8fr([0x01]), seed); // k = hmac(k || v || 0x01 || seed)
            v = h(); // v = hmac(k || v)
        };
        const gen = () => {
            // HMAC-DRBG generate() function
            if (i++ >= 1000)
                throw new Error('drbg: tried 1000 values');
            let len = 0;
            const out = [];
            while (len < qByteLen) {
                v = h();
                const sl = v.slice();
                out.push(sl);
                len += v.length;
            }
            return concatBytes$1(...out);
        };
        const genUntil = (seed, pred) => {
            reset();
            reseed(seed); // Steps D-G
            let res = undefined; // Step H: grind until k is in [1..n-1]
            while (!(res = pred(gen())))
                reseed();
            reset();
            return res;
        };
        return genUntil;
    }
    // Validating curves and fields
    const validatorFns = {
        bigint: (val) => typeof val === 'bigint',
        function: (val) => typeof val === 'function',
        boolean: (val) => typeof val === 'boolean',
        string: (val) => typeof val === 'string',
        stringOrUint8Array: (val) => typeof val === 'string' || val instanceof Uint8Array,
        isSafeInteger: (val) => Number.isSafeInteger(val),
        array: (val) => Array.isArray(val),
        field: (val, object) => object.Fp.isValid(val),
        hash: (val) => typeof val === 'function' && Number.isSafeInteger(val.outputLen),
    };
    // type Record<K extends string | number | symbol, T> = { [P in K]: T; }
    function validateObject(object, validators, optValidators = {}) {
        const checkField = (fieldName, type, isOptional) => {
            const checkVal = validatorFns[type];
            if (typeof checkVal !== 'function')
                throw new Error(`Invalid validator "${type}", expected function`);
            const val = object[fieldName];
            if (isOptional && val === undefined)
                return;
            if (!checkVal(val, object)) {
                throw new Error(`Invalid param ${String(fieldName)}=${val} (${typeof val}), expected ${type}`);
            }
        };
        for (const [fieldName, type] of Object.entries(validators))
            checkField(fieldName, type, false);
        for (const [fieldName, type] of Object.entries(optValidators))
            checkField(fieldName, type, true);
        return object;
    }
    // validate type tests
    // const o: { a: number; b: number; c: number } = { a: 1, b: 5, c: 6 };
    // const z0 = validateObject(o, { a: 'isSafeInteger' }, { c: 'bigint' }); // Ok!
    // // Should fail type-check
    // const z1 = validateObject(o, { a: 'tmp' }, { c: 'zz' });
    // const z2 = validateObject(o, { a: 'isSafeInteger' }, { c: 'zz' });
    // const z3 = validateObject(o, { test: 'boolean', z: 'bug' });
    // const z4 = validateObject(o, { a: 'boolean', z: 'bug' });

    var ut = /*#__PURE__*/Object.freeze({
        __proto__: null,
        bitGet: bitGet,
        bitLen: bitLen,
        bitMask: bitMask,
        bitSet: bitSet,
        bytesToHex: bytesToHex$1,
        bytesToNumberBE: bytesToNumberBE,
        bytesToNumberLE: bytesToNumberLE,
        concatBytes: concatBytes$1,
        createHmacDrbg: createHmacDrbg,
        ensureBytes: ensureBytes,
        equalBytes: equalBytes$1,
        hexToBytes: hexToBytes$1,
        hexToNumber: hexToNumber,
        numberToBytesBE: numberToBytesBE,
        numberToBytesLE: numberToBytesLE,
        numberToHexUnpadded: numberToHexUnpadded,
        numberToVarBytesBE: numberToVarBytesBE,
        utf8ToBytes: utf8ToBytes$1,
        validateObject: validateObject
    });

    /*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    // Utilities for modular arithmetics and finite fields
    // prettier-ignore
    const _0n$3 = BigInt(0), _1n$3 = BigInt(1), _2n$1 = BigInt(2), _3n$1 = BigInt(3);
    // prettier-ignore
    const _4n = BigInt(4), _5n = BigInt(5), _8n = BigInt(8);
    // prettier-ignore
    BigInt(9); BigInt(16);
    // Calculates a modulo b
    function mod(a, b) {
        const result = a % b;
        return result >= _0n$3 ? result : b + result;
    }
    /**
     * Efficiently raise num to power and do modular division.
     * Unsafe in some contexts: uses ladder, so can expose bigint bits.
     * @example
     * pow(2n, 6n, 11n) // 64n % 11n == 9n
     */
    // TODO: use field version && remove
    function pow(num, power, modulo) {
        if (modulo <= _0n$3 || power < _0n$3)
            throw new Error('Expected power/modulo > 0');
        if (modulo === _1n$3)
            return _0n$3;
        let res = _1n$3;
        while (power > _0n$3) {
            if (power & _1n$3)
                res = (res * num) % modulo;
            num = (num * num) % modulo;
            power >>= _1n$3;
        }
        return res;
    }
    // Does x ^ (2 ^ power) mod p. pow2(30, 4) == 30 ^ (2 ^ 4)
    function pow2(x, power, modulo) {
        let res = x;
        while (power-- > _0n$3) {
            res *= res;
            res %= modulo;
        }
        return res;
    }
    // Inverses number over modulo
    function invert(number, modulo) {
        if (number === _0n$3 || modulo <= _0n$3) {
            throw new Error(`invert: expected positive integers, got n=${number} mod=${modulo}`);
        }
        // Euclidean GCD https://brilliant.org/wiki/extended-euclidean-algorithm/
        // Fermat's little theorem "CT-like" version inv(n) = n^(m-2) mod m is 30x slower.
        let a = mod(number, modulo);
        let b = modulo;
        // prettier-ignore
        let x = _0n$3, u = _1n$3;
        while (a !== _0n$3) {
            // JIT applies optimization if those two lines follow each other
            const q = b / a;
            const r = b % a;
            const m = x - u * q;
            // prettier-ignore
            b = a, a = r, x = u, u = m;
        }
        const gcd = b;
        if (gcd !== _1n$3)
            throw new Error('invert: does not exist');
        return mod(x, modulo);
    }
    /**
     * Tonelli-Shanks square root search algorithm.
     * 1. https://eprint.iacr.org/2012/685.pdf (page 12)
     * 2. Square Roots from 1; 24, 51, 10 to Dan Shanks
     * Will start an infinite loop if field order P is not prime.
     * @param P field order
     * @returns function that takes field Fp (created from P) and number n
     */
    function tonelliShanks(P) {
        // Legendre constant: used to calculate Legendre symbol (a | p),
        // which denotes the value of a^((p-1)/2) (mod p).
        // (a | p) ≡ 1    if a is a square (mod p)
        // (a | p) ≡ -1   if a is not a square (mod p)
        // (a | p) ≡ 0    if a ≡ 0 (mod p)
        const legendreC = (P - _1n$3) / _2n$1;
        let Q, S, Z;
        // Step 1: By factoring out powers of 2 from p - 1,
        // find q and s such that p - 1 = q*(2^s) with q odd
        for (Q = P - _1n$3, S = 0; Q % _2n$1 === _0n$3; Q /= _2n$1, S++)
            ;
        // Step 2: Select a non-square z such that (z | p) ≡ -1 and set c ≡ zq
        for (Z = _2n$1; Z < P && pow(Z, legendreC, P) !== P - _1n$3; Z++)
            ;
        // Fast-path
        if (S === 1) {
            const p1div4 = (P + _1n$3) / _4n;
            return function tonelliFast(Fp, n) {
                const root = Fp.pow(n, p1div4);
                if (!Fp.eql(Fp.sqr(root), n))
                    throw new Error('Cannot find square root');
                return root;
            };
        }
        // Slow-path
        const Q1div2 = (Q + _1n$3) / _2n$1;
        return function tonelliSlow(Fp, n) {
            // Step 0: Check that n is indeed a square: (n | p) should not be ≡ -1
            if (Fp.pow(n, legendreC) === Fp.neg(Fp.ONE))
                throw new Error('Cannot find square root');
            let r = S;
            // TODO: will fail at Fp2/etc
            let g = Fp.pow(Fp.mul(Fp.ONE, Z), Q); // will update both x and b
            let x = Fp.pow(n, Q1div2); // first guess at the square root
            let b = Fp.pow(n, Q); // first guess at the fudge factor
            while (!Fp.eql(b, Fp.ONE)) {
                if (Fp.eql(b, Fp.ZERO))
                    return Fp.ZERO; // https://en.wikipedia.org/wiki/Tonelli%E2%80%93Shanks_algorithm (4. If t = 0, return r = 0)
                // Find m such b^(2^m)==1
                let m = 1;
                for (let t2 = Fp.sqr(b); m < r; m++) {
                    if (Fp.eql(t2, Fp.ONE))
                        break;
                    t2 = Fp.sqr(t2); // t2 *= t2
                }
                // NOTE: r-m-1 can be bigger than 32, need to convert to bigint before shift, otherwise there will be overflow
                const ge = Fp.pow(g, _1n$3 << BigInt(r - m - 1)); // ge = 2^(r-m-1)
                g = Fp.sqr(ge); // g = ge * ge
                x = Fp.mul(x, ge); // x *= ge
                b = Fp.mul(b, g); // b *= g
                r = m;
            }
            return x;
        };
    }
    function FpSqrt(P) {
        // NOTE: different algorithms can give different roots, it is up to user to decide which one they want.
        // For example there is FpSqrtOdd/FpSqrtEven to choice root based on oddness (used for hash-to-curve).
        // P ≡ 3 (mod 4)
        // √n = n^((P+1)/4)
        if (P % _4n === _3n$1) {
            // Not all roots possible!
            // const ORDER =
            //   0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaabn;
            // const NUM = 72057594037927816n;
            const p1div4 = (P + _1n$3) / _4n;
            return function sqrt3mod4(Fp, n) {
                const root = Fp.pow(n, p1div4);
                // Throw if root**2 != n
                if (!Fp.eql(Fp.sqr(root), n))
                    throw new Error('Cannot find square root');
                return root;
            };
        }
        // Atkin algorithm for q ≡ 5 (mod 8), https://eprint.iacr.org/2012/685.pdf (page 10)
        if (P % _8n === _5n) {
            const c1 = (P - _5n) / _8n;
            return function sqrt5mod8(Fp, n) {
                const n2 = Fp.mul(n, _2n$1);
                const v = Fp.pow(n2, c1);
                const nv = Fp.mul(n, v);
                const i = Fp.mul(Fp.mul(nv, _2n$1), v);
                const root = Fp.mul(nv, Fp.sub(i, Fp.ONE));
                if (!Fp.eql(Fp.sqr(root), n))
                    throw new Error('Cannot find square root');
                return root;
            };
        }
        // Other cases: Tonelli-Shanks algorithm
        return tonelliShanks(P);
    }
    // prettier-ignore
    const FIELD_FIELDS = [
        'create', 'isValid', 'is0', 'neg', 'inv', 'sqrt', 'sqr',
        'eql', 'add', 'sub', 'mul', 'pow', 'div',
        'addN', 'subN', 'mulN', 'sqrN'
    ];
    function validateField(field) {
        const initial = {
            ORDER: 'bigint',
            MASK: 'bigint',
            BYTES: 'isSafeInteger',
            BITS: 'isSafeInteger',
        };
        const opts = FIELD_FIELDS.reduce((map, val) => {
            map[val] = 'function';
            return map;
        }, initial);
        return validateObject(field, opts);
    }
    // Generic field functions
    /**
     * Same as `pow` but for Fp: non-constant-time.
     * Unsafe in some contexts: uses ladder, so can expose bigint bits.
     */
    function FpPow(f, num, power) {
        // Should have same speed as pow for bigints
        // TODO: benchmark!
        if (power < _0n$3)
            throw new Error('Expected power > 0');
        if (power === _0n$3)
            return f.ONE;
        if (power === _1n$3)
            return num;
        let p = f.ONE;
        let d = num;
        while (power > _0n$3) {
            if (power & _1n$3)
                p = f.mul(p, d);
            d = f.sqr(d);
            power >>= _1n$3;
        }
        return p;
    }
    /**
     * Efficiently invert an array of Field elements.
     * `inv(0)` will return `undefined` here: make sure to throw an error.
     */
    function FpInvertBatch(f, nums) {
        const tmp = new Array(nums.length);
        // Walk from first to last, multiply them by each other MOD p
        const lastMultiplied = nums.reduce((acc, num, i) => {
            if (f.is0(num))
                return acc;
            tmp[i] = acc;
            return f.mul(acc, num);
        }, f.ONE);
        // Invert last element
        const inverted = f.inv(lastMultiplied);
        // Walk from last to first, multiply them by inverted each other MOD p
        nums.reduceRight((acc, num, i) => {
            if (f.is0(num))
                return acc;
            tmp[i] = f.mul(acc, tmp[i]);
            return f.mul(acc, num);
        }, inverted);
        return tmp;
    }
    // CURVE.n lengths
    function nLength(n, nBitLength) {
        // Bit size, byte size of CURVE.n
        const _nBitLength = nBitLength !== undefined ? nBitLength : n.toString(2).length;
        const nByteLength = Math.ceil(_nBitLength / 8);
        return { nBitLength: _nBitLength, nByteLength };
    }
    /**
     * Initializes a finite field over prime. **Non-primes are not supported.**
     * Do not init in loop: slow. Very fragile: always run a benchmark on a change.
     * Major performance optimizations:
     * * a) denormalized operations like mulN instead of mul
     * * b) same object shape: never add or remove keys
     * * c) Object.freeze
     * @param ORDER prime positive bigint
     * @param bitLen how many bits the field consumes
     * @param isLE (def: false) if encoding / decoding should be in little-endian
     * @param redef optional faster redefinitions of sqrt and other methods
     */
    function Field(ORDER, bitLen, isLE = false, redef = {}) {
        if (ORDER <= _0n$3)
            throw new Error(`Expected Field ORDER > 0, got ${ORDER}`);
        const { nBitLength: BITS, nByteLength: BYTES } = nLength(ORDER, bitLen);
        if (BYTES > 2048)
            throw new Error('Field lengths over 2048 bytes are not supported');
        const sqrtP = FpSqrt(ORDER);
        const f = Object.freeze({
            ORDER,
            BITS,
            BYTES,
            MASK: bitMask(BITS),
            ZERO: _0n$3,
            ONE: _1n$3,
            create: (num) => mod(num, ORDER),
            isValid: (num) => {
                if (typeof num !== 'bigint')
                    throw new Error(`Invalid field element: expected bigint, got ${typeof num}`);
                return _0n$3 <= num && num < ORDER; // 0 is valid element, but it's not invertible
            },
            is0: (num) => num === _0n$3,
            isOdd: (num) => (num & _1n$3) === _1n$3,
            neg: (num) => mod(-num, ORDER),
            eql: (lhs, rhs) => lhs === rhs,
            sqr: (num) => mod(num * num, ORDER),
            add: (lhs, rhs) => mod(lhs + rhs, ORDER),
            sub: (lhs, rhs) => mod(lhs - rhs, ORDER),
            mul: (lhs, rhs) => mod(lhs * rhs, ORDER),
            pow: (num, power) => FpPow(f, num, power),
            div: (lhs, rhs) => mod(lhs * invert(rhs, ORDER), ORDER),
            // Same as above, but doesn't normalize
            sqrN: (num) => num * num,
            addN: (lhs, rhs) => lhs + rhs,
            subN: (lhs, rhs) => lhs - rhs,
            mulN: (lhs, rhs) => lhs * rhs,
            inv: (num) => invert(num, ORDER),
            sqrt: redef.sqrt || ((n) => sqrtP(f, n)),
            invertBatch: (lst) => FpInvertBatch(f, lst),
            // TODO: do we really need constant cmov?
            // We don't have const-time bigints anyway, so probably will be not very useful
            cmov: (a, b, c) => (c ? b : a),
            toBytes: (num) => (isLE ? numberToBytesLE(num, BYTES) : numberToBytesBE(num, BYTES)),
            fromBytes: (bytes) => {
                if (bytes.length !== BYTES)
                    throw new Error(`Fp.fromBytes: expected ${BYTES}, got ${bytes.length}`);
                return isLE ? bytesToNumberLE(bytes) : bytesToNumberBE(bytes);
            },
        });
        return Object.freeze(f);
    }
    /**
     * Returns total number of bytes consumed by the field element.
     * For example, 32 bytes for usual 256-bit weierstrass curve.
     * @param fieldOrder number of field elements, usually CURVE.n
     * @returns byte length of field
     */
    function getFieldBytesLength(fieldOrder) {
        if (typeof fieldOrder !== 'bigint')
            throw new Error('field order must be bigint');
        const bitLength = fieldOrder.toString(2).length;
        return Math.ceil(bitLength / 8);
    }
    /**
     * Returns minimal amount of bytes that can be safely reduced
     * by field order.
     * Should be 2^-128 for 128-bit curve such as P256.
     * @param fieldOrder number of field elements, usually CURVE.n
     * @returns byte length of target hash
     */
    function getMinHashLength(fieldOrder) {
        const length = getFieldBytesLength(fieldOrder);
        return length + Math.ceil(length / 2);
    }
    /**
     * "Constant-time" private key generation utility.
     * Can take (n + n/2) or more bytes of uniform input e.g. from CSPRNG or KDF
     * and convert them into private scalar, with the modulo bias being negligible.
     * Needs at least 48 bytes of input for 32-byte private key.
     * https://research.kudelskisecurity.com/2020/07/28/the-definitive-guide-to-modulo-bias-and-how-to-avoid-it/
     * FIPS 186-5, A.2 https://csrc.nist.gov/publications/detail/fips/186/5/final
     * RFC 9380, https://www.rfc-editor.org/rfc/rfc9380#section-5
     * @param hash hash output from SHA3 or a similar function
     * @param groupOrder size of subgroup - (e.g. secp256k1.CURVE.n)
     * @param isLE interpret hash bytes as LE num
     * @returns valid private scalar
     */
    function mapHashToField(key, fieldOrder, isLE = false) {
        const len = key.length;
        const fieldLen = getFieldBytesLength(fieldOrder);
        const minLen = getMinHashLength(fieldOrder);
        // No small numbers: need to understand bias story. No huge numbers: easier to detect JS timings.
        if (len < 16 || len < minLen || len > 1024)
            throw new Error(`expected ${minLen}-1024 bytes of input, got ${len}`);
        const num = isLE ? bytesToNumberBE(key) : bytesToNumberLE(key);
        // `mod(x, 11)` can sometimes produce 0. `mod(x, 10) + 1` is the same, but no 0
        const reduced = mod(num, fieldOrder - _1n$3) + _1n$3;
        return isLE ? numberToBytesLE(reduced, fieldLen) : numberToBytesBE(reduced, fieldLen);
    }

    /*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    // Abelian group utilities
    const _0n$2 = BigInt(0);
    const _1n$2 = BigInt(1);
    // Elliptic curve multiplication of Point by scalar. Fragile.
    // Scalars should always be less than curve order: this should be checked inside of a curve itself.
    // Creates precomputation tables for fast multiplication:
    // - private scalar is split by fixed size windows of W bits
    // - every window point is collected from window's table & added to accumulator
    // - since windows are different, same point inside tables won't be accessed more than once per calc
    // - each multiplication is 'Math.ceil(CURVE_ORDER / 𝑊) + 1' point additions (fixed for any scalar)
    // - +1 window is neccessary for wNAF
    // - wNAF reduces table size: 2x less memory + 2x faster generation, but 10% slower multiplication
    // TODO: Research returning 2d JS array of windows, instead of a single window. This would allow
    // windows to be in different memory locations
    function wNAF(c, bits) {
        const constTimeNegate = (condition, item) => {
            const neg = item.negate();
            return condition ? neg : item;
        };
        const opts = (W) => {
            const windows = Math.ceil(bits / W) + 1; // +1, because
            const windowSize = 2 ** (W - 1); // -1 because we skip zero
            return { windows, windowSize };
        };
        return {
            constTimeNegate,
            // non-const time multiplication ladder
            unsafeLadder(elm, n) {
                let p = c.ZERO;
                let d = elm;
                while (n > _0n$2) {
                    if (n & _1n$2)
                        p = p.add(d);
                    d = d.double();
                    n >>= _1n$2;
                }
                return p;
            },
            /**
             * Creates a wNAF precomputation window. Used for caching.
             * Default window size is set by `utils.precompute()` and is equal to 8.
             * Number of precomputed points depends on the curve size:
             * 2^(𝑊−1) * (Math.ceil(𝑛 / 𝑊) + 1), where:
             * - 𝑊 is the window size
             * - 𝑛 is the bitlength of the curve order.
             * For a 256-bit curve and window size 8, the number of precomputed points is 128 * 33 = 4224.
             * @returns precomputed point tables flattened to a single array
             */
            precomputeWindow(elm, W) {
                const { windows, windowSize } = opts(W);
                const points = [];
                let p = elm;
                let base = p;
                for (let window = 0; window < windows; window++) {
                    base = p;
                    points.push(base);
                    // =1, because we skip zero
                    for (let i = 1; i < windowSize; i++) {
                        base = base.add(p);
                        points.push(base);
                    }
                    p = base.double();
                }
                return points;
            },
            /**
             * Implements ec multiplication using precomputed tables and w-ary non-adjacent form.
             * @param W window size
             * @param precomputes precomputed tables
             * @param n scalar (we don't check here, but should be less than curve order)
             * @returns real and fake (for const-time) points
             */
            wNAF(W, precomputes, n) {
                // TODO: maybe check that scalar is less than group order? wNAF behavious is undefined otherwise
                // But need to carefully remove other checks before wNAF. ORDER == bits here
                const { windows, windowSize } = opts(W);
                let p = c.ZERO;
                let f = c.BASE;
                const mask = BigInt(2 ** W - 1); // Create mask with W ones: 0b1111 for W=4 etc.
                const maxNumber = 2 ** W;
                const shiftBy = BigInt(W);
                for (let window = 0; window < windows; window++) {
                    const offset = window * windowSize;
                    // Extract W bits.
                    let wbits = Number(n & mask);
                    // Shift number by W bits.
                    n >>= shiftBy;
                    // If the bits are bigger than max size, we'll split those.
                    // +224 => 256 - 32
                    if (wbits > windowSize) {
                        wbits -= maxNumber;
                        n += _1n$2;
                    }
                    // This code was first written with assumption that 'f' and 'p' will never be infinity point:
                    // since each addition is multiplied by 2 ** W, it cannot cancel each other. However,
                    // there is negate now: it is possible that negated element from low value
                    // would be the same as high element, which will create carry into next window.
                    // It's not obvious how this can fail, but still worth investigating later.
                    // Check if we're onto Zero point.
                    // Add random point inside current window to f.
                    const offset1 = offset;
                    const offset2 = offset + Math.abs(wbits) - 1; // -1 because we skip zero
                    const cond1 = window % 2 !== 0;
                    const cond2 = wbits < 0;
                    if (wbits === 0) {
                        // The most important part for const-time getPublicKey
                        f = f.add(constTimeNegate(cond1, precomputes[offset1]));
                    }
                    else {
                        p = p.add(constTimeNegate(cond2, precomputes[offset2]));
                    }
                }
                // JIT-compiler should not eliminate f here, since it will later be used in normalizeZ()
                // Even if the variable is still unused, there are some checks which will
                // throw an exception, so compiler needs to prove they won't happen, which is hard.
                // At this point there is a way to F be infinity-point even if p is not,
                // which makes it less const-time: around 1 bigint multiply.
                return { p, f };
            },
            wNAFCached(P, precomputesMap, n, transform) {
                // @ts-ignore
                const W = P._WINDOW_SIZE || 1;
                // Calculate precomputes on a first run, reuse them after
                let comp = precomputesMap.get(P);
                if (!comp) {
                    comp = this.precomputeWindow(P, W);
                    if (W !== 1) {
                        precomputesMap.set(P, transform(comp));
                    }
                }
                return this.wNAF(W, comp, n);
            },
        };
    }
    function validateBasic(curve) {
        validateField(curve.Fp);
        validateObject(curve, {
            n: 'bigint',
            h: 'bigint',
            Gx: 'field',
            Gy: 'field',
        }, {
            nBitLength: 'isSafeInteger',
            nByteLength: 'isSafeInteger',
        });
        // Set defaults
        return Object.freeze({
            ...nLength(curve.n, curve.nBitLength),
            ...curve,
            ...{ p: curve.Fp.ORDER },
        });
    }

    /*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    // Short Weierstrass curve. The formula is: y² = x³ + ax + b
    function validatePointOpts(curve) {
        const opts = validateBasic(curve);
        validateObject(opts, {
            a: 'field',
            b: 'field',
        }, {
            allowedPrivateKeyLengths: 'array',
            wrapPrivateKey: 'boolean',
            isTorsionFree: 'function',
            clearCofactor: 'function',
            allowInfinityPoint: 'boolean',
            fromBytes: 'function',
            toBytes: 'function',
        });
        const { endo, Fp, a } = opts;
        if (endo) {
            if (!Fp.eql(a, Fp.ZERO)) {
                throw new Error('Endomorphism can only be defined for Koblitz curves that have a=0');
            }
            if (typeof endo !== 'object' ||
                typeof endo.beta !== 'bigint' ||
                typeof endo.splitScalar !== 'function') {
                throw new Error('Expected endomorphism with beta: bigint and splitScalar: function');
            }
        }
        return Object.freeze({ ...opts });
    }
    // ASN.1 DER encoding utilities
    const { bytesToNumberBE: b2n, hexToBytes: h2b } = ut;
    const DER = {
        // asn.1 DER encoding utils
        Err: class DERErr extends Error {
            constructor(m = '') {
                super(m);
            }
        },
        _parseInt(data) {
            const { Err: E } = DER;
            if (data.length < 2 || data[0] !== 0x02)
                throw new E('Invalid signature integer tag');
            const len = data[1];
            const res = data.subarray(2, len + 2);
            if (!len || res.length !== len)
                throw new E('Invalid signature integer: wrong length');
            // https://crypto.stackexchange.com/a/57734 Leftmost bit of first byte is 'negative' flag,
            // since we always use positive integers here. It must always be empty:
            // - add zero byte if exists
            // - if next byte doesn't have a flag, leading zero is not allowed (minimal encoding)
            if (res[0] & 0b10000000)
                throw new E('Invalid signature integer: negative');
            if (res[0] === 0x00 && !(res[1] & 0b10000000))
                throw new E('Invalid signature integer: unnecessary leading zero');
            return { d: b2n(res), l: data.subarray(len + 2) }; // d is data, l is left
        },
        toSig(hex) {
            // parse DER signature
            const { Err: E } = DER;
            const data = typeof hex === 'string' ? h2b(hex) : hex;
            if (!(data instanceof Uint8Array))
                throw new Error('ui8a expected');
            let l = data.length;
            if (l < 2 || data[0] != 0x30)
                throw new E('Invalid signature tag');
            if (data[1] !== l - 2)
                throw new E('Invalid signature: incorrect length');
            const { d: r, l: sBytes } = DER._parseInt(data.subarray(2));
            const { d: s, l: rBytesLeft } = DER._parseInt(sBytes);
            if (rBytesLeft.length)
                throw new E('Invalid signature: left bytes after parsing');
            return { r, s };
        },
        hexFromSig(sig) {
            // Add leading zero if first byte has negative bit enabled. More details in '_parseInt'
            const slice = (s) => (Number.parseInt(s[0], 16) & 0b1000 ? '00' + s : s);
            const h = (num) => {
                const hex = num.toString(16);
                return hex.length & 1 ? `0${hex}` : hex;
            };
            const s = slice(h(sig.s));
            const r = slice(h(sig.r));
            const shl = s.length / 2;
            const rhl = r.length / 2;
            const sl = h(shl);
            const rl = h(rhl);
            return `30${h(rhl + shl + 4)}02${rl}${r}02${sl}${s}`;
        },
    };
    // Be friendly to bad ECMAScript parsers by not using bigint literals
    // prettier-ignore
    const _0n$1 = BigInt(0), _1n$1 = BigInt(1); BigInt(2); const _3n = BigInt(3); BigInt(4);
    function weierstrassPoints(opts) {
        const CURVE = validatePointOpts(opts);
        const { Fp } = CURVE; // All curves has same field / group length as for now, but they can differ
        const toBytes = CURVE.toBytes ||
            ((_c, point, _isCompressed) => {
                const a = point.toAffine();
                return concatBytes$1(Uint8Array.from([0x04]), Fp.toBytes(a.x), Fp.toBytes(a.y));
            });
        const fromBytes = CURVE.fromBytes ||
            ((bytes) => {
                // const head = bytes[0];
                const tail = bytes.subarray(1);
                // if (head !== 0x04) throw new Error('Only non-compressed encoding is supported');
                const x = Fp.fromBytes(tail.subarray(0, Fp.BYTES));
                const y = Fp.fromBytes(tail.subarray(Fp.BYTES, 2 * Fp.BYTES));
                return { x, y };
            });
        /**
         * y² = x³ + ax + b: Short weierstrass curve formula
         * @returns y²
         */
        function weierstrassEquation(x) {
            const { a, b } = CURVE;
            const x2 = Fp.sqr(x); // x * x
            const x3 = Fp.mul(x2, x); // x2 * x
            return Fp.add(Fp.add(x3, Fp.mul(x, a)), b); // x3 + a * x + b
        }
        // Validate whether the passed curve params are valid.
        // We check if curve equation works for generator point.
        // `assertValidity()` won't work: `isTorsionFree()` is not available at this point in bls12-381.
        // ProjectivePoint class has not been initialized yet.
        if (!Fp.eql(Fp.sqr(CURVE.Gy), weierstrassEquation(CURVE.Gx)))
            throw new Error('bad generator point: equation left != right');
        // Valid group elements reside in range 1..n-1
        function isWithinCurveOrder(num) {
            return typeof num === 'bigint' && _0n$1 < num && num < CURVE.n;
        }
        function assertGE(num) {
            if (!isWithinCurveOrder(num))
                throw new Error('Expected valid bigint: 0 < bigint < curve.n');
        }
        // Validates if priv key is valid and converts it to bigint.
        // Supports options allowedPrivateKeyLengths and wrapPrivateKey.
        function normPrivateKeyToScalar(key) {
            const { allowedPrivateKeyLengths: lengths, nByteLength, wrapPrivateKey, n } = CURVE;
            if (lengths && typeof key !== 'bigint') {
                if (key instanceof Uint8Array)
                    key = bytesToHex$1(key);
                // Normalize to hex string, pad. E.g. P521 would norm 130-132 char hex to 132-char bytes
                if (typeof key !== 'string' || !lengths.includes(key.length))
                    throw new Error('Invalid key');
                key = key.padStart(nByteLength * 2, '0');
            }
            let num;
            try {
                num =
                    typeof key === 'bigint'
                        ? key
                        : bytesToNumberBE(ensureBytes('private key', key, nByteLength));
            }
            catch (error) {
                throw new Error(`private key must be ${nByteLength} bytes, hex or bigint, not ${typeof key}`);
            }
            if (wrapPrivateKey)
                num = mod(num, n); // disabled by default, enabled for BLS
            assertGE(num); // num in range [1..N-1]
            return num;
        }
        const pointPrecomputes = new Map();
        function assertPrjPoint(other) {
            if (!(other instanceof Point))
                throw new Error('ProjectivePoint expected');
        }
        /**
         * Projective Point works in 3d / projective (homogeneous) coordinates: (x, y, z) ∋ (x=x/z, y=y/z)
         * Default Point works in 2d / affine coordinates: (x, y)
         * We're doing calculations in projective, because its operations don't require costly inversion.
         */
        class Point {
            constructor(px, py, pz) {
                this.px = px;
                this.py = py;
                this.pz = pz;
                if (px == null || !Fp.isValid(px))
                    throw new Error('x required');
                if (py == null || !Fp.isValid(py))
                    throw new Error('y required');
                if (pz == null || !Fp.isValid(pz))
                    throw new Error('z required');
            }
            // Does not validate if the point is on-curve.
            // Use fromHex instead, or call assertValidity() later.
            static fromAffine(p) {
                const { x, y } = p || {};
                if (!p || !Fp.isValid(x) || !Fp.isValid(y))
                    throw new Error('invalid affine point');
                if (p instanceof Point)
                    throw new Error('projective point not allowed');
                const is0 = (i) => Fp.eql(i, Fp.ZERO);
                // fromAffine(x:0, y:0) would produce (x:0, y:0, z:1), but we need (x:0, y:1, z:0)
                if (is0(x) && is0(y))
                    return Point.ZERO;
                return new Point(x, y, Fp.ONE);
            }
            get x() {
                return this.toAffine().x;
            }
            get y() {
                return this.toAffine().y;
            }
            /**
             * Takes a bunch of Projective Points but executes only one
             * inversion on all of them. Inversion is very slow operation,
             * so this improves performance massively.
             * Optimization: converts a list of projective points to a list of identical points with Z=1.
             */
            static normalizeZ(points) {
                const toInv = Fp.invertBatch(points.map((p) => p.pz));
                return points.map((p, i) => p.toAffine(toInv[i])).map(Point.fromAffine);
            }
            /**
             * Converts hash string or Uint8Array to Point.
             * @param hex short/long ECDSA hex
             */
            static fromHex(hex) {
                const P = Point.fromAffine(fromBytes(ensureBytes('pointHex', hex)));
                P.assertValidity();
                return P;
            }
            // Multiplies generator point by privateKey.
            static fromPrivateKey(privateKey) {
                return Point.BASE.multiply(normPrivateKeyToScalar(privateKey));
            }
            // "Private method", don't use it directly
            _setWindowSize(windowSize) {
                this._WINDOW_SIZE = windowSize;
                pointPrecomputes.delete(this);
            }
            // A point on curve is valid if it conforms to equation.
            assertValidity() {
                if (this.is0()) {
                    // (0, 1, 0) aka ZERO is invalid in most contexts.
                    // In BLS, ZERO can be serialized, so we allow it.
                    // (0, 0, 0) is wrong representation of ZERO and is always invalid.
                    if (CURVE.allowInfinityPoint && !Fp.is0(this.py))
                        return;
                    throw new Error('bad point: ZERO');
                }
                // Some 3rd-party test vectors require different wording between here & `fromCompressedHex`
                const { x, y } = this.toAffine();
                // Check if x, y are valid field elements
                if (!Fp.isValid(x) || !Fp.isValid(y))
                    throw new Error('bad point: x or y not FE');
                const left = Fp.sqr(y); // y²
                const right = weierstrassEquation(x); // x³ + ax + b
                if (!Fp.eql(left, right))
                    throw new Error('bad point: equation left != right');
                if (!this.isTorsionFree())
                    throw new Error('bad point: not in prime-order subgroup');
            }
            hasEvenY() {
                const { y } = this.toAffine();
                if (Fp.isOdd)
                    return !Fp.isOdd(y);
                throw new Error("Field doesn't support isOdd");
            }
            /**
             * Compare one point to another.
             */
            equals(other) {
                assertPrjPoint(other);
                const { px: X1, py: Y1, pz: Z1 } = this;
                const { px: X2, py: Y2, pz: Z2 } = other;
                const U1 = Fp.eql(Fp.mul(X1, Z2), Fp.mul(X2, Z1));
                const U2 = Fp.eql(Fp.mul(Y1, Z2), Fp.mul(Y2, Z1));
                return U1 && U2;
            }
            /**
             * Flips point to one corresponding to (x, -y) in Affine coordinates.
             */
            negate() {
                return new Point(this.px, Fp.neg(this.py), this.pz);
            }
            // Renes-Costello-Batina exception-free doubling formula.
            // There is 30% faster Jacobian formula, but it is not complete.
            // https://eprint.iacr.org/2015/1060, algorithm 3
            // Cost: 8M + 3S + 3*a + 2*b3 + 15add.
            double() {
                const { a, b } = CURVE;
                const b3 = Fp.mul(b, _3n);
                const { px: X1, py: Y1, pz: Z1 } = this;
                let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO; // prettier-ignore
                let t0 = Fp.mul(X1, X1); // step 1
                let t1 = Fp.mul(Y1, Y1);
                let t2 = Fp.mul(Z1, Z1);
                let t3 = Fp.mul(X1, Y1);
                t3 = Fp.add(t3, t3); // step 5
                Z3 = Fp.mul(X1, Z1);
                Z3 = Fp.add(Z3, Z3);
                X3 = Fp.mul(a, Z3);
                Y3 = Fp.mul(b3, t2);
                Y3 = Fp.add(X3, Y3); // step 10
                X3 = Fp.sub(t1, Y3);
                Y3 = Fp.add(t1, Y3);
                Y3 = Fp.mul(X3, Y3);
                X3 = Fp.mul(t3, X3);
                Z3 = Fp.mul(b3, Z3); // step 15
                t2 = Fp.mul(a, t2);
                t3 = Fp.sub(t0, t2);
                t3 = Fp.mul(a, t3);
                t3 = Fp.add(t3, Z3);
                Z3 = Fp.add(t0, t0); // step 20
                t0 = Fp.add(Z3, t0);
                t0 = Fp.add(t0, t2);
                t0 = Fp.mul(t0, t3);
                Y3 = Fp.add(Y3, t0);
                t2 = Fp.mul(Y1, Z1); // step 25
                t2 = Fp.add(t2, t2);
                t0 = Fp.mul(t2, t3);
                X3 = Fp.sub(X3, t0);
                Z3 = Fp.mul(t2, t1);
                Z3 = Fp.add(Z3, Z3); // step 30
                Z3 = Fp.add(Z3, Z3);
                return new Point(X3, Y3, Z3);
            }
            // Renes-Costello-Batina exception-free addition formula.
            // There is 30% faster Jacobian formula, but it is not complete.
            // https://eprint.iacr.org/2015/1060, algorithm 1
            // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
            add(other) {
                assertPrjPoint(other);
                const { px: X1, py: Y1, pz: Z1 } = this;
                const { px: X2, py: Y2, pz: Z2 } = other;
                let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO; // prettier-ignore
                const a = CURVE.a;
                const b3 = Fp.mul(CURVE.b, _3n);
                let t0 = Fp.mul(X1, X2); // step 1
                let t1 = Fp.mul(Y1, Y2);
                let t2 = Fp.mul(Z1, Z2);
                let t3 = Fp.add(X1, Y1);
                let t4 = Fp.add(X2, Y2); // step 5
                t3 = Fp.mul(t3, t4);
                t4 = Fp.add(t0, t1);
                t3 = Fp.sub(t3, t4);
                t4 = Fp.add(X1, Z1);
                let t5 = Fp.add(X2, Z2); // step 10
                t4 = Fp.mul(t4, t5);
                t5 = Fp.add(t0, t2);
                t4 = Fp.sub(t4, t5);
                t5 = Fp.add(Y1, Z1);
                X3 = Fp.add(Y2, Z2); // step 15
                t5 = Fp.mul(t5, X3);
                X3 = Fp.add(t1, t2);
                t5 = Fp.sub(t5, X3);
                Z3 = Fp.mul(a, t4);
                X3 = Fp.mul(b3, t2); // step 20
                Z3 = Fp.add(X3, Z3);
                X3 = Fp.sub(t1, Z3);
                Z3 = Fp.add(t1, Z3);
                Y3 = Fp.mul(X3, Z3);
                t1 = Fp.add(t0, t0); // step 25
                t1 = Fp.add(t1, t0);
                t2 = Fp.mul(a, t2);
                t4 = Fp.mul(b3, t4);
                t1 = Fp.add(t1, t2);
                t2 = Fp.sub(t0, t2); // step 30
                t2 = Fp.mul(a, t2);
                t4 = Fp.add(t4, t2);
                t0 = Fp.mul(t1, t4);
                Y3 = Fp.add(Y3, t0);
                t0 = Fp.mul(t5, t4); // step 35
                X3 = Fp.mul(t3, X3);
                X3 = Fp.sub(X3, t0);
                t0 = Fp.mul(t3, t1);
                Z3 = Fp.mul(t5, Z3);
                Z3 = Fp.add(Z3, t0); // step 40
                return new Point(X3, Y3, Z3);
            }
            subtract(other) {
                return this.add(other.negate());
            }
            is0() {
                return this.equals(Point.ZERO);
            }
            wNAF(n) {
                return wnaf.wNAFCached(this, pointPrecomputes, n, (comp) => {
                    const toInv = Fp.invertBatch(comp.map((p) => p.pz));
                    return comp.map((p, i) => p.toAffine(toInv[i])).map(Point.fromAffine);
                });
            }
            /**
             * Non-constant-time multiplication. Uses double-and-add algorithm.
             * It's faster, but should only be used when you don't care about
             * an exposed private key e.g. sig verification, which works over *public* keys.
             */
            multiplyUnsafe(n) {
                const I = Point.ZERO;
                if (n === _0n$1)
                    return I;
                assertGE(n); // Will throw on 0
                if (n === _1n$1)
                    return this;
                const { endo } = CURVE;
                if (!endo)
                    return wnaf.unsafeLadder(this, n);
                // Apply endomorphism
                let { k1neg, k1, k2neg, k2 } = endo.splitScalar(n);
                let k1p = I;
                let k2p = I;
                let d = this;
                while (k1 > _0n$1 || k2 > _0n$1) {
                    if (k1 & _1n$1)
                        k1p = k1p.add(d);
                    if (k2 & _1n$1)
                        k2p = k2p.add(d);
                    d = d.double();
                    k1 >>= _1n$1;
                    k2 >>= _1n$1;
                }
                if (k1neg)
                    k1p = k1p.negate();
                if (k2neg)
                    k2p = k2p.negate();
                k2p = new Point(Fp.mul(k2p.px, endo.beta), k2p.py, k2p.pz);
                return k1p.add(k2p);
            }
            /**
             * Constant time multiplication.
             * Uses wNAF method. Windowed method may be 10% faster,
             * but takes 2x longer to generate and consumes 2x memory.
             * Uses precomputes when available.
             * Uses endomorphism for Koblitz curves.
             * @param scalar by which the point would be multiplied
             * @returns New point
             */
            multiply(scalar) {
                assertGE(scalar);
                let n = scalar;
                let point, fake; // Fake point is used to const-time mult
                const { endo } = CURVE;
                if (endo) {
                    const { k1neg, k1, k2neg, k2 } = endo.splitScalar(n);
                    let { p: k1p, f: f1p } = this.wNAF(k1);
                    let { p: k2p, f: f2p } = this.wNAF(k2);
                    k1p = wnaf.constTimeNegate(k1neg, k1p);
                    k2p = wnaf.constTimeNegate(k2neg, k2p);
                    k2p = new Point(Fp.mul(k2p.px, endo.beta), k2p.py, k2p.pz);
                    point = k1p.add(k2p);
                    fake = f1p.add(f2p);
                }
                else {
                    const { p, f } = this.wNAF(n);
                    point = p;
                    fake = f;
                }
                // Normalize `z` for both points, but return only real one
                return Point.normalizeZ([point, fake])[0];
            }
            /**
             * Efficiently calculate `aP + bQ`. Unsafe, can expose private key, if used incorrectly.
             * Not using Strauss-Shamir trick: precomputation tables are faster.
             * The trick could be useful if both P and Q are not G (not in our case).
             * @returns non-zero affine point
             */
            multiplyAndAddUnsafe(Q, a, b) {
                const G = Point.BASE; // No Strauss-Shamir trick: we have 10% faster G precomputes
                const mul = (P, a // Select faster multiply() method
                ) => (a === _0n$1 || a === _1n$1 || !P.equals(G) ? P.multiplyUnsafe(a) : P.multiply(a));
                const sum = mul(this, a).add(mul(Q, b));
                return sum.is0() ? undefined : sum;
            }
            // Converts Projective point to affine (x, y) coordinates.
            // Can accept precomputed Z^-1 - for example, from invertBatch.
            // (x, y, z) ∋ (x=x/z, y=y/z)
            toAffine(iz) {
                const { px: x, py: y, pz: z } = this;
                const is0 = this.is0();
                // If invZ was 0, we return zero point. However we still want to execute
                // all operations, so we replace invZ with a random number, 1.
                if (iz == null)
                    iz = is0 ? Fp.ONE : Fp.inv(z);
                const ax = Fp.mul(x, iz);
                const ay = Fp.mul(y, iz);
                const zz = Fp.mul(z, iz);
                if (is0)
                    return { x: Fp.ZERO, y: Fp.ZERO };
                if (!Fp.eql(zz, Fp.ONE))
                    throw new Error('invZ was invalid');
                return { x: ax, y: ay };
            }
            isTorsionFree() {
                const { h: cofactor, isTorsionFree } = CURVE;
                if (cofactor === _1n$1)
                    return true; // No subgroups, always torsion-free
                if (isTorsionFree)
                    return isTorsionFree(Point, this);
                throw new Error('isTorsionFree() has not been declared for the elliptic curve');
            }
            clearCofactor() {
                const { h: cofactor, clearCofactor } = CURVE;
                if (cofactor === _1n$1)
                    return this; // Fast-path
                if (clearCofactor)
                    return clearCofactor(Point, this);
                return this.multiplyUnsafe(CURVE.h);
            }
            toRawBytes(isCompressed = true) {
                this.assertValidity();
                return toBytes(Point, this, isCompressed);
            }
            toHex(isCompressed = true) {
                return bytesToHex$1(this.toRawBytes(isCompressed));
            }
        }
        Point.BASE = new Point(CURVE.Gx, CURVE.Gy, Fp.ONE);
        Point.ZERO = new Point(Fp.ZERO, Fp.ONE, Fp.ZERO);
        const _bits = CURVE.nBitLength;
        const wnaf = wNAF(Point, CURVE.endo ? Math.ceil(_bits / 2) : _bits);
        // Validate if generator point is on curve
        return {
            CURVE,
            ProjectivePoint: Point,
            normPrivateKeyToScalar,
            weierstrassEquation,
            isWithinCurveOrder,
        };
    }
    function validateOpts(curve) {
        const opts = validateBasic(curve);
        validateObject(opts, {
            hash: 'hash',
            hmac: 'function',
            randomBytes: 'function',
        }, {
            bits2int: 'function',
            bits2int_modN: 'function',
            lowS: 'boolean',
        });
        return Object.freeze({ lowS: true, ...opts });
    }
    function weierstrass(curveDef) {
        const CURVE = validateOpts(curveDef);
        const { Fp, n: CURVE_ORDER } = CURVE;
        const compressedLen = Fp.BYTES + 1; // e.g. 33 for 32
        const uncompressedLen = 2 * Fp.BYTES + 1; // e.g. 65 for 32
        function isValidFieldElement(num) {
            return _0n$1 < num && num < Fp.ORDER; // 0 is banned since it's not invertible FE
        }
        function modN(a) {
            return mod(a, CURVE_ORDER);
        }
        function invN(a) {
            return invert(a, CURVE_ORDER);
        }
        const { ProjectivePoint: Point, normPrivateKeyToScalar, weierstrassEquation, isWithinCurveOrder, } = weierstrassPoints({
            ...CURVE,
            toBytes(_c, point, isCompressed) {
                const a = point.toAffine();
                const x = Fp.toBytes(a.x);
                const cat = concatBytes$1;
                if (isCompressed) {
                    return cat(Uint8Array.from([point.hasEvenY() ? 0x02 : 0x03]), x);
                }
                else {
                    return cat(Uint8Array.from([0x04]), x, Fp.toBytes(a.y));
                }
            },
            fromBytes(bytes) {
                const len = bytes.length;
                const head = bytes[0];
                const tail = bytes.subarray(1);
                // this.assertValidity() is done inside of fromHex
                if (len === compressedLen && (head === 0x02 || head === 0x03)) {
                    const x = bytesToNumberBE(tail);
                    if (!isValidFieldElement(x))
                        throw new Error('Point is not on curve');
                    const y2 = weierstrassEquation(x); // y² = x³ + ax + b
                    let y = Fp.sqrt(y2); // y = y² ^ (p+1)/4
                    const isYOdd = (y & _1n$1) === _1n$1;
                    // ECDSA
                    const isHeadOdd = (head & 1) === 1;
                    if (isHeadOdd !== isYOdd)
                        y = Fp.neg(y);
                    return { x, y };
                }
                else if (len === uncompressedLen && head === 0x04) {
                    const x = Fp.fromBytes(tail.subarray(0, Fp.BYTES));
                    const y = Fp.fromBytes(tail.subarray(Fp.BYTES, 2 * Fp.BYTES));
                    return { x, y };
                }
                else {
                    throw new Error(`Point of length ${len} was invalid. Expected ${compressedLen} compressed bytes or ${uncompressedLen} uncompressed bytes`);
                }
            },
        });
        const numToNByteStr = (num) => bytesToHex$1(numberToBytesBE(num, CURVE.nByteLength));
        function isBiggerThanHalfOrder(number) {
            const HALF = CURVE_ORDER >> _1n$1;
            return number > HALF;
        }
        function normalizeS(s) {
            return isBiggerThanHalfOrder(s) ? modN(-s) : s;
        }
        // slice bytes num
        const slcNum = (b, from, to) => bytesToNumberBE(b.slice(from, to));
        /**
         * ECDSA signature with its (r, s) properties. Supports DER & compact representations.
         */
        class Signature {
            constructor(r, s, recovery) {
                this.r = r;
                this.s = s;
                this.recovery = recovery;
                this.assertValidity();
            }
            // pair (bytes of r, bytes of s)
            static fromCompact(hex) {
                const l = CURVE.nByteLength;
                hex = ensureBytes('compactSignature', hex, l * 2);
                return new Signature(slcNum(hex, 0, l), slcNum(hex, l, 2 * l));
            }
            // DER encoded ECDSA signature
            // https://bitcoin.stackexchange.com/questions/57644/what-are-the-parts-of-a-bitcoin-transaction-input-script
            static fromDER(hex) {
                const { r, s } = DER.toSig(ensureBytes('DER', hex));
                return new Signature(r, s);
            }
            assertValidity() {
                // can use assertGE here
                if (!isWithinCurveOrder(this.r))
                    throw new Error('r must be 0 < r < CURVE.n');
                if (!isWithinCurveOrder(this.s))
                    throw new Error('s must be 0 < s < CURVE.n');
            }
            addRecoveryBit(recovery) {
                return new Signature(this.r, this.s, recovery);
            }
            recoverPublicKey(msgHash) {
                const { r, s, recovery: rec } = this;
                const h = bits2int_modN(ensureBytes('msgHash', msgHash)); // Truncate hash
                if (rec == null || ![0, 1, 2, 3].includes(rec))
                    throw new Error('recovery id invalid');
                const radj = rec === 2 || rec === 3 ? r + CURVE.n : r;
                if (radj >= Fp.ORDER)
                    throw new Error('recovery id 2 or 3 invalid');
                const prefix = (rec & 1) === 0 ? '02' : '03';
                const R = Point.fromHex(prefix + numToNByteStr(radj));
                const ir = invN(radj); // r^-1
                const u1 = modN(-h * ir); // -hr^-1
                const u2 = modN(s * ir); // sr^-1
                const Q = Point.BASE.multiplyAndAddUnsafe(R, u1, u2); // (sr^-1)R-(hr^-1)G = -(hr^-1)G + (sr^-1)
                if (!Q)
                    throw new Error('point at infinify'); // unsafe is fine: no priv data leaked
                Q.assertValidity();
                return Q;
            }
            // Signatures should be low-s, to prevent malleability.
            hasHighS() {
                return isBiggerThanHalfOrder(this.s);
            }
            normalizeS() {
                return this.hasHighS() ? new Signature(this.r, modN(-this.s), this.recovery) : this;
            }
            // DER-encoded
            toDERRawBytes() {
                return hexToBytes$1(this.toDERHex());
            }
            toDERHex() {
                return DER.hexFromSig({ r: this.r, s: this.s });
            }
            // padded bytes of r, then padded bytes of s
            toCompactRawBytes() {
                return hexToBytes$1(this.toCompactHex());
            }
            toCompactHex() {
                return numToNByteStr(this.r) + numToNByteStr(this.s);
            }
        }
        const utils = {
            isValidPrivateKey(privateKey) {
                try {
                    normPrivateKeyToScalar(privateKey);
                    return true;
                }
                catch (error) {
                    return false;
                }
            },
            normPrivateKeyToScalar: normPrivateKeyToScalar,
            /**
             * Produces cryptographically secure private key from random of size
             * (groupLen + ceil(groupLen / 2)) with modulo bias being negligible.
             */
            randomPrivateKey: () => {
                const length = getMinHashLength(CURVE.n);
                return mapHashToField(CURVE.randomBytes(length), CURVE.n);
            },
            /**
             * Creates precompute table for an arbitrary EC point. Makes point "cached".
             * Allows to massively speed-up `point.multiply(scalar)`.
             * @returns cached point
             * @example
             * const fast = utils.precompute(8, ProjectivePoint.fromHex(someonesPubKey));
             * fast.multiply(privKey); // much faster ECDH now
             */
            precompute(windowSize = 8, point = Point.BASE) {
                point._setWindowSize(windowSize);
                point.multiply(BigInt(3)); // 3 is arbitrary, just need any number here
                return point;
            },
        };
        /**
         * Computes public key for a private key. Checks for validity of the private key.
         * @param privateKey private key
         * @param isCompressed whether to return compact (default), or full key
         * @returns Public key, full when isCompressed=false; short when isCompressed=true
         */
        function getPublicKey(privateKey, isCompressed = true) {
            return Point.fromPrivateKey(privateKey).toRawBytes(isCompressed);
        }
        /**
         * Quick and dirty check for item being public key. Does not validate hex, or being on-curve.
         */
        function isProbPub(item) {
            const arr = item instanceof Uint8Array;
            const str = typeof item === 'string';
            const len = (arr || str) && item.length;
            if (arr)
                return len === compressedLen || len === uncompressedLen;
            if (str)
                return len === 2 * compressedLen || len === 2 * uncompressedLen;
            if (item instanceof Point)
                return true;
            return false;
        }
        /**
         * ECDH (Elliptic Curve Diffie Hellman).
         * Computes shared public key from private key and public key.
         * Checks: 1) private key validity 2) shared key is on-curve.
         * Does NOT hash the result.
         * @param privateA private key
         * @param publicB different public key
         * @param isCompressed whether to return compact (default), or full key
         * @returns shared public key
         */
        function getSharedSecret(privateA, publicB, isCompressed = true) {
            if (isProbPub(privateA))
                throw new Error('first arg must be private key');
            if (!isProbPub(publicB))
                throw new Error('second arg must be public key');
            const b = Point.fromHex(publicB); // check for being on-curve
            return b.multiply(normPrivateKeyToScalar(privateA)).toRawBytes(isCompressed);
        }
        // RFC6979: ensure ECDSA msg is X bytes and < N. RFC suggests optional truncating via bits2octets.
        // FIPS 186-4 4.6 suggests the leftmost min(nBitLen, outLen) bits, which matches bits2int.
        // bits2int can produce res>N, we can do mod(res, N) since the bitLen is the same.
        // int2octets can't be used; pads small msgs with 0: unacceptatble for trunc as per RFC vectors
        const bits2int = CURVE.bits2int ||
            function (bytes) {
                // For curves with nBitLength % 8 !== 0: bits2octets(bits2octets(m)) !== bits2octets(m)
                // for some cases, since bytes.length * 8 is not actual bitLength.
                const num = bytesToNumberBE(bytes); // check for == u8 done here
                const delta = bytes.length * 8 - CURVE.nBitLength; // truncate to nBitLength leftmost bits
                return delta > 0 ? num >> BigInt(delta) : num;
            };
        const bits2int_modN = CURVE.bits2int_modN ||
            function (bytes) {
                return modN(bits2int(bytes)); // can't use bytesToNumberBE here
            };
        // NOTE: pads output with zero as per spec
        const ORDER_MASK = bitMask(CURVE.nBitLength);
        /**
         * Converts to bytes. Checks if num in `[0..ORDER_MASK-1]` e.g.: `[0..2^256-1]`.
         */
        function int2octets(num) {
            if (typeof num !== 'bigint')
                throw new Error('bigint expected');
            if (!(_0n$1 <= num && num < ORDER_MASK))
                throw new Error(`bigint expected < 2^${CURVE.nBitLength}`);
            // works with order, can have different size than numToField!
            return numberToBytesBE(num, CURVE.nByteLength);
        }
        // Steps A, D of RFC6979 3.2
        // Creates RFC6979 seed; converts msg/privKey to numbers.
        // Used only in sign, not in verify.
        // NOTE: we cannot assume here that msgHash has same amount of bytes as curve order, this will be wrong at least for P521.
        // Also it can be bigger for P224 + SHA256
        function prepSig(msgHash, privateKey, opts = defaultSigOpts) {
            if (['recovered', 'canonical'].some((k) => k in opts))
                throw new Error('sign() legacy options not supported');
            const { hash, randomBytes } = CURVE;
            let { lowS, prehash, extraEntropy: ent } = opts; // generates low-s sigs by default
            if (lowS == null)
                lowS = true; // RFC6979 3.2: we skip step A, because we already provide hash
            msgHash = ensureBytes('msgHash', msgHash);
            if (prehash)
                msgHash = ensureBytes('prehashed msgHash', hash(msgHash));
            // We can't later call bits2octets, since nested bits2int is broken for curves
            // with nBitLength % 8 !== 0. Because of that, we unwrap it here as int2octets call.
            // const bits2octets = (bits) => int2octets(bits2int_modN(bits))
            const h1int = bits2int_modN(msgHash);
            const d = normPrivateKeyToScalar(privateKey); // validate private key, convert to bigint
            const seedArgs = [int2octets(d), int2octets(h1int)];
            // extraEntropy. RFC6979 3.6: additional k' (optional).
            if (ent != null) {
                // K = HMAC_K(V || 0x00 || int2octets(x) || bits2octets(h1) || k')
                const e = ent === true ? randomBytes(Fp.BYTES) : ent; // generate random bytes OR pass as-is
                seedArgs.push(ensureBytes('extraEntropy', e)); // check for being bytes
            }
            const seed = concatBytes$1(...seedArgs); // Step D of RFC6979 3.2
            const m = h1int; // NOTE: no need to call bits2int second time here, it is inside truncateHash!
            // Converts signature params into point w r/s, checks result for validity.
            function k2sig(kBytes) {
                // RFC 6979 Section 3.2, step 3: k = bits2int(T)
                const k = bits2int(kBytes); // Cannot use fields methods, since it is group element
                if (!isWithinCurveOrder(k))
                    return; // Important: all mod() calls here must be done over N
                const ik = invN(k); // k^-1 mod n
                const q = Point.BASE.multiply(k).toAffine(); // q = Gk
                const r = modN(q.x); // r = q.x mod n
                if (r === _0n$1)
                    return;
                // Can use scalar blinding b^-1(bm + bdr) where b ∈ [1,q−1] according to
                // https://tches.iacr.org/index.php/TCHES/article/view/7337/6509. We've decided against it:
                // a) dependency on CSPRNG b) 15% slowdown c) doesn't really help since bigints are not CT
                const s = modN(ik * modN(m + r * d)); // Not using blinding here
                if (s === _0n$1)
                    return;
                let recovery = (q.x === r ? 0 : 2) | Number(q.y & _1n$1); // recovery bit (2 or 3, when q.x > n)
                let normS = s;
                if (lowS && isBiggerThanHalfOrder(s)) {
                    normS = normalizeS(s); // if lowS was passed, ensure s is always
                    recovery ^= 1; // // in the bottom half of N
                }
                return new Signature(r, normS, recovery); // use normS, not s
            }
            return { seed, k2sig };
        }
        const defaultSigOpts = { lowS: CURVE.lowS, prehash: false };
        const defaultVerOpts = { lowS: CURVE.lowS, prehash: false };
        /**
         * Signs message hash with a private key.
         * ```
         * sign(m, d, k) where
         *   (x, y) = G × k
         *   r = x mod n
         *   s = (m + dr)/k mod n
         * ```
         * @param msgHash NOT message. msg needs to be hashed to `msgHash`, or use `prehash`.
         * @param privKey private key
         * @param opts lowS for non-malleable sigs. extraEntropy for mixing randomness into k. prehash will hash first arg.
         * @returns signature with recovery param
         */
        function sign(msgHash, privKey, opts = defaultSigOpts) {
            const { seed, k2sig } = prepSig(msgHash, privKey, opts); // Steps A, D of RFC6979 3.2.
            const C = CURVE;
            const drbg = createHmacDrbg(C.hash.outputLen, C.nByteLength, C.hmac);
            return drbg(seed, k2sig); // Steps B, C, D, E, F, G
        }
        // Enable precomputes. Slows down first publicKey computation by 20ms.
        Point.BASE._setWindowSize(8);
        // utils.precompute(8, ProjectivePoint.BASE)
        /**
         * Verifies a signature against message hash and public key.
         * Rejects lowS signatures by default: to override,
         * specify option `{lowS: false}`. Implements section 4.1.4 from https://www.secg.org/sec1-v2.pdf:
         *
         * ```
         * verify(r, s, h, P) where
         *   U1 = hs^-1 mod n
         *   U2 = rs^-1 mod n
         *   R = U1⋅G - U2⋅P
         *   mod(R.x, n) == r
         * ```
         */
        function verify(signature, msgHash, publicKey, opts = defaultVerOpts) {
            const sg = signature;
            msgHash = ensureBytes('msgHash', msgHash);
            publicKey = ensureBytes('publicKey', publicKey);
            if ('strict' in opts)
                throw new Error('options.strict was renamed to lowS');
            const { lowS, prehash } = opts;
            let _sig = undefined;
            let P;
            try {
                if (typeof sg === 'string' || sg instanceof Uint8Array) {
                    // Signature can be represented in 2 ways: compact (2*nByteLength) & DER (variable-length).
                    // Since DER can also be 2*nByteLength bytes, we check for it first.
                    try {
                        _sig = Signature.fromDER(sg);
                    }
                    catch (derError) {
                        if (!(derError instanceof DER.Err))
                            throw derError;
                        _sig = Signature.fromCompact(sg);
                    }
                }
                else if (typeof sg === 'object' && typeof sg.r === 'bigint' && typeof sg.s === 'bigint') {
                    const { r, s } = sg;
                    _sig = new Signature(r, s);
                }
                else {
                    throw new Error('PARSE');
                }
                P = Point.fromHex(publicKey);
            }
            catch (error) {
                if (error.message === 'PARSE')
                    throw new Error(`signature must be Signature instance, Uint8Array or hex string`);
                return false;
            }
            if (lowS && _sig.hasHighS())
                return false;
            if (prehash)
                msgHash = CURVE.hash(msgHash);
            const { r, s } = _sig;
            const h = bits2int_modN(msgHash); // Cannot use fields methods, since it is group element
            const is = invN(s); // s^-1
            const u1 = modN(h * is); // u1 = hs^-1 mod n
            const u2 = modN(r * is); // u2 = rs^-1 mod n
            const R = Point.BASE.multiplyAndAddUnsafe(P, u1, u2)?.toAffine(); // R = u1⋅G + u2⋅P
            if (!R)
                return false;
            const v = modN(R.x);
            return v === r;
        }
        return {
            CURVE,
            getPublicKey,
            getSharedSecret,
            sign,
            verify,
            ProjectivePoint: Point,
            Signature,
            utils,
        };
    }

    // HMAC (RFC 2104)
    let HMAC$1 = class HMAC extends Hash$1 {
        constructor(hash, _key) {
            super();
            this.finished = false;
            this.destroyed = false;
            hash$1(hash);
            const key = toBytes$1(_key);
            this.iHash = hash.create();
            if (typeof this.iHash.update !== 'function')
                throw new Error('Expected instance of class which extends utils.Hash');
            this.blockLen = this.iHash.blockLen;
            this.outputLen = this.iHash.outputLen;
            const blockLen = this.blockLen;
            const pad = new Uint8Array(blockLen);
            // blockLen can be bigger than outputLen
            pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
            for (let i = 0; i < pad.length; i++)
                pad[i] ^= 0x36;
            this.iHash.update(pad);
            // By doing update (processing of first block) of outer hash here we can re-use it between multiple calls via clone
            this.oHash = hash.create();
            // Undo internal XOR && apply outer XOR
            for (let i = 0; i < pad.length; i++)
                pad[i] ^= 0x36 ^ 0x5c;
            this.oHash.update(pad);
            pad.fill(0);
        }
        update(buf) {
            exists$1(this);
            this.iHash.update(buf);
            return this;
        }
        digestInto(out) {
            exists$1(this);
            bytes$2(out, this.outputLen);
            this.finished = true;
            this.iHash.digestInto(out);
            this.oHash.update(out);
            this.oHash.digestInto(out);
            this.destroy();
        }
        digest() {
            const out = new Uint8Array(this.oHash.outputLen);
            this.digestInto(out);
            return out;
        }
        _cloneInto(to) {
            // Create new instance without calling constructor since key already in state and we don't know it.
            to || (to = Object.create(Object.getPrototypeOf(this), {}));
            const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
            to = to;
            to.finished = finished;
            to.destroyed = destroyed;
            to.blockLen = blockLen;
            to.outputLen = outputLen;
            to.oHash = oHash._cloneInto(to.oHash);
            to.iHash = iHash._cloneInto(to.iHash);
            return to;
        }
        destroy() {
            this.destroyed = true;
            this.oHash.destroy();
            this.iHash.destroy();
        }
    };
    /**
     * HMAC: RFC2104 message authentication code.
     * @param hash - function that would be used e.g. sha256
     * @param key - message key
     * @param message - message data
     */
    const hmac$1 = (hash, key, message) => new HMAC$1(hash, key).update(message).digest();
    hmac$1.create = (hash, key) => new HMAC$1(hash, key);

    /*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    // connects noble-curves to noble-hashes
    function getHash(hash) {
        return {
            hash,
            hmac: (key, ...msgs) => hmac$1(hash, key, concatBytes$2(...msgs)),
            randomBytes: randomBytes$1,
        };
    }
    function createCurve(curveDef, defHash) {
        const create = (hash) => weierstrass({ ...curveDef, ...getHash(hash) });
        return Object.freeze({ ...create(defHash), create });
    }

    /*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    const secp256k1P = BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f');
    const secp256k1N = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
    const _1n = BigInt(1);
    const _2n = BigInt(2);
    const divNearest = (a, b) => (a + b / _2n) / b;
    /**
     * √n = n^((p+1)/4) for fields p = 3 mod 4. We unwrap the loop and multiply bit-by-bit.
     * (P+1n/4n).toString(2) would produce bits [223x 1, 0, 22x 1, 4x 0, 11, 00]
     */
    function sqrtMod(y) {
        const P = secp256k1P;
        // prettier-ignore
        const _3n = BigInt(3), _6n = BigInt(6), _11n = BigInt(11), _22n = BigInt(22);
        // prettier-ignore
        const _23n = BigInt(23), _44n = BigInt(44), _88n = BigInt(88);
        const b2 = (y * y * y) % P; // x^3, 11
        const b3 = (b2 * b2 * y) % P; // x^7
        const b6 = (pow2(b3, _3n, P) * b3) % P;
        const b9 = (pow2(b6, _3n, P) * b3) % P;
        const b11 = (pow2(b9, _2n, P) * b2) % P;
        const b22 = (pow2(b11, _11n, P) * b11) % P;
        const b44 = (pow2(b22, _22n, P) * b22) % P;
        const b88 = (pow2(b44, _44n, P) * b44) % P;
        const b176 = (pow2(b88, _88n, P) * b88) % P;
        const b220 = (pow2(b176, _44n, P) * b44) % P;
        const b223 = (pow2(b220, _3n, P) * b3) % P;
        const t1 = (pow2(b223, _23n, P) * b22) % P;
        const t2 = (pow2(t1, _6n, P) * b2) % P;
        const root = pow2(t2, _2n, P);
        if (!Fp.eql(Fp.sqr(root), y))
            throw new Error('Cannot find square root');
        return root;
    }
    const Fp = Field(secp256k1P, undefined, undefined, { sqrt: sqrtMod });
    const secp256k1 = createCurve({
        a: BigInt(0),
        b: BigInt(7),
        Fp,
        n: secp256k1N,
        // Base point (x, y) aka generator point
        Gx: BigInt('55066263022277343669578718895168534326250603453777594175500187360389116729240'),
        Gy: BigInt('32670510020758816978083085130507043184471273380659243275938904335757337482424'),
        h: BigInt(1),
        lowS: true,
        /**
         * secp256k1 belongs to Koblitz curves: it has efficiently computable endomorphism.
         * Endomorphism uses 2x less RAM, speeds up precomputation by 2x and ECDH / key recovery by 20%.
         * For precomputed wNAF it trades off 1/2 init time & 1/3 ram for 20% perf hit.
         * Explanation: https://gist.github.com/paulmillr/eb670806793e84df628a7c434a873066
         */
        endo: {
            beta: BigInt('0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee'),
            splitScalar: (k) => {
                const n = secp256k1N;
                const a1 = BigInt('0x3086d221a7d46bcde86c90e49284eb15');
                const b1 = -_1n * BigInt('0xe4437ed6010e88286f547fa90abfe4c3');
                const a2 = BigInt('0x114ca50f7a8e2f3f657c1108d9d44cfd8');
                const b2 = a1;
                const POW_2_128 = BigInt('0x100000000000000000000000000000000'); // (2n**128n).toString(16)
                const c1 = divNearest(b2 * k, n);
                const c2 = divNearest(-b1 * k, n);
                let k1 = mod(k - c1 * a1 - c2 * a2, n);
                let k2 = mod(-c1 * b1 - c2 * b2, n);
                const k1neg = k1 > POW_2_128;
                const k2neg = k2 > POW_2_128;
                if (k1neg)
                    k1 = n - k1;
                if (k2neg)
                    k2 = n - k2;
                if (k1 > POW_2_128 || k2 > POW_2_128) {
                    throw new Error('splitScalar: Endomorphism failed, k=' + k);
                }
                return { k1neg, k1, k2neg, k2 };
            },
        },
    }, sha256$1);
    // Schnorr signatures are superior to ECDSA from above. Below is Schnorr-specific BIP0340 code.
    // https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki
    const _0n = BigInt(0);
    const fe = (x) => typeof x === 'bigint' && _0n < x && x < secp256k1P;
    const ge = (x) => typeof x === 'bigint' && _0n < x && x < secp256k1N;
    /** An object mapping tags to their tagged hash prefix of [SHA256(tag) | SHA256(tag)] */
    const TAGGED_HASH_PREFIXES = {};
    function taggedHash(tag, ...messages) {
        let tagP = TAGGED_HASH_PREFIXES[tag];
        if (tagP === undefined) {
            const tagH = sha256$1(Uint8Array.from(tag, (c) => c.charCodeAt(0)));
            tagP = concatBytes$1(tagH, tagH);
            TAGGED_HASH_PREFIXES[tag] = tagP;
        }
        return sha256$1(concatBytes$1(tagP, ...messages));
    }
    // ECDSA compact points are 33-byte. Schnorr is 32: we strip first byte 0x02 or 0x03
    const pointToBytes = (point) => point.toRawBytes(true).slice(1);
    const numTo32b = (n) => numberToBytesBE(n, 32);
    const modP = (x) => mod(x, secp256k1P);
    const modN = (x) => mod(x, secp256k1N);
    const Point = secp256k1.ProjectivePoint;
    const GmulAdd = (Q, a, b) => Point.BASE.multiplyAndAddUnsafe(Q, a, b);
    // Calculate point, scalar and bytes
    function schnorrGetExtPubKey(priv) {
        let d_ = secp256k1.utils.normPrivateKeyToScalar(priv); // same method executed in fromPrivateKey
        let p = Point.fromPrivateKey(d_); // P = d'⋅G; 0 < d' < n check is done inside
        const scalar = p.hasEvenY() ? d_ : modN(-d_);
        return { scalar: scalar, bytes: pointToBytes(p) };
    }
    /**
     * lift_x from BIP340. Convert 32-byte x coordinate to elliptic curve point.
     * @returns valid point checked for being on-curve
     */
    function lift_x(x) {
        if (!fe(x))
            throw new Error('bad x: need 0 < x < p'); // Fail if x ≥ p.
        const xx = modP(x * x);
        const c = modP(xx * x + BigInt(7)); // Let c = x³ + 7 mod p.
        let y = sqrtMod(c); // Let y = c^(p+1)/4 mod p.
        if (y % _2n !== _0n)
            y = modP(-y); // Return the unique point P such that x(P) = x and
        const p = new Point(x, y, _1n); // y(P) = y if y mod 2 = 0 or y(P) = p-y otherwise.
        p.assertValidity();
        return p;
    }
    /**
     * Create tagged hash, convert it to bigint, reduce modulo-n.
     */
    function challenge(...args) {
        return modN(bytesToNumberBE(taggedHash('BIP0340/challenge', ...args)));
    }
    /**
     * Schnorr public key is just `x` coordinate of Point as per BIP340.
     */
    function schnorrGetPublicKey(privateKey) {
        return schnorrGetExtPubKey(privateKey).bytes; // d'=int(sk). Fail if d'=0 or d'≥n. Ret bytes(d'⋅G)
    }
    /**
     * Creates Schnorr signature as per BIP340. Verifies itself before returning anything.
     * auxRand is optional and is not the sole source of k generation: bad CSPRNG won't be dangerous.
     */
    function schnorrSign(message, privateKey, auxRand = randomBytes$1(32)) {
        const m = ensureBytes('message', message);
        const { bytes: px, scalar: d } = schnorrGetExtPubKey(privateKey); // checks for isWithinCurveOrder
        const a = ensureBytes('auxRand', auxRand, 32); // Auxiliary random data a: a 32-byte array
        const t = numTo32b(d ^ bytesToNumberBE(taggedHash('BIP0340/aux', a))); // Let t be the byte-wise xor of bytes(d) and hash/aux(a)
        const rand = taggedHash('BIP0340/nonce', t, px, m); // Let rand = hash/nonce(t || bytes(P) || m)
        const k_ = modN(bytesToNumberBE(rand)); // Let k' = int(rand) mod n
        if (k_ === _0n)
            throw new Error('sign failed: k is zero'); // Fail if k' = 0.
        const { bytes: rx, scalar: k } = schnorrGetExtPubKey(k_); // Let R = k'⋅G.
        const e = challenge(rx, px, m); // Let e = int(hash/challenge(bytes(R) || bytes(P) || m)) mod n.
        const sig = new Uint8Array(64); // Let sig = bytes(R) || bytes((k + ed) mod n).
        sig.set(rx, 0);
        sig.set(numTo32b(modN(k + e * d)), 32);
        // If Verify(bytes(P), m, sig) (see below) returns failure, abort
        if (!schnorrVerify(sig, m, px))
            throw new Error('sign: Invalid signature produced');
        return sig;
    }
    /**
     * Verifies Schnorr signature.
     * Will swallow errors & return false except for initial type validation of arguments.
     */
    function schnorrVerify(signature, message, publicKey) {
        const sig = ensureBytes('signature', signature, 64);
        const m = ensureBytes('message', message);
        const pub = ensureBytes('publicKey', publicKey, 32);
        try {
            const P = lift_x(bytesToNumberBE(pub)); // P = lift_x(int(pk)); fail if that fails
            const r = bytesToNumberBE(sig.subarray(0, 32)); // Let r = int(sig[0:32]); fail if r ≥ p.
            if (!fe(r))
                return false;
            const s = bytesToNumberBE(sig.subarray(32, 64)); // Let s = int(sig[32:64]); fail if s ≥ n.
            if (!ge(s))
                return false;
            const e = challenge(numTo32b(r), pointToBytes(P), m); // int(challenge(bytes(r)||bytes(P)||m))%n
            const R = GmulAdd(P, s, modN(-e)); // R = s⋅G - e⋅P
            if (!R || !R.hasEvenY() || R.toAffine().x !== r)
                return false; // -eP == (n-e)P
            return true; // Fail if is_infinite(R) / not has_even_y(R) / x(R) ≠ r.
        }
        catch (error) {
            return false;
        }
    }
    const schnorr = /* @__PURE__ */ (() => ({
        getPublicKey: schnorrGetPublicKey,
        sign: schnorrSign,
        verify: schnorrVerify,
        utils: {
            randomPrivateKey: secp256k1.utils.randomPrivateKey,
            lift_x,
            pointToBytes,
            numberToBytesBE,
            bytesToNumberBE,
            taggedHash,
            mod,
        },
    }))();

    const crypto = typeof globalThis === 'object' && 'crypto' in globalThis ? globalThis.crypto : undefined;

    /*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    // We use WebCrypto aka globalThis.crypto, which exists in browsers and node.js 16+.
    // node.js versions earlier than v19 don't declare it in global scope.
    // For node.js, package.json#exports field mapping rewrites import
    // from `crypto` to `cryptoNode`, which imports native module.
    // Makes the utils un-importable in browsers without a bundler.
    // Once node.js 18 is deprecated, we can just drop the import.
    const u8a = (a) => a instanceof Uint8Array;
    // Cast array to view
    const createView = (arr) => new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
    // The rotate right (circular right shift) operation for uint32
    const rotr = (word, shift) => (word << (32 - shift)) | (word >>> shift);
    // big-endian hardware is rare. Just in case someone still decides to run hashes:
    // early-throw an error because we don't support BE yet.
    const isLE$1 = new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44;
    if (!isLE$1)
        throw new Error('Non little-endian hardware is not supported');
    const hexes = Array.from({ length: 256 }, (v, i) => i.toString(16).padStart(2, '0'));
    /**
     * @example bytesToHex(Uint8Array.from([0xca, 0xfe, 0x01, 0x23])) // 'cafe0123'
     */
    function bytesToHex(bytes) {
        if (!u8a(bytes))
            throw new Error('Uint8Array expected');
        // pre-caching improves the speed 6x
        let hex = '';
        for (let i = 0; i < bytes.length; i++) {
            hex += hexes[bytes[i]];
        }
        return hex;
    }
    /**
     * @example hexToBytes('cafe0123') // Uint8Array.from([0xca, 0xfe, 0x01, 0x23])
     */
    function hexToBytes(hex) {
        if (typeof hex !== 'string')
            throw new Error('hex string expected, got ' + typeof hex);
        const len = hex.length;
        if (len % 2)
            throw new Error('padded hex string expected, got unpadded hex of length ' + len);
        const array = new Uint8Array(len / 2);
        for (let i = 0; i < array.length; i++) {
            const j = i * 2;
            const hexByte = hex.slice(j, j + 2);
            const byte = Number.parseInt(hexByte, 16);
            if (Number.isNaN(byte) || byte < 0)
                throw new Error('Invalid byte sequence');
            array[i] = byte;
        }
        return array;
    }
    /**
     * @example utf8ToBytes('abc') // new Uint8Array([97, 98, 99])
     */
    function utf8ToBytes(str) {
        if (typeof str !== 'string')
            throw new Error(`utf8ToBytes expected string, got ${typeof str}`);
        return new Uint8Array(new TextEncoder().encode(str)); // https://bugzil.la/1681809
    }
    /**
     * Normalizes (non-hex) string or Uint8Array to Uint8Array.
     * Warning: when Uint8Array is passed, it would NOT get copied.
     * Keep in mind for future mutable operations.
     */
    function toBytes(data) {
        if (typeof data === 'string')
            data = utf8ToBytes(data);
        if (!u8a(data))
            throw new Error(`expected Uint8Array, got ${typeof data}`);
        return data;
    }
    /**
     * Copies several Uint8Arrays into one.
     */
    function concatBytes(...arrays) {
        const r = new Uint8Array(arrays.reduce((sum, a) => sum + a.length, 0));
        let pad = 0; // walk through each item, ensure they have proper type
        arrays.forEach((a) => {
            if (!u8a(a))
                throw new Error('Uint8Array expected');
            r.set(a, pad);
            pad += a.length;
        });
        return r;
    }
    // For runtime check if class implements interface
    class Hash {
        // Safe version that clones internal state
        clone() {
            return this._cloneInto();
        }
    }
    function wrapConstructor(hashCons) {
        const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
        const tmp = hashCons();
        hashC.outputLen = tmp.outputLen;
        hashC.blockLen = tmp.blockLen;
        hashC.create = () => hashCons();
        return hashC;
    }
    /**
     * Secure PRNG. Uses `crypto.getRandomValues`, which defers to OS.
     */
    function randomBytes(bytesLength = 32) {
        if (crypto && typeof crypto.getRandomValues === 'function') {
            return crypto.getRandomValues(new Uint8Array(bytesLength));
        }
        throw new Error('crypto.getRandomValues must be defined');
    }

    function number$1(n) {
        if (!Number.isSafeInteger(n) || n < 0)
            throw new Error(`Wrong positive integer: ${n}`);
    }
    function bool$1(b) {
        if (typeof b !== 'boolean')
            throw new Error(`Expected boolean, not ${b}`);
    }
    function bytes$1(b, ...lengths) {
        if (!(b instanceof Uint8Array))
            throw new Error('Expected Uint8Array');
        if (lengths.length > 0 && !lengths.includes(b.length))
            throw new Error(`Expected Uint8Array of length ${lengths}, not of length=${b.length}`);
    }
    function hash(hash) {
        if (typeof hash !== 'function' || typeof hash.create !== 'function')
            throw new Error('Hash should be wrapped by utils.wrapConstructor');
        number$1(hash.outputLen);
        number$1(hash.blockLen);
    }
    function exists(instance, checkFinished = true) {
        if (instance.destroyed)
            throw new Error('Hash instance has been destroyed');
        if (checkFinished && instance.finished)
            throw new Error('Hash#digest() has already been called');
    }
    function output(out, instance) {
        bytes$1(out);
        const min = instance.outputLen;
        if (out.length < min) {
            throw new Error(`digestInto() expects output buffer of length at least ${min}`);
        }
    }
    const assert = {
        number: number$1,
        bool: bool$1,
        bytes: bytes$1,
        hash,
        exists,
        output,
    };

    // Polyfill for Safari 14
    function setBigUint64(view, byteOffset, value, isLE) {
        if (typeof view.setBigUint64 === 'function')
            return view.setBigUint64(byteOffset, value, isLE);
        const _32n = BigInt(32);
        const _u32_max = BigInt(0xffffffff);
        const wh = Number((value >> _32n) & _u32_max);
        const wl = Number(value & _u32_max);
        const h = isLE ? 4 : 0;
        const l = isLE ? 0 : 4;
        view.setUint32(byteOffset + h, wh, isLE);
        view.setUint32(byteOffset + l, wl, isLE);
    }
    // Base SHA2 class (RFC 6234)
    class SHA2 extends Hash {
        constructor(blockLen, outputLen, padOffset, isLE) {
            super();
            this.blockLen = blockLen;
            this.outputLen = outputLen;
            this.padOffset = padOffset;
            this.isLE = isLE;
            this.finished = false;
            this.length = 0;
            this.pos = 0;
            this.destroyed = false;
            this.buffer = new Uint8Array(blockLen);
            this.view = createView(this.buffer);
        }
        update(data) {
            assert.exists(this);
            const { view, buffer, blockLen } = this;
            data = toBytes(data);
            const len = data.length;
            for (let pos = 0; pos < len;) {
                const take = Math.min(blockLen - this.pos, len - pos);
                // Fast path: we have at least one block in input, cast it to view and process
                if (take === blockLen) {
                    const dataView = createView(data);
                    for (; blockLen <= len - pos; pos += blockLen)
                        this.process(dataView, pos);
                    continue;
                }
                buffer.set(data.subarray(pos, pos + take), this.pos);
                this.pos += take;
                pos += take;
                if (this.pos === blockLen) {
                    this.process(view, 0);
                    this.pos = 0;
                }
            }
            this.length += data.length;
            this.roundClean();
            return this;
        }
        digestInto(out) {
            assert.exists(this);
            assert.output(out, this);
            this.finished = true;
            // Padding
            // We can avoid allocation of buffer for padding completely if it
            // was previously not allocated here. But it won't change performance.
            const { buffer, view, blockLen, isLE } = this;
            let { pos } = this;
            // append the bit '1' to the message
            buffer[pos++] = 0b10000000;
            this.buffer.subarray(pos).fill(0);
            // we have less than padOffset left in buffer, so we cannot put length in current block, need process it and pad again
            if (this.padOffset > blockLen - pos) {
                this.process(view, 0);
                pos = 0;
            }
            // Pad until full block byte with zeros
            for (let i = pos; i < blockLen; i++)
                buffer[i] = 0;
            // Note: sha512 requires length to be 128bit integer, but length in JS will overflow before that
            // You need to write around 2 exabytes (u64_max / 8 / (1024**6)) for this to happen.
            // So we just write lowest 64 bits of that value.
            setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE);
            this.process(view, 0);
            const oview = createView(out);
            const len = this.outputLen;
            // NOTE: we do division by 4 later, which should be fused in single op with modulo by JIT
            if (len % 4)
                throw new Error('_sha2: outputLen should be aligned to 32bit');
            const outLen = len / 4;
            const state = this.get();
            if (outLen > state.length)
                throw new Error('_sha2: outputLen bigger than state');
            for (let i = 0; i < outLen; i++)
                oview.setUint32(4 * i, state[i], isLE);
        }
        digest() {
            const { buffer, outputLen } = this;
            this.digestInto(buffer);
            const res = buffer.slice(0, outputLen);
            this.destroy();
            return res;
        }
        _cloneInto(to) {
            to || (to = new this.constructor());
            to.set(...this.get());
            const { blockLen, buffer, length, finished, destroyed, pos } = this;
            to.length = length;
            to.pos = pos;
            to.finished = finished;
            to.destroyed = destroyed;
            if (length % blockLen)
                to.buffer.set(buffer);
            return to;
        }
    }

    // Choice: a ? b : c
    const Chi = (a, b, c) => (a & b) ^ (~a & c);
    // Majority function, true if any two inpust is true
    const Maj = (a, b, c) => (a & b) ^ (a & c) ^ (b & c);
    // Round constants:
    // first 32 bits of the fractional parts of the cube roots of the first 64 primes 2..311)
    // prettier-ignore
    const SHA256_K = new Uint32Array([
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ]);
    // Initial state (first 32 bits of the fractional parts of the square roots of the first 8 primes 2..19):
    // prettier-ignore
    const IV = new Uint32Array([
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ]);
    // Temporary buffer, not used to store anything between runs
    // Named this way because it matches specification.
    const SHA256_W = new Uint32Array(64);
    class SHA256 extends SHA2 {
        constructor() {
            super(64, 32, 8, false);
            // We cannot use array here since array allows indexing by variable
            // which means optimizer/compiler cannot use registers.
            this.A = IV[0] | 0;
            this.B = IV[1] | 0;
            this.C = IV[2] | 0;
            this.D = IV[3] | 0;
            this.E = IV[4] | 0;
            this.F = IV[5] | 0;
            this.G = IV[6] | 0;
            this.H = IV[7] | 0;
        }
        get() {
            const { A, B, C, D, E, F, G, H } = this;
            return [A, B, C, D, E, F, G, H];
        }
        // prettier-ignore
        set(A, B, C, D, E, F, G, H) {
            this.A = A | 0;
            this.B = B | 0;
            this.C = C | 0;
            this.D = D | 0;
            this.E = E | 0;
            this.F = F | 0;
            this.G = G | 0;
            this.H = H | 0;
        }
        process(view, offset) {
            // Extend the first 16 words into the remaining 48 words w[16..63] of the message schedule array
            for (let i = 0; i < 16; i++, offset += 4)
                SHA256_W[i] = view.getUint32(offset, false);
            for (let i = 16; i < 64; i++) {
                const W15 = SHA256_W[i - 15];
                const W2 = SHA256_W[i - 2];
                const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ (W15 >>> 3);
                const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ (W2 >>> 10);
                SHA256_W[i] = (s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16]) | 0;
            }
            // Compression function main loop, 64 rounds
            let { A, B, C, D, E, F, G, H } = this;
            for (let i = 0; i < 64; i++) {
                const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
                const T1 = (H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i]) | 0;
                const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
                const T2 = (sigma0 + Maj(A, B, C)) | 0;
                H = G;
                G = F;
                F = E;
                E = (D + T1) | 0;
                D = C;
                C = B;
                B = A;
                A = (T1 + T2) | 0;
            }
            // Add the compressed chunk to the current hash value
            A = (A + this.A) | 0;
            B = (B + this.B) | 0;
            C = (C + this.C) | 0;
            D = (D + this.D) | 0;
            E = (E + this.E) | 0;
            F = (F + this.F) | 0;
            G = (G + this.G) | 0;
            H = (H + this.H) | 0;
            this.set(A, B, C, D, E, F, G, H);
        }
        roundClean() {
            SHA256_W.fill(0);
        }
        destroy() {
            this.set(0, 0, 0, 0, 0, 0, 0, 0);
            this.buffer.fill(0);
        }
    }
    // Constants from https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf
    class SHA224 extends SHA256 {
        constructor() {
            super();
            this.A = 0xc1059ed8 | 0;
            this.B = 0x367cd507 | 0;
            this.C = 0x3070dd17 | 0;
            this.D = 0xf70e5939 | 0;
            this.E = 0xffc00b31 | 0;
            this.F = 0x68581511 | 0;
            this.G = 0x64f98fa7 | 0;
            this.H = 0xbefa4fa4 | 0;
            this.outputLen = 28;
        }
    }
    /**
     * SHA2-256 hash function
     * @param message - data that would be hashed
     */
    const sha256 = wrapConstructor(() => new SHA256());
    wrapConstructor(() => new SHA224());

    /*! scure-base - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    function assertNumber(n) {
        if (!Number.isSafeInteger(n))
            throw new Error(`Wrong integer: ${n}`);
    }
    function chain(...args) {
        const wrap = (a, b) => (c) => a(b(c));
        const encode = Array.from(args)
            .reverse()
            .reduce((acc, i) => (acc ? wrap(acc, i.encode) : i.encode), undefined);
        const decode = args.reduce((acc, i) => (acc ? wrap(acc, i.decode) : i.decode), undefined);
        return { encode, decode };
    }
    function alphabet(alphabet) {
        return {
            encode: (digits) => {
                if (!Array.isArray(digits) || (digits.length && typeof digits[0] !== 'number'))
                    throw new Error('alphabet.encode input should be an array of numbers');
                return digits.map((i) => {
                    assertNumber(i);
                    if (i < 0 || i >= alphabet.length)
                        throw new Error(`Digit index outside alphabet: ${i} (alphabet: ${alphabet.length})`);
                    return alphabet[i];
                });
            },
            decode: (input) => {
                if (!Array.isArray(input) || (input.length && typeof input[0] !== 'string'))
                    throw new Error('alphabet.decode input should be array of strings');
                return input.map((letter) => {
                    if (typeof letter !== 'string')
                        throw new Error(`alphabet.decode: not string element=${letter}`);
                    const index = alphabet.indexOf(letter);
                    if (index === -1)
                        throw new Error(`Unknown letter: "${letter}". Allowed: ${alphabet}`);
                    return index;
                });
            },
        };
    }
    function join(separator = '') {
        if (typeof separator !== 'string')
            throw new Error('join separator should be string');
        return {
            encode: (from) => {
                if (!Array.isArray(from) || (from.length && typeof from[0] !== 'string'))
                    throw new Error('join.encode input should be array of strings');
                for (let i of from)
                    if (typeof i !== 'string')
                        throw new Error(`join.encode: non-string input=${i}`);
                return from.join(separator);
            },
            decode: (to) => {
                if (typeof to !== 'string')
                    throw new Error('join.decode input should be string');
                return to.split(separator);
            },
        };
    }
    function padding(bits, chr = '=') {
        assertNumber(bits);
        if (typeof chr !== 'string')
            throw new Error('padding chr should be string');
        return {
            encode(data) {
                if (!Array.isArray(data) || (data.length && typeof data[0] !== 'string'))
                    throw new Error('padding.encode input should be array of strings');
                for (let i of data)
                    if (typeof i !== 'string')
                        throw new Error(`padding.encode: non-string input=${i}`);
                while ((data.length * bits) % 8)
                    data.push(chr);
                return data;
            },
            decode(input) {
                if (!Array.isArray(input) || (input.length && typeof input[0] !== 'string'))
                    throw new Error('padding.encode input should be array of strings');
                for (let i of input)
                    if (typeof i !== 'string')
                        throw new Error(`padding.decode: non-string input=${i}`);
                let end = input.length;
                if ((end * bits) % 8)
                    throw new Error('Invalid padding: string should have whole number of bytes');
                for (; end > 0 && input[end - 1] === chr; end--) {
                    if (!(((end - 1) * bits) % 8))
                        throw new Error('Invalid padding: string has too much padding');
                }
                return input.slice(0, end);
            },
        };
    }
    function normalize(fn) {
        if (typeof fn !== 'function')
            throw new Error('normalize fn should be function');
        return { encode: (from) => from, decode: (to) => fn(to) };
    }
    function convertRadix(data, from, to) {
        if (from < 2)
            throw new Error(`convertRadix: wrong from=${from}, base cannot be less than 2`);
        if (to < 2)
            throw new Error(`convertRadix: wrong to=${to}, base cannot be less than 2`);
        if (!Array.isArray(data))
            throw new Error('convertRadix: data should be array');
        if (!data.length)
            return [];
        let pos = 0;
        const res = [];
        const digits = Array.from(data);
        digits.forEach((d) => {
            assertNumber(d);
            if (d < 0 || d >= from)
                throw new Error(`Wrong integer: ${d}`);
        });
        while (true) {
            let carry = 0;
            let done = true;
            for (let i = pos; i < digits.length; i++) {
                const digit = digits[i];
                const digitBase = from * carry + digit;
                if (!Number.isSafeInteger(digitBase) ||
                    (from * carry) / from !== carry ||
                    digitBase - digit !== from * carry) {
                    throw new Error('convertRadix: carry overflow');
                }
                carry = digitBase % to;
                digits[i] = Math.floor(digitBase / to);
                if (!Number.isSafeInteger(digits[i]) || digits[i] * to + carry !== digitBase)
                    throw new Error('convertRadix: carry overflow');
                if (!done)
                    continue;
                else if (!digits[i])
                    pos = i;
                else
                    done = false;
            }
            res.push(carry);
            if (done)
                break;
        }
        for (let i = 0; i < data.length - 1 && data[i] === 0; i++)
            res.push(0);
        return res.reverse();
    }
    const gcd = (a, b) => (!b ? a : gcd(b, a % b));
    const radix2carry = (from, to) => from + (to - gcd(from, to));
    function convertRadix2(data, from, to, padding) {
        if (!Array.isArray(data))
            throw new Error('convertRadix2: data should be array');
        if (from <= 0 || from > 32)
            throw new Error(`convertRadix2: wrong from=${from}`);
        if (to <= 0 || to > 32)
            throw new Error(`convertRadix2: wrong to=${to}`);
        if (radix2carry(from, to) > 32) {
            throw new Error(`convertRadix2: carry overflow from=${from} to=${to} carryBits=${radix2carry(from, to)}`);
        }
        let carry = 0;
        let pos = 0;
        const mask = 2 ** to - 1;
        const res = [];
        for (const n of data) {
            assertNumber(n);
            if (n >= 2 ** from)
                throw new Error(`convertRadix2: invalid data word=${n} from=${from}`);
            carry = (carry << from) | n;
            if (pos + from > 32)
                throw new Error(`convertRadix2: carry overflow pos=${pos} from=${from}`);
            pos += from;
            for (; pos >= to; pos -= to)
                res.push(((carry >> (pos - to)) & mask) >>> 0);
            carry &= 2 ** pos - 1;
        }
        carry = (carry << (to - pos)) & mask;
        if (!padding && pos >= from)
            throw new Error('Excess padding');
        if (!padding && carry)
            throw new Error(`Non-zero padding: ${carry}`);
        if (padding && pos > 0)
            res.push(carry >>> 0);
        return res;
    }
    function radix(num) {
        assertNumber(num);
        return {
            encode: (bytes) => {
                if (!(bytes instanceof Uint8Array))
                    throw new Error('radix.encode input should be Uint8Array');
                return convertRadix(Array.from(bytes), 2 ** 8, num);
            },
            decode: (digits) => {
                if (!Array.isArray(digits) || (digits.length && typeof digits[0] !== 'number'))
                    throw new Error('radix.decode input should be array of strings');
                return Uint8Array.from(convertRadix(digits, num, 2 ** 8));
            },
        };
    }
    function radix2(bits, revPadding = false) {
        assertNumber(bits);
        if (bits <= 0 || bits > 32)
            throw new Error('radix2: bits should be in (0..32]');
        if (radix2carry(8, bits) > 32 || radix2carry(bits, 8) > 32)
            throw new Error('radix2: carry overflow');
        return {
            encode: (bytes) => {
                if (!(bytes instanceof Uint8Array))
                    throw new Error('radix2.encode input should be Uint8Array');
                return convertRadix2(Array.from(bytes), 8, bits, !revPadding);
            },
            decode: (digits) => {
                if (!Array.isArray(digits) || (digits.length && typeof digits[0] !== 'number'))
                    throw new Error('radix2.decode input should be array of strings');
                return Uint8Array.from(convertRadix2(digits, bits, 8, revPadding));
            },
        };
    }
    function unsafeWrapper(fn) {
        if (typeof fn !== 'function')
            throw new Error('unsafeWrapper fn should be function');
        return function (...args) {
            try {
                return fn.apply(null, args);
            }
            catch (e) { }
        };
    }
    const base16 = chain(radix2(4), alphabet('0123456789ABCDEF'), join(''));
    const base32 = chain(radix2(5), alphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'), padding(5), join(''));
    chain(radix2(5), alphabet('0123456789ABCDEFGHIJKLMNOPQRSTUV'), padding(5), join(''));
    chain(radix2(5), alphabet('0123456789ABCDEFGHJKMNPQRSTVWXYZ'), join(''), normalize((s) => s.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1')));
    const base64 = chain(radix2(6), alphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'), padding(6), join(''));
    const base64url = chain(radix2(6), alphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'), padding(6), join(''));
    const genBase58 = (abc) => chain(radix(58), alphabet(abc), join(''));
    const base58 = genBase58('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz');
    genBase58('123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ');
    genBase58('rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz');
    const XMR_BLOCK_LEN = [0, 2, 3, 5, 6, 7, 9, 10, 11];
    const base58xmr = {
        encode(data) {
            let res = '';
            for (let i = 0; i < data.length; i += 8) {
                const block = data.subarray(i, i + 8);
                res += base58.encode(block).padStart(XMR_BLOCK_LEN[block.length], '1');
            }
            return res;
        },
        decode(str) {
            let res = [];
            for (let i = 0; i < str.length; i += 11) {
                const slice = str.slice(i, i + 11);
                const blockLen = XMR_BLOCK_LEN.indexOf(slice.length);
                const block = base58.decode(slice);
                for (let j = 0; j < block.length - blockLen; j++) {
                    if (block[j] !== 0)
                        throw new Error('base58xmr: wrong padding');
                }
                res = res.concat(Array.from(block.slice(block.length - blockLen)));
            }
            return Uint8Array.from(res);
        },
    };
    const BECH_ALPHABET = chain(alphabet('qpzry9x8gf2tvdw0s3jn54khce6mua7l'), join(''));
    const POLYMOD_GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    function bech32Polymod(pre) {
        const b = pre >> 25;
        let chk = (pre & 0x1ffffff) << 5;
        for (let i = 0; i < POLYMOD_GENERATORS.length; i++) {
            if (((b >> i) & 1) === 1)
                chk ^= POLYMOD_GENERATORS[i];
        }
        return chk;
    }
    function bechChecksum(prefix, words, encodingConst = 1) {
        const len = prefix.length;
        let chk = 1;
        for (let i = 0; i < len; i++) {
            const c = prefix.charCodeAt(i);
            if (c < 33 || c > 126)
                throw new Error(`Invalid prefix (${prefix})`);
            chk = bech32Polymod(chk) ^ (c >> 5);
        }
        chk = bech32Polymod(chk);
        for (let i = 0; i < len; i++)
            chk = bech32Polymod(chk) ^ (prefix.charCodeAt(i) & 0x1f);
        for (let v of words)
            chk = bech32Polymod(chk) ^ v;
        for (let i = 0; i < 6; i++)
            chk = bech32Polymod(chk);
        chk ^= encodingConst;
        return BECH_ALPHABET.encode(convertRadix2([chk % 2 ** 30], 30, 5, false));
    }
    function genBech32(encoding) {
        const ENCODING_CONST = encoding === 'bech32' ? 1 : 0x2bc830a3;
        const _words = radix2(5);
        const fromWords = _words.decode;
        const toWords = _words.encode;
        const fromWordsUnsafe = unsafeWrapper(fromWords);
        function encode(prefix, words, limit = 90) {
            if (typeof prefix !== 'string')
                throw new Error(`bech32.encode prefix should be string, not ${typeof prefix}`);
            if (!Array.isArray(words) || (words.length && typeof words[0] !== 'number'))
                throw new Error(`bech32.encode words should be array of numbers, not ${typeof words}`);
            const actualLength = prefix.length + 7 + words.length;
            if (limit !== false && actualLength > limit)
                throw new TypeError(`Length ${actualLength} exceeds limit ${limit}`);
            prefix = prefix.toLowerCase();
            return `${prefix}1${BECH_ALPHABET.encode(words)}${bechChecksum(prefix, words, ENCODING_CONST)}`;
        }
        function decode(str, limit = 90) {
            if (typeof str !== 'string')
                throw new Error(`bech32.decode input should be string, not ${typeof str}`);
            if (str.length < 8 || (limit !== false && str.length > limit))
                throw new TypeError(`Wrong string length: ${str.length} (${str}). Expected (8..${limit})`);
            const lowered = str.toLowerCase();
            if (str !== lowered && str !== str.toUpperCase())
                throw new Error(`String must be lowercase or uppercase`);
            str = lowered;
            const sepIndex = str.lastIndexOf('1');
            if (sepIndex === 0 || sepIndex === -1)
                throw new Error(`Letter "1" must be present between prefix and data only`);
            const prefix = str.slice(0, sepIndex);
            const _words = str.slice(sepIndex + 1);
            if (_words.length < 6)
                throw new Error('Data must be at least 6 characters long');
            const words = BECH_ALPHABET.decode(_words).slice(0, -6);
            const sum = bechChecksum(prefix, words, ENCODING_CONST);
            if (!_words.endsWith(sum))
                throw new Error(`Invalid checksum in ${str}: expected "${sum}"`);
            return { prefix, words };
        }
        const decodeUnsafe = unsafeWrapper(decode);
        function decodeToBytes(str) {
            const { prefix, words } = decode(str, false);
            return { prefix, words, bytes: fromWords(words) };
        }
        return { encode, decode, decodeToBytes, decodeUnsafe, fromWords, fromWordsUnsafe, toWords };
    }
    const bech32 = genBech32('bech32');
    genBech32('bech32m');
    const utf8 = {
        encode: (data) => new TextDecoder().decode(data),
        decode: (str) => new TextEncoder().encode(str),
    };
    const hex = chain(radix2(4), alphabet('0123456789abcdef'), join(''), normalize((s) => {
        if (typeof s !== 'string' || s.length % 2)
            throw new TypeError(`hex.decode: expected string, got ${typeof s} with length ${s.length}`);
        return s.toLowerCase();
    }));
    const CODERS = {
        utf8, hex, base16, base32, base64, base64url, base58, base58xmr
    };
`Invalid encoding type. Available types: ${Object.keys(CODERS).join(', ')}`;

    function number(n) {
        if (!Number.isSafeInteger(n) || n < 0)
            throw new Error(`positive integer expected, not ${n}`);
    }
    function bool(b) {
        if (typeof b !== 'boolean')
            throw new Error(`boolean expected, not ${b}`);
    }
    function isBytes(a) {
        return (a instanceof Uint8Array ||
            (a != null && typeof a === 'object' && a.constructor.name === 'Uint8Array'));
    }
    function bytes(b, ...lengths) {
        if (!isBytes(b))
            throw new Error('Uint8Array expected');
        if (lengths.length > 0 && !lengths.includes(b.length))
            throw new Error(`Uint8Array expected of length ${lengths}, not of length=${b.length}`);
    }

    /*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) */
    const u32 = (arr) => new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
    // big-endian hardware is rare. Just in case someone still decides to run ciphers:
    // early-throw an error because we don't support BE yet.
    const isLE = new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44;
    if (!isLE)
        throw new Error('Non little-endian hardware is not supported');
    function checkOpts(defaults, opts) {
        if (opts == null || typeof opts !== 'object')
            throw new Error('options must be defined');
        const merged = Object.assign(defaults, opts);
        return merged;
    }
    // Compares 2 u8a-s in kinda constant time
    function equalBytes(a, b) {
        if (a.length !== b.length)
            return false;
        let diff = 0;
        for (let i = 0; i < a.length; i++)
            diff |= a[i] ^ b[i];
        return diff === 0;
    }
    /**
     * @__NO_SIDE_EFFECTS__
     */
    const wrapCipher = (params, c) => {
        Object.assign(c, params);
        return c;
    };

    // prettier-ignore
    /*
    AES (Advanced Encryption Standard) aka Rijndael block cipher.

    Data is split into 128-bit blocks. Encrypted in 10/12/14 rounds (128/192/256 bits). In every round:
    1. **S-box**, table substitution
    2. **Shift rows**, cyclic shift left of all rows of data array
    3. **Mix columns**, multiplying every column by fixed polynomial
    4. **Add round key**, round_key xor i-th column of array

    Resources:
    - FIPS-197 https://csrc.nist.gov/files/pubs/fips/197/final/docs/fips-197.pdf
    - Original proposal: https://csrc.nist.gov/csrc/media/projects/cryptographic-standards-and-guidelines/documents/aes-development/rijndael-ammended.pdf
    */
    const BLOCK_SIZE = 16;
    const POLY = 0x11b; // 1 + x + x**3 + x**4 + x**8
    // TODO: remove multiplication, binary ops only
    function mul2(n) {
        return (n << 1) ^ (POLY & -(n >> 7));
    }
    function mul(a, b) {
        let res = 0;
        for (; b > 0; b >>= 1) {
            // Montgomery ladder
            res ^= a & -(b & 1); // if (b&1) res ^=a (but const-time).
            a = mul2(a); // a = 2*a
        }
        return res;
    }
    // AES S-box is generated using finite field inversion,
    // an affine transform, and xor of a constant 0x63.
    const sbox = /* @__PURE__ */ (() => {
        let t = new Uint8Array(256);
        for (let i = 0, x = 1; i < 256; i++, x ^= mul2(x))
            t[i] = x;
        const box = new Uint8Array(256);
        box[0] = 0x63; // first elm
        for (let i = 0; i < 255; i++) {
            let x = t[255 - i];
            x |= x << 8;
            box[t[i]] = (x ^ (x >> 4) ^ (x >> 5) ^ (x >> 6) ^ (x >> 7) ^ 0x63) & 0xff;
        }
        return box;
    })();
    // Inverted S-box
    const invSbox = /* @__PURE__ */ sbox.map((_, j) => sbox.indexOf(j));
    // Rotate u32 by 8
    const rotr32_8 = (n) => (n << 24) | (n >>> 8);
    const rotl32_8 = (n) => (n << 8) | (n >>> 24);
    // T-table is optimization suggested in 5.2 of original proposal (missed from FIPS-197). Changes:
    // - LE instead of BE
    // - bigger tables: T0 and T1 are merged into T01 table and T2 & T3 into T23;
    //   so index is u16, instead of u8. This speeds up things, unexpectedly
    function genTtable(sbox, fn) {
        if (sbox.length !== 256)
            throw new Error('Wrong sbox length');
        const T0 = new Uint32Array(256).map((_, j) => fn(sbox[j]));
        const T1 = T0.map(rotl32_8);
        const T2 = T1.map(rotl32_8);
        const T3 = T2.map(rotl32_8);
        const T01 = new Uint32Array(256 * 256);
        const T23 = new Uint32Array(256 * 256);
        const sbox2 = new Uint16Array(256 * 256);
        for (let i = 0; i < 256; i++) {
            for (let j = 0; j < 256; j++) {
                const idx = i * 256 + j;
                T01[idx] = T0[i] ^ T1[j];
                T23[idx] = T2[i] ^ T3[j];
                sbox2[idx] = (sbox[i] << 8) | sbox[j];
            }
        }
        return { sbox, sbox2, T0, T1, T2, T3, T01, T23 };
    }
    const tableEncoding = /* @__PURE__ */ genTtable(sbox, (s) => (mul(s, 3) << 24) | (s << 16) | (s << 8) | mul(s, 2));
    const tableDecoding = /* @__PURE__ */ genTtable(invSbox, (s) => (mul(s, 11) << 24) | (mul(s, 13) << 16) | (mul(s, 9) << 8) | mul(s, 14));
    const xPowers = /* @__PURE__ */ (() => {
        const p = new Uint8Array(16);
        for (let i = 0, x = 1; i < 16; i++, x = mul2(x))
            p[i] = x;
        return p;
    })();
    function expandKeyLE(key) {
        bytes(key);
        const len = key.length;
        if (![16, 24, 32].includes(len))
            throw new Error(`aes: wrong key size: should be 16, 24 or 32, got: ${len}`);
        const { sbox2 } = tableEncoding;
        const k32 = u32(key);
        const Nk = k32.length;
        const subByte = (n) => applySbox(sbox2, n, n, n, n);
        const xk = new Uint32Array(len + 28); // expanded key
        xk.set(k32);
        // 4.3.1 Key expansion
        for (let i = Nk; i < xk.length; i++) {
            let t = xk[i - 1];
            if (i % Nk === 0)
                t = subByte(rotr32_8(t)) ^ xPowers[i / Nk - 1];
            else if (Nk > 6 && i % Nk === 4)
                t = subByte(t);
            xk[i] = xk[i - Nk] ^ t;
        }
        return xk;
    }
    function expandKeyDecLE(key) {
        const encKey = expandKeyLE(key);
        const xk = encKey.slice();
        const Nk = encKey.length;
        const { sbox2 } = tableEncoding;
        const { T0, T1, T2, T3 } = tableDecoding;
        // Inverse key by chunks of 4 (rounds)
        for (let i = 0; i < Nk; i += 4) {
            for (let j = 0; j < 4; j++)
                xk[i + j] = encKey[Nk - i - 4 + j];
        }
        encKey.fill(0);
        // apply InvMixColumn except first & last round
        for (let i = 4; i < Nk - 4; i++) {
            const x = xk[i];
            const w = applySbox(sbox2, x, x, x, x);
            xk[i] = T0[w & 0xff] ^ T1[(w >>> 8) & 0xff] ^ T2[(w >>> 16) & 0xff] ^ T3[w >>> 24];
        }
        return xk;
    }
    // Apply tables
    function apply0123(T01, T23, s0, s1, s2, s3) {
        return (T01[((s0 << 8) & 0xff00) | ((s1 >>> 8) & 0xff)] ^
            T23[((s2 >>> 8) & 0xff00) | ((s3 >>> 24) & 0xff)]);
    }
    function applySbox(sbox2, s0, s1, s2, s3) {
        return (sbox2[(s0 & 0xff) | (s1 & 0xff00)] |
            (sbox2[((s2 >>> 16) & 0xff) | ((s3 >>> 16) & 0xff00)] << 16));
    }
    function encrypt$1(xk, s0, s1, s2, s3) {
        const { sbox2, T01, T23 } = tableEncoding;
        let k = 0;
        (s0 ^= xk[k++]), (s1 ^= xk[k++]), (s2 ^= xk[k++]), (s3 ^= xk[k++]);
        const rounds = xk.length / 4 - 2;
        for (let i = 0; i < rounds; i++) {
            const t0 = xk[k++] ^ apply0123(T01, T23, s0, s1, s2, s3);
            const t1 = xk[k++] ^ apply0123(T01, T23, s1, s2, s3, s0);
            const t2 = xk[k++] ^ apply0123(T01, T23, s2, s3, s0, s1);
            const t3 = xk[k++] ^ apply0123(T01, T23, s3, s0, s1, s2);
            (s0 = t0), (s1 = t1), (s2 = t2), (s3 = t3);
        }
        // last round (without mixcolumns, so using SBOX2 table)
        const t0 = xk[k++] ^ applySbox(sbox2, s0, s1, s2, s3);
        const t1 = xk[k++] ^ applySbox(sbox2, s1, s2, s3, s0);
        const t2 = xk[k++] ^ applySbox(sbox2, s2, s3, s0, s1);
        const t3 = xk[k++] ^ applySbox(sbox2, s3, s0, s1, s2);
        return { s0: t0, s1: t1, s2: t2, s3: t3 };
    }
    function decrypt$1(xk, s0, s1, s2, s3) {
        const { sbox2, T01, T23 } = tableDecoding;
        let k = 0;
        (s0 ^= xk[k++]), (s1 ^= xk[k++]), (s2 ^= xk[k++]), (s3 ^= xk[k++]);
        const rounds = xk.length / 4 - 2;
        for (let i = 0; i < rounds; i++) {
            const t0 = xk[k++] ^ apply0123(T01, T23, s0, s3, s2, s1);
            const t1 = xk[k++] ^ apply0123(T01, T23, s1, s0, s3, s2);
            const t2 = xk[k++] ^ apply0123(T01, T23, s2, s1, s0, s3);
            const t3 = xk[k++] ^ apply0123(T01, T23, s3, s2, s1, s0);
            (s0 = t0), (s1 = t1), (s2 = t2), (s3 = t3);
        }
        // Last round
        const t0 = xk[k++] ^ applySbox(sbox2, s0, s3, s2, s1);
        const t1 = xk[k++] ^ applySbox(sbox2, s1, s0, s3, s2);
        const t2 = xk[k++] ^ applySbox(sbox2, s2, s1, s0, s3);
        const t3 = xk[k++] ^ applySbox(sbox2, s3, s2, s1, s0);
        return { s0: t0, s1: t1, s2: t2, s3: t3 };
    }
    function getDst(len, dst) {
        if (!dst)
            return new Uint8Array(len);
        bytes(dst);
        if (dst.length < len)
            throw new Error(`aes: wrong destination length, expected at least ${len}, got: ${dst.length}`);
        return dst;
    }
    function validateBlockDecrypt(data) {
        bytes(data);
        if (data.length % BLOCK_SIZE !== 0) {
            throw new Error(`aes/(cbc-ecb).decrypt ciphertext should consist of blocks with size ${BLOCK_SIZE}`);
        }
    }
    function validateBlockEncrypt(plaintext, pcks5, dst) {
        let outLen = plaintext.length;
        const remaining = outLen % BLOCK_SIZE;
        if (!pcks5 && remaining !== 0)
            throw new Error('aec/(cbc-ecb): unpadded plaintext with disabled padding');
        const b = u32(plaintext);
        if (pcks5) {
            let left = BLOCK_SIZE - remaining;
            if (!left)
                left = BLOCK_SIZE; // if no bytes left, create empty padding block
            outLen = outLen + left;
        }
        const out = getDst(outLen, dst);
        const o = u32(out);
        return { b, o, out };
    }
    function validatePCKS(data, pcks5) {
        if (!pcks5)
            return data;
        const len = data.length;
        if (!len)
            throw new Error(`aes/pcks5: empty ciphertext not allowed`);
        const lastByte = data[len - 1];
        if (lastByte <= 0 || lastByte > 16)
            throw new Error(`aes/pcks5: wrong padding byte: ${lastByte}`);
        const out = data.subarray(0, -lastByte);
        for (let i = 0; i < lastByte; i++)
            if (data[len - i - 1] !== lastByte)
                throw new Error(`aes/pcks5: wrong padding`);
        return out;
    }
    function padPCKS(left) {
        const tmp = new Uint8Array(16);
        const tmp32 = u32(tmp);
        tmp.set(left);
        const paddingByte = BLOCK_SIZE - left.length;
        for (let i = BLOCK_SIZE - paddingByte; i < BLOCK_SIZE; i++)
            tmp[i] = paddingByte;
        return tmp32;
    }
    /**
     * CBC: Cipher-Block-Chaining. Key is previous round’s block.
     * Fragile: needs proper padding. Unauthenticated: needs MAC.
     */
    const cbc = wrapCipher({ blockSize: 16, nonceLength: 16 }, function cbc(key, iv, opts = {}) {
        bytes(key);
        bytes(iv, 16);
        const pcks5 = !opts.disablePadding;
        return {
            encrypt: (plaintext, dst) => {
                const xk = expandKeyLE(key);
                const { b, o, out: _out } = validateBlockEncrypt(plaintext, pcks5, dst);
                const n32 = u32(iv);
                // prettier-ignore
                let s0 = n32[0], s1 = n32[1], s2 = n32[2], s3 = n32[3];
                let i = 0;
                for (; i + 4 <= b.length;) {
                    (s0 ^= b[i + 0]), (s1 ^= b[i + 1]), (s2 ^= b[i + 2]), (s3 ^= b[i + 3]);
                    ({ s0, s1, s2, s3 } = encrypt$1(xk, s0, s1, s2, s3));
                    (o[i++] = s0), (o[i++] = s1), (o[i++] = s2), (o[i++] = s3);
                }
                if (pcks5) {
                    const tmp32 = padPCKS(plaintext.subarray(i * 4));
                    (s0 ^= tmp32[0]), (s1 ^= tmp32[1]), (s2 ^= tmp32[2]), (s3 ^= tmp32[3]);
                    ({ s0, s1, s2, s3 } = encrypt$1(xk, s0, s1, s2, s3));
                    (o[i++] = s0), (o[i++] = s1), (o[i++] = s2), (o[i++] = s3);
                }
                xk.fill(0);
                return _out;
            },
            decrypt: (ciphertext, dst) => {
                validateBlockDecrypt(ciphertext);
                const xk = expandKeyDecLE(key);
                const n32 = u32(iv);
                const out = getDst(ciphertext.length, dst);
                const b = u32(ciphertext);
                const o = u32(out);
                // prettier-ignore
                let s0 = n32[0], s1 = n32[1], s2 = n32[2], s3 = n32[3];
                for (let i = 0; i + 4 <= b.length;) {
                    // prettier-ignore
                    const ps0 = s0, ps1 = s1, ps2 = s2, ps3 = s3;
                    (s0 = b[i + 0]), (s1 = b[i + 1]), (s2 = b[i + 2]), (s3 = b[i + 3]);
                    const { s0: o0, s1: o1, s2: o2, s3: o3 } = decrypt$1(xk, s0, s1, s2, s3);
                    (o[i++] = o0 ^ ps0), (o[i++] = o1 ^ ps1), (o[i++] = o2 ^ ps2), (o[i++] = o3 ^ ps3);
                }
                xk.fill(0);
                return validatePCKS(out, pcks5);
            },
        };
    });

    // Basic utils for ARX (add-rotate-xor) salsa and chacha ciphers.
    /*
    RFC8439 requires multi-step cipher stream, where
    authKey starts with counter: 0, actual msg with counter: 1.

    For this, we need a way to re-use nonce / counter:

        const counter = new Uint8Array(4);
        chacha(..., counter, ...); // counter is now 1
        chacha(..., counter, ...); // counter is now 2

    This is complicated:

    - 32-bit counters are enough, no need for 64-bit: max ArrayBuffer size in JS is 4GB
    - Original papers don't allow mutating counters
    - Counter overflow is undefined [^1]
    - Idea A: allow providing (nonce | counter) instead of just nonce, re-use it
    - Caveat: Cannot be re-used through all cases:
    - * chacha has (counter | nonce)
    - * xchacha has (nonce16 | counter | nonce16)
    - Idea B: separate nonce / counter and provide separate API for counter re-use
    - Caveat: there are different counter sizes depending on an algorithm.
    - salsa & chacha also differ in structures of key & sigma:
      salsa20:      s[0] | k(4) | s[1] | nonce(2) | ctr(2) | s[2] | k(4) | s[3]
      chacha:       s(4) | k(8) | ctr(1) | nonce(3)
      chacha20orig: s(4) | k(8) | ctr(2) | nonce(2)
    - Idea C: helper method such as `setSalsaState(key, nonce, sigma, data)`
    - Caveat: we can't re-use counter array

    xchacha [^2] uses the subkey and remaining 8 byte nonce with ChaCha20 as normal
    (prefixed by 4 NUL bytes, since [RFC8439] specifies a 12-byte nonce).

    [^1]: https://mailarchive.ietf.org/arch/msg/cfrg/gsOnTJzcbgG6OqD8Sc0GO5aR_tU/
    [^2]: https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-xchacha#appendix-A.2
    */
    // We can't make top-level var depend on utils.utf8ToBytes
    // because it's not present in all envs. Creating a similar fn here
    const _utf8ToBytes = (str) => Uint8Array.from(str.split('').map((c) => c.charCodeAt(0)));
    const sigma16 = _utf8ToBytes('expand 16-byte k');
    const sigma32 = _utf8ToBytes('expand 32-byte k');
    const sigma16_32 = u32(sigma16);
    const sigma32_32 = u32(sigma32);
    sigma32_32.slice();
    function rotl(a, b) {
        return (a << b) | (a >>> (32 - b));
    }
    // Is byte array aligned to 4 byte offset (u32)?
    function isAligned32(b) {
        return b.byteOffset % 4 === 0;
    }
    // Salsa and Chacha block length is always 512-bit
    const BLOCK_LEN = 64;
    const BLOCK_LEN32 = 16;
    // new Uint32Array([2**32])   // => Uint32Array(1) [ 0 ]
    // new Uint32Array([2**32-1]) // => Uint32Array(1) [ 4294967295 ]
    const MAX_COUNTER = 2 ** 32 - 1;
    const U32_EMPTY = new Uint32Array();
    function runCipher(core, sigma, key, nonce, data, output, counter, rounds) {
        const len = data.length;
        const block = new Uint8Array(BLOCK_LEN);
        const b32 = u32(block);
        // Make sure that buffers aligned to 4 bytes
        const isAligned = isAligned32(data) && isAligned32(output);
        const d32 = isAligned ? u32(data) : U32_EMPTY;
        const o32 = isAligned ? u32(output) : U32_EMPTY;
        for (let pos = 0; pos < len; counter++) {
            core(sigma, key, nonce, b32, counter, rounds);
            if (counter >= MAX_COUNTER)
                throw new Error('arx: counter overflow');
            const take = Math.min(BLOCK_LEN, len - pos);
            // aligned to 4 bytes
            if (isAligned && take === BLOCK_LEN) {
                const pos32 = pos / 4;
                if (pos % 4 !== 0)
                    throw new Error('arx: invalid block position');
                for (let j = 0, posj; j < BLOCK_LEN32; j++) {
                    posj = pos32 + j;
                    o32[posj] = d32[posj] ^ b32[j];
                }
                pos += BLOCK_LEN;
                continue;
            }
            for (let j = 0, posj; j < take; j++) {
                posj = pos + j;
                output[posj] = data[posj] ^ block[j];
            }
            pos += take;
        }
    }
    function createCipher(core, opts) {
        const { allowShortKeys, extendNonceFn, counterLength, counterRight, rounds } = checkOpts({ allowShortKeys: false, counterLength: 8, counterRight: false, rounds: 20 }, opts);
        if (typeof core !== 'function')
            throw new Error('core must be a function');
        number(counterLength);
        number(rounds);
        bool(counterRight);
        bool(allowShortKeys);
        return (key, nonce, data, output, counter = 0) => {
            bytes(key);
            bytes(nonce);
            bytes(data);
            const len = data.length;
            if (!output)
                output = new Uint8Array(len);
            bytes(output);
            number(counter);
            if (counter < 0 || counter >= MAX_COUNTER)
                throw new Error('arx: counter overflow');
            if (output.length < len)
                throw new Error(`arx: output (${output.length}) is shorter than data (${len})`);
            const toClean = [];
            // Key & sigma
            // key=16 -> sigma16, k=key|key
            // key=32 -> sigma32, k=key
            let l = key.length, k, sigma;
            if (l === 32) {
                k = key.slice();
                toClean.push(k);
                sigma = sigma32_32;
            }
            else if (l === 16 && allowShortKeys) {
                k = new Uint8Array(32);
                k.set(key);
                k.set(key, 16);
                sigma = sigma16_32;
                toClean.push(k);
            }
            else {
                throw new Error(`arx: invalid 32-byte key, got length=${l}`);
            }
            // Nonce
            // salsa20:      8   (8-byte counter)
            // chacha20orig: 8   (8-byte counter)
            // chacha20:     12  (4-byte counter)
            // xsalsa20:     24  (16 -> hsalsa,  8 -> old nonce)
            // xchacha20:    24  (16 -> hchacha, 8 -> old nonce)
            // Align nonce to 4 bytes
            if (!isAligned32(nonce)) {
                nonce = nonce.slice();
                toClean.push(nonce);
            }
            const k32 = u32(k);
            // hsalsa & hchacha: handle extended nonce
            if (extendNonceFn) {
                if (nonce.length !== 24)
                    throw new Error(`arx: extended nonce must be 24 bytes`);
                extendNonceFn(sigma, k32, u32(nonce.subarray(0, 16)), k32);
                nonce = nonce.subarray(16);
            }
            // Handle nonce counter
            const nonceNcLen = 16 - counterLength;
            if (nonceNcLen !== nonce.length)
                throw new Error(`arx: nonce must be ${nonceNcLen} or 16 bytes`);
            // Pad counter when nonce is 64 bit
            if (nonceNcLen !== 12) {
                const nc = new Uint8Array(12);
                nc.set(nonce, counterRight ? 0 : 12 - nonce.length);
                nonce = nc;
                toClean.push(nonce);
            }
            const n32 = u32(nonce);
            runCipher(core, sigma, k32, n32, data, output, counter, rounds);
            while (toClean.length > 0)
                toClean.pop().fill(0);
            return output;
        };
    }

    // prettier-ignore
    // ChaCha20 stream cipher was released in 2008. ChaCha aims to increase
    // the diffusion per round, but had slightly less cryptanalysis.
    // https://cr.yp.to/chacha.html, http://cr.yp.to/chacha/chacha-20080128.pdf
    /**
     * ChaCha core function.
     */
    // prettier-ignore
    function chachaCore(s, k, n, out, cnt, rounds = 20) {
        let y00 = s[0], y01 = s[1], y02 = s[2], y03 = s[3], // "expa"   "nd 3"  "2-by"  "te k"
        y04 = k[0], y05 = k[1], y06 = k[2], y07 = k[3], // Key      Key     Key     Key
        y08 = k[4], y09 = k[5], y10 = k[6], y11 = k[7], // Key      Key     Key     Key
        y12 = cnt, y13 = n[0], y14 = n[1], y15 = n[2]; // Counter  Counter	Nonce   Nonce
        // Save state to temporary variables
        let x00 = y00, x01 = y01, x02 = y02, x03 = y03, x04 = y04, x05 = y05, x06 = y06, x07 = y07, x08 = y08, x09 = y09, x10 = y10, x11 = y11, x12 = y12, x13 = y13, x14 = y14, x15 = y15;
        for (let r = 0; r < rounds; r += 2) {
            x00 = (x00 + x04) | 0;
            x12 = rotl(x12 ^ x00, 16);
            x08 = (x08 + x12) | 0;
            x04 = rotl(x04 ^ x08, 12);
            x00 = (x00 + x04) | 0;
            x12 = rotl(x12 ^ x00, 8);
            x08 = (x08 + x12) | 0;
            x04 = rotl(x04 ^ x08, 7);
            x01 = (x01 + x05) | 0;
            x13 = rotl(x13 ^ x01, 16);
            x09 = (x09 + x13) | 0;
            x05 = rotl(x05 ^ x09, 12);
            x01 = (x01 + x05) | 0;
            x13 = rotl(x13 ^ x01, 8);
            x09 = (x09 + x13) | 0;
            x05 = rotl(x05 ^ x09, 7);
            x02 = (x02 + x06) | 0;
            x14 = rotl(x14 ^ x02, 16);
            x10 = (x10 + x14) | 0;
            x06 = rotl(x06 ^ x10, 12);
            x02 = (x02 + x06) | 0;
            x14 = rotl(x14 ^ x02, 8);
            x10 = (x10 + x14) | 0;
            x06 = rotl(x06 ^ x10, 7);
            x03 = (x03 + x07) | 0;
            x15 = rotl(x15 ^ x03, 16);
            x11 = (x11 + x15) | 0;
            x07 = rotl(x07 ^ x11, 12);
            x03 = (x03 + x07) | 0;
            x15 = rotl(x15 ^ x03, 8);
            x11 = (x11 + x15) | 0;
            x07 = rotl(x07 ^ x11, 7);
            x00 = (x00 + x05) | 0;
            x15 = rotl(x15 ^ x00, 16);
            x10 = (x10 + x15) | 0;
            x05 = rotl(x05 ^ x10, 12);
            x00 = (x00 + x05) | 0;
            x15 = rotl(x15 ^ x00, 8);
            x10 = (x10 + x15) | 0;
            x05 = rotl(x05 ^ x10, 7);
            x01 = (x01 + x06) | 0;
            x12 = rotl(x12 ^ x01, 16);
            x11 = (x11 + x12) | 0;
            x06 = rotl(x06 ^ x11, 12);
            x01 = (x01 + x06) | 0;
            x12 = rotl(x12 ^ x01, 8);
            x11 = (x11 + x12) | 0;
            x06 = rotl(x06 ^ x11, 7);
            x02 = (x02 + x07) | 0;
            x13 = rotl(x13 ^ x02, 16);
            x08 = (x08 + x13) | 0;
            x07 = rotl(x07 ^ x08, 12);
            x02 = (x02 + x07) | 0;
            x13 = rotl(x13 ^ x02, 8);
            x08 = (x08 + x13) | 0;
            x07 = rotl(x07 ^ x08, 7);
            x03 = (x03 + x04) | 0;
            x14 = rotl(x14 ^ x03, 16);
            x09 = (x09 + x14) | 0;
            x04 = rotl(x04 ^ x09, 12);
            x03 = (x03 + x04) | 0;
            x14 = rotl(x14 ^ x03, 8);
            x09 = (x09 + x14) | 0;
            x04 = rotl(x04 ^ x09, 7);
        }
        // Write output
        let oi = 0;
        out[oi++] = (y00 + x00) | 0;
        out[oi++] = (y01 + x01) | 0;
        out[oi++] = (y02 + x02) | 0;
        out[oi++] = (y03 + x03) | 0;
        out[oi++] = (y04 + x04) | 0;
        out[oi++] = (y05 + x05) | 0;
        out[oi++] = (y06 + x06) | 0;
        out[oi++] = (y07 + x07) | 0;
        out[oi++] = (y08 + x08) | 0;
        out[oi++] = (y09 + x09) | 0;
        out[oi++] = (y10 + x10) | 0;
        out[oi++] = (y11 + x11) | 0;
        out[oi++] = (y12 + x12) | 0;
        out[oi++] = (y13 + x13) | 0;
        out[oi++] = (y14 + x14) | 0;
        out[oi++] = (y15 + x15) | 0;
    }
    /**
     * ChaCha stream cipher. Conforms to RFC 8439 (IETF, TLS). 12-byte nonce, 4-byte counter.
     * With 12-byte nonce, it's not safe to use fill it with random (CSPRNG), due to collision chance.
     */
    const chacha20 = /* @__PURE__ */ createCipher(chachaCore, {
        counterRight: false,
        counterLength: 4,
        allowShortKeys: false,
    });

    // HMAC (RFC 2104)
    class HMAC extends Hash {
        constructor(hash, _key) {
            super();
            this.finished = false;
            this.destroyed = false;
            assert.hash(hash);
            const key = toBytes(_key);
            this.iHash = hash.create();
            if (typeof this.iHash.update !== 'function')
                throw new Error('Expected instance of class which extends utils.Hash');
            this.blockLen = this.iHash.blockLen;
            this.outputLen = this.iHash.outputLen;
            const blockLen = this.blockLen;
            const pad = new Uint8Array(blockLen);
            // blockLen can be bigger than outputLen
            pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
            for (let i = 0; i < pad.length; i++)
                pad[i] ^= 0x36;
            this.iHash.update(pad);
            // By doing update (processing of first block) of outer hash here we can re-use it between multiple calls via clone
            this.oHash = hash.create();
            // Undo internal XOR && apply outer XOR
            for (let i = 0; i < pad.length; i++)
                pad[i] ^= 0x36 ^ 0x5c;
            this.oHash.update(pad);
            pad.fill(0);
        }
        update(buf) {
            assert.exists(this);
            this.iHash.update(buf);
            return this;
        }
        digestInto(out) {
            assert.exists(this);
            assert.bytes(out, this.outputLen);
            this.finished = true;
            this.iHash.digestInto(out);
            this.oHash.update(out);
            this.oHash.digestInto(out);
            this.destroy();
        }
        digest() {
            const out = new Uint8Array(this.oHash.outputLen);
            this.digestInto(out);
            return out;
        }
        _cloneInto(to) {
            // Create new instance without calling constructor since key already in state and we don't know it.
            to || (to = Object.create(Object.getPrototypeOf(this), {}));
            const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
            to = to;
            to.finished = finished;
            to.destroyed = destroyed;
            to.blockLen = blockLen;
            to.outputLen = outputLen;
            to.oHash = oHash._cloneInto(to.oHash);
            to.iHash = iHash._cloneInto(to.iHash);
            return to;
        }
        destroy() {
            this.destroyed = true;
            this.oHash.destroy();
            this.iHash.destroy();
        }
    }
    /**
     * HMAC: RFC2104 message authentication code.
     * @param hash - function that would be used e.g. sha256
     * @param key - message key
     * @param message - message data
     */
    const hmac = (hash, key, message) => new HMAC(hash, key).update(message).digest();
    hmac.create = (hash, key) => new HMAC(hash, key);

    // HKDF (RFC 5869)
    // https://soatok.blog/2021/11/17/understanding-hkdf/
    /**
     * HKDF-Extract(IKM, salt) -> PRK
     * Arguments position differs from spec (IKM is first one, since it is not optional)
     * @param hash
     * @param ikm
     * @param salt
     * @returns
     */
    function extract(hash, ikm, salt) {
        assert.hash(hash);
        // NOTE: some libraries treat zero-length array as 'not provided';
        // we don't, since we have undefined as 'not provided'
        // https://github.com/RustCrypto/KDFs/issues/15
        if (salt === undefined)
            salt = new Uint8Array(hash.outputLen); // if not provided, it is set to a string of HashLen zeros
        return hmac(hash, toBytes(salt), toBytes(ikm));
    }
    // HKDF-Expand(PRK, info, L) -> OKM
    const HKDF_COUNTER = new Uint8Array([0]);
    const EMPTY_BUFFER = new Uint8Array();
    /**
     * HKDF-expand from the spec.
     * @param prk - a pseudorandom key of at least HashLen octets (usually, the output from the extract step)
     * @param info - optional context and application specific information (can be a zero-length string)
     * @param length - length of output keying material in octets
     */
    function expand(hash, prk, info, length = 32) {
        assert.hash(hash);
        assert.number(length);
        if (length > 255 * hash.outputLen)
            throw new Error('Length should be <= 255*HashLen');
        const blocks = Math.ceil(length / hash.outputLen);
        if (info === undefined)
            info = EMPTY_BUFFER;
        // first L(ength) octets of T
        const okm = new Uint8Array(blocks * hash.outputLen);
        // Re-use HMAC instance between blocks
        const HMAC = hmac.create(hash, prk);
        const HMACTmp = HMAC._cloneInto();
        const T = new Uint8Array(HMAC.outputLen);
        for (let counter = 0; counter < blocks; counter++) {
            HKDF_COUNTER[0] = counter + 1;
            // T(0) = empty string (zero length)
            // T(N) = HMAC-Hash(PRK, T(N-1) | info | N)
            HMACTmp.update(counter === 0 ? EMPTY_BUFFER : T)
                .update(info)
                .update(HKDF_COUNTER)
                .digestInto(T);
            okm.set(T, hash.outputLen * counter);
            HMAC._cloneInto(HMACTmp);
        }
        HMAC.destroy();
        HMACTmp.destroy();
        T.fill(0);
        HKDF_COUNTER.fill(0);
        return okm.slice(0, length);
    }

    var __defProp = Object.defineProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp(target, name, { get: all[name], enumerable: true });
    };

    // core.ts
    var verifiedSymbol = Symbol("verified");
    var isRecord = (obj) => obj instanceof Object;
    function validateEvent(event) {
      if (!isRecord(event))
        return false;
      if (typeof event.kind !== "number")
        return false;
      if (typeof event.content !== "string")
        return false;
      if (typeof event.created_at !== "number")
        return false;
      if (typeof event.pubkey !== "string")
        return false;
      if (!event.pubkey.match(/^[a-f0-9]{64}$/))
        return false;
      if (!Array.isArray(event.tags))
        return false;
      for (let i2 = 0; i2 < event.tags.length; i2++) {
        let tag = event.tags[i2];
        if (!Array.isArray(tag))
          return false;
        for (let j = 0; j < tag.length; j++) {
          if (typeof tag[j] === "object")
            return false;
        }
      }
      return true;
    }

    // utils.ts
    var utils_exports = {};
    __export(utils_exports, {
      Queue: () => Queue,
      QueueNode: () => QueueNode,
      binarySearch: () => binarySearch,
      insertEventIntoAscendingList: () => insertEventIntoAscendingList,
      insertEventIntoDescendingList: () => insertEventIntoDescendingList,
      normalizeURL: () => normalizeURL,
      utf8Decoder: () => utf8Decoder,
      utf8Encoder: () => utf8Encoder
    });
    var utf8Decoder = new TextDecoder("utf-8");
    var utf8Encoder = new TextEncoder();
    function normalizeURL(url) {
      if (url.indexOf("://") === -1)
        url = "wss://" + url;
      let p = new URL(url);
      p.pathname = p.pathname.replace(/\/+/g, "/");
      if (p.pathname.endsWith("/"))
        p.pathname = p.pathname.slice(0, -1);
      if (p.port === "80" && p.protocol === "ws:" || p.port === "443" && p.protocol === "wss:")
        p.port = "";
      p.searchParams.sort();
      p.hash = "";
      return p.toString();
    }
    function insertEventIntoDescendingList(sortedArray, event) {
      const [idx, found] = binarySearch(sortedArray, (b) => {
        if (event.id === b.id)
          return 0;
        if (event.created_at === b.created_at)
          return -1;
        return b.created_at - event.created_at;
      });
      if (!found) {
        sortedArray.splice(idx, 0, event);
      }
      return sortedArray;
    }
    function insertEventIntoAscendingList(sortedArray, event) {
      const [idx, found] = binarySearch(sortedArray, (b) => {
        if (event.id === b.id)
          return 0;
        if (event.created_at === b.created_at)
          return -1;
        return event.created_at - b.created_at;
      });
      if (!found) {
        sortedArray.splice(idx, 0, event);
      }
      return sortedArray;
    }
    function binarySearch(arr, compare) {
      let start = 0;
      let end = arr.length - 1;
      while (start <= end) {
        const mid = Math.floor((start + end) / 2);
        const cmp = compare(arr[mid]);
        if (cmp === 0) {
          return [mid, true];
        }
        if (cmp < 0) {
          end = mid - 1;
        } else {
          start = mid + 1;
        }
      }
      return [start, false];
    }
    var QueueNode = class {
      value;
      next = null;
      prev = null;
      constructor(message) {
        this.value = message;
      }
    };
    var Queue = class {
      first;
      last;
      constructor() {
        this.first = null;
        this.last = null;
      }
      enqueue(value) {
        const newNode = new QueueNode(value);
        if (!this.last) {
          this.first = newNode;
          this.last = newNode;
        } else if (this.last === this.first) {
          this.last = newNode;
          this.last.prev = this.first;
          this.first.next = newNode;
        } else {
          newNode.prev = this.last;
          this.last.next = newNode;
          this.last = newNode;
        }
        return true;
      }
      dequeue() {
        if (!this.first)
          return null;
        if (this.first === this.last) {
          const target2 = this.first;
          this.first = null;
          this.last = null;
          return target2.value;
        }
        const target = this.first;
        this.first = target.next;
        return target.value;
      }
    };

    // pure.ts
    var JS = class {
      generateSecretKey() {
        return schnorr.utils.randomPrivateKey();
      }
      getPublicKey(secretKey) {
        return bytesToHex(schnorr.getPublicKey(secretKey));
      }
      finalizeEvent(t, secretKey) {
        const event = t;
        event.pubkey = bytesToHex(schnorr.getPublicKey(secretKey));
        event.id = getEventHash(event);
        event.sig = bytesToHex(schnorr.sign(getEventHash(event), secretKey));
        event[verifiedSymbol] = true;
        return event;
      }
      verifyEvent(event) {
        if (typeof event[verifiedSymbol] === "boolean")
          return event[verifiedSymbol];
        const hash = getEventHash(event);
        if (hash !== event.id) {
          event[verifiedSymbol] = false;
          return false;
        }
        try {
          const valid = schnorr.verify(event.sig, hash, event.pubkey);
          event[verifiedSymbol] = valid;
          return valid;
        } catch (err) {
          event[verifiedSymbol] = false;
          return false;
        }
      }
    };
    function serializeEvent(evt) {
      if (!validateEvent(evt))
        throw new Error("can't serialize event with wrong or missing properties");
      return JSON.stringify([0, evt.pubkey, evt.created_at, evt.kind, evt.tags, evt.content]);
    }
    function getEventHash(event) {
      let eventHash = sha256(utf8Encoder.encode(serializeEvent(event)));
      return bytesToHex(eventHash);
    }
    var i = new JS();
    var generateSecretKey = i.generateSecretKey;
    var getPublicKey = i.getPublicKey;
    var finalizeEvent = i.finalizeEvent;
    var verifyEvent = i.verifyEvent;

    // kinds.ts
    var kinds_exports = {};
    __export(kinds_exports, {
      Application: () => Application,
      BadgeAward: () => BadgeAward,
      BadgeDefinition: () => BadgeDefinition,
      BlockedRelaysList: () => BlockedRelaysList,
      BookmarkList: () => BookmarkList,
      Bookmarksets: () => Bookmarksets,
      Calendar: () => Calendar,
      CalendarEventRSVP: () => CalendarEventRSVP,
      ChannelCreation: () => ChannelCreation,
      ChannelHideMessage: () => ChannelHideMessage,
      ChannelMessage: () => ChannelMessage,
      ChannelMetadata: () => ChannelMetadata,
      ChannelMuteUser: () => ChannelMuteUser,
      ClassifiedListing: () => ClassifiedListing,
      ClientAuth: () => ClientAuth,
      CommunitiesList: () => CommunitiesList,
      CommunityDefinition: () => CommunityDefinition,
      CommunityPostApproval: () => CommunityPostApproval,
      Contacts: () => Contacts,
      CreateOrUpdateProduct: () => CreateOrUpdateProduct,
      CreateOrUpdateStall: () => CreateOrUpdateStall,
      Curationsets: () => Curationsets,
      Date: () => Date2,
      DraftClassifiedListing: () => DraftClassifiedListing,
      DraftLong: () => DraftLong,
      Emojisets: () => Emojisets,
      EncryptedDirectMessage: () => EncryptedDirectMessage,
      EncryptedDirectMessages: () => EncryptedDirectMessages,
      EventDeletion: () => EventDeletion,
      FileMetadata: () => FileMetadata,
      FileServerPreference: () => FileServerPreference,
      Followsets: () => Followsets,
      GenericRepost: () => GenericRepost,
      Genericlists: () => Genericlists,
      HTTPAuth: () => HTTPAuth,
      Handlerinformation: () => Handlerinformation,
      Handlerrecommendation: () => Handlerrecommendation,
      Highlights: () => Highlights,
      InterestsList: () => InterestsList,
      Interestsets: () => Interestsets,
      JobFeedback: () => JobFeedback,
      JobRequest: () => JobRequest,
      JobResult: () => JobResult,
      Label: () => Label,
      LightningPubRPC: () => LightningPubRPC,
      LiveChatMessage: () => LiveChatMessage,
      LiveEvent: () => LiveEvent,
      LongFormArticle: () => LongFormArticle,
      Metadata: () => Metadata,
      Mutelist: () => Mutelist,
      NWCWalletInfo: () => NWCWalletInfo,
      NWCWalletRequest: () => NWCWalletRequest,
      NWCWalletResponse: () => NWCWalletResponse,
      NostrConnect: () => NostrConnect,
      OpenTimestamps: () => OpenTimestamps,
      Pinlist: () => Pinlist,
      ProblemTracker: () => ProblemTracker,
      ProfileBadges: () => ProfileBadges,
      PublicChatsList: () => PublicChatsList,
      Reaction: () => Reaction,
      RecommendRelay: () => RecommendRelay,
      RelayList: () => RelayList,
      Relaysets: () => Relaysets,
      Report: () => Report,
      Reporting: () => Reporting,
      Repost: () => Repost,
      SearchRelaysList: () => SearchRelaysList,
      ShortTextNote: () => ShortTextNote,
      Time: () => Time,
      UserEmojiList: () => UserEmojiList,
      UserStatuses: () => UserStatuses,
      Zap: () => Zap,
      ZapGoal: () => ZapGoal,
      ZapRequest: () => ZapRequest,
      classifyKind: () => classifyKind,
      isEphemeralKind: () => isEphemeralKind,
      isParameterizedReplaceableKind: () => isParameterizedReplaceableKind,
      isRegularKind: () => isRegularKind,
      isReplaceableKind: () => isReplaceableKind
    });
    function isRegularKind(kind) {
      return 1e3 <= kind && kind < 1e4 || [1, 2, 4, 5, 6, 7, 8, 16, 40, 41, 42, 43, 44].includes(kind);
    }
    function isReplaceableKind(kind) {
      return [0, 3].includes(kind) || 1e4 <= kind && kind < 2e4;
    }
    function isEphemeralKind(kind) {
      return 2e4 <= kind && kind < 3e4;
    }
    function isParameterizedReplaceableKind(kind) {
      return 3e4 <= kind && kind < 4e4;
    }
    function classifyKind(kind) {
      if (isRegularKind(kind))
        return "regular";
      if (isReplaceableKind(kind))
        return "replaceable";
      if (isEphemeralKind(kind))
        return "ephemeral";
      if (isParameterizedReplaceableKind(kind))
        return "parameterized";
      return "unknown";
    }
    var Metadata = 0;
    var ShortTextNote = 1;
    var RecommendRelay = 2;
    var Contacts = 3;
    var EncryptedDirectMessage = 4;
    var EncryptedDirectMessages = 4;
    var EventDeletion = 5;
    var Repost = 6;
    var Reaction = 7;
    var BadgeAward = 8;
    var GenericRepost = 16;
    var ChannelCreation = 40;
    var ChannelMetadata = 41;
    var ChannelMessage = 42;
    var ChannelHideMessage = 43;
    var ChannelMuteUser = 44;
    var OpenTimestamps = 1040;
    var FileMetadata = 1063;
    var LiveChatMessage = 1311;
    var ProblemTracker = 1971;
    var Report = 1984;
    var Reporting = 1984;
    var Label = 1985;
    var CommunityPostApproval = 4550;
    var JobRequest = 5999;
    var JobResult = 6999;
    var JobFeedback = 7e3;
    var ZapGoal = 9041;
    var ZapRequest = 9734;
    var Zap = 9735;
    var Highlights = 9802;
    var Mutelist = 1e4;
    var Pinlist = 10001;
    var RelayList = 10002;
    var BookmarkList = 10003;
    var CommunitiesList = 10004;
    var PublicChatsList = 10005;
    var BlockedRelaysList = 10006;
    var SearchRelaysList = 10007;
    var InterestsList = 10015;
    var UserEmojiList = 10030;
    var FileServerPreference = 10096;
    var NWCWalletInfo = 13194;
    var LightningPubRPC = 21e3;
    var ClientAuth = 22242;
    var NWCWalletRequest = 23194;
    var NWCWalletResponse = 23195;
    var NostrConnect = 24133;
    var HTTPAuth = 27235;
    var Followsets = 3e4;
    var Genericlists = 30001;
    var Relaysets = 30002;
    var Bookmarksets = 30003;
    var Curationsets = 30004;
    var ProfileBadges = 30008;
    var BadgeDefinition = 30009;
    var Interestsets = 30015;
    var CreateOrUpdateStall = 30017;
    var CreateOrUpdateProduct = 30018;
    var LongFormArticle = 30023;
    var DraftLong = 30024;
    var Emojisets = 30030;
    var Application = 30078;
    var LiveEvent = 30311;
    var UserStatuses = 30315;
    var ClassifiedListing = 30402;
    var DraftClassifiedListing = 30403;
    var Date2 = 31922;
    var Time = 31923;
    var Calendar = 31924;
    var CalendarEventRSVP = 31925;
    var Handlerrecommendation = 31989;
    var Handlerinformation = 31990;
    var CommunityDefinition = 34550;

    // filter.ts
    function matchFilter(filter, event) {
      if (filter.ids && filter.ids.indexOf(event.id) === -1) {
        return false;
      }
      if (filter.kinds && filter.kinds.indexOf(event.kind) === -1) {
        return false;
      }
      if (filter.authors && filter.authors.indexOf(event.pubkey) === -1) {
        return false;
      }
      for (let f in filter) {
        if (f[0] === "#") {
          let tagName = f.slice(1);
          let values = filter[`#${tagName}`];
          if (values && !event.tags.find(([t, v]) => t === f.slice(1) && values.indexOf(v) !== -1))
            return false;
        }
      }
      if (filter.since && event.created_at < filter.since)
        return false;
      if (filter.until && event.created_at > filter.until)
        return false;
      return true;
    }
    function matchFilters(filters, event) {
      for (let i2 = 0; i2 < filters.length; i2++) {
        if (matchFilter(filters[i2], event)) {
          return true;
        }
      }
      return false;
    }

    // fakejson.ts
    var fakejson_exports = {};
    __export(fakejson_exports, {
      getHex64: () => getHex64,
      getInt: () => getInt,
      getSubscriptionId: () => getSubscriptionId,
      matchEventId: () => matchEventId,
      matchEventKind: () => matchEventKind,
      matchEventPubkey: () => matchEventPubkey
    });
    function getHex64(json, field) {
      let len = field.length + 3;
      let idx = json.indexOf(`"${field}":`) + len;
      let s = json.slice(idx).indexOf(`"`) + idx + 1;
      return json.slice(s, s + 64);
    }
    function getInt(json, field) {
      let len = field.length;
      let idx = json.indexOf(`"${field}":`) + len + 3;
      let sliced = json.slice(idx);
      let end = Math.min(sliced.indexOf(","), sliced.indexOf("}"));
      return parseInt(sliced.slice(0, end), 10);
    }
    function getSubscriptionId(json) {
      let idx = json.slice(0, 22).indexOf(`"EVENT"`);
      if (idx === -1)
        return null;
      let pstart = json.slice(idx + 7 + 1).indexOf(`"`);
      if (pstart === -1)
        return null;
      let start = idx + 7 + 1 + pstart;
      let pend = json.slice(start + 1, 80).indexOf(`"`);
      if (pend === -1)
        return null;
      let end = start + 1 + pend;
      return json.slice(start + 1, end);
    }
    function matchEventId(json, id) {
      return id === getHex64(json, "id");
    }
    function matchEventPubkey(json, pubkey) {
      return pubkey === getHex64(json, "pubkey");
    }
    function matchEventKind(json, kind) {
      return kind === getInt(json, "kind");
    }

    // nip42.ts
    var nip42_exports = {};
    __export(nip42_exports, {
      makeAuthEvent: () => makeAuthEvent
    });
    function makeAuthEvent(relayURL, challenge) {
      return {
        kind: ClientAuth,
        created_at: Math.floor(Date.now() / 1e3),
        tags: [
          ["relay", relayURL],
          ["challenge", challenge]
        ],
        content: ""
      };
    }

    // helpers.ts
    async function yieldThread() {
      return new Promise((resolve) => {
        const ch = new MessageChannel();
        const handler = () => {
          ch.port1.removeEventListener("message", handler);
          resolve();
        };
        ch.port1.addEventListener("message", handler);
        ch.port2.postMessage(0);
        ch.port1.start();
      });
    }
    var alwaysTrue = (t) => {
      t[verifiedSymbol] = true;
      return true;
    };

    // abstract-relay.ts
    var AbstractRelay = class {
      url;
      _connected = false;
      onclose = null;
      onnotice = (msg) => console.debug(`NOTICE from ${this.url}: ${msg}`);
      _onauth = null;
      baseEoseTimeout = 4400;
      connectionTimeout = 4400;
      openSubs = /* @__PURE__ */ new Map();
      connectionTimeoutHandle;
      connectionPromise;
      openCountRequests = /* @__PURE__ */ new Map();
      openEventPublishes = /* @__PURE__ */ new Map();
      ws;
      incomingMessageQueue = new Queue();
      queueRunning = false;
      challenge;
      serial = 0;
      verifyEvent;
      _WebSocket;
      constructor(url, opts) {
        this.url = normalizeURL(url);
        this.verifyEvent = opts.verifyEvent;
        this._WebSocket = opts.websocketImplementation || WebSocket;
      }
      static async connect(url, opts) {
        const relay = new AbstractRelay(url, opts);
        await relay.connect();
        return relay;
      }
      closeAllSubscriptions(reason) {
        for (let [_, sub] of this.openSubs) {
          sub.close(reason);
        }
        this.openSubs.clear();
        for (let [_, ep] of this.openEventPublishes) {
          ep.reject(new Error(reason));
        }
        this.openEventPublishes.clear();
        for (let [_, cr] of this.openCountRequests) {
          cr.reject(new Error(reason));
        }
        this.openCountRequests.clear();
      }
      get connected() {
        return this._connected;
      }
      async connect() {
        if (this.connectionPromise)
          return this.connectionPromise;
        this.challenge = void 0;
        this.connectionPromise = new Promise((resolve, reject) => {
          this.connectionTimeoutHandle = setTimeout(() => {
            reject("connection timed out");
            this.connectionPromise = void 0;
            this.onclose?.();
            this.closeAllSubscriptions("relay connection timed out");
          }, this.connectionTimeout);
          try {
            this.ws = new this._WebSocket(this.url);
          } catch (err) {
            reject(err);
            return;
          }
          this.ws.onopen = () => {
            clearTimeout(this.connectionTimeoutHandle);
            this._connected = true;
            resolve();
          };
          this.ws.onerror = (ev) => {
            reject(ev.message || "websocket error");
            if (this._connected) {
              this._connected = false;
              this.connectionPromise = void 0;
              this.onclose?.();
              this.closeAllSubscriptions("relay connection errored");
            }
          };
          this.ws.onclose = async () => {
            if (this._connected) {
              this._connected = false;
              this.connectionPromise = void 0;
              this.onclose?.();
              this.closeAllSubscriptions("relay connection closed");
            }
          };
          this.ws.onmessage = this._onmessage.bind(this);
        });
        return this.connectionPromise;
      }
      async runQueue() {
        this.queueRunning = true;
        while (true) {
          if (false === this.handleNext()) {
            break;
          }
          await yieldThread();
        }
        this.queueRunning = false;
      }
      handleNext() {
        const json = this.incomingMessageQueue.dequeue();
        if (!json) {
          return false;
        }
        const subid = getSubscriptionId(json);
        if (subid) {
          const so = this.openSubs.get(subid);
          if (!so) {
            return;
          }
          const id = getHex64(json, "id");
          const alreadyHave = so.alreadyHaveEvent?.(id);
          so.receivedEvent?.(this, id);
          if (alreadyHave) {
            return;
          }
        }
        try {
          let data = JSON.parse(json);
          switch (data[0]) {
            case "EVENT": {
              const so = this.openSubs.get(data[1]);
              const event = data[2];
              if (this.verifyEvent(event) && matchFilters(so.filters, event)) {
                so.onevent(event);
              }
              return;
            }
            case "COUNT": {
              const id = data[1];
              const payload = data[2];
              const cr = this.openCountRequests.get(id);
              if (cr) {
                cr.resolve(payload.count);
                this.openCountRequests.delete(id);
              }
              return;
            }
            case "EOSE": {
              const so = this.openSubs.get(data[1]);
              if (!so)
                return;
              so.receivedEose();
              return;
            }
            case "OK": {
              const id = data[1];
              const ok = data[2];
              const reason = data[3];
              const ep = this.openEventPublishes.get(id);
              if (ok)
                ep.resolve(reason);
              else
                ep.reject(new Error(reason));
              this.openEventPublishes.delete(id);
              return;
            }
            case "CLOSED": {
              const id = data[1];
              const so = this.openSubs.get(id);
              if (!so)
                return;
              so.closed = true;
              so.close(data[2]);
              return;
            }
            case "NOTICE":
              this.onnotice(data[1]);
              return;
            case "AUTH": {
              this.challenge = data[1];
              this._onauth?.(data[1]);
              return;
            }
          }
        } catch (err) {
          return;
        }
      }
      async send(message) {
        if (!this.connectionPromise)
          throw new Error("sending on closed connection");
        this.connectionPromise.then(() => {
          this.ws?.send(message);
        });
      }
      async auth(signAuthEvent) {
        if (!this.challenge)
          throw new Error("can't perform auth, no challenge was received");
        const evt = await signAuthEvent(makeAuthEvent(this.url, this.challenge));
        const ret = new Promise((resolve, reject) => {
          this.openEventPublishes.set(evt.id, { resolve, reject });
        });
        this.send('["AUTH",' + JSON.stringify(evt) + "]");
        return ret;
      }
      async publish(event) {
        const ret = new Promise((resolve, reject) => {
          this.openEventPublishes.set(event.id, { resolve, reject });
        });
        this.send('["EVENT",' + JSON.stringify(event) + "]");
        return ret;
      }
      async count(filters, params) {
        this.serial++;
        const id = params?.id || "count:" + this.serial;
        const ret = new Promise((resolve, reject) => {
          this.openCountRequests.set(id, { resolve, reject });
        });
        this.send('["COUNT","' + id + '",' + JSON.stringify(filters).substring(1));
        return ret;
      }
      subscribe(filters, params) {
        const subscription = this.prepareSubscription(filters, params);
        subscription.fire();
        return subscription;
      }
      prepareSubscription(filters, params) {
        this.serial++;
        const id = params.id || "sub:" + this.serial;
        const subscription = new Subscription$1(this, id, filters, params);
        this.openSubs.set(id, subscription);
        return subscription;
      }
      close() {
        this.closeAllSubscriptions("relay connection closed by us");
        this._connected = false;
        this.ws?.close();
      }
      _onmessage(ev) {
        this.incomingMessageQueue.enqueue(ev.data);
        if (!this.queueRunning) {
          this.runQueue();
        }
      }
    };
    var Subscription$1 = class Subscription {
      relay;
      id;
      closed = false;
      eosed = false;
      filters;
      alreadyHaveEvent;
      receivedEvent;
      onevent;
      oneose;
      onclose;
      eoseTimeout;
      eoseTimeoutHandle;
      constructor(relay, id, filters, params) {
        this.relay = relay;
        this.filters = filters;
        this.id = id;
        this.alreadyHaveEvent = params.alreadyHaveEvent;
        this.receivedEvent = params.receivedEvent;
        this.eoseTimeout = params.eoseTimeout || relay.baseEoseTimeout;
        this.oneose = params.oneose;
        this.onclose = params.onclose;
        this.onevent = params.onevent || ((event) => {
          console.warn(
            `onevent() callback not defined for subscription '${this.id}' in relay ${this.relay.url}. event received:`,
            event
          );
        });
      }
      fire() {
        this.relay.send('["REQ","' + this.id + '",' + JSON.stringify(this.filters).substring(1));
        this.eoseTimeoutHandle = setTimeout(this.receivedEose.bind(this), this.eoseTimeout);
      }
      receivedEose() {
        if (this.eosed)
          return;
        clearTimeout(this.eoseTimeoutHandle);
        this.eosed = true;
        this.oneose?.();
      }
      close(reason = "closed by caller") {
        if (!this.closed && this.relay.connected) {
          this.relay.send('["CLOSE",' + JSON.stringify(this.id) + "]");
          this.closed = true;
        }
        this.relay.openSubs.delete(this.id);
        this.onclose?.(reason);
      }
    };

    // relay.ts
    var _WebSocket;
    try {
      _WebSocket = WebSocket;
    } catch {
    }

    // abstract-pool.ts
    var AbstractSimplePool = class {
      relays = /* @__PURE__ */ new Map();
      seenOn = /* @__PURE__ */ new Map();
      trackRelays = false;
      verifyEvent;
      trustedRelayURLs = /* @__PURE__ */ new Set();
      _WebSocket;
      constructor(opts) {
        this.verifyEvent = opts.verifyEvent;
        this._WebSocket = opts.websocketImplementation;
      }
      async ensureRelay(url, params) {
        url = normalizeURL(url);
        let relay = this.relays.get(url);
        if (!relay) {
          relay = new AbstractRelay(url, {
            verifyEvent: this.trustedRelayURLs.has(url) ? alwaysTrue : this.verifyEvent,
            websocketImplementation: this._WebSocket
          });
          if (params?.connectionTimeout)
            relay.connectionTimeout = params.connectionTimeout;
          this.relays.set(url, relay);
        }
        await relay.connect();
        return relay;
      }
      close(relays) {
        relays.map(normalizeURL).forEach((url) => {
          this.relays.get(url)?.close();
        });
      }
      subscribeMany(relays, filters, params) {
        return this.subscribeManyMap(Object.fromEntries(relays.map((url) => [url, filters])), params);
      }
      subscribeManyMap(requests, params) {
        if (this.trackRelays) {
          params.receivedEvent = (relay, id) => {
            let set = this.seenOn.get(id);
            if (!set) {
              set = /* @__PURE__ */ new Set();
              this.seenOn.set(id, set);
            }
            set.add(relay);
          };
        }
        const _knownIds = /* @__PURE__ */ new Set();
        const subs = [];
        const relaysLength = Object.keys(requests).length;
        const eosesReceived = [];
        let handleEose = (i2) => {
          eosesReceived[i2] = true;
          if (eosesReceived.filter((a) => a).length === relaysLength) {
            params.oneose?.();
            handleEose = () => {
            };
          }
        };
        const closesReceived = [];
        let handleClose = (i2, reason) => {
          handleEose(i2);
          closesReceived[i2] = reason;
          if (closesReceived.filter((a) => a).length === relaysLength) {
            params.onclose?.(closesReceived);
            handleClose = () => {
            };
          }
        };
        const localAlreadyHaveEventHandler = (id) => {
          if (params.alreadyHaveEvent?.(id)) {
            return true;
          }
          const have = _knownIds.has(id);
          _knownIds.add(id);
          return have;
        };
        const allOpened = Promise.all(
          Object.entries(requests).map(async (req, i2, arr) => {
            if (arr.indexOf(req) !== i2) {
              handleClose(i2, "duplicate url");
              return;
            }
            let [url, filters] = req;
            url = normalizeURL(url);
            let relay;
            try {
              relay = await this.ensureRelay(url, {
                connectionTimeout: params.maxWait ? Math.max(params.maxWait * 0.8, params.maxWait - 1e3) : void 0
              });
            } catch (err) {
              handleClose(i2, err?.message || String(err));
              return;
            }
            let subscription = relay.subscribe(filters, {
              ...params,
              oneose: () => handleEose(i2),
              onclose: (reason) => handleClose(i2, reason),
              alreadyHaveEvent: localAlreadyHaveEventHandler,
              eoseTimeout: params.maxWait
            });
            subs.push(subscription);
          })
        );
        return {
          async close() {
            await allOpened;
            subs.forEach((sub) => {
              sub.close();
            });
          }
        };
      }
      subscribeManyEose(relays, filters, params) {
        const subcloser = this.subscribeMany(relays, filters, {
          ...params,
          oneose() {
            subcloser.close();
          }
        });
        return subcloser;
      }
      async querySync(relays, filter, params) {
        return new Promise(async (resolve) => {
          const events = [];
          this.subscribeManyEose(relays, [filter], {
            ...params,
            onevent(event) {
              events.push(event);
            },
            onclose(_) {
              resolve(events);
            }
          });
        });
      }
      async get(relays, filter, params) {
        filter.limit = 1;
        const events = await this.querySync(relays, filter, params);
        events.sort((a, b) => b.created_at - a.created_at);
        return events[0] || null;
      }
      publish(relays, event) {
        return relays.map(normalizeURL).map(async (url, i2, arr) => {
          if (arr.indexOf(url) !== i2) {
            return Promise.reject("duplicate url");
          }
          let r = await this.ensureRelay(url);
          return r.publish(event);
        });
      }
      listConnectionStatus() {
        const map = /* @__PURE__ */ new Map();
        this.relays.forEach((relay, url) => map.set(url, relay.connected));
        return map;
      }
      destroy() {
        this.relays.forEach((conn) => conn.close());
        this.relays = /* @__PURE__ */ new Map();
      }
    };

    // pool.ts
    var _WebSocket2;
    try {
      _WebSocket2 = WebSocket;
    } catch {
    }
    var SimplePool = class extends AbstractSimplePool {
      constructor() {
        super({ verifyEvent, websocketImplementation: _WebSocket2 });
      }
    };

    // nip19.ts
    var nip19_exports = {};
    __export(nip19_exports, {
      BECH32_REGEX: () => BECH32_REGEX,
      Bech32MaxSize: () => Bech32MaxSize,
      decode: () => decode,
      encodeBytes: () => encodeBytes,
      naddrEncode: () => naddrEncode,
      neventEncode: () => neventEncode,
      noteEncode: () => noteEncode,
      nprofileEncode: () => nprofileEncode,
      npubEncode: () => npubEncode,
      nrelayEncode: () => nrelayEncode,
      nsecEncode: () => nsecEncode
    });
    var Bech32MaxSize = 5e3;
    var BECH32_REGEX = /[\x21-\x7E]{1,83}1[023456789acdefghjklmnpqrstuvwxyz]{6,}/;
    function integerToUint8Array(number) {
      const uint8Array = new Uint8Array(4);
      uint8Array[0] = number >> 24 & 255;
      uint8Array[1] = number >> 16 & 255;
      uint8Array[2] = number >> 8 & 255;
      uint8Array[3] = number & 255;
      return uint8Array;
    }
    function decode(nip19) {
      let { prefix, words } = bech32.decode(nip19, Bech32MaxSize);
      let data = new Uint8Array(bech32.fromWords(words));
      switch (prefix) {
        case "nprofile": {
          let tlv = parseTLV(data);
          if (!tlv[0]?.[0])
            throw new Error("missing TLV 0 for nprofile");
          if (tlv[0][0].length !== 32)
            throw new Error("TLV 0 should be 32 bytes");
          return {
            type: "nprofile",
            data: {
              pubkey: bytesToHex(tlv[0][0]),
              relays: tlv[1] ? tlv[1].map((d) => utf8Decoder.decode(d)) : []
            }
          };
        }
        case "nevent": {
          let tlv = parseTLV(data);
          if (!tlv[0]?.[0])
            throw new Error("missing TLV 0 for nevent");
          if (tlv[0][0].length !== 32)
            throw new Error("TLV 0 should be 32 bytes");
          if (tlv[2] && tlv[2][0].length !== 32)
            throw new Error("TLV 2 should be 32 bytes");
          if (tlv[3] && tlv[3][0].length !== 4)
            throw new Error("TLV 3 should be 4 bytes");
          return {
            type: "nevent",
            data: {
              id: bytesToHex(tlv[0][0]),
              relays: tlv[1] ? tlv[1].map((d) => utf8Decoder.decode(d)) : [],
              author: tlv[2]?.[0] ? bytesToHex(tlv[2][0]) : void 0,
              kind: tlv[3]?.[0] ? parseInt(bytesToHex(tlv[3][0]), 16) : void 0
            }
          };
        }
        case "naddr": {
          let tlv = parseTLV(data);
          if (!tlv[0]?.[0])
            throw new Error("missing TLV 0 for naddr");
          if (!tlv[2]?.[0])
            throw new Error("missing TLV 2 for naddr");
          if (tlv[2][0].length !== 32)
            throw new Error("TLV 2 should be 32 bytes");
          if (!tlv[3]?.[0])
            throw new Error("missing TLV 3 for naddr");
          if (tlv[3][0].length !== 4)
            throw new Error("TLV 3 should be 4 bytes");
          return {
            type: "naddr",
            data: {
              identifier: utf8Decoder.decode(tlv[0][0]),
              pubkey: bytesToHex(tlv[2][0]),
              kind: parseInt(bytesToHex(tlv[3][0]), 16),
              relays: tlv[1] ? tlv[1].map((d) => utf8Decoder.decode(d)) : []
            }
          };
        }
        case "nrelay": {
          let tlv = parseTLV(data);
          if (!tlv[0]?.[0])
            throw new Error("missing TLV 0 for nrelay");
          return {
            type: "nrelay",
            data: utf8Decoder.decode(tlv[0][0])
          };
        }
        case "nsec":
          return { type: prefix, data };
        case "npub":
        case "note":
          return { type: prefix, data: bytesToHex(data) };
        default:
          throw new Error(`unknown prefix ${prefix}`);
      }
    }
    function parseTLV(data) {
      let result = {};
      let rest = data;
      while (rest.length > 0) {
        let t = rest[0];
        let l = rest[1];
        let v = rest.slice(2, 2 + l);
        rest = rest.slice(2 + l);
        if (v.length < l)
          throw new Error(`not enough data to read on TLV ${t}`);
        result[t] = result[t] || [];
        result[t].push(v);
      }
      return result;
    }
    function nsecEncode(key) {
      return encodeBytes("nsec", key);
    }
    function npubEncode(hex) {
      return encodeBytes("npub", hexToBytes(hex));
    }
    function noteEncode(hex) {
      return encodeBytes("note", hexToBytes(hex));
    }
    function encodeBech32(prefix, data) {
      let words = bech32.toWords(data);
      return bech32.encode(prefix, words, Bech32MaxSize);
    }
    function encodeBytes(prefix, bytes) {
      return encodeBech32(prefix, bytes);
    }
    function nprofileEncode(profile) {
      let data = encodeTLV({
        0: [hexToBytes(profile.pubkey)],
        1: (profile.relays || []).map((url) => utf8Encoder.encode(url))
      });
      return encodeBech32("nprofile", data);
    }
    function neventEncode(event) {
      let kindArray;
      if (event.kind !== void 0) {
        kindArray = integerToUint8Array(event.kind);
      }
      let data = encodeTLV({
        0: [hexToBytes(event.id)],
        1: (event.relays || []).map((url) => utf8Encoder.encode(url)),
        2: event.author ? [hexToBytes(event.author)] : [],
        3: kindArray ? [new Uint8Array(kindArray)] : []
      });
      return encodeBech32("nevent", data);
    }
    function naddrEncode(addr) {
      let kind = new ArrayBuffer(4);
      new DataView(kind).setUint32(0, addr.kind, false);
      let data = encodeTLV({
        0: [utf8Encoder.encode(addr.identifier)],
        1: (addr.relays || []).map((url) => utf8Encoder.encode(url)),
        2: [hexToBytes(addr.pubkey)],
        3: [new Uint8Array(kind)]
      });
      return encodeBech32("naddr", data);
    }
    function nrelayEncode(url) {
      let data = encodeTLV({
        0: [utf8Encoder.encode(url)]
      });
      return encodeBech32("nrelay", data);
    }
    function encodeTLV(tlv) {
      let entries = [];
      Object.entries(tlv).reverse().forEach(([t, vs]) => {
        vs.forEach((v) => {
          let entry = new Uint8Array(v.length + 2);
          entry.set([parseInt(t)], 0);
          entry.set([v.length], 1);
          entry.set(v, 2);
          entries.push(entry);
        });
      });
      return concatBytes(...entries);
    }

    // nip04.ts
    var nip04_exports = {};
    __export(nip04_exports, {
      decrypt: () => decrypt,
      encrypt: () => encrypt
    });
    async function encrypt(secretKey, pubkey, text) {
      const privkey = secretKey instanceof Uint8Array ? bytesToHex(secretKey) : secretKey;
      const key = secp256k1.getSharedSecret(privkey, "02" + pubkey);
      const normalizedKey = getNormalizedX(key);
      let iv = Uint8Array.from(randomBytes(16));
      let plaintext = utf8Encoder.encode(text);
      let ciphertext = cbc(normalizedKey, iv).encrypt(plaintext);
      let ctb64 = base64.encode(new Uint8Array(ciphertext));
      let ivb64 = base64.encode(new Uint8Array(iv.buffer));
      return `${ctb64}?iv=${ivb64}`;
    }
    async function decrypt(secretKey, pubkey, data) {
      const privkey = secretKey instanceof Uint8Array ? bytesToHex(secretKey) : secretKey;
      let [ctb64, ivb64] = data.split("?iv=");
      let key = secp256k1.getSharedSecret(privkey, "02" + pubkey);
      let normalizedKey = getNormalizedX(key);
      let iv = base64.decode(ivb64);
      let ciphertext = base64.decode(ctb64);
      let plaintext = cbc(normalizedKey, iv).decrypt(ciphertext);
      return utf8Decoder.decode(plaintext);
    }
    function getNormalizedX(key) {
      return key.slice(1, 33);
    }

    // nip05.ts
    var nip05_exports = {};
    __export(nip05_exports, {
      NIP05_REGEX: () => NIP05_REGEX,
      isValid: () => isValid,
      queryProfile: () => queryProfile,
      searchDomain: () => searchDomain,
      useFetchImplementation: () => useFetchImplementation
    });
    var NIP05_REGEX = /^(?:([\w.+-]+)@)?([\w_-]+(\.[\w_-]+)+)$/;
    var _fetch;
    try {
      _fetch = fetch;
    } catch {
    }
    function useFetchImplementation(fetchImplementation) {
      _fetch = fetchImplementation;
    }
    async function searchDomain(domain, query = "") {
      try {
        const url = `https://${domain}/.well-known/nostr.json?name=${query}`;
        const res = await _fetch(url, { redirect: "error" });
        const json = await res.json();
        return json.names;
      } catch (_) {
        return {};
      }
    }
    async function queryProfile(fullname) {
      const match = fullname.match(NIP05_REGEX);
      if (!match)
        return null;
      const [_, name = "_", domain] = match;
      try {
        const url = `https://${domain}/.well-known/nostr.json?name=${name}`;
        const res = await (await _fetch(url, { redirect: "error" })).json();
        let pubkey = res.names[name];
        return pubkey ? { pubkey, relays: res.relays?.[pubkey] } : null;
      } catch (_e) {
        return null;
      }
    }
    async function isValid(pubkey, nip05) {
      let res = await queryProfile(nip05);
      return res ? res.pubkey === pubkey : false;
    }

    // nip10.ts
    var nip10_exports = {};
    __export(nip10_exports, {
      parse: () => parse
    });
    function parse(event) {
      const result = {
        reply: void 0,
        root: void 0,
        mentions: [],
        profiles: []
      };
      const eTags = [];
      for (const tag of event.tags) {
        if (tag[0] === "e" && tag[1]) {
          eTags.push(tag);
        }
        if (tag[0] === "p" && tag[1]) {
          result.profiles.push({
            pubkey: tag[1],
            relays: tag[2] ? [tag[2]] : []
          });
        }
      }
      for (let eTagIndex = 0; eTagIndex < eTags.length; eTagIndex++) {
        const eTag = eTags[eTagIndex];
        const [_, eTagEventId, eTagRelayUrl, eTagMarker] = eTag;
        const eventPointer = {
          id: eTagEventId,
          relays: eTagRelayUrl ? [eTagRelayUrl] : []
        };
        const isFirstETag = eTagIndex === 0;
        const isLastETag = eTagIndex === eTags.length - 1;
        if (eTagMarker === "root") {
          result.root = eventPointer;
          continue;
        }
        if (eTagMarker === "reply") {
          result.reply = eventPointer;
          continue;
        }
        if (eTagMarker === "mention") {
          result.mentions.push(eventPointer);
          continue;
        }
        if (isFirstETag) {
          result.root = eventPointer;
          continue;
        }
        if (isLastETag) {
          result.reply = eventPointer;
          continue;
        }
        result.mentions.push(eventPointer);
      }
      return result;
    }

    // nip11.ts
    var nip11_exports = {};
    __export(nip11_exports, {
      fetchRelayInformation: () => fetchRelayInformation,
      useFetchImplementation: () => useFetchImplementation2
    });
    var _fetch2;
    try {
      _fetch2 = fetch;
    } catch {
    }
    function useFetchImplementation2(fetchImplementation) {
      _fetch2 = fetchImplementation;
    }
    async function fetchRelayInformation(url) {
      return await (await fetch(url.replace("ws://", "http://").replace("wss://", "https://"), {
        headers: { Accept: "application/nostr+json" }
      })).json();
    }

    // nip13.ts
    var nip13_exports = {};
    __export(nip13_exports, {
      getPow: () => getPow$1,
      minePow: () => minePow
    });
    function getPow$1(hex) {
      let count = 0;
      for (let i2 = 0; i2 < hex.length; i2++) {
        const nibble = parseInt(hex[i2], 16);
        if (nibble === 0) {
          count += 4;
        } else {
          count += Math.clz32(nibble) - 28;
          break;
        }
      }
      return count;
    }
    function minePow(unsigned, difficulty) {
      let count = 0;
      const event = unsigned;
      const tag = ["nonce", count.toString(), difficulty.toString()];
      event.tags.push(tag);
      while (true) {
        const now = Math.floor(new Date().getTime() / 1e3);
        if (now !== event.created_at) {
          count = 0;
          event.created_at = now;
        }
        tag[1] = (++count).toString();
        event.id = getEventHash(event);
        if (getPow$1(event.id) >= difficulty) {
          break;
        }
      }
      return event;
    }

    // nip18.ts
    var nip18_exports = {};
    __export(nip18_exports, {
      finishRepostEvent: () => finishRepostEvent,
      getRepostedEvent: () => getRepostedEvent,
      getRepostedEventPointer: () => getRepostedEventPointer
    });
    function finishRepostEvent(t, reposted, relayUrl, privateKey) {
      return finalizeEvent(
        {
          kind: Repost,
          tags: [...t.tags ?? [], ["e", reposted.id, relayUrl], ["p", reposted.pubkey]],
          content: t.content === "" ? "" : JSON.stringify(reposted),
          created_at: t.created_at
        },
        privateKey
      );
    }
    function getRepostedEventPointer(event) {
      if (event.kind !== Repost) {
        return void 0;
      }
      let lastETag;
      let lastPTag;
      for (let i2 = event.tags.length - 1; i2 >= 0 && (lastETag === void 0 || lastPTag === void 0); i2--) {
        const tag = event.tags[i2];
        if (tag.length >= 2) {
          if (tag[0] === "e" && lastETag === void 0) {
            lastETag = tag;
          } else if (tag[0] === "p" && lastPTag === void 0) {
            lastPTag = tag;
          }
        }
      }
      if (lastETag === void 0) {
        return void 0;
      }
      return {
        id: lastETag[1],
        relays: [lastETag[2], lastPTag?.[2]].filter((x) => typeof x === "string"),
        author: lastPTag?.[1]
      };
    }
    function getRepostedEvent(event, { skipVerification } = {}) {
      const pointer = getRepostedEventPointer(event);
      if (pointer === void 0 || event.content === "") {
        return void 0;
      }
      let repostedEvent;
      try {
        repostedEvent = JSON.parse(event.content);
      } catch (error) {
        return void 0;
      }
      if (repostedEvent.id !== pointer.id) {
        return void 0;
      }
      if (!skipVerification && !verifyEvent(repostedEvent)) {
        return void 0;
      }
      return repostedEvent;
    }

    // nip21.ts
    var nip21_exports = {};
    __export(nip21_exports, {
      NOSTR_URI_REGEX: () => NOSTR_URI_REGEX,
      parse: () => parse2,
      test: () => test
    });
    var NOSTR_URI_REGEX = new RegExp(`nostr:(${BECH32_REGEX.source})`);
    function test(value) {
      return typeof value === "string" && new RegExp(`^${NOSTR_URI_REGEX.source}$`).test(value);
    }
    function parse2(uri) {
      const match = uri.match(new RegExp(`^${NOSTR_URI_REGEX.source}$`));
      if (!match)
        throw new Error(`Invalid Nostr URI: ${uri}`);
      return {
        uri: match[0],
        value: match[1],
        decoded: decode(match[1])
      };
    }

    // nip25.ts
    var nip25_exports = {};
    __export(nip25_exports, {
      finishReactionEvent: () => finishReactionEvent,
      getReactedEventPointer: () => getReactedEventPointer
    });
    function finishReactionEvent(t, reacted, privateKey) {
      const inheritedTags = reacted.tags.filter((tag) => tag.length >= 2 && (tag[0] === "e" || tag[0] === "p"));
      return finalizeEvent(
        {
          ...t,
          kind: Reaction,
          tags: [...t.tags ?? [], ...inheritedTags, ["e", reacted.id], ["p", reacted.pubkey]],
          content: t.content ?? "+"
        },
        privateKey
      );
    }
    function getReactedEventPointer(event) {
      if (event.kind !== Reaction) {
        return void 0;
      }
      let lastETag;
      let lastPTag;
      for (let i2 = event.tags.length - 1; i2 >= 0 && (lastETag === void 0 || lastPTag === void 0); i2--) {
        const tag = event.tags[i2];
        if (tag.length >= 2) {
          if (tag[0] === "e" && lastETag === void 0) {
            lastETag = tag;
          } else if (tag[0] === "p" && lastPTag === void 0) {
            lastPTag = tag;
          }
        }
      }
      if (lastETag === void 0 || lastPTag === void 0) {
        return void 0;
      }
      return {
        id: lastETag[1],
        relays: [lastETag[2], lastPTag[2]].filter((x) => x !== void 0),
        author: lastPTag[1]
      };
    }

    // nip27.ts
    var nip27_exports = {};
    __export(nip27_exports, {
      matchAll: () => matchAll,
      regex: () => regex,
      replaceAll: () => replaceAll
    });
    var regex = () => new RegExp(`\\b${NOSTR_URI_REGEX.source}\\b`, "g");
    function* matchAll(content) {
      const matches = content.matchAll(regex());
      for (const match of matches) {
        try {
          const [uri, value] = match;
          yield {
            uri,
            value,
            decoded: decode(value),
            start: match.index,
            end: match.index + uri.length
          };
        } catch (_e) {
        }
      }
    }
    function replaceAll(content, replacer) {
      return content.replaceAll(regex(), (uri, value) => {
        return replacer({
          uri,
          value,
          decoded: decode(value)
        });
      });
    }

    // nip28.ts
    var nip28_exports = {};
    __export(nip28_exports, {
      channelCreateEvent: () => channelCreateEvent,
      channelHideMessageEvent: () => channelHideMessageEvent,
      channelMessageEvent: () => channelMessageEvent,
      channelMetadataEvent: () => channelMetadataEvent,
      channelMuteUserEvent: () => channelMuteUserEvent
    });
    var channelCreateEvent = (t, privateKey) => {
      let content;
      if (typeof t.content === "object") {
        content = JSON.stringify(t.content);
      } else if (typeof t.content === "string") {
        content = t.content;
      } else {
        return void 0;
      }
      return finalizeEvent(
        {
          kind: ChannelCreation,
          tags: [...t.tags ?? []],
          content,
          created_at: t.created_at
        },
        privateKey
      );
    };
    var channelMetadataEvent = (t, privateKey) => {
      let content;
      if (typeof t.content === "object") {
        content = JSON.stringify(t.content);
      } else if (typeof t.content === "string") {
        content = t.content;
      } else {
        return void 0;
      }
      return finalizeEvent(
        {
          kind: ChannelMetadata,
          tags: [["e", t.channel_create_event_id], ...t.tags ?? []],
          content,
          created_at: t.created_at
        },
        privateKey
      );
    };
    var channelMessageEvent = (t, privateKey) => {
      const tags = [["e", t.channel_create_event_id, t.relay_url, "root"]];
      if (t.reply_to_channel_message_event_id) {
        tags.push(["e", t.reply_to_channel_message_event_id, t.relay_url, "reply"]);
      }
      return finalizeEvent(
        {
          kind: ChannelMessage,
          tags: [...tags, ...t.tags ?? []],
          content: t.content,
          created_at: t.created_at
        },
        privateKey
      );
    };
    var channelHideMessageEvent = (t, privateKey) => {
      let content;
      if (typeof t.content === "object") {
        content = JSON.stringify(t.content);
      } else if (typeof t.content === "string") {
        content = t.content;
      } else {
        return void 0;
      }
      return finalizeEvent(
        {
          kind: ChannelHideMessage,
          tags: [["e", t.channel_message_event_id], ...t.tags ?? []],
          content,
          created_at: t.created_at
        },
        privateKey
      );
    };
    var channelMuteUserEvent = (t, privateKey) => {
      let content;
      if (typeof t.content === "object") {
        content = JSON.stringify(t.content);
      } else if (typeof t.content === "string") {
        content = t.content;
      } else {
        return void 0;
      }
      return finalizeEvent(
        {
          kind: ChannelMuteUser,
          tags: [["p", t.pubkey_to_mute], ...t.tags ?? []],
          content,
          created_at: t.created_at
        },
        privateKey
      );
    };

    // nip30.ts
    var nip30_exports = {};
    __export(nip30_exports, {
      EMOJI_SHORTCODE_REGEX: () => EMOJI_SHORTCODE_REGEX,
      matchAll: () => matchAll2,
      regex: () => regex2,
      replaceAll: () => replaceAll2
    });
    var EMOJI_SHORTCODE_REGEX = /:(\w+):/;
    var regex2 = () => new RegExp(`\\B${EMOJI_SHORTCODE_REGEX.source}\\B`, "g");
    function* matchAll2(content) {
      const matches = content.matchAll(regex2());
      for (const match of matches) {
        try {
          const [shortcode, name] = match;
          yield {
            shortcode,
            name,
            start: match.index,
            end: match.index + shortcode.length
          };
        } catch (_e) {
        }
      }
    }
    function replaceAll2(content, replacer) {
      return content.replaceAll(regex2(), (shortcode, name) => {
        return replacer({
          shortcode,
          name
        });
      });
    }

    // nip39.ts
    var nip39_exports = {};
    __export(nip39_exports, {
      useFetchImplementation: () => useFetchImplementation3,
      validateGithub: () => validateGithub
    });
    var _fetch3;
    try {
      _fetch3 = fetch;
    } catch {
    }
    function useFetchImplementation3(fetchImplementation) {
      _fetch3 = fetchImplementation;
    }
    async function validateGithub(pubkey, username, proof) {
      try {
        let res = await (await _fetch3(`https://gist.github.com/${username}/${proof}/raw`)).text();
        return res === `Verifying that I control the following Nostr public key: ${pubkey}`;
      } catch (_) {
        return false;
      }
    }

    // nip44.ts
    var nip44_exports = {};
    __export(nip44_exports, {
      decrypt: () => decrypt2,
      encrypt: () => encrypt2,
      getConversationKey: () => getConversationKey,
      v2: () => v2
    });
    var minPlaintextSize = 1;
    var maxPlaintextSize = 65535;
    function getConversationKey(privkeyA, pubkeyB) {
      const sharedX = secp256k1.getSharedSecret(privkeyA, "02" + pubkeyB).subarray(1, 33);
      return extract(sha256, sharedX, "nip44-v2");
    }
    function getMessageKeys(conversationKey, nonce) {
      const keys = expand(sha256, conversationKey, nonce, 76);
      return {
        chacha_key: keys.subarray(0, 32),
        chacha_nonce: keys.subarray(32, 44),
        hmac_key: keys.subarray(44, 76)
      };
    }
    function calcPaddedLen(len) {
      if (!Number.isSafeInteger(len) || len < 1)
        throw new Error("expected positive integer");
      if (len <= 32)
        return 32;
      const nextPower = 1 << Math.floor(Math.log2(len - 1)) + 1;
      const chunk = nextPower <= 256 ? 32 : nextPower / 8;
      return chunk * (Math.floor((len - 1) / chunk) + 1);
    }
    function writeU16BE(num) {
      if (!Number.isSafeInteger(num) || num < minPlaintextSize || num > maxPlaintextSize)
        throw new Error("invalid plaintext size: must be between 1 and 65535 bytes");
      const arr = new Uint8Array(2);
      new DataView(arr.buffer).setUint16(0, num, false);
      return arr;
    }
    function pad(plaintext) {
      const unpadded = utf8Encoder.encode(plaintext);
      const unpaddedLen = unpadded.length;
      const prefix = writeU16BE(unpaddedLen);
      const suffix = new Uint8Array(calcPaddedLen(unpaddedLen) - unpaddedLen);
      return concatBytes(prefix, unpadded, suffix);
    }
    function unpad(padded) {
      const unpaddedLen = new DataView(padded.buffer).getUint16(0);
      const unpadded = padded.subarray(2, 2 + unpaddedLen);
      if (unpaddedLen < minPlaintextSize || unpaddedLen > maxPlaintextSize || unpadded.length !== unpaddedLen || padded.length !== 2 + calcPaddedLen(unpaddedLen))
        throw new Error("invalid padding");
      return utf8Decoder.decode(unpadded);
    }
    function hmacAad(key, message, aad) {
      if (aad.length !== 32)
        throw new Error("AAD associated data must be 32 bytes");
      const combined = concatBytes(aad, message);
      return hmac(sha256, key, combined);
    }
    function decodePayload(payload) {
      if (typeof payload !== "string")
        throw new Error("payload must be a valid string");
      const plen = payload.length;
      if (plen < 132 || plen > 87472)
        throw new Error("invalid payload length: " + plen);
      if (payload[0] === "#")
        throw new Error("unknown encryption version");
      let data;
      try {
        data = base64.decode(payload);
      } catch (error) {
        throw new Error("invalid base64: " + error.message);
      }
      const dlen = data.length;
      if (dlen < 99 || dlen > 65603)
        throw new Error("invalid data length: " + dlen);
      const vers = data[0];
      if (vers !== 2)
        throw new Error("unknown encryption version " + vers);
      return {
        nonce: data.subarray(1, 33),
        ciphertext: data.subarray(33, -32),
        mac: data.subarray(-32)
      };
    }
    function encrypt2(plaintext, conversationKey, nonce = randomBytes(32)) {
      const { chacha_key, chacha_nonce, hmac_key } = getMessageKeys(conversationKey, nonce);
      const padded = pad(plaintext);
      const ciphertext = chacha20(chacha_key, chacha_nonce, padded);
      const mac = hmacAad(hmac_key, ciphertext, nonce);
      return base64.encode(concatBytes(new Uint8Array([2]), nonce, ciphertext, mac));
    }
    function decrypt2(payload, conversationKey) {
      const { nonce, ciphertext, mac } = decodePayload(payload);
      const { chacha_key, chacha_nonce, hmac_key } = getMessageKeys(conversationKey, nonce);
      const calculatedMac = hmacAad(hmac_key, ciphertext, nonce);
      if (!equalBytes(calculatedMac, mac))
        throw new Error("invalid MAC");
      const padded = chacha20(chacha_key, chacha_nonce, ciphertext);
      return unpad(padded);
    }
    var v2 = {
      utils: {
        getConversationKey,
        calcPaddedLen
      },
      encrypt: encrypt2,
      decrypt: decrypt2
    };

    // nip47.ts
    var nip47_exports = {};
    __export(nip47_exports, {
      makeNwcRequestEvent: () => makeNwcRequestEvent,
      parseConnectionString: () => parseConnectionString
    });
    function parseConnectionString(connectionString) {
      const { pathname, searchParams } = new URL(connectionString);
      const pubkey = pathname;
      const relay = searchParams.get("relay");
      const secret = searchParams.get("secret");
      if (!pubkey || !relay || !secret) {
        throw new Error("invalid connection string");
      }
      return { pubkey, relay, secret };
    }
    async function makeNwcRequestEvent(pubkey, secretKey, invoice) {
      const content = {
        method: "pay_invoice",
        params: {
          invoice
        }
      };
      const encryptedContent = await encrypt(secretKey, pubkey, JSON.stringify(content));
      const eventTemplate = {
        kind: NWCWalletRequest,
        created_at: Math.round(Date.now() / 1e3),
        content: encryptedContent,
        tags: [["p", pubkey]]
      };
      return finalizeEvent(eventTemplate, secretKey);
    }

    // nip57.ts
    var nip57_exports = {};
    __export(nip57_exports, {
      getZapEndpoint: () => getZapEndpoint,
      makeZapReceipt: () => makeZapReceipt,
      makeZapRequest: () => makeZapRequest,
      useFetchImplementation: () => useFetchImplementation4,
      validateZapRequest: () => validateZapRequest
    });
    var _fetch4;
    try {
      _fetch4 = fetch;
    } catch {
    }
    function useFetchImplementation4(fetchImplementation) {
      _fetch4 = fetchImplementation;
    }
    async function getZapEndpoint(metadata) {
      try {
        let lnurl = "";
        let { lud06, lud16 } = JSON.parse(metadata.content);
        if (lud06) {
          let { words } = bech32.decode(lud06, 1e3);
          let data = bech32.fromWords(words);
          lnurl = utf8Decoder.decode(data);
        } else if (lud16) {
          let [name, domain] = lud16.split("@");
          lnurl = new URL(`/.well-known/lnurlp/${name}`, `https://${domain}`).toString();
        } else {
          return null;
        }
        let res = await _fetch4(lnurl);
        let body = await res.json();
        if (body.allowsNostr && body.nostrPubkey) {
          return body.callback;
        }
      } catch (err) {
      }
      return null;
    }
    function makeZapRequest({
      profile,
      event,
      amount,
      relays,
      comment = ""
    }) {
      if (!amount)
        throw new Error("amount not given");
      if (!profile)
        throw new Error("profile not given");
      let zr = {
        kind: 9734,
        created_at: Math.round(Date.now() / 1e3),
        content: comment,
        tags: [
          ["p", profile],
          ["amount", amount.toString()],
          ["relays", ...relays]
        ]
      };
      if (event) {
        zr.tags.push(["e", event]);
      }
      return zr;
    }
    function validateZapRequest(zapRequestString) {
      let zapRequest;
      try {
        zapRequest = JSON.parse(zapRequestString);
      } catch (err) {
        return "Invalid zap request JSON.";
      }
      if (!validateEvent(zapRequest))
        return "Zap request is not a valid Nostr event.";
      if (!verifyEvent(zapRequest))
        return "Invalid signature on zap request.";
      let p = zapRequest.tags.find(([t, v]) => t === "p" && v);
      if (!p)
        return "Zap request doesn't have a 'p' tag.";
      if (!p[1].match(/^[a-f0-9]{64}$/))
        return "Zap request 'p' tag is not valid hex.";
      let e = zapRequest.tags.find(([t, v]) => t === "e" && v);
      if (e && !e[1].match(/^[a-f0-9]{64}$/))
        return "Zap request 'e' tag is not valid hex.";
      let relays = zapRequest.tags.find(([t, v]) => t === "relays" && v);
      if (!relays)
        return "Zap request doesn't have a 'relays' tag.";
      return null;
    }
    function makeZapReceipt({
      zapRequest,
      preimage,
      bolt11,
      paidAt
    }) {
      let zr = JSON.parse(zapRequest);
      let tagsFromZapRequest = zr.tags.filter(([t]) => t === "e" || t === "p" || t === "a");
      let zap = {
        kind: 9735,
        created_at: Math.round(paidAt.getTime() / 1e3),
        content: "",
        tags: [...tagsFromZapRequest, ["P", zr.pubkey], ["bolt11", bolt11], ["description", zapRequest]]
      };
      if (preimage) {
        zap.tags.push(["preimage", preimage]);
      }
      return zap;
    }

    // nip98.ts
    var nip98_exports = {};
    __export(nip98_exports, {
      getToken: () => getToken,
      hashPayload: () => hashPayload,
      unpackEventFromToken: () => unpackEventFromToken,
      validateEvent: () => validateEvent2,
      validateEventKind: () => validateEventKind,
      validateEventMethodTag: () => validateEventMethodTag,
      validateEventPayloadTag: () => validateEventPayloadTag,
      validateEventTimestamp: () => validateEventTimestamp,
      validateEventUrlTag: () => validateEventUrlTag,
      validateToken: () => validateToken
    });
    var _authorizationScheme = "Nostr ";
    async function getToken(loginUrl, httpMethod, sign, includeAuthorizationScheme = false, payload) {
      const event = {
        kind: HTTPAuth,
        tags: [
          ["u", loginUrl],
          ["method", httpMethod]
        ],
        created_at: Math.round(new Date().getTime() / 1e3),
        content: ""
      };
      if (payload) {
        event.tags.push(["payload", hashPayload(payload)]);
      }
      const signedEvent = await sign(event);
      const authorizationScheme = includeAuthorizationScheme ? _authorizationScheme : "";
      return authorizationScheme + base64.encode(utf8Encoder.encode(JSON.stringify(signedEvent)));
    }
    async function validateToken(token, url, method) {
      const event = await unpackEventFromToken(token).catch((error) => {
        throw error;
      });
      const valid = await validateEvent2(event, url, method).catch((error) => {
        throw error;
      });
      return valid;
    }
    async function unpackEventFromToken(token) {
      if (!token) {
        throw new Error("Missing token");
      }
      token = token.replace(_authorizationScheme, "");
      const eventB64 = utf8Decoder.decode(base64.decode(token));
      if (!eventB64 || eventB64.length === 0 || !eventB64.startsWith("{")) {
        throw new Error("Invalid token");
      }
      const event = JSON.parse(eventB64);
      return event;
    }
    function validateEventTimestamp(event) {
      if (!event.created_at) {
        return false;
      }
      return Math.round(new Date().getTime() / 1e3) - event.created_at < 60;
    }
    function validateEventKind(event) {
      return event.kind === HTTPAuth;
    }
    function validateEventUrlTag(event, url) {
      const urlTag = event.tags.find((t) => t[0] === "u");
      if (!urlTag) {
        return false;
      }
      return urlTag.length > 0 && urlTag[1] === url;
    }
    function validateEventMethodTag(event, method) {
      const methodTag = event.tags.find((t) => t[0] === "method");
      if (!methodTag) {
        return false;
      }
      return methodTag.length > 0 && methodTag[1].toLowerCase() === method.toLowerCase();
    }
    function hashPayload(payload) {
      const hash = sha256(utf8Encoder.encode(JSON.stringify(payload)));
      return bytesToHex(hash);
    }
    function validateEventPayloadTag(event, payload) {
      const payloadTag = event.tags.find((t) => t[0] === "payload");
      if (!payloadTag) {
        return false;
      }
      const payloadHash = hashPayload(payload);
      return payloadTag.length > 0 && payloadTag[1] === payloadHash;
    }
    async function validateEvent2(event, url, method, body) {
      if (!verifyEvent(event)) {
        throw new Error("Invalid nostr event, signature invalid");
      }
      if (!validateEventKind(event)) {
        throw new Error("Invalid nostr event, kind invalid");
      }
      if (!validateEventTimestamp(event)) {
        throw new Error("Invalid nostr event, created_at timestamp invalid");
      }
      if (!validateEventUrlTag(event, url)) {
        throw new Error("Invalid nostr event, url tag invalid");
      }
      if (!validateEventMethodTag(event, method)) {
        throw new Error("Invalid nostr event, method tag invalid");
      }
      if (Boolean(body) && typeof body === "object" && Object.keys(body).length > 0) {
        if (!validateEventPayloadTag(event, body)) {
          throw new Error("Invalid nostr event, payload tag does not match request body hash");
        }
      }
      return true;
    }

    // node_modules/tslib/tslib.es6.mjs
    var extendStatics = function(d, b) {
      extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d2, b2) {
        d2.__proto__ = b2;
      } || function(d2, b2) {
        for (var p in b2) if (Object.prototype.hasOwnProperty.call(b2, p)) d2[p] = b2[p];
      };
      return extendStatics(d, b);
    };
    function __extends(d, b) {
      if (typeof b !== "function" && b !== null)
        throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
      extendStatics(d, b);
      function __() {
        this.constructor = d;
      }
      d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    }
    function __values(o) {
      var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
      if (m) return m.call(o);
      if (o && typeof o.length === "number") return {
        next: function() {
          if (o && i >= o.length) o = void 0;
          return { value: o && o[i++], done: !o };
        }
      };
      throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
    }
    function __read(o, n) {
      var m = typeof Symbol === "function" && o[Symbol.iterator];
      if (!m) return o;
      var i = m.call(o), r, ar = [], e;
      try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
      } catch (error) {
        e = { error };
      } finally {
        try {
          if (r && !r.done && (m = i["return"])) m.call(i);
        } finally {
          if (e) throw e.error;
        }
      }
      return ar;
    }
    function __spreadArray(to, from, pack) {
      if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
          if (!ar) ar = Array.prototype.slice.call(from, 0, i);
          ar[i] = from[i];
        }
      }
      return to.concat(ar || Array.prototype.slice.call(from));
    }

    // node_modules/rxjs/dist/esm5/internal/util/isFunction.js
    function isFunction(value) {
      return typeof value === "function";
    }

    // node_modules/rxjs/dist/esm5/internal/util/createErrorClass.js
    function createErrorClass(createImpl) {
      var _super = function(instance) {
        Error.call(instance);
        instance.stack = new Error().stack;
      };
      var ctorFunc = createImpl(_super);
      ctorFunc.prototype = Object.create(Error.prototype);
      ctorFunc.prototype.constructor = ctorFunc;
      return ctorFunc;
    }

    // node_modules/rxjs/dist/esm5/internal/util/UnsubscriptionError.js
    var UnsubscriptionError = createErrorClass(function(_super) {
      return function UnsubscriptionErrorImpl(errors) {
        _super(this);
        this.message = errors ? errors.length + " errors occurred during unsubscription:\n" + errors.map(function(err, i) {
          return i + 1 + ") " + err.toString();
        }).join("\n  ") : "";
        this.name = "UnsubscriptionError";
        this.errors = errors;
      };
    });

    // node_modules/rxjs/dist/esm5/internal/util/arrRemove.js
    function arrRemove(arr, item) {
      if (arr) {
        var index = arr.indexOf(item);
        0 <= index && arr.splice(index, 1);
      }
    }

    // node_modules/rxjs/dist/esm5/internal/Subscription.js
    var Subscription = function() {
      function Subscription2(initialTeardown) {
        this.initialTeardown = initialTeardown;
        this.closed = false;
        this._parentage = null;
        this._finalizers = null;
      }
      Subscription2.prototype.unsubscribe = function() {
        var e_1, _a, e_2, _b;
        var errors;
        if (!this.closed) {
          this.closed = true;
          var _parentage = this._parentage;
          if (_parentage) {
            this._parentage = null;
            if (Array.isArray(_parentage)) {
              try {
                for (var _parentage_1 = __values(_parentage), _parentage_1_1 = _parentage_1.next(); !_parentage_1_1.done; _parentage_1_1 = _parentage_1.next()) {
                  var parent_1 = _parentage_1_1.value;
                  parent_1.remove(this);
                }
              } catch (e_1_1) {
                e_1 = { error: e_1_1 };
              } finally {
                try {
                  if (_parentage_1_1 && !_parentage_1_1.done && (_a = _parentage_1.return)) _a.call(_parentage_1);
                } finally {
                  if (e_1) throw e_1.error;
                }
              }
            } else {
              _parentage.remove(this);
            }
          }
          var initialFinalizer = this.initialTeardown;
          if (isFunction(initialFinalizer)) {
            try {
              initialFinalizer();
            } catch (e) {
              errors = e instanceof UnsubscriptionError ? e.errors : [e];
            }
          }
          var _finalizers = this._finalizers;
          if (_finalizers) {
            this._finalizers = null;
            try {
              for (var _finalizers_1 = __values(_finalizers), _finalizers_1_1 = _finalizers_1.next(); !_finalizers_1_1.done; _finalizers_1_1 = _finalizers_1.next()) {
                var finalizer = _finalizers_1_1.value;
                try {
                  execFinalizer(finalizer);
                } catch (err) {
                  errors = errors !== null && errors !== void 0 ? errors : [];
                  if (err instanceof UnsubscriptionError) {
                    errors = __spreadArray(__spreadArray([], __read(errors)), __read(err.errors));
                  } else {
                    errors.push(err);
                  }
                }
              }
            } catch (e_2_1) {
              e_2 = { error: e_2_1 };
            } finally {
              try {
                if (_finalizers_1_1 && !_finalizers_1_1.done && (_b = _finalizers_1.return)) _b.call(_finalizers_1);
              } finally {
                if (e_2) throw e_2.error;
              }
            }
          }
          if (errors) {
            throw new UnsubscriptionError(errors);
          }
        }
      };
      Subscription2.prototype.add = function(teardown) {
        var _a;
        if (teardown && teardown !== this) {
          if (this.closed) {
            execFinalizer(teardown);
          } else {
            if (teardown instanceof Subscription2) {
              if (teardown.closed || teardown._hasParent(this)) {
                return;
              }
              teardown._addParent(this);
            }
            (this._finalizers = (_a = this._finalizers) !== null && _a !== void 0 ? _a : []).push(teardown);
          }
        }
      };
      Subscription2.prototype._hasParent = function(parent) {
        var _parentage = this._parentage;
        return _parentage === parent || Array.isArray(_parentage) && _parentage.includes(parent);
      };
      Subscription2.prototype._addParent = function(parent) {
        var _parentage = this._parentage;
        this._parentage = Array.isArray(_parentage) ? (_parentage.push(parent), _parentage) : _parentage ? [_parentage, parent] : parent;
      };
      Subscription2.prototype._removeParent = function(parent) {
        var _parentage = this._parentage;
        if (_parentage === parent) {
          this._parentage = null;
        } else if (Array.isArray(_parentage)) {
          arrRemove(_parentage, parent);
        }
      };
      Subscription2.prototype.remove = function(teardown) {
        var _finalizers = this._finalizers;
        _finalizers && arrRemove(_finalizers, teardown);
        if (teardown instanceof Subscription2) {
          teardown._removeParent(this);
        }
      };
      Subscription2.EMPTY = function() {
        var empty = new Subscription2();
        empty.closed = true;
        return empty;
      }();
      return Subscription2;
    }();
    var EMPTY_SUBSCRIPTION = Subscription.EMPTY;
    function isSubscription(value) {
      return value instanceof Subscription || value && "closed" in value && isFunction(value.remove) && isFunction(value.add) && isFunction(value.unsubscribe);
    }
    function execFinalizer(finalizer) {
      if (isFunction(finalizer)) {
        finalizer();
      } else {
        finalizer.unsubscribe();
      }
    }

    // node_modules/rxjs/dist/esm5/internal/config.js
    var config = {
      onUnhandledError: null,
      onStoppedNotification: null,
      Promise: void 0,
      useDeprecatedSynchronousErrorHandling: false,
      useDeprecatedNextContext: false
    };

    // node_modules/rxjs/dist/esm5/internal/scheduler/timeoutProvider.js
    var timeoutProvider = {
      setTimeout: function(handler, timeout) {
        var args = [];
        for (var _i = 2; _i < arguments.length; _i++) {
          args[_i - 2] = arguments[_i];
        }
        return setTimeout.apply(void 0, __spreadArray([handler, timeout], __read(args)));
      },
      clearTimeout: function(handle) {
        return (clearTimeout)(handle);
      },
      delegate: void 0
    };

    // node_modules/rxjs/dist/esm5/internal/util/reportUnhandledError.js
    function reportUnhandledError(err) {
      timeoutProvider.setTimeout(function() {
        {
          throw err;
        }
      });
    }

    // node_modules/rxjs/dist/esm5/internal/util/noop.js
    function noop() {
    }
    function errorContext(cb) {
      {
        cb();
      }
    }

    // node_modules/rxjs/dist/esm5/internal/Subscriber.js
    var Subscriber = function(_super) {
      __extends(Subscriber2, _super);
      function Subscriber2(destination) {
        var _this = _super.call(this) || this;
        _this.isStopped = false;
        if (destination) {
          _this.destination = destination;
          if (isSubscription(destination)) {
            destination.add(_this);
          }
        } else {
          _this.destination = EMPTY_OBSERVER;
        }
        return _this;
      }
      Subscriber2.create = function(next, error, complete) {
        return new SafeSubscriber(next, error, complete);
      };
      Subscriber2.prototype.next = function(value) {
        if (this.isStopped) ; else {
          this._next(value);
        }
      };
      Subscriber2.prototype.error = function(err) {
        if (this.isStopped) ; else {
          this.isStopped = true;
          this._error(err);
        }
      };
      Subscriber2.prototype.complete = function() {
        if (this.isStopped) ; else {
          this.isStopped = true;
          this._complete();
        }
      };
      Subscriber2.prototype.unsubscribe = function() {
        if (!this.closed) {
          this.isStopped = true;
          _super.prototype.unsubscribe.call(this);
          this.destination = null;
        }
      };
      Subscriber2.prototype._next = function(value) {
        this.destination.next(value);
      };
      Subscriber2.prototype._error = function(err) {
        try {
          this.destination.error(err);
        } finally {
          this.unsubscribe();
        }
      };
      Subscriber2.prototype._complete = function() {
        try {
          this.destination.complete();
        } finally {
          this.unsubscribe();
        }
      };
      return Subscriber2;
    }(Subscription);
    var _bind = Function.prototype.bind;
    function bind(fn, thisArg) {
      return _bind.call(fn, thisArg);
    }
    var ConsumerObserver = function() {
      function ConsumerObserver2(partialObserver) {
        this.partialObserver = partialObserver;
      }
      ConsumerObserver2.prototype.next = function(value) {
        var partialObserver = this.partialObserver;
        if (partialObserver.next) {
          try {
            partialObserver.next(value);
          } catch (error) {
            handleUnhandledError(error);
          }
        }
      };
      ConsumerObserver2.prototype.error = function(err) {
        var partialObserver = this.partialObserver;
        if (partialObserver.error) {
          try {
            partialObserver.error(err);
          } catch (error) {
            handleUnhandledError(error);
          }
        } else {
          handleUnhandledError(err);
        }
      };
      ConsumerObserver2.prototype.complete = function() {
        var partialObserver = this.partialObserver;
        if (partialObserver.complete) {
          try {
            partialObserver.complete();
          } catch (error) {
            handleUnhandledError(error);
          }
        }
      };
      return ConsumerObserver2;
    }();
    var SafeSubscriber = function(_super) {
      __extends(SafeSubscriber2, _super);
      function SafeSubscriber2(observerOrNext, error, complete) {
        var _this = _super.call(this) || this;
        var partialObserver;
        if (isFunction(observerOrNext) || !observerOrNext) {
          partialObserver = {
            next: observerOrNext !== null && observerOrNext !== void 0 ? observerOrNext : void 0,
            error: error !== null && error !== void 0 ? error : void 0,
            complete: complete !== null && complete !== void 0 ? complete : void 0
          };
        } else {
          var context_1;
          if (_this && config.useDeprecatedNextContext) {
            context_1 = Object.create(observerOrNext);
            context_1.unsubscribe = function() {
              return _this.unsubscribe();
            };
            partialObserver = {
              next: observerOrNext.next && bind(observerOrNext.next, context_1),
              error: observerOrNext.error && bind(observerOrNext.error, context_1),
              complete: observerOrNext.complete && bind(observerOrNext.complete, context_1)
            };
          } else {
            partialObserver = observerOrNext;
          }
        }
        _this.destination = new ConsumerObserver(partialObserver);
        return _this;
      }
      return SafeSubscriber2;
    }(Subscriber);
    function handleUnhandledError(error) {
      {
        reportUnhandledError(error);
      }
    }
    function defaultErrorHandler(err) {
      throw err;
    }
    var EMPTY_OBSERVER = {
      closed: true,
      next: noop,
      error: defaultErrorHandler,
      complete: noop
    };

    // node_modules/rxjs/dist/esm5/internal/symbol/observable.js
    var observable = function() {
      return typeof Symbol === "function" && Symbol.observable || "@@observable";
    }();

    // node_modules/rxjs/dist/esm5/internal/util/identity.js
    function identity(x) {
      return x;
    }

    // node_modules/rxjs/dist/esm5/internal/util/pipe.js
    function pipeFromArray(fns) {
      if (fns.length === 0) {
        return identity;
      }
      if (fns.length === 1) {
        return fns[0];
      }
      return function piped(input) {
        return fns.reduce(function(prev, fn) {
          return fn(prev);
        }, input);
      };
    }

    // node_modules/rxjs/dist/esm5/internal/Observable.js
    var Observable = function() {
      function Observable2(subscribe) {
        if (subscribe) {
          this._subscribe = subscribe;
        }
      }
      Observable2.prototype.lift = function(operator) {
        var observable2 = new Observable2();
        observable2.source = this;
        observable2.operator = operator;
        return observable2;
      };
      Observable2.prototype.subscribe = function(observerOrNext, error, complete) {
        var _this = this;
        var subscriber = isSubscriber(observerOrNext) ? observerOrNext : new SafeSubscriber(observerOrNext, error, complete);
        errorContext(function() {
          var _a = _this, operator = _a.operator, source = _a.source;
          subscriber.add(operator ? operator.call(subscriber, source) : source ? _this._subscribe(subscriber) : _this._trySubscribe(subscriber));
        });
        return subscriber;
      };
      Observable2.prototype._trySubscribe = function(sink) {
        try {
          return this._subscribe(sink);
        } catch (err) {
          sink.error(err);
        }
      };
      Observable2.prototype.forEach = function(next, promiseCtor) {
        var _this = this;
        promiseCtor = getPromiseCtor(promiseCtor);
        return new promiseCtor(function(resolve, reject) {
          var subscriber = new SafeSubscriber({
            next: function(value) {
              try {
                next(value);
              } catch (err) {
                reject(err);
                subscriber.unsubscribe();
              }
            },
            error: reject,
            complete: resolve
          });
          _this.subscribe(subscriber);
        });
      };
      Observable2.prototype._subscribe = function(subscriber) {
        var _a;
        return (_a = this.source) === null || _a === void 0 ? void 0 : _a.subscribe(subscriber);
      };
      Observable2.prototype[observable] = function() {
        return this;
      };
      Observable2.prototype.pipe = function() {
        var operations = [];
        for (var _i = 0; _i < arguments.length; _i++) {
          operations[_i] = arguments[_i];
        }
        return pipeFromArray(operations)(this);
      };
      Observable2.prototype.toPromise = function(promiseCtor) {
        var _this = this;
        promiseCtor = getPromiseCtor(promiseCtor);
        return new promiseCtor(function(resolve, reject) {
          var value;
          _this.subscribe(function(x) {
            return value = x;
          }, function(err) {
            return reject(err);
          }, function() {
            return resolve(value);
          });
        });
      };
      Observable2.create = function(subscribe) {
        return new Observable2(subscribe);
      };
      return Observable2;
    }();
    function getPromiseCtor(promiseCtor) {
      var _a;
      return (_a = promiseCtor !== null && promiseCtor !== void 0 ? promiseCtor : config.Promise) !== null && _a !== void 0 ? _a : Promise;
    }
    function isObserver(value) {
      return value && isFunction(value.next) && isFunction(value.error) && isFunction(value.complete);
    }
    function isSubscriber(value) {
      return value && value instanceof Subscriber || isObserver(value) && isSubscription(value);
    }

    // node_modules/rxjs/dist/esm5/internal/util/ObjectUnsubscribedError.js
    var ObjectUnsubscribedError = createErrorClass(function(_super) {
      return function ObjectUnsubscribedErrorImpl() {
        _super(this);
        this.name = "ObjectUnsubscribedError";
        this.message = "object unsubscribed";
      };
    });

    // node_modules/rxjs/dist/esm5/internal/Subject.js
    var Subject = function(_super) {
      __extends(Subject2, _super);
      function Subject2() {
        var _this = _super.call(this) || this;
        _this.closed = false;
        _this.currentObservers = null;
        _this.observers = [];
        _this.isStopped = false;
        _this.hasError = false;
        _this.thrownError = null;
        return _this;
      }
      Subject2.prototype.lift = function(operator) {
        var subject = new AnonymousSubject(this, this);
        subject.operator = operator;
        return subject;
      };
      Subject2.prototype._throwIfClosed = function() {
        if (this.closed) {
          throw new ObjectUnsubscribedError();
        }
      };
      Subject2.prototype.next = function(value) {
        var _this = this;
        errorContext(function() {
          var e_1, _a;
          _this._throwIfClosed();
          if (!_this.isStopped) {
            if (!_this.currentObservers) {
              _this.currentObservers = Array.from(_this.observers);
            }
            try {
              for (var _b = __values(_this.currentObservers), _c = _b.next(); !_c.done; _c = _b.next()) {
                var observer = _c.value;
                observer.next(value);
              }
            } catch (e_1_1) {
              e_1 = { error: e_1_1 };
            } finally {
              try {
                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
              } finally {
                if (e_1) throw e_1.error;
              }
            }
          }
        });
      };
      Subject2.prototype.error = function(err) {
        var _this = this;
        errorContext(function() {
          _this._throwIfClosed();
          if (!_this.isStopped) {
            _this.hasError = _this.isStopped = true;
            _this.thrownError = err;
            var observers = _this.observers;
            while (observers.length) {
              observers.shift().error(err);
            }
          }
        });
      };
      Subject2.prototype.complete = function() {
        var _this = this;
        errorContext(function() {
          _this._throwIfClosed();
          if (!_this.isStopped) {
            _this.isStopped = true;
            var observers = _this.observers;
            while (observers.length) {
              observers.shift().complete();
            }
          }
        });
      };
      Subject2.prototype.unsubscribe = function() {
        this.isStopped = this.closed = true;
        this.observers = this.currentObservers = null;
      };
      Object.defineProperty(Subject2.prototype, "observed", {
        get: function() {
          var _a;
          return ((_a = this.observers) === null || _a === void 0 ? void 0 : _a.length) > 0;
        },
        enumerable: false,
        configurable: true
      });
      Subject2.prototype._trySubscribe = function(subscriber) {
        this._throwIfClosed();
        return _super.prototype._trySubscribe.call(this, subscriber);
      };
      Subject2.prototype._subscribe = function(subscriber) {
        this._throwIfClosed();
        this._checkFinalizedStatuses(subscriber);
        return this._innerSubscribe(subscriber);
      };
      Subject2.prototype._innerSubscribe = function(subscriber) {
        var _this = this;
        var _a = this, hasError = _a.hasError, isStopped = _a.isStopped, observers = _a.observers;
        if (hasError || isStopped) {
          return EMPTY_SUBSCRIPTION;
        }
        this.currentObservers = null;
        observers.push(subscriber);
        return new Subscription(function() {
          _this.currentObservers = null;
          arrRemove(observers, subscriber);
        });
      };
      Subject2.prototype._checkFinalizedStatuses = function(subscriber) {
        var _a = this, hasError = _a.hasError, thrownError = _a.thrownError, isStopped = _a.isStopped;
        if (hasError) {
          subscriber.error(thrownError);
        } else if (isStopped) {
          subscriber.complete();
        }
      };
      Subject2.prototype.asObservable = function() {
        var observable2 = new Observable();
        observable2.source = this;
        return observable2;
      };
      Subject2.create = function(destination, source) {
        return new AnonymousSubject(destination, source);
      };
      return Subject2;
    }(Observable);
    var AnonymousSubject = function(_super) {
      __extends(AnonymousSubject2, _super);
      function AnonymousSubject2(destination, source) {
        var _this = _super.call(this) || this;
        _this.destination = destination;
        _this.source = source;
        return _this;
      }
      AnonymousSubject2.prototype.next = function(value) {
        var _a, _b;
        (_b = (_a = this.destination) === null || _a === void 0 ? void 0 : _a.next) === null || _b === void 0 ? void 0 : _b.call(_a, value);
      };
      AnonymousSubject2.prototype.error = function(err) {
        var _a, _b;
        (_b = (_a = this.destination) === null || _a === void 0 ? void 0 : _a.error) === null || _b === void 0 ? void 0 : _b.call(_a, err);
      };
      AnonymousSubject2.prototype.complete = function() {
        var _a, _b;
        (_b = (_a = this.destination) === null || _a === void 0 ? void 0 : _a.complete) === null || _b === void 0 ? void 0 : _b.call(_a);
      };
      AnonymousSubject2.prototype._subscribe = function(subscriber) {
        var _a, _b;
        return (_b = (_a = this.source) === null || _a === void 0 ? void 0 : _a.subscribe(subscriber)) !== null && _b !== void 0 ? _b : EMPTY_SUBSCRIPTION;
      };
      return AnonymousSubject2;
    }(Subject);

    // node_modules/rxjs/dist/esm5/internal/BehaviorSubject.js
    var BehaviorSubject = function(_super) {
      __extends(BehaviorSubject2, _super);
      function BehaviorSubject2(_value) {
        var _this = _super.call(this) || this;
        _this._value = _value;
        return _this;
      }
      Object.defineProperty(BehaviorSubject2.prototype, "value", {
        get: function() {
          return this.getValue();
        },
        enumerable: false,
        configurable: true
      });
      BehaviorSubject2.prototype._subscribe = function(subscriber) {
        var subscription = _super.prototype._subscribe.call(this, subscriber);
        !subscription.closed && subscriber.next(this._value);
        return subscription;
      };
      BehaviorSubject2.prototype.getValue = function() {
        var _a = this, hasError = _a.hasError, thrownError = _a.thrownError, _value = _a._value;
        if (hasError) {
          throw thrownError;
        }
        this._throwIfClosed();
        return _value;
      };
      BehaviorSubject2.prototype.next = function(value) {
        _super.prototype.next.call(this, this._value = value);
      };
      return BehaviorSubject2;
    }(Subject);

    // inline-worker:__inline-worker
    function inlineWorker(scriptText) {
      let blob = new Blob([scriptText], { type: "text/javascript" });
      let url = URL.createObjectURL(blob);
      let worker = new Worker(url);
      URL.revokeObjectURL(url);
      return worker;
    }

    // dist/mine.worker.js
    function Worker2() {
      return inlineWorker('"use strict";(()=>{(()=>{var E,G=new Array(128).fill(void 0);function D(A){return G[A]}G.push(void 0,null,!0,!1);var k=G.length;function J(A){let I=D(A);return function(g){g<132||(G[g]=k,k=g)}(A),I}var d=typeof TextDecoder<"u"?new TextDecoder("utf-8",{ignoreBOM:!0,fatal:!0}):{decode:()=>{throw Error("TextDecoder not available")}};typeof TextDecoder<"u"&&d.decode();var F=null;function a(){return(F===null||F.byteLength===0)&&(F=new Uint8Array(E.memory.buffer)),F}function R(A,I){return A>>>=0,d.decode(a().subarray(A,A+I))}function o(A){k===G.length&&G.push(G.length+1);let I=k;return k=G[I],G[I]=A,I}function Y(A){let I=typeof A;if(I=="number"||I=="boolean"||A==null)return`${A}`;if(I=="string")return`"${A}"`;if(I=="symbol"){let B=A.description;return B==null?"Symbol":`Symbol(${B})`}if(I=="function"){let B=A.name;return typeof B=="string"&&B.length>0?`Function(${B})`:"Function"}if(Array.isArray(A)){let B=A.length,w="[";B>0&&(w+=Y(A[0]));for(let C=1;C<B;C++)w+=", "+Y(A[C]);return w+="]",w}let g,Q=/\\[object ([^\\]]+)\\]/.exec(toString.call(A));if(!(Q.length>1))return toString.call(A);if(g=Q[1],g=="Object")try{return"Object("+JSON.stringify(A)+")"}catch{return"Object"}return A instanceof Error?`${A.name}: ${A.message}\n${A.stack}`:g}var N=0,s=typeof TextEncoder<"u"?new TextEncoder("utf-8"):{encode:()=>{throw Error("TextEncoder not available")}},n=typeof s.encodeInto=="function"?function(A,I){return s.encodeInto(A,I)}:function(A,I){let g=s.encode(A);return I.set(g),{read:A.length,written:g.length}};function h(A,I,g){if(g===void 0){let i=s.encode(A),c=I(i.length,1)>>>0;return a().subarray(c,c+i.length).set(i),N=i.length,c}let Q=A.length,B=I(Q,1)>>>0,w=a(),C=0;for(;C<Q;C++){let i=A.charCodeAt(C);if(i>127)break;w[B+C]=i}if(C!==Q){C!==0&&(A=A.slice(C)),B=g(B,Q,Q=C+3*A.length,1)>>>0;let i=a().subarray(B+C,B+Q);C+=n(A,i).written,B=g(B,Q,C,1)>>>0}return N=C,B}var y=null;function U(){return(y===null||y.buffer.detached===!0||y.buffer.detached===void 0&&y.buffer!==E.memory.buffer)&&(y=new DataView(E.memory.buffer)),y}function l(A,I){try{return A.apply(this,I)}catch(g){E.__wbindgen_exn_store(o(g))}}function t(){let A={wbg:{}};return A.wbg.__wbindgen_object_drop_ref=function(I){J(I)},A.wbg.__wbindgen_string_new=function(I,g){return o(R(I,g))},A.wbg.__wbindgen_is_function=function(I){return typeof D(I)=="function"},A.wbg.__wbindgen_number_new=function(I){return o(I)},A.wbg.__wbindgen_is_falsy=function(I){return!D(I)},A.wbg.__wbindgen_is_string=function(I){return typeof D(I)=="string"},A.wbg.__wbindgen_error_new=function(I,g){return o(new Error(R(I,g)))},A.wbg.__wbindgen_bigint_from_i64=function(I){return o(I)},A.wbg.__wbindgen_bigint_from_u64=function(I){return o(BigInt.asUintN(64,I))},A.wbg.__wbindgen_object_clone_ref=function(I){return o(D(I))},A.wbg.__wbg_set_f975102236d3c502=function(I,g,Q){D(I)[J(g)]=J(Q)},A.wbg.__wbg_new_abda76e883ba8a5f=function(){return o(new Error)},A.wbg.__wbg_stack_658279fe44541cf6=function(I,g){let Q=h(D(g).stack,E.__wbindgen_malloc,E.__wbindgen_realloc),B=N;U().setInt32(I+4,B,!0),U().setInt32(I+0,Q,!0)},A.wbg.__wbg_error_f851667af71bcfc6=function(I,g){let Q,B;try{Q=I,B=g,console.error(R(I,g))}finally{E.__wbindgen_free(Q,B,1)}},A.wbg.__wbg_log_b103404cc5920657=function(I){console.log(D(I))},A.wbg.__wbg_new_a220cf903aa02ca2=function(){return o(new Array)},A.wbg.__wbg_new_8608a2b51a5f6737=function(){return o(new Map)},A.wbg.__wbg_call_1084a111329e68ce=function(){return l(function(I,g){return o(D(I).call(D(g)))},arguments)},A.wbg.__wbg_new_525245e2b9901204=function(){return o(new Object)},A.wbg.__wbg_set_673dda6c73d19609=function(I,g,Q){D(I)[g>>>0]=J(Q)},A.wbg.__wbg_call_c6fe275aaa60da79=function(){return l(function(I,g,Q,B){return o(D(I).call(D(g),D(Q),D(B)))},arguments)},A.wbg.__wbg_set_49185437f0ab06f8=function(I,g,Q){return o(D(I).set(D(g),D(Q)))},A.wbg.__wbg_now_b7a162010a9e75b4=function(){return Date.now()},A.wbg.__wbindgen_debug_string=function(I,g){let Q=h(Y(D(g)),E.__wbindgen_malloc,E.__wbindgen_realloc),B=N;U().setInt32(I+4,B,!0),U().setInt32(I+0,Q,!0)},A.wbg.__wbindgen_throw=function(I,g){throw new Error(R(I,g))},A}async function Z(A){if(E!==void 0)return E;typeof A<"u"&&Object.getPrototypeOf(A)===Object.prototype?{module_or_path:A}=A:console.warn("using deprecated parameters for the initialization function; pass a single object instead"),typeof A>"u"&&(A=new URL("notemine_bg.wasm",self.location.href));let I=t();(typeof A=="string"||typeof Request=="function"&&A instanceof Request||typeof URL=="function"&&A instanceof URL)&&(A=fetch(A));let{instance:g,module:Q}=await async function(B,w){if(typeof Response=="function"&&B instanceof Response){if(typeof WebAssembly.instantiateStreaming=="function")try{return await WebAssembly.instantiateStreaming(B,w)}catch(i){if(B.headers.get("Content-Type")=="application/wasm")throw i;console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\\n",i)}let C=await B.arrayBuffer();return await WebAssembly.instantiate(C,w)}{let C=await WebAssembly.instantiate(B,w);return C instanceof WebAssembly.Instance?{instance:C,module:B}:C}}(await A,I);return function(B,w){return E=B.exports,Z.__wbindgen_wasm_module=w,y=null,F=null,E.__wbindgen_start(),E}(g,Q)}var M,x=Z,K=!1,L=!1,p=A=>{let I,g,Q;if(typeof A.get=="function")I=A.get("best_pow"),g=A.get("nonce"),Q=A.get("hash");else{if(typeof A!="object"||A===null)throw new Error("Invalid bestPowData received from mine_event");I=A.best_pow,g=A.nonce,Q=A.hash}if(I===void 0||g===void 0||Q===void 0)throw new Error("Incomplete bestPowData received from mine_event");return{bestPow:I,nonce:g,hash:Q}};self.postMessage({type:"initialized",message:"Worker initialized successfully"}),self.onmessage=async function(A){if(!A?.data?.name)try{let{type:I,event:g,difficulty:Q,id:B,totalWorkers:w}=A.data;if(M=B,I!=="mine"||K)I==="cancel"&&(L=!0);else{L=!1,K=!0;try{await x("data:application/wasm;base64,AGFzbQEAAAAB6AEhYAJ/fwF/YAN/f38Bf2ACf38AYAN/f38AYAF/AGABfwF/YAR/f39/AGAFf39/f38AYAABf2AEf39/fwF/YAV/f39+fwBgBX9/f39/AX9gAX4Bf2AGf39/f39/AX9gBn9/f39/fwBgA39/fgBgAABgAXwBf2AAAXxgAn5/AGAJf39/f39/fn5+AGAHf39/f39/fwF/YAN+f38Bf2ADf35+AGAEf35+fwBgCX9/f39/f39/fwF/YAV/f35/fwBgBH9+f38AYAV/f3x/fwBgBH98f38AYAV/f31/fwBgBH99f38AYAN/f3wAApMGGQN3YmcaX193YmluZGdlbl9vYmplY3RfZHJvcF9yZWYABAN3YmcVX193YmluZGdlbl9zdHJpbmdfbmV3AAADd2JnFl9fd2JpbmRnZW5faXNfZnVuY3Rpb24ABQN3YmcVX193YmluZGdlbl9udW1iZXJfbmV3ABEDd2JnE19fd2JpbmRnZW5faXNfZmFsc3kABQN3YmcUX193YmluZGdlbl9pc19zdHJpbmcABQN3YmcUX193YmluZGdlbl9lcnJvcl9uZXcAAAN3YmcaX193YmluZGdlbl9iaWdpbnRfZnJvbV9pNjQADAN3YmcaX193YmluZGdlbl9iaWdpbnRfZnJvbV91NjQADAN3YmcbX193YmluZGdlbl9vYmplY3RfY2xvbmVfcmVmAAUDd2JnGl9fd2JnX3NldF9mOTc1MTAyMjM2ZDNjNTAyAAMDd2JnGl9fd2JnX25ld19hYmRhNzZlODgzYmE4YTVmAAgDd2JnHF9fd2JnX3N0YWNrXzY1ODI3OWZlNDQ1NDFjZjYAAgN3YmccX193YmdfZXJyb3JfZjg1MTY2N2FmNzFiY2ZjNgACA3diZxpfX3diZ19sb2dfYjEwMzQwNGNjNTkyMDY1NwAEA3diZxpfX3diZ19uZXdfYTIyMGNmOTAzYWEwMmNhMgAIA3diZxpfX3diZ19uZXdfODYwOGEyYjUxYTVmNjczNwAIA3diZxtfX3diZ19jYWxsXzEwODRhMTExMzI5ZTY4Y2UAAAN3YmcaX193YmdfbmV3XzUyNTI0NWUyYjk5MDEyMDQACAN3YmcaX193Ymdfc2V0XzY3M2RkYTZjNzNkMTk2MDkAAwN3YmcbX193YmdfY2FsbF9jNmZlMjc1YWFhNjBkYTc5AAkDd2JnGl9fd2JnX3NldF80OTE4NTQzN2YwYWIwNmY4AAEDd2JnGl9fd2JnX25vd19iN2ExNjIwMTBhOWU3NWI0ABIDd2JnF19fd2JpbmRnZW5fZGVidWdfc3RyaW5nAAIDd2JnEF9fd2JpbmRnZW5fdGhyb3cAAgPRAc8BAwUEAQMDAAIDAwYDAQ0GBAIEAgEGAAECAwABAQACAgoCAhMCAxQKAA4CBRUFAgIAFgAAAAICAwACAAIDCgAEAwQBBAIFAAIHBQQDBAMDBQYCBg4GAA8PAAEBAAUAFwQHBAABAwMDAwIAABgFBwIHGQEQAgIAAQEEARAAAgMFCwMACQQAAAIADQAHGgscHgAEBgQAAQQDBAIJBgMAASAABwAAAgAAAAICAgAAAwMDAAQAAAAAAAAAAAAAAAIAAAIAAAIAAAEBAQEBAAAABAICBAUBcAFgYAUDAQARBgkBfwFBgIDAAAsHjQEIBm1lbW9yeQIACm1pbmVfZXZlbnQAiAEHbWFpbl9qcwCSARFfX3diaW5kZ2VuX21hbGxvYwCTARJfX3diaW5kZ2VuX3JlYWxsb2MAmgEPX193YmluZGdlbl9mcmVlALMBFF9fd2JpbmRnZW5fZXhuX3N0b3JlAKoBEF9fd2JpbmRnZW5fc3RhcnQAkgEJswEBAEEBC1+5AXBtyQHOAa0BjgFKzwHLAa8BnQHjAeQBzQHiAcwBvgHnAecB5wGtAY4B0AG3AccBrQGOAUrRAaEBrQGPAUvSAdMBpAFrogGkAaABrAGpAaIBogGmAaUBowG8AVC3AVa5AasBXlK9AZkBWqcB1QGfAbwBuQGAAa0BjgFM1gG/AcABvgGMAcEB1wGoAXVTaeYBrQGRAdsB2AHZAbQBtwHCAcMBnAFzygEvjQHcAQqTjAfPAdE+ASF/IAAoAhwhISAAKAIYIR8gACgCFCEeIAAoAhAhHCAAKAIMISIgACgCCCEgIAAoAgQhHSAAKAIAIQMgAgRAIAEgAkEGdGohIwNAIAMgASgAACICQRh0IAJBgP4DcUEIdHIgAkEIdkGA/gNxIAJBGHZyciIRICEgHEEadyAcQRV3cyAcQQd3c2ogHiAfcyAccSAfc2pqQZjfqJQEaiIEIB0gIHMgA3EgHSAgcXMgA0EedyADQRN3cyADQQp3c2pqIgJBHncgAkETd3MgAkEKd3MgAiADIB1zcSADIB1xc2ogHyABKAAEIgVBGHQgBUGA/gNxQQh0ciAFQQh2QYD+A3EgBUEYdnJyIhJqIAQgImoiCSAcIB5zcSAec2ogCUEadyAJQRV3cyAJQQd3c2pBkYndiQdqIgZqIgVBHncgBUETd3MgBUEKd3MgBSACIANzcSACIANxc2ogHiABKAAIIgRBGHQgBEGA/gNxQQh0ciAEQQh2QYD+A3EgBEEYdnJyIhNqIAYgIGoiCiAJIBxzcSAcc2ogCkEadyAKQRV3cyAKQQd3c2pBsYj80QRrIgdqIgRBHncgBEETd3MgBEEKd3MgBCACIAVzcSACIAVxc2ogHCABKAAMIgZBGHQgBkGA/gNxQQh0ciAGQQh2QYD+A3EgBkEYdnJyIhRqIAcgHWoiByAJIApzcSAJc2ogB0EadyAHQRV3cyAHQQd3c2pB28iosgFrIg5qIgZBHncgBkETd3MgBkEKd3MgBiAEIAVzcSAEIAVxc2ogCSABKAAQIghBGHQgCEGA/gNxQQh0ciAIQQh2QYD+A3EgCEEYdnJyIhVqIAMgDmoiCSAHIApzcSAKc2ogCUEadyAJQRV3cyAJQQd3c2pB24TbygNqIghqIgNBHncgA0ETd3MgA0EKd3MgAyAEIAZzcSAEIAZxc2ogCiABKAAUIgpBGHQgCkGA/gNxQQh0ciAKQQh2QYD+A3EgCkEYdnJyIhZqIAIgCGoiCiAHIAlzcSAHc2ogCkEadyAKQRV3cyAKQQd3c2pB8aPEzwVqIghqIgJBHncgAkETd3MgAkEKd3MgAiADIAZzcSADIAZxc2ogByABKAAYIgdBGHQgB0GA/gNxQQh0ciAHQQh2QYD+A3EgB0EYdnJyIhdqIAUgCGoiByAJIApzcSAJc2ogB0EadyAHQRV3cyAHQQd3c2pB3PqB7gZrIghqIgVBHncgBUETd3MgBUEKd3MgBSACIANzcSACIANxc2ogCSABKAAcIglBGHQgCUGA/gNxQQh0ciAJQQh2QYD+A3EgCUEYdnJyIhlqIAQgCGoiCSAHIApzcSAKc2ogCUEadyAJQRV3cyAJQQd3c2pBq8KOpwVrIghqIgRBHncgBEETd3MgBEEKd3MgBCACIAVzcSACIAVxc2ogCiABKAAgIgpBGHQgCkGA/gNxQQh0ciAKQQh2QYD+A3EgCkEYdnJyIhpqIAYgCGoiCiAHIAlzcSAHc2ogCkEadyAKQRV3cyAKQQd3c2pB6KrhvwJrIghqIgZBHncgBkETd3MgBkEKd3MgBiAEIAVzcSAEIAVxc2ogByABKAAkIgdBGHQgB0GA/gNxQQh0ciAHQQh2QYD+A3EgB0EYdnJyIhhqIAMgCGoiByAJIApzcSAJc2ogB0EadyAHQRV3cyAHQQd3c2pBgbaNlAFqIghqIgNBHncgA0ETd3MgA0EKd3MgAyAEIAZzcSAEIAZxc2ogCSABKAAoIglBGHQgCUGA/gNxQQh0ciAJQQh2QYD+A3EgCUEYdnJyIgtqIAIgCGoiCSAHIApzcSAKc2ogCUEadyAJQRV3cyAJQQd3c2pBvovGoQJqIghqIgJBHncgAkETd3MgAkEKd3MgAiADIAZzcSADIAZxc2ogCiABKAAsIgpBGHQgCkGA/gNxQQh0ciAKQQh2QYD+A3EgCkEYdnJyIgxqIAUgCGoiCiAHIAlzcSAHc2ogCkEadyAKQRV3cyAKQQd3c2pBw/uxqAVqIghqIgVBHncgBUETd3MgBUEKd3MgBSACIANzcSACIANxc2ogByABKAAwIgdBGHQgB0GA/gNxQQh0ciAHQQh2QYD+A3EgB0EYdnJyIg1qIAQgCGoiByAJIApzcSAJc2ogB0EadyAHQRV3cyAHQQd3c2pB9Lr5lQdqIghqIgRBHncgBEETd3MgBEEKd3MgBCACIAVzcSACIAVxc2ogCSABKAA0IglBGHQgCUGA/gNxQQh0ciAJQQh2QYD+A3EgCUEYdnJyIg9qIAYgCGoiCCAHIApzcSAKc2ogCEEadyAIQRV3cyAIQQd3c2pBgpyF+QdrIg5qIgZBHncgBkETd3MgBkEKd3MgBiAEIAVzcSAEIAVxc2ogASgAOCIJQRh0IAlBgP4DcUEIdHIgCUEIdkGA/gNxIAlBGHZyciIJIApqIAMgDmoiDiAHIAhzcSAHc2ogDkEadyAOQRV3cyAOQQd3c2pB2fKPoQZrIhBqIgNBHncgA0ETd3MgA0EKd3MgAyAEIAZzcSAEIAZxc2ogASgAPCIKQRh0IApBgP4DcUEIdHIgCkEIdkGA/gNxIApBGHZyciIKIAdqIAIgEGoiECAIIA5zcSAIc2ogEEEadyAQQRV3cyAQQQd3c2pBjJ2Q8wNrIhtqIgJBHncgAkETd3MgAkEKd3MgAiADIAZzcSADIAZxc2ogEkEZdyASQQ53cyASQQN2cyARaiAYaiAJQQ93IAlBDXdzIAlBCnZzaiIHIAhqIAUgG2oiESAOIBBzcSAOc2ogEUEadyARQRV3cyARQQd3c2pBv6yS2wFrIhtqIgVBHncgBUETd3MgBUEKd3MgBSACIANzcSACIANxc2ogE0EZdyATQQ53cyATQQN2cyASaiALaiAKQQ93IApBDXdzIApBCnZzaiIIIA5qIAQgG2oiEiAQIBFzcSAQc2ogEkEadyASQRV3cyASQQd3c2pB+vCGggFrIhtqIgRBHncgBEETd3MgBEEKd3MgBCACIAVzcSACIAVxc2ogFEEZdyAUQQ53cyAUQQN2cyATaiAMaiAHQQ93IAdBDXdzIAdBCnZzaiIOIBBqIAYgG2oiEyARIBJzcSARc2ogE0EadyATQRV3cyATQQd3c2pBxruG/gBqIhtqIgZBHncgBkETd3MgBkEKd3MgBiAEIAVzcSAEIAVxc2ogFUEZdyAVQQ53cyAVQQN2cyAUaiANaiAIQQ93IAhBDXdzIAhBCnZzaiIQIBFqIAMgG2oiFCASIBNzcSASc2ogFEEadyAUQRV3cyAUQQd3c2pBzMOyoAJqIhtqIgNBHncgA0ETd3MgA0EKd3MgAyAEIAZzcSAEIAZxc2ogFkEZdyAWQQ53cyAWQQN2cyAVaiAPaiAOQQ93IA5BDXdzIA5BCnZzaiIRIBJqIAIgG2oiFSATIBRzcSATc2ogFUEadyAVQRV3cyAVQQd3c2pB79ik7wJqIhtqIgJBHncgAkETd3MgAkEKd3MgAiADIAZzcSADIAZxc2ogF0EZdyAXQQ53cyAXQQN2cyAWaiAJaiAQQQ93IBBBDXdzIBBBCnZzaiISIBNqIAUgG2oiFiAUIBVzcSAUc2ogFkEadyAWQRV3cyAWQQd3c2pBqonS0wRqIhtqIgVBHncgBUETd3MgBUEKd3MgBSACIANzcSACIANxc2ogGUEZdyAZQQ53cyAZQQN2cyAXaiAKaiARQQ93IBFBDXdzIBFBCnZzaiITIBRqIAQgG2oiFyAVIBZzcSAVc2ogF0EadyAXQRV3cyAXQQd3c2pB3NPC5QVqIhtqIgRBHncgBEETd3MgBEEKd3MgBCACIAVzcSACIAVxc2ogGkEZdyAaQQ53cyAaQQN2cyAZaiAHaiASQQ93IBJBDXdzIBJBCnZzaiIUIBVqIAYgG2oiGSAWIBdzcSAWc2ogGUEadyAZQRV3cyAZQQd3c2pB2pHmtwdqIhtqIgZBHncgBkETd3MgBkEKd3MgBiAEIAVzcSAEIAVxc2ogGEEZdyAYQQ53cyAYQQN2cyAaaiAIaiATQQ93IBNBDXdzIBNBCnZzaiIVIBZqIAMgG2oiGiAXIBlzcSAXc2ogGkEadyAaQRV3cyAaQQd3c2pBrt2GvgZrIhtqIgNBHncgA0ETd3MgA0EKd3MgAyAEIAZzcSAEIAZxc2ogC0EZdyALQQ53cyALQQN2cyAYaiAOaiAUQQ93IBRBDXdzIBRBCnZzaiIWIBdqIAIgG2oiGCAZIBpzcSAZc2ogGEEadyAYQRV3cyAYQQd3c2pBk/O4vgVrIhtqIgJBHncgAkETd3MgAkEKd3MgAiADIAZzcSADIAZxc2ogDEEZdyAMQQ53cyAMQQN2cyALaiAQaiAVQQ93IBVBDXdzIBVBCnZzaiIXIBlqIAUgG2oiCyAYIBpzcSAac2ogC0EadyALQRV3cyALQQd3c2pBuLDz/wRrIhtqIgVBHncgBUETd3MgBUEKd3MgBSACIANzcSACIANxc2ogDUEZdyANQQ53cyANQQN2cyAMaiARaiAWQQ93IBZBDXdzIBZBCnZzaiIZIBpqIAQgG2oiDCALIBhzcSAYc2ogDEEadyAMQRV3cyAMQQd3c2pBuYCahQRrIhtqIgRBHncgBEETd3MgBEEKd3MgBCACIAVzcSACIAVxc2ogD0EZdyAPQQ53cyAPQQN2cyANaiASaiAXQQ93IBdBDXdzIBdBCnZzaiIaIBhqIAYgG2oiDSALIAxzcSALc2ogDUEadyANQRV3cyANQQd3c2pBjej/yANrIhtqIgZBHncgBkETd3MgBkEKd3MgBiAEIAVzcSAEIAVxc2ogCUEZdyAJQQ53cyAJQQN2cyAPaiATaiAZQQ93IBlBDXdzIBlBCnZzaiIYIAtqIAMgG2oiCyAMIA1zcSAMc2ogC0EadyALQRV3cyALQQd3c2pBud3h0gJrIg9qIgNBHncgA0ETd3MgA0EKd3MgAyAEIAZzcSAEIAZxc2ogCkEZdyAKQQ53cyAKQQN2cyAJaiAUaiAaQQ93IBpBDXdzIBpBCnZzaiIJIAxqIAIgD2oiDCALIA1zcSANc2ogDEEadyAMQRV3cyAMQQd3c2pB0capNmoiD2oiAkEedyACQRN3cyACQQp3cyACIAMgBnNxIAMgBnFzaiAHQRl3IAdBDndzIAdBA3ZzIApqIBVqIBhBD3cgGEENd3MgGEEKdnNqIgogDWogBSAPaiINIAsgDHNxIAtzaiANQRp3IA1BFXdzIA1BB3dzakHn0qShAWoiD2oiBUEedyAFQRN3cyAFQQp3cyAFIAIgA3NxIAIgA3FzaiAIQRl3IAhBDndzIAhBA3ZzIAdqIBZqIAlBD3cgCUENd3MgCUEKdnNqIgcgC2ogBCAPaiILIAwgDXNxIAxzaiALQRp3IAtBFXdzIAtBB3dzakGFldy9AmoiD2oiBEEedyAEQRN3cyAEQQp3cyAEIAIgBXNxIAIgBXFzaiAOQRl3IA5BDndzIA5BA3ZzIAhqIBdqIApBD3cgCkENd3MgCkEKdnNqIgggDGogBiAPaiIMIAsgDXNxIA1zaiAMQRp3IAxBFXdzIAxBB3dzakG4wuzwAmoiD2oiBkEedyAGQRN3cyAGQQp3cyAGIAQgBXNxIAQgBXFzaiAQQRl3IBBBDndzIBBBA3ZzIA5qIBlqIAdBD3cgB0ENd3MgB0EKdnNqIg4gDWogAyAPaiINIAsgDHNxIAtzaiANQRp3IA1BFXdzIA1BB3dzakH827HpBGoiD2oiA0EedyADQRN3cyADQQp3cyADIAQgBnNxIAQgBnFzaiARQRl3IBFBDndzIBFBA3ZzIBBqIBpqIAhBD3cgCEENd3MgCEEKdnNqIhAgC2ogAiAPaiILIAwgDXNxIAxzaiALQRp3IAtBFXdzIAtBB3dzakGTmuCZBWoiD2oiAkEedyACQRN3cyACQQp3cyACIAMgBnNxIAMgBnFzaiASQRl3IBJBDndzIBJBA3ZzIBFqIBhqIA5BD3cgDkENd3MgDkEKdnNqIhEgDGogBSAPaiIMIAsgDXNxIA1zaiAMQRp3IAxBFXdzIAxBB3dzakHU5qmoBmoiD2oiBUEedyAFQRN3cyAFQQp3cyAFIAIgA3NxIAIgA3FzaiATQRl3IBNBDndzIBNBA3ZzIBJqIAlqIBBBD3cgEEENd3MgEEEKdnNqIhIgDWogBCAPaiINIAsgDHNxIAtzaiANQRp3IA1BFXdzIA1BB3dzakG7laizB2oiD2oiBEEedyAEQRN3cyAEQQp3cyAEIAIgBXNxIAIgBXFzaiAUQRl3IBRBDndzIBRBA3ZzIBNqIApqIBFBD3cgEUENd3MgEUEKdnNqIhMgC2ogBiAPaiILIAwgDXNxIAxzaiALQRp3IAtBFXdzIAtBB3dzakHS7fTxB2siD2oiBkEedyAGQRN3cyAGQQp3cyAGIAQgBXNxIAQgBXFzaiAVQRl3IBVBDndzIBVBA3ZzIBRqIAdqIBJBD3cgEkENd3MgEkEKdnNqIhQgDGogAyAPaiIMIAsgDXNxIA1zaiAMQRp3IAxBFXdzIAxBB3dzakH7prfsBmsiD2oiA0EedyADQRN3cyADQQp3cyADIAQgBnNxIAQgBnFzaiAWQRl3IBZBDndzIBZBA3ZzIBVqIAhqIBNBD3cgE0ENd3MgE0EKdnNqIhUgDWogAiAPaiINIAsgDHNxIAtzaiANQRp3IA1BFXdzIA1BB3dzakHfroDqBWsiD2oiAkEedyACQRN3cyACQQp3cyACIAMgBnNxIAMgBnFzaiAXQRl3IBdBDndzIBdBA3ZzIBZqIA5qIBRBD3cgFEENd3MgFEEKdnNqIhYgC2ogBSAPaiILIAwgDXNxIAxzaiALQRp3IAtBFXdzIAtBB3dzakG1s5a/BWsiD2oiBUEedyAFQRN3cyAFQQp3cyAFIAIgA3NxIAIgA3FzaiAZQRl3IBlBDndzIBlBA3ZzIBdqIBBqIBVBD3cgFUENd3MgFUEKdnNqIhcgDGogBCAPaiIMIAsgDXNxIA1zaiAMQRp3IAxBFXdzIAxBB3dzakGQ6dHtA2siD2oiBEEedyAEQRN3cyAEQQp3cyAEIAIgBXNxIAIgBXFzaiAaQRl3IBpBDndzIBpBA3ZzIBlqIBFqIBZBD3cgFkENd3MgFkEKdnNqIhkgDWogBiAPaiINIAsgDHNxIAtzaiANQRp3IA1BFXdzIA1BB3dzakHd3M7EA2siD2oiBkEedyAGQRN3cyAGQQp3cyAGIAQgBXNxIAQgBXFzaiAYQRl3IBhBDndzIBhBA3ZzIBpqIBJqIBdBD3cgF0ENd3MgF0EKdnNqIhogC2ogAyAPaiILIAwgDXNxIAxzaiALQRp3IAtBFXdzIAtBB3dzakHnr7TzAmsiD2oiA0EedyADQRN3cyADQQp3cyADIAQgBnNxIAQgBnFzaiAJQRl3IAlBDndzIAlBA3ZzIBhqIBNqIBlBD3cgGUENd3MgGUEKdnNqIhggDGogAiAPaiIMIAsgDXNxIA1zaiAMQRp3IAxBFXdzIAxBB3dzakHc85vLAmsiD2oiAkEedyACQRN3cyACQQp3cyACIAMgBnNxIAMgBnFzaiAKQRl3IApBDndzIApBA3ZzIAlqIBRqIBpBD3cgGkENd3MgGkEKdnNqIgkgDWogBSAPaiINIAsgDHNxIAtzaiANQRp3IA1BFXdzIA1BB3dzakH7lMffAGsiD2oiBUEedyAFQRN3cyAFQQp3cyAFIAIgA3NxIAIgA3FzaiAHQRl3IAdBDndzIAdBA3ZzIApqIBVqIBhBD3cgGEENd3MgGEEKdnNqIgogC2ogBCAPaiILIAwgDXNxIAxzaiALQRp3IAtBFXdzIAtBB3dzakHwwKqDAWoiD2oiBEEedyAEQRN3cyAEQQp3cyAEIAIgBXNxIAIgBXFzaiAMIAhBGXcgCEEOd3MgCEEDdnMgB2ogFmogCUEPdyAJQQ13cyAJQQp2c2oiDGogBiAPaiIHIAsgDXNxIA1zaiAHQRp3IAdBFXdzIAdBB3dzakGWgpPNAWoiD2oiBkEedyAGQRN3cyAGQQp3cyAGIAQgBXNxIAQgBXFzaiANIA5BGXcgDkEOd3MgDkEDdnMgCGogF2ogCkEPdyAKQQ13cyAKQQp2c2oiDWogAyAPaiIIIAcgC3NxIAtzaiAIQRp3IAhBFXdzIAhBB3dzakGI2N3xAWoiD2oiA0EedyADQRN3cyADQQp3cyADIAQgBnNxIAQgBnFzaiALIBBBGXcgEEEOd3MgEEEDdnMgDmogGWogDEEPdyAMQQ13cyAMQQp2c2oiC2ogAiAPaiIOIAcgCHNxIAdzaiAOQRp3IA5BFXdzIA5BB3dzakHM7qG6AmoiG2oiAkEedyACQRN3cyACQQp3cyACIAMgBnNxIAMgBnFzaiARQRl3IBFBDndzIBFBA3ZzIBBqIBpqIA1BD3cgDUENd3MgDUEKdnNqIg8gB2ogBSAbaiIHIAggDnNxIAhzaiAHQRp3IAdBFXdzIAdBB3dzakG1+cKlA2oiEGoiBUEedyAFQRN3cyAFQQp3cyAFIAIgA3NxIAIgA3FzaiASQRl3IBJBDndzIBJBA3ZzIBFqIBhqIAtBD3cgC0ENd3MgC0EKdnNqIhEgCGogBCAQaiIIIAcgDnNxIA5zaiAIQRp3IAhBFXdzIAhBB3dzakGzmfDIA2oiEGoiBEEedyAEQRN3cyAEQQp3cyAEIAIgBXNxIAIgBXFzaiATQRl3IBNBDndzIBNBA3ZzIBJqIAlqIA9BD3cgD0ENd3MgD0EKdnNqIhIgDmogBiAQaiIOIAcgCHNxIAdzaiAOQRp3IA5BFXdzIA5BB3dzakHK1OL2BGoiEGoiBkEedyAGQRN3cyAGQQp3cyAGIAQgBXNxIAQgBXFzaiAUQRl3IBRBDndzIBRBA3ZzIBNqIApqIBFBD3cgEUENd3MgEUEKdnNqIhMgB2ogAyAQaiIHIAggDnNxIAhzaiAHQRp3IAdBFXdzIAdBB3dzakHPlPPcBWoiEGoiA0EedyADQRN3cyADQQp3cyADIAQgBnNxIAQgBnFzaiAVQRl3IBVBDndzIBVBA3ZzIBRqIAxqIBJBD3cgEkENd3MgEkEKdnNqIhQgCGogAiAQaiIIIAcgDnNxIA5zaiAIQRp3IAhBFXdzIAhBB3dzakHz37nBBmoiEGoiAkEedyACQRN3cyACQQp3cyACIAMgBnNxIAMgBnFzaiAWQRl3IBZBDndzIBZBA3ZzIBVqIA1qIBNBD3cgE0ENd3MgE0EKdnNqIhUgDmogBSAQaiIOIAcgCHNxIAdzaiAOQRp3IA5BFXdzIA5BB3dzakHuhb6kB2oiEGoiBUEedyAFQRN3cyAFQQp3cyAFIAIgA3NxIAIgA3FzaiAHIBdBGXcgF0EOd3MgF0EDdnMgFmogC2ogFEEPdyAUQQ13cyAUQQp2c2oiB2ogBCAQaiIQIAggDnNxIAhzaiAQQRp3IBBBFXdzIBBBB3dzakHvxpXFB2oiC2oiBEEedyAEQRN3cyAEQQp3cyAEIAIgBXNxIAIgBXFzaiAZQRl3IBlBDndzIBlBA3ZzIBdqIA9qIBVBD3cgFUENd3MgFUEKdnNqIhYgCGogBiALaiIIIA4gEHNxIA5zaiAIQRp3IAhBFXdzIAhBB3dzakHsj97ZB2siF2oiBkEedyAGQRN3cyAGQQp3cyAGIAQgBXNxIAQgBXFzaiAaQRl3IBpBDndzIBpBA3ZzIBlqIBFqIAdBD3cgB0ENd3MgB0EKdnNqIhEgDmogAyAXaiIDIAggEHNxIBBzaiADQRp3IANBFXdzIANBB3dzakH4++OZB2siDmoiB0EedyAHQRN3cyAHQQp3cyAHIAQgBnNxIAQgBnFzaiAQIBhBGXcgGEEOd3MgGEEDdnMgGmogEmogFkEPdyAWQQ13cyAWQQp2c2oiEGogAiAOaiIOIAMgCHNxIAhzaiAOQRp3IA5BFXdzIA5BB3dzakGGgIT6BmsiEmoiAkEedyACQRN3cyACQQp3cyACIAYgB3NxIAYgB3FzaiAJQRl3IAlBDndzIAlBA3ZzIBhqIBNqIBFBD3cgEUENd3MgEUEKdnNqIhEgCGogBSASaiIFIAMgDnNxIANzaiAFQRp3IAVBFXdzIAVBB3dzakGVpr7dBWsiEmoiCEEedyAIQRN3cyAIQQp3cyAIIAIgB3NxIAIgB3FzaiAJIApBGXcgCkEOd3MgCkEDdnNqIBRqIBBBD3cgEEENd3MgEEEKdnNqIANqIAQgEmoiBCAFIA5zcSAOc2ogBEEadyAEQRV3cyAEQQd3c2pBibiZiARrIgNqIgkgAiAIc3EgAiAIcXNqIAlBHncgCUETd3MgCUEKd3NqIAogDEEZdyAMQQ53cyAMQQN2c2ogFWogEUEPdyARQQ13cyARQQp2c2ogDmogAyAGaiIGIAQgBXNxIAVzaiAGQRp3IAZBFXdzIAZBB3dzakGOjrrMA2siCmohAyAJIB1qIR0gByAcaiAKaiEcIAggIGohICAGIB5qIR4gAiAiaiEiIAQgH2ohHyAFICFqISEgAUFAayIBICNHDQALCyAAICE2AhwgACAfNgIYIAAgHjYCFCAAIBw2AhAgACAiNgIMIAAgIDYCCCAAIB02AgQgACADNgIAC6ckAgl/AX4jAEEQayIIJAACQAJAAkACQAJAAkACQCAAQfUBTwRAIABBzf97Tw0HIABBC2oiAEF4cSEFQcTmwQAoAgAiCUUNBEEAIAVrIQMCf0EAIAVBgAJJDQAaQR8gBUH///8HSw0AGiAFQQYgAEEIdmciAGt2QQFxIABBAXRrQT5qCyIHQQJ0QajjwQBqKAIAIgJFBEBBACEADAILQQAhACAFQRkgB0EBdmtBACAHQR9HG3QhBANAAkAgAigCBEF4cSIGIAVJDQAgBiAFayIGIANPDQAgAiEBIAYiAw0AQQAhAyABIQAMBAsgAigCFCIGIAAgBiACIARBHXZBBHFqQRBqKAIAIgJHGyAAIAYbIQAgBEEBdCEEIAINAAsMAQtBwObBACgCACICQRAgAEELakH4A3EgAEELSRsiBUEDdiIAdiIBQQNxBEACQCABQX9zQQFxIABqIgFBA3QiAEG45MEAaiIEIABBwOTBAGooAgAiACgCCCIDRwRAIAMgBDYCDCAEIAM2AggMAQtBwObBACACQX4gAXdxNgIACyAAQQhqIQMgACABQQN0IgFBA3I2AgQgACABaiIAIAAoAgRBAXI2AgQMBwsgBUHI5sEAKAIATQ0DAkACQCABRQRAQcTmwQAoAgAiAEUNBiAAaEECdEGo48EAaigCACIBKAIEQXhxIAVrIQMgASECA0ACQCABKAIQIgANACABKAIUIgANACACKAIYIQcCQAJAIAIgAigCDCIARgRAIAJBFEEQIAIoAhQiABtqKAIAIgENAUEAIQAMAgsgAigCCCIBIAA2AgwgACABNgIIDAELIAJBFGogAkEQaiAAGyEEA0AgBCEGIAEiAEEUaiAAQRBqIAAoAhQiARshBCAAQRRBECABG2ooAgAiAQ0ACyAGQQA2AgALIAdFDQQgAiACKAIcQQJ0QajjwQBqIgEoAgBHBEAgB0EQQRQgBygCECACRhtqIAA2AgAgAEUNBQwECyABIAA2AgAgAA0DQcTmwQBBxObBACgCAEF+IAIoAhx3cTYCAAwECyAAKAIEQXhxIAVrIgEgAyABIANJIgEbIQMgACACIAEbIQIgACEBDAALAAsCQEECIAB0IgRBACAEa3IgASAAdHFoIgFBA3QiAEG45MEAaiIEIABBwOTBAGooAgAiACgCCCIDRwRAIAMgBDYCDCAEIAM2AggMAQtBwObBACACQX4gAXdxNgIACyAAIAVBA3I2AgQgACAFaiIGIAFBA3QiASAFayIEQQFyNgIEIAAgAWogBDYCAEHI5sEAKAIAIgMEQCADQXhxQbjkwQBqIQFB0ObBACgCACECAn9BwObBACgCACIFQQEgA0EDdnQiA3FFBEBBwObBACADIAVyNgIAIAEMAQsgASgCCAshAyABIAI2AgggAyACNgIMIAIgATYCDCACIAM2AggLIABBCGohA0HQ5sEAIAY2AgBByObBACAENgIADAgLIAAgBzYCGCACKAIQIgEEQCAAIAE2AhAgASAANgIYCyACKAIUIgFFDQAgACABNgIUIAEgADYCGAsCQAJAIANBEE8EQCAC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ABB6DAsLIANBBzoAcCADQfAAaiABIAIQcSAAEHoMCgsgA0GAAjsBcCADQfAAaiABIAIQcSAAEHoMCQsgA0EAOwFwIANB8ABqIAEgAhBxIAAQegwICyAAIARBAWo2AhQgA0FAayIEIABBABAhIAMpA0BCA1IEQCAEIAEgAhB7IAAQegwICyADKAJIDAcLIABBADYCCCAAIARBAWo2AhQgA0HkAGogCiAAEDEgAygCaCIEIAMoAmRBAkYNBhogAyADKAJsNgJ4IAMgBDYCdCADQQU6AHAgA0HwAGogASACEHEgABB6DAYLIAVBMGtB/wFxQQpJDQELIANBCjYCcCADQQhqIABBDGoQhgEgA0HwAGogAygCCCADKAIMEIkBIAAQegwECyADQdAAaiIEIABBARAhIAMpA1BCA1IEQCAEIAEgAhB7IAAQegwECyADKAJYDAMLIANBBTYCcCADQTBqIAoQlAEgA0HwAGogAygCMCADKAI0EIkBDAILIANBBTYCcCADQSBqIAoQlAEgA0HwAGogAygCICADKAIkEIkBDAELIANBBTYCcCADQRBqIAoQlAEgA0HwAGogAygCECADKAIUEIkBCyADQYABaiQAC5YIAQx/IwBB8ABrIgMkAAJ/AkACfwJAAkACQAJAAkAgAS0AAEEBaw4FAAECAwYEC0GCAUGDASABLQABGwwECwJAAkACQCABKAIIQQFrDgIBAgALIAMgAiABKQMQEG8gAygCBCECIAMoAgAMBwsgA0EIaiACIAEpAxAQbiADKAIMIQIgAygCCAwGCyADQRBqIAIgASsDEBC2ASADKAIUIQIgAygCEAwFCyADQRhqIAIgASgCCCABKAIMELIBIAMoAhwhAiADKAIYDAQLIANBIGogAiABQQRqEFggAygCJCECIAMoAiAMAwtBgQFBgAEgAi0AABsLIQJBAAwBCyADQdgAaiACIAEoAgwiCRCYASADKAJYQQJHBEAgA0HQAGoiCyADQegAaiIMKAIANgIAIANByABqIg0gA0HgAGoiDikCADcDACADIAMpAlg3A0ACQCAJRQ0AIAEoAgQiAkUNACACQQBHIQogASgCCCEEA0ACQAJAIAoEQAJAIAcEQCACIQUgByECDAELQQEhCkEAIQUCQCAERQ0AIAQiAUEHcSIGBEADQCABQQFrIQEgAigCmAMhAiAGQQFrIgYNAAsLIARBCEkNAANAIAIoApgDKAKYAygCmAMoApgDKAKYAygCmAMoApgDKAKYAyECIAFBCGsiAQ0ACwtBACEECwJAIAIvAZIDIARLBEAgAiEBIAQhCAwBCwNAIAIoAogCIgFFDQMgBUEBaiEFIAIvAZADIQggASECIAggAS8BkgNPDQALCyAIQQFqIQQCQCAFRQRAIAEhBwwBCyABIARBAnRqQZgDaiECAkAgBUEHcSIERQRAIAUhBgwBCyAFIQYDQCAGQQFrIQYgAigCACIHQZgDaiECIARBAWsiBA0ACwtBACEEIAVBCEkNAANAIAIoAgAoApgDKAKYAygCmAMoApgDKAKYAygCmAMoApgDIgdBmANqIQIgBkEIayIGDQALCyADQThqIAMoAlAgASAIQQxsaiICQZACaigCACACQZQCaigCABCyASADKAI8IQIgAygCOEUEQCABIAhBGGxqIQECQCADKAJIRQ0AIAMoAkwiBUGEAUkNACAFEAALIAMgAjYCTCADQQE2AkggA0EwaiADQUBrIAEQPSADKAIwRQ0DIAMoAjQhAgsgAygCRCIBQYQBTwRAIAEQAAsCQCADKAJIRQ0AIAMoAkwiAUGEAUkNACABEAALQQEMBgtB6ILAABDIAQALQdiCwAAQyAEAC0EAIQIgCUEBayIJDQALCyAMIAsoAgA2AgAgDiANKQMANwMAIAMgAykDQDcDWCADQShqIANB2ABqEJ4BIAMoAiwhAiADKAIoDAELIAMoAlwhAkEBCyEBIAAgAjYCBCAAIAE2AgAgA0HwAGokAAuWCAEMfyMAQfAAayIDJAACfwJAAn8CQAJAAkACQAJAIAEtAABBAWsOBQABAgMGBAtBggFBgwEgAS0AARsMBAsCQAJAAkAgASgCCEEBaw4CAQIACyADIAIgASkDEBBvIAMoAgQhAiADKAIADAcLIANBCGogAiABKQMQEG4gAygCDCECIAMoAggMBgsgA0EQaiACIAErAxAQtgEgAygCFCECIAMoAhAMBQsgA0EYaiACIAEoAgggASgCDBCyASADKAIcIQIgAygCGAwECyADQSBqIAIgAUEEahBYIAMoAiQhAiADKAIgDAMLQYEBQYABIAItAAAbCyECQQAMAQsgA0HYAGogAiABKAIMIgkQmAEgAygCWEECRwRAIANB0ABqIgsg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IANBAnQQ4QEhAyABKAIEIQZBACEBA0ACQCADIAFBAnRqKAIAIgggATsBkAMgCCAENgKIAiABIAVPDQAgASABIAVJaiIBIAVNDQELCyAAIAY2AiwgACAHNgIoIAAgAikDADcDACAAIAY2AjQgACAENgIwIABBCGogAkEIaikDADcDACAAQRBqIAJBEGopAwA3AwAgAEEYaiACQRhqKQMANwMAIABBIGogAkEgaikDADcDACACQdAAaiQADwtBCEHIAxDaAQALIARBC0HsjsAAEH4AC0G0jsAAQShB3I7AABCVAQALIANBDEH8jsAAEH4AC0G0jsAAQShB3I7AABCVAQALywICBn8BfgJAIAAoAggiASAAKAIEIgJGDQAgASACSQRAIAAoAgAiBCABai0AACIDQSJGIANB3ABGciADQSBJcg0BIARBAWohA0EAIAIgAUEBaiIEa0F4cSIFayECA0AgAkUEQCAAIAQgBWo2AggCQCAAKAIIIgEgACgCBCIDTw0AIAAoAgAhBANAIAEgBGotAAAiAkEiRiACQdwARnIgAkEgSXINASAAIAFBAWoiATYCCCABIANHDQALCw8LIAEgA2ogAkEIaiECIAFBCGohASkAACIHQn+FIAdC3Ljx4sWLl67cAIVCgYKEiJCgwIABfSAHQqLEiJGixIiRIoVCgYKEiJCgwIABfSAHQqDAgIGChIiQIH2EhINCgIGChIiQoMCAf4MiB1ANAAsgACAHeqdBA3YgAWpBB2s2AggPCyABIAJBpKnAABB9AAsLtwUCBX8CfiMAQTBrIgIkAAJAAkACQAJAIAEoAhQiAyABKAIQIgRJBEAgASgCDCEFA0ACQCADIAVqLQAAIgZBCWsOJQAABAQABAQEBAQEBAQEBAQEBAQEBAQEAAQEBAQEBAQEBAQEBAMECyABIANBAWoiAzYCFCADIARHDQALCyACQQU2AhggAiABQQxqEIYBIAJBGGogAigCACACKAIEEIkBIQNBASEEDAMLQQEhBCABIANBAWo2AhQgAkEIaiABQQAQIQJAIAIpAwgiCEIDUgRAIAIpAxAhBwJ/AkACQAJAIAinQQFrDgIAAQULIAdCgICAgBBUDQFBASEFIAJBAToAGCACIAc3AyAgAkEYaiACQS9qQfiKwAAQcgwCCyAHQoCAgIAQVA0AIAJBAjoAGCACIAc3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AiACKQIMIgU3AwAgAUEIaiADNgIAIAEgBTcCAAsgAEGopsEANgIEIAAgATYCACACQTBqJAALmwEBAX8CQAJAIAEEQCACQQBIDQECfyADKAIEBEACQCADKAIIIgRFBEAMAQsgAygCACAEIAEgAhCxAQwCCwsgASACRQ0AGkHR4sEALQAAGiACIAEQugELIgMEQCAAIAI2AgggACADNgIEIABBADYCAA8LIAAgAjYCCCAAIAE2AgQMAgsgAEEANgIEDAELIABBADYCBAsgAEEBNgIAC6kBAQF/IwBBEGsiBiQAAkAgAQRAIAZBBGogASADIAQgBSACKAIQEQcAAkAgBigCBCICIAYoAgwiAU0EQCAGKAIIIQUMAQsgAkECdCECIAYoAgghAyABRQRAQQQhBSADIAJBBBDEAQwBCyADIAJBBCABQQJ0IgIQsQEiBUUNAgsgACABNgIEIAAgBTYCACAGQRBqJAAPC0GQnMAAQTIQ1AEAC0EEIAIQsAEAC6cBAAJAIAEEQCACQQBIDQECfyADKAIEBEAgAygCCCIBRQRAQdHiwQAtAAAaIAJBARC6AQwCCyADKAIAIAFBASACELEBDAELQdHiwQAtAAAaIAJBARC6AQsiAQRAIAAgAjYCCCAAIAE2AgQgAEEANgIADwsgACACNgIIIABBATYCBCAAQQE2AgAPCyAAQQA2AgQgAEEBNgIADwsgAEEANgIEIABBATYCAAukAQEBfyMAQUBqIgIkACAAKAIAIQAgAkIANwM4IAJBOGogABAXIAIgAigCPCIANgI0IAIgAigCODYCMCACIAA2AiwgAiACQSxqrUKAgICAkAaENwMgIAJBAjYCDCACQcycwAA2AgggAkIBNwIUIAIgAkEgajYCECABKAIUIAEoAhggAkEIahAsIAIoAiwiAQRAIAIoAjAgAUEBEMQBCyACQUBrJAALoQEBAX8jAEEwayIDJAAgAyACNwMIIAACfyABLQACRQRAIAJC/////////w98Qv////////8fWgRAIANBAjYCFCADQaCZwAA2AhAgA0IBNwIcIAMgA0EIaq1CgICAgPADhDcDKCADIANBKGo2AhhBASEBIANBEGoQXQwCC0EAIQEgArkQAwwBC0EAIQEgAhAHCzYCBCAAIAE2AgAgA0EwaiQAC5cBAQF/IwBBMGsiAyQAIAMgAjcDCCAAAn8gAS0AAkUEQCACQoCAgICAgIAQWgRAIANBAjYCFCADQaCZwAA2AhAgA0IBNwIcIAMgA0EIaq1CgICAgMAAhDcDKCADIANBKGo2AhhBASEBIANBEGoQXQwCC0EAIQEgAroQAwwBC0EAIQEgAhAICzYCBCAAIAE2AgAgA0EwaiQAC5IBAgF/AX4jAEEwayICJAACfyAAKAIAIgAoAgxFBEAgACABEFAMAQsgAkEDNgIEIAJB4KXAADYCACACQgM3AgwgAkKAgICAoAMiAyAAQRBqrYQ3AyggAiADIABBDGqthDcDICACIACtQoCAgICgBoQ3AxggAiACQRhqNgIIIAEoAhQgASgCGCACECwLIAJBMGokAAuIAQEBfyMAQUBqIgMkACADIAI2AgQgAyABNgIAIANBOGogAEEIaikDADcDACADQQI2AgwgA0GUpsAANgIIIANCAjcCFCADIAOtQoCAgICwBoQ3AyggAyADQTBqrUKAgICAwAaENwMgIAMgACkDADcDMCADIANBIGo2AhAgA0EIahBhIANBQGskAAuIAQEBfyMAQUBqIgMkACADIAI2AgQgAyABNgIAIANBOGogAEEIaikDADcDACADQQI2AgwgA0G0psAANgIIIANCAjcCFCADIAOtQoCAgICwBoQ3AyggAyADQTBqrUKAgICAwAaENwMgIAMgACkDADcDMCADIANBIGo2AhAgA0EIahBhIANBQGskAAuSAQEEfyMAQRBrIgIkAEEBIQQCQCABKAIUIgNBJyABKAIYIgUoAhAiAREAAA0AIAJBBGogACgCAEGBAhAkAkAgAi0ABEGAAUYEQCADIAIoAgggAREAAEUNAQwCCyADIAItAA4iACACQQRqaiACLQAPIABrIAUoAgwRAQANAQsgA0EnIAERAAAhBAsgAkEQaiQAIAQLfgEBfyMAQUBqIgEkACABQfSLwAA2AhQgAUHsi8AANgIQIAEgADYCDCABQQI2AhwgAUHAmMAANgIYIAFCAjcCJCABIAFBEGqtQoCAgICQA4Q3AzggASABQQxqrUKAgICAoAOENwMwIAEgAUEwajYCICABQRhqEGEgAUFAayQAC3cBAX8jAEEgayICJAACfyAAKAIAQYCAgIB4RwRAIAEgACgCBCAAKAIIELUBDAELIAJBGGogACgCDCIAQRBqKQIANwMA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KAIIIgdGBH8gAiAHQQEQYyACKAIIBSAHCyACKAIEakHbADoAACACIAIoAghBAWoiBzYCCAJ/IAgEQAJAIBIgCEEMbGohFUEBIQsCQANAIBJBCGooAgAhCCASQQRqKAIAIRQgC0UEQCAHIAIoAgBGBH8gAiAHQQEQYyACKAIIBSAHCyACKAIEakEsOgAAIAIgAigCCEEBaiIHNgIICyAHIAIoAgBGBH8gAiAHQQEQYyACKAIIBSAHCyACKAIEakHbADoAACACIAIoAghBAWoiBzYCCAJAAkAgCEUEQCACKAIAIAdGDQEMAgsgDSAYIBRBBGooAgAgFEEIaigCABAjIA0tAABBBEcNAyAIQQFHBEAgFEEUaiEHIAhBDGxBDGshCANAIAdBBGsoAgAhFCAHKAIAIRwgAigCCCILIAIoAgBGBH8gAiALQQEQYyACKAIIBSALCyACKAIEakEsOgAAIAIgAigCCEEBajYCCCANIBggFCAcECMgDS0AAEEERw0FIAdBDGohByAIQQxrIggNAAsLIAIoAggiByACKAIARw0BCyACIAdBARBjIAIoAgghBwsgAigCBCAHakHdADoAACACIAIoAghBAWoiBzYCCEEAIQsgEkEMaiISIBVHDQALDAELIA0gDSkDADcDCCANQQhqEJYBDAILCyAHIAIoAgBGBH8gAiAHQQEQYyACKAIIBSAHCyACKAIEakHdADoAACACIAIoAghBAWo2AghBAAshByANQRBqJAAgBw0AIAkoArABIgcoAgAgBygCCCICRgRAIAcgAkEBEGMgBygCCCECCyAHIAJBAWo2AgggBygCBCACakEsOgAAIAlB6ARqIAlBsAFqIBogFhAjIAktAOgEQQRGDQEgCSAJKQPoBDcD+AMgCUH4A2oQlgEhBwsgCSgCiAMiAkUNASAJKAKMAyACQQEQxAEMAQsgCSgCsAEiBygCACAHKAIIIgJGBEAgByACQQEQYyAHKAIIIQILIAcoAgQgAmpB3QA6AAAgByACQQFqNgIIIAkoAowDIQcgCSgCiAMiFUGAgICAeEYNACAJKAKQAyECIBdBAEHBABDeASEIIAlBoANqQaCDwAApAwA3AwAgCUGYA2pBmIPAACkDADcDACAJQZADakGQg8AAKQMANwMAIAlCADcDqAMgCUGIg8AAKQMANwOIAwJAIAJBwABP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AkEBEMQBCyAJKAKYASILBEAgCSgClAEhEkEAIQgDQCASIAhBDGxqIg0oAggiAgRAIA0oAgQhBwNAIAcoAgAiFARAIAdBBGooAgAgFEEBEMQBCyAHQQxqIQcgAkEBayICDQALCyANKAIAIgIEQCANKAIEIAJBDGxBBBDEAQsgCEEBaiIIIAtHDQALCyAJKAKQASICBEAgCSgClAEgAkEMbEEEEMQBCyAJKAKcASICQYCAgIB4RwRAIAIEQCAJKAKgASACQQEQxAELIBNBAUYNAgwBCyATQQFGDQELICVBhAFPBEAgJRAACyAkQYQBSSAuQgJScg0AICQQAAsgCUGwBWokACAPDAILQQFBBRCwAQALQYCGwABBNyAJQa8FakHwhcAAQYSHwAAQeAALIAYEQCAFIAZBARDEAQsgBARAIAMgBEEBEMQBCyABBEAgACABQQEQxAELC0wBAX9B0eLBAC0AABpBFEEEELoBIgMEQCADIAI2AhAgAyABNgIMIAMgACkCADcCACADQQhqIABBCGooAgA2AgAgAw8LQQRBFBDaAQALOgEBfyMAQSBrIgAkACAAQQA2AhggAEEBNgIMIABB+KnBADYCCCAAQgQ3AhAgAEEIakGsqsEAEIsBAAu0AgEDfyMAQSBrIgIkACACQRBqIgMgAEEQaikCADcDACACQQhqIgQgAEEIaikCADcDACACQQE7ARwgAiABNgIYIAIgACkCADcDACMAQSBrIgAkACACKAIYIQEgAEEQaiADKQIANwMAIABBCGogBCkCADcDACAAIAI2AhwgACABNgIYIAAgAikCADcDAEEAIQIjAEEQayIBJAAgACgCDCEDAkACQAJAAkAgACgCBA4CAAECCyADDQFBASEDDAILIAMNACAAKAIAIgMoAgQhAiADKAIAIQMMAQsgAUGAgICAeDYCACABIAA2AgwgAUHkpsEAIAAoAhggACgCHCIALQAcIAAtAB0QYAALIAEgAjYCBCABIAM2AgAgAUHIpsEAIAAoAhggACgCHCIALQAcIAAtAB0QYAALTwECf0HR4sEALQAAGiABKAIEIQIgASgCACEDQQhBBBC6ASIBBEAgASACNgIEIAEgAzYCACAAQbimwQA2AgQgACABNgIADwtBBEEIENoBAAtPAQJ/IAAoAgQhAiAAKAIAIQMCQCAAKAIIIgAtAABFDQAgA0H8xsEAQQQgAigCDBEBAEUNAEEBDwsgACABQQpGOgAAIAMgASACKAIQEQAAC0IBAX8gAiAAKAIAIAAoAggiA2tLBEAgACADIAIQYyAAKAIIIQMLIAAoAgQgA2ogASACEOEBGiAAIAIgA2o2AghBAAtCAQF/IAIgACgCACAAKAIIIgNrSwRAIAAgAyACEGUgACgCCCEDCyAAKAIEIANqIAEgAhDhARogACACIANqNgIIQQALWAECfwJAQYjjwQAtAABFBEBBiOPBAEEBOgAADAELQYzjwQAoAgBBAUYhAUGQ48EAKAIAIQILQZDjwQBBADYCAEGM48EAQQA2AgAgACACNgIEIAAgATYCAAtCAQF/IAIgACgCACAAKAIIIgNrSwRAIAAgAyACEGYgACgCCCEDCyAAKAIEIANqIAEgAhDhARogACACIANqNgIIQQALvQMBBn8jAEEQayICJABB7OLBAC0AAEEDRwRAIAJBAToACyACIAJBC2o2AgwgAkEMaiEAIwBBIGsiASQAAkACQAJAAkACQAJAAkBB7OLBAC0AAEEBaw4DAgQBAAtB7OLBAEECOgAAIAAoAgAiAC0AACAAQQA6AABFDQIjAEEgayIAJAACQAJAAkBBpOPBACgCAEH/////B3EEQEHs5sEAKAIADQELQZjjwQAoAgANAUGg48EAKAIAIQNBoOPBAEHQkMAANgIAQZzjwQAoAgAhBEGc48EAQQE2AgBBmOPBAEEANgIAAkAgBEUNACADKAIAIgUEQCAEIAURBAALIAMoAgQiBUUNACAEIAUgAygCCBDEAQsgAEEgaiQADAILIABBADYCGCAAQQE2AgwgAEH0pcEANgIIIABCBDcCECAAQQhqQZimwQAQiwEACwALQeziwQBBAzoAAAsgAUEgaiQADAQLIAFBADYCGCABQQE2AgwgAUGUkcAANgIIDAILQaiSwAAQyAEACyABQQA2AhggAUEBNgIMIAFB1JHAADYCCAsgAUIENwIQIAFBCGpBjIXAABCLAQALCyACQRBqJAALOAACQCABaUEBR0GAgICAeCABayAASXINACAABEBB0eLBAC0AABogACABELoBIgFFDQELIAEPCwALQgEBfyMAQRBrIgIkACACQQhqIAEoAgAgASgCBCABKAIIEC0gAigCDCEBIAAgAigCCDYCACAAIAE2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DQEMAgsgACAHQfyywQAQfQALAkACQCAFIAdNBEAgBSAKaiEBQQAhAyAKIQQCQANAIAMgBUYNASADQQFqIQMgBEEBayIEIAVqIgAtAABBOUYNAAsgACAALQAAQQFqOgAAIAUgA2tBAWogBU8NBCAAQQFqQTAgA0EBaxDeARoMBAtBMSEDIA5FDQEMAgsgBSAHQYyzwQAQfgALIApBMToAAEEwIQMgBUEBRg0AIApBAWpBMCAFQQFrEN4BGgsgD0EBaiEPIB0gBSAHT3INACABIAM6AAAgBUEBaiEFCyAFIAdLDQEgBQshACAVIA87AQggFSAANgIEDAELIAUgB0Gcs8EAEH4ACyAVIAo2AgAgBkHABmokAAwFCyADQShB8NrBABB+AAtBKEEoQfDawQAQfQALIAFBKEHw2sEAEH4AC0GA28EAQRpB8NrBABCVAQALIAlByAhqIAlBmAhqKAIANgIAIAkgCSkCkAg3A8AICyAUIAkuAcgIIgBIBEAgCUEIaiAJKALACCAJKALECCAAIBMgCUGQCGoQQSAJKAIMIQEgCSgCCAwDC0ECIQEgCUECOwGQCCATRQRAQQEhASAJQQE2ApgIIAlBs8PBADYClAggCUGQCGoMAwsgCUGgCGogEzYCACAJQQA7AZwIIAlBAjYCmAggCUGpw8EANgKUCCAJQZAIagwCC0G0w8EAQSVB3MPBABCVAQALQQEhASAJQQE2ApgIIAlBs8PBADYClAggCUGQCGoLIQAgCSABNgLMCCAJIAA2AsgIIAkgHDYCxAggCSAbNgLACCAIIAlBwAhqEC4gCUHwCGokAAwBCyAAQShB8NrBABB+AAsPCyABIwBBgAFrIgMkACA/vSEmAn9BAiA/ID9iDQAaICZC/////////weDIilCgICAgICAgAiEICZCAYZC/v///////w+DICZCNIinQf8PcSINGyInQgGDISggJkKAgICAgICA+P8AgyElAkACQCApUARAQQMgJUKAgICAgICA+P8AUQ0DGiAlUEUNAUEEDAMLICVQDQELQoCAgICAgIAgICdCAYYgJ0KAgICAgICACFEiABshJ0ICQgEgABshJUHLd0HMdyAAGyANaiENIChQDAELIA1BswhrIQ1CASElIChQCyEAIAMgDTsBeCADICU3A3AgA0IBNwNoIAMgJzcDYCADIAA6AHoC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DQALQcC/wQAQmwEACyABIAhqQQFrIQogKUIKfiAmICp8fSEtICogLkIKfiAwIDF8IDpCgICAgAh8QiCIfCA5fEIKfn0gKH58IS8gKyAmfSEwQgAhKQNAICYgKnwiJSArVCApIDB8ICYgL3xackUEQEEAIQAMBQsgCiACQQFrIgI6AAAgKSAtfCIxICpUIQAgJSArWg0FICkgKn0hKSAlISYgKiAxWA0ACwwEC0ERQRFB0L/BABB9AAsgAUERQeC/wQAQfQALAkAgJSAqWiACcg0AICogJSAofCImWCAqICV9ICYgKn1UcQ0AIAVBADYCAAwECyAlID5CA31YICVCAlpxRQRAIAVBADYCAAwECyAFIAk7AQggBSABQQFqNgIEDAILICYhJQsCQCAlICxaIAByDQAgLCAlICp8IiZYICwgJX0gJiAsfVRxDQAgBUEANgIADAILICUgKEJYfiAnfFggJSAoQhR+WnFFBEAgBUEANgIADAILIAUgCTsBCCAFIAE2AgQLIAUgCDYCAAsgBEEwaiQADAELIARBADYCGCMAQRBrIgEkACABIAQ2AgwgASAEQRBqNgIIIwBB8ABrIgAkACAAQbDFwQA2AgwgACABQQhqNgIIIABBsMXBADYCFCAAIAFBDGo2AhAgAEHAxcEANgIYIABBAjYCHAJAIARBGGoiASgCAEUEQCAAQQM2AlwgAEH8xcEANgJYIABCAzcCZCAAIABBEGqtQoCAgIDwCoQ3A0ggACAAQQhqrUKAgICA8AqENwNADAELIABBMGogAUEQaikCADcDACAAQShqIAFBCGopAgA3AwAgACABKQIANwMgIABBBDYCXCAAQbDGwQA2AlggAEIENwJkIAAgAEEQaq1CgICAgPAKhDcDUCAAIABBCGqtQoCAgIDwCoQ3A0ggACAAQSBqrUKAgICAkAuENwNACyAAIABBGGqtQoCAgICAC4Q3AzggACAAQThqNgJgIABB2ABqQYStwQAQiwEACwJAIAMoAiBFBEAgA0HQAGohEyMAQaAKayIBJAACQAJAAkACQAJAIAECfwJAAkACQAJAAkACQCAMKQMAIiVQRQRAIAwpAwgiJlANASAMKQMQIidQDQIgJSAnfCIoICVUDQMgJSAmVA0EIAwsABohFSAMLwEYIQAgASAlPgIAIAFBAUECICVCgICAgBBUIgIb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DAsRACABIAAoAgAgACgCBBC1AQshACAAQvSF952xy9SvwwA3AwggAEKcu7bEi83/r2Y3AwALIgAgAELtuq22zYXU9eMANwMIIABC+IKZvZXuxsW5fzcDAAsTACAAQbimwQA2AgQgACABNgIACxAAIAEgACgCACAAKAIEECULEAAgASgCFCABKAIYIAAQLAthAQF/AkACQCAAQQRrKAIAIgJBeHEiA0EEQQggAkEDcSICGyABak8EQCACQQAgAyABQSdqSxsNASAAECgMAgtBvZ3BAEEuQeydwQAQlQEAC0H8ncEAQS5BrJ7BABCVAQALCw0AIAAoAgAgASACEAoLDQAgACgCACABIAIQEwsNACAANQIAQQEgARBJCw8AQanEwQBBKyAAEJUBAAsNACAAKQMAQQEgARBJC7sCAgJ/AX4gACgCACkDACEEIwBBgAFrIgMkAAJ/AkACQCABKAIcIgBBEHFFBEAgAEEgcQ0BIARBASABEEkMAwtBACEAA0AgACADakH/AGogBKdBD3EiAkEwciACQdcAaiACQQpJGzoAACAAQQFrIQAgBEIQVCAEQgSIIQRFDQALDAELQQAhAANAIAAgA2pB/wBqIASnQQ9xIgJBMHIgAkE3aiACQQpJGzoAACAAQQFrIQAgBEIQVCAEQgSIIQRFDQALIABBgAFqIgJBgQFPBEAgAkGAAUGkx8EAEHwACyABQQFBtMfBAEECIAAgA2pBgAFqQQAgAGsQJgwBCyAAQYABaiICQYEBTwRAIAJBgAFBpMfBABB8AAsgAUEBQbTHwQBBAiAAIANqQYABakEAIABrECYLIANBgAFqJAALDgAgAUHzgcAAQQUQtQELDgAgAUHvg8AAQREQtQELDgAgAUHEkMAAQQoQtQELCwAgACgCACABEG0LDQAgAEGolsAAIAEQLAsKACAAIAEQTUEACw4AIAFB/JfAAEEFELUBCw0AIABByJrAACABECwLDgAgAUHAmsAAQQUQtQELCQAgACABEBgACw0AIABB1JrBACABECwLDQAgAEH8nMEAIAEQLAsMACAAIAEpAgA3AwALDQAgAEHEqsEAIAEQLAsOACABQbyqwQBBBRC1AQsaACAAIAFBlOPBACgCACIAQcEAIAAbEQIAAAvyAwEHfyMAQRBrIgMkAAJAAn8CQCABQYABTwRAIANBADYCDCAB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MDEwMjAzMDQwNTA2MDcwODA5MTAxMTEyMTMxNDE1MTYxNzE4MTkyMDIxMjIyMzI0MjUyNjI3MjgyOTMwMzEzMjMzMzQzNTM2MzczODM5NDA0MTQyNDM0NDQ1NDY0NzQ4NDk1MDUxNTI1MzU0NTU1NjU3NTg1OTYwNjE2MjYzNjQ2NTY2Njc2ODY5NzA3MTcyNzM3NDc1NzY3Nzc4Nzk4MDgxODI4Mzg0ODU4Njg3ODg4OTkwOTE5MjkzOTQ5NTk2OTc5ODk5RXJyb3IvcnVzdGMvZWViOTBjZGExOTY5MzgzZjU2YTI2MzdjYmQzMDM3YmRmNTk4ODQxYy9saWJyYXJ5L2FsbG9jL3NyYy9jb2xsZWN0aW9ucy9idHJlZS9uYXZpZ2F0ZS5ycwD4ABAAXwAAABcCAAAvAAAA+AAQAF8AAACiAAAAJAAAAAAAAAAEAAAABAAAAAUAAABn5glqha5nu3Lzbjw69U+lf1IOUYxoBZur2YMfGc3gW3NyYy9saWIucnMAAKgBEAAKAAAAKQAAABoAAABOb3N0ckV2ZW50cHVia2V5a2luZGNvbnRlbnR0YWdzaWRjcmVhdGVkX2F0c3RydWN0IE5vc3RyRXZlbnRNaW5lZFJlc3VsdGV2ZW50dG90YWxfdGltZWtocy9Vc2Vycy9zYW5kd2ljaC8uY2FyZ28vcmVnaXN0cnkvc3JjL2luZGV4LmNyYXRlcy5pby02ZjE3ZDIyYmJhMTUwMDFmL2NvbnNvbGVfZXJyb3JfcGFuaWNfaG9vay0wLjEuNy9zcmMvbGliLnJzAB0CEABuAAAAlQAAAA4AAABldmVudF9qc29uOiCcAhAADAAAAG5vbmNlAAAABgAAAAwAAAAEAAAABwAAAAgAAAAJAAAAqAEQAAoAAACUAAAAGAAAAKgBEAAKAAAAlQAAABgAQfiFwAAL7QQBAAAACgAAAGEgRGlzcGxheSBpbXBsZW1lbnRhdGlvbiByZXR1cm5lZCBhbiBlcnJvciB1bmV4cGVjdGVkbHkvcnVzdGMvZWViOTBjZGExOTY5MzgzZjU2YTI2MzdjYmQzMDM3YmRmNTk4ODQxYy9saWJyYXJ5L2FsbG9jL3NyYy9zdHJpbmcucnMAADcDEABLAAAABgoAAA4AAABGYWlsZWQgdG8gY29tcHV0ZSBldmVudCBoYXNoLmVycm9yTWluaW5nIGNhbmNlbGxlZC5NaW5lZCBzdWNjZXNzZnVsbHkgd2l0aCBub25jZTogAADHAxAAHwAAAAsAAAAEAAAABAAAAAwAAACoARAACgAAALQAAABDAAAARmFpbGVkIHRvIGNvbnZlcnQgcmVwb3J0X3Byb2dyZXNzIHRvIEZ1bmN0aW9uSW52YWxpZCBwcm9ncmVzcyBjYWxsYmFjay5KU09OIHBhcnNpbmcgZXJyb3I6IABXBBAAFAAAAEludmFsaWQgZXZlbnQgSlNPTjogdAQQABQAAABFcnJvciBjYWxsaW5nIHByb2dyZXNzIGNhbGxiYWNrOiAAAACQBBAAIQAAAGludGVybmFsIGVycm9yOiBlbnRlcmVkIHVucmVhY2hhYmxlIGNvZGUvVXNlcnMvc2FuZHdpY2gvLmNhcmdvL3JlZ2lzdHJ5L3NyYy9pbmRleC5jcmF0ZXMuaW8tNmYxN2QyMmJiYTE1MDAxZi9zZXJkZV9qc29uLTEuMC4xMjgvc3JjL2RlLnJzAAAA5AQQAGEAAACaBAAAIgAAAOQEEABhAAAAkAQAACYAQfCKwAALBQEAAAANAEGAi8AACwUBAAAADgBBkIvAAAsFAQAAAA8AQaCLwAALBQEAAAAPAEGwi8AACwUBAAAAEABBwIvAAAuOBQEAAAARAAAAc3RydWN0IE5vc3RyRXZlbnQgd2l0aCA2IGVsZW1lbnRzAAAAyAUQACEAAAAAAAAACAAAAAQAAAASAAAAcHVia2V5a2luZGNvbnRlbnR0YWdzaWRjcmVhdGVkX2F0L3J1c3RjL2VlYjkwY2RhMTk2OTM4M2Y1NmEyNjM3Y2JkMzAzN2JkZjU5ODg0MWMvbGlicmFyeS9hbGxvYy9zcmMvY29sbGVjdGlvbnMvYnRyZWUvbWFwL2VudHJ5LnJzAAAAJQYQAGAAAABxAQAANgAAAC9ydXN0Yy9lZWI5MGNkYTE5NjkzODNmNTZhMjYzN2NiZDMwMzdiZGY1OTg4NDFjL2xpYnJhcnkvYWxsb2Mvc3JjL2NvbGxlY3Rpb25zL2J0cmVlL25vZGUucnNhc3NlcnRpb24gZmFpbGVkOiBlZGdlLmhlaWdodCA9PSBzZWxmLmhlaWdodCAtIDEAmAYQAFsAAACvAgAACQAAAGFzc2VydGlvbiBmYWlsZWQ6IHNyYy5sZW4oKSA9PSBkc3QubGVuKCmYBhAAWwAAAC8HAAAFAAAAmAYQAFsAAACvBAAAIwAAAJgGEABbAAAA7wQAACQAAABhc3NlcnRpb24gZmFpbGVkOiBlZGdlLmhlaWdodCA9PSBzZWxmLm5vZGUuaGVpZ2h0IC0gMQAAAJgGEABbAAAA8AMAAAkAAAAvcnVzdGMvZWViOTBjZGExOTY5MzgzZjU2YTI2MzdjYmQzMDM3YmRmNTk4ODQxYy9saWJyYXJ5L2FsbG9jL3NyYy9jb2xsZWN0aW9ucy9idHJlZS9uYXZpZ2F0ZS5ycwDUBxAAXwAAAFkCAAAwAAAAYSBzZXF1ZW5jZQBB2JDAAAvtAgEAAAATAAAAFAAAABUAAABPbmNlIGluc3RhbmNlIGhhcyBwcmV2aW91c2x5IGJlZW4gcG9pc29uZWQAAGgIEAAqAAAAb25lLXRpbWUgaW5pdGlhbGl6YXRpb24gbWF5IG5vdCBiZSBwZXJmb3JtZWQgcmVjdXJzaXZlbHmcCBAAOAAAAC9ydXN0Yy9lZWI5MGNkYTE5NjkzODNmNTZhMjYzN2NiZDMwMzdiZGY1OTg4NDFjL2xpYnJhcnkvc3RkL3NyYy9zeW5jL29uY2UucnPcCBAATAAAAJ4AAAAyAAAAL3J1c3RjL2VlYjkwY2RhMTk2OTM4M2Y1NmEyNjM3Y2JkMzAzN2JkZjU5ODg0MWMvbGlicmFyeS9hbGxvYy9zcmMvY29sbGVjdGlvbnMvYnRyZWUvbmF2aWdhdGUucnMAOAkQAF8AAADHAAAAJwAAADgJEABfAAAAFwIAAC8AAAA4CRAAXwAAAKIAAAAkAEHQk8AACwUBAAAADgBB4JPAAAv1AgEAAAANAAAATWFwIGtleSBpcyBub3QgYSBzdHJpbmcgYW5kIGNhbm5vdCBiZSBhbiBvYmplY3Qga2V5Y2FsbGVkIGBPcHRpb246OnVud3JhcF90aHJvdygpYCBvbiBhIGBOb25lYCB2YWx1ZS9Vc2Vycy9zYW5kd2ljaC8uY2FyZ28vcmVnaXN0cnkvc3JjL2luZGV4LmNyYXRlcy5pby02ZjE3ZDIyYmJhMTUwMDFmL3NlcmRlX2pzb24tMS4wLjEyOC9zcmMvc2VyLnJzAABMChAAYgAAAC4IAAAzAAAATAoQAGIAAAAhCAAAQAAAAGludGVybmFsIGVycm9yOiBlbnRlcmVkIHVucmVhY2hhYmxlIGNvZGVMChAAYgAAAAsGAAASAAAAXCJcXFxiXGZcblxyXHQwMTIzNDU2Nzg5YWJjZGVmAAAWAAAADAAAAAQAAAAXAAAAGAAAAAkAAAAbAAAADAAAAAQAAAAcAAAAHQAAAAkAQeCWwAAL0wMBAAAAHgAAAGEgRGlzcGxheSBpbXBsZW1lbnRhdGlvbiByZXR1cm5lZCBhbiBlcnJvciB1bmV4cGVjdGVkbHkvcnVzdGMvZWViOTBjZGExOTY5MzgzZjU2YTI2MzdjYmQzMDM3YmRmNTk4ODQxYy9saWJyYXJ5L2FsbG9jL3NyYy9zdHJpbmcucnMAAJ8LEABLAAAABgoAAA4AAABFcnJvcm1pc3NpbmcgZmllbGQgYGAAAAABDBAADwAAABAMEAABAAAAaW52YWxpZCBsZW5ndGggLCBleHBlY3RlZCAAACQMEAAPAAAAMwwQAAsAAABkdXBsaWNhdGUgZmllbGQgYAAAAFAMEAARAAAAEAwQAAEAAAAgY2FuJ3QgYmUgcmVwcmVzZW50ZWQgYXMgYSBKYXZhU2NyaXB0IG51bWJlcgEAAAAAAAAAdAwQACwAAAAvVXNlcnMvc2FuZHdpY2gvLmNhcmdvL3JlZ2lzdHJ5L3NyYy9pbmRleC5jcmF0ZXMuaW8tNmYxN2QyMmJiYTE1MDAxZi9zZXJkZS13YXNtLWJpbmRnZW4tMC42LjUvc3JjL2xpYi5yc7AMEABoAAAANQAAAA4AAAD//////////ygNEABBwJrAAAsqRXJyb3IAAAAgAAAADAAAAAQAAAAhAAAAIgAAACMAAAAKClN0YWNrOgoKAEH0msAAC5sCAQAAACQAAABhIERpc3BsYXkgaW1wbGVtZW50YXRpb24gcmV0dXJuZWQgYW4gZXJyb3IgdW5leHBlY3RlZGx5L3J1c3RjL2VlYjkwY2RhMTk2OTM4M2Y1NmEyNjM3Y2JkMzAzN2JkZjU5ODg0MWMvbGlicmFyeS9hbGxvYy9zcmMvc3RyaW5nLnJzAACzDRAASwAAAAYKAAAOAAAAY2xvc3VyZSBpbnZva2VkIHJlY3Vyc2l2ZWx5IG9yIGFmdGVyIGJlaW5nIGRyb3BwZWRKc1ZhbHVlKCkAQg4QAAgAAABKDhAAAQAAADAxMjM0NTY3ODlhYmNkZWZ1dXV1dXV1dWJ0bnVmcnV1dXV1dXV1dXV1dXV1dXV1dQAAIgBByJ3AAAsBXABB7J7AAAvdJi9ydXN0Yy9lZWI5MGNkYTE5NjkzODNmNTZhMjYzN2NiZDMwMzdiZGY1OTg4NDFjL2xpYnJhcnkvY29yZS9zcmMvc3RyL3BhdHRlcm4ucnMAbA8QAE8AAAAaBgAAFAAAAGwPEABPAAAAGgYAACEAAABsDxAATwAAAA4GAAAUAAAAbA8QAE8AAAAOBgAAIQAAAGFzc2VydGlvbiBmYWlsZWQ6IHNlbGYuaXNfY2hhcl9ib3VuZGFyeShuZXdfbGVuKS9ydXN0Yy9lZWI5MGNkYTE5NjkzODNmNTZhMjYzN2NiZDMwMzdiZGY1OTg4NDFjL2xpYnJhcnkvYWxsb2Mvc3JjL3N0cmluZy5ycwAsEBAASwAAAIIFAAANAAAAbA8QAE8AAACbBAAAJAAAAEVPRiB3aGlsZSBwYXJzaW5nIGEgbGlzdEVPRiB3aGlsZSBwYXJzaW5nIGFuIG9iamVjdEVPRiB3aGlsZSBwYXJzaW5nIGEgc3RyaW5nRU9GIHdoaWxlIHBhcnNpbmcgYSB2YWx1ZWV4cGVjdGVkIGA6YGV4cGVjdGVkIGAsYCBvciBgXWBleHBlY3RlZCBgLGAgb3IgYH1gZXhwZWN0ZWQgaWRlbnRleHBlY3RlZCB2YWx1ZWV4cGVjdGVkIGAiYGludmFsaWQgZXNjYXBlaW52YWxpZCBudW1iZXJudW1iZXIgb3V0IG9mIHJhbmdlaW52YWxpZCB1bmljb2RlIGNvZGUgcG9pbnRjb250cm9sIGNoYXJhY3RlciAoXHUwMDAwLVx1MDAxRikgZm91bmQgd2hpbGUgcGFyc2luZyBhIHN0cmluZ2tleSBtdXN0IGJlIGEgc3RyaW5naW52YWxpZCB2YWx1ZTogZXhwZWN0ZWQga2V5IHRvIGJlIGEgbnVtYmVyIGluIHF1b3Rlc2Zsb2F0IGtleSBtdXN0IGJlIGZpbml0ZSAoZ290IE5hTiBvciArLy1pbmYpbG9uZSBsZWFkaW5nIHN1cnJvZ2F0ZSBpbiBoZXggZXNjYXBldHJhaWxpbmcgY29tbWF0cmFpbGluZyBjaGFyYWN0ZXJzdW5leHBlY3RlZCBlbmQgb2YgaGV4IGVzY2FwZXJlY3Vyc2lvbiBsaW1pdCBleGNlZWRlZCBhdCBsaW5lICBjb2x1bW4gAAAAAQAAAAAAAADMEhAACQAAANUSEAAIAAAAaW52YWxpZCB0eXBlOiAsIGV4cGVjdGVkIAAAAPgSEAAOAAAABhMQAAsAAABpbnZhbGlkIHZhbHVlOiAAJBMQAA8AAAAGExAACwAAAGZsb2F0aW5nIHBvaW50IGBgAAAARBMQABAAAABUExAAAQAAAG51bGwvVXNlcnMvc2FuZHdpY2gvLmNhcmdvL3JlZ2lzdHJ5L3NyYy9pbmRleC5jcmF0ZXMuaW8tNmYxN2QyMmJiYTE1MDAxZi9zZXJkZV9qc29uLTEuMC4xMjgvc3JjL2Vycm9yLnJzbBMQAGQAAAD3AQAAIQAAAGwTEABkAAAA+wEAAAwAAABsExAAZAAAAAICAAAhAAAAbBMQAGQAAAALAgAAKgAAAGwTEABkAAAADwIAACwAAAAvVXNlcnMvc2FuZHdpY2gvLmNhcmdvL3JlZ2lzdHJ5L3NyYy9pbmRleC5jcmF0ZXMuaW8tNmYxN2QyMmJiYTE1MDAxZi9zZXJkZV9qc29uLTEuMC4xMjgvc3JjL3JlYWQucnMAIBQQAGMAAACgAQAARQAAACAUEABjAAAApQEAAD0AAAAgFBAAYwAAAK0BAAAaAAAAIBQQAGMAAAD6AQAAEwAAACAUEABjAAAA/wEAADMAAAAgFBAAYwAAAAMCAAA+AAAAIBQQAGMAAAAJAgAAOgAAACAUEABjAAAAVgIAABMAAAAgFBAAYwAAAGgCAAAZAAAA////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////AAABAAIAAwAEAAUABgAHAAgACQD//////////////////woACwAMAA0ADgAPAP////////////////////////////////////////////////////////////////////8KAAsADAANAA4ADwD///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8AABAAIAAwAEAAUABgAHAAgACQAP//////////////////oACwAMAA0ADgAPAA/////////////////////////////////////////////////////////////////////6AAsADAANAA4ADwAP///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////2luZi1pbmZOYU4AAAAAAAAAAPA/AAAAAAAAJEAAAAAAAABZQAAAAAAAQI9AAAAAAACIw0AAAAAAAGr4QAAAAACAhC5BAAAAANASY0EAAAAAhNeXQQAAAABlzc1BAAAAIF+gAkIAAADodkg3QgAAAKKUGm1CAABA5ZwwokIAAJAexLzWQgAANCb1awxDAIDgN3nDQUMAoNiFVzR2QwDITmdt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c2l6ZSA+PSBzaXplICsgbWluX292ZXJoZWFkAJROEAApAAAAqAQAAAkAAABhc3NlcnRpb24gZmFpbGVkOiBwc2l6ZSA8PSBzaXplICsgbWF4X292ZXJoZWFkAACUThAAKQAAAK4EAAANAAAAAQAAAAAAAABlbnRpdHkgbm90IGZvdW5kcGVybWlzc2lvbiBkZW5pZWRjb25uZWN0aW9uIHJlZnVzZWRjb25uZWN0aW9uIHJlc2V0aG9zdCB1bnJlYWNoYWJsZW5ldHdvcmsgdW5yZWFjaGFibGVjb25uZWN0aW9uIGFib3J0ZWRub3QgY29ubmVjdGVkYWRkcmVzcyBpbiB1c2VhZGRyZXNzIG5vdCBhdmFpbGFibGVuZXR3b3JrIGRvd25icm9rZW4gcGlwZWVudGl0eSBhbHJlYWR5IGV4aXN0c29wZXJhdGlvbiB3b3VsZCBibG9ja25vdCBhIGRpcmVjdG9yeWlzIGEgZGlyZWN0b3J5ZGlyZWN0b3J5IG5vdCBlbXB0eXJlYWQtb25seSBmaWxlc3lzdGVtIG9yIHN0b3JhZ2UgbWVkaXVtZmlsZXN5c3RlbSBsb29wIG9yIGluZGlyZWN0aW9uIGxpbWl0IChlLmcuIHN5bWxpbmsgbG9vcClzdGFsZSBuZXR3b3JrIGZpbGUgaGFuZGxlaW52YWxpZCBpbnB1dCBwYXJhbWV0ZXJpbnZhbGlkIGRhdGF0aW1lZCBvdXR3cml0ZSB6ZXJvbm8gc3RvcmFnZSBzcGFjZXNlZWsgb24gdW5zZWVrYWJsZSBmaWxlZmlsZXN5c3RlbSBxdW90YSBleGNlZWRlZGZpbGUgdG9vIGxhcmdlcmVzb3VyY2UgYnVzeWV4ZWN1dGFibGUgZmlsZSBidXN5ZGVhZGxvY2tjcm9zcy1kZXZpY2UgbGluayBvciByZW5hbWV0b28gbWFueSBsaW5rc2ludmFsaWQgZmlsZW5hbWVhcmd1bWVudCBsaXN0IHRvbyBsb25nb3BlcmF0aW9uIGludGVycnVwdGVkdW5zdXBwb3J0ZWR1bmV4cGVjdGVkIGVuZCBvZiBmaWxlb3V0IG9mIG1lbW9yeW90aGVyIGVycm9ydW5jYXRlZ29yaXplZCBlcnJvciAob3MgZXJyb3IgKQAAAAEAAAAAAAAAMVIQAAsAAAA8UhAA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CQEYBAEJAQMBBSsDPAgqGAEgNwEBAQQIBAEDBwoCHQE6AQEBAgQIAQkBCgIaAQICOQEEAgQCAgMDAR4CAwELAjkBBAUBAgQBFAIWBgEBOgEBAgEECAEHAwoCHgE7AQEBDAEJASgBAwE3AQEDBQMBBAcCCwIdAToBAgECAQMBBQIHAgsCHAI5AgEBAgQIAQkBCgIdAUgBBAECAwEBCAFRAQIHDAhiAQIJCwdJAhsBAQEBATcOAQUBAgULASQJAWYEAQYBAgICGQIEAxAEDQECAgYBDwEAAwADHQIeAh4CQAIBBwgBAgsJAS0DAQF1AiIBdgMEAgkBBgPbAgIBOgEBBwEBAQECCAYKAgEwHzEEMAcBAQUBKAkMAiAEAgIBAzgBAQIDAQEDOggCApgDAQ0BBwQBBgEDAsZAAAHDIQADjQFgIAAGaQIABAEKIAJQAgABAwEEARkCBQGXAhoSDQEmCBkLLgMwAQIEAgInAUMGAgICAgwBCAEvATMBAQMCAgUCAQEqAggB7gECAQQBAAEAEBAQAAIAAeIBlQUAAwECBQQoAwQBpQIABAACUANGCzEEewE2DykBAgIKAzEEAgIHAT0DJAUBCD4BDAI0CQoEAgFfAwIBAQIGAQIBnQEDCBUCOQIBAQEBFgEOBwMFwwgCAwEBFwFRAQIGAQECAQECAQLrAQIEBgIBAhsCVQgCAQECagEBAQIGAQFlAwIEAQUACQEC9QEKAgEBBAGQBAICBAEgCigGAgQIAQkGAgMuDQECAAcBBgEBUhYCBwECAQJ6BgMBAQIBBwEBSAIDAQEBAAILAjQFBQEBAQABBg8ABTsHAAE/BFEBAAIALgIXAAEBAwQFCAgCBx4ElAMANwQyCAEOARYFAQ8ABwERAgcBAgEFZAGgBwABPQQABAAHbQcAYIDwAHsJcHJvZHVjZXJzAghsYW5ndWFnZQEEUnVzdAAMcHJvY2Vzc2VkLWJ5AwVydXN0Yx0xLjgxLjAgKGVlYjkwY2RhMSAyMDI0LTA5LTA0KQZ3YWxydXMGMC4yMS4xDHdhc20tYmluZGdlbhIwLjIuOTMgKDBmMGI0ZTJkMCkALA90YXJnZXRfZmVhdHVyZXMCKw9tdXRhYmxlLWdsb2JhbHMrCHNpZ24tZXh0");let C=BigInt(M),i=BigInt(w),c=(H,S)=>{let q={type:"progress",workerId:M,hashRate:H,bestPowData:S?p(S):void 0};self.postMessage(q)},b=()=>L,f=function(H,S,q,z,W,r){let V=h(H,E.__wbindgen_malloc,E.__wbindgen_realloc),m=N,T=h(q,E.__wbindgen_malloc,E.__wbindgen_realloc),e=N,X=h(z,E.__wbindgen_malloc,E.__wbindgen_realloc),O=N;return J(E.mine_event(V,m,S,T,e,X,O,o(W),o(r)))}(g,Q,C.toString(),i.toString(),c,b);self.postMessage({type:"result",data:f,workerId:M})}catch(C){let i=C instanceof Error?C.message:JSON.stringify(C);console.error("Error during mining:",i),self.postMessage({type:"error",error:i,workerId:M})}finally{K=!1}}}catch(I){let g=I.message||"Unknown error occurred in worker";console.error("Critical Worker error:",g),self.postMessage({type:"error",error:g,workerId:M}),self.close()}}})();})();\n');
    }

    // src/index.ts
    var Notemine = class _Notemine {
      constructor(options) {
        this.REFRESH_EVERY_MS = 250;
        this._workerMaxHashRates = /* @__PURE__ */ new Map();
        this._workerHashRates = /* @__PURE__ */ new Map();
        this._lastRefresh = 0;
        this._totalHashRate = 0;
        this.mining$ = new BehaviorSubject(false);
        this.cancelled$ = new BehaviorSubject(false);
        this.result$ = new BehaviorSubject(null);
        this.workers$ = new BehaviorSubject([]);
        this.workersPow$ = new BehaviorSubject({});
        this.highestPow$ = new BehaviorSubject(null);
        this.progressSubject = new Subject();
        this.errorSubject = new Subject();
        this.cancelledEventSubject = new Subject();
        this.successSubject = new Subject();
        this.progress$ = this.progressSubject.asObservable();
        this.error$ = this.errorSubject.asObservable();
        this.cancelledEvent$ = this.cancelledEventSubject.asObservable();
        this.success$ = this.successSubject.asObservable();
        this._content = options?.content || "";
        this._tags = [..._Notemine._defaultTags, ...options?.tags || []];
        this._pubkey = options?.pubkey || "";
        this._difficulty = options?.difficulty || 20;
        this._numberOfWorkers = options?.numberOfWorkers || navigator.hardwareConcurrency || 4;
      }
      static {
        this._defaultTags = [["miner", "notemine"]];
      }
      set content(content) {
        this._content = content;
      }
      get content() {
        return this._content;
      }
      set tags(tags) {
        this._tags = Array.from(/* @__PURE__ */ new Set([...this._tags, ...tags]));
      }
      get tags() {
        return this._tags;
      }
      set pubkey(pubkey) {
        this._pubkey = pubkey;
      }
      get pubkey() {
        return this._pubkey;
      }
      set difficulty(difficulty) {
        this._difficulty = difficulty;
      }
      get difficulty() {
        return this._difficulty;
      }
      set numberOfWorkers(numberOfWorkers) {
        this._numberOfWorkers = numberOfWorkers;
      }
      get numberOfWorkers() {
        return this._numberOfWorkers;
      }
      set lastRefresh(interval) {
        this._lastRefresh = interval;
      }
      get lastRefresh() {
        return this._lastRefresh;
      }
      get totalHashRate() {
        return this._totalHashRate;
      }
      async mine() {
        if (this.mining$.getValue()) return;
        if (!this.pubkey) {
          throw new Error("Public key is not set.");
        }
        if (!this.content) {
          throw new Error("Content is not set.");
        }
        this.mining$.next(true);
        this.cancelled$.next(false);
        this.result$.next(null);
        this.workers$.next([]);
        this.workersPow$.next({});
        this.highestPow$.next({});
        await this.initializeWorkers();
      }
      stop() {
        this.cancel();
      }
      cancel() {
        if (!this.mining$.getValue()) return;
        this.cancelled$.next(true);
        this.workers$.getValue().forEach((worker) => worker.terminate());
        this.mining$.next(false);
        this.cancelledEventSubject.next({ reason: "Mining cancelled by user." });
      }
      async initializeWorkers() {
        try {
          const workers = [];
          for (let i = 0; i < this.numberOfWorkers; i++) {
            const worker = Worker2();
            worker.onmessage = this.handleWorkerMessage.bind(this);
            worker.onerror = this.handleWorkerError.bind(this);
            const event = this.prepareEvent();
            worker.postMessage({
              type: "mine",
              event,
              difficulty: this.difficulty,
              id: i,
              totalWorkers: this.numberOfWorkers
            });
            workers.push(worker);
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          this.workers$.next(workers);
        } catch (error) {
          this.errorSubject.next({ error });
          console.error("Error initializing workers:", error);
        }
      }
      handleWorkerMessage(e) {
        const data = e.data;
        const { type, workerId, hashRate } = data;
        if (type === "initialized") ; else if (type === "progress") {
          let bestPowData;
          if (data?.bestPowData) {
            bestPowData = data.bestPowData;
            const workersPow = { ...this.workersPow$.getValue() };
            workersPow[workerId] = bestPowData;
            this.workersPow$.next(workersPow);
            const highestPow = this.highestPow$.getValue();
            if (!highestPow || bestPowData && bestPowData.bestPow > (highestPow?.bestPow || 0)) {
              this.highestPow$.next({
                ...bestPowData,
                workerId
              });
            }
          }
          this.calculateHashRate(workerId, data.hashRate);
          this.progressSubject.next({ workerId, hashRate, bestPowData });
        } else if (type === "result") {
          this.result$.next(data.data);
          this.mining$.next(false);
          this.workers$.getValue().forEach((worker) => worker.terminate());
          this.successSubject.next({ result: this.result$.getValue() });
        } else if (type === "error") {
          console.error("Error from worker:", data.error);
          this.errorSubject.next({ error: data.error || "Unknown error from worker" });
        }
      }
      handleWorkerError(e) {
        console.error("Worker encountered an error:", e);
        const errorDetails = {
          message: e.message,
          error: e.error ? e.error.message : null
        };
        this.errorSubject.next({ error: JSON.stringify(errorDetails) });
      }
      prepareEvent() {
        const event = {
          pubkey: this.pubkey,
          kind: 1,
          tags: this.tags,
          content: this.content,
          created_at: Math.floor(Date.now() / 1e3)
        };
        return JSON.stringify(event);
      }
      calculateHashRate(workerId, hashRate) {
        if (!hashRate) return;
        let workerHashRates = this._workerHashRates.get(workerId) || [];
        workerHashRates.push(hashRate);
        if (workerHashRates.length > 11) {
          workerHashRates.shift();
        }
        this._workerHashRates.set(workerId, workerHashRates);
        this.recordMaxRate(workerId, hashRate);
        this.refreshHashRate();
      }
      async recordMaxRate(workerId, hashRate) {
        const maxHashRate = this._workerMaxHashRates.get(workerId);
        if (maxHashRate === void 0 || hashRate > maxHashRate) {
          this._workerMaxHashRates.set(workerId, Math.round(hashRate));
        }
      }
      averageHashRate(arr) {
        let sum = 0;
        for (let i = 0; i < arr.length; i++) {
          sum += arr[i];
        }
        return arr.length === 0 ? 0 : sum / arr.length;
      }
      refreshHashRate() {
        if (Date.now() - this.lastRefresh < this.REFRESH_EVERY_MS) {
          return;
        }
        let totalRate = 0;
        this._workerHashRates.forEach((hashRates) => {
          if (hashRates.length > 0) {
            totalRate += this.averageHashRate(hashRates);
          }
        });
        this._totalHashRate = Math.round(totalRate / 1e3);
        this._lastRefresh = Date.now();
      }
    };

    const user = writable({
      isAnon: true,
      pubkey: '',
      secret: ''
    });

    const events = writable({
      k0: {},
      k3: {},
      k10002: {}
    });

    const miningState = writable({
      mining: false,
      result: 'Waiting for worker to initialize...',
      relayStatus: '',
      hashRate: 0, 
      overallBestPow: null, 
      workersBestPow: [],
      publishSuccessNum: 0,
    });

    const relaySettings = writable({
      myRelaysVisible: false,
      powRelaysEnabled: true,
      myRelays: []
    });

    const contentState = writable({
      content: '',
      difficulty: 21,
      numberOfWorkers: navigator.hardwareConcurrency || 2
    });

    const POW_RELAYS = [
      'wss://nostr.bitcoiner.social',
      'wss://nostr.mom',
      'wss://nos.lol',
      'wss://powrelay.xyz',
      'wss://labour.fiatjaf.com/',
      'wss://nostr.lu.ke',
      'wss://140.f7z.io'
    ];

    const usub = new writable(null);

    const activeRelays = derived(
      relaySettings,
      ($relaySettings) => {
        let relays = [];
        if ($relaySettings.myRelays && $relaySettings.myRelays.length > 0) {
          relays.push(...$relaySettings.myRelays);
        }
        if ($relaySettings.powRelaysEnabled) {
          relays.push(...POW_RELAYS);
        }
        return relays;
      }
    );

    const powRelays = new readable(POW_RELAYS);

    const getPow = (hex) => {
      let count = 0;

      for (let i = 0; i < hex.length; i++) {
          const nibble = parseInt(hex[i], 16);
          if (nibble === 0) {
              count += 4;
          } else {
              count += Math.clz32(nibble) - 28;
              break;
          }
      }

      return count;
    };

    const verifyPow = (event) => {
      //console.log(event)
      const hash = getEventHash(event);
      const count = getPow(hash);
      const nonceTag = event.tags.find(tag => tag[0] === 'nonce');
      if (!nonceTag || nonceTag.length < 3) {
          return 0;
      }
      const targetDifficulty = parseInt(nonceTag[2], 10);
      return Math.min(count, targetDifficulty);
    };

    const pool = new SimplePool();

    const timeout = (promise, ms) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timeout")), ms);
      promise
        .then(value => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch(err => {
          clearTimeout(timer);
          reject(err);
        });
    });

    const publishEvent = async (ev) => {
      //console.log(ev);
      verifyPow(ev);
      //console.log('Publishing event:', ev);
      try {
        const { isAnon, secret } = get_store_value(user);
        if (isAnon) {
          ev = finalizeEvent(ev, secret);
        } else {
          ev = await window.nostr.signEvent(ev);
        }
        const isGood = verifyEvent(ev);
        if (!isGood) throw new Error('Event is not valid');

        const currentActiveRelays = get_store_value(activeRelays);
        const pubs = pool.publish(currentActiveRelays, ev).map(p => timeout(p, 10000));

        const results = await Promise.allSettled(pubs);
        const successCount = results.filter(result => result.status === 'fulfilled').length;

        miningState.update( m => ({...m, publishSuccessNum: successCount}) );

        //console.log(`Event published successfully to ${successCount} relays.`);
      } catch (error) {
        console.error('Error publishing event:', error);
      }
    };



    function setMyRelays(relays) {
      //console.log(`Setting my relays: ${relays}`);
      relaySettings.update(r => ({
        ...r,
        myRelays: Array.from(new Set([...r.myRelays, ...relays]))
      }));
    }

    function onK0(event){
      let profile;
      try {
          profile = JSON.parse(event.content);
          let photo; 
          if(profile?.photo) photo = profile.photo;
          else if(profile?.picture) photo = profile.picture;
          else if(profile?.avatar) photo = profile.avatar;
          user.update( u => ({...u, photo, name: profile.name  }) );
      }
      catch(e){
          console.error('Error parsing K0 content:', e);
      }
      //console.log('K0 profile:', profile)
      events.update( e => ({...e, k0: event}) );
    }

    function onK3(event){
      let relays = [];
      try{
          relays = Object.keys(JSON.parse(event.content));
      }
      catch(e){
          console.error('Error parsing K3 content:', e);
          console.warn('K3 content:', event.content);
      }
      
      //console.log('K3 relays:', relays)
      setMyRelays(relays);
      events.update( e => ({...e, k3: event}) ); 
    }

    function onK10002(event){
      const relays = event.tags.filter( t => t[0] === 'r' ).map( r => r[1] );
      //console.log('K10002 relays:', relays)
      setMyRelays(relays?.length? relays : []);
      events.update( e => ({...e, k10002: event}) ); 
    }

    function onevent(event){ 
      switch(event.kind){
          case 0:     return onK0(event)
          case 3:     return onK3(event)
          case 10002: return onK10002(event)
      }
    }

    function oneose(){ 
      try {
        const _usub = get_store_value(usub);
        _usub.close(); 
      }
      catch(e){
          console.warn('Error closing subscription:', e);
      }   
    }

    function onclose( resolve ){
      user.update( u => ({...u, isAnon: false}) );
      resolve();
    }

    /* src/App.svelte generated by Svelte v3.59.2 */

    const { Object: Object_1, console: console_1 } = globals;
    const file = "src/App.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[25] = list[i];
    	child_ctx[27] = i;
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[28] = list[i];
    	return child_ctx;
    }

    function get_each_context_2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[28] = list[i];
    	return child_ctx;
    }

    // (218:2) {#if $user.isAnon}
    function create_if_block_5(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("Login");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_5.name,
    		type: "if",
    		source: "(218:2) {#if $user.isAnon}",
    		ctx
    	});

    	return block;
    }

    // (221:2) {#if !$user.isAnon}
    function create_if_block_4(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("Logout");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_4.name,
    		type: "if",
    		source: "(221:2) {#if !$user.isAnon}",
    		ctx
    	});

    	return block;
    }

    // (278:2) {#if $relaySettings.myRelaysVisible}
    function create_if_block_1(ctx) {
    	let div;
    	let t0;
    	let br;
    	let t1;
    	let t2;
    	let strong;
    	let t4;
    	let ul;
    	let if_block0 = /*$relaySettings*/ ctx[2].myRelays.length > 0 && create_if_block_3(ctx);
    	let if_block1 = /*$relaySettings*/ ctx[2].myRelays.length > 0 && create_if_block_2(ctx);
    	let each_value_1 = /*$powRelays*/ ctx[3];
    	validate_each_argument(each_value_1);
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	const block = {
    		c: function create() {
    			div = element("div");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			br = element("br");
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			strong = element("strong");
    			strong.textContent = "POW Relays:";
    			t4 = space();
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			add_location(br, file, 287, 6, 7061);
    			add_location(strong, file, 291, 6, 7211);
    			attr_dev(ul, "class", "svelte-1qw1mb0");
    			add_location(ul, file, 292, 6, 7247);
    			attr_dev(div, "id", "relaysContainer");
    			attr_dev(div, "class", "svelte-1qw1mb0");
    			add_location(div, file, 278, 4, 6820);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			if (if_block0) if_block0.m(div, null);
    			append_dev(div, t0);
    			append_dev(div, br);
    			append_dev(div, t1);
    			if (if_block1) if_block1.m(div, null);
    			append_dev(div, t2);
    			append_dev(div, strong);
    			append_dev(div, t4);
    			append_dev(div, ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(ul, null);
    				}
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (/*$relaySettings*/ ctx[2].myRelays.length > 0) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_3(ctx);
    					if_block0.c();
    					if_block0.m(div, t0);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*$relaySettings*/ ctx[2].myRelays.length > 0) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_2(ctx);
    					if_block1.c();
    					if_block1.m(div, t2);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (dirty[0] & /*$powRelays*/ 8) {
    				each_value_1 = /*$powRelays*/ ctx[3];
    				validate_each_argument(each_value_1);
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(ul, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(278:2) {#if $relaySettings.myRelaysVisible}",
    		ctx
    	});

    	return block;
    }

    // (280:6) {#if $relaySettings.myRelays.length > 0}
    function create_if_block_3(ctx) {
    	let strong;
    	let t1;
    	let ul;
    	let each_value_2 = /*$relaySettings*/ ctx[2].myRelays;
    	validate_each_argument(each_value_2);
    	let each_blocks = [];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		each_blocks[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
    	}

    	const block = {
    		c: function create() {
    			strong = element("strong");
    			strong.textContent = "My Relays:";
    			t1 = space();
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			add_location(strong, file, 280, 6, 6900);
    			attr_dev(ul, "class", "svelte-1qw1mb0");
    			add_location(ul, file, 281, 6, 6934);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, strong, anchor);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, ul, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(ul, null);
    				}
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*$relaySettings*/ 4) {
    				each_value_2 = /*$relaySettings*/ ctx[2].myRelays;
    				validate_each_argument(each_value_2);
    				let i;

    				for (i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2(ctx, each_value_2, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_2(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(ul, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_2.length;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(strong);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(ul);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3.name,
    		type: "if",
    		source: "(280:6) {#if $relaySettings.myRelays.length > 0}",
    		ctx
    	});

    	return block;
    }

    // (283:8) {#each $relaySettings.myRelays as relay}
    function create_each_block_2(ctx) {
    	let li;
    	let t_value = /*relay*/ ctx[28] + "";
    	let t;

    	const block = {
    		c: function create() {
    			li = element("li");
    			t = text(t_value);
    			attr_dev(li, "class", "svelte-1qw1mb0");
    			add_location(li, file, 283, 10, 6998);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			append_dev(li, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*$relaySettings*/ 4 && t_value !== (t_value = /*relay*/ ctx[28] + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_2.name,
    		type: "each",
    		source: "(283:8) {#each $relaySettings.myRelays as relay}",
    		ctx
    	});

    	return block;
    }

    // (289:6) {#if $relaySettings.myRelays.length > 0}
    function create_if_block_2(ctx) {
    	let input;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			input = element("input");
    			attr_dev(input, "type", "checkbox");
    			add_location(input, file, 289, 6, 7121);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, input, anchor);
    			input.checked = /*$relaySettings*/ ctx[2].powRelaysEnabled;

    			if (!mounted) {
    				dispose = listen_dev(input, "change", /*input_change_handler*/ ctx[10]);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*$relaySettings*/ 4) {
    				input.checked = /*$relaySettings*/ ctx[2].powRelaysEnabled;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(input);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(289:6) {#if $relaySettings.myRelays.length > 0}",
    		ctx
    	});

    	return block;
    }

    // (294:8) {#each $powRelays as relay}
    function create_each_block_1(ctx) {
    	let li;
    	let t_value = /*relay*/ ctx[28] + "";
    	let t;

    	const block = {
    		c: function create() {
    			li = element("li");
    			t = text(t_value);
    			attr_dev(li, "class", "svelte-1qw1mb0");
    			add_location(li, file, 294, 10, 7298);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			append_dev(li, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*$powRelays*/ 8 && t_value !== (t_value = /*relay*/ ctx[28] + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1.name,
    		type: "each",
    		source: "(294:8) {#each $powRelays as relay}",
    		ctx
    	});

    	return block;
    }

    // (343:2) {#each $miningState.workersBestPow as worker, key}
    function create_each_block(ctx) {
    	let t0;
    	let t1;
    	let t2;
    	let t3_value = /*worker*/ ctx[25].bestPow + "";
    	let t3;
    	let t4;
    	let t5_value = /*worker*/ ctx[25].nonce + "";
    	let t5;
    	let t6;
    	let t7_value = /*worker*/ ctx[25].hash + "";
    	let t7;
    	let t8;
    	let br;

    	const block = {
    		c: function create() {
    			t0 = text("Miner #");
    			t1 = text(/*key*/ ctx[27]);
    			t2 = text(": Best PoW: ");
    			t3 = text(t3_value);
    			t4 = text(" (Nonce: ");
    			t5 = text(t5_value);
    			t6 = text(" Hash: ");
    			t7 = text(t7_value);
    			t8 = text(" ) ");
    			br = element("br");
    			add_location(br, file, 343, 90, 8350);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t0, anchor);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, t2, anchor);
    			insert_dev(target, t3, anchor);
    			insert_dev(target, t4, anchor);
    			insert_dev(target, t5, anchor);
    			insert_dev(target, t6, anchor);
    			insert_dev(target, t7, anchor);
    			insert_dev(target, t8, anchor);
    			insert_dev(target, br, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*$miningState*/ 32 && t3_value !== (t3_value = /*worker*/ ctx[25].bestPow + "")) set_data_dev(t3, t3_value);
    			if (dirty[0] & /*$miningState*/ 32 && t5_value !== (t5_value = /*worker*/ ctx[25].nonce + "")) set_data_dev(t5, t5_value);
    			if (dirty[0] & /*$miningState*/ 32 && t7_value !== (t7_value = /*worker*/ ctx[25].hash + "")) set_data_dev(t7, t7_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(t2);
    			if (detaching) detach_dev(t3);
    			if (detaching) detach_dev(t4);
    			if (detaching) detach_dev(t5);
    			if (detaching) detach_dev(t6);
    			if (detaching) detach_dev(t7);
    			if (detaching) detach_dev(t8);
    			if (detaching) detach_dev(br);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(343:2) {#each $miningState.workersBestPow as worker, key}",
    		ctx
    	});

    	return block;
    }

    // (352:2) {:else}
    function create_else_block(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("No PoW results yet.");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		p: noop$1,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(352:2) {:else}",
    		ctx
    	});

    	return block;
    }

    // (350:2) {#if $miningState.overallBestPow && typeof $miningState.overallBestPow.bestPow === 'number'}
    function create_if_block(ctx) {
    	let t_value = JSON.stringify(/*$miningState*/ ctx[5].overallBestPow, null, 2) + "";
    	let t;

    	const block = {
    		c: function create() {
    			t = text(t_value);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*$miningState*/ 32 && t_value !== (t_value = JSON.stringify(/*$miningState*/ ctx[5].overallBestPow, null, 2) + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(350:2) {#if $miningState.overallBestPow && typeof $miningState.overallBestPow.bestPow === 'number'}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let h1;
    	let code;
    	let t1;
    	let p;
    	let t2;
    	let strong;
    	let t4;
    	let t5;
    	let button0;
    	let t6;
    	let t7;
    	let button1;
    	let t9;
    	let button2;
    	let t11;
    	let button3;
    	let t13;
    	let button4;
    	let t15;
    	let div;
    	let t16;
    	let img;
    	let img_src_value;
    	let t17;
    	let span;
    	let t18_value = (/*$user*/ ctx[1].isAnon ? 'anon' : /*$user*/ ctx[1].name) + "";
    	let t18;
    	let t19;
    	let small;
    	let t21;
    	let t22;
    	let textarea;
    	let t23;
    	let br0;
    	let br1;
    	let t24;
    	let label0;
    	let t26;
    	let input0;
    	let t27;
    	let br2;
    	let br3;
    	let t28;
    	let label1;
    	let t30;
    	let input1;
    	let t31;
    	let br4;
    	let br5;
    	let t32;
    	let button5;
    	let t33;
    	let button5_disabled_value;
    	let t34;
    	let button6;
    	let t35;
    	let button6_disabled_value;
    	let t36;
    	let h20;
    	let t38;
    	let pre0;
    	let t39_value = /*$miningState*/ ctx[5].hashRate.toFixed(2) + "";
    	let t39;
    	let t40;
    	let t41;
    	let h21;
    	let t43;
    	let pre1;
    	let t44;
    	let t45;
    	let t46;
    	let h22;
    	let t48;
    	let pre2;
    	let t49;
    	let t50;
    	let t51;
    	let h23;
    	let t53;
    	let pre3;
    	let t54_value = /*$miningState*/ ctx[5].result + "";
    	let t54;
    	let t55;
    	let h24;
    	let t57;
    	let pre4;
    	let t58_value = /*$miningState*/ ctx[5].relayStatus + "";
    	let t58;
    	let t59;
    	let t60_value = JSON.stringify(/*$activeRelays*/ ctx[0]) + "";
    	let t60;
    	let mounted;
    	let dispose;
    	let if_block0 = /*$user*/ ctx[1].isAnon && create_if_block_5(ctx);
    	let if_block1 = !/*$user*/ ctx[1].isAnon && create_if_block_4(ctx);
    	let if_block2 = /*$relaySettings*/ ctx[2].myRelaysVisible && create_if_block_1(ctx);
    	let each_value = /*$miningState*/ ctx[5].workersBestPow;
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	function select_block_type(ctx, dirty) {
    		if (/*$miningState*/ ctx[5].overallBestPow && typeof /*$miningState*/ ctx[5].overallBestPow.bestPow === 'number') return create_if_block;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block3 = current_block_type(ctx);

    	const block = {
    		c: function create() {
    			h1 = element("h1");
    			code = element("code");
    			code.textContent = "note⛏️";
    			t1 = space();
    			p = element("p");
    			t2 = text("This is a demo of ");
    			strong = element("strong");
    			strong.textContent = "Notemine";
    			t4 = text(", a wasm Nostr note miner written in Rust.");
    			t5 = space();
    			button0 = element("button");
    			if (if_block0) if_block0.c();
    			t6 = space();
    			if (if_block1) if_block1.c();
    			t7 = space();
    			button1 = element("button");
    			button1.textContent = "⚡️ zap me";
    			t9 = space();
    			button2 = element("button");
    			button2.textContent = "🍻 follow";
    			t11 = space();
    			button3 = element("button");
    			button3.textContent = "🤖 git";
    			t13 = space();
    			button4 = element("button");
    			button4.textContent = "📦️ crate";
    			t15 = space();
    			div = element("div");
    			t16 = text("posting as: \n  \n  ");
    			img = element("img");
    			t17 = space();
    			span = element("span");
    			t18 = text(t18_value);
    			t19 = space();
    			small = element("small");
    			small.textContent = "(relays)";
    			t21 = space();
    			if (if_block2) if_block2.c();
    			t22 = space();
    			textarea = element("textarea");
    			t23 = space();
    			br0 = element("br");
    			br1 = element("br");
    			t24 = space();
    			label0 = element("label");
    			label0.textContent = "Difficulty:";
    			t26 = space();
    			input0 = element("input");
    			t27 = space();
    			br2 = element("br");
    			br3 = element("br");
    			t28 = space();
    			label1 = element("label");
    			label1.textContent = "# of workers:";
    			t30 = space();
    			input1 = element("input");
    			t31 = space();
    			br4 = element("br");
    			br5 = element("br");
    			t32 = space();
    			button5 = element("button");
    			t33 = text("Mine & Publish");
    			t34 = space();
    			button6 = element("button");
    			t35 = text("Cancel Mining");
    			t36 = space();
    			h20 = element("h2");
    			h20.textContent = "Hash Rate:";
    			t38 = space();
    			pre0 = element("pre");
    			t39 = text(t39_value);
    			t40 = text(" kH/s");
    			t41 = space();
    			h21 = element("h2");
    			h21.textContent = "Worker Overview:";
    			t43 = space();
    			pre1 = element("pre");
    			t44 = text("  ");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t45 = text("\n");
    			t46 = space();
    			h22 = element("h2");
    			h22.textContent = "Best PoW:";
    			t48 = space();
    			pre2 = element("pre");
    			t49 = text("  ");
    			if_block3.c();
    			t50 = text("\n");
    			t51 = space();
    			h23 = element("h2");
    			h23.textContent = "Result:";
    			t53 = space();
    			pre3 = element("pre");
    			t54 = text(t54_value);
    			t55 = space();
    			h24 = element("h2");
    			h24.textContent = "Relay Status:";
    			t57 = space();
    			pre4 = element("pre");
    			t58 = text(t58_value);
    			t59 = space();
    			t60 = text(t60_value);
    			add_location(code, file, 213, 4, 5026);
    			add_location(h1, file, 213, 0, 5022);
    			add_location(strong, file, 214, 21, 5072);
    			add_location(p, file, 214, 0, 5051);
    			attr_dev(button0, "class", "svelte-1qw1mb0");
    			add_location(button0, file, 216, 0, 5145);
    			attr_dev(button1, "data-npub", "npub1uac67zc9er54ln0kl6e4qp2y6ta3enfcg7ywnayshvlw9r5w6ehsqq99rx");
    			attr_dev(button1, "data-relays", "wss://relay.damus.io,wss://relay.snort.social,wss://nos.lol,wss://nostr.fmt.wiz.biz,wss://nostr.mutinywallet.com,wss://nostr.mywire.org,wss://relay.primal.net");
    			attr_dev(button1, "style", "inline-block");
    			attr_dev(button1, "class", "svelte-1qw1mb0");
    			add_location(button1, file, 225, 0, 5267);
    			attr_dev(button2, "onclick", "document.location.href='https://njump.me/nprofile1qythwumn8ghj7un9d3shjtnswf5k6ctv9ehx2ap0qy88wumn8ghj7mn0wvhxcmmv9uq3samnwvaz7tmwdaehgu3wvekhgtnhd9azucnf0ghsqg88wxhskpwga90umah7kdgq23xjlvwv6wz83r5lfy9m8m3garkkdusz5s2r'");
    			set_style(button2, "display", "inline-block");
    			set_style(button2, "cursor", "pointer");
    			attr_dev(button2, "class", "svelte-1qw1mb0");
    			add_location(button2, file, 233, 0, 5578);
    			attr_dev(button3, "onclick", "document.location.href='https://github.com/sandwichfarm/minnote-wasm'");
    			set_style(button3, "display", "inline-block");
    			set_style(button3, "cursor", "pointer");
    			attr_dev(button3, "class", "svelte-1qw1mb0");
    			add_location(button3, file, 240, 0, 5895);
    			attr_dev(button4, "onclick", "document.location.href='https://crates.io/crates/notemine'");
    			set_style(button4, "display", "inline-block");
    			set_style(button4, "cursor", "pointer");
    			attr_dev(button4, "class", "svelte-1qw1mb0");
    			add_location(button4, file, 247, 0, 6059);
    			attr_dev(img, "id", "userPhoto");
    			attr_dev(img, "width", "20");
    			attr_dev(img, "height", "20");

    			if (!src_url_equal(img.src, img_src_value = /*$user*/ ctx[1].isAnon
    			? '/img/anon.svg'
    			: /*$user*/ ctx[1].photo)) attr_dev(img, "src", img_src_value);

    			attr_dev(img, "alt", "User Photo");
    			add_location(img, file, 257, 2, 6296);
    			attr_dev(span, "id", "userName");
    			add_location(span, file, 264, 2, 6441);
    			attr_dev(small, "id", "relaysToggle");
    			set_style(small, "cursor", "pointer");
    			set_style(small, "color", "#333");
    			attr_dev(small, "tabindex", "0");
    			add_location(small, file, 268, 2, 6627);
    			attr_dev(div, "id", "user");
    			attr_dev(div, "class", "svelte-1qw1mb0");
    			add_location(div, file, 254, 0, 6215);
    			attr_dev(textarea, "id", "eventInput");
    			attr_dev(textarea, "rows", "10");
    			attr_dev(textarea, "placeholder", "140 characters or less.");
    			attr_dev(textarea, "maxlength", "140");
    			attr_dev(textarea, "class", "svelte-1qw1mb0");
    			add_location(textarea, file, 301, 0, 7370);
    			add_location(br0, file, 309, 0, 7524);
    			add_location(br1, file, 309, 4, 7528);
    			attr_dev(label0, "for", "difficulty");
    			add_location(label0, file, 311, 0, 7534);
    			attr_dev(input0, "type", "number");
    			attr_dev(input0, "id", "difficulty");
    			attr_dev(input0, "min", "1");
    			attr_dev(input0, "class", "svelte-1qw1mb0");
    			add_location(input0, file, 312, 0, 7578);
    			add_location(br2, file, 318, 0, 7676);
    			add_location(br3, file, 318, 4, 7680);
    			attr_dev(label1, "for", "numberOfWorkers");
    			add_location(label1, file, 320, 0, 7686);
    			attr_dev(input1, "type", "number");
    			attr_dev(input1, "id", "numberOfWorkers");
    			attr_dev(input1, "min", "1");
    			attr_dev(input1, "max", navigator.hardwareConcurrency);
    			attr_dev(input1, "class", "svelte-1qw1mb0");
    			add_location(input1, file, 321, 0, 7737);
    			add_location(br4, file, 328, 0, 7884);
    			add_location(br5, file, 328, 4, 7888);
    			button5.disabled = button5_disabled_value = /*$miningState*/ ctx[5].mining;
    			attr_dev(button5, "class", "svelte-1qw1mb0");
    			add_location(button5, file, 330, 0, 7894);
    			button6.disabled = button6_disabled_value = !/*$miningState*/ ctx[5].mining;
    			attr_dev(button6, "class", "svelte-1qw1mb0");
    			add_location(button6, file, 333, 0, 7985);
    			add_location(h20, file, 337, 0, 8075);
    			attr_dev(pre0, "id", "hashrate");
    			attr_dev(pre0, "class", "svelte-1qw1mb0");
    			add_location(pre0, file, 338, 0, 8095);
    			add_location(h21, file, 340, 0, 8161);
    			attr_dev(pre1, "id", "hashrate");
    			attr_dev(pre1, "class", "svelte-1qw1mb0");
    			add_location(pre1, file, 341, 0, 8187);
    			add_location(h22, file, 347, 0, 8375);
    			attr_dev(pre2, "id", "overallBestPow");
    			attr_dev(pre2, "class", "svelte-1qw1mb0");
    			add_location(pre2, file, 348, 0, 8394);
    			add_location(h23, file, 356, 0, 8624);
    			attr_dev(pre3, "id", "result");
    			attr_dev(pre3, "class", "svelte-1qw1mb0");
    			add_location(pre3, file, 357, 0, 8641);
    			add_location(h24, file, 359, 0, 8687);
    			attr_dev(pre4, "id", "relayStatus");
    			attr_dev(pre4, "class", "svelte-1qw1mb0");
    			add_location(pre4, file, 360, 0, 8710);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h1, anchor);
    			append_dev(h1, code);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, p, anchor);
    			append_dev(p, t2);
    			append_dev(p, strong);
    			append_dev(p, t4);
    			insert_dev(target, t5, anchor);
    			insert_dev(target, button0, anchor);
    			if (if_block0) if_block0.m(button0, null);
    			append_dev(button0, t6);
    			if (if_block1) if_block1.m(button0, null);
    			insert_dev(target, t7, anchor);
    			insert_dev(target, button1, anchor);
    			insert_dev(target, t9, anchor);
    			insert_dev(target, button2, anchor);
    			insert_dev(target, t11, anchor);
    			insert_dev(target, button3, anchor);
    			insert_dev(target, t13, anchor);
    			insert_dev(target, button4, anchor);
    			insert_dev(target, t15, anchor);
    			insert_dev(target, div, anchor);
    			append_dev(div, t16);
    			append_dev(div, img);
    			append_dev(div, t17);
    			append_dev(div, span);
    			append_dev(span, t18);
    			append_dev(div, t19);
    			append_dev(div, small);
    			append_dev(div, t21);
    			if (if_block2) if_block2.m(div, null);
    			insert_dev(target, t22, anchor);
    			insert_dev(target, textarea, anchor);
    			set_input_value(textarea, /*$contentState*/ ctx[4].content);
    			insert_dev(target, t23, anchor);
    			insert_dev(target, br0, anchor);
    			insert_dev(target, br1, anchor);
    			insert_dev(target, t24, anchor);
    			insert_dev(target, label0, anchor);
    			insert_dev(target, t26, anchor);
    			insert_dev(target, input0, anchor);
    			set_input_value(input0, /*$contentState*/ ctx[4].difficulty);
    			insert_dev(target, t27, anchor);
    			insert_dev(target, br2, anchor);
    			insert_dev(target, br3, anchor);
    			insert_dev(target, t28, anchor);
    			insert_dev(target, label1, anchor);
    			insert_dev(target, t30, anchor);
    			insert_dev(target, input1, anchor);
    			set_input_value(input1, /*$contentState*/ ctx[4].numberOfWorkers);
    			insert_dev(target, t31, anchor);
    			insert_dev(target, br4, anchor);
    			insert_dev(target, br5, anchor);
    			insert_dev(target, t32, anchor);
    			insert_dev(target, button5, anchor);
    			append_dev(button5, t33);
    			insert_dev(target, t34, anchor);
    			insert_dev(target, button6, anchor);
    			append_dev(button6, t35);
    			insert_dev(target, t36, anchor);
    			insert_dev(target, h20, anchor);
    			insert_dev(target, t38, anchor);
    			insert_dev(target, pre0, anchor);
    			append_dev(pre0, t39);
    			append_dev(pre0, t40);
    			insert_dev(target, t41, anchor);
    			insert_dev(target, h21, anchor);
    			insert_dev(target, t43, anchor);
    			insert_dev(target, pre1, anchor);
    			append_dev(pre1, t44);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(pre1, null);
    				}
    			}

    			append_dev(pre1, t45);
    			insert_dev(target, t46, anchor);
    			insert_dev(target, h22, anchor);
    			insert_dev(target, t48, anchor);
    			insert_dev(target, pre2, anchor);
    			append_dev(pre2, t49);
    			if_block3.m(pre2, null);
    			append_dev(pre2, t50);
    			insert_dev(target, t51, anchor);
    			insert_dev(target, h23, anchor);
    			insert_dev(target, t53, anchor);
    			insert_dev(target, pre3, anchor);
    			append_dev(pre3, t54);
    			insert_dev(target, t55, anchor);
    			insert_dev(target, h24, anchor);
    			insert_dev(target, t57, anchor);
    			insert_dev(target, pre4, anchor);
    			append_dev(pre4, t58);
    			insert_dev(target, t59, anchor);
    			insert_dev(target, t60, anchor);

    			if (!mounted) {
    				dispose = [
    					listen_dev(button0, "click", /*toggleAuth*/ ctx[6], false, false, false, false),
    					listen_dev(small, "click", /*toggleRelays*/ ctx[7], false, false, false, false),
    					listen_dev(textarea, "input", /*textarea_input_handler*/ ctx[11]),
    					listen_dev(input0, "input", /*input0_input_handler*/ ctx[12]),
    					listen_dev(input1, "input", /*input1_input_handler*/ ctx[13]),
    					listen_dev(button5, "click", /*startMining*/ ctx[8], false, false, false, false),
    					listen_dev(button6, "click", /*stopMining*/ ctx[9], false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (/*$user*/ ctx[1].isAnon) {
    				if (if_block0) ; else {
    					if_block0 = create_if_block_5(ctx);
    					if_block0.c();
    					if_block0.m(button0, t6);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (!/*$user*/ ctx[1].isAnon) {
    				if (if_block1) ; else {
    					if_block1 = create_if_block_4(ctx);
    					if_block1.c();
    					if_block1.m(button0, null);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (dirty[0] & /*$user*/ 2 && !src_url_equal(img.src, img_src_value = /*$user*/ ctx[1].isAnon
    			? '/img/anon.svg'
    			: /*$user*/ ctx[1].photo)) {
    				attr_dev(img, "src", img_src_value);
    			}

    			if (dirty[0] & /*$user*/ 2 && t18_value !== (t18_value = (/*$user*/ ctx[1].isAnon ? 'anon' : /*$user*/ ctx[1].name) + "")) set_data_dev(t18, t18_value);

    			if (/*$relaySettings*/ ctx[2].myRelaysVisible) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);
    				} else {
    					if_block2 = create_if_block_1(ctx);
    					if_block2.c();
    					if_block2.m(div, null);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}

    			if (dirty[0] & /*$contentState*/ 16) {
    				set_input_value(textarea, /*$contentState*/ ctx[4].content);
    			}

    			if (dirty[0] & /*$contentState*/ 16 && to_number(input0.value) !== /*$contentState*/ ctx[4].difficulty) {
    				set_input_value(input0, /*$contentState*/ ctx[4].difficulty);
    			}

    			if (dirty[0] & /*$contentState*/ 16 && to_number(input1.value) !== /*$contentState*/ ctx[4].numberOfWorkers) {
    				set_input_value(input1, /*$contentState*/ ctx[4].numberOfWorkers);
    			}

    			if (dirty[0] & /*$miningState*/ 32 && button5_disabled_value !== (button5_disabled_value = /*$miningState*/ ctx[5].mining)) {
    				prop_dev(button5, "disabled", button5_disabled_value);
    			}

    			if (dirty[0] & /*$miningState*/ 32 && button6_disabled_value !== (button6_disabled_value = !/*$miningState*/ ctx[5].mining)) {
    				prop_dev(button6, "disabled", button6_disabled_value);
    			}

    			if (dirty[0] & /*$miningState*/ 32 && t39_value !== (t39_value = /*$miningState*/ ctx[5].hashRate.toFixed(2) + "")) set_data_dev(t39, t39_value);

    			if (dirty[0] & /*$miningState*/ 32) {
    				each_value = /*$miningState*/ ctx[5].workersBestPow;
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(pre1, t45);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block3) {
    				if_block3.p(ctx, dirty);
    			} else {
    				if_block3.d(1);
    				if_block3 = current_block_type(ctx);

    				if (if_block3) {
    					if_block3.c();
    					if_block3.m(pre2, t50);
    				}
    			}

    			if (dirty[0] & /*$miningState*/ 32 && t54_value !== (t54_value = /*$miningState*/ ctx[5].result + "")) set_data_dev(t54, t54_value);
    			if (dirty[0] & /*$miningState*/ 32 && t58_value !== (t58_value = /*$miningState*/ ctx[5].relayStatus + "")) set_data_dev(t58, t58_value);
    			if (dirty[0] & /*$activeRelays*/ 1 && t60_value !== (t60_value = JSON.stringify(/*$activeRelays*/ ctx[0]) + "")) set_data_dev(t60, t60_value);
    		},
    		i: noop$1,
    		o: noop$1,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h1);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(p);
    			if (detaching) detach_dev(t5);
    			if (detaching) detach_dev(button0);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (detaching) detach_dev(t7);
    			if (detaching) detach_dev(button1);
    			if (detaching) detach_dev(t9);
    			if (detaching) detach_dev(button2);
    			if (detaching) detach_dev(t11);
    			if (detaching) detach_dev(button3);
    			if (detaching) detach_dev(t13);
    			if (detaching) detach_dev(button4);
    			if (detaching) detach_dev(t15);
    			if (detaching) detach_dev(div);
    			if (if_block2) if_block2.d();
    			if (detaching) detach_dev(t22);
    			if (detaching) detach_dev(textarea);
    			if (detaching) detach_dev(t23);
    			if (detaching) detach_dev(br0);
    			if (detaching) detach_dev(br1);
    			if (detaching) detach_dev(t24);
    			if (detaching) detach_dev(label0);
    			if (detaching) detach_dev(t26);
    			if (detaching) detach_dev(input0);
    			if (detaching) detach_dev(t27);
    			if (detaching) detach_dev(br2);
    			if (detaching) detach_dev(br3);
    			if (detaching) detach_dev(t28);
    			if (detaching) detach_dev(label1);
    			if (detaching) detach_dev(t30);
    			if (detaching) detach_dev(input1);
    			if (detaching) detach_dev(t31);
    			if (detaching) detach_dev(br4);
    			if (detaching) detach_dev(br5);
    			if (detaching) detach_dev(t32);
    			if (detaching) detach_dev(button5);
    			if (detaching) detach_dev(t34);
    			if (detaching) detach_dev(button6);
    			if (detaching) detach_dev(t36);
    			if (detaching) detach_dev(h20);
    			if (detaching) detach_dev(t38);
    			if (detaching) detach_dev(pre0);
    			if (detaching) detach_dev(t41);
    			if (detaching) detach_dev(h21);
    			if (detaching) detach_dev(t43);
    			if (detaching) detach_dev(pre1);
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(t46);
    			if (detaching) detach_dev(h22);
    			if (detaching) detach_dev(t48);
    			if (detaching) detach_dev(pre2);
    			if_block3.d();
    			if (detaching) detach_dev(t51);
    			if (detaching) detach_dev(h23);
    			if (detaching) detach_dev(t53);
    			if (detaching) detach_dev(pre3);
    			if (detaching) detach_dev(t55);
    			if (detaching) detach_dev(h24);
    			if (detaching) detach_dev(t57);
    			if (detaching) detach_dev(pre4);
    			if (detaching) detach_dev(t59);
    			if (detaching) detach_dev(t60);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let $activeRelays;
    	let $usub;
    	let $user;
    	let $relaySettings;
    	let $powRelays;
    	let $contentState;
    	let $miningState;
    	validate_store(activeRelays, 'activeRelays');
    	component_subscribe($$self, activeRelays, $$value => $$invalidate(0, $activeRelays = $$value));
    	validate_store(usub, 'usub');
    	component_subscribe($$self, usub, $$value => $$invalidate(20, $usub = $$value));
    	validate_store(user, 'user');
    	component_subscribe($$self, user, $$value => $$invalidate(1, $user = $$value));
    	validate_store(relaySettings, 'relaySettings');
    	component_subscribe($$self, relaySettings, $$value => $$invalidate(2, $relaySettings = $$value));
    	validate_store(powRelays, 'powRelays');
    	component_subscribe($$self, powRelays, $$value => $$invalidate(3, $powRelays = $$value));
    	validate_store(contentState, 'contentState');
    	component_subscribe($$self, contentState, $$value => $$invalidate(4, $contentState = $$value));
    	validate_store(miningState, 'miningState');
    	component_subscribe($$self, miningState, $$value => $$invalidate(5, $miningState = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('App', slots, []);
    	let notemine;
    	let progressSub, successSub, errorSub, bestPowSub, workersPowSub;

    	function authAnon() {
    		const newSecret = generateSecretKey();

    		user.set({
    			isAnon: true,
    			secret: newSecret,
    			pubkey: getPublicKey(newSecret)
    		});

    		relaySettings.update(r => ({ ...r, myRelays: [] }));
    	}

    	async function authUser() {
    		try {
    			const pubkey = await window.nostr.getPublicKey();
    			const isAnon = false;
    			const secret = '';
    			user.set({ isAnon, pubkey, secret });
    			await getUserData();
    		} catch(error) {
    			console.error('Authentication failed:', error);
    		}
    	}

    	function toggleAuth() {
    		const currentUser = get_store_value(user);

    		if (currentUser.isAnon) {
    			authUser();
    		} else {
    			authAnon();
    		}
    	}

    	function toggleRelays() {
    		relaySettings.update(r => ({
    			...r,
    			myRelaysVisible: !r.myRelaysVisible
    		}));
    	}

    	async function getUserData() {
    		const currentUser = get_store_value(user);

    		return new Promise(async (resolve, reject) => {
    				set_store_value(
    					usub,
    					$usub = pool.subscribeMany(
    						['wss://purplepag.es', 'wss://user.kindpag.es'],
    						[
    							{
    								kinds: [0, 3, 10002],
    								authors: [currentUser.pubkey]
    							}
    						],
    						{
    							onevent,
    							oneose,
    							onclose: onclose(resolve)
    						}
    					),
    					$usub
    				);
    			});
    	}

    	async function startMining() {
    		const currentUser = get_store_value(user);
    		const currentContent = get_store_value(contentState);

    		if (!currentUser.pubkey || !currentContent.content.trim()) {
    			alert('Please fill in all required fields.');
    			return;
    		}

    		resetMiningState();
    		miningState.update(m => ({ ...m, mining: true }));

    		notemine = new Notemine({
    				content: currentContent.content,
    				pubkey: currentUser.pubkey,
    				difficulty: currentContent.difficulty,
    				numberOfWorkers: currentContent.numberOfWorkers
    			});

    		workersPowSub = notemine.workersPow$.subscribe(data => {
    			miningState.update(m => {
    				const workersBestPow = Object.values(data);
    				return { ...m, workersBestPow };
    			});
    		});

    		bestPowSub = notemine.highestPow$.subscribe(data => {
    			miningState.update(m => {
    				const overallBestPow = data;
    				return { ...m, overallBestPow };
    			});
    		});

    		progressSub = notemine.progress$.subscribe(() => {
    			miningState.update(m => {
    				const overallBestPow = m.overallBestPow;
    				const hashRate = notemine.totalHashRate;
    				return { ...m, overallBestPow, hashRate };
    			});
    		});

    		successSub = notemine.success$.subscribe(async ({ result: minedResult }) => {
    			// const currentActiveRelays = get(activeRelays);
    			// //console.log(`currentActiveRelays: ${$activeRelays}`);
    			miningState.update(m => ({
    				...m,
    				mining: false,
    				result: minedResult
    				? JSON.stringify(minedResult, null, 2)
    				: 'No result received.'
    			}));

    			await publishEvent(minedResult.event);

    			miningState.update(m => ({
    				...m,
    				relayStatus: `Published to relays: ${$activeRelays.join(', ')}`
    			}));
    		});

    		errorSub = notemine.error$.subscribe(({ error }) => {
    			console.error('Mining error:', error);

    			miningState.update(m => ({
    				...m,
    				mining: false,
    				result: `Error: ${error}`
    			}));
    		});

    		await notemine.mine();
    		console.log('All workers mining.');
    	}

    	const resetMiningState = () => {
    		miningState.update(m => ({
    			...m,
    			mining: false,
    			result: '',
    			relayStatus: '',
    			hashRate: 0,
    			overallBestPow: null,
    			publishSuccessNum: 0
    		}));
    	};

    	function stopMining() {
    		if (notemine) {
    			notemine.cancel();
    			resetMiningState();
    		}
    	}

    	onMount(() => {
    		authAnon();
    	});

    	onDestroy(() => {
    		progressSub && progressSub.unsubscribe();
    		successSub && successSub.unsubscribe();
    		errorSub && errorSub.unsubscribe();

    		if (notemine && get_store_value(miningState).mining) {
    			notemine.cancel();
    		}
    	});

    	const writable_props = [];

    	Object_1.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	function input_change_handler() {
    		$relaySettings.powRelaysEnabled = this.checked;
    		relaySettings.set($relaySettings);
    	}

    	function textarea_input_handler() {
    		$contentState.content = this.value;
    		contentState.set($contentState);
    	}

    	function input0_input_handler() {
    		$contentState.difficulty = to_number(this.value);
    		contentState.set($contentState);
    	}

    	function input1_input_handler() {
    		$contentState.numberOfWorkers = to_number(this.value);
    		contentState.set($contentState);
    	}

    	$$self.$capture_state = () => ({
    		writable,
    		derived,
    		get: get_store_value,
    		generateSecretKey,
    		getPublicKey,
    		onMount,
    		onDestroy,
    		Notemine,
    		user,
    		relaySettings,
    		miningState,
    		contentState,
    		activeRelays,
    		usub,
    		powRelays,
    		publishEvent,
    		pool,
    		onevent,
    		oneose,
    		onclose,
    		notemine,
    		progressSub,
    		successSub,
    		errorSub,
    		bestPowSub,
    		workersPowSub,
    		authAnon,
    		authUser,
    		toggleAuth,
    		toggleRelays,
    		getUserData,
    		startMining,
    		resetMiningState,
    		stopMining,
    		$activeRelays,
    		$usub,
    		$user,
    		$relaySettings,
    		$powRelays,
    		$contentState,
    		$miningState
    	});

    	$$self.$inject_state = $$props => {
    		if ('notemine' in $$props) notemine = $$props.notemine;
    		if ('progressSub' in $$props) progressSub = $$props.progressSub;
    		if ('successSub' in $$props) successSub = $$props.successSub;
    		if ('errorSub' in $$props) errorSub = $$props.errorSub;
    		if ('bestPowSub' in $$props) bestPowSub = $$props.bestPowSub;
    		if ('workersPowSub' in $$props) workersPowSub = $$props.workersPowSub;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		$activeRelays,
    		$user,
    		$relaySettings,
    		$powRelays,
    		$contentState,
    		$miningState,
    		toggleAuth,
    		toggleRelays,
    		startMining,
    		stopMining,
    		input_change_handler,
    		textarea_input_handler,
    		input0_input_handler,
    		input1_input_handler
    	];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {}, null, [-1, -1]);

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    const app = new App({
      target: document.body
    });

    return app;

})();
//# sourceMappingURL=bundle.js.map
