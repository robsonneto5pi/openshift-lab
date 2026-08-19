package redis

import (
	"context"
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

func (c *Client) IncrRate(ctx context.Context, nickname string) (int64, error) {
	key := "ratelimit:" + nickname
	pipe := c.rdb.Pipeline()
	incr := pipe.Incr(ctx, key)
	pipe.Expire(ctx, key, 60*time.Second)
	_, err := pipe.Exec(ctx)
	if err != nil {
		return 0, err
	}
	return incr.Val(), nil
}
