package service

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// snapshotGroupSettings 在测试前后恢复分组相关全局设置，避免用例互相污染。
func snapshotGroupSettings(t *testing.T) {
	t.Helper()
	originalRatio := ratio_setting.GroupRatio2JSONString()
	originalUsable := setting.UserUsableGroups2JSONString()
	originalTopup := common.TopupGroupRatio2JSONString()
	originalGroupGroup := ratio_setting.GroupGroupRatio2JSONString()
	originalAuto := setting.AutoGroups2JsonString()
	originalSpecial := mustJSON(t, ratio_setting.GetGroupSpecialUsableGroupCopy())
	originalWhitelist := mustJSON(t, setting.GetGroupModelWhitelistMapCopy())

	t.Cleanup(func() {
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalRatio))
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalUsable))
		require.NoError(t, common.UpdateTopupGroupRatioByJSONString(originalTopup))
		require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString(originalGroupGroup))
		require.NoError(t, setting.UpdateAutoGroupsByJsonString(originalAuto))
		require.NoError(t, config.UpdateConfigFromMap(
			ratio_setting.GetGroupRatioSetting(),
			map[string]string{"group_special_usable_group": originalSpecial},
		))
		require.NoError(t, model.UpdateOption(
			"group_model_limit_setting.group_model_whitelist", originalWhitelist,
		))
	})
}

func mustJSON(t *testing.T, value any) string {
	t.Helper()
	payload, err := common.Marshal(value)
	require.NoError(t, err)
	return string(payload)
}

func resetGroupTables(t *testing.T) {
	t.Helper()
	require.NoError(t, model.DB.Exec("DELETE FROM users").Error)
	require.NoError(t, model.DB.Exec("DELETE FROM tokens").Error)
	require.NoError(t, model.DB.Exec("DELETE FROM channels").Error)
	require.NoError(t, model.DB.Exec("DELETE FROM abilities").Error)
}

func seedGroupReferences(t *testing.T, group string) {
	t.Helper()
	require.NoError(t, model.DB.Create(&model.User{
		Username: "group-ref-user",
		Group:    group,
	}).Error)
	require.NoError(t, model.DB.Create(&model.Token{
		UserId: 1,
		Name:   "group-ref-token",
		Key:    "sk-group-ref-token",
		Group:  group,
	}).Error)
	require.NoError(t, model.DB.Create(&model.Channel{
		Name:   "group-ref-channel",
		Key:    "group-ref-channel-key",
		Group:  group,
		Type:   1,
		Models: "glm-4",
	}).Error)
	require.NoError(t, model.DB.Create(&model.Ability{
		Group:     group,
		Model:     "glm-4",
		ChannelId: 1,
		Enabled:   true,
	}).Error)
}

func TestValidateGroupName(t *testing.T) {
	require.NoError(t, validateGroupName("team-a"))
	require.NoError(t, validateGroupName("team_b2"))
	assert.ErrorIs(t, validateGroupName(""), ErrGroupNameInvalid)
	assert.ErrorIs(t, validateGroupName("team a"), ErrGroupNameInvalid)
	assert.ErrorIs(t, validateGroupName("团队"), ErrGroupNameInvalid)
	assert.ErrorIs(t, validateGroupName("auto"), ErrGroupReserved)
	assert.ErrorIs(t, validateGroupName("AUTO"), ErrGroupReserved)
	// all/null 是过滤接口的"不过滤"哨兵值，作为保留名不可使用
	assert.ErrorIs(t, validateGroupName("all"), ErrGroupReserved)
	assert.ErrorIs(t, validateGroupName("NULL"), ErrGroupReserved)
	assert.ErrorIs(t, validateGroupName("this-group-name-is-way-too-long-for-the-limit"), ErrGroupNameInvalid)
}

func TestCreateManagedGroupRegistersRatioAndSelectable(t *testing.T) {
	snapshotGroupSettings(t)
	resetGroupTables(t)

	// 倍率入参被忽略：分组倍率统一固定为 1
	ratio := 0.8
	require.NoError(t, CreateManagedGroup(ManagedGroupCreateParams{
		Name:        "team-a",
		DisplayName: "团队 A",
		Ratio:       &ratio,
	}))

	ratioCopy := ratio_setting.GetGroupRatioCopy()
	require.Contains(t, ratioCopy, "team-a")
	assert.Equal(t, 1.0, ratioCopy["team-a"])
	usableCopy := setting.GetUserUsableGroupsCopy()
	require.Contains(t, usableCopy, "team-a")
	assert.Equal(t, "团队 A", usableCopy["team-a"])

	// 重复创建与非法名称
	assert.ErrorIs(t, CreateManagedGroup(ManagedGroupCreateParams{Name: "team-a"}), ErrGroupExists)
	assert.ErrorIs(t, CreateManagedGroup(ManagedGroupCreateParams{Name: "auto"}), ErrGroupReserved)
	assert.ErrorIs(t, CreateManagedGroup(ManagedGroupCreateParams{Name: "bad name"}), ErrGroupNameInvalid)
}

