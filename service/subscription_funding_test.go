package service

// 服务层"无预扣会话"资金决策矩阵与 PostConsumeQuota 资金路由测试。
//
// 覆盖：
//   - postConsumeFundingWithoutSession 四种计费偏好分支（含空值归一化为默认偏好）
//   - chargeSubscriptionWithoutSession 扣费成功 / 额度不足 / 钱包回退信号 / requestId 幂等
//   - PostConsumeQuota 在 BillingSource=subscription 与钱包两条路径上的落库结果
//
// 说明：task_billing_test.go 的 TestMain 已初始化内存 SQLite 并迁移了
// users / user_subscriptions 等表；本文件只补充订阅套餐与幂等记录两张表。

import (
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---------------------------------------------------------------------------
// 附加 schema 与种子助手（包级 TestMain 已就绪：users/tokens/channels/
// subscription_plans/user_subscriptions 等；这里只补幂等记录表）
// ---------------------------------------------------------------------------

var migrateFundingTablesOnce sync.Once

func migrateFundingTables(t *testing.T) {
	t.Helper()
	migrateFundingTablesOnce.Do(func() {
		if err := model.DB.AutoMigrate(
			&model.SubscriptionPreConsumeRecord{},
		); err != nil {
			panic("failed to migrate funding test tables: " + err.Error())
		}
	})
}

// cleanupFundingTables 清理本文件创建的订阅套餐/幂等记录行；
// users / user_subscriptions 等既有表由 task_billing_test.go 的 truncate(t) 负责。
func cleanupFundingTables(t *testing.T) {
	t.Helper()
	t.Cleanup(func() {
		model.DB.Exec("DELETE FROM subscription_pre_consume_records")
		model.DB.Exec("DELETE FROM subscription_plans")
	})
}

var (
	fundingUserIdSeq  int32
	fundingPlanIdSeq  int32
	fundingSubIdSeq   int32
	fundingRequestSeq int32
)

func nextFundingUserId() int { return int(atomic.AddInt32(&fundingUserIdSeq, 1)) + 600000 }
func nextFundingPlanId() int { return int(atomic.AddInt32(&fundingPlanIdSeq, 1)) + 900000 }
func nextFundingSubId() int  { return int(atomic.AddInt32(&fundingSubIdSeq, 1)) + 800000 }

func nextFundingRequestId() string {
	return fmt.Sprintf("funding-req-%d", atomic.AddInt32(&fundingRequestSeq, 1))
}

func seedFundingUser(t *testing.T, userId int, quota int) {
	t.Helper()
	user := &model.User{
		Id:       userId,
		Username: fmt.Sprintf("funding_user_%d", userId),
		Quota:    quota,
		Status:   common.UserStatusEnabled,
		AffCode:  fmt.Sprintf("aff-%d", userId), // aff_code 唯一索引，fixture 须显式赋值
	}
	require.NoError(t, model.DB.Create(user).Error)
}

type fundingSubSeed struct {
	Total               int64
	Used                int64
	AllowWalletOverflow bool
	EndOffset           time.Duration // 正数=未来到期，负数=已过期
}

func seedFundingPlan(t *testing.T, planId int, total int64) {
	t.Helper()
	allow := true
	plan := &model.SubscriptionPlan{
		Id:                  planId,
		Title:               fmt.Sprintf("funding plan %d", planId),
		TotalAmount:         total,
		QuotaResetPeriod:    "", // NormalizeResetPeriod("") == never，避免触发重置分支
		AllowWalletOverflow: &allow,
	}
	require.NoError(t, model.DB.Create(plan).Error)
}

func seedFundingSubscription(t *testing.T, userId int, subId int, seed fundingSubSeed) {
	t.Helper()
	planId := nextFundingPlanId()
	seedFundingPlan(t, planId, seed.Total)
	now := time.Now()
	sub := &model.UserSubscription{
		Id:                  subId,
		UserId:              userId,
		PlanId:              planId,
		AmountTotal:         seed.Total,
		AmountUsed:          seed.Used,
		Status:              "active",
		StartTime:           now.Add(-24 * time.Hour).Unix(),
		EndTime:             now.Add(seed.EndOffset).Unix(),
		AllowWalletOverflow: seed.AllowWalletOverflow,
	}
	require.NoError(t, model.DB.Create(sub).Error)
}

func makeFundingRelayInfo(userId int, pref string) *relaycommon.RelayInfo {
	return &relaycommon.RelayInfo{
		UserId:       userId,
		RequestId:    nextFundingRequestId(),
		IsPlayground: true, // 跳过 TokenId/TokenKey 配额分支，聚焦用户/订阅资金
		UserSetting:  dto.UserSetting{BillingPreference: pref},
	}
}

func readSubscriptionUsed(t *testing.T, subId int) int64 {
	t.Helper()
	var sub model.UserSubscription
	require.NoError(t, model.DB.Where("id = ?", subId).First(&sub).Error)
	return sub.AmountUsed
}

// ---------------------------------------------------------------------------
// postConsumeFundingWithoutSession / chargeSubscriptionWithoutSession 矩阵
// ---------------------------------------------------------------------------

func TestPostConsumeFundingWithoutSession_PreferenceMatrix(t *testing.T) {
	migrateFundingTables(t)
	truncate(t)
	cleanupFundingTables(t)

	activeSub := func(total, used int64, overflow bool) fundingSubSeed {
		return fundingSubSeed{Total: total, Used: used, AllowWalletOverflow: overflow, EndOffset: 24 * time.Hour}
	}

	cases := []struct {
		name             string
		pref             string
		walletQuota      int
		amount           int
		subs             []fundingSubSeed
		wantErr          bool
		wantCharged      bool
		wantChargedIndex int // 命中第几条（0-based）；-1 表示不命中
	}{
		{
			name:        "wallet_only ignores active subscription",
			pref:        "wallet_only",
			walletQuota: 10_000,
			amount:      100,
			subs:        []fundingSubSeed{activeSub(500, 0, true)},
			wantCharged: false,
		},
		{
			name:        "subscription_only charges active subscription",
			pref:        "subscription_only",
			walletQuota: 10_000,
			amount:      100,
			subs:        []fundingSubSeed{activeSub(500, 0, true)},
			wantCharged: true, wantChargedIndex: 0,
		},
		{
			name:        "subscription_only without subscription fails",
			pref:        "subscription_only",
			walletQuota: 10_000,
			amount:      100,
			wantErr:     true,
		},
		{
			name:        "subscription_only insufficient subscription fails despite overflow flag",
			pref:        "subscription_only",
			walletQuota: 10_000,
			amount:      1_000,
			subs:        []fundingSubSeed{activeSub(500, 0, true)},
			wantErr:     true,
		},
		{
			name:        "subscription_first without subscription falls back to wallet",
			pref:        "subscription_first",
			walletQuota: 10_000,
			amount:      100,
			wantCharged: false,
		},
		{
			name:        "empty preference defaults to subscription_first and charges",
			pref:        "",
			walletQuota: 10_000,
			amount:      100,
			subs:        []fundingSubSeed{activeSub(500, 0, true)},
			wantCharged: true, wantChargedIndex: 0,
		},
		{
			name:        "subscription_first insufficient with overflow allowed falls back to wallet",
			pref:        "subscription_first",
			walletQuota: 10_000,
			amount:      1_000,
			subs:        []fundingSubSeed{activeSub(500, 0, true)},
			wantCharged: false,
		},
		{
			name:        "subscription_first insufficient without overflow fails",
			pref:        "subscription_first",
			walletQuota: 10_000,
			amount:      1_000,
			subs:        []fundingSubSeed{activeSub(500, 0, false)},
			wantErr:     true,
		},
		{
			name:        "subscription exact fit is charged",
			pref:        "subscription_only",
			walletQuota: 10_000,
			amount:      500,
			subs:        []fundingSubSeed{activeSub(500, 0, true)},
			wantCharged: true, wantChargedIndex: 0,
		},
		{
			name:        "wallet_first with sufficient wallet keeps wallet",
			pref:        "wallet_first",
			walletQuota: 10_000,
			amount:      100,
			subs:        []fundingSubSeed{activeSub(500, 0, true)},
			wantCharged: false,
		},
		{
			name:        "wallet_first with insufficient wallet charges subscription",
			pref:        "wallet_first",
			walletQuota: 50,
			amount:      100,
			subs:        []fundingSubSeed{activeSub(500, 0, true)},
			wantCharged: true, wantChargedIndex: 0,
		},
		{
			name:        "wallet_first with insufficient wallet and subscription fails",
			pref:        "wallet_first",
			walletQuota: 50,
			amount:      1_000,
			subs:        []fundingSubSeed{activeSub(500, 0, true)},
			wantErr:     true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			userId := nextFundingUserId()
			seedFundingUser(t, userId, tc.walletQuota)

			subIds := make([]int, 0, len(tc.subs))
			for _, seed := range tc.subs {
				subId := nextFundingSubId()
				seedFundingSubscription(t, userId, subId, seed)
				subIds = append(subIds, subId)
			}

			relay := makeFundingRelayInfo(userId, tc.pref)
			charged, err := postConsumeFundingWithoutSession(relay, tc.amount)

			if tc.wantErr {
				require.Error(t, err)
				assert.False(t, charged)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tc.wantCharged, charged)

			for i, subId := range subIds {
				wantUsed := tc.subs[i].Used
				if tc.wantCharged && i == tc.wantChargedIndex {
					wantUsed += int64(tc.amount)
				}
				assert.Equalf(t, wantUsed, readSubscriptionUsed(t, subId), "subscription %d", subId)
			}

			if tc.wantCharged {
				chargedSubId := subIds[tc.wantChargedIndex]
				assert.Equal(t, BillingSourceSubscription, relay.BillingSource)
				assert.Equal(t, chargedSubId, relay.SubscriptionId)
				assert.Equal(t, int64(tc.amount), relay.SubscriptionPreConsumed)
				assert.NotEmpty(t, relay.SubscriptionPlanTitle)
			} else {
				assert.Empty(t, relay.BillingSource)
				assert.Zero(t, relay.SubscriptionId)
			}
		})
	}
}

