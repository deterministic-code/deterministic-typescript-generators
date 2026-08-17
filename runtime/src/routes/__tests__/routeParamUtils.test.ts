import { vi } from 'vitest';
import type { Response } from 'express';
import {
  extractParam,
  parsePositiveInt,
  parseRouteId,
  idTypeConstraint,
  parseIdField,
  idOr400,
} from '../routeParamUtils';

describe('extractParam', () => {
  it('returns a string value unchanged', () => {
    expect(extractParam('42')).toBe('42');
  });

  it('returns undefined for undefined input', () => {
    expect(extractParam(undefined)).toBeUndefined();
  });

  it('returns the first element of an array', () => {
    expect(extractParam(['a', 'b'])).toBe('a');
  });

  it('returns undefined for an empty array', () => {
    expect(extractParam([])).toBeUndefined();
  });
});

describe('parsePositiveInt', () => {
  it('parses a positive integer string', () => {
    expect(parsePositiveInt('7')).toBe(7);
  });

  it('returns null for undefined', () => {
    expect(parsePositiveInt(undefined)).toBeNull();
  });

  it('returns null for the empty string', () => {
    expect(parsePositiveInt('')).toBeNull();
  });

  it('returns null for a non-numeric string', () => {
    expect(parsePositiveInt('abc')).toBeNull();
  });

  it('returns null for zero', () => {
    expect(parsePositiveInt('0')).toBeNull();
  });

  it('returns null for a negative number', () => {
    expect(parsePositiveInt('-3')).toBeNull();
  });
});

describe('parseRouteId', () => {
  it("rejects a bare integer under idType 'uuid' so a uuid project 400s a non-uuid path param", () => {
    expect(parseRouteId('uuid', '1')).toBeNull();
  });

  it("accepts a canonical uuid under idType 'uuid' and returns it unchanged", () => {
    expect(parseRouteId('uuid', '00000000-0000-0000-0000-000000000001')).toBe(
      '00000000-0000-0000-0000-000000000001',
    );
  });

  it("parses a positive integer under idType 'integer'", () => {
    expect(parseRouteId('integer', '5')).toBe(5);
  });

  it("returns null for a non-numeric value under idType 'integer'", () => {
    expect(parseRouteId('integer', 'x')).toBeNull();
  });

  it("returns any non-empty value unchanged under idType 'string'", () => {
    expect(parseRouteId('string', 'abc')).toBe('abc');
  });

  it("returns null for the empty string under idType 'string'", () => {
    expect(parseRouteId('string', '')).toBeNull();
  });

  it("returns null for a missing (undefined) param under idType 'string'", () => {
    expect(parseRouteId('string', undefined)).toBeNull();
  });
});

describe('idTypeConstraint', () => {
  it('describes the integer constraint', () => {
    expect(idTypeConstraint('integer')).toBe('must be a positive integer');
  });

  it('describes the uuid constraint', () => {
    expect(idTypeConstraint('uuid')).toBe('must be a valid uuid');
  });

  it('describes the string constraint', () => {
    expect(idTypeConstraint('string')).toBe('must be a non-empty string');
  });
});

describe('parseIdField', () => {
  it('returns the parsed id when valid', () => {
    expect(parseIdField('integer', 'id', '5')).toEqual({ id: 5 });
  });

  it('labels the validation message with the given field name on rejection', () => {
    expect(parseIdField('integer', 'parentId', 'x')).toEqual({
      error: 'parentId: must be a positive integer',
    });
  });

  it('returns a string id unchanged under the string idType', () => {
    expect(parseIdField('string', 'key', 'abc')).toEqual({ id: 'abc' });
  });
});

describe('idOr400', () => {
  const mockRes = () =>
    ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }) as unknown as Response;

  it('unwraps and returns the id when the parse succeeded', () => {
    const res = mockRes();
    expect(idOr400(res, { id: 7 })).toBe(7);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('sends a 400 with the error message and returns null when the parse failed', () => {
    const res = mockRes();
    expect(idOr400(res, { error: 'id: must be a positive integer' })).toBeNull();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      errors: [{ code: 'VALIDATION_ERROR', message: 'id: must be a positive integer' }],
    });
  });
});