func TestGroupRatiosAreAlwaysOne(t *testing.T) {
	snapshotGroupSettings(t)

	// 写入非 1 值后，读取层仍恒定返回 1
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":0.5,"vip":2}`))
	require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString(`{"vip":{"default":0.3}}`))
	require.NoError(t, common.UpdateTopupGroupRatioByJSONString(`{"default":3}`))

	assert.Equal(t, 1.0, ratio_setting.GetGroupRatio("default"))
	assert.Equal(t, 1.0, ratio_setting.GetGroupRatio("vip"))
	assert.Equal(t, 1.0, ratio_setting.GetGroupRatio("missing-group"))
	_, ok := ratio_setting.GetGroupGroupRatio("vip", "default")
	assert.False(t, ok)
	assert.Equal(t, 1.0, common.GetTopupGroupRatio("default"))

	// 归一化把配置写回 1，并清空跨组倍率表
	assert.True(t, ratio_setting.NormalizeGroupRatiosToDefault())
	assert.Equal(t, 1.0, ratio_setting.GetGroupRatioCopy()["default"])
	assert.Equal(t, 1.0, ratio_setting.GetGroupRatioCopy()["vip"])
	assert.Empty(t, ratio_setting.GetGroupGroupRatioMapCopy())

	assert.True(t, common.NormalizeTopupGroupRatioToDefault())
	assert.Equal(t, 1.0, common.GetTopupGroupRatioCopy()["default"])

	// 幂等：已归一化后不再报告变更
	assert.False(t, ratio_setting.NormalizeGroupRatiosToDefault())
	assert.False(t, common.NormalizeTopupGroupRatioToDefault())
}

func TestCreateManagedGroupRegistersReferencedGroup(t *testing.T) {
	snapshotGroupSettings(t)
	resetGroupTables(t)
	// 分组仅作为渠道标签存在，尚未登记进设置
	seedGroupReferences(t, "team-a")

	require.NoError(t, CreateManagedGroup(ManagedGroupCreateParams{
		Name:        "team-a",
		DisplayName: "团队 A",
	}))
	assert.Contains(t, ratio_setting.GetGroupRatioCopy(), "team-a")
	assert.Equal(t, "团队 A", setting.GetUserUsableGroupsCopy()["team-a"])

	// 已登记后不允许重复创建
	assert.ErrorIs(t, CreateManagedGroup(ManagedGroupCreateParams{Name: "team-a"}), ErrGroupExists)
}

func TestUpdateManagedGroupDisplayName(t *testing.T) {
	snapshotGroupSettings(t)
	resetGroupTables(t)
	require.NoError(t, CreateManagedGroup(ManagedGroupCreateParams{Name: "team-a"}))

	displayName := "团队 A 改名"
	require.NoError(t, UpdateManagedGroup("team-a", ManagedGroupUpdateParams{DisplayName: &displayName}))
	assert.Equal(t, "团队 A 改名", setting.GetUserUsableGroupsCopy()["team-a"])

	// Selectable 入参已废弃：不再影响可选分组清单与权限（清单仅承载显示名）
	selectable := false
	require.NoError(t, UpdateManagedGroup("team-a", ManagedGroupUpdateParams{Selectable: &selectable}))
	assert.Equal(t, "团队 A 改名", setting.GetUserUsableGroupsCopy()["team-a"])
	assert.Contains(t, ratio_setting.GetGroupRatioCopy(), "team-a")

	// 清空显示名后回退为分组名
	emptyName := ""
	require.NoError(t, UpdateManagedGroup("team-a", ManagedGroupUpdateParams{DisplayName: &emptyName}))
	assert.Equal(t, "team-a", setting.GetUserUsableGroupsCopy()["team-a"])

	assert.ErrorIs(t, UpdateManagedGroup("auto", ManagedGroupUpdateParams{}), ErrGroupReserved)
	assert.ErrorIs(t, UpdateManagedGroup("missing-group", ManagedGroupUpdateParams{}), ErrGroupNotFound)
}

func TestDeleteManagedGroupBlockedByReferences(t *testing.T) {
	snapshotGroupSettings(t)
	resetGroupTables(t)
	require.NoError(t, CreateManagedGroup(ManagedGroupCreateParams{Name: "team-a"}))
	seedGroupReferences(t, "team-a")

	err := DeleteManagedGroup("team-a")
	var refErr *GroupReferenceError
	require.ErrorAs(t, err, &refErr)
	assert.Equal(t, int64(1), refErr.Refs.UserCount)
	assert.Equal(t, int64(1), refErr.Refs.ChannelCount)
	assert.Equal(t, int64(1), refErr.Refs.TokenCount)
	// 分组未被删除
	assert.Contains(t, ratio_setting.GetGroupRatioCopy(), "team-a")
}

