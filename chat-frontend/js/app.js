/**
 * app.js — Lógica principal: orquestra UI + WebSocket.
 */
(() => {
  const { ChatWS, ChatUI } = window;

  let myNick = '';
  let firstMsgSent = false;

  // ── Inicialização ────────────────────────────────────────────────────
  ChatUI.showLogin();

  // ── Login ────────────────────────────────────────────────────────────
  const joinBtn        = document.getElementById('join-btn');
  const nicknameInput  = document.getElementById('nickname-input');
  const messageInput   = document.getElementById('message-input');
  const sendBtn        = document.getElementById('send-btn');

  function validateNick(n) {
    if (!n || n.trim().length === 0) return 'Nickname não pode ser vazio';
    if (n.length < 3)  return 'Nickname muito curto (mínimo 3 caracteres)';
    if (n.length > 20) return 'Nickname muito longo (máximo 20 caracteres)';
    if (!/^[a-zA-Z0-9_\-À-ÿ]+$/.test(n)) return 'Apenas letras, números, _ ou -';
    return '';
  }

  function doJoin() {
    const nick = nicknameInput.value.trim();
    const err = validateNick(nick);
    if (err) { ChatUI.setNicknameError(err); return; }
    ChatUI.clearNicknameError();
    myNick = nick;
    ChatUI.showChat(myNick);
    ChatUI.setStatus('connecting');
    ChatWS.connect(myNick);
  }

  joinBtn.addEventListener('click', doJoin);
  nicknameInput.addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });
  nicknameInput.addEventListener('input', () => ChatUI.clearNicknameError());

  // ── WebSocket events ─────────────────────────────────────────────────
  ChatWS.on('open', () => {
    ChatUI.setStatus('connected');
    messageInput.disabled = false;
    sendBtn.disabled = false;
    messageInput.focus();
  });

  ChatWS.on('close', () => {
    ChatUI.setStatus('error');
    messageInput.disabled = true;
    sendBtn.disabled = true;
  });

  ChatWS.on('error', () => {
    ChatUI.setStatus('error');
  });

  ChatWS.on('reconnecting', () => {
    ChatUI.setStatus('connecting');
    messageInput.disabled = true;
    sendBtn.disabled = true;
  });

  ChatWS.on('message', (env) => {
    switch (env.type) {

      case 'history':
        if (env.messages && env.messages.length > 0) {
          ChatUI.loadHistory(env.messages, myNick);
        }
        break;

      case 'message':
        if (!firstMsgSent && env.user === myNick) {
          firstMsgSent = true;
          ChatUI.removeIntroBanner();
        }
        ChatUI.appendMessage(env, myNick);
        break;

      case 'system':
        ChatUI.appendMessage(env, myNick);
        break;

      case 'online':
        if (env.online) ChatUI.updateOnline(env.online, myNick);
        break;

      case 'error':
        if (env.content && env.content.includes('Limite')) {
          ChatUI.showRateWarning();
        }
        break;
    }
  });

  // ── Envio de mensagem ─────────────────────────────────────────────────
  function sendMessage() {
    const content = messageInput.value.trim();
    if (!content) return;
    if (!ChatWS.isConnected()) return;
    if (ChatWS.send(content)) {
      messageInput.value = '';
      ChatUI.updateCharCount(0);
    }
  }

  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Contador de caracteres
  messageInput.addEventListener('input', () => {
    ChatUI.updateCharCount(messageInput.value.length);
  });

})();
