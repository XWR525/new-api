package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestClearUserTokensGroup 保护"同步清空令牌分组"的批量契约：
// 只清空指定用户令牌的分组，其它用户的令牌保持原分组。
func TestClearUserTokensGroup(t *testing.T) {
	const (
		userWithTokens  = 90001
		otherTokenOwner = 90002
	)
	require.NoError(t, DB.Create(&Token{UserId: userWithTokens, Name: "t-clear-1", Key: "sk-clear-1", Group: "vip"}).Error)
	require.NoError(t, DB.Create(&Token{UserId: userWithTokens, Name: "t-clear-2", Key: "sk-clear-2", Group: "team-a"}).Error)
	require.NoError(t, DB.Create(&Token{UserId: otherTokenOwner, Name: "t-clear-3", Key: "sk-clear-3", Group: "vip"}).Error)

	require.NoError(t, ClearUserTokensGroup([]int{userWithTokens}))

	var tokens []Token
	require.NoError(t, DB.Where("key IN ?", []string{"sk-clear-1", "sk-clear-2", "sk-clear-3"}).
		Order("id").Find(&tokens).Error)
	require.Len(t, tokens, 3)
	assert.Equal(t, "", tokens[0].Group)
	assert.Equal(t, "", tokens[1].Group)
	assert.Equal(t, "vip", tokens[2].Group)

	// 空入参不应触发任何更新
	require.NoError(t, ClearUserTokensGroup(nil))
}