func TestDeleteManagedGroupCleansEverySetting(t *testing.T) {
	snapshotGroupSettings(t)
	resetGroupTables(t)
	require.NoError(t, CreateManagedGroup(ManagedGroupCreateParams{Name: "team-a"}))
	require.NoError(t, UpdateManagedGroupWhitelist("team-a", []string{"glm-*"}))
	require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString(`{"team-a":{"vip":0.5},"vip":{"team-a":0.7}}`))
	require.NoError(t, common.UpdateTopupGroupRatioByJSONString(`{"team-a":1.2}`))
	require.NoError(t, setting.UpdateAutoGroupsByJsonString(`["default","team-a"]`))
	require.NoError(t, config.UpdateConfigFromMap(
		ratio_setting.GetGroupRatioSetting(),
		map[string]string{"group_special_usable_group": `{"team-a":{"+team-b":"b"},"vip":{"-:team-a":"x"}}`},
	))

	require.NoError(t, DeleteManagedGroup("team-a"))

	assert.NotContains(t, ratio_setting.GetGroupRatioCopy(), "team-a")
	assert.NotContains(t, setting.GetUserUsableGroupsCopy(), "team-a")
	assert.NotContains(t, common.GetTopupGroupRatioCopy(), "team-a")
	assert.NotContains(t, setting.GetAutoGroups(), "team-a")
	assert.Nil(t, setting.GetGroupModelWhitelist("team-a"))
	assert.NotContains(t, ratio_setting.GetGroupGroupRatioByUserGroup("team-a"), "vip")
	assert.NotContains(t, ratio_setting.GetGroupGroupRatioByUserGroup("vip"), "team-a")
	assert.Nil(t, ratio_setting.GetGroupSpecialUsableGroup("team-a"))
	assert.NotContains(t, ratio_setting.GetGroupSpecialUsableGroup("vip"), "-:team-a")

	assert.ErrorIs(t, DeleteManagedGroup("auto"), ErrGroupReserved)
	assert.ErrorIs(t, DeleteManagedGroup("team-a"), ErrGroupNotFound)
}

func TestUpdateManagedGroupWhitelist(t *testing.T) {
	snapshotGroupSettings(t)
	resetGroupTables(t)
	require.NoError(t, CreateManagedGroup(ManagedGroupCreateParams{Name: "team-a"}))

	require.NoError(t, UpdateManagedGroupWhitelist("team-a", []string{" glm-* ", "glm-*", "", "deepseek-chat"}))
	assert.Equal(t, []string{"glm-*", "deepseek-chat"}, setting.GetGroupModelWhitelist("team-a"))

	// 空列表等于取消限制
	require.NoError(t, UpdateManagedGroupWhitelist("team-a", nil))
	assert.False(t, setting.HasGroupModelWhitelist("team-a"))

	assert.ErrorIs(t, UpdateManagedGroupWhitelist("auto", []string{"glm-*"}), ErrGroupReserved)
	assert.ErrorIs(t, UpdateManagedGroupWhitelist("missing-group", nil), ErrGroupNotFound)
}

func TestGetGroupAvailableModelsAppliesWhitelist(t *testing.T) {
	snapshotGroupSettings(t)
	resetGroupTables(t)
	seedGroupReferences(t, "team-a")
	require.NoError(t, model.DB.Create(&model.Ability{
		Group: "team-a", Model: "qwen-max", ChannelId: 1, Enabled: true,
	}).Error)

	// 无白名单：返回全部渠道能力
	assert.ElementsMatch(t, []string{"glm-4", "qwen-max"}, GetGroupAvailableModels("team-a"))

	require.NoError(t, UpdateManagedGroupWhitelist("team-a", []string{"glm-*"}))
	assert.Equal(t, []string{"glm-4"}, GetGroupAvailableModels("team-a"))
}

func TestAddUsersToManagedGroupSyncsTokens(t *testing.T) {
	snapshotGroupSettings(t)
	resetGroupTables(t)
	require.NoError(t, CreateManagedGroup(ManagedGroupCreateParams{Name: "team-a"}))

	require.NoError(t, model.DB.Create(&model.User{Username: "u-a", Group: "default", AffCode: "aff-u-a"}).Error)
	require.NoError(t, model.DB.Create(&model.User{Username: "u-b", Group: "default", AffCode: "aff-u-b"}).Error)
	require.NoError(t, model.DB.Create(&model.Token{
		UserId: 1, Name: "t-a", Key: "sk-t-a", Group: "vip",
	}).Error)

	affected, err := AddUsersToManagedGroup("team-a", []int{1, 2}, true, common.RoleRootUser)
	require.NoError(t, err)
	assert.Equal(t, int64(2), affected)

	var users []model.User
	require.NoError(t, model.DB.Order("id").Find(&users).Error)
	require.Len(t, users, 2)
	// 追加附加分组，主分组保持不变
	assert.Equal(t, "default", users[0].Group)
	assert.Equal(t, "team-a", users[0].UserGroups)
	assert.Equal(t, "default", users[1].Group)
	assert.Equal(t, "team-a", users[1].UserGroups)

	var tokens []model.Token
	require.NoError(t, model.DB.Find(&tokens).Error)
	require.Len(t, tokens, 1)
	assert.Equal(t, "", tokens[0].Group)

	// 未选择用户
	_, err = AddUsersToManagedGroup("team-a", nil, true, common.RoleRootUser)
	assert.ErrorIs(t, err, ErrNoUsersSelected)
	// 分组不存在
	_, err = AddUsersToManagedGroup("missing", []int{1}, true, common.RoleRootUser)
	assert.ErrorIs(t, err, ErrGroupNotFound)
	// auto 保留分组
	_, err = AddUsersToManagedGroup("auto", []int{1}, true, common.RoleRootUser)
	assert.ErrorIs(t, err, ErrGroupReserved)
}

