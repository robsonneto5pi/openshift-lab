package chat

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	rdb "github.com/openshift-lab/chat-backend/redis"
)

// mentionRe captura @palavra (letras, dígitos, _, -, #)
var mentionRe = regexp.MustCompile(`@([\w\-#]+)`)

// MessageType distingue os tipos de mensagem trafegados via WebSocket.
type MessageType string

const (
	TypeMessage MessageType = "message" // mensagem normal
	TypeSystem  MessageType = "system"  // entrada/saída de usuário
	TypeHistory MessageType = "history" // batch de histórico
	TypeOnline  MessageType = "online"  // atualização da lista de online
	TypeError   MessageType = "error"   // erro de validação
	TypeLeave   MessageType = "leave"   // cliente solicitou sair da sala
	TypeWelcome MessageType = "welcome" // enviado ao cliente logo após conexão
)

// Envelope é o formato JSON usado em todas as trocas WS ↔ servidor.
type Envelope struct {
	Type        MessageType `json:"type"`
	User        string      `json:"user,omitempty"`
	UserId      string      `json:"userId,omitempty"`      // UUID da sessão
	RequestedAs string      `json:"requestedAs,omitempty"` // nickname original digitado
	Content     string      `json:"content,omitempty"`
	Timestamp   string      `json:"ts,omitempty"`
	Online      []string    `json:"online,omitempty"`
	Messages    []Envelope  `json:"messages,omitempty"`
	Mentions    []string    `json:"mentions,omitempty"` // nicknames ativos mencionados no conteúdo
}

func newEnvelope(t MessageType, user, content string) Envelope {
	return Envelope{
		Type:      t,
		User:      user,
		Content:   content,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}
}

func marshal(e Envelope) []byte {
	b, _ := json.Marshal(e)
	return b
}

// Hub mantém todos os clientes conectados e coordena o broadcast via Redis Pub/Sub.
type Hub struct {
	mu        sync.RWMutex
	clients   map[*Client]bool
	broadcast chan []byte   // mensagens vindas do Redis para os WS clients
	register  chan *Client
	unregist  chan *Client
	redis     *rdb.Client

	historyLimit int64
	rateLimit    int64
}

func NewHub(r *rdb.Client) *Hub {
	historyLimit, _ := strconv.ParseInt(getEnv("HISTORY_LIMIT", "100"), 10, 64)
	rateLimit, _ := strconv.ParseInt(getEnv("RATE_LIMIT", "10"), 10, 64)
	return &Hub{
		clients:      make(map[*Client]bool),
		broadcast:    make(chan []byte, 256),
		register:     make(chan *Client, 16),
		unregist:     make(chan *Client, 16),
		redis:        r,
		historyLimit: historyLimit,
		rateLimit:    rateLimit,
	}
}

// Run é a goroutine principal do Hub.
func (h *Hub) Run() {
	// Goroutine que escuta o Redis Pub/Sub e injeta mensagens no canal broadcast.
	go h.subscribeRedis()

	for {
		select {
		case c := <-h.register:
			h.mu.Lock()
			h.clients[c] = true
			h.mu.Unlock()
			// Enviar welcome antes do histórico: cliente atualiza displayName imediatamente
			h.sendWelcome(c)
			h.sendHistory(c)
			h.broadcastOnlineList()

		case c := <-h.unregist:
			h.mu.Lock()
			if _, ok := h.clients[c]; ok {
				delete(h.clients, c)
				close(c.send)
			}
			h.mu.Unlock()
			if c.active {
				h.publishSystem(c.displayName + " saiu da sala")
				_ = h.redis.RemoveOnline(context.Background(), c.displayName)
			}
			// Liberar discriminador se o displayName tem sufixo #XXXX
			if c.discriminator != "" {
				_ = h.redis.ReleaseDiscriminator(
					context.Background(), c.baseName, c.discriminator)
			}
			h.broadcastOnlineList()

		case msg := <-h.broadcast:
			h.mu.RLock()
			for c := range h.clients {
				select {
				case c.send <- msg:
				default:
					// canal cheio → remover cliente
				}
			}
			h.mu.RUnlock()
		}
	}
}

// subscribeRedis escuta o canal global Redis e envia para o canal broadcast local.
func (h *Hub) subscribeRedis() {
	ctx := context.Background()
	for {
		ps := h.redis.Subscribe(ctx)
		ch := ps.Channel()
		log.Println("Redis PubSub: subscribed to chat:global")
		for msg := range ch {
			h.broadcast <- []byte(msg.Payload)
		}
		log.Println("Redis PubSub: channel closed, reconnecting in 2s...")
		_ = ps.Close()
		time.Sleep(2 * time.Second)
	}
}

