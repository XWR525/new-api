package service

// GetActiveSubscriptionSummaries 批量摘要测试。
//
// 该函数被用户列表批量回填使用（controller/user.go），其排序必须与
// PreConsumeUserSubscription 的扣费顺序一致（end_time asc, id asc），
// 使前端取每条列表第一项即"当前实际优先消耗的订阅"。本测试钉住该契约。

import (
	"fmt"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type summaryPlanSeed struct {
	Id    int
	Title string
}

type summarySubSeed struct {
	Id            int
	PlanId        int
	Total         int64
	Used          int64
	Status        string
	EndOffset     time.Duration // 正数=未来到期（active），负数=已过期
	NextResetTime int64
}

func seedSummaryPlan(t *testing.T, plan summaryPlanSeed) {
	t.Helper()
	allow := true
	planRow := &model.SubscriptionPlan{
		Id:                  plan.Id,
		Title:               plan.Title,
		TotalAmount:         0,
		QuotaResetPeriod:    "",
		AllowWalletOverflow: &allow,
	}
	require.NoError(t, model.DB.Create(planRow).Error)
}

func seedSummarySubscription(t *testing.T, userId int, seed summarySubSeed) {
	t.Helper()
	now := time.Now()
	sub := &model.UserSubscription{
		Id:                  seed.Id,
		UserId:              userId,
		PlanId:              seed.PlanId,
		AmountTotal:         seed.Total,
		AmountUsed:          seed.Used,
		Status:              seed.Status,
		StartTime:           now.Add(-24 * time.Hour).Unix(),
		EndTime:             now.Add(seed.EndOffset).Unix(),
		AllowWalletOverflow: true,
		NextResetTime:       seed.NextResetTime,
	}
	require.NoError(t, model.DB.Create(sub).Error)
}

func TestGetActiveSubscriptionSummaries_OrderingAndJoin(t *testing.T) {
	migrateFundingTables(t)
	truncate(t)
	cleanupFundingTables(t)

	// 无输入时返回空结果而非错误
	empty, err := model.GetActiveSubscriptionSummaries(nil)
	require.NoError(t, err)
	assert.Empty(t, empty)

	const (
		u1 = 1
		u2 = 2
		u3 = 3 // 有用户但无订阅，不应出现在结果中
	)
	for _, uid := range []int{u1, u2, u3} {
		require.NoError(t, model.DB.Create(&model.User{
			Id: uid, Username: fmt.Sprintf("summary_user_%d", uid), Quota: 10_000, Status: common.UserStatusEnabled,
			AffCode: fmt.Sprintf("aff-%d", uid), // aff_code 唯一索引，fixture 须显式赋值
		}).Error)
	}

	seedSummaryPlan(t, summaryPlanSeed{Id: 9101, Title: "Alpha"})
	seedSummaryPlan(t, summaryPlanSeed{Id: 9102, Title: "Beta"})
	seedSummaryPlan(t, summaryPlanSeed{Id: 9103, Title: "Gamma"})

	// u1：两条生效订阅（end 1h / 2h）、一条已过期、一条已取消、两条同 end 时刻（按 id 升序）
	seedSummarySubscription(t, u1, summarySubSeed{Id: 8001, PlanId: 9101, Total: 100, Used: 10, Status: "active", EndOffset: time.Hour})
	seedSummarySubscription(t, u1, summarySubSeed{Id: 8002, PlanId: 9102, Total: 200, Used: 20, Status: "active", EndOffset: 2 * time.Hour})
	seedSummarySubscription(t, u1, summarySubSeed{Id: 8003, PlanId: 9101, Total: 300, Used: 30, Status: "active", EndOffset: -2 * time.Hour})
	seedSummarySubscription(t, u1, summarySubSeed{Id: 8004, PlanId: 9102, Total: 400, Used: 40, Status: "cancelled", EndOffset: 24 * time.Hour})
	seedSummarySubscription(t, u1, summarySubSeed{Id: 8005, PlanId: 9103, Total: 500, Used: 0, Status: "active", EndOffset: 3 * time.Hour})
	seedSummarySubscription(t, u1, summarySubSeed{Id: 8006, PlanId: 9103, Total: 600, Used: 0, Status: "active", EndOffset: 3 * time.Hour})

	// u2：一条正常订阅（Beta）+ 一条 plan 缺失的订阅（plan_title 应被 COALESCE 成空串）
	seedSummarySubscription(t, u2, summarySubSeed{Id: 8007, PlanId: 9102, Total: 700, Used: 7, Status: "active", EndOffset: time.Hour, NextResetTime: 1700000000})
	seedSummarySubscription(t, u2, summarySubSeed{Id: 8008, PlanId: 999999, Total: 800, Used: 8, Status: "active", EndOffset: 5 * time.Hour})

	summaries, err := model.GetActiveSubscriptionSummaries([]int{u1, u2, u3})
	require.NoError(t, err)

	// u1：过期/取消被过滤，剩余按 end_time asc, id asc => [Alpha, Beta, Gamma, Gamma]
	gotU1 := summaries[u1]
	require.Len(t, gotU1, 4)
	wantU1 := []struct {
		title string
		total int64
		used  int64
	}{
		{"Alpha", 100, 10},
		{"Beta", 200, 20},
		{"Gamma", 500, 0},
		{"Gamma", 600, 0},
	}
	for i, want := range wantU1 {
		assert.Equalf(t, want.title, gotU1[i].PlanTitle, "u1[%d] title", i)
		assert.Equal(t, want.total, gotU1[i].AmountTotal)
		assert.Equal(t, want.used, gotU1[i].AmountUsed)
	}

	// u2：正常订阅在前（end 1h），plan 缺失的订阅其次且标题为空串
	gotU2 := summaries[u2]
	require.Len(t, gotU2, 2)
	assert.Equal(t, "Beta", gotU2[0].PlanTitle)
	assert.Equal(t, int64(700), gotU2[0].AmountTotal)
	assert.Equal(t, int64(7), gotU2[0].AmountUsed)
	assert.Equal(t, int64(1700000000), gotU2[0].NextResetTime)
	assert.Equal(t, "", gotU2[1].PlanTitle)
	assert.Equal(t, int64(800), gotU2[1].AmountTotal)

	// u3：无生效订阅的用户不出现在结果中
	_, ok := summaries[u3]
	assert.False(t, ok)
}