func TestAddUsersToManagedGroupSyncsTokensOnlyForChangedUsers(t *testing.T) {
	snapshotGroupSettings(t)
	resetGroupTables(t)
	require.NoError(t, CreateManagedGroup(ManagedGroupCreateParams{Name: "team-a"}))

	// 用户 1 已在 team-a（本批次无变更），用户 2 需要新增
	require.NoError(t, model.DB.Create(&model.User{
		Username: "u-in", Group: "default", UserGroups: "team-a", AffCode: "aff-in",
	}).Error)
	require.NoError(t, model.DB.Create(&model.User{
		Username: "u-out", Group: "default", AffCode: "aff-out",
	}).Error)
	require.NoError(t, model.DB.Create(&model.Token{
		UserId: 1, Name: "t-in", Key: "sk-t-in", Group: "vip",
	}).Error)
	require.NoError(t, model.DB.Create(&model.Token{
		UserId: 2, Name: "t-out", Key: "sk-t-out", Group: "vip",
	}).Error)

	affected, err := AddUsersToManagedGroup("team-a", []int{1, 2}, true, common.RoleRootUser)
	require.NoError(t, err)
	assert.Equal(t, int64(1), affected)

	// 本批次未发生变更的用户，其令牌分组必须保留
	var tokens []model.Token
	require.NoError(t, model.DB.Order("id").Find(&tokens).Error)
	require.Len(t, tokens, 2)
	assert.Equal(t, "vip", tokens[0].Group)
	assert.Equal(t, "", tokens[1].Group)
}

func TestAddUsersToManagedGroupRejectsRootUser(t *testing.T) {
	snapshotGroupSettings(t)
	resetGroupTables(t)
	require.NoError(t, CreateManagedGroup(ManagedGroupCreateParams{Name: "team-a"}))
	require.NoError(t, model.DB.Create(&model.User{
		Username: "root-user", Group: "default", Role: common.RoleRootUser, AffCode: "aff-root",
	}).Error)

	_, err := AddUsersToManagedGroup("team-a", []int{1}, true, common.RoleRootUser)
	require.ErrorIs(t, err, ErrRootUserImmutable)

	var user model.User
	require.NoError(t, model.DB.Where("username = ?", "root-user").First(&user).Error)
	assert.Equal(t, "default", user.Group)
}

// 非 root 操作者不得改动角色不低于自己的用户（与用户管理链路 canManageTargetRole 一致）。
func TestAddUsersToManagedGroupRejectsHigherOrEqualRole(t *testing.T) {
	snapshotGroupSettings(t)
	resetGroupTables(t)
	require.NoError(t, CreateManagedGroup(ManagedGroupCreateParams{Name: "team-a"}))
	require.NoError(t, model.DB.Create(&model.User{
		Username: "peer-admin", Group: "default", Role: common.RoleAdminUser, AffCode: "aff-peer",
	}).Error)
	require.NoError(t, model.DB.Create(&model.User{
		Username: "common-user", Group: "default", Role: common.RoleCommonUser, AffCode: "aff-common",
	}).Error)

	// 同级管理员：拒绝
	_, err := AddUsersToManagedGroup("team-a", []int{1}, true, common.RoleAdminUser)
	require.ErrorIs(t, err, ErrTargetRoleTooHigh)

	// 更低角色用户：允许
	affected, err := AddUsersToManagedGroup("team-a", []int{2}, true, common.RoleAdminUser)
	require.NoError(t, err)
	assert.Equal(t, int64(1), affected)

	// 同级管理员经移除路径同样被拒绝
	_, err = RemoveUsersFromManagedGroup("team-a", []int{1}, "default", false, common.RoleAdminUser)
	require.ErrorIs(t, err, ErrTargetRoleTooHigh)
}

