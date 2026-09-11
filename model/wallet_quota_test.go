package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 保护钱包口径消耗（wallet_used_quota）的累加与批量写入：
// 新增列在批量 flush 时既不能漏写，也不能与 quota/used_quota/request_count 串列。
func TestBatchUpdateWalletUsedQuota(t *testing.T) {
	user := &User{
		Username: "wallet-quota-batch-user",
		Password: "12345678",
		Quota:    10000,
		AffCode:  "aff-wallet-quota-batch",
	}
	require.NoError(t, DB.Create(user).Error)

	common.BatchUpdateEnabled = true
	t.Cleanup(func() {
		common.BatchUpdateEnabled = false
	})

	// 一次普通消耗（used_quota + request_count）与一次钱包口径消耗（wallet_used_quota）
	UpdateUserUsedQuotaAndRequestCount(user.Id, 300)
	AddUserWalletUsedQuota(user.Id, 120)

	batchUpdate()

	var updated User
	require.NoError(t, DB.Where("id = ?", user.Id).First(&updated).Error)
	assert.Equal(t, 10000, updated.Quota, "钱包口径消耗不应改动余额")
	assert.Equal(t, 300, updated.UsedQuota)
	assert.Equal(t, 1, updated.RequestCount)
	assert.Equal(t, 120, updated.WalletUsedQuota)

	// 空批次再次 flush 不应重复累加
	batchUpdate()
	require.NoError(t, DB.Where("id = ?", user.Id).First(&updated).Error)
	assert.Equal(t, 300, updated.UsedQuota)
	assert.Equal(t, 120, updated.WalletUsedQuota)
}

// 关闭批量写入时走直写路径，同样只能影响 wallet_used_quota。
func TestAddUserWalletUsedQuotaDirectUpdate(t *testing.T) {
	user := &User{
		Username: "wallet-quota-direct-user",
		Password: "12345678",
		Quota:    500,
		AffCode:  "aff-wallet-quota-direct",
	}
	require.NoError(t, DB.Create(user).Error)

	common.BatchUpdateEnabled = false
	AddUserWalletUsedQuota(user.Id, 80)

	var updated User
	require.NoError(t, DB.Where("id = ?", user.Id).First(&updated).Error)
	assert.Equal(t, 500, updated.Quota)
	assert.Equal(t, 0, updated.UsedQuota)
	assert.Equal(t, 0, updated.RequestCount)
	assert.Equal(t, 80, updated.WalletUsedQuota)
}
