/**
 * O(1) LRU Cache built from scratch using a doubly-linked list + Map.
 *
 * - get / put / has / delete are all O(1)
 * - keys() returns entries in MRU-first order (head → tail)
 */

interface Node<K, V> {
  key: K;
  value: V;
  prev: Node<K, V> | null;
  next: Node<K, V> | null;
}

export class LruCache<K, V> {
  private readonly capacity: number;
  private readonly map = new Map<K, Node<K, V>>();
  private head: Node<K, V> | null = null; // MRU
  private tail: Node<K, V> | null = null; // LRU

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  get size(): number {
    return this.map.size;
  }

  get(key: K): V | undefined {
    const node = this.map.get(key);
    if (!node) return undefined;
    this.moveToHead(node);
    return node.value;
  }

  put(key: K, value: V): void {
    const existing = this.map.get(key);
    if (existing) {
      existing.value = value;
      this.moveToHead(existing);
      return;
    }

    if (this.map.size >= this.capacity) {
      this.evict();
    }

    const node: Node<K, V> = { key, value, prev: null, next: this.head };
    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;
    if (!this.tail) {
      this.tail = node;
    }
    this.map.set(key, node);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): void {
    const node = this.map.get(key);
    if (!node) return;
    this.removeNode(node);
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
    this.head = null;
    this.tail = null;
  }

  keys(): K[] {
    const result: K[] = [];
    let current = this.head;
    while (current) {
      result.push(current.key);
      current = current.next;
    }
    return result;
  }

  private moveToHead(node: Node<K, V>): void {
    if (node === this.head) return;
    this.removeNode(node);
    node.prev = null;
    node.next = this.head;
    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;
    if (!this.tail) {
      this.tail = node;
    }
  }

  private removeNode(node: Node<K, V>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
    node.prev = null;
    node.next = null;
  }

  private evict(): void {
    if (!this.tail) return;
    const evicted = this.tail;
    this.removeNode(evicted);
    this.map.delete(evicted.key);
  }
}