func TestRemoveUsersFromManagedGroup(t *testing.T) {
	snapshotGroupSettings(t)
	resetGroupTables(t)
	require.NoError(t, CreateManagedGroup(ManagedGroupCreateParams{Name: "team-a"}))
	require.NoError(t, model.DB.Create(&model.User{Username: "u-a", Group: "team-a", AffCode: "aff-u-a"}).Error)
	require.NoError(t, model.DB.Create(&model.User{Username: "u-b", Group: "team-b", AffCode: "aff-u-b"}).Error)

	// 目标分组不能为空/相同/不存在/保留值
	_, err := RemoveUsersFromManagedGroup("team-a", []int{1}, "", false, common.RoleRootUser)
	assert.ErrorIs(t, err, ErrTargetGroupRequired)
	_, err = RemoveUsersFromManagedGroup("team-a", []int{1}, "team-a", false, common.RoleRootUser)
	assert.ErrorIs(t, err, ErrTargetGroupSame)
	_, err = RemoveUsersFromManagedGroup("team-a", []int{1}, "nope", false, common.RoleRootUser)
	assert.ErrorIs(t, err, ErrTargetGroupNotFound)
	_, err = RemoveUsersFromManagedGroup("team-a", []int{1}, "auto", false, common.RoleRootUser)
	assert.ErrorIs(t, err, ErrGroupReserved)

	// 只迁移当前处于该分组的用户：team-b 用户不在影响范围
	affected, err := RemoveUsersFromManagedGroup("team-a", []int{1, 2}, "default", false, common.RoleRootUser)
	require.NoError(t, err)
	assert.Equal(t, int64(1), affected)

	var moved model.User
	require.NoError(t, model.DB.Where("username = ?", "u-a").First(&moved).Error)
	assert.Equal(t, "default", moved.Group)
	var untouched model.User
	require.NoError(t, model.DB.Where("username = ?", "u-b").First(&untouched).Error)
	assert.Equal(t, "team-b", untouched.Group)
}

func TestAddAndRemoveChannelGroupTag(t *testing.T) {
	snapshotGroupSettings(t)
	resetGroupTables(t)
	require.NoError(t, CreateManagedGroup(ManagedGroupCreateParams{Name: "team-a"}))
	require.NoError(t, model.DB.Create(&model.Channel{
		Name: "ch-1", Key: "k-1", Group: "default", Type: 1, Models: "glm-4", Status: 1,
	}).Error)

	affected, err := AddChannelsToManagedGroup("team-a", []int{1})
	require.NoError(t, err)
	assert.Equal(t, 1, affected)

	var channel model.Channel
	require.NoError(t, model.DB.First(&channel, 1).Error)
	assert.Equal(t, "default,team-a", channel.Group)

	var abilities []model.Ability
	require.NoError(t, model.DB.Find(&abilities).Error)
	abilityGroups := make([]string, 0, len(abilities))
	for _, ability := range abilities {
		abilityGroups = append(abilityGroups, ability.Group)
	}
	assert.ElementsMatch(t, []string{"default", "team-a"}, abilityGroups)

	// 重复添加不会重复写入标签
	affected, err = AddChannelsToManagedGroup("team-a", []int{1})
	require.NoError(t, err)
	assert.Equal(t, 0, affected)
	require.NoError(t, model.DB.First(&channel, 1).Error)
	assert.Equal(t, "default,team-a", channel.Group)

	affected, err = RemoveChannelsFromManagedGroup("team-a", []int{1})
	require.NoError(t, err)
	assert.Equal(t, 1, affected)
	require.NoError(t, model.DB.First(&channel, 1).Error)
	assert.Equal(t, "default", channel.Group)

	abilities = nil
	require.NoError(t, model.DB.Find(&abilities).Error)
	abilityGroups = make([]string, 0, len(abilities))
	for _, ability := range abilities {
		abilityGroups = append(abilityGroups, ability.Group)
	}
	assert.Equal(t, []string{"default"}, abilityGroups)
}

// 订阅计划/订阅记录同样持有分组名，删除分组前必须一并拦截，
// 否则购买或到期时会把用户主分组写成已删除的分组（选路 503）。
func TestDeleteManagedGroupBlockedBySubscriptionReferences(t *testing.T) {
	snapshotGroupSettings(t)
	resetGroupTables(t)
	require.NoError(t, CreateManagedGroup(ManagedGroupCreateParams{Name: "team-sub"}))
	t.Cleanup(func() {
		model.DB.Exec("DELETE FROM user_subscriptions")
		model.DB.Exec("DELETE FROM subscription_plans")
	})
	require.NoError(t, model.DB.Create(&model.SubscriptionPlan{
		Title: "plan-sub", UpgradeGroup: "team-sub",
	}).Error)

	refs, err := CountGroupReferences("team-sub")
	require.NoError(t, err)
	assert.Equal(t, int64(1), refs.SubscriptionPlanCount)
	assert.True(t, refs.HasAny())

	err = DeleteManagedGroup("team-sub")
	var refErr *GroupReferenceError
	require.ErrorAs(t, err, &refErr)
	assert.Equal(t, int64(1), refErr.Refs.SubscriptionPlanCount)

	// 订阅记录快照（购买前分组）同样计入引用
	require.NoError(t, model.DB.Create(&model.UserSubscription{
		UserId: 1, PlanId: 1, PrevUserGroup: "team-sub", Status: "active",
	}).Error)
	refs, err = CountGroupReferences("team-sub")
	require.NoError(t, err)
	assert.Equal(t, int64(1), refs.SubscriptionCount)

	// 清理订阅计划与订阅记录后即可删除
	require.NoError(t, model.DB.Exec("DELETE FROM user_subscriptions").Error)
	require.NoError(t, model.DB.Exec("DELETE FROM subscription_plans").Error)
	require.NoError(t, DeleteManagedGroup("team-sub"))
}

