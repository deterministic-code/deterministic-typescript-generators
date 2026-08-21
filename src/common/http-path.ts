const camelIdent = (name: string): string =>
  name.replace(/_([a-z0-9])/gi, (_, ch: string) => ch.toUpperCase());

/** Map a routes-api path (snake segments, `{param}`) onto TS HTTP paths (kebab segments, camel params). */
export const httpPathFromRoutesApi = (path: string): string =>
  path
    .split("/")
    .map((segment) => {
      const param = /^\{(.+)\}$/.exec(segment);
      return param ? `{${camelIdent(param[1]!)}}` : segment.replace(/_/g, "-");
    })
    .join("/");
