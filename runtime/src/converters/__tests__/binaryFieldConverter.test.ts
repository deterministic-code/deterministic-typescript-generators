import { Buffer } from 'node:buffer';
import { describe, it, expect } from 'vitest';
import {
  binaryFieldConverter,
  mysqlBinaryFieldConverter,
  postgresBinaryFieldConverter,
} from '../binaryFieldConverter';

const CASES = [
  { dialect: 'sqlite', conv: binaryFieldConverter },
  { dialect: 'mysql', conv: mysqlBinaryFieldConverter },
  { dialect: 'postgres', conv: postgresBinaryFieldConverter },
] as const;

describe.each(CASES)('binaryFieldConverter ($dialect)', ({ dialect, conv }) => {
  it(`declares fromDatasource ${dialect}, datasourceType binary`, () => {
    expect(conv.fromDatasource).toBe(dialect);
    expect(conv.datasourceType).toBe('binary');
  });

  it('to() decodes a base64 string to a Buffer with identical bytes', () => {
    const out = conv.to(Buffer.from([1, 2, 3, 4]).toString('base64')) as Buffer;
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(Array.from(out)).toEqual([1, 2, 3, 4]);
  });

  it('from() encodes a Buffer to a base64 string', () => {
    const out = conv.from(Buffer.from([10, 20, 30]));
    expect(out).toBe(Buffer.from([10, 20, 30]).toString('base64'));
  });

  it('round-trips bytes through from() then to()', () => {
    const original = Buffer.from([0, 127, 255, 42]);
    const back = conv.to(conv.from(original) as string) as Buffer;
    expect(Array.from(back)).toEqual([0, 127, 255, 42]);
  });

  it('round-trips bytes intact for a 1 KiB payload', () => {
    const bytes = Buffer.alloc(1024);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i & 0xff;
    const back = conv.to(conv.from(bytes) as string) as Buffer;
    expect(Array.from(back)).toEqual(Array.from(bytes));
  });

  it('passes null through in both directions', () => {
    expect(conv.to(null)).toBeNull();
    expect(conv.from(null)).toBeNull();
  });

  it('throws on non-string in to()', () => {
    expect(() => conv.to(Buffer.from([1]) as unknown as string)).toThrow();
    expect(() => conv.to(new ArrayBuffer(2) as unknown as string)).toThrow();
  });

  it('throws on non-Buffer in from()', () => {
    expect(() => conv.from('bytes' as unknown as Buffer)).toThrow();
    expect(() => conv.from(new ArrayBuffer(2) as unknown as Buffer)).toThrow();
  });

  it('falls back to typeof in the error message when the value has no constructor', () => {
    expect(() => conv.to(undefined as unknown as string)).toThrow(/got undefined/);
    expect(() => conv.to(Object.create(null) as unknown as string)).toThrow(/got object/);
    expect(() => conv.from(undefined as unknown as Buffer)).toThrow(/got undefined/);
    expect(() => conv.from(Object.create(null) as unknown as Buffer)).toThrow(/got object/);
  });
});