func TestRemoveChannelGroupTagRejectsLastGroup(t *testing.T) {
	snapshotGroupSettings(t)
	resetGroupTables(t)
	require.NoError(t, CreateManagedGroup(ManagedGroupCreateParams{Name: "team-a"}))
	require.NoError(t, model.DB.Create(&model.Channel{
		Name: "ch-only", Key: "k-only", Group: "team-a", Type: 1, Models: "glm-4", Status: 1,
	}).Error)

	_, err := RemoveChannelsFromManagedGroup("team-a", []int{1})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "不属于任何分组")

	var channel model.Channel
	require.NoError(t, model.DB.First(&channel, 1).Error)
	assert.Equal(t, "team-a", channel.Group)
}

func TestUserEffectiveGroupsAndMembership(t *testing.T) {
	snapshotGroupSettings(t)
	resetGroupTables(t)
	require.NoError(t, CreateManagedGroup(ManagedGroupCreateParams{Name: "team-a"}))
	require.NoError(t, model.DB.Create(&model.User{
		Username: "multi-u", Group: "default", UserGroups: "vip,team-a,default", AffCode: "aff-multi",
	}).Error)

	groups, err := model.GetUserEffectiveGroups(1)
	require.NoError(t, err)
	assert.Equal(t, []string{"default", "vip", "team-a"}, groups)

	// 追加附加分组：已存在的主分组/附加分组不重复计入
	affected, err := AddUsersToManagedGroup("team-a", []int{1}, false, common.RoleRootUser)
	require.NoError(t, err)
	assert.Equal(t, int64(0), affected)

	// 主分组与附加分组都计入引用
	count, err := model.CountUsersByGroup("team-a")
	require.NoError(t, err)
	assert.Equal(t, int64(1), count)
	count, err = model.CountUsersByGroup("vip")
	require.NoError(t, err)
	assert.Equal(t, int64(1), count)

	distinct, err := model.GetDistinctUserGroups()
	require.NoError(t, err)
	assert.Subset(t, distinct, []string{"default", "vip", "team-a"})

	// 按分组搜索用户：附加分组命中
	users, total, err := model.SearchUsers("", "team-a", nil, nil, 0, 10)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	require.Len(t, users, 1)
	assert.Equal(t, "multi-u", users[0].Username)
}

func TestRemoveUsersFromGroupHandlesPrimaryAndAdditional(t *testing.T) {
	snapshotGroupSettings(t)
	resetGroupTables(t)
	require.NoError(t, CreateManagedGroup(ManagedGroupCreateParams{Name: "team-a"}))
	require.NoError(t, CreateManagedGroup(ManagedGroupCreateParams{Name: "team-b"}))
	require.NoError(t, model.DB.Create(&model.User{
		Username: "primary-u", Group: "team-a", UserGroups: "vip", AffCode: "aff-p",
	}).Error)
	require.NoError(t, model.DB.Create(&model.User{
		Username: "additional-u", Group: "default", UserGroups: "team-a,vip", AffCode: "aff-a",
	}).Error)
	require.NoError(t, model.DB.Create(&model.Token{
		UserId: 2, Name: "t-additional", Key: "sk-t-additional", Group: "vip",
	}).Error)

	// 主分组命中：主分组改为目标分组，附加分组去重
	affected, err := RemoveUsersFromManagedGroup("team-a", []int{1}, "default", false, common.RoleRootUser)
	require.NoError(t, err)
	assert.Equal(t, int64(1), affected)
	var primary model.User
	require.NoError(t, model.DB.First(&primary, 1).Error)
	assert.Equal(t, "default", primary.Group)
	assert.Equal(t, "vip", primary.UserGroups)

	// 附加分组命中：仅移除附加分组，主分组不变；勾选同步则清空令牌分组
	affected, err = RemoveUsersFromManagedGroup("team-a", []int{2}, "default", true, common.RoleRootUser)
	require.NoError(t, err)
	assert.Equal(t, int64(1), affected)
	var additional model.User
	require.NoError(t, model.DB.First(&additional, 2).Error)
	assert.Equal(t, "default", additional.Group)
	assert.Equal(t, "vip", additional.UserGroups)
	var token model.Token
	require.NoError(t, model.DB.First(&token, 1).Error)
	assert.Equal(t, "", token.Group)

	// 未命中该分组的用户不计入
	affected, err = RemoveUsersFromManagedGroup("team-b", []int{1, 2}, "default", false, common.RoleRootUser)
	require.NoError(t, err)
	assert.Equal(t, int64(0), affected)
}

