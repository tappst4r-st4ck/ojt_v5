import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const html = read("public/tesda-main-screen.html");
const js = read("public/tesda-main-screen.js");

function cspDirectives() {
  const source = read("lib/security-headers.mjs");
  const block = source.slice(source.indexOf("const csp = ["), source.indexOf("].join"));
  return Object.fromEntries([...block.matchAll(/^\s*"([^"]+)",?$/gm)].map(([, directive]) => {
    const [name, ...values] = directive.split(/\s+/);
    return [name, values];
  }));
}

test("script-src forbids inline and eval'd script", () => {
  const scriptSrc = cspDirectives()["script-src"];
  assert.ok(scriptSrc, "script-src must be set");
  for (const banned of ["'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "*"]) {
    assert.ok(!scriptSrc.includes(banned), `script-src must not allow ${banned}`);
  }
  assert.deepEqual(cspDirectives()["object-src"], ["'none'"]);
  assert.deepEqual(cspDirectives()["frame-ancestors"], ["'none'"]);
});

test("dashboard HTML has no inline scripts or inline event handlers", () => {
  for (const [, attributes, body] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    assert.match(attributes, /\ssrc="/, "every <script> must load from a file");
    assert.equal(body.trim(), "", "a <script src> must not also carry inline code");
  }
  assert.doesNotMatch(html, /\son[a-z]+=/i, "inline on*= handlers are blocked by the CSP");
  assert.doesNotMatch(js, /\son[a-z]+="/i, "HTML built in JS must not use on*= handlers either");
  assert.doesNotMatch(html + js, /javascript:/i);
});

test("every declarative data-* action is registered", () => {
  const registry = js.slice(js.indexOf("const pageActions = {"), js.indexOf("};", js.indexOf("const pageActions = {")));
  const registered = new Set([...registry.matchAll(/\b(\w+)\s*(?:,|:)/g)].map(([, name]) => name));
  const used = [...(html + js).matchAll(/data-(?:click|change|input|submit)="([^"]+)"/g)]
    .flatMap(([, spec]) => spec.split("|").map(step => step.split(":")[0]));
  assert.ok(used.length > 30, "expected the page's actions to be declared with data-* attributes");
  for (const name of new Set(used)) {
    assert.ok(registered.has(name), `data-* action "${name}" is not in pageActions`);
  }
});

test("compiled dashboard CSS is up to date with its sources", async () => {
  const { buildCss } = await import("../scripts/build-css.mjs");
  const lf = text => text.replace(/\r\n/g, "\n"); // git may check the file out with CRLF on Windows
  assert.equal(lf(read("public/tesda-main-screen.css")), lf(await buildCss()),
    "public/tesda-main-screen.css is stale. Run: npm run build:css");
});
