/**
 * app.js — Lógica principal: orquestra UI + WebSocket.
 */
(() => {
  const { ChatWS, ChatUI } = window;

  let myNick = '';
  let firstMsgSent = false;

  // ── Notificações ──────────────────────────────────────────────────────
  let unreadCount   = 0;   // mensagens não lidas (não minhas)
  let unreadMention = false; // true quando há menção não lida
  let muted = localStorage.getItem('chat:muted') === 'true';

  const BASE_TITLE = 'OpenShift Chat';

  function updateTabTitle() {
    if (unreadMention) {
      document.title = '(!) ' + BASE_TITLE;
    } else if (unreadCount > 0) {
      document.title = '(' + unreadCount + ') ' + BASE_TITLE;
    } else {
      document.title = BASE_TITLE;
    }
  }

  function resetUnread() {
    unreadCount   = 0;
    unreadMention = false;
    updateTabTitle();
  }

  // Toca um beep suave via Web Audio API (não requer nenhum arquivo de áudio)
  function playMentionSound() {
    if (muted) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);          // lá5
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15); // lá4
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } catch (_) { /* AudioContext não disponível — silencioso */ }
  }

  // Verifica se myNick está no array mentions vindo do servidor.
  // Compara case-insensitive e aceita base sem discriminador.
  function isMentionedByServer(mentions, myNick) {
    if (!mentions || !mentions.length || !myNick) return false;
    const myFull = myNick.toLowerCase();
    const myBase = myFull.replace(/#\d+$/, '');
    return mentions.some(m => {
      const ml = m.toLowerCase();
      return ml === myFull || ml === myBase;
    });
  }

  // Verifica se o container de mensagens está rolado até o final
  function isAtBottom() {
    const c = document.getElementById('messages-container');
    if (!c) return true;
    return c.scrollHeight - c.scrollTop - c.clientHeight < 40;
  }

  // ── Inicialização ────────────────────────────────────────────────────
  ChatUI.showLogin();

  // ── Login ────────────────────────────────────────────────────────────
  const joinBtn       = document.getElementById('join-btn');
  const nicknameInput = document.getElementById('nickname-input');
  const messageInput  = document.getElementById('message-input');
  const sendBtn       = document.getElementById('send-btn');
  const leaveBtn      = document.getElementById('leave-btn');
  const muteBtn       = document.getElementById('mute-btn');

  // Aplicar estado inicial do mute
  if (muted) muteBtn.classList.add('muted');
  muteBtn.title = muted ? 'Ativar notificações' : 'Silenciar notificações';

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

  // ── Mute toggle ───────────────────────────────────────────────────────
  muteBtn.addEventListener('click', () => {
    muted = !muted;
    localStorage.setItem('chat:muted', muted);
    muteBtn.classList.toggle('muted', muted);
    muteBtn.title = muted ? 'Ativar notificações' : 'Silenciar notificações';
    muteBtn.textContent = muted ? '🔕' : '🔔';
  });

  // ── Reset unread ao focar a aba + scroll-to-bottom ────────────────────
  window.addEventListener('focus', () => {
    if (isAtBottom()) resetUnread();
  });

  document.getElementById('messages-container') &&
    document.getElementById('messages-container').addEventListener('scroll', () => {
      if (document.hasFocus() && isAtBottom()) resetUnread();
    });

  // O container de mensagens só existe na tela de chat; registrar o listener
  // depois que o chat aparecer via MutationObserver
  const _msgsContainer = document.getElementById('messages-container');
  if (_msgsContainer) {
    _msgsContainer.addEventListener('scroll', () => {
      if (document.hasFocus() && isAtBottom()) resetUnread();
    });
  }

  // ── WebSocket events ─────────────────────────────────────────────────
  ChatWS.on('open', () => {
    ChatUI.setStatus('connected');
    messageInput.disabled = false;
    sendBtn.disabled = false;
    messageInput.focus();
  });

  ChatWS.on('close', () => {
    if (ChatWS.isLeaving()) {
      myNick = '';
      firstMsgSent = false;
      resetUnread();
      document.title = BASE_TITLE;
      sessionStorage.removeItem('chat:userId');
      ChatUI.resetChat();
      return;
    }
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

      case 'welcome':
        if (env.userId) sessionStorage.setItem('chat:userId', env.userId);
        if (env.user) {
          myNick = env.user; // atualiza para o nome atribuído pelo servidor (pode ter #XXXX)
          ChatUI.updateDisplayName(env.user, env.requestedAs);
        }
        break;

      case 'history':
        if (env.messages && env.messages.length > 0) {
          ChatUI.loadHistory(env.messages, myNick);
        }
        break;

      case 'message': {
        if (!firstMsgSent && env.user === myNick) {
          firstMsgSent = true;
          ChatUI.removeIntroBanner();
        }
        const result = ChatUI.appendMessage(env, myNick);
        const isMe = env.user === myNick;

        if (!isMe) {
          // Fonte primária: env.mentions vindo do servidor (fase 1b)
          // Fallback: detecção local pelo DOM (fase 1c, mantida para compatibilidade)
          const isMention = isMentionedByServer(env.mentions, myNick)
                         || (result && result.isMention);

          // Forçar classe mention na bolha se servidor confirmou (DOM pode não ter detectado)
          if (isMention && result && result.el && !result.el.classList.contains('mention')) {
            result.el.classList.add('mention');
          }

          // Contabilizar não lidas quando aba sem foco OU usuário scrollou para cima
          if (!document.hasFocus() || !isAtBottom()) {
            unreadCount++;
            if (isMention) {
              unreadMention = true;
              if (!muted) playMentionSound();
            }
            updateTabTitle();
          }
        }
        break;
      }

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

  // ── Leave ─────────────────────────────────────────────────────────────
  leaveBtn.addEventListener('click', () => {
    ChatWS.leave();
  });

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
