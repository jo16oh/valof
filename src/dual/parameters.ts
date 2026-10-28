/**
 * Whether the parameter list in `f`'s source has `=` or `...` at its top level. One inside a
 * destructured parameter does not shorten `length`, so it is allowed. The list starts at the first
 * `(` outside brackets, so a computed method key is skipped. An arrow reached first means a bare
 * `x =>`. Strings, regular expressions, comments and a template's literal text are skipped whole.
 * A template's `${}` is read as code. A `/` is a division after a name, a literal or a closing
 * bracket, and a regular expression after any other punctuator. A bound or native function's
 * source shows no parameter.
 */
export function hidesParameter(f: object): boolean {
  const source = Function.prototype.toString.call(f);
  // The brackets left open, innermost last. "`" stands for a template's `${`.
  const open: string[] = [];
  let list = false;
  let previous = "(";
  for (let i = 0; i < source.length; i++) {
    let c = source[i]!;
    const next = source[i + 1];
    if (/\s/.test(c)) continue;
    if (c == "/" && next == "/") {
      i = source.indexOf("\n", i);
      if (i < 0) return false;
      continue;
    }
    if (c == "/" && next == "*") {
      i = source.indexOf("*/", i + 2) + 1;
      continue;
    }
    if (c == "`" || (c == "}" && open.at(-1) == "`")) {
      if (c == "}") open.pop();
      while (
        ++i < source.length &&
        (c = source[i]!) != "`" &&
        !(c == "$" && source[i + 1] == "{")
      ) {
        if (c == "\\") i++;
      }
      if (c == "$") {
        open.push("`");
        i++;
        previous = "{";
      } else previous = "a";
      continue;
    }
    if (c == '"' || c == "'" || (c == "/" && "(,=:[!&|?{;+-*%<>~^".includes(previous))) {
      // `/` ends a regular expression outside a character class only.
      for (let inClass = false; ++i < source.length && (source[i] != c || inClass);) {
        if (source[i] == "\\") i++;
        else if (c == "/") inClass = source[i] == "[" || (inClass && source[i] != "]");
      }
      previous = "a";
      continue;
    }
    if (list && open.length == 1 && (c == "=" || source.startsWith("...", i))) {
      return true;
    }
    if (c == "(" || c == "[" || c == "{") {
      if (!open.length && c == "(") list = true;
      open.push(c);
    } else if (c == ")" || c == "]" || c == "}") {
      open.pop();
      if (list && !open.length) return false;
    } else if (!open.length && c == "=" && next == ">") return false;
    previous = /[\w$]/.test(c) ? "a" : c;
  }
  return false;
}
