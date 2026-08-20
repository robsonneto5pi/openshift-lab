package redis

import (
	"context"
	"fmt"
	"math/rand"
	"strings"
	"time"

	goredis "github.com/go-redis/redis/v8"
)

// Client wraps go-redis/v8 com helpers usados pelo chat.
type Client struct {
	rdb *goredis.Client
}

func NewClient(addr, password string) *Client {
	rdb := goredis.NewClient(&goredis.Options{
		Addr:     addr,
		Password: password,
		DB:       0,
	})
	return &Client{rdb: rdb}
}

func (c *Client) Ping(ctx context.Context) error {
	return c.rdb.Ping(ctx).Err()
}

func (c *Client) Close() error {
	return c.rdb.Close()
}

// --- Histórico ----------------------------------------------------------

const historyKey = "chat:history"

func (c *Client) PushHistory(ctx context.Context, payload string, limit int64) error {
	pipe := c.rdb.Pipeline()
	pipe.LPush(ctx, historyKey, payload)
	pipe.LTrim(ctx, historyKey, 0, limit-1)
	_, err := pipe.Exec(ctx)
	return err
}

func (c *Client) GetHistory(ctx context.Context, limit int64) ([]string, error) {
	return c.rdb.LRange(ctx, historyKey, 0, limit-1).Result()
}

// --- Presença -----------------------------------------------------------

const onlineKey = "chat:online"

func (c *Client) AddOnline(ctx context.Context, nickname string) error {
	return c.rdb.SAdd(ctx, onlineKey, nickname).Err()
}

func (c *Client) RemoveOnline(ctx context.Context, nickname string) error {
	return c.rdb.SRem(ctx, onlineKey, nickname).Err()
}

func (c *Client) GetOnline(ctx context.Context) ([]string, error) {
	return c.rdb.SMembers(ctx, onlineKey).Result()
}

// --- Pub/Sub ------------------------------------------------------------

const globalChannel = "chat:global"

func (c *Client) Publish(ctx context.Context, payload string) error {
	return c.rdb.Publish(ctx, globalChannel, payload).Err()
}

func (c *Client) Subscribe(ctx context.Context) *goredis.PubSub {
	return c.rdb.Subscribe(ctx, globalChannel)
}

// --- Rate Limiting ------------------------------------------------------

func (c *Client) IncrRate(ctx context.Context, userId string) (int64, error) {
	key := "ratelimit:" + userId
	pipe := c.rdb.Pipeline()
	incr := pipe.Incr(ctx, key)
	pipe.Expire(ctx, key, 60*time.Second)
	_, err := pipe.Exec(ctx)
	if err != nil {
		return 0, err
	}
	return incr.Val(), nil
}

// --- Discriminator (nicknames duplicados) --------------------------------

// namesKey retorna a chave do set de discriminadores em uso para um base-nickname.
func namesKey(base string) string {
	return "chat:names:" + strings.ToLower(base)
}

// ClaimDiscriminator tenta reservar um discriminador 4 dígitos único para base.
// Retorna o displayName completo (ex: "Robson#4821") ou erro se esgotado.
func (c *Client) ClaimDiscriminator(ctx context.Context, base string) (string, error) {
	key := namesKey(base)
	for attempts := 0; attempts < 20; attempts++ {
		disc := fmt.Sprintf("%04d", rand.Intn(10000))
		added, err := c.rdb.SAdd(ctx, key, disc).Result()
		if err != nil {
			return "", err
		}
		if added == 1 {
			// Reservado com sucesso — TTL de 24h para limpeza automática em crash
			c.rdb.Expire(ctx, key, 24*time.Hour)
			return base + "#" + disc, nil
		}
	}
	return "", fmt.Errorf("discriminators exhausted for %s", base)
}

// ReleaseDiscriminator libera o discriminador quando o usuário desconecta.
func (c *Client) ReleaseDiscriminator(ctx context.Context, base, discriminator string) error {
	return c.rdb.SRem(ctx, namesKey(base), discriminator).Err()
}

// IsNicknameTaken retorna true se o nickname exato já está no set online.
func (c *Client) IsNicknameTaken(ctx context.Context, nickname string) (bool, error) {
	return c.rdb.SIsMember(ctx, onlineKey, nickname).Result()
}
