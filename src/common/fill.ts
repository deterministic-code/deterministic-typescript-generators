import Mustache from "mustache";

/** Values Mustache interpolates or uses as sections (`{{#fields}}` / `{{^withUuid}}`). */
export type FillTokens = Record<string, unknown>;

export const fill = (text: string, tokens: FillTokens): string =>
  Mustache.render(text, tokens, undefined, {
    escape: (value) => String(value),
  });
