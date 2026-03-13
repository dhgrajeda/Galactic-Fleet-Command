import { LruCache } from '../../src/cache/LruCache';

// ── basic get / put ───────────────────────────────────────────────────────────

describe('basic get and put', () => {
  it('returns undefined for a key that was never inserted', () => {
    const cache = new LruCache<string, number>(3);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('returns the value for a key that was inserted', () => {
    const cache = new LruCache<string, number>(3);
    cache.put('a', 1);
    expect(cache.get('a')).toBe(1);
  });

  it('returns the most recent value when a key is updated', () => {
    const cache = new LruCache<string, number>(3);
    cache.put('a', 1);
    cache.put('a', 99);
    expect(cache.get('a')).toBe(99);
  });

  it('has() returns true for a present key and false for an absent one', () => {
    const cache = new LruCache<string, number>(3);
    cache.put('a', 1);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('z')).toBe(false);
  });

  it('delete removes a key', () => {
    const cache = new LruCache<string, number>(3);
    cache.put('a', 1);
    cache.delete('a');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.has('a')).toBe(false);
  });

  it('delete on an absent key does not throw', () => {
    const cache = new LruCache<string, number>(3);
    expect(() => cache.delete('nonexistent')).not.toThrow();
  });

  it('supports non-string keys', () => {
    const cache = new LruCache<number, string>(3);
    cache.put(1, 'one');
    cache.put(2, 'two');
    expect(cache.get(1)).toBe('one');
    expect(cache.get(2)).toBe('two');
  });
});

// ── capacity and eviction ─────────────────────────────────────────────────────

describe('eviction order', () => {
  it('evicts the least recently used entry when capacity is exceeded', () => {
    const cache = new LruCache<string, number>(3);
    cache.put('a', 1); // LRU → a
    cache.put('b', 2); //        a b
    cache.put('c', 3); //        a b c  (a is LRU)
    cache.put('d', 4); // evicts a

    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(true);
    expect(cache.has('c')).toBe(true);
    expect(cache.has('d')).toBe(true);
  });

  it('evicts correctly across multiple overflows', () => {
    const cache = new LruCache<string, number>(2);
    cache.put('a', 1);
    cache.put('b', 2);
    cache.put('c', 3); // evicts a
    cache.put('d', 4); // evicts b

    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('c')).toBe(true);
    expect(cache.has('d')).toBe(true);
  });

  it('handles capacity of 1', () => {
    const cache = new LruCache<string, number>(1);
    cache.put('a', 1);
    cache.put('b', 2); // evicts a
    expect(cache.has('a')).toBe(false);
    expect(cache.get('b')).toBe(2);
  });

  it('does not evict when updating an existing key', () => {
    const cache = new LruCache<string, number>(2);
    cache.put('a', 1);
    cache.put('b', 2);
    cache.put('a', 99); // update, not a new entry — no eviction
    expect(cache.size).toBe(2);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(true);
  });
});

// ── MRU on access ─────────────────────────────────────────────────────────────

describe('MRU behaviour', () => {
  it('get moves the accessed entry to most-recently-used', () => {
    const cache = new LruCache<string, number>(2);
    cache.put('a', 1);
    cache.put('b', 2);
    cache.get('a');     // a is now MRU; b is LRU
    cache.put('c', 3); // should evict b, not a

    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('c')).toBe(true);
  });

  it('put on an existing key moves it to most-recently-used', () => {
    const cache = new LruCache<string, number>(2);
    cache.put('a', 1);
    cache.put('b', 2);
    cache.put('a', 99); // update a → a is now MRU; b is LRU
    cache.put('c', 3);  // should evict b, not a

    expect(cache.get('a')).toBe(99);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('c')).toBe(true);
  });

  it('repeated gets do not change the set of present keys', () => {
    const cache = new LruCache<string, number>(3);
    cache.put('a', 1);
    cache.put('b', 2);
    cache.put('c', 3);
    cache.get('a');
    cache.get('b');
    cache.get('c');
    expect(cache.size).toBe(3);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(true);
    expect(cache.has('c')).toBe(true);
  });
});

// ── O(1) structural assumption ────────────────────────────────────────────────
//
// We cannot time O(1) in a unit test, so we verify the structural invariant:
// keys() returns entries in MRU-first order, proving both the internal Map
// and doubly-linked list are updated correctly on every operation.

describe('O(1) structural assumption — key order via keys()', () => {
  it('keys() is empty on a new cache', () => {
    const cache = new LruCache<string, number>(3);
    expect(cache.keys()).toEqual([]);
  });

  it('keys() returns entries in insertion order (MRU first) with no gets', () => {
    const cache = new LruCache<string, number>(3);
    cache.put('a', 1);
    cache.put('b', 2);
    cache.put('c', 3);
    expect(cache.keys()).toEqual(['c', 'b', 'a']); // most recent first
  });

  it('keys() reflects reordering after a get', () => {
    const cache = new LruCache<string, number>(3);
    cache.put('a', 1);
    cache.put('b', 2);
    cache.put('c', 3);
    cache.get('a'); // a moves to front
    expect(cache.keys()).toEqual(['a', 'c', 'b']);
  });

  it('keys() reflects reordering after a put update', () => {
    const cache = new LruCache<string, number>(3);
    cache.put('a', 1);
    cache.put('b', 2);
    cache.put('c', 3);
    cache.put('b', 99); // b moves to front
    expect(cache.keys()).toEqual(['b', 'c', 'a']);
  });

  it('keys() drops evicted entries', () => {
    const cache = new LruCache<string, number>(3);
    cache.put('a', 1);
    cache.put('b', 2);
    cache.put('c', 3);
    cache.put('d', 4); // evicts a
    expect(cache.keys()).toEqual(['d', 'c', 'b']);
    expect(cache.keys()).not.toContain('a');
  });

  it('keys() drops deleted entries', () => {
    const cache = new LruCache<string, number>(3);
    cache.put('a', 1);
    cache.put('b', 2);
    cache.delete('a');
    expect(cache.keys()).toEqual(['b']);
  });
});

// ── size ──────────────────────────────────────────────────────────────────────

describe('size', () => {
  it('starts at 0', () => {
    expect(new LruCache<string, number>(10).size).toBe(0);
  });

  it('increments on each new put', () => {
    const cache = new LruCache<string, number>(10);
    cache.put('a', 1);
    expect(cache.size).toBe(1);
    cache.put('b', 2);
    expect(cache.size).toBe(2);
  });

  it('does not exceed capacity', () => {
    const cache = new LruCache<string, number>(3);
    cache.put('a', 1);
    cache.put('b', 2);
    cache.put('c', 3);
    cache.put('d', 4); // triggers eviction
    expect(cache.size).toBe(3);
  });

  it('does not grow when updating an existing key', () => {
    const cache = new LruCache<string, number>(3);
    cache.put('a', 1);
    cache.put('a', 2);
    expect(cache.size).toBe(1);
  });

  it('decrements on delete', () => {
    const cache = new LruCache<string, number>(3);
    cache.put('a', 1);
    cache.put('b', 2);
    cache.delete('a');
    expect(cache.size).toBe(1);
  });
});
