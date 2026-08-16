const pageId = process.argv[2];
const expression = process.argv[3] ?? 'location.href';
const ws = new WebSocket(`ws://127.0.0.1:9222/devtools/page/${pageId}`);

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: { expression, returnByValue: true, awaitPromise: true },
  }));
};

ws.onmessage = (event) => {
  const payload = JSON.parse(event.data);
  if (payload.id !== 1) return;
  console.log(JSON.stringify(payload.result?.result?.value ?? payload));
  ws.close();
};

ws.onerror = (error) => {
  console.error(error);
  process.exitCode = 1;
};
