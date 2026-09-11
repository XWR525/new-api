package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

// isModelUsableForUserGroups 判断模型在用户的可用分组中是否至少存在一个可用入口
// （既要在该分组的渠道能力中启用，也不能被该分组的模型白名单阻断）。
func isModelUsableForUserGroups(item model.Pricing, usableGroup map[string]string) bool {
	if len(usableGroup) == 0 {
		return false
	}
	if common.StringsContains(item.EnableGroup, "all") {
		for group := range usableGroup {
			if setting.IsModelAllowedInGroup(group, item.ModelName) {
				return true
			}
		}
		return false
	}
	for _, group := range item.EnableGroup {
		if _, ok := usableGroup[group]; !ok {
			continue
		}
		if setting.IsModelAllowedInGroup(group, item.ModelName) {
			return true
		}
	}
	return false
}

func GetPricing(c *gin.Context) {
	// 模型广场对所有访客展示全部模型：不再按用户分组过滤模型列表。
	pricing := model.GetPricing()
	userId, exists := c.Get("id")
	groupRatio := map[string]float64{}
	// 分组倍率统一固定为 1：不向客户端暴露原始配置值
	for name := range ratio_setting.GetGroupRatioCopy() {
		groupRatio[name] = 1
	}
	var effectiveGroups []string
	if exists {
		user, err := model.GetUserCache(userId.(int))
		if err == nil {
			effectiveGroups = user.GetEffectiveGroups()
		}
	}

	usableGroup := service.GetUserEffectiveUsableGroups(effectiveGroups)
	// 匿名访客：回填全局分组目录（等价于改动前 GetUserUsableGroups("") 的行为）。
	// 否则 usable_group 为空，模型广场会对每个模型显示"任何分组都不可用"。
	if !exists {
		usableGroup = setting.GetUserUsableGroupsCopy()
	}
	// 已登录用户：标记"当前分组完全无法使用"的模型（匿名用户不做标记）
	unavailableModels := []string{}
	if exists {
		for _, item := range pricing {
			if !isModelUsableForUserGroups(item, usableGroup) {
				unavailableModels = append(unavailableModels, item.ModelName)
			}
		}
	}
	// check groupRatio contains usableGroup
	for group := range ratio_setting.GetGroupRatioCopy() {
		if _, ok := usableGroup[group]; !ok {
			delete(groupRatio, group)
		}
	}

	c.JSON(200, gin.H{
		"success":            true,
		"data":               pricing,
		"vendors":            model.GetVendors(),
		"group_ratio":        groupRatio,
		"usable_group":       usableGroup,
		"unavailable_models": unavailableModels,
		"supported_endpoint": model.GetSupportedEndpointMap(),
		"auto_groups":        service.GetUserAutoGroupMulti(effectiveGroups),
		"pricing_version":    "a42d372ccf0b5dd13ecf71203521f9d2",
	})
}

func ResetModelRatio(c *gin.Context) {
	defaultStr := ratio_setting.DefaultModelRatio2JSONString()
	err := model.UpdateOption("ModelRatio", defaultStr)
	if err != nil {
		c.JSON(200, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	err = ratio_setting.UpdateModelRatioByJSONString(defaultStr)
	if err != nil {
		c.JSON(200, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(200, gin.H{
		"success": true,
		"message": "重置模型倍率成功",
	})
}
