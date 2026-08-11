import { describe, expect, it } from 'vitest';
import { BinaryDataManager } from './binary-data-manager.js';

describe('BinaryDataManager', () => {
  it('stores a buffer and returns IBinaryData metadata referencing it by id', () => {
    const manager = new BinaryDataManager();
    const buffer = Buffer.from('hello world');
    const binaryData = manager.store(buffer, { mimeType: 'text/plain', fileName: 'hello.txt' });

    expect(binaryData.mimeType).toBe('text/plain');
    expect(binaryData.fileName).toBe('hello.txt');
    expect(binaryData.fileSize).toBe(String(buffer.length));
    expect(binaryData.id).toBeTruthy();
  });

  it('retrieves the exact buffer that was stored', () => {
    const manager = new BinaryDataManager();
    const buffer = Buffer.from([1, 2, 3, 4]);
    const { id } = manager.store(buffer, { mimeType: 'application/octet-stream' });

    expect(manager.retrieve(id)).toEqual(buffer);
  });

  it('generates a distinct id for each stored buffer', () => {
    const manager = new BinaryDataManager();
    const a = manager.store(Buffer.from('a'), { mimeType: 'text/plain' });
    const b = manager.store(Buffer.from('b'), { mimeType: 'text/plain' });
    expect(a.id).not.toBe(b.id);
  });

  it('throws when retrieving an unknown id', () => {
    const manager = new BinaryDataManager();
    expect(() => manager.retrieve('nope')).toThrow(/not found/);
  });

  it('has() reflects whether an id is stored', () => {
    const manager = new BinaryDataManager();
    const { id } = manager.store(Buffer.from('x'), { mimeType: 'text/plain' });
    expect(manager.has(id)).toBe(true);
    expect(manager.has('nope')).toBe(false);
  });
});
