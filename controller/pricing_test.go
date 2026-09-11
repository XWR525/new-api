package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
)

// TestIsModelUsableForUserGroups 保护模型广场"分组不可用"标记的判定契约：
// 只要用户的任意一个可用分组启用了该模型（且未被该分组白名单排除），模型就可用。
func TestIsModelUsableForUserGroups(t *testing.T) {
	usableGroups := map[string]string{"default": "默认分组", "vip": "VIP 分组"}

	cases := []struct {
		name        string
		enableGroup []string
		usableGroup map[string]string
		want        bool
	}{
		{
			name:        "分组内启用",
			enableGroup: []string{"default"},
			usableGroup: usableGroups,
			want:        true,
		},
		{
			name:        "仅在其他分组启用",
			enableGroup: []string{"svip"},
			usableGroup: usableGroups,
			want:        false,
		},
		{
			name:        "多分组中有一个可用",
			enableGroup: []string{"svip", "vip"},
			usableGroup: usableGroups,
			want:        true,
		},
		{
			name:        "全部分组启用",
			enableGroup: []string{"all"},
			usableGroup: usableGroups,
			want:        true,
		},
		{
			name:        "全部分组启用但用户无可用分组",
			enableGroup: []string{"all"},
			usableGroup: map[string]string{},
			want:        false,
		},
		{
			name:        "未绑定任何分组",
			enableGroup: []string{},
			usableGroup: usableGroups,
			want:        false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			item := model.Pricing{
				ModelName:   "gpt-4o",
				EnableGroup: tc.enableGroup,
			}
			assert.Equal(t, tc.want, isModelUsableForUserGroups(item, tc.usableGroup))
		})
	}
}
