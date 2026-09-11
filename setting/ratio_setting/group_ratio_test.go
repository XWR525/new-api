package ratio_setting

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestGroupGroupRatioMapCopyIsDeepCopy 保护"分组管理读改写"的隔离契约：
// 调用方删除副本中的内层条目不得影响全局配置，否则会并发改写正在被
// relay 读取的活 map（Go 运行时会以 fatal error 终止进程）。
func TestGroupGroupRatioMapCopyIsDeepCopy(t *testing.T) {
	require.NoError(t, UpdateGroupGroupRatioByJSONString(`{"vip":{"team-a":0.5,"team-b":0.6}}`))
	t.Cleanup(func() {
		require.NoError(t, UpdateGroupGroupRatioByJSONString(`{}`))
	})

	copied := GetGroupGroupRatioMapCopy()
	require.Contains(t, copied, "vip")
	delete(copied["vip"], "team-a")
	delete(copied, "vip")

	assert.Equal(t, map[string]float64{"team-a": 0.5, "team-b": 0.6},
		GetGroupGroupRatioByUserGroup("vip"))
}

// TestGroupSpecialUsableGroupCopyIsDeepCopy 同上，针对组间特殊可用性配置。
func TestGroupSpecialUsableGroupCopyIsDeepCopy(t *testing.T) {
	groupRatioSetting.GroupSpecialUsableGroup.Set("team-a", map[string]string{"+:vip": "VIP 分组"})
	t.Cleanup(func() {
		groupRatioSetting.GroupSpecialUsableGroup.Set("team-a", map[string]string{})
	})

	copied := GetGroupSpecialUsableGroupCopy()
	require.Contains(t, copied, "team-a")
	delete(copied["team-a"], "+:vip")
	delete(copied, "team-a")

	assert.Equal(t, map[string]string{"+:vip": "VIP 分组"}, GetGroupSpecialUsableGroup("team-a"))
}
