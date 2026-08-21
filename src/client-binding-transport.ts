export type ClientBindingTransport = "fetch" | "axios" | "tanstack";

const clientRoot = "frontend/src/client";

export const clientBindingRootIndex = `${clientRoot}/index.ts`;

export const clientBindingIndexPath = (kind: ClientBindingTransport): string =>
  `${clientRoot}/${kind}/index.ts`;

export const clientBindingHttpPath = (kind: ClientBindingTransport): string =>
  `${clientRoot}/${kind}/http.ts`;

export const clientBindingFilePath = (
  kind: ClientBindingTransport,
  fileBase: string,
): string => `${clientRoot}/${kind}/${fileBase}.ts`;

export const clientBindingMockTestPath = (
  kind: ClientBindingTransport,
  fileBase: string,
): string => `${clientRoot}/${kind}/${fileBase}.mock.test.ts`;

export const clientBindingLiveTestPath = (
  kind: ClientBindingTransport,
  fileBase: string,
): string => `${clientRoot}/${kind}/${fileBase}.live.test.ts`;
