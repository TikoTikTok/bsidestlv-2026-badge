// Alice in AI Land - the page's end of the assistant's bridge.
//
// `npm run maker` (software/tools/maker-server.mjs) mounts a bridge under
// /__maker/ next to the site; an assistant on this machine drives the studio
// through it (curl, or the MCP tools in software/tools/maker-mcp.mjs). This
// module is what the page does about it: it listens on the bridge's event
// stream for commands { id, op, args }, runs each through the handlers the
// page gives it, answers, mirrors the room back after every change, and
// carries the chat both ways. Where the page is served without the bridge
// (serve.sh, any other static server, the site) the first probe says so and
// nothing else happens: the studio works alone.
//
//   const bridge = connectBridge(ops, { onHello, onState });
//   bridge.state({ level, lint, report, game });   // after every change
//   bridge.post('text the person typed');          // the chat, outbound

export function connectBridge(ops, { base = '__maker/', onHello = () => {}, onState = () => {}, onCommand = () => {} } = {}) {
  const self = { available: null, connected: false, agents: [], post, state, close };
  let source = null, lastState = null, stateTimer = 0;

  async function probe() {
    try {
      const r = await fetch(base, { cache: 'no-store' });
      const s = r.ok ? await r.json() : null;
      self.available = !!s?.bridge;
    } catch { self.available = false; }
    onState(self);
    if (self.available) listen();
  }

  function listen() {
    source = new EventSource(`${base}events`);
    source.onopen = () => { self.connected = true; onState(self); if (lastState) send(lastState); };
    source.onerror = () => { self.connected = false; onState(self); };
    source.onmessage = async (e) => {
      let cmd;
      try { cmd = JSON.parse(e.data); } catch { return; }
      if (cmd.op === 'hello') { self.agents = cmd.args?.agents ?? []; if (cmd.args?.name) onHello(cmd.args.name); onState(self); return; }
      onCommand(cmd);
      let body;
      try {
        const fn = ops[cmd.op];
        if (!fn) throw new Error(`the page has no op '${cmd.op}'`);
        body = { id: cmd.id, result: (await fn(cmd.args ?? {})) ?? null };
      } catch (err) { body = { id: cmd.id, error: err?.message ?? String(err) }; }
      // the mirror goes up before the answer, so what the assistant reads next is what it just did
      if (stateTimer) { clearTimeout(stateTimer); stateTimer = 0; await send(lastState); }
      if (cmd.id !== undefined) fetch(`${base}reply`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
    };
  }

  const send = (s) => fetch(`${base}state`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(s) }).catch(() => {});
  /** The room as the page sees it now; batched, so a drag is one report. */
  function state(s) {
    lastState = s;
    if (!self.available) return;
    clearTimeout(stateTimer);
    stateTimer = setTimeout(() => send(lastState), 150);
  }
  async function post(text) {
    if (!self.available) return null;
    const r = await fetch(`${base}post`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
    return r.ok ? r.json() : null;
  }
  function close() { source?.close(); source = null; self.connected = false; }

  probe();
  return self;
}