func TestResolveGroupCandidates(t *testing.T) {
	snapshotGroupSettings(t)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	common.SetContextKey(ctx, constant.ContextKeyUserGroup, "default")
	common.SetContextKey(ctx, constant.ContextKeyUserGroups, "default,team-a,team-b")

	// 令牌分组等于主分组且用户多分组：依次尝试
	candidates := resolveGroupCandidates(&RetryParam{Ctx: ctx, TokenGroup: "default"})
	assert.Equal(t, []string{"default", "team-a", "team-b"}, candidates)

	// 令牌显式指定其它分组：不跨组回退
	assert.Nil(t, resolveGroupCandidates(&RetryParam{Ctx: ctx, TokenGroup: "team-a"}))

	// 单分组用户：保持单分组路径
	common.SetContextKey(ctx, constant.ContextKeyUserGroups, "default")
	assert.Nil(t, resolveGroupCandidates(&RetryParam{Ctx: ctx, TokenGroup: "default"}))

	// auto 令牌：候选分组必须覆盖附加分组，且按 AutoGroups 顺序排列
	common.SetContextKey(ctx, constant.ContextKeyUserGroups, "default,team-a,team-b")
	require.NoError(t, setting.UpdateAutoGroupsByJsonString(`["team-a","default"]`))
	assert.Equal(t, []string{"team-a", "default"},
		resolveGroupCandidates(&RetryParam{Ctx: ctx, TokenGroup: "auto"}))

	// auto 只有一个候选分组（默认配置 autoGroups=["default"]）时，仍必须走候选循环：
	// auto 不是真实分组，落到单分组直达路径会以字面 "auto" 查询渠道而永远选不到。
	common.SetContextKey(ctx, constant.ContextKeyUserGroups, "default")
	require.NoError(t, setting.UpdateAutoGroupsByJsonString(`["default"]`))
	assert.Equal(t, []string{"default"},
		resolveGroupCandidates(&RetryParam{Ctx: ctx, TokenGroup: "auto"}))
}

func TestRequestCandidateGroupsExcludesRevokedGroups(t *testing.T) {
	snapshotGroupSettings(t)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	common.SetContextKey(ctx, constant.ContextKeyUserGroup, "default")
	common.SetContextKey(ctx, constant.ContextKeyUserGroups, "default,team-a")

	// 未配置特殊规则时，主分组令牌可回退到附加分组
	assert.Equal(t, []string{"default", "team-a"},
		RequestCandidateGroups(ctx, "default"))

	// GroupSpecialUsableGroup 的 "-:" 规则吊销 team-a：主分组令牌不得再回退到该分组
	require.NoError(t, config.UpdateConfigFromMap(
		ratio_setting.GetGroupRatioSetting(),
		map[string]string{
			"group_special_usable_group": `{"default":{"-:team-a":"x"}}`,
		},
	))
	assert.Equal(t, []string{"default"}, RequestCandidateGroups(ctx, "default"))
	// 钉住被吊销分组的令牌仍然只得到该分组（由鉴权层拒绝）
	assert.Equal(t, []string{"team-a"}, RequestCandidateGroups(ctx, "team-a"))
}

func TestIsModelAllowedInRequestGroups(t *testing.T) {
	snapshotGroupSettings(t)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	common.SetContextKey(ctx, constant.ContextKeyUserGroup, "default")
	common.SetContextKey(ctx, constant.ContextKeyUserGroups, "default,team-a")

	require.NoError(t, CreateManagedGroup(ManagedGroupCreateParams{Name: "team-a"}))
	require.NoError(t, UpdateManagedGroupWhitelist("default", []string{"gpt-*"}))
	require.NoError(t, UpdateManagedGroupWhitelist("team-a", []string{"qwen-*"}))

	// 主分组白名单拒绝、附加分组允许：仍应放行（可回退到附加分组）
	assert.True(t, IsModelAllowedInRequestGroups(ctx, "default", "qwen-max"))
	// 主分组自身允许
	assert.True(t, IsModelAllowedInRequestGroups(ctx, "default", "gpt-4o"))
	// 全部候选分组都不允许
	assert.False(t, IsModelAllowedInRequestGroups(ctx, "default", "deepseek-chat"))
	// 令牌显式指定分组时只按该分组判定
	assert.True(t, IsModelAllowedInRequestGroups(ctx, "team-a", "qwen-max"))
	assert.False(t, IsModelAllowedInRequestGroups(ctx, "team-a", "gpt-4o"))
}

