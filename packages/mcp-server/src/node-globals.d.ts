declare const process: {
  readonly env: Record<string, string | undefined>;
  exit(code?: number): never;
};
