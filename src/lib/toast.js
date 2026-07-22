// A tiny pub-sub so any component can raise a notification without threading
// callbacks through props. One ToastHost, mounted once in App, renders them.

let listeners = [];

export function notify(message, tone = "error") {
  const toast = { id: `${Date.now()}-${Math.random()}`, message, tone };
  listeners.forEach((fn) => fn(toast));
}

export function onNotify(fn) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}
