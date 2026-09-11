package service

import (
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

const (
	// BuiltinAutoGroup 是令牌自动选择分组的保留值，不可作为普通分组管理。
	BuiltinAutoGroup = "auto"

	optionKeyGroupRatio              = "GroupRatio"
	optionKeyUserUsableGroups        = "UserUsableGroups"
	optionKeyTopupGroupRatio         = "TopupGroupRatio"
	optionKeyGroupGroupRatio         = "GroupGroupRatio"
	optionKeyAutoGroups              = "AutoGroups"
	optionKeyGroupSpecialUsableGroup = "group_ratio_setting.group_special_usable_group"
	optionKeyGroupModelWhitelist     = "group_model_limit_setting.group_model_whitelist"
)

var (
	groupNamePattern = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,32}$`)

	ErrGroupNameInvalid = errors.New("分组名只能包含字母、数字、下划线和连字符，长度 1-32")
	ErrGroupReserved    = errors.New("该名称为系统保留分组名，不可使用")
	ErrGroupExists      = errors.New("分组已存在")
	ErrGroupNotFound    = errors.New("分组不存在")

	ErrNoUsersSelected     = errors.New("请至少选择一个用户")
	ErrNoChannelsSelected  = errors.New("请至少选择一个渠道")
	ErrTargetGroupRequired = errors.New("请选择用户迁移的目标分组")
	ErrTargetGroupSame     = errors.New("目标分组不能与当前分组相同")
	ErrTargetGroupNotFound = errors.New("目标分组不存在")
	ErrRootUserImmutable   = errors.New("root 用户的分组不允许通过批量操作修改，请在用户管理中单独调整")
	ErrTargetRoleTooHigh   = errors.New("目标用户的角色不低于操作者，无法通过批量分组操作修改其分组，请在用户管理中单独调整")
)

// ManagedGroup 是分组管理列表中的一行，聚合了分散在设置与业务表中的分组信息。
type ManagedGroup struct {
	Name         string   `json:"name"`
	DisplayName  string   `json:"display_name"`
	Ratio        float64  `json:"ratio"`
	Selectable   bool     `json:"selectable"`
	Builtin      bool     `json:"builtin"`
	AutoGroup    bool     `json:"auto_group"`
	UserCount    int64    `json:"user_count"`
	ChannelCount int64    `json:"channel_count"`
	TokenCount   int64    `json:"token_count"`
	ModelCount   int      `json:"model_count"`
	Whitelist    []string `json:"whitelist"`
}

// ManagedGroupDetail 是分组详情，附加跨组倍率与特殊可用性配置。
type ManagedGroupDetail struct {
	ManagedGroup
	Models              []string           `json:"models"`
	CrossGroupRatios    map[string]float64 `json:"cross_group_ratios"`
	UsedByGroupRatios   map[string]float64 `json:"used_by_group_ratios"`
	SpecialUsableGroups map[string]string  `json:"special_usable_groups"`
}

// GroupReferences 汇总某个分组被引用的数量。
type GroupReferences struct {
	UserCount             int64
	ChannelCount          int64
	TokenCount            int64
	SubscriptionPlanCount int64
	SubscriptionCount     int64
}

// HasAny 表示分组是否仍被任何实体引用。
func (refs GroupReferences) HasAny() bool {
	return refs.UserCount > 0 || refs.ChannelCount > 0 || refs.TokenCount > 0 ||
		refs.SubscriptionPlanCount > 0 || refs.SubscriptionCount > 0
}

// GroupReferenceError 表示删除分组时仍存在引用。
type GroupReferenceError struct {
	Group string
	Refs  GroupReferences
}

func (err *GroupReferenceError) Error() string {
	return fmt.Sprintf("分组 %s 仍被引用：%d 个用户、%d 个渠道、%d 个令牌、%d 个订阅计划、%d 条订阅记录",
		err.Group, err.Refs.UserCount, err.Refs.ChannelCount, err.Refs.TokenCount,
		err.Refs.SubscriptionPlanCount, err.Refs.SubscriptionCount)
}

// ManagedGroupCreateParams 新建分组参数。
type ManagedGroupCreateParams struct {
	Name        string
	DisplayName string
	Ratio       *float64
}

// ManagedGroupUpdateParams 更新分组参数，nil 表示不修改该字段。
type ManagedGroupUpdateParams struct {
	DisplayName *string
	Ratio       *float64
	Selectable  *bool
}

// CollectManagedGroups 聚合全部分组信息，供分组管理列表展示。
func CollectManagedGroups() ([]ManagedGroup, error) {
	names, err := collectGroupNames()
	if err != nil {
		return nil, err
	}
	usableCopy := setting.GetUserUsableGroupsCopy()
	autoGroups := setting.GetAutoGroups()

	groups := make([]ManagedGroup, 0, len(names))
	for _, name := range names {
		refs, err := CountGroupReferences(name)
		if err != nil {
			return nil, err
		}
		groups = append(groups, buildManagedGroup(name, usableCopy, autoGroups, refs))
	}
	sortManagedGroups(groups)
	return groups, nil
}

// GetManagedGroupDetail 返回单个分组的聚合详情。
func GetManagedGroupDetail(name string) (*ManagedGroupDetail, error) {
	exists, err := groupExists(name)
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, ErrGroupNotFound
	}
	refs, err := CountGroupReferences(name)
	if err != nil {
		return nil, err
	}
	base := buildManagedGroup(
		name,
		setting.GetUserUsableGroupsCopy(),
		setting.GetAutoGroups(),
		refs,
	)
	models := model.GetGroupEnabledModels(name)
	if models == nil {
		models = []string{}
	}

	usedByGroupRatios := map[string]float64{}
	for userGroup, ratios := range ratio_setting.GetGroupGroupRatioMapCopy() {
		if ratio, ok := ratios[name]; ok {
			usedByGroupRatios[userGroup] = ratio
		}
	}

	return &ManagedGroupDetail{
		ManagedGroup:        base,
		Models:              models,
		CrossGroupRatios:    ratio_setting.GetGroupGroupRatioByUserGroup(name),
		UsedByGroupRatios:   usedByGroupRatios,
		SpecialUsableGroups: ratio_setting.GetGroupSpecialUsableGroup(name),
	}, nil
}

// CountGroupReferences 统计分组被用户、渠道、令牌引用的数量。
func CountGroupReferences(name string) (GroupReferences, error) {
	userCount, err := model.CountUsersByGroup(name)
	if err != nil {
		return GroupReferences{}, err
	}
	channelCount, err := model.CountChannelsByGroup(name)
	if err != nil {
		return GroupReferences{}, err
	}
	tokenCount, err := model.CountTokensByGroup(name)
	if err != nil {
		return GroupReferences{}, err
	}
	// 订阅计划与订阅记录同样持久化分组名（购买/到期时会写回用户主分组），
	// 漏检会留下指向已删除分组的用户。
	planCount, err := model.CountSubscriptionPlanGroupRefs(name)
	if err != nil {
		return GroupReferences{}, err
	}
	subscriptionCount, err := model.CountUserSubscriptionGroupRefs(name)
	if err != nil {
		return GroupReferences{}, err
	}
	return GroupReferences{
		UserCount:             userCount,
		ChannelCount:          channelCount,
		TokenCount:            tokenCount,
		SubscriptionPlanCount: planCount,
		SubscriptionCount:     subscriptionCount,
	}, nil
}

// CreateManagedGroup 新建分组：写入分组倍率并开放自选。
func CreateManagedGroup(params ManagedGroupCreateParams) error {
	name := strings.TrimSpace(params.Name)
	if err := validateGroupName(name); err != nil {
		return err
	}
	// 已登记的分组不能重复创建；仅被渠道/用户引用但未登记的分组允许补登记。
	if isGroupRegistered(name) {
		return ErrGroupExists
	}
	// 分组倍率统一固定为 1（本项目不做分组差异化收费），入参 ratio 被忽略
	ratioCopy := ratio_setting.GetGroupRatioCopy()
	ratioCopy[name] = 1
	ratioJSON, err := common.Marshal(ratioCopy)
	if err != nil {
		return err
	}
	displayName := strings.TrimSpace(params.DisplayName)
	if displayName == "" {
		displayName = name
	}
	usableCopy := setting.GetUserUsableGroupsCopy()
	usableCopy[name] = displayName
	usableJSON, err := common.Marshal(usableCopy)
	if err != nil {
		return err
	}
	return model.UpdateOptionsBulk(map[string]string{
		optionKeyGroupRatio:       string(ratioJSON),
		optionKeyUserUsableGroups: string(usableJSON),
	})
}

// UpdateManagedGroup 更新分组的显示名与是否开放自选（倍率统一为 1，入参 ratio 被忽略）。
func UpdateManagedGroup(name string, params ManagedGroupUpdateParams) error {
	name = strings.TrimSpace(name)
	if strings.EqualFold(name, BuiltinAutoGroup) {
		return ErrGroupReserved
	}
	exists, err := groupExists(name)
	if err != nil {
		return err
	}
	if !exists {
		return ErrGroupNotFound
	}

	updates := make(map[string]string, 1)
	// 可选分组清单现在只承载"分组显示名"；用户能选哪些分组由用户自身的有效分组决定，
	// 因此这里始终保留该分组并更新显示名（Selectable 入参已废弃，保留仅为兼容旧客户端）。
	if params.DisplayName != nil || params.Selectable != nil {
		usableCopy := setting.GetUserUsableGroupsCopy()
		currentDisplay := usableCopy[name]
		if params.DisplayName != nil {
			currentDisplay = strings.TrimSpace(*params.DisplayName)
		}
		if currentDisplay == "" {
			currentDisplay = name
		}
		usableCopy[name] = currentDisplay
		usableJSON, err := common.Marshal(usableCopy)
		if err != nil {
			return err
		}
		updates[optionKeyUserUsableGroups] = string(usableJSON)
	}
	if len(updates) == 0 {
		return nil
	}
	return model.UpdateOptionsBulk(updates)
}

// DeleteManagedGroup 删除分组，要求该分组已无任何用户、渠道、令牌引用。
func DeleteManagedGroup(name string) error {
	name = strings.TrimSpace(name)
	if strings.EqualFold(name, BuiltinAutoGroup) {
		return ErrGroupReserved
	}
	exists, err := groupExists(name)
	if err != nil {
		return err
	}
	if !exists {
		return ErrGroupNotFound
	}
	refs, err := CountGroupReferences(name)
	if err != nil {
		return err
	}
	if refs.HasAny() {
		return &GroupReferenceError{Group: name, Refs: refs}
	}

	updates := make(map[string]string, 7)
	if ratioCopy := ratio_setting.GetGroupRatioCopy(); hasKey(ratioCopy, name) {
		delete(ratioCopy, name)
		if err := putJSONOption(updates, optionKeyGroupRatio, ratioCopy); err != nil {
			return err
		}
	}
	if usableCopy := setting.GetUserUsableGroupsCopy(); hasKey(usableCopy, name) {
		delete(usableCopy, name)
		if err := putJSONOption(updates, optionKeyUserUsableGroups, usableCopy); err != nil {
			return err
		}
	}
	if topupCopy := common.GetTopupGroupRatioCopy(); hasKey(topupCopy, name) {
		delete(topupCopy, name)
		if err := putJSONOption(updates, optionKeyTopupGroupRatio, topupCopy); err != nil {
			return err
		}
	}
	if err := removeGroupGroupRatio(updates, name); err != nil {
		return err
	}
	if err := removeGroupSpecialUsableGroup(updates, name); err != nil {
		return err
	}
	if autoGroups := setting.GetAutoGroups(); containsString(autoGroups, name) {
		remaining := make([]string, 0, len(autoGroups))
		for _, autoGroup := range autoGroups {
			if autoGroup != name {
				remaining = append(remaining, autoGroup)
			}
		}
		if err := putJSONOption(updates, optionKeyAutoGroups, remaining); err != nil {
			return err
		}
	}
	if whitelistCopy := setting.GetGroupModelWhitelistMapCopy(); hasKey(whitelistCopy, name) {
		delete(whitelistCopy, name)
		if err := putJSONOption(updates, optionKeyGroupModelWhitelist, whitelistCopy); err != nil {
			return err
		}
	}
	if len(updates) == 0 {
		return nil
	}
	return model.UpdateOptionsBulk(updates)
}

// UpdateManagedGroupWhitelist 设置分组模型白名单，传空列表表示取消限制。
func UpdateManagedGroupWhitelist(name string, patterns []string) error {
	name = strings.TrimSpace(name)
	if strings.EqualFold(name, BuiltinAutoGroup) {
		return ErrGroupReserved
	}
	exists, err := groupExists(name)
	if err != nil {
		return err
	}
	if !exists {
		return ErrGroupNotFound
	}
	cleaned := make([]string, 0, len(patterns))
	seen := make(map[string]struct{}, len(patterns))
	for _, pattern := range patterns {
		pattern = strings.TrimSpace(pattern)
		if pattern == "" {
			continue
		}
		if _, ok := seen[pattern]; ok {
			continue
		}
		seen[pattern] = struct{}{}
		cleaned = append(cleaned, pattern)
	}
	whitelistCopy := setting.GetGroupModelWhitelistMapCopy()
	if len(cleaned) == 0 {
		delete(whitelistCopy, name)
	} else {
		whitelistCopy[name] = cleaned
	}
	updates := make(map[string]string, 1)
	if err := putJSONOption(updates, optionKeyGroupModelWhitelist, whitelistCopy); err != nil {
		return err
	}
	return model.UpdateOptionsBulk(updates)
}

// AddUsersToManagedGroup 批量把用户加入分组；syncTokens 为真时同步清空实际变更用户的令牌分组。
// operatorRole 为操作者角色，用于沿用全站一致的角色层级校验（root 或高于目标方可操作）。
func AddUsersToManagedGroup(name string, userIds []int, syncTokens bool, operatorRole int) (int64, error) {
	name = strings.TrimSpace(name)
	if err := ensureManageableGroup(name); err != nil {
		return 0, err
	}
	if len(userIds) == 0 {
		return 0, ErrNoUsersSelected
	}
	users, err := model.GetUsersByIds(userIds)
	if err != nil {
		return 0, err
	}
	if err := ensureManageableTargets(users, operatorRole); err != nil {
		return 0, err
	}
	changedIds, err := model.AddUsersToAdditionalGroup(userIds, name, syncTokens)
	if err != nil {
		return 0, err
	}
	return int64(len(changedIds)), nil
}

// RemoveUsersFromManagedGroup 批量把用户移出分组：主分组命中则改为 targetGroup，否则仅移除附加分组。
// operatorRole 语义同 AddUsersToManagedGroup。
func RemoveUsersFromManagedGroup(name string, userIds []int, targetGroup string, syncTokens bool, operatorRole int) (int64, error) {
	name = strings.TrimSpace(name)
	targetGroup = strings.TrimSpace(targetGroup)
	if err := ensureManageableGroup(name); err != nil {
		return 0, err
	}
	if len(userIds) == 0 {
		return 0, ErrNoUsersSelected
	}
	if targetGroup == "" {
		return 0, ErrTargetGroupRequired
	}
	if targetGroup == name {
		return 0, ErrTargetGroupSame
	}
	if strings.EqualFold(targetGroup, BuiltinAutoGroup) {
		return 0, ErrGroupReserved
	}
	targetExists, err := groupExists(targetGroup)
	if err != nil {
		return 0, err
	}
	if !targetExists {
		return 0, ErrTargetGroupNotFound
	}
	users, err := model.GetUsersByIds(userIds)
	if err != nil {
		return 0, err
	}
	if err := ensureManageableTargets(users, operatorRole); err != nil {
		return 0, err
	}
	changedIds, err := model.RemoveUsersFromGroup(userIds, name, targetGroup, syncTokens)
	if err != nil {
		return 0, err
	}
	return int64(len(changedIds)), nil
}

// AddChannelsToManagedGroup 给渠道追加分组标签并重建能力，返回变更的渠道数。
func AddChannelsToManagedGroup(name string, channelIds []int) (int, error) {
	name = strings.TrimSpace(name)
	if err := ensureManageableGroup(name); err != nil {
		return 0, err
	}
	if len(channelIds) == 0 {
		return 0, ErrNoChannelsSelected
	}
	return model.AddChannelGroupTag(channelIds, name)
}

// RemoveChannelsFromManagedGroup 从渠道移除分组标签并重建能力，返回变更的渠道数。
func RemoveChannelsFromManagedGroup(name string, channelIds []int) (int, error) {
	name = strings.TrimSpace(name)
	if err := ensureManageableGroup(name); err != nil {
		return 0, err
	}
	if len(channelIds) == 0 {
		return 0, ErrNoChannelsSelected
	}
	return model.RemoveChannelGroupTag(channelIds, name)
}

func ensureManageableGroup(name string) error {
	if name == "" {
		return ErrGroupNotFound
	}
	if strings.EqualFold(name, BuiltinAutoGroup) {
		return ErrGroupReserved
	}
	exists, err := groupExists(name)
	if err != nil {
		return err
	}
	if !exists {
		return ErrGroupNotFound
	}
	return nil
}

// ensureManageableTargets 校验批量分组操作的目标用户：
// root 用户一律不可经批量操作改动；非 root 操作者只能改动角色低于自己的用户，
// 与用户管理链路的 canManageTargetRole（controller/user.go）保持同一层级规则。
func ensureManageableTargets(users []*model.User, operatorRole int) error {
	rootNames := make([]string, 0)
	protectedNames := make([]string, 0)
	for _, user := range users {
		if user.Role >= common.RoleRootUser {
			rootNames = append(rootNames, user.Username)
			continue
		}
		if operatorRole != common.RoleRootUser && operatorRole <= user.Role {
			protectedNames = append(protectedNames, user.Username)
		}
	}
	if len(rootNames) > 0 {
		return fmt.Errorf("%w: %s", ErrRootUserImmutable, strings.Join(rootNames, ", "))
	}
	if len(protectedNames) > 0 {
		return fmt.Errorf("%w: %s", ErrTargetRoleTooHigh, strings.Join(protectedNames, ", "))
	}
	return nil
}

// GetGroupAvailableModels 返回分组实际可用的模型（渠道能力 ∩ 白名单）。
func GetGroupAvailableModels(group string) []string {
	models := model.GetGroupEnabledModels(group)
	if !setting.HasGroupModelWhitelist(group) {
		return models
	}
	allowed := make([]string, 0, len(models))
	for _, modelName := range models {
		if setting.IsModelAllowedInGroup(group, modelName) {
			allowed = append(allowed, modelName)
		}
	}
	return allowed
}

func collectGroupNames() ([]string, error) {
	seen := make(map[string]struct{})
	names := make([]string, 0)
	add := func(name string) {
		name = strings.TrimSpace(name)
		if name == "" {
			return
		}
		if _, ok := seen[name]; ok {
			return
		}
		seen[name] = struct{}{}
		names = append(names, name)
	}

	for name := range ratio_setting.GetGroupRatioCopy() {
		add(name)
	}
	for name := range setting.GetUserUsableGroupsCopy() {
		add(name)
	}
	abilityGroups, err := model.GetDistinctAbilityGroups()
	if err != nil {
		return nil, err
	}
	for _, name := range abilityGroups {
		add(name)
	}
	userGroups, err := model.GetDistinctUserGroups()
	if err != nil {
		return nil, err
	}
	for _, name := range userGroups {
		add(name)
	}
	tokenGroups, err := model.GetDistinctTokenGroups()
	if err != nil {
		return nil, err
	}
	for _, name := range tokenGroups {
		add(name)
	}
	channelGroups, err := model.GetChannelGroups()
	if err != nil {
		return nil, err
	}
	for _, name := range channelGroups {
		add(name)
	}
	// auto 是令牌自动选组的保留值，始终在列表中展示（标记为内置、不可编辑）。
	add(BuiltinAutoGroup)
	return names, nil
}

func buildManagedGroup(
	name string,
	usableCopy map[string]string,
	autoGroups []string,
	refs GroupReferences,
) ManagedGroup {
	displayName, ok := usableCopy[name]
	if !ok || displayName == "" {
		displayName = name
	}
	whitelist := setting.GetGroupModelWhitelist(name)
	if whitelist == nil {
		whitelist = []string{}
	}
	return ManagedGroup{
		Name:        name,
		DisplayName: displayName,
		// 分组倍率统一固定为 1
		Ratio: 1,
		// 可选分组清单已不参与权限判断，字段保留恒为 true 以兼容旧前端
		Selectable:   true,
		Builtin:      strings.EqualFold(name, BuiltinAutoGroup),
		AutoGroup:    containsString(autoGroups, name),
		UserCount:    refs.UserCount,
		ChannelCount: refs.ChannelCount,
		TokenCount:   refs.TokenCount,
		ModelCount:   len(model.GetGroupEnabledModels(name)),
		Whitelist:    whitelist,
	}
}

func sortManagedGroups(groups []ManagedGroup) {
	sort.SliceStable(groups, func(i, j int) bool {
		return groupSortKey(groups[i]) < groupSortKey(groups[j])
	})
}

func groupSortKey(group ManagedGroup) string {
	switch {
	case group.Name == "default":
		return "0-" + group.Name
	case group.Builtin:
		return "2-" + group.Name
	default:
		return "1-" + group.Name
	}
}

func validateGroupName(name string) error {
	if !groupNamePattern.MatchString(name) {
		return ErrGroupNameInvalid
	}
	if strings.EqualFold(name, BuiltinAutoGroup) {
		return ErrGroupReserved
	}
	// all/null 是分组过滤接口的"不过滤"哨兵值（见 model.NormalizeChannelGroupFilter），
	// 允许它们作为分组名会让引用统计与搜索静默退化为"不过滤"。
	if strings.EqualFold(name, "all") || strings.EqualFold(name, "null") {
		return ErrGroupReserved
	}
	return nil
}

// isGroupRegistered 判断分组是否已登记在分组倍率或可选分组配置中。
func isGroupRegistered(name string) bool {
	if name == "" {
		return false
	}
	return hasKey(ratio_setting.GetGroupRatioCopy(), name) ||
		hasKey(setting.GetUserUsableGroupsCopy(), name)
}

func groupExists(name string) (bool, error) {
	if name == "" {
		return false, nil
	}
	if hasKey(ratio_setting.GetGroupRatioCopy(), name) {
		return true, nil
	}
	if hasKey(setting.GetUserUsableGroupsCopy(), name) {
		return true, nil
	}
	refs, err := CountGroupReferences(name)
	if err != nil {
		return false, err
	}
	return refs.HasAny(), nil
}

func putJSONOption(updates map[string]string, key string, value any) error {
	payload, err := common.Marshal(value)
	if err != nil {
		return err
	}
	updates[key] = string(payload)
	return nil
}

func removeGroupGroupRatio(updates map[string]string, name string) error {
	ratioMap := ratio_setting.GetGroupGroupRatioMapCopy()
	changed := false
	if hasKey(ratioMap, name) {
		delete(ratioMap, name)
		changed = true
	}
	for userGroup, ratios := range ratioMap {
		if !hasKey(ratios, name) {
			continue
		}
		delete(ratios, name)
		changed = true
		if len(ratios) == 0 {
			delete(ratioMap, userGroup)
		}
	}
	if !changed {
		return nil
	}
	return putJSONOption(updates, optionKeyGroupGroupRatio, ratioMap)
}

func removeGroupSpecialUsableGroup(updates map[string]string, name string) error {
	specialMap := ratio_setting.GetGroupSpecialUsableGroupCopy()
	changed := false
	if hasKey(specialMap, name) {
		delete(specialMap, name)
		changed = true
	}
	for userGroup, entries := range specialMap {
		for key := range entries {
			if trimSpecialGroupPrefix(key) != name {
				continue
			}
			delete(entries, key)
			changed = true
		}
		if len(entries) == 0 {
			delete(specialMap, userGroup)
		}
	}
	if !changed {
		return nil
	}
	return putJSONOption(updates, optionKeyGroupSpecialUsableGroup, specialMap)
}

func trimSpecialGroupPrefix(key string) string {
	return strings.TrimPrefix(strings.TrimPrefix(key, "-:"), "+:")
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func hasKey[K comparable, V any](values map[K]V, key K) bool {
	_, ok := values[key]
	return ok
}
