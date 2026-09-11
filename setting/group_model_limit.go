package setting

import (
	"strings"

	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/types"
)

// GroupModelLimitSetting 分组模型白名单：分组名 -> 允许的模型模式列表。
// 键不存在或列表为空表示该分组不限制模型（与既有行为一致）。
// 模式支持 * 通配，例如 glm-*、*-flash、*turbo*。
type GroupModelLimitSetting struct {
	Whitelist *types.RWMap[string, []string] `json:"group_model_whitelist"`
}

var groupModelLimitSetting = GroupModelLimitSetting{
	Whitelist: types.NewRWMap[string, []string](),
}

func init() {
	config.GlobalConfig.Register("group_model_limit_setting", &groupModelLimitSetting)
}

// GetGroupModelWhitelist 返回分组白名单；未配置时返回 nil。
// 返回值是 RWMap 内部切片的只读视图：所有写入方（配置加载、分组管理更新）都
// 整体替换切片而非原地修改（copy-on-write，与 GroupSpecialUsableGroup.Get 的
// 既有用法一致），因此在锁外遍历是安全的；调用方不得修改返回值。
// 热路径（relay 选组、定价页）每个 (分组, 模型) 组合都会调用本函数，不做拷贝。
func GetGroupModelWhitelist(group string) []string {
	// 配置层遇到字符串 "null" 会把该指针字段置零（setting/config/config.go），
	// 而本函数位于 relay 选组热路径，缺守卫会直接 nil 解引用 panic。
	if groupModelLimitSetting.Whitelist == nil {
		return nil
	}
	patterns, ok := groupModelLimitSetting.Whitelist.Get(group)
	if !ok || len(patterns) == 0 {
		return nil
	}
	return patterns
}

// HasGroupModelWhitelist 判断分组是否配置了非空白名单。
func HasGroupModelWhitelist(group string) bool {
	return len(GetGroupModelWhitelist(group)) > 0
}

// GetGroupModelWhitelistMapCopy 返回白名单的深拷贝，供分组管理读改写。
func GetGroupModelWhitelistMapCopy() map[string][]string {
	if groupModelLimitSetting.Whitelist == nil {
		return map[string][]string{}
	}
	source := groupModelLimitSetting.Whitelist.ReadAll()
	copied := make(map[string][]string, len(source))
	for group, patterns := range source {
		copied[group] = append([]string(nil), patterns...)
	}
	return copied
}

// IsModelAllowedInGroup 判断模型是否被分组白名单允许；白名单为空表示不限制。
func IsModelAllowedInGroup(group string, modelName string) bool {
	patterns := GetGroupModelWhitelist(group)
	if len(patterns) == 0 {
		return true
	}
	for _, pattern := range patterns {
		if matchModelPattern(pattern, modelName) {
			return true
		}
	}
	return false
}

// matchModelPattern 匹配单个白名单模式，支持 * 通配（前缀、后缀、中缀及多个 *）。
func matchModelPattern(pattern string, modelName string) bool {
	if pattern == "" {
		return false
	}
	if pattern == "*" {
		return true
	}
	if !strings.Contains(pattern, "*") {
		return pattern == modelName
	}
	segments := strings.Split(pattern, "*")
	rest := modelName
	for i, segment := range segments {
		if segment == "" {
			continue
		}
		if i == 0 {
			if !strings.HasPrefix(rest, segment) {
				return false
			}
			rest = rest[len(segment):]
			continue
		}
		index := strings.Index(rest, segment)
		if index < 0 {
			return false
		}
		rest = rest[index+len(segment):]
	}
	lastSegment := segments[len(segments)-1]
	if lastSegment == "" {
		return true
	}
	return strings.HasSuffix(modelName, lastSegment)
}