// sendHistory envia o histórico recente ao cliente que acabou de conectar.
func (h *Hub) sendHistory(c *Client) {
	ctx := context.Background()
	raw, err := h.redis.GetHistory(ctx, h.historyLimit)
	if err != nil || len(raw) == 0 {
		return
	}
	msgs := make([]Envelope, 0, len(raw))
	for i := len(raw) - 1; i >= 0; i-- { // inverter: mais antigo primeiro
		var e Envelope
		if err2 := json.Unmarshal([]byte(raw[i]), &e); err2 == nil {
			msgs = append(msgs, e)
		}
	}
	env := Envelope{Type: TypeHistory, Messages: msgs}
	b, _ := json.Marshal(env)
	select {
	case c.send <- b:
	default:
	}
}

// sendWelcome envia o envelope welcome ao cliente recém-conectado.
func (h *Hub) sendWelcome(c *Client) {
	env := Envelope{
		Type:        TypeWelcome,
		User:        c.displayName,
		UserId:      c.userId,
		RequestedAs: c.baseName,
	}
	b, _ := json.Marshal(env)
	select {
	case c.send <- b:
	default:
	}
}

// broadcastOnlineList publica a lista de usuários online para todos os clients locais.
func (h *Hub) broadcastOnlineList() {
	ctx := context.Background()
	online, _ := h.redis.GetOnline(ctx)
	env := Envelope{Type: TypeOnline, Online: online}
	b, _ := json.Marshal(env)
	h.mu.RLock()
	for c := range h.clients {
		select {
		case c.send <- b:
		default:
		}
	}
	h.mu.RUnlock()
}

// publishSystem publica uma mensagem de sistema via Redis (broadcast entre réplicas).
func (h *Hub) publishSystem(content string) {
	env := newEnvelope(TypeSystem, "", content)
	payload, _ := json.Marshal(env)
	ctx := context.Background()
	_ = h.redis.Publish(ctx, string(payload))
	_ = h.redis.PushHistory(ctx, string(payload), h.historyLimit)
}

// HandleMessage processa uma mensagem recebida de um client WS.
func (h *Hub) HandleMessage(c *Client, raw []byte) {
	var incoming struct {
		Type    MessageType `json:"type"`
		Content string      `json:"content"`
	}
	if err := json.Unmarshal(raw, &incoming); err != nil {
		c.sendError("Formato inválido")
		return
	}

	// Solicitação de saída intencional: envia close frame; readPump dispara unregist.
	if incoming.Type == TypeLeave {
		_ = c.conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, "leave"))
		return
	}

	// Validação de conteúdo
	content := incoming.Content
	if len(content) == 0 {
		c.sendError("Mensagem vazia")
		return
	}
	if len(content) > 500 {
		c.sendError("Mensagem muito longa (máx 500 caracteres)")
		return
	}

	// Rate limiting (por userId — não nickname)
	ctx := context.Background()
	count, err := h.redis.IncrRate(ctx, c.userId)
	if err == nil && count > h.rateLimit {
		c.sendError("Limite de mensagens atingido. Aguarde 1 minuto.")
		return
	}

	// Primeira mensagem → ativar usuário
	if !c.active {
		c.active = true
		_ = h.redis.AddOnline(ctx, c.displayName)
		h.publishSystem(c.displayName + " entrou na sala")
		h.broadcastOnlineList()
	}

	// Detectar menções e incluir no envelope
	online, _ := h.redis.GetOnline(ctx)
	env := newEnvelope(TypeMessage, c.displayName, content)
	env.UserId = c.userId
	env.Mentions = parseMentions(content, online)

	// Publicar mensagem
	payload, _ := json.Marshal(env)
	_ = h.redis.Publish(ctx, string(payload))
	_ = h.redis.PushHistory(ctx, string(payload), h.historyLimit)
}

// parseMentions extrai @menções do texto e retorna os nicknames que estão ativos.
// Aceita @Base e @Base#XXXX — ambos resolvem contra a lista online.
func parseMentions(content string, online []string) []string {
	matches := mentionRe.FindAllStringSubmatch(content, -1)
	if len(matches) == 0 {
		return nil
	}

	// Índice online: nick_lower → nick_original
	onlineIdx := make(map[string]string, len(online))
	for _, nick := range online {
		onlineIdx[strings.ToLower(nick)] = nick
		// também indexar a base sem discriminador: "robson#1234" → "robson"
		if base, _, found := strings.Cut(strings.ToLower(nick), "#"); found {
			if _, exists := onlineIdx[base]; !exists {
				onlineIdx[base] = nick
			}
		}
	}

	seen := make(map[string]bool)
	var result []string
	for _, m := range matches {
		lower := strings.ToLower(m[1])
		if nick, ok := onlineIdx[lower]; ok && !seen[nick] {
			seen[nick] = true
			result = append(result, nick)
		}
	}
	return result
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
