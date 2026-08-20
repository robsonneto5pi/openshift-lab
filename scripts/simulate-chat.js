/**
 * simulate-chat.js
 * Simulação de carga: N usuários concorrentes enviando mensagens via WebSocket
 *
 * Uso:
 *   node simulate-chat.js [numUsers] [totalMessages] [wsUrl]
 *
 * Defaults:
 *   numUsers      = 5
 *   totalMessages = 100
 *   wsUrl         = wss://golang-sample-openshift-lab.apps.itz-1y1puu.infra01-lb.fra02.techzone.ibm.com/ws
 */

const WebSocket = require('ws');

const NUM_USERS     = parseInt(process.argv[2]) || 10;
const TOTAL_MSGS    = parseInt(process.argv[3]) || 100;
const WS_URL        = process.argv[4] || 'wss://golang-sample-openshift-lab.apps.itz-1y1puu.infra01-lb.fra02.techzone.ibm.com/ws';
const MSG_INTERVAL  = 200; // ms entre mensagens por usuário

const stats = {
  connected:   0,
  sent:        0,
  received:    0,
  errors:      0,
  latencies:   [],
  startTime:   null,
  endTime:     null,
};

const pendingAcks = new Map(); // msgId → timestamp sent

function pad(n, w = 2) { return String(n).padStart(w, '0'); }
function ts() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function log(msg) { console.log(`[${ts()}] ${msg}`); }

function printStats() {
  const elapsed  = ((stats.endTime || Date.now()) - stats.startTime) / 1000;
  const avgLat   = stats.latencies.length
    ? (stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length).toFixed(1)
    : 'N/A';
  const minLat   = stats.latencies.length ? Math.min(...stats.latencies) : 'N/A';
  const maxLat   = stats.latencies.length ? Math.max(...stats.latencies) : 'N/A';
  const throughput = (stats.sent / elapsed).toFixed(2);

  console.log('\n' + '═'.repeat(55));
  console.log('  RESULTADO DA SIMULAÇÃO');
  console.log('═'.repeat(55));
  console.log(`  Usuários concorrentes : ${NUM_USERS}`);
  console.log(`  Mensagens enviadas    : ${stats.sent}`);
  console.log(`  Mensagens recebidas   : ${stats.received}`);
  console.log(`  Erros                 : ${stats.errors}`);
  console.log(`  Duração               : ${elapsed.toFixed(2)}s`);
  console.log(`  Throughput            : ${throughput} msg/s`);
  console.log(`  Latência média (RTT)  : ${avgLat} ms`);
  console.log(`  Latência mín/máx      : ${minLat} / ${maxLat} ms`);
  console.log(`  Fator de broadcast    : ${stats.sent > 0 ? (stats.received / stats.sent).toFixed(1) : 'N/A'}x`);
  console.log('═'.repeat(55));
}

function createUser(userId, msgsToSend) {
  return new Promise((resolve) => {
    const username = `user${pad(userId, 2)}`;
    let msgsSent = 0;
    let intervalHandle = null;

    // Backend exige ?nickname= na query string (validado em ServeWs)
    const url = `${WS_URL}?nickname=${encodeURIComponent(username)}`;
    const ws = new WebSocket(url, { rejectUnauthorized: false });

    ws.on('open', () => {
      stats.connected++;
      log(`✓ ${username} conectado (${stats.connected}/${NUM_USERS})`);

      // Iniciar envio de mensagens após pequena pausa
      setTimeout(() => {
        intervalHandle = setInterval(() => {
          if (msgsSent >= msgsToSend) {
            clearInterval(intervalHandle);
            // Aguarda 2s para receber broadcasts pendentes antes de fechar
            setTimeout(() => {
              ws.close();
              resolve();
            }, 2000);
            return;
          }

          const msgId  = `${username}-${msgsSent + 1}`;
          // Backend espera payload { content: "..." }
          const text    = `[${msgId}] Ola do ${username} msg ${msgsSent + 1}/${msgsToSend}`;
          const payload = JSON.stringify({ content: text });

          pendingAcks.set(msgId, Date.now());
          ws.send(payload);
          stats.sent++;
          msgsSent++;

          if (msgsSent % 10 === 0) {
            log(`  → ${username}: ${msgsSent}/${msgsToSend} msgs enviadas`);
          }
        }, MSG_INTERVAL * NUM_USERS); // distribui carga entre usuários
      }, 200);
    });

    ws.on('message', (raw) => {
      // Cada frame pode conter múltiplos JSONs separados por \n
      const lines = raw.toString().split('\n').filter(l => l.trim());
      lines.forEach(line => {
        stats.received++;
        try {
          const msg = JSON.parse(line);
          // Detectar broadcast da própria mensagem para calcular RTT
          const content = msg.content || msg.text || '';
          const match = content.match(/\[([^\]]+)\]/);
          if (match) {
            const msgId = match[1];
            if (pendingAcks.has(msgId)) {
              const latency = Date.now() - pendingAcks.get(msgId);
              stats.latencies.push(latency);
              pendingAcks.delete(msgId);
            }
          }
        } catch (_) {}
      });
    });

    ws.on('error', (err) => {
      stats.errors++;
      log(`✗ ${username} erro: ${err.message}`);
      if (intervalHandle) clearInterval(intervalHandle);
      resolve(); // não bloqueia os outros usuários
    });

    ws.on('close', () => {
      if (intervalHandle) clearInterval(intervalHandle);
      log(`  ✕ ${username} desconectado`);
    });
  });
}

async function main() {
  console.log('═'.repeat(55));
  console.log('  SIMULAÇÃO DE CARGA — OpenShift Chat MVP');
  console.log('═'.repeat(55));
  log(`Alvo    : ${WS_URL}`);
  log(`Usuários: ${NUM_USERS}`);
  log(`Msgs    : ${TOTAL_MSGS} total (~${Math.ceil(TOTAL_MSGS / NUM_USERS)} por usuário)`);
  console.log('');

  const msgsPerUser = Math.ceil(TOTAL_MSGS / NUM_USERS);
  stats.startTime = Date.now();

  // Escalonar conexões com 300ms de intervalo para evitar spike inicial
  const promises = [];
  for (let i = 1; i <= NUM_USERS; i++) {
    await new Promise(r => setTimeout(r, 300));
    promises.push(createUser(i, msgsPerUser));
  }

  await Promise.all(promises);

  stats.endTime = Date.now();
  printStats();
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
