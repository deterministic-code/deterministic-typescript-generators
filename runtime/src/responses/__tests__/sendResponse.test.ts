import type { Response } from 'express';
import { sendItem, sendItems, sendSuccess, sendError, sendErrors } from '../sendResponse';

function mockRes(): { res: Response; status: jest.Mock; json: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn();
  const res = { status, json } as unknown as Response;
  status.mockReturnValue(res);
  json.mockReturnValue(res);
  return { res, status, json };
}

describe('sendResponse', () => {
  it('sendItem defaults to 200 and forwards data', () => {
    const { res, status, json } = mockRes();
    sendItem(res, { a: 1 });
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ a: 1 });
  });

  it('sendItem honors an explicit status', () => {
    const { res, status } = mockRes();
    sendItem(res, { a: 1 }, 201);
    expect(status).toHaveBeenCalledWith(201);
  });

  it('sendItems wraps an array under items', () => {
    const { res, status, json } = mockRes();
    sendItems(res, [1, 2]);
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ items: [1, 2] });
  });

  it('sendItems honors an explicit status', () => {
    const { res, status } = mockRes();
    sendItems(res, [], 202);
    expect(status).toHaveBeenCalledWith(202);
  });

  it('sendSuccess sends { success: true }', () => {
    const { res, status, json } = mockRes();
    sendSuccess(res);
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ success: true });
  });

  it('sendSuccess honors an explicit status', () => {
    const { res, status } = mockRes();
    sendSuccess(res, 204);
    expect(status).toHaveBeenCalledWith(204);
  });

  it('sendError wraps code/message in the errors envelope', () => {
    const { res, status, json } = mockRes();
    sendError(res, 400, 'BAD', 'no good');
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      errors: [{ code: 'BAD', message: 'no good' }],
    });
  });

  it('sendErrors passes through an array of entries', () => {
    const { res, status, json } = mockRes();
    sendErrors(res, 422, [
      { code: 'A', message: 'a' },
      { code: 'B', message: 'b' },
    ]);
    expect(status).toHaveBeenCalledWith(422);
    expect(json).toHaveBeenCalledWith({
      errors: [
        { code: 'A', message: 'a' },
        { code: 'B', message: 'b' },
      ],
    });
  });
});
