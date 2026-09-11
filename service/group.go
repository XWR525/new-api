package service

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

// GetUserEffectiveUsableGroups 返回用户实际可用的分组集合。
//
// 权限模型：用户能选哪些分组 = 用户自身的有效分组（主分组 + 附加分组），
// 再叠加 GroupSpecialUsableGroup 中针对这些分组的加/减规则。
// 全局 UserUsableGroups 仅用于分组显示名，不再决定用户可选项。
func GetUserEffectiveUsableGroups(userGroups []string) map[string]string {
	usable := make(map[string]string)
	// 1) 用户自身的有效分组
	for _, userGroup := range userGroups {
		if userGroup == "" {
			continue
		}
		usable[userGroup] = describeGroup(userGroup)
	}
	// 2) 按用户分组顺序应用特殊可用性规则（+：追加，-：移除，无前缀：追加）
	groupSpecialSetting := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup
	if groupSpecialSetting == nil {
		return usable
	}
	for _, userGroup := range userGroups {
		if userGroup == "" {
			continue
		}
		specialSettings, ok := groupSpecialSetting.Get(userGroup)
		if !ok {
			continue
		}
		for specialGroup, desc := range specialSettings {
			if strings.HasPrefix(specialGroup, "-:") {
				delete(usable, strings.TrimPrefix(specialGroup, "-:"))
				continue
			}
			groupToAdd := strings.TrimPrefix(specialGroup, "+:")
			if groupToAdd == "" {
				continue
			}
			if desc == "" {
				desc = describeGroup(groupToAdd)
			}
			usable[groupToAdd] = desc
		}
	}
	return usable
}

// describeGroup 返回分组的展示名（取自可选分组清单，缺失则用分组名）。
func describeGroup(group string) string {
	if desc := setting.GetUsableGroupDescription(group); desc != "" && desc != group {
		return desc
	}
	return group
}

// IsGroupUsableByContextUser 判断目标分组是否属于当前请求用户的可用分组。
// 多分组用户按其全部有效分组的可用分组并集判断；
// auto 是"自动选组"模式而非具体分组，按"用户在 AutoGroups 中有可用分组"放行，
// 与选项列表接口（/api/user/self/groups）的暴露条件保持一致。
func IsGroupUsableByContextUser(c *gin.Context, groupName string) bool {
	if groupName == "" {
		return false
	}
	if groupName == BuiltinAutoGroup {
		return IsAutoGroupAvailable(GetUserEffectiveGroupsFromContext(c))
	}
	usableGroups := GetUserEffectiveUsableGroups(GetUserEffectiveGroupsFromContext(c))
	_, ok := usableGroups[groupName]
	return ok
}

// GetUserEffectiveGroupsFromContext 返回当前请求用户的有效分组（主分组在前）。
func GetUserEffectiveGroupsFromContext(c *gin.Context) []string {
	raw := common.GetContextKeyString(c, constant.ContextKeyUserGroups)
	if raw != "" {
		if groups := model.ParseGroupList(raw); len(groups) > 0 {
			return groups
		}
	}
	primary := common.GetContextKeyString(c, constant.ContextKeyUserGroup)
	if primary == "" {
		return nil
	}
	return []string{primary}
}

// EnsureEffectiveGroupsInContext 在请求上下文缺少有效分组时，从用户缓存补齐。
// 令牌鉴权路径由 UserBase.WriteContext 写入主分组与附加分组；
// 会话鉴权路径（dashboard / playground）只写入主分组，需要此兜底才能拿到附加分组。
func EnsureEffectiveGroupsInContext(c *gin.Context) {
	if common.GetContextKeyString(c, constant.ContextKeyUserGroups) != "" {
		return
	}
	userId := c.GetInt("id")
	if userId <= 0 {
		return
	}
	userCache, err := model.GetUserCache(userId)
	if err != nil {
		return
	}
	groups := userCache.GetEffectiveGroups()
	if len(groups) == 0 {
		return
	}
	common.SetContextKey(c, constant.ContextKeyUserGroups, strings.Join(groups, ","))
}

// GetUserAutoGroupMulti 返回多个用户分组的 auto 候选分组并集（保持 AutoGroups 顺序）。
func GetUserAutoGroupMulti(userGroups []string) []string {
	usableGroups := GetUserEffectiveUsableGroups(userGroups)
	autoGroups := make([]string, 0)
	for _, group := range setting.GetAutoGroups() {
		if _, ok := usableGroups[group]; ok {
			autoGroups = append(autoGroups, group)
		}
	}
	return autoGroups
}

// IsAutoGroupAvailable 判断用户在 AutoGroups 中是否至少有一个可用分组。
// auto 是"自动选组"模式而非具体分组，因此 auto 令牌与前端"自动分组"选项
// 都以本函数作为可用前提，而不是要求 auto 出现在用户可用分组集合中。
func IsAutoGroupAvailable(userGroups []string) bool {
	return len(GetUserAutoGroupMulti(userGroups)) > 0
}

// GetUserGroupRatio 获取用户使用某个分组的倍率
// userGroup 用户分组
// group 需要获取倍率的分组
func GetUserGroupRatio(userGroup, group string) float64 {
	ratio, ok := ratio_setting.GetGroupGroupRatio(userGroup, group)
	if ok {
		return ratio
	}
	return ratio_setting.GetGroupRatio(group)
}