// chargeSubscriptionWithoutSession：同一 requestId 的幂等记录避免重复扣费。
func TestChargeSubscriptionWithoutSession_RequestIdIdempotent(t *testing.T) {
	migrateFundingTables(t)
	truncate(t)
	cleanupFundingTables(t)

	userId := nextFundingUserId()
	seedFundingUser(t, userId, 10_000)
	subId := nextFundingSubId()
	seedFundingSubscription(t, userId, subId, fundingSubSeed{
		Total: 500, Used: 0, AllowWalletOverflow: true, EndOffset: 24 * time.Hour,
	})

	relay := makeFundingRelayInfo(userId, "subscription_only")
	charged, err := chargeSubscriptionWithoutSession(relay, 100, "subscription_only")
	require.NoError(t, err)
	require.True(t, charged)
	assert.Equal(t, int64(100), readSubscriptionUsed(t, subId))

	// 同一请求再次上报：命中既有幂等记录，余额不再变化
	charged, err = chargeSubscriptionWithoutSession(relay, 100, "subscription_only")
	require.NoError(t, err)
	require.True(t, charged)
	assert.Equal(t, int64(100), readSubscriptionUsed(t, subId))
}

// ---------------------------------------------------------------------------
// PostConsumeQuota 资金路由
// ---------------------------------------------------------------------------

