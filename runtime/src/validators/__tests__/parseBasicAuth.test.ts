import { parseBasicAuth } from '../parseBasicAuth';
import { BusinessError } from '../../errors/BusinessError';

describe('parseBasicAuth', () => {
  it('returns undefined when header is undefined', () => {
    expect(parseBasicAuth(undefined)).toBeUndefined();
  });

  it('returns undefined when header is empty string', () => {
    expect(parseBasicAuth('')).toBeUndefined();
  });

  it('returns undefined when header uses Bearer scheme', () => {
    expect(parseBasicAuth('Bearer some-token')).toBeUndefined();
  });

  it('returns undefined when header uses unknown scheme', () => {
    expect(parseBasicAuth('Digest abc123')).toBeUndefined();
  });

  it('parses valid Basic auth header into client_id and client_secret', () => {
    const encoded = Buffer.from('my-app:my-secret').toString('base64');
    const result = parseBasicAuth(`Basic ${encoded}`);

    expect(result).toEqual({
      client_id: 'my-app',
      client_secret: 'my-secret',
    });
  });

  it('splits on first colon only — colons in client_secret are preserved', () => {
    const encoded = Buffer.from('my-app:secret:with:colons').toString('base64');
    const result = parseBasicAuth(`Basic ${encoded}`);

    expect(result).toEqual({
      client_id: 'my-app',
      client_secret: 'secret:with:colons',
    });
  });

  it('returns empty client_secret when colon is present but nothing follows', () => {
    const encoded = Buffer.from('my-app:').toString('base64');
    const result = parseBasicAuth(`Basic ${encoded}`);

    expect(result).toEqual({
      client_id: 'my-app',
      client_secret: '',
    });
  });

  it('throws BusinessError 401 when decoded string has no colon', () => {
    const encoded = Buffer.from('no-colon-here').toString('base64');

    expect(() => parseBasicAuth(`Basic ${encoded}`)).toThrow(BusinessError);
    expect(() => parseBasicAuth(`Basic ${encoded}`)).toThrow(
      'Invalid Basic authorization header format',
    );
  });

  it('throws BusinessError 401 when client_id portion is empty', () => {
    const encoded = Buffer.from(':some-secret').toString('base64');

    expect(() => parseBasicAuth(`Basic ${encoded}`)).toThrow(BusinessError);
    expect(() => parseBasicAuth(`Basic ${encoded}`)).toThrow(
      'Basic authorization header missing client_id',
    );
  });

  it('throws BusinessError 401 when Basic token is not valid base64', () => {
    expect(() => parseBasicAuth('Basic %%%invalid%%%')).toThrow(BusinessError);
    expect(() => parseBasicAuth('Basic %%%invalid%%%')).toThrow(
      'Invalid Basic authorization header encoding',
    );
  });
});
