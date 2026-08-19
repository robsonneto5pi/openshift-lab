package chat

import (
	"encoding/json"
	"log"
	"net/http"
	"time"
	"unicode"

	"github.com/gorilla/websocket"
)

const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = 45 * time.Second
	maxMsgSize = 1024
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true }, // aceita qualquer origem (lab)
}

// Client representa uma conexão WebSocket individual.
type Client struct {
	hub      *Hub
	conn     *websocket.Conn
	send     chan []byte
	nickname string
	active   bool // false até enviar a primeira mensagem
}

func (c *Client) sendError(msg string) {
	env := Envelope{Type: TypeError, Content: msg}
	b, _ := json.Marshal(env)
	select {
	case c.send <- b:
	default:
	}
}

// readPump lê mensagens do WebSocket e encaminha para o Hub.
func (c *Client) readPump() {
	defer func() {
		c.hub.unregist <- c
		c.conn.Close()
	}()
	c.conn.SetReadLimit(maxMsgSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})
	for {
		_, msg, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WS read error [%s]: %v", c.nickname, err)
			}
			break
		}
		c.hub.HandleMessage(c, msg)
	}
}

// writePump drena o canal send e escreve no WebSocket.
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			_, _ = w.Write(msg)
			// flush mensagens pendentes no mesmo frame
			n := len(c.send)
			for i := 0; i < n; i++ {
				_, _ = w.Write([]byte("\n"))
				_, _ = w.Write(<-c.send)
			}
			if err = w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// ServeWs faz o upgrade HTTP→WS e registra o client no Hub.
func ServeWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	nickname := r.URL.Query().Get("nickname")
	if err := validateNickname(nickname); err != "" {
		http.Error(w, err, http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WS upgrade error: %v", err)
		return
	}
	client := &Client{
		hub:      hub,
		conn:     conn,
		send:     make(chan []byte, 256),
		nickname: nickname,
		active:   false,
	}
	hub.register <- client
	go client.writePump()
	go client.readPump()
}

// validateNickname retorna mensagem de erro ou "" se válido.
func validateNickname(n string) string {
	if len(n) < 3 || len(n) > 20 {
		return "Nickname deve ter entre 3 e 20 caracteres"
	}
	for _, r := range n {
		if !unicode.IsLetter(r) && !unicode.IsDigit(r) && r != '_' && r != '-' {
			return "Nickname deve conter apenas letras, números, _ ou -"
		}
	}
	return ""
}
