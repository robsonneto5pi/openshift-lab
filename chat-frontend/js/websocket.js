/**
 * websocket.js — Gerenciador de conexão WebSocket com reconexão automática.
 */
const WS_BACKEND_HOST = 'golang-sample-openshift-lab.apps.itz-1y1puu.infra01-lb.fra02.techzone.ibm.com';

window.ChatWS = (() => {
  let socket = null;
  let nickname = '';
  let reconnectDelay = 1000;
  let reconnectTimer = null;
  let intentionalClose = false;
  let leaving = false;
  const handlers = {};

  function on(event, fn) { handlers[event] = fn; }
  function emit(event, data) { if (handlers[event]) handlers[event](data); }

  function connect(nick) {
    nickname = nick;
    intentionalClose = false;
    leaving = false;
    const url = `wss://${WS_BACKEND_HOST}/ws?nickname=${encodeURIComponent(nick)}`;
    console.log('[WS] Connecting to', url);

    socket = new WebSocket(url);

    socket.onopen = () => {
      console.log('[WS] Connected');
      reconnectDelay = 1000;
      emit('open');
    };

    socket.onmessage = (event) => {
      // Cada frame pode conter múltiplos JSONs separados por \n (flush do writePump)
      const lines = event.data.split('\n').filter(l => l.trim());
      lines.forEach(line => {
        try {
          const msg = JSON.parse(line);
          emit('message', msg);
        } catch (e) {
          console.warn('[WS] Parse error:', e, line);
        }
      });
    };

    socket.onerror = (err) => {
      console.error('[WS] Error:', err);
      emit('error', err);
    };

    socket.onclose = (evt) => {
      console.log('[WS] Closed', evt.code, evt.reason);
      emit('close', evt);
      if (!intentionalClose) {
        scheduleReconnect();
      }
    };
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    emit('reconnecting', reconnectDelay);
    reconnectTimer = setTimeout(() => {
      console.log(`[WS] Reconnecting (delay=${reconnectDelay}ms)...`);
      connect(nickname);
      reconnectDelay = Math.min(reconnectDelay * 2, 15000);
    }, reconnectDelay);
  }

  function send(content) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.warn('[WS] Cannot send, socket not open');
      return false;
    }
    socket.send(JSON.stringify({ content }));
    return true;
  }

  function disconnect() {
    intentionalClose = true;
    clearTimeout(reconnectTimer);
    if (socket) socket.close();
  }

  // Notifica o servidor (Redis cleanup + broadcast) e fecha o socket imediatamente.
  // O servidor responde limpando Redis + broadcast; onclose local dispara resetChat().
  function leave() {
    leaving = true;
    intentionalClose = true;
    clearTimeout(reconnectTimer);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'leave' }));
      socket.close();
    } else if (socket) {
      socket.close();
    }
  }

  function isLeaving() { return leaving; }

  function isConnected() {
    return socket && socket.readyState === WebSocket.OPEN;
  }

  return { connect, send, disconnect, leave, isConnected, isLeaving, on };
})();
