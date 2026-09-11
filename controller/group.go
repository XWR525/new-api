package controller

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

func GetGroups(c *gin.Context) {
	groupNames := make([]string, 0)
	for groupName := range ratio_setting.GetGroupRatioCopy() {
		groupNames = append(groupNames, groupName)
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    groupNames,
	})
}

func GetUserGroups(c *gin.Context) {
	usableGroups := make(map[string]map[string]interface{})
	userGroup := ""
	userId := c.GetInt("id")
	userGroup, _ = model.GetUserGroup(userId, false)
	effectiveGroups, err := model.GetUserEffectiveGroups(userId)
	if err != nil {
		// 该路由未挂登录鉴权（两个前端都已改用 /self/groups），匿名调用会走到这里。
		// 返回空分组而不是 err.Error()，避免把 "record not found" 之类的内部错误串
		// 直接回给未认证调用者。
		common.SysLog(fmt.Sprintf("get user effective groups failed for user %d: %s", userId, err.Error()))
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "",
			"data":    map[string]map[string]interface{}{},
		})
		return
	}
	userUsableGroups := service.GetUserEffectiveUsableGroups(effectiveGroups)
	for groupName, _ := range ratio_setting.GetGroupRatioCopy() {
		// UserUsableGroups contains the groups that the user can use
		if desc, ok := userUsableGroups[groupName]; ok {
			usableGroups[groupName] = map[string]interface{}{
				"ratio": service.GetUserGroupRatio(userGroup, groupName),
				"desc":  desc,
			}
		}
	}
	// auto 是"自动选组"模式而非具体分组：用户在 AutoGroups 中有可用分组时才暴露该选项
	if service.IsAutoGroupAvailable(effectiveGroups) {
		usableGroups["auto"] = map[string]interface{}{
			"ratio": "自动",
			"desc":  setting.GetUsableGroupDescription("auto"),
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    usableGroups,
	})
}

type managedGroupCreateRequest struct {
	Name        string   `json:"name"`
	DisplayName string   `json:"display_name"`
	Ratio       *float64 `json:"ratio"`
}

type managedGroupUpdateRequest struct {
	DisplayName *string  `json:"display_name"`
	Ratio       *float64 `json:"ratio"`
	Selectable  *bool    `json:"selectable"`
}

type managedGroupWhitelistRequest struct {
	Models []string `json:"models"`
}

// GetManagedGroups 获取分组管理列表
func GetManagedGroups(c *gin.Context) {
	groups, err := service.CollectManagedGroups()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, groups)
}

// GetManagedGroupDetail 获取单个分组的聚合详情
func GetManagedGroupDetail(c *gin.Context) {
	detail, err := service.GetManagedGroupDetail(c.Param("name"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, detail)
}

// CreateManagedGroup 新建分组
func CreateManagedGroup(c *gin.Context) {
	var req managedGroupCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	err := service.CreateManagedGroup(service.ManagedGroupCreateParams{
		Name:        req.Name,
		DisplayName: req.DisplayName,
		Ratio:       req.Ratio,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// UpdateManagedGroup 更新分组的显示名、倍率与自选状态
func UpdateManagedGroup(c *gin.Context) {
	var req managedGroupUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	err := service.UpdateManagedGroup(c.Param("name"), service.ManagedGroupUpdateParams{
		DisplayName: req.DisplayName,
		Ratio:       req.Ratio,
		Selectable:  req.Selectable,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// DeleteManagedGroup 删除分组，仍有引用时返回引用明细
func DeleteManagedGroup(c *gin.Context) {
	err := service.DeleteManagedGroup(c.Param("name"))
	if err == nil {
		common.ApiSuccess(c, nil)
		return
	}
	var refErr *service.GroupReferenceError
	if errors.As(err, &refErr) {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": refErr.Error(),
			"data": gin.H{
				"user_count":    refErr.Refs.UserCount,
				"channel_count": refErr.Refs.ChannelCount,
				"token_count":   refErr.Refs.TokenCount,
			},
		})
		return
	}
	common.ApiError(c, err)
}

// UpdateManagedGroupWhitelist 设置分组模型白名单，传空列表表示取消限制
func UpdateManagedGroupWhitelist(c *gin.Context) {
	var req managedGroupWhitelistRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := service.UpdateManagedGroupWhitelist(c.Param("name"), req.Models); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

type managedGroupUsersRequest struct {
	UserIds    []int `json:"user_ids"`
	SyncTokens *bool `json:"sync_tokens"`
}

type managedGroupUsersRemoveRequest struct {
	UserIds     []int  `json:"user_ids"`
	TargetGroup string `json:"target_group"`
	SyncTokens  *bool  `json:"sync_tokens"`
}

type managedGroupChannelsRequest struct {
	ChannelIds []int `json:"channel_ids"`
}

func resolveSyncTokens(value *bool) bool {
	if value == nil {
		return true
	}
	return *value
}

// AddManagedGroupUsers 批量把用户加入分组
func AddManagedGroupUsers(c *gin.Context) {
	var req managedGroupUsersRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	affected, err := service.AddUsersToManagedGroup(
		c.Param("name"), req.UserIds, resolveSyncTokens(req.SyncTokens), c.GetInt("role"),
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "group.users_add", map[string]interface{}{
		"group":    c.Param("name"),
		"affected": affected,
	})
	common.ApiSuccess(c, gin.H{"affected": affected})
}

// RemoveManagedGroupUsers 批量把用户移出分组并迁移到目标分组
func RemoveManagedGroupUsers(c *gin.Context) {
	var req managedGroupUsersRemoveRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	affected, err := service.RemoveUsersFromManagedGroup(
		c.Param("name"), req.UserIds, req.TargetGroup, resolveSyncTokens(req.SyncTokens), c.GetInt("role"),
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "group.users_remove", map[string]interface{}{
		"group":    c.Param("name"),
		"target":   req.TargetGroup,
		"affected": affected,
	})
	common.ApiSuccess(c, gin.H{"affected": affected})
}

// AddManagedGroupChannels 批量给渠道追加该分组标签
func AddManagedGroupChannels(c *gin.Context) {
	var req managedGroupChannelsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	affected, err := service.AddChannelsToManagedGroup(c.Param("name"), req.ChannelIds)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	model.InitChannelCache()
	recordManageAudit(c, "group.channels_add", map[string]interface{}{
		"group":    c.Param("name"),
		"affected": affected,
	})
	common.ApiSuccess(c, gin.H{"affected": affected})
}

// RemoveManagedGroupChannels 批量从渠道移除该分组标签
func RemoveManagedGroupChannels(c *gin.Context) {
	var req managedGroupChannelsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	affected, err := service.RemoveChannelsFromManagedGroup(c.Param("name"), req.ChannelIds)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	model.InitChannelCache()
	recordManageAudit(c, "group.channels_remove", map[string]interface{}{
		"group":    c.Param("name"),
		"affected": affected,
	})
	common.ApiSuccess(c, gin.H{"affected": affected})
}
