import { errorHandler } from '../errorHandler';
import { ErrorHandlerMiddlewareService } from '../ErrorHandlerMiddlewareService';

describe('ErrorHandlerMiddlewareService', () => {
  it('handle is the shared errorHandler (or a thin delegator forwarding every arg)', () => {
    const service = new ErrorHandlerMiddlewareService();
    if (service.handle === errorHandler) {
      return;
    }
    expect(service.handle.length).toBe(4);
  });

  it('exposes handle as a readonly ErrorRequestHandler', () => {
    const service = new ErrorHandlerMiddlewareService();
    expect(typeof service.handle).toBe('function');
    expect(service.handle.length).toBe(4);
  });

  it('handle behaves identically to the shared errorHandler for a thrown error', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = new ErrorHandlerMiddlewareService();

    const err = new Error('boom');
    const jsonShared = vi.fn();
    const statusShared = vi.fn().mockReturnValue({ json: jsonShared });
    const resShared = {
      status: statusShared,
      json: jsonShared,
      headersSent: false,
    } as any;
    const nextShared = vi.fn();

    const jsonService = vi.fn();
    const statusService = vi.fn().mockReturnValue({ json: jsonService });
    const resService = {
      status: statusService,
      json: jsonService,
      headersSent: false,
    } as any;
    const nextService = vi.fn();

    errorHandler(err, {} as any, resShared, nextShared);
    service.handle(err, {} as any, resService, nextService);

    expect(statusService.mock.calls).toEqual(statusShared.mock.calls);
    expect(jsonService.mock.calls).toEqual(jsonShared.mock.calls);
    expect(nextService.mock.calls.length).toBe(nextShared.mock.calls.length);
    errSpy.mockRestore();
  });
});
