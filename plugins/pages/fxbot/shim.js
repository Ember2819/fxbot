// The first thing in an HTML page. It offers the reader a private line, before the page's own code can run, and keeps it
// here. Links go through the reader. Every check is on the reader's side: this is only a convenience for the page.
(() => {
  const host = parent.parent;
  const alone = host === window;
  const { port1: line, port2 } = new MessageChannel();
  const waiting = new Map();
  let next = 0;
  line.onmessage = ({ data: { id, ok, value, error } }) => {
    const call = waiting.get(id);
    if (!call) return;
    waiting.delete(id);
    ok ? call.yes(value) : call.no(new Error(error));
  };
  const ask = (op, ...args) =>
    new Promise((yes, no) => {
      if (alone) return no(new Error("This page is open on its own, so it can't reach fxbot."));
      waiting.set(++next, { yes, no });
      line.postMessage({ id: next, op, args });
    });
  if (!alone) host.postMessage({ fxpage: 1 }, "*", [port2]);
  const open = (url) => ask("open", String(url));
  addEventListener(
    "click",
    (event) => {
      const link = event.target.closest?.("a[href]");
      if (alone || !link || (link.hash && link.href.split("#")[0] === location.href.split("#")[0])) return;
      event.preventDefault();
      open(link.href).catch(() => {});
    },
    true,
  );
  window.fxpage = Object.freeze({ open });
})();
