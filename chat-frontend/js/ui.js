/**
 * ui.js — Renderização de DOM: mensagens, usuários online, status.
 */
window.ChatUI = (() => {

  const $ = id => document.getElementById(id);

  // ── Screens ─────────────────────────────────────────────────────────
  function showLogin()  {
    $('login-screen').classList.add('active');
    $('login-screen').classList.remove('hidden');
    $('chat-screen').classList.add('hidden');
    $('chat-screen').classList.remove('active');
  }

  // Limpa o estado do chat e volta para a tela de login.
  function resetChat() {
    // Limpar mensagens
    const container = $('messages-container');
    container.innerHTML = '<div class="intro-banner"><p>👋 Envie uma mensagem para se apresentar à sala!</p></div>';
    // Limpar lista de online
    $('online-users').innerHTML = '';
    $('online-count').textContent = '0';
    // Limpar inputs
    $('message-input').value = '';
    $('message-input').disabled = true;
    $('send-btn').disabled = true;
    $('nickname-input').value = '';
    // Voltar para login
    showLogin();
  }

  function showChat(nick) {
    $('chat-screen').classList.add('active');
    $('chat-screen').classList.remove('hidden');
    $('login-screen').classList.remove('active');
    $('login-screen').classList.add('hidden');
    $('my-nickname').textContent = nick;
    $('message-input').disabled = false;
    $('send-btn').disabled = false;
    $('message-input').focus();
  }

  // ── Status dot ──────────────────────────────────────────────────────
  function setStatus(state) { // 'connecting' | 'connected' | 'error'
    const dot = $('connection-status');
    dot.className = 'status-dot ' + state;
    dot.title = { connecting: 'Conectando...', connected: 'Conectado', error: 'Desconectado' }[state] || state;
  }

  // ── Messages ─────────────────────────────────────────────────────────

  // Renderiza o conteúdo da mensagem com @menções em negrito.
  // Retorna true se myNick foi mencionado.
  function renderContent(textEl, content, myNick) {
    // Regex: @palavra (letras, números, _, -, #)
    const mentionRe = /@([\w\-#]+)/g;
    let lastIdx = 0;
    let matched;
    let isMentioned = false;

    // Base do nickname para comparação: "Robson#4821" → "Robson" e "Robson#4821"
    const myBase = myNick ? myNick.replace(/#\d+$/, '').toLowerCase() : '';
    const myFull = myNick ? myNick.toLowerCase() : '';

    while ((matched = mentionRe.exec(content)) !== null) {
      // texto antes da menção
      if (matched.index > lastIdx) {
        textEl.appendChild(document.createTextNode(content.slice(lastIdx, matched.index)));
      }
      const mentionWord = matched[1];
      const mentionLower = mentionWord.toLowerCase();

      // Verificar se é menção ao usuário atual (base ou full)
      if (myNick && (mentionLower === myFull || mentionLower === myBase)) {
        isMentioned = true;
      }

      const span = document.createElement('span');
      span.className = 'mention-text';
      span.textContent = '@' + mentionWord;
      textEl.appendChild(span);
      lastIdx = matched.index + matched[0].length;
    }

    // texto restante após a última menção
    if (lastIdx < content.length) {
      textEl.appendChild(document.createTextNode(content.slice(lastIdx)));
    }

    return isMentioned;
  }

  function appendMessage(env, myNick, opts) {
    // opts: { fromHistory: bool } — mensagens do histórico não disparam notificações
    const fromHistory = opts && opts.fromHistory;
    const container = $('messages-container');

    if (env.type === 'system') {
      const el = document.createElement('div');
      el.className = 'msg system';
      el.textContent = '— ' + env.content + ' —';
      container.appendChild(el);
      scrollBottom();
      return { isMention: false };
    }

    if (env.type !== 'message') return { isMention: false };

    const isMe = env.user === myNick;
    const el = document.createElement('div');
    el.className = 'msg ' + (isMe ? 'mine' : 'other');

    const header = document.createElement('div');
    header.className = 'msg-header';

    const userSpan = document.createElement('span');
    userSpan.className = 'msg-user';
    userSpan.textContent = isMe ? 'Você' : env.user;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'msg-time';
    timeSpan.textContent = formatTime(env.ts);

    header.appendChild(userSpan);
    header.appendChild(timeSpan);

    const text = document.createElement('div');
    text.className = 'msg-text';

    // Renderiza conteúdo com menções em negrito
    const isMentioned = !isMe && !fromHistory
      ? renderContent(text, env.content, myNick)
      : (text.textContent = env.content, false);

    if (isMentioned) el.classList.add('mention');

    el.appendChild(header);
    el.appendChild(text);
    container.appendChild(el);
    scrollBottom();
    return { isMention: isMentioned };
  }

  function loadHistory(messages, myNick) {
    // Remove o banner de intro antes de carregar histórico
    const banner = document.querySelector('.intro-banner');
    if (banner && messages.length > 0) banner.remove();

    messages.forEach(m => appendMessage(m, myNick, { fromHistory: true }));
  }

  function scrollBottom() {
    const c = $('messages-container');
    c.scrollTop = c.scrollHeight;
  }

  // ── Online list ───────────────────────────────────────────────────────
  function updateOnline(users, myNick) {
    const list = $('online-users');
    const count = $('online-count');
    count.textContent = users.length;
    list.innerHTML = '';
    // Ordenar: eu primeiro, depois alfabético
    const sorted = [...users].sort((a, b) => {
      if (a === myNick) return -1;
      if (b === myNick) return 1;
      return a.localeCompare(b);
    });
    sorted.forEach(nick => {
      const li = document.createElement('li');
      if (nick === myNick) li.classList.add('me');
      li.textContent = nick;
      list.appendChild(li);
    });
  }

  // ── Intro banner ──────────────────────────────────────────────────────
  function removeIntroBanner() {
    const banner = document.querySelector('.intro-banner');
    if (banner) banner.remove();
  }

  // ── Rate warning ─────────────────────────────────────────────────────
  function showRateWarning() {
    const w = $('rate-warning');
    w.classList.remove('hidden');
    setTimeout(() => w.classList.add('hidden'), 5000);
  }

  // ── Nickname error ───────────────────────────────────────────────────
  function setNicknameError(msg) {
    const el = $('nickname-error');
    el.textContent = msg;
    el.classList.remove('hidden');
  }
  function clearNicknameError() {
    const el = $('nickname-error');
    el.textContent = '';
    el.classList.add('hidden');
  }

  // ── Char counter ─────────────────────────────────────────────────────
  function updateCharCount(n) {
    $('char-count').textContent = n;
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  function formatTime(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  }

  return {
    showLogin, showChat, setStatus, resetChat,
    appendMessage, loadHistory,
    updateOnline, removeIntroBanner,
    showRateWarning,
    setNicknameError, clearNicknameError,
    updateCharCount,
  };
})();
