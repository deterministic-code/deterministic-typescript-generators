const FLAG = "--filter-test";

const takeFlagValue = (argv: string[], flag: string): string | undefined => {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === flag) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("-")) return "";
      return next.replace(/^=/, "");
    }
    if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
  }
  return undefined;
};

export const stripFilterTestArgs = (argv: string[]): string[] => {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === FLAG) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) i += 1;
      continue;
    }
    if (arg.startsWith(`${FLAG}=`)) continue;
    out.push(arg);
  }
  return out;
};

export const filterTestNeedle = (): string | undefined => {
  const env = process.env.FILTER_TEST;
  if (env !== undefined && env !== "") return env;
  const fromArg = takeFlagValue(process.argv.slice(2), FLAG);
  if (fromArg === undefined || fromArg === "") return undefined;
  return fromArg;
};

export const filterTestFiles = (
  files: string[],
  needle: string,
): string[] => {
  const lowered = needle.toLowerCase();
  return files.filter((path) => path.toLowerCase().includes(lowered));
};