func TestPostConsumeQuota_RoutesSubscriptionDelta(t *testing.T) {
	migrateFundingTables(t)
	truncate(t)
	cleanupFundingTables(t)

	userId := nextFundingUserId()
	seedFundingUser(t, userId, 10_000)
	subId := nextFundingSubId()
	seedFundingSubscription(t, userId, subId, fundingSubSeed{
		Total: 10_000, Used: 1_000, AllowWalletOverflow: true, EndOffset: 24 * time.Hour,
	})

	relay := &relaycommon.RelayInfo{
		UserId:         userId,
		IsPlayground:   true,
		BillingSource:  BillingSourceSubscription,
		SubscriptionId: subId,
		RequestId:      nextFundingRequestId(),
	}

	require.NoError(t, PostConsumeQuota(relay, 500, 0, false))
	assert.Equal(t, int64(1_500), readSubscriptionUsed(t, subId))
	assert.Equal(t, int64(500), relay.SubscriptionPostDelta)

	// 多次上报逐次累加
	require.NoError(t, PostConsumeQuota(relay, 500, 0, false))
	assert.Equal(t, int64(2_000), readSubscriptionUsed(t, subId))
	assert.Equal(t, int64(1_000), relay.SubscriptionPostDelta)

	// 负增量（退款路径）
	require.NoError(t, PostConsumeQuota(relay, -300, 0, false))
	assert.Equal(t, int64(1_700), readSubscriptionUsed(t, subId))
	assert.Equal(t, int64(700), relay.SubscriptionPostDelta)
}

func TestPostConsumeQuota_MissingSubscriptionIdFails(t *testing.T) {
	migrateFundingTables(t)
	truncate(t)
	cleanupFundingTables(t)

	userId := nextFundingUserId()
	seedFundingUser(t, userId, 10_000)

	relay := &relaycommon.RelayInfo{
		UserId:        userId,
		IsPlayground:  true,
		BillingSource: BillingSourceSubscription,
		RequestId:     nextFundingRequestId(),
	}
	err := PostConsumeQuota(relay, 500, 0, false)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "subscription id is missing")
}

func TestPostConsumeQuota_WalletOnlyDecreasesUserQuota(t *testing.T) {
	migrateFundingTables(t)
	truncate(t)
	cleanupFundingTables(t)

	userId := nextFundingUserId()
	const walletQuota = 10_000
	seedFundingUser(t, userId, walletQuota)

	relay := makeFundingRelayInfo(userId, "wallet_only")

	require.NoError(t, PostConsumeQuota(relay, 300, 0, false))
	var user model.User
	require.NoError(t, model.DB.Where("id = ?", userId).First(&user).Error)
	assert.Equal(t, walletQuota-300, user.Quota)
}
