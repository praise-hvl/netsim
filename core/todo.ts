/**
 * Placeholder for code you write this course. In week branches every `@student` region becomes
 * `return todo("week N: id", ...params)`. Passing the parameters keeps them "used" so strict
 * TypeScript and the linter stay quiet until you replace the call with real code.
 */
export function todo(label: string, ...args: unknown[]): never {
  void args;
  throw new Error(`TODO(${label}) is not implemented yet`);
}