func TestEnsureEffectiveGroupsInContext(t *testing.T) {
	snapshotGroupSettings(t)
	resetGroupTables(t)
	require.NoError(t, model.DB.Create(&model.User{
		Username: "ctx-user", Group: "default", UserGroups: "vip,team-a", AffCode: "aff-ctx",
	}).Error)

	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	common.SetContextKey(ctx, constant.ContextKeyUserGroup, "default")
	ctx.Set("id", 1)

	// 会话鉴权只写入主分组：补齐后应含附加分组
	EnsureEffectiveGroupsInContext(ctx)
	assert.Equal(t, "default,vip,team-a",
		common.GetContextKeyString(ctx, constant.ContextKeyUserGroups))

	// 已存在有效分组时不再覆盖
	common.SetContextKey(ctx, constant.ContextKeyUserGroups, "default")
	EnsureEffectiveGroupsInContext(ctx)
	assert.Equal(t, "default", common.GetContextKeyString(ctx, constant.ContextKeyUserGroups))
}

func TestIsAutoGroupAvailable(t *testing.T) {
	snapshotGroupSettings(t)

	require.NoError(t, setting.UpdateAutoGroupsByJsonString(`["default","team-a"]`))
	// 用户至少有一个分组落在 AutoGroups 中即可用
	assert.True(t, IsAutoGroupAvailable([]string{"default"}))
	assert.True(t, IsAutoGroupAvailable([]string{"vip", "team-a"}))
	// 用户分组与 AutoGroups 无交集
	assert.False(t, IsAutoGroupAvailable([]string{"vip"}))
	assert.False(t, IsAutoGroupAvailable(nil))

	// 未配置 AutoGroups 时不可用
	require.NoError(t, setting.UpdateAutoGroupsByJsonString(`[]`))
	assert.False(t, IsAutoGroupAvailable([]string{"default"}))
}

func TestIsGroupUsableByContextUser(t *testing.T) {
	snapshotGroupSettings(t)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	common.SetContextKey(ctx, constant.ContextKeyUserGroup, "default")
	common.SetContextKey(ctx, constant.ContextKeyUserGroups, "default,team-a")

	// 用户自身的有效分组可用
	assert.True(t, IsGroupUsableByContextUser(ctx, "default"))
	assert.True(t, IsGroupUsableByContextUser(ctx, "team-a"))
	// 全局可选分组不再自动授权（vip 在 UserUsableGroups 中，但用户不属于 vip）
	assert.False(t, IsGroupUsableByContextUser(ctx, "vip"))
	// 未授权分组与空值不可用
	assert.False(t, IsGroupUsableByContextUser(ctx, "team-b"))
	assert.False(t, IsGroupUsableByContextUser(ctx, ""))

	// auto 按用户是否拥有 AutoGroups 中的可用分组判断（与选项列表口径一致）
	require.NoError(t, setting.UpdateAutoGroupsByJsonString(`["team-a","default"]`))
	assert.True(t, IsGroupUsableByContextUser(ctx, "auto"))
	require.NoError(t, setting.UpdateAutoGroupsByJsonString(`["vip"]`))
	assert.False(t, IsGroupUsableByContextUser(ctx, "auto"))
	require.NoError(t, setting.UpdateAutoGroupsByJsonString(`[]`))
	assert.False(t, IsGroupUsableByContextUser(ctx, "auto"))
}

func TestGetUserEffectiveUsableGroupsWithSpecialRules(t *testing.T) {
	snapshotGroupSettings(t)
	require.NoError(t, config.UpdateConfigFromMap(
		ratio_setting.GetGroupRatioSetting(),
		map[string]string{
			"group_special_usable_group": `{"default":{"+:vip":"VIP 分组","-:team-a":"x"}}`,
		},
	))

	usable := GetUserEffectiveUsableGroups([]string{"default", "team-a"})
	assert.Contains(t, usable, "default")
	// 特殊规则加项生效
	assert.Contains(t, usable, "vip")
	assert.Equal(t, "VIP 分组", usable["vip"])
	// 特殊规则减项生效
	assert.NotContains(t, usable, "team-a")

	// auto 候选也只取用户可用分组
	require.NoError(t, setting.UpdateAutoGroupsByJsonString(`["default","team-a","vip"]`))
	assert.Equal(t, []string{"default", "vip"}, GetUserAutoGroupMulti([]string{"default", "team-a"}))
}

func TestCollectManagedGroupsAggregatesCounts(t *testing.T) {
	snapshotGroupSettings(t)
	resetGroupTables(t)
	seedGroupReferences(t, "team-a")

	groups, err := CollectManagedGroups()
	require.NoError(t, err)

	byName := make(map[string]ManagedGroup, len(groups))
	for _, group := range groups {
		byName[group.Name] = group
	}
	team, ok := byName["team-a"]
	require.True(t, ok)
	assert.Equal(t, int64(1), team.UserCount)
	assert.Equal(t, int64(1), team.ChannelCount)
	assert.Equal(t, int64(1), team.TokenCount)
	assert.Equal(t, 1, team.ModelCount)

	// default 排在最前，auto 排到最后
	require.NotEmpty(t, groups)
	assert.Equal(t, "default", groups[0].Name)
	assert.Equal(t, "auto", groups[len(groups)-1].Name)
	assert.True(t, groups[len(groups)-1].Builtin)
}
