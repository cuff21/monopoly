(function(global) {
    'use strict';

    // xoshiro128** 1.1 by David Blackman and Sebastiano Vigna (public domain).
    // Reference: https://prng.di.unimi.it/xoshiro128starstar.c
    // Deterministic simulation RNG, not a cryptographic generator. Numeric seeds
    // retain 32 bits of entropy; the generator itself has 128 bits of state.
    function mix(value) {
        value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
        value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
        return (value ^ (value >>> 15)) >>> 0;
    }

    function freshSeed() {
        if (global.crypto && typeof global.crypto.getRandomValues === 'function') {
            return global.crypto.getRandomValues(new Uint32Array(1))[0];
        }
        if (typeof module !== 'undefined' && module.exports) {
            return require('node:crypto').randomBytes(4).readUInt32LE(0);
        }
        return Math.floor(Math.random() * 4294967296) >>> 0;
    }

    function create(seed) {
        if (!Number.isInteger(seed)) throw new TypeError('Random seed must be an integer.');
        var value = seed >>> 0;
        function word() {
            value = (value + 0x9e3779b9) >>> 0;
            return mix(value);
        }
        var a = word(), b = word(), c = word(), d = word();
        if ((a | b | c | d) === 0) a = 1;
        return function() {
            var result = Math.imul(b, 5);
            result = Math.imul((result << 7) | (result >>> 25), 9) >>> 0;
            var t = b << 9;
            c ^= a; d ^= b; b ^= c; a ^= d; c ^= t;
            d = (d << 11) | (d >>> 21);
            return result / 4294967296;
        };
    }

    // Gen6 training uses the lower half of the seed space, validation the upper
    // half, so held-out games cannot reuse a tournament seed, even across runs.
    function domainSeed(seed, domain) {
        if (domain !== 'training' && domain !== 'validation') throw new TypeError('Unknown seed domain.');
        return ((seed & 0x7fffffff) | (domain === 'validation' ? 0x80000000 : 0)) >>> 0;
    }

    function deriveSeed(seed, index, domain) {
        return domainSeed(mix(((seed >>> 0) + Math.imul(index, 0x9e3779b9)) >>> 0), domain);
    }

    var api = { create: create, freshSeed: freshSeed, domainSeed: domainSeed, deriveSeed: deriveSeed };
    global.GameRandom = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
