package setting

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMatchModelPattern(t *testing.T) {
	cases := []struct {
		name      string
		pattern   string
		modelName string
		want      bool
	}{
		{"exact hit", "glm-4-plus", "glm-4-plus", true},
		{"exact miss", "glm-4-plus", "glm-4-air", false},
		{"prefix wildcard hit", "glm-*", "glm-4-plus", true},
		{"prefix wildcard miss", "glm-*", "qwen-max", false},
		{"suffix wildcard hit", "*-flash", "gemini-2.5-flash", true},
		{"suffix wildcard miss", "*-flash", "gemini-2.5-pro", false},
		{"infix wildcard hit", "claude-*sonnet*", "claude-3-5-sonnet-20241022", true},
		{"infix wildcard miss", "claude-*sonnet*", "claude-3-5-haiku", false},
		{"match all", "*", "anything", true},
		{"trailing segment must be suffix", "glm-*-flash", "glm-x-flash-extra", false},
		{"trailing segment suffix ok", "glm-*-flash", "glm-x-flash", true},
		{"empty pattern", "", "glm-4", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, matchModelPattern(tc.pattern, tc.modelName))
		})
	}
}

func TestIsModelAllowedInGroup(t *testing.T) {
	groupModelLimitSetting.Whitelist.Clear()
	t.Cleanup(func() {
		groupModelLimitSetting.Whitelist.Clear()
	})

	// 未配置白名单的分组不受限制
	assert.True(t, IsModelAllowedInGroup("default", "any-model"))
	assert.False(t, HasGroupModelWhitelist("default"))

	groupModelLimitSetting.Whitelist.AddAll(map[string][]string{
		"team-a": {"glm-*", "deepseek-chat"},
	})

	assert.True(t, HasGroupModelWhitelist("team-a"))
	assert.True(t, IsModelAllowedInGroup("team-a", "glm-4-plus"))
	assert.True(t, IsModelAllowedInGroup("team-a", "deepseek-chat"))
	assert.False(t, IsModelAllowedInGroup("team-a", "qwen-max"))
	// 其它分组仍不受影响
	assert.True(t, IsModelAllowedInGroup("team-b", "qwen-max"))
}

func TestGetGroupModelWhitelistMapCopyIsDeepCopy(t *testing.T) {
	groupModelLimitSetting.Whitelist.Clear()
	t.Cleanup(func() {
		groupModelLimitSetting.Whitelist.Clear()
	})
	groupModelLimitSetting.Whitelist.AddAll(map[string][]string{
		"team-a": {"glm-*"},
	})

	copied := GetGroupModelWhitelistMapCopy()
	require.Contains(t, copied, "team-a")
	copied["team-a"][0] = "mutated"
	delete(copied, "team-a")

	assert.Equal(t, []string{"glm-*"}, GetGroupModelWhitelist("team-a"))
}
